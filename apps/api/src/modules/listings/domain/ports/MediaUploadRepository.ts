import type { MediaUpload, NewMediaUpload } from "../MediaUpload";

export interface MediaUploadRepository {
  /** Records the provenance of a freshly presigned upload. */
  record(upload: NewMediaUpload): Promise<void>;
  /** Uploads recorded for these keys; unknown keys are simply absent. */
  findByKeys(keys: string[]): Promise<MediaUpload[]>;
}

export const MEDIA_UPLOAD_REPOSITORY = Symbol("MediaUploadRepository");
