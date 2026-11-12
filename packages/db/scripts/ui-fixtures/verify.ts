import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import sharp from "sharp";

import type { GalleryDefinition } from "./manifest";

/** Read-only local verification; never downloads, uploads, or applies a scenario. */
export async function verifyGallery(directory: string, gallery: GalleryDefinition) {
  let bytes = 0;
  const sourceFiles = new Set<string>();
  const sourcePages = new Set<string>();
  const digests = new Set<string>();
  for (const photo of gallery.photos) {
    const at = `Gallery photo ${photo.order} (${photo.file})`;
    if (sourceFiles.has(photo.sourceFile) || sourcePages.has(photo.sourcePage)) {
      throw new Error(`${at}: duplicate source identity`);
    }
    sourceFiles.add(photo.sourceFile);
    sourcePages.add(photo.sourcePage);
    let source: Buffer;
    try { source = await readFile(join(directory, photo.file)); }
    catch { throw new Error(`${at}: missing or unreadable local JPEG; restore the bundled version, then verify again`); }
    if (source.length !== photo.bytes) throw new Error(`${at}: byte count mismatch`);
    const digest = createHash("sha256").update(source).digest("hex");
    if (digests.has(digest)) throw new Error(`${at}: duplicate content`);
    digests.add(digest);
    if (digest !== photo.sha256) throw new Error(`${at}: SHA256 mismatch`);
    const image = sharp(source, { failOn: "warning" });
    const metadata = await image.metadata().catch(() => {
      throw new Error(`${at}: cannot decode complete JPEG`);
    });
    const decoded = await image.raw().toBuffer({ resolveWithObject: true }).catch(() => {
      throw new Error(`${at}: cannot decode complete JPEG`);
    });
    if (metadata.format !== "jpeg") throw new Error(`${at}: expected JPEG`);
    if (decoded.info.width !== photo.width || decoded.info.height !== photo.height) {
      throw new Error(`${at}: dimensions mismatch`);
    }
    bytes += source.length;
  }
  return { scenarioKey: gallery.scenarioKey, version: gallery.version, photos: gallery.photos.length, bytes };
}
