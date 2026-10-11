import { deflateSync } from "node:zlib";

import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import type { ConfigService } from "@nestjs/config";
import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";

import type { Env } from "../../../env.schema";
import { DomainError, LISTING_ERROR_CODES } from "../domain/types";
import { SharpImageVariantGenerator } from "./SharpImageVariantGenerator";

/** An in-memory stand-in for the bucket the generator reads and writes. */
function fakeBucket(initial: Record<string, Buffer>) {
  const objects = new Map(Object.entries(initial));
  const send = async (command: unknown) => {
    if (command instanceof GetObjectCommand) {
      const body = objects.get(command.input.Key!);
      if (!body) throw Object.assign(new Error("NoSuchKey"), { name: "NoSuchKey" });
      return { Body: { transformToByteArray: async () => new Uint8Array(body) } };
    }
    if (command instanceof PutObjectCommand) {
      objects.set(command.input.Key!, Buffer.from(command.input.Body as Buffer));
      return {};
    }
    throw new Error("unexpected command");
  };
  return { objects, send };
}

function generatorWith(bucket: ReturnType<typeof fakeBucket>) {
  const config = { get: () => "http://minio.test" } as unknown as ConfigService<Env, true>;
  const generator = new SharpImageVariantGenerator(config);
  (generator as unknown as { s3: { send: typeof bucket.send } }).s3 = { send: bucket.send };
  return generator;
}

