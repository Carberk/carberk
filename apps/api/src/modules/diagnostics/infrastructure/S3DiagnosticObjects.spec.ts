import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import { ConfigService } from "@nestjs/config";
import sharp from "sharp";
import { beforeEach, expect, it, vi } from "vitest";
import { S3DiagnosticObjects } from "./S3DiagnosticObjects";
const send = vi.hoisted(() => vi.fn());
vi.mock("@aws-sdk/client-s3", async original => ({ ...await original<typeof import("@aws-sdk/client-s3")>(), S3Client: class { send = send; destroy() {} } }));
const config = (bucket = "diagnostic-test-private") => new ConfigService({ DIAGNOSTIC_PRIVATE_BUCKET: bucket, MINIO_ENDPOINT: "http://127.0.0.1:9000", MINIO_ACCESS_KEY: "synthetic", MINIO_SECRET_KEY: "synthetic" });
const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const id = "11111111-1111-4111-8111-111111111111";
beforeEach(() => send.mockReset());
it("strips actual metadata and validates declared content type instead of trusting a filename", async () => {
  const input = await sharp({ create: { width: 4, height: 4, channels: 3, background: "red" } }).withMetadata({ exif: { IFD0: { Artist: "Private technician identity" } } }).jpeg().toBuffer();
  const store = new S3DiagnosticObjects(config());
  const clean = await store.sanitize(input, "image/jpeg");
  const metadata = await sharp(clean.bytes).metadata();
  expect(clean.mime).toBe("image/webp"); expect(metadata.format).toBe("webp");
  expect(metadata.exif).toBeUndefined(); expect(metadata.xmp).toBeUndefined(); expect(metadata.icc).toBeUndefined();
  await expect(store.sanitize(input, "image/png")).rejects.toThrow("REPORT_EVIDENCE_INVALID");
  await expect(store.sanitize(Buffer.from("not an image"), "image/jpeg")).rejects.toThrow("REPORT_EVIDENCE_INVALID");
});
it("requires exact size and hash for every read and rejects oversized streams", async () => {
  const store = new S3DiagnosticObjects(config()); const bytes = Buffer.from("actual"); const key = `diagnostic-evidence/${id}/${hash(bytes)}`;
  send.mockResolvedValueOnce({ ContentLength: 6, Body: Readable.from([bytes]) });
  expect(Buffer.from(await store.read(key, 6, hash(bytes))).toString()).toBe("actual");
  send.mockResolvedValueOnce({ ContentLength: 6, Body: Readable.from([Buffer.from("tamper")]) });
  await expect(store.read(key, 6, hash(bytes))).rejects.toThrow("REPORT_EVIDENCE_INVALID");
  send.mockResolvedValueOnce({ ContentLength: 6, Body: Readable.from([Buffer.alloc(7)]) });
  await expect(store.read(key, 6, hash(bytes))).rejects.toThrow("REPORT_EVIDENCE_INVALID");
});
it("reconciles a lost write by exact readback and refuses different immutable bytes", async () => {
  const store = new S3DiagnosticObjects(config()); const bytes = Buffer.from("actual"); const key = `diagnostic-evidence/${id}/${hash(bytes)}`;
  const exists = Object.assign(new Error("exists"), { $metadata: { httpStatusCode: 412 } });
  send.mockRejectedValueOnce(exists).mockResolvedValueOnce({ ContentLength: 6, Body: Readable.from([bytes]) });
  await expect(store.put(key, bytes, "image/webp")).resolves.toBeUndefined();
  send.mockRejectedValueOnce(exists).mockResolvedValueOnce({ ContentLength: 6, Body: Readable.from([Buffer.from("tamper")]) });
  await expect(store.put(key, bytes, "image/webp")).rejects.toThrow("REPORT_EVIDENCE_INVALID");
});
it("refuses public bootstrap buckets and broad object locators", async () => {
  expect(() => new S3DiagnosticObjects(config("listing-photos"))).toThrow("dedicated private bucket");
  await expect(new S3DiagnosticObjects(config()).remove("diagnostic-evidence/")).rejects.toThrow("REPORT_EVIDENCE_INVALID");
});
