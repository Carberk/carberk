import { GetObjectCommand, HeadObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import type { ConfigService } from "@nestjs/config";
import sharp from "sharp";
import { ListingsSchemas } from "@auto-tm/contracts";
import { thumbHashToApproximateAspectRatio, thumbHashToAverageRGBA } from "thumbhash";
import { describe, expect, it } from "vitest";

import type { Env } from "../../../env.schema";
import { SharpChatAttachmentCleaner } from "./SharpChatAttachmentCleaner";

const KEY =
  "chat-attachments/7d0c1a52-3b64-4e8f-9a17-5c2e8f1b6d90/0b9f3c1e-2d4a-4c6b-8e1f-3a5b7c9d1e2f/original.jpg";

const noSuchKey = () => Object.assign(new Error("NotFound"), { name: "NotFound" });
const noSuchBucket = () =>
  Object.assign(new Error("NoSuchBucket"), {
    name: "NoSuchBucket",
    $metadata: { httpStatusCode: 404 },
  });

/** An in-memory stand-in for the bucket the cleaner reads and writes. */
function fakeBucket(
  initial: Record<string, Buffer>,
  options: { headError?: Error; headContentLength?: number; getContentLength?: number } = {},
) {
  const objects = new Map(Object.entries(initial));
  const puts: PutObjectCommand[] = [];
  const heads: string[] = [];
  const gets: string[] = [];
  const reads: string[] = [];
  const destroyed: string[] = [];
  const send = async (command: unknown) => {
    if (command instanceof HeadObjectCommand) {
      expect(command.input.Bucket).toBe("chat-attachments");
      heads.push(command.input.Key!);
      if (options.headError) throw options.headError;
      const body = objects.get(command.input.Key!);
      if (!body) throw noSuchKey();
      return { ContentLength: options.headContentLength ?? body.length };
    }
    if (command instanceof GetObjectCommand) {
      expect(command.input.Bucket).toBe("chat-attachments");
      gets.push(command.input.Key!);
      const body = objects.get(command.input.Key!);
      if (!body) throw noSuchKey();
      return {
        ContentLength: options.getContentLength ?? body.length,
        Body: {
          transformToByteArray: async () => {
            reads.push(command.input.Key!);
            return new Uint8Array(body);
          },
          destroy: () => {
            destroyed.push(command.input.Key!);
          },
        },
      };
    }
    if (command instanceof PutObjectCommand) {
      puts.push(command);
      objects.set(command.input.Key!, Buffer.from(command.input.Body as Buffer));
      return {};
    }
    throw new Error("unexpected command");
  };
  return { objects, puts, heads, gets, reads, destroyed, send };
}

function cleanerWith(bucket: ReturnType<typeof fakeBucket>) {
  const config = { get: () => "http://minio.test" } as unknown as ConfigService<Env, true>;
  const cleaner = new SharpChatAttachmentCleaner(config);
  (cleaner as unknown as { s3: { send: typeof bucket.send } }).s3 = { send: bucket.send };
  return cleaner;
}

/** A 300x200 camera photo with a GPS position, stored rotated (EXIF Orientation 6). */
async function photoWithGps(): Promise<Buffer> {
  return sharp({ create: { width: 300, height: 200, channels: 3, background: { r: 200, g: 30, b: 30 } } })
    .jpeg()
    .withExif({
      IFD0: { Make: "TestCam" },
      IFD3: {
        GPSLatitudeRef: "N",
        GPSLatitude: "37/1 56/1 0/1",
        GPSLongitudeRef: "E",
        GPSLongitude: "58/1 23/1 0/1",
      },
    })
    .withMetadata({ orientation: 6 })
    .toBuffer();
}

function expectPreviewOf(value: unknown, colour: { r: number; g: number; b: number }) {
  expect(ListingsSchemas.ThumbHashSchema.safeParse(value).success).toBe(true);
  const average = thumbHashToAverageRGBA(Buffer.from(String(value), "base64"));
  expect(average.r).toBeCloseTo(colour.r / 255, 1);
  expect(average.g).toBeCloseTo(colour.g / 255, 1);
  expect(average.b).toBeCloseTo(colour.b / 255, 1);
  expect(average.a).toBe(1);
}

describe("SharpChatAttachmentCleaner", () => {
  it("rewrites a photo carrying GPS upright and without EXIF, under the same key", async () => {
    const input = await photoWithGps();
    expect((await sharp(input).metadata()).exif).toBeDefined();
    const bucket = fakeBucket({ [KEY]: input });

    await expect(cleanerWith(bucket).clean(KEY)).resolves.toMatchObject({ status: "clean" });

    const stored = await sharp(bucket.objects.get(KEY)!).metadata();
    expect(stored.exif).toBeUndefined();
    expect(stored.orientation).toBeUndefined();
    // Orientation 6 is a 90 degree turn: the upright image is portrait.
    expect({ width: stored.width, height: stored.height }).toEqual({ width: 200, height: 300 });
    expect(bucket.puts[0]?.input.ContentType).toBe("image/jpeg");
  });

  it("strips a WebP image and keeps it WebP", async () => {
    const key = KEY.replace("original.jpg", "original.webp");
    const input = await sharp(await photoWithGps()).keepMetadata().webp().toBuffer();
    expect((await sharp(input).metadata()).exif).toBeDefined();
    const bucket = fakeBucket({ [key]: input });

    await expect(cleanerWith(bucket).clean(key)).resolves.toMatchObject({ status: "clean" });

    const stored = await sharp(bucket.objects.get(key)!).metadata();
    expect(stored.format).toBe("webp");
    expect(stored.exif).toBeUndefined();
    expect(bucket.puts[0]?.input.ContentType).toBe("image/webp");
  });

  it("leaves an image without metadata untouched", async () => {
    const input = await sharp({
      create: { width: 300, height: 200, channels: 3, background: { r: 10, g: 120, b: 200 } },
    })
      .jpeg({ quality: 80 })
      .toBuffer();
    const bucket = fakeBucket({ [KEY]: input });

    await expect(cleanerWith(bucket).clean(KEY)).resolves.toMatchObject({ status: "clean" });

    expect(bucket.puts).toHaveLength(0);
    expect(Buffer.compare(bucket.objects.get(KEY)!, input)).toBe(0);
  });

  it("returns the image's ThumbHash as standard padded base64 with a clean result", async () => {
    const key = KEY.replace("original.jpg", "original.webp");
    const input = await sharp({
      create: { width: 300, height: 200, channels: 3, background: { r: 10, g: 120, b: 200 } },
    })
      .webp({ lossless: true })
      .toBuffer();

    const result = await cleanerWith(fakeBucket({ [key]: input })).clean(key);

    expect(result.status).toBe("clean");
    if (result.status !== "clean") return;
    expectPreviewOf(result.thumbHash, { r: 10, g: 120, b: 200 });
    expect(thumbHashToApproximateAspectRatio(Buffer.from(result.thumbHash, "base64"))).toBeGreaterThan(1);
  });

  it("computes the ThumbHash from the upright image, so a turned camera photo previews as portrait", async () => {
    const result = await cleanerWith(fakeBucket({ [KEY]: await photoWithGps() })).clean(KEY);

    if (result.status !== "clean") throw new Error(`expected clean, got ${result.status}`);
    expect(thumbHashToApproximateAspectRatio(Buffer.from(result.thumbHash, "base64"))).toBeLessThan(1);
  });

  it("reports a key with no stored object as missing", async () => {
    const bucket = fakeBucket({});

    await expect(cleanerWith(bucket).clean(KEY)).resolves.toEqual({ status: "missing" });
  });

  it("reports a stored object that is not an image as invalid and does not rewrite it", async () => {
    const bucket = fakeBucket({ [KEY]: Buffer.from("not an image") });

    await expect(cleanerWith(bucket).clean(KEY)).resolves.toEqual({ status: "invalid" });
    expect(bucket.puts).toHaveLength(0);
  });

  it("reports a PNG stored under a .jpg key as invalid and does not rewrite it", async () => {
    const png = await sharp({
      create: { width: 30, height: 20, channels: 3, background: { r: 1, g: 2, b: 3 } },
    })
      .png()
      .toBuffer();
    const bucket = fakeBucket({ [KEY]: png });

    await expect(cleanerWith(bucket).clean(KEY)).resolves.toEqual({ status: "invalid" });
    expect(bucket.puts).toHaveLength(0);
  });

  it("reports a stored object over the 5 MB cap as invalid without fetching its body", async () => {
    const bucket = fakeBucket({ [KEY]: Buffer.alloc(5 * 1024 * 1024 + 1) });

    await expect(cleanerWith(bucket).clean(KEY)).resolves.toEqual({ status: "invalid" });
    expect(bucket.gets).toEqual([]);
    expect(bucket.reads).toEqual([]);
    expect(bucket.puts).toHaveLength(0);
  });

  it("does not buffer an over-cap body when only the download reports its size", async () => {
    const bucket = fakeBucket(
      { [KEY]: Buffer.alloc(5 * 1024 * 1024 + 1) },
      { headContentLength: 0 },
    );

    await expect(cleanerWith(bucket).clean(KEY)).resolves.toEqual({ status: "invalid" });
    expect(bucket.gets).toEqual([KEY]);
    expect(bucket.reads).toEqual([]);
    expect(bucket.destroyed).toEqual([KEY]);
    expect(bucket.puts).toHaveLength(0);
  });

  it("fails instead of reporting missing when the bucket itself is gone", async () => {
    const bucket = fakeBucket({}, { headError: noSuchBucket() });

    await expect(cleanerWith(bucket).clean(KEY)).rejects.toThrow("NoSuchBucket");
  });

  /** A valid JPEG larger than the 5 MB cap: noise compresses poorly even at quality 95. */
  async function noisyOverCapJpeg(): Promise<Buffer> {
    const width = 2500;
    const height = 2500;
    const pixels = Buffer.alloc(width * height * 3);
    let seed = 7;
    for (let i = 0; i < pixels.length; i += 1) {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      pixels[i] = seed % 256;
    }
    const overCap = await sharp(pixels, { raw: { width, height, channels: 3 } })
      .jpeg({ quality: 95 })
      .toBuffer();
    expect(overCap.length).toBeGreaterThan(5 * 1024 * 1024);
    return overCap;
  }

  it("rejects an object that grows past the cap between its HEAD and its body", async () => {
    const overCap = await noisyOverCapJpeg();
    // Both reported sizes understate the body, so only the guard after the
    // read can reject it.
    const bucket = fakeBucket(
      { [KEY]: overCap },
      { headContentLength: 100, getContentLength: 100 },
    );

    await expect(cleanerWith(bucket).clean(KEY)).resolves.toEqual({ status: "invalid" });
    expect(bucket.puts).toHaveLength(0);
  });

  it("rejects an image with more pixels than the decode bound", async () => {
    // 8000x7000 = 56 MP, over the 50 MP decode bound, in a small solid JPEG.
    const huge = await sharp({
      create: { width: 8000, height: 7000, channels: 3, background: { r: 1, g: 2, b: 3 } },
    })
      .jpeg({ quality: 80 })
      .toBuffer();
    const bucket = fakeBucket({ [KEY]: huge });

    await expect(cleanerWith(bucket).clean(KEY)).resolves.toEqual({ status: "invalid" });
    expect(bucket.puts).toHaveLength(0);
  });
});
