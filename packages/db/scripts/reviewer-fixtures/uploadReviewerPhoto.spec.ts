import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { uploadReviewerPhoto } from "./uploadReviewerPhoto";
import manifest from "./photos.manifest.json";

const uploaded = vi.hoisted(() => [] as Array<{ Bucket: string; Key: string; Body: Buffer; ContentType: string }>);
vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: class {
    async send(command: { input: typeof uploaded[number] }) { uploaded.push(command.input); }
    destroy() {}
  },
  PutObjectCommand: class {
    constructor(readonly input: typeof uploaded[number]) {}
  },
}));

afterEach(() => vi.unstubAllEnvs());
beforeEach(() => {
  uploaded.length = 0;
  vi.stubEnv("MINIO_ENDPOINT", "https://media.example.test");
  vi.stubEnv("MINIO_ACCESS_KEY", "fixture-key");
  vi.stubEnv("MINIO_SECRET_KEY", "fixture-secret");
});

describe("bundled reviewer vehicle images", () => {
  it.each([0, 1, 2])("uploads local fixture %i as five decodable WebPs without EXIF/GPS", async (index) => {
    const source = await readFile(join(__dirname, `camry-${index + 1}.jpg`));
    expect(createHash("sha256").update(source).digest("hex")).toBe(manifest.photos[index]?.sha256);
    const key = `reviewer-scenario/listing/${index}/original.webp`;
    const dimensions = await uploadReviewerPhoto(key, index);
    expect(dimensions).toEqual({ width: 1600, height: 1200 });
    expect(uploaded.map((object) => object.Key)).toEqual([
      key, `reviewer-scenario/listing/${index}/thumbnail.webp`, `reviewer-scenario/listing/${index}/list.webp`,
      `reviewer-scenario/listing/${index}/detail.webp`, `reviewer-scenario/listing/${index}/fullscreen.webp`,
    ]);
    const widths = [];
    for (const object of uploaded) {
      expect(object.Bucket).toBe("listing-photos");
      expect(object.ContentType).toBe("image/webp");
      const metadata = await sharp(object.Body).metadata();
      widths.push(metadata.width);
      expect(metadata.format).toBe("webp");
      expect(metadata.exif).toBeUndefined();
      expect(metadata.xmp).toBeUndefined();
      expect(object.Body.length).toBeLessThan(5 * 1024 * 1024);
    }
    expect(widths).toEqual([1600, 160, 400, 800, 1600]);
  });

  it("requires storage configuration before sending any objects", async () => {
    vi.stubEnv("MINIO_ENDPOINT", "");
    await expect(uploadReviewerPhoto("reviewer-scenario/listing/0/original.webp", 0)).rejects.toThrow("MINIO_ENDPOINT");
    expect(uploaded).toEqual([]);
  });
});
