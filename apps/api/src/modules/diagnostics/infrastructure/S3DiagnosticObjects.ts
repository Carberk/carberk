import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { Inject, Injectable, type OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import sharp from "sharp";
import type { DiagnosticObjects } from "../domain/ports/DiagnosticObjects";
import { DiagnosticRuleError } from "../domain/InspectionOrder";

const invalid = () => new DiagnosticRuleError("REPORT_EVIDENCE_INVALID");
const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
/** Exact immutable objects in a dedicated private bucket. No signed or public URLs. */
@Injectable()
export class S3DiagnosticObjects implements DiagnosticObjects, OnModuleDestroy {
  private readonly client: S3Client;
  private readonly bucket: string;
  constructor(@Inject(ConfigService) config: ConfigService) {
    this.bucket = config.get<string>("DIAGNOSTIC_PRIVATE_BUCKET", "diagnostic-private");
    if (!["diagnostic-private", "diagnostic-test-private"].includes(this.bucket)) throw new Error("Diagnostic storage requires a dedicated private bucket");
    this.client = new S3Client({ endpoint: config.get<string>("MINIO_ENDPOINT", "http://localhost:9000"), region: config.get<string>("MINIO_REGION", "us-east-1"), forcePathStyle: true,
      credentials: { accessKeyId: config.get<string>("MINIO_ACCESS_KEY", "minioadmin"), secretAccessKey: config.get<string>("MINIO_SECRET_KEY", "minioadmin") } });
  }
  onModuleDestroy(): void { this.client.destroy(); }
  async sanitize(bytes: Uint8Array, mime: string): Promise<{ bytes: Uint8Array; mime: "image/webp" }> {
    if (!bytes.byteLength || bytes.byteLength > 10 * 1024 * 1024) throw invalid();
    const formats: Record<string, string> = { "image/jpeg": "jpeg", "image/png": "png", "image/webp": "webp" };
    if (!formats[mime]) throw invalid();
    try {
      const image = sharp(bytes, { failOn: "warning", limitInputPixels: 25_000_000, animated: false });
      const metadata = await image.metadata();
      if (metadata.format !== formats[mime] || (metadata.pages ?? 1) !== 1) throw invalid();
      // A fresh WebP encoding strips EXIF/GPS/XMP and embedded comments by default.
      const output = await image.rotate().webp({ quality: 90 }).toBuffer();
      if (!output.byteLength || output.byteLength > 10 * 1024 * 1024) throw invalid();
      return { bytes: output, mime: "image/webp" };
    } catch { throw invalid(); }
  }
  private key(key: string): void {
    if (!/^diagnostic-evidence\/[a-f0-9-]{36}\/[a-f0-9]{64}$/.test(key) && !/^diagnostic-pdf\/[a-f0-9-]{36}\/[a-f0-9-]{36}\.pdf$/.test(key)) throw invalid();
  }
  async put(key: string, bytes: Uint8Array, mime: string): Promise<void> {
    this.key(key);
    if (!bytes.byteLength || bytes.byteLength > 20 * 1024 * 1024 || !["image/webp", "application/pdf"].includes(mime)) throw invalid();
    try {
      await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: bytes, ContentLength: bytes.byteLength, ContentType: mime, IfNoneMatch: "*", CacheControl: "no-store, private", ContentDisposition: "attachment" }), { abortSignal: AbortSignal.timeout(15_000) });
    } catch (error) {
      if ((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode !== 412) throw error;
      // A lost conditional-write reply can be recovered only by exact byte readback.
      await this.read(key, bytes.byteLength, sha(bytes));
    }
  }
  async read(key: string, sizeBytes: number, sha256: string): Promise<Uint8Array> {
    this.key(key);
    if (!Number.isSafeInteger(sizeBytes) || sizeBytes <= 0 || sizeBytes > 20 * 1024 * 1024 || !/^[a-f0-9]{64}$/.test(sha256)) throw invalid();
    const object = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }), { abortSignal: AbortSignal.timeout(15_000) });
    try {
      if (!object.Body || object.ContentLength !== sizeBytes) throw invalid();
      const chunks: Uint8Array[] = []; let length = 0;
      for await (const chunk of object.Body as AsyncIterable<Uint8Array>) {
        length += chunk.byteLength;
        if (length > sizeBytes) throw invalid();
        chunks.push(chunk);
      }
      const bytes = Buffer.concat(chunks);
      if (length !== sizeBytes || sha(bytes) !== sha256) throw invalid();
      return bytes;
    } finally { if (object.Body instanceof Readable) object.Body.destroy(); }
  }
  async remove(key: string): Promise<void> {
    this.key(key);
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }), { abortSignal: AbortSignal.timeout(15_000) });
  }
}
