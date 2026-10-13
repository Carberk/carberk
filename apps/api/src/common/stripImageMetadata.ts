import sharp from "sharp";

export class ImageTooLargeAfterCleaningError extends Error {
  constructor(sizeBytes: number, maxBytes: number) {
    super(
      `Image is still ${sizeBytes} bytes after removing its metadata; the limit is ${maxBytes} bytes`,
    );
    this.name = "ImageTooLargeAfterCleaningError";
  }
}

const JPEG_COMMENT_MARKER = 0xfe;
const JPEG_SCAN_START_MARKER = 0xda;

/**
 * sharp reports EXIF, XMP and IPTC but not JPEG comment (COM) segments, so a
 * JPEG is scanned for the marker itself. Only the header before the
 * compressed scan is walked; anything unreadable is not a comment.
 */
function jpegHasCommentSegment(input: Buffer): boolean {
  if (input.length < 4 || input[0] !== 0xff || input[1] !== 0xd8) return false;
  let offset = 2;
  while (offset + 4 <= input.length) {
    if (input[offset] !== 0xff) return false;
    const marker = input[offset + 1];
    if (marker === undefined) return false;
    if (marker === JPEG_COMMENT_MARKER) return true;
    if (marker === JPEG_SCAN_START_MARKER) return false;
    // Standalone markers (RSTn, TEM) carry no length; padding bytes are 0xff.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0xff) {
      offset += marker === 0xff ? 1 : 2;
      continue;
    }
    const length = input.readUInt16BE(offset + 2);
    if (length < 2) return false;
    offset += 2 + length;
  }
  return false;
}

/**
 * Re-encodes an image upright with no metadata (EXIF, GPS, XMP, IPTC, JPEG
 * comment segments), within `maxBytes`. Quality steps down from the mobile
 * app's own 80. An animated WebP keeps all of its frames; sharp cannot rotate
 * a multi-frame image, so an animation is stored as its pixels are and only
 * its orientation tag goes. Returns null for
 * an image already in the requested format that carries none, so a second pass neither re-encodes it nor
 * changes its size. Throws when the bytes are not a readable image, or hold
 * more than `maxPixels` pixels when that is given.
 */
export async function stripImageMetadata(
  input: Buffer,
  format: "jpeg" | "webp",
  maxBytes: number,
  maxPixels?: number,
): Promise<Buffer | null> {
  const open = (animated: boolean) =>
    sharp(input, {
      ...(maxPixels === undefined ? {} : { limitInputPixels: maxPixels }),
      ...(animated ? { animated: true } : {}),
    });
  const meta = await open(false).metadata();
  const animated = format === "webp" && (meta.pages ?? 1) > 1;
  const carriesMetadata =
    meta.format !== format ||
    meta.exif !== undefined ||
    meta.xmp !== undefined ||
    meta.iptc !== undefined ||
    (meta.orientation !== undefined && meta.orientation !== 1) ||
    (format === "jpeg" && jpegHasCommentSegment(input));
  if (!carriesMetadata) return null;

  let sizeBytes = 0;
  for (const quality of [80, 70, 60, 50]) {
    const upright = animated ? open(true) : open(false).autoOrient();
    const encoded = await (format === "webp"
      ? upright.webp({ quality })
      : upright.jpeg({ quality, progressive: true })
    ).toBuffer();
    if (encoded.length <= maxBytes) return encoded;
    sizeBytes = encoded.length;
  }
  throw new ImageTooLargeAfterCleaningError(sizeBytes, maxBytes);
}