/** A tiny hand-built PNG whose header declares far more pixels than sharp decodes. */
function hugePixelPng(): Buffer {
  const crc32 = (buf: Buffer): number => {
    let crc = 0xffffffff;
    for (const byte of buf) {
      let c = (crc ^ byte) & 0xff;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crc = (crc >>> 8) ^ c;
    }
    return (crc ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer): Buffer => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(20000, 0);
  ihdr.writeUInt32BE(20000, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // truecolor RGB
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(Buffer.alloc(100))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** Deterministic incompressible bytes (mulberry32), one byte per step. */
function seededNoise(length: number): Buffer {
  const buffer = Buffer.alloc(length);
  let state = 0x9e3779b9;
  for (let i = 0; i < length; i++) {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    buffer[i] = ((t ^ (t >>> 14)) >>> 16) & 0xff;
  }
  return buffer;
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

describe("SharpImageVariantGenerator", () => {
  it("writes only four WebP derivatives with natural detail and fullscreen proportions", async () => {
    const key = "pending/natural/original.webp";
    const input = await sharp({ create: { width: 1920, height: 1440, channels: 3, background: "red" } }).webp().toBuffer();
    const bucket = fakeBucket({ [key]: input });
    const result = await generatorWith(bucket).generate(key);
    expect([...bucket.objects.keys()]).toHaveLength(5);
    expect([...bucket.objects.keys()].every((stored) => stored.endsWith(".webp"))).toBe(true);
    for (const name of ["detail", "fullscreen"] as const) {
      const meta = await sharp(bucket.objects.get(result.variants[name])!).metadata();
      expect(Math.abs(meta.width! - meta.height! * 4 / 3)).toBeLessThanOrEqual(1);
      const stats = await sharp(bucket.objects.get(result.variants[name])!).stats();
      expect(stats.channels[0]!.min).toBeGreaterThan(200);
    }
  });

  it("strips GPS and all EXIF from the stored original and every variant, keeping the photo upright", async () => {
    const key = "pending/0b9f3c1e-2d4a-4c6b-8e1f-3a5b7c9d1e2f/original.jpg";
    const input = await photoWithGps();
    const inputMeta = await sharp(input).metadata();
    expect(inputMeta.exif).toBeDefined();
    expect(inputMeta.orientation).toBe(6);

    const bucket = fakeBucket({ [key]: input });
    await generatorWith(bucket).generate(key);

    const base = key.replace("/original.jpg", "");
    const served = [
      key,
      ...["thumbnail", "list", "detail", "fullscreen"].flatMap((v) => [
        `${base}/${v}.jpg`,
        `${base}/${v}.webp`,
      ]),
    ];
    for (const servedKey of served) {
      const stored = bucket.objects.get(servedKey);
      expect(stored, servedKey).toBeDefined();
      const meta = await sharp(stored!).metadata();
      expect(meta.exif, `${servedKey} carries EXIF`).toBeUndefined();
      expect(meta.orientation, `${servedKey} carries an Orientation tag`).toBeUndefined();
    }

    // Orientation 6 is a 90 degree turn: the upright original is portrait.
    const original = await sharp(bucket.objects.get(key)!).metadata();
    expect({ width: original.width, height: original.height }).toEqual({ width: 200, height: 300 });
  });
  it("leaves an original without metadata untouched, so a retried publish keeps its size", async () => {
    const key = "pending/1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f/original.jpg";
    const input = await sharp({
      create: { width: 300, height: 200, channels: 3, background: { r: 10, g: 120, b: 200 } },
    })
      .jpeg({ quality: 80 })
      .toBuffer();
    expect((await sharp(input).metadata()).exif).toBeUndefined();

    const bucket = fakeBucket({ [key]: input });
    await generatorWith(bucket).generate(key);

    expect(Buffer.compare(bucket.objects.get(key)!, input)).toBe(0);
  });

  // #735 / ADR-0089: bytes that can never become an image are a permanent
  // failure (UPLOAD_OBJECT_INVALID), so publish names the photo and retires
  // only that upload; transport failures stay transient and retryable.
  it("reports bytes that are not an image as UPLOAD_OBJECT_INVALID", async () => {
    const key = "pending/2a3b4c5d-6e7f-8a9b-0c1d-2e3f4a5b6c7d/original.jpg";
    const bucket = fakeBucket({ [key]: Buffer.from("this is not an image at all") });

    const err = await generatorWith(bucket).generate(key).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(DomainError);
    expect((err as DomainError).code).toBe(LISTING_ERROR_CODES.UPLOAD_OBJECT_INVALID);
  });

  it("reports a truncated JPEG whose header is readable as permanently unusable", async () => {
    const key = "pending/truncated/original.jpg";
    const full = await sharp({ create: { width: 100, height: 100, channels: 3, background: "red" } }).jpeg().toBuffer();
    const scan = full.indexOf(Buffer.from([0xff, 0xda]));
    const truncated = full.subarray(0, scan + 16);
    expect((await sharp(truncated).metadata()).width).toBe(100);
    await expect(generatorWith(fakeBucket({ [key]: truncated })).generate(key)).rejects.toMatchObject({
      code: LISTING_ERROR_CODES.UPLOAD_OBJECT_INVALID,
    });
  });

  it("reports an image over Sharp's pixel limit as permanently unusable", async () => {
    const key = "pending/huge/original.jpg";
    await expect(generatorWith(fakeBucket({ [key]: hugePixelPng() })).generate(key)).rejects.toMatchObject({
      code: LISTING_ERROR_CODES.UPLOAD_OBJECT_INVALID,
    });
  });

  it.each(["metadata", "toBuffer"] as const)("keeps a resource failure during %s retryable", async (stage) => {
    const key = "pending/resource/original.jpg";
    const input = await sharp({ create: { width: 10, height: 10, channels: 3, background: "red" } }).jpeg().toBuffer();
    const failure = new Error("VipsRegion: unable to allocate memory");
    const mock = vi.spyOn(sharp.prototype, stage).mockRejectedValueOnce(failure);
    try {
      await expect(generatorWith(fakeBucket({ [key]: input })).generate(key)).rejects.toBe(failure);
    } finally {
      mock.mockRestore();
    }
  });

  it("reports an image still over the upload cap after cleaning as UPLOAD_OBJECT_INVALID", async () => {
    const key = "pending/3b4c5d6e-7f8a-9b0c-1d2e-3f4a5b6c7d8e/original.jpg";
    // Seeded noise compresses badly and deterministically, so even the lowest
    // cleaning quality stays over the 5 MB cap; the EXIF tag forces cleaning.
    const noise = await sharp(seededNoise(5600 * 3400 * 3), {
      raw: { width: 5600, height: 3400, channels: 3 },
    })
      .jpeg({ quality: 100 })
      .withExif({ IFD0: { Make: "NoiseCam" } })
      .toBuffer();
    const bucket = fakeBucket({ [key]: noise });

    const err = await generatorWith(bucket).generate(key).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(DomainError);
    expect((err as DomainError).code).toBe(LISTING_ERROR_CODES.UPLOAD_OBJECT_INVALID);
  }, 20000);

  it("keeps a missing stored object a transient error, not UPLOAD_OBJECT_INVALID", async () => {
    const key = "pending/4c5d6e7f-8a9b-0c1d-2e3f-4a5b6c7d8e9f/original.jpg";
    const bucket = fakeBucket({});

    const err = await generatorWith(bucket).generate(key).catch((e: unknown) => e);

    expect(err).not.toBeInstanceOf(DomainError);
    expect((err as Error).name).toBe("NoSuchKey");
  });
});
