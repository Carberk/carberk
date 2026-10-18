import { AbortMultipartUploadCommand, DeleteObjectsCommand, GetBucketVersioningCommand, HeadObjectCommand, ListMultipartUploadsCommand } from "@aws-sdk/client-s3";
/** Storage boundary fake preserves surviving bytes and abandoned multipart authority. */
export class InMemoryS3VideoCleanup {
  readonly objects = new Set<string>();
  readonly multipart = new Map<string, string>();
  versioning: "Enabled" | "Suspended" | undefined;
  holdDeletes = false;
  holdAborts = false;
  failHeads = false;
  truncated = false;
  async send(command: unknown) {
    if (command instanceof GetBucketVersioningCommand) return this.versioning ? { Status: this.versioning } : {};
    if (command instanceof ListMultipartUploadsCommand) return { IsTruncated: this.truncated, Uploads: [...this.multipart].filter(([, key]) => key.startsWith(command.input.Prefix ?? "")).map(([UploadId, Key]) => ({ UploadId, Key })) };
    if (command instanceof AbortMultipartUploadCommand) { if (!this.holdAborts) this.multipart.delete(command.input.UploadId ?? ""); return {}; }
    if (command instanceof DeleteObjectsCommand) { if (!this.holdDeletes) for (const row of command.input.Delete?.Objects ?? []) this.objects.delete(row.Key ?? ""); return {}; }
    if (command instanceof HeadObjectCommand) {
      if (this.failHeads) throw Object.assign(new Error("Unavailable"), { $metadata: { httpStatusCode: 503 } });
      if (this.objects.has(command.input.Key ?? "")) return { ContentLength: 1 };
      throw Object.assign(new Error("NotFound"), { $metadata: { httpStatusCode: 404 } });
    }
    throw new Error("Unexpected storage command");
  }
}
