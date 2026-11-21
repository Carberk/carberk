import { createHash } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import sharp from "sharp";
import { HistoryPaymentProofSchemas as P } from "@auto-tm/contracts";
import type { Env } from "../../../env.schema";
import type { HistoryPrivateFile, HistoryPrivateStorage } from "../domain/HistoryPrivateFile";
import { HistoryRequestError } from "../domain/HistoryRequestError";

export const HISTORY_PRIVATE_BUCKET = "vehicle-history-private";
const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

@Injectable()
export class MinioHistoryPrivateStorage implements HistoryPrivateStorage {
  private readonly s3: S3Client;
  constructor(@Inject(ConfigService) config: ConfigService<Env, true>) {
    this.s3 = new S3Client({ endpoint: config.get("MINIO_ENDPOINT", { infer: true }), region: config.get("MINIO_REGION", { infer: true }),
      forcePathStyle: true, maxAttempts: 1, credentials: { accessKeyId: config.get("MINIO_ACCESS_KEY", { infer: true }), secretAccessKey: config.get("MINIO_SECRET_KEY", { infer: true }) } });
  }
  private target(file: HistoryPrivateFile) {
    if (file.purpose !== "payment_evidence" || file.policy !== "synthetic_payment_evidence_only"
      || !/^[0-9a-f-]{36}$/i.test(file.requestId) || !/^[0-9a-f-]{36}$/i.test(file.id)) throw new HistoryRequestError("HISTORY_PROOF_DENIED");
    return { Bucket: HISTORY_PRIVATE_BUCKET, Key: `payment-evidence/${file.requestId}/${file.id}` };
  }
  async put(file: HistoryPrivateFile, bytes: Uint8Array) {
    if (bytes.length !== file.sizeBytes || bytes.length < 1 || bytes.length > P.MAX_PAYMENT_PROOF_BYTES) throw new HistoryRequestError("HISTORY_PROOF_INVALID");
    try {
      const image = sharp(bytes, { limitInputPixels: 20_000_000, animated: true });
      const metadata = await image.metadata();
      const types = { jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };
      if (types[metadata.format as keyof typeof types] !== file.contentType || (metadata.pages ?? 1) !== 1) throw new Error("Unsupported receipt");
      await image.raw().toBuffer();
    } catch { throw new HistoryRequestError("HISTORY_PROOF_INVALID"); }
    const hash = digest(bytes);
    if (file.sha256 && file.sha256 !== hash) throw new HistoryRequestError("HISTORY_PROOF_CONFLICT");
    try {
      await this.s3.send(new PutObjectCommand({ ...this.target(file), Body: bytes, ContentType: file.contentType, ContentLength: bytes.length,
        CacheControl: "private, no-store", ContentDisposition: "attachment", IfNoneMatch: "*" }), { abortSignal: AbortSignal.timeout(10_000) });
    } catch (error) {
      if ((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode !== 412) throw error;
      if (digest(await this.read({ ...file, sha256: hash })) !== hash) throw new HistoryRequestError("HISTORY_PROOF_CONFLICT");
    }
    return hash;
  }
  async read(file: HistoryPrivateFile) {
    const response = await this.s3.send(new GetObjectCommand(this.target(file)), { abortSignal: AbortSignal.timeout(10_000) });
    if (!response.Body || response.ContentLength !== file.sizeBytes || response.ContentType !== file.contentType || file.sizeBytes > P.MAX_PAYMENT_PROOF_BYTES) {
      if (response.Body && "destroy" in response.Body) response.Body.destroy(); throw new HistoryRequestError("HISTORY_PROOF_UNAVAILABLE");
    }
    const bytes = await response.Body.transformToByteArray();
    if (bytes.length !== file.sizeBytes || !file.sha256 || digest(bytes) !== file.sha256) throw new HistoryRequestError("HISTORY_PROOF_CONFLICT");
    return bytes;
  }
  async delete(file: HistoryPrivateFile) {
    await this.s3.send(new DeleteObjectCommand(this.target(file)), { abortSignal: AbortSignal.timeout(10_000) });
  }
  onModuleDestroy() { this.s3.destroy(); }
}
