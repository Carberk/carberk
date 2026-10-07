import type { S3Client } from "@aws-sdk/client-s3";

import type { RetiredObjectStore } from "./retiredUploadCleanup";

/** The bucket conditional image uploads live in; the API writes them there. */
export const RETIRED_UPLOAD_BUCKET = "listing-photos";

/** Scaffold for #721: storage deletion is not implemented yet. */
export class S3RetiredObjectStore implements RetiredObjectStore {
  constructor(
    private readonly s3: Pick<S3Client, "send">,
    private readonly bucket = RETIRED_UPLOAD_BUCKET,
  ) {}

  async deleteAndVerify(_keys: string[]): Promise<void> {}
}
