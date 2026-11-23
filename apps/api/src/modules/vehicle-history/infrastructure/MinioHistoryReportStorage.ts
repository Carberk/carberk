import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { Env } from "../../../env.schema";
import { historyReportDigest, type HistoryReportPdfArtifact, type HistoryReportStorage } from "../domain/HistoryReportArtifact";
import { HistoryRequestError } from "../domain/HistoryRequestError";
import { HISTORY_PRIVATE_BUCKET } from "./MinioHistoryPrivateStorage";

const key = (requestId: string, id: string) => ({ Bucket: HISTORY_PRIVATE_BUCKET, Key: `report-artifacts/${requestId}/${id}` });
const contentType = "application/pdf";

@Injectable()
export class MinioHistoryReportStorage implements HistoryReportStorage {
  private readonly s3: S3Client;
  constructor(@Inject(ConfigService) config: ConfigService<Env, true>) {
    this.s3 = new S3Client({ endpoint: config.get("MINIO_ENDPOINT", { infer: true }), region: config.get("MINIO_REGION", { infer: true }),
      forcePathStyle: true, maxAttempts: 1, credentials: { accessKeyId: config.get("MINIO_ACCESS_KEY", { infer: true }), secretAccessKey: config.get("MINIO_SECRET_KEY", { infer: true }) } });
  }
  async put(requestId: string, artifact: HistoryReportPdfArtifact, sha256: string, bytes: Buffer) {
    try {
      await this.s3.send(new PutObjectCommand({ ...key(requestId, artifact.id), Body: bytes, ContentType: contentType,
        ContentLength: bytes.length, CacheControl: "private, no-store", ContentDisposition: "attachment", IfNoneMatch: "*" }),
      { abortSignal: AbortSignal.timeout(10_000) });
    } catch (error) {
      if ((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode !== 412) throw error;
      await this.read(requestId, artifact, sha256);
    }
  }

  async read(requestId: string, artifact: HistoryReportPdfArtifact, sha256: string) {
    const response = await this.s3.send(new GetObjectCommand(key(requestId, artifact.id)), { abortSignal: AbortSignal.timeout(10_000) });
    const { sizeBytes } = artifact.pdf;
    if (!response.Body || response.ContentLength !== sizeBytes || response.ContentType !== contentType) {
      if (response.Body && "destroy" in response.Body) response.Body.destroy();
      throw new HistoryRequestError("HISTORY_REPORT_UNAVAILABLE");
    }
    const bytes = await response.Body.transformToByteArray();
    if (bytes.length !== sizeBytes || historyReportDigest(bytes) !== sha256) throw new HistoryRequestError("HISTORY_REPORT_UNAVAILABLE");
    return Buffer.from(bytes);
  }
  onModuleDestroy() { this.s3.destroy(); }
}
