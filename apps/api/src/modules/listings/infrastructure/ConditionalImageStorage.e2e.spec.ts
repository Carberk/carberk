import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { ConfigService } from "@nestjs/config";
import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Env } from "../../../env.schema";
import { MinioMediaStorageAdapter } from "./MinioMediaStorageAdapter";
import { SharpImageVariantGenerator } from "./SharpImageVariantGenerator";

// Uses only the disposable service started by hosted ci-services.sh, never a live bucket.
describe("conditional image protocol on digest-pinned hosted MinIO (#725)", () => {
  let s3: S3Client;
  let config: ConfigService<Env, true>;
  let adapter: MinioMediaStorageAdapter;
  const owned = new Set<string>();
  const bucket = "listing-photos";

  beforeAll(() => {
    const endpoint = process.env["MINIO_ENDPOINT"] ?? "";
    if (process.env["GITHUB_ACTIONS"] !== "true" ||
      !["localhost", "127.0.0.1"].includes(new URL(endpoint).hostname)) {
      throw new Error("This protocol gate requires hosted disposable MinIO; live/local provider tests are forbidden");
    }
    const values = {
      MINIO_ENDPOINT: endpoint, MINIO_PUBLIC_URL: endpoint,
      MINIO_ACCESS_KEY: process.env["MINIO_ACCESS_KEY"] ?? "minioadmin",
      MINIO_SECRET_KEY: process.env["MINIO_SECRET_KEY"] ?? "minioadmin",
      MINIO_REGION: "us-east-1",
    };
    config = new ConfigService(values) as ConfigService<Env, true>;
    adapter = new MinioMediaStorageAdapter(config);
    s3 = new S3Client({ endpoint, region: "us-east-1", forcePathStyle: true,
      requestChecksumCalculation: "WHEN_REQUIRED",
      credentials: { accessKeyId: values.MINIO_ACCESS_KEY, secretAccessKey: values.MINIO_SECRET_KEY } });
  });

  afterAll(async () => {
    if (!s3) return;
    for (const Key of owned) await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key }));
    s3.destroy();
  });

  function manifest(key: string): string[] {
    const base = key.slice(0, key.lastIndexOf("/") + 1);
    return [key, `${base}thumbnail.webp`, `${base}list.webp`, `${base}detail.webp`, `${base}fullscreen.webp`];
  }

  async function issue(protocol: "legacy" | "conditional-v1" = "conditional-v1") {
    const key = `pending/${randomUUID()}/original.webp`;
    for (const member of manifest(key)) owned.add(member);
    const photo = await sharp({ create: { width: 32, height: 48, channels: 3, background: "red" } })
      .webp().withExif({ IFD0: { Make: "TestCam" }, IFD3: {
        GPSLatitudeRef: "N", GPSLatitude: "37/1 56/1 0/1", GPSLongitudeRef: "E", GPSLongitude: "58/1 23/1 0/1",
      } }).toBuffer();
    const signed = await adapter.presignUpload({ key, contentType: "image/webp", sizeBytes: photo.length,
      ...(protocol === "conditional-v1" ? { writeProtocol: "conditional-v1" as const } : {}) });
    const headers = "headers" in signed ? signed.headers as Record<string, string> : {};
    return { key, photo, signed, headers };
  }

  async function upload(fixture: Awaited<ReturnType<typeof issue>>) {
    const response = await fetch(fixture.signed.url, { method: "PUT",
      headers: { "content-type": "image/webp", ...fixture.headers }, body: new Uint8Array(fixture.photo) });
    expect(response.status).toBe(200);
  }

  async function remove(keys: string[]) {
    for (const Key of keys) await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key }));
  }

  async function absent(keys: string[]) {
    for (const Key of keys) {
      await expect(s3.send(new HeadObjectCommand({ Bucket: bucket, Key }))).rejects.toMatchObject({
        $metadata: { httpStatusCode: 404 },
      });
    }
  }

  it("initializes all five objects and enforces the actual signed header, replay and deleted-key refusal", async () => {
    const fixture = await issue();
    expect(fixture.headers["if-match"]).toBeTruthy();
    expect(new URL(fixture.signed.url).searchParams.get("X-Amz-SignedHeaders")?.split(";"))
      .toContain("if-match");
    expect([...new URL(fixture.signed.url).searchParams.keys()]
      .some((name) => /^x-amz-checksum-/i.test(name))).toBe(false);
    for (const Key of manifest(fixture.key)) {
      const initialized = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key }));
      expect(initialized.ContentLength).toBe(0);
      expect(initialized.CacheControl).toBe("no-store");
    }
    for (const headers of [Object.fromEntries(Object.entries(fixture.headers).filter(([name]) => name !== "if-match")),
      { ...fixture.headers, "if-match": '"altered"' }]) {
      const refused = await fetch(fixture.signed.url, { method: "PUT", headers, body: new Uint8Array(fixture.photo) });
      expect([400, 403, 409, 412]).toContain(refused.status);
      const unchanged = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: fixture.key }));
      expect(unchanged.ContentLength).toBe(0);
      expect(unchanged.ETag).toBe(fixture.headers["if-match"]);
    }
    await upload(fixture);
    const replay = await fetch(fixture.signed.url, { method: "PUT", headers: fixture.headers, body: new Uint8Array(fixture.photo) });
    expect([409, 412]).toContain(replay.status);
    await remove(manifest(fixture.key));
    const late = await fetch(fixture.signed.url, { method: "PUT", headers: fixture.headers, body: new Uint8Array(fixture.photo) });
    expect([404, 409, 412]).toContain(late.status);
    await absent(manifest(fixture.key));
  });

  it("keeps plain installed-client uploads usable without protocol or If-Match headers", async () => {
    const fixture = await issue("legacy");
    expect(fixture.signed).not.toHaveProperty("headers");
    await upload(fixture);
    expect((await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: fixture.key }))).ContentLength)
      .toBe(fixture.photo.length);
  });

  it("does not recreate an object when a real conditional PUT body overlaps DeleteObject", async () => {
    const fixture = await issue();
    await upload(fixture);
    const current = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: fixture.key }));
    let started!: () => void;
    let resume!: () => void;
    const firstChunk = new Promise<void>((resolve) => { started = resolve; });
    const release = new Promise<void>((resolve) => { resume = resolve; });
    const bytes = Buffer.alloc(128 * 1024, 1);
    const body = Readable.from((async function* () {
      yield bytes.subarray(0, 64 * 1024);
      started();
      await release;
      yield bytes.subarray(64 * 1024);
    })());
    const put = s3.send(new PutObjectCommand({ Bucket: bucket, Key: fixture.key,
      Body: body, ContentLength: bytes.length, IfMatch: current.ETag,
    }), { abortSignal: AbortSignal.timeout(10_000) }).then(() => null, (error: unknown) => error);
    await Promise.race([firstChunk, put.then((error) => {
      throw error ?? new Error("PUT completed before the streamed body barrier");
    })]);
    const deletion = s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: fixture.key }));
    // A provider holding the object lock may wait for the PUT body; either order
    // must leave the final key absent once both real operations finish.
    try { await Promise.race([deletion, new Promise<void>((resolve) => setTimeout(resolve, 50))]); }
    finally { resume(); }
    await deletion;
    const error = await put;
    if (error) expect([404, 409, 412]).toContain(
      (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode,
    );
    await absent([fixture.key]);
  });

  it("scrubs original/variant metadata and fences every real generator write", async () => {
    const fixture = await issue();
    await upload(fixture);
    const generator = new SharpImageVariantGenerator(config);
    const writes: Array<string | undefined> = [];
    const transport = {
      send: async (command: unknown, options?: { abortSignal?: AbortSignal }) => {
        if (command instanceof PutObjectCommand && command.input.Key && manifest(fixture.key).includes(command.input.Key)) {
          writes.push(command.input.IfMatch);
        }
        return s3.send(command as PutObjectCommand, options);
      },
    };
    (generator as unknown as { s3: unknown }).s3 = transport;
    const generate = generator.generate.bind(generator) as (key: string, opts: { writeProtocol: "conditional-v1" }) => Promise<unknown>;
    await generate(fixture.key, { writeProtocol: "conditional-v1" });
    expect(writes).toHaveLength(5);
    expect(writes.every((match) => typeof match === "string" && match.length > 0)).toBe(true);
    for (const Key of manifest(fixture.key)) {
      const stored = await s3.send(new GetObjectCommand({ Bucket: bucket, Key }));
      expect(stored.CacheControl).toBe("no-store");
      if (!stored.Body) throw new Error("Generated image body is missing");
      expect((await sharp(Buffer.from(await stored.Body.transformToByteArray())).metadata()).exif).toBeUndefined();
    }
  });

  it("cannot recreate any original/variant when a generator resumes its PUT after actual deletion", async () => {
    const fixture = await issue();
    await upload(fixture);
    let entered!: () => void;
    let resume!: () => void;
    const paused = new Promise<void>((resolve) => { entered = resolve; });
    const release = new Promise<void>((resolve) => { resume = resolve; });
    const generator = new SharpImageVariantGenerator(config);
    const transport = {
      send: async (command: unknown, options?: { abortSignal?: AbortSignal }) => {
        if (command instanceof PutObjectCommand && command.input.Key === manifest(fixture.key)[1]) {
          entered();
          await release;
        }
        return s3.send(command as PutObjectCommand, options);
      },
    };
    (generator as unknown as { s3: unknown }).s3 = transport;
    const generate = generator.generate.bind(generator) as (key: string, opts: { writeProtocol: "conditional-v1" }) => Promise<unknown>;
    const result = generate(fixture.key, { writeProtocol: "conditional-v1" }).then(() => null, (error: unknown) => error);
    await Promise.race([paused, result.then((error) => {
      throw error ?? new Error("Generation finished before the controlled storage race");
    })]);
    try { await remove(manifest(fixture.key)); } finally { resume(); }
    const refusal = await result;
    expect(refusal).not.toBeNull();
    const status = (refusal as { $metadata?: { httpStatusCode?: number } } | null)?.$metadata?.httpStatusCode;
    // This pinned MinIO returns NoSuchKey/404, while S3 can return 409/412.
    // Success, auth failures, server errors and timeouts must still fail.
    expect([404, 409, 412]).toContain(status);
    await absent(manifest(fixture.key));
  });
});
