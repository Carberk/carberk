import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import sharp from "sharp";

const WIDTHS = { original: 1600, thumbnail: 160, list: 400, detail: 800, fullscreen: 1600 };

/** Local licensed fixtures only. Every stored output strips EXIF/GPS metadata. */
export async function uploadReviewerPhoto(key: string, fixtureIndex: number): Promise<{ width: number; height: number }> {
  const endpoint = process.env["MINIO_ENDPOINT"];
  const accessKeyId = process.env["MINIO_ACCESS_KEY"];
  const secretAccessKey = process.env["MINIO_SECRET_KEY"];
  if (!endpoint || !accessKeyId || !secretAccessKey) throw new Error("Reviewer photos require MINIO_ENDPOINT, MINIO_ACCESS_KEY and MINIO_SECRET_KEY");
  const source = await readFile(join(__dirname, `camry-${fixtureIndex + 1}.jpg`));
  const s3 = new S3Client({ endpoint, region: "us-east-1", forcePathStyle: true, credentials: { accessKeyId, secretAccessKey } });
  let dimensions = { width: 0, height: 0 };
  try {
    for (const [variant, width] of Object.entries(WIDTHS)) {
      const output = await sharp(source).autoOrient().resize({ width, withoutEnlargement: true }).webp({ quality: 80 }).toBuffer({ resolveWithObject: true });
      // No keepMetadata/withMetadata: sharp strips all input metadata by default.
      await s3.send(new PutObjectCommand({
        Bucket: "listing-photos", Key: key.replace(/original\.webp$/, `${variant}.webp`),
        Body: output.data, ContentType: "image/webp",
      }));
      if (variant === "original") dimensions = { width: output.info.width, height: output.info.height };
    }
  } finally {
    s3.destroy();
  }
  return dimensions;
}
