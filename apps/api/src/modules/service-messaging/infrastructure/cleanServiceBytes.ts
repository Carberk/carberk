import sharp from "sharp";

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
    const animated = format === "webp" && (metadata.pages ?? 1) > 1;
    for (const quality of [80, 70, 60, 50]) {
      const decoded = sharp(input, { limitInputPixels: PIXEL_LIMIT, failOn: "warning", ...(animated ? { animated: true } : {}) });
      const upright = animated ? decoded : decoded.autoOrient();
      const cleaned = await (format === "jpeg" ? upright.jpeg({ quality }) : upright.webp({ quality })).toBuffer();
      if (cleaned.length <= IMAGE_LIMIT) return cleaned;
    }
    throw new ServiceDenied("INVALID_ATTACHMENT");
  } catch {
    throw new ServiceDenied("INVALID_ATTACHMENT");
  }
}
