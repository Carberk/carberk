import {
  DeleteObjectCommand,
  GetBucketVersioningCommand,
  HeadObjectCommand,
  type S3Client,
} from "@aws-sdk/client-s3";

import type { RetiredObjectStore } from "./retiredUploadCleanup";

/** The bucket conditional image uploads live in; the API writes them there. */
export const RETIRED_UPLOAD_BUCKET = "listing-photos";

const REQUEST_TIMEOUT_MS = 10_000;
const timeout = () => ({ abortSignal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });

/**
 * Deletes retired objects and proves the bytes are gone (ADR-0088). On a
 * versioned or suspended bucket a delete only adds a marker and keeps the
 * bytes, so it deletes nothing unless versioning is off, and it fails when the
 * state cannot be read. Success means every key answered HEAD with "not found".
 */
export class S3RetiredObjectStore implements RetiredObjectStore {
  constructor(
    private readonly s3: Pick<S3Client, "send">,
    private readonly bucket = RETIRED_UPLOAD_BUCKET,
  ) {}

  async deleteAndVerify(keys: string[]): Promise<void> {
    const versioning = await this.s3.send(new GetBucketVersioningCommand({ Bucket: this.bucket }), timeout());
    if (versioning.Status !== undefined) {
      throw new Error(`Bucket versioning is ${versioning.Status}; a delete would keep the bytes as a version`);
    }
    for (const Key of keys) {
      const removed = await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key }), timeout());
      if (removed.DeleteMarker || removed.VersionId) {
        throw new Error(`Storage answered the delete of ${Key} with a version marker`);
      }
    }
    for (const Key of keys) {
      try {
        await this.s3.send(new HeadObjectCommand({ Bucket: this.bucket, Key }), timeout());
      } catch (error) {
        const failure = error as { name?: string; $metadata?: { httpStatusCode?: number } };
        if (failure.name === "NotFound" || failure.$metadata?.httpStatusCode === 404) continue;
        throw error;
      }
      throw new Error(`Object still present after delete: ${Key}`);
    }
  }
}
