import { AbortMultipartUploadCommand, DeleteObjectsCommand, GetBucketVersioningCommand, HeadObjectCommand, ListMultipartUploadsCommand, type S3Client } from "@aws-sdk/client-s3";
import { z } from "zod";
import type { VideoCleanupLease, VideoCleanupObjects } from "./VideoCleanupPorts";
const timeout = () => ({ abortSignal: AbortSignal.timeout(10_000) });
/** Deletes only durable exact keys in the explicit private video bucket. */
export class S3VideoCleanupObjects implements VideoCleanupObjects {
  constructor(private readonly client: S3Client, private readonly bucket: string) {
    if (!bucket) throw new Error("VIDEO_PRIVATE_BUCKET_REQUIRED");
  }
  async removeAndVerify(work: VideoCleanupLease): Promise<void> {
    if (![work.uploadId, work.sessionId, work.generationId].every(id => z.string().uuid().safeParse(id).success) || work.sourceKey !== `video/v1/${work.uploadId}/${work.sessionId}/source.mp4` || work.objectKeys.length > 1024 || new Set(work.objectKeys).size !== work.objectKeys.length || work.objectKeys.some(key => !key.startsWith(`video/v1/${work.uploadId}/${work.generationId}/`) || !/^(?:master\.m3u8|poster\.jpg|(?:240|360|720)\/(?:index\.m3u8|seg-[0-9]+\.ts))$/.test(key.slice(`video/v1/${work.uploadId}/${work.generationId}/`.length)))) throw new Error("VIDEO_CLEANUP_INVENTORY_INVALID");
    const versioning = await this.client.send(new GetBucketVersioningCommand({ Bucket: this.bucket }), timeout());
    if (versioning.Status !== undefined) throw new Error("VIDEO_CLEANUP_VERSIONED_BUCKET");
    // Recover even an initialization whose response was lost before its ID
    // reached PostgreSQL. Prefix results are filtered to the exact source.
    const uploads = await this.multipart(work.sourceKey);
    for (const upload of uploads) {
      try { await this.client.send(new AbortMultipartUploadCommand({ Bucket: this.bucket, Key: work.sourceKey, UploadId: upload }), timeout()); }
      catch (error) { if (!this.absent(error)) throw error; }
    }
    if ((await this.multipart(work.sourceKey)).length) throw new Error("VIDEO_CLEANUP_MULTIPART_PRESENT");
    const keys = [work.sourceKey, ...work.objectKeys];
    for (let offset = 0; offset < keys.length; offset += 1000) {
      const result = await this.client.send(new DeleteObjectsCommand({ Bucket: this.bucket, Delete: { Objects: keys.slice(offset, offset + 1000).map(Key => ({ Key })), Quiet: false } }), timeout());
      if (result.Errors?.length || result.Deleted?.some(row => row.DeleteMarker || row.VersionId || row.DeleteMarkerVersionId)) throw new Error("VIDEO_CLEANUP_DELETE_FAILED");
    }
    // Bound total latency as well as request count. The durable lease is
    // twenty minutes; at most 1025 HEADs run in groups of twenty.
    for (let offset = 0; offset < keys.length; offset += 20) {
      await Promise.all(keys.slice(offset, offset + 20).map(async Key => {
        try { await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key }), timeout()); }
        catch (error) { if (this.absent(error)) return; throw error; }
        throw new Error("VIDEO_CLEANUP_OBJECT_PRESENT");
      }));
    }
    if ((await this.multipart(work.sourceKey)).length) throw new Error("VIDEO_CLEANUP_MULTIPART_PRESENT");
  }
  private async multipart(key: string) {
    const result = await this.client.send(new ListMultipartUploadsCommand({ Bucket: this.bucket, Prefix: key, MaxUploads: 1000 }), timeout());
    if (result.IsTruncated) throw new Error("VIDEO_CLEANUP_MULTIPART_LIMIT");
    const matches = (result.Uploads ?? []).filter(row => row.Key === key);
    if (matches.some(row => !row.UploadId)) throw new Error("VIDEO_CLEANUP_MULTIPART_INVALID");
    return matches.map(row => row.UploadId as string);
  }
  private absent(error: unknown) { return (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404; }
}
