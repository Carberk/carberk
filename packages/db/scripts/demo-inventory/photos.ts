import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

import sharp from "sharp";

import type { DemoPhoto } from "./manifest";
import { DemoInventoryError } from "./result";

export interface PhotoSource {
  /** The bytes of one manifest photo, as Commons serves them. */
  load(photo: DemoPhoto): Promise<Buffer>;
}

/** Commons asks automated clients to identify themselves and to stay sequential. */
const USER_AGENT = "AutoTM-demo-inventory/1.0 (https://autotm.bagtyyar.dev; operator seed, one request at a time)";
const PAUSE_MS = 500;
const ATTEMPTS = 4;
const TIMEOUT_MS = 60_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** True when the bytes decode as an image. A 200 can still carry an error page or half a file. */
async function isImage(body: Buffer): Promise<boolean> {
  try {
    await sharp(body).stats();
    return true;
  } catch {
    return false;
  }
}

/**
 * Downloads from Commons one photo at a time and keeps each file in `cacheDir`, so a rerun or a
 * retry after a failed upload asks Commons for nothing it already has. Only an answer that decodes
 * as an image is kept, so a rerun never reads a bad download back.
 */
export function createCommonsPhotoSource(
  cacheDir: string,
  options: {
    fetch?: (url: string, init: { headers: Record<string, string>; signal: AbortSignal }) => Promise<Response>;
    pauseMs?: number;
  } = {},
): PhotoSource {
  const download = options.fetch ?? fetch;
  const pauseMs = options.pauseMs ?? PAUSE_MS;
  return {
    async load(photo) {
      const cached = path.join(cacheDir, `${createHash("sha256").update(photo.url).digest("hex")}.jpg`);
      try {
        return await readFile(cached);
      } catch {
        // Not cached yet.
      }
      let reason = "no response from Wikimedia Commons";
      for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
        // A network failure, a timeout and a body cut short count as status 0 and are retried like a 5xx.
        let status = 0;
        let body: Buffer | null = null;
        try {
          const response = await download(photo.url, {
            headers: { "User-Agent": USER_AGENT },
            signal: AbortSignal.timeout(TIMEOUT_MS),
          });
          status = response.status;
          if (response.ok) body = Buffer.from(await response.arrayBuffer());
        } catch {
          status = 0;
        }
        if (body) {
          if (!(await isImage(body))) {
            reason = "the answer is not an image";
            break;
          }
          await mkdir(cacheDir, { recursive: true });
          await writeFile(cached, body);
          await sleep(pauseMs);
          return body;
        }
        reason = status === 0 ? "no response from Wikimedia Commons" : `HTTP ${status}`;
        // 429 and 5xx are Commons asking for a slower client; anything else will not improve.
        if (status !== 0 && status !== 429 && status < 500) break;
        if (attempt < ATTEMPTS) await sleep(pauseMs * 4 ** attempt);
      }
      throw new DemoInventoryError(`Failed to download ${photo.sourceFile}: ${reason}`);
    },
  };
}

/**
 * The variants `GetListingDetail` builds URLs for, with the sizes and fit of the API's
 * `SharpImageVariantGenerator`. Keep them the same, so demo photos crop and preserve proportions exactly as a
 * seller's own upload does.
 */
const VARIANTS = [
  { name: "thumbnail", width: 200, height: 200, fit: "cover" },
  { name: "list", width: 600, height: 400, fit: "cover" },
  { name: "detail", width: 1200, height: 800, fit: "inside" },
  { name: "fullscreen", width: 2400, height: 1600, fit: "inside" },
] as const;

export const OBJECTS_PER_PHOTO = VARIANTS.length + 1;

export interface PreparedPhoto {
  width: number;
  height: number;
  /** `original` first, then each variant. All WebP. */
  files: { name: string; body: Buffer }[];
}

/**
 * Builds the stored objects of one photo. The original is re-encoded upright with no metadata
 * (EXIF, GPS, XMP, IPTC), which is what the Listing photo pipeline leaves behind for an upload
 * (`apps/api/src/common/stripImageMetadata.ts`): sharp drops all input metadata unless asked to
 * keep it, and `autoOrient` applies and removes the orientation tag.
 */
export async function preparePhoto(source: Buffer): Promise<PreparedPhoto> {
  const original = await sharp(source).autoOrient().webp({ quality: 80 }).toBuffer();
  const meta = await sharp(original).metadata();
  if (meta.exif || meta.xmp || meta.iptc || (meta.orientation ?? 1) !== 1) {
    throw new DemoInventoryError("A demo photo still carries metadata after cleaning");
  }
  const files = [{ name: "original", body: original }];
  for (const variant of VARIANTS) {
    files.push({
      name: variant.name,
      body: await sharp(original)
        .resize(variant.width, variant.height, { fit: variant.fit, withoutEnlargement: true })
        .webp({ quality: 80 })
        .toBuffer(),
    });
  }
  return { width: meta.width, height: meta.height, files };
}
