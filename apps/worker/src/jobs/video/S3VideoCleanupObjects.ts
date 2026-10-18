import type { S3Client } from "@aws-sdk/client-s3";
import type { VideoCleanupLease, VideoCleanupObjects } from "./VideoCleanupPorts";
export class S3VideoCleanupObjects implements VideoCleanupObjects {
  constructor(_client: S3Client, _bucket: string) {}
  async removeAndVerify(_work: VideoCleanupLease): Promise<void> { throw new Error("VIDEO_CLEANUP_NOT_IMPLEMENTED"); }
}
