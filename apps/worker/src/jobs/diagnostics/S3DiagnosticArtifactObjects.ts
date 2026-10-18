import { createHash } from "node:crypto";
import { Readable } from "node:stream";

import { GetObjectCommand, PutObjectCommand, type S3Client } from "@aws-sdk/client-s3";

import { S3RetiredObjectStore } from "../S3RetiredObjectStore";

import type { DiagnosticArtifactObjects } from "./DiagnosticArtifactWorker";

const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const timeout = () => ({ abortSignal: AbortSignal.timeout(15_000) });

/** Dedicated private storage with bounded exact readback and physical deletion. */
export class S3DiagnosticArtifactObjects implements DiagnosticArtifactObjects {
  constructor(private readonly s3: S3Client, private readonly bucket: string) {
    if (!["diagnostic-private", "diagnostic-test-private"].includes(bucket)) throw new Error("Diagnostic storage requires a dedicated private bucket");
  }
  private key(key: string): void {
    if (!/^diagnostic-evidence\/[a-f0-9-]{36}\/[a-f0-9]{64}$/.test(key) && !/^diagnostic-pdf\/[a-f0-9-]{36}\/[a-f0-9-]{36}\.pdf$/.test(key)) throw new Error("DIAGNOSTIC_OBJECT_INVALID");
  }
  async put(key: string, bytes: Uint8Array, mime: "application/pdf"): Promise<void> {
    this.key(key);
    if (!key.startsWith("diagnostic-pdf/") || mime !== "application/pdf" || !bytes.byteLength || bytes.byteLength > 20 * 1024 * 1024) throw new Error("DIAGNOSTIC_OBJECT_INVALID");
    try {
      await this.s3.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: bytes, ContentType: mime, ContentLength: bytes.byteLength, IfNoneMatch: "*", CacheControl: "no-store, private", ContentDisposition: "attachment" }), timeout());
    } catch (error) {
      if ((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode !== 412) throw error;
      await this.read(key, bytes.byteLength, digest(bytes));
    }
  }
  async read(key: string, size: number, sha256: string): Promise<Uint8Array> {
    this.key(key);
    if (!Number.isSafeInteger(size) || size < 1 || size > 20 * 1024 * 1024 || !/^[a-f0-9]{64}$/.test(sha256)) throw new Error("DIAGNOSTIC_OBJECT_INVALID");
    const object = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }), timeout());
    try {
      if (object.ContentLength !== size || !object.Body) throw new Error("DIAGNOSTIC_OBJECT_INVALID");
      const chunks: Uint8Array[] = []; let length = 0;
      for await (const chunk of object.Body as AsyncIterable<Uint8Array>) {
        length += chunk.byteLength;
        if (length > size) throw new Error("DIAGNOSTIC_OBJECT_INVALID");
        chunks.push(chunk);
      }
      const bytes = Buffer.concat(chunks);
      if (length !== size || digest(bytes) !== sha256) throw new Error("DIAGNOSTIC_OBJECT_INVALID");
      return bytes;
    } finally { if (object.Body instanceof Readable) object.Body.destroy(); }
  }
  async deleteAndVerify(keys: string[]): Promise<void> {
    keys.forEach(key => this.key(key));
    await new S3RetiredObjectStore(this.s3, this.bucket).deleteAndVerify(keys);
  }
  onModuleDestroy(): void { this.s3.destroy(); }
}
