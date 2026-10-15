import sharp from "sharp";

import { stripImageMetadata } from "../../../common/stripImageMetadata";
import { ServiceDenied } from "../domain/serviceAccess";

const IMAGE_LIMIT = 5 * 1024 * 1024;
const PDF_LIMIT = 20 * 1024 * 1024;
const PIXEL_LIMIT = 50_000_000;

/** Images are metadata-cleaned; supplier PDFs retain their original bytes. */
export async function cleanServiceBytes(
  bytes: Uint8Array,
  contentType: string,
  purpose: "support" | "history",
): Promise<Uint8Array> {
  const input = Buffer.from(bytes);
  if (contentType === "application/pdf") {
    if (
      purpose !== "history" || input.length > PDF_LIMIT ||
      !input.subarray(0, 8).toString("ascii").startsWith("%PDF-") ||
      !input.subarray(-1024).toString("ascii").includes("%%EOF")
    ) throw new ServiceDenied("INVALID_ATTACHMENT");
    return input;
  }
  const format = contentType === "image/jpeg" ? "jpeg" : contentType === "image/webp" ? "webp" : null;
  if (!format || input.length === 0 || input.length > IMAGE_LIMIT) {
    throw new ServiceDenied("INVALID_ATTACHMENT");
  }
  try {
    const metadata = await sharp(input, { limitInputPixels: PIXEL_LIMIT }).metadata();
    if (metadata.format !== format) throw new ServiceDenied("INVALID_ATTACHMENT");
    return await stripImageMetadata(input, format, IMAGE_LIMIT, PIXEL_LIMIT) ?? input;
  } catch {
    throw new ServiceDenied("INVALID_ATTACHMENT");
  }
}
