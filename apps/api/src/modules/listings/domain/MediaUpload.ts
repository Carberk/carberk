import type { MediaKind } from "./types";

/**
 * Server-recorded provenance of a presigned upload (ADR-0079). Presign creates
 * one for the calling User; a ListingMedia row adopts it at most once. A storage
 * key with no MediaUpload authorizes nothing.
 */
export interface MediaUpload {
  id: string;
  userId: string;
  key: string;
  kind: MediaKind;
  contentType: string;
  /** Null only for uploads backfilled from media that predates the record. */
  sizeBytes: number | null;
  createdAt: Date;
  /** True once a ListingMedia row has adopted this upload. */
  adopted: boolean;
}

export type NewMediaUpload = Omit<MediaUpload, "adopted">;

export const UPLOAD_CAPS: Record<
  MediaKind,
  { maxSizeBytes: number; allowedTypes: readonly string[] }
> = {
  image: {
    maxSizeBytes: 5 * 1024 * 1024, // 5 MB
    allowedTypes: ["image/jpeg", "image/webp"],
  },
  video: {
    maxSizeBytes: 10 * 1024 * 1024, // 10 MB
    allowedTypes: ["video/mp4"],
  },
};

/** The object a presigned upload wrote, as storage reports it. */
export interface StoredObjectInfo {
  contentType: string | null;
  sizeBytes: number;
}

/**
 * Whether the stored object matches what presign recorded: the declared content
 * type, and a non-empty size within the kind's cap.
 */
export function storedObjectMatches(
  upload: Pick<MediaUpload, "kind" | "contentType">,
  object: StoredObjectInfo,
): boolean {
  if (object.contentType !== upload.contentType) return false;
  return object.sizeBytes > 0 && object.sizeBytes <= UPLOAD_CAPS[upload.kind].maxSizeBytes;
}
