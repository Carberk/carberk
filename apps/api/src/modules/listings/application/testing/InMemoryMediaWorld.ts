import { ListingMedia } from "../../domain/ListingMedia";
import type {
  MediaUpload,
  NewMediaUpload,
  StoredObjectInfo,
} from "../../domain/MediaUpload";
import { DomainError, LISTING_ERROR_CODES } from "../../domain/types";
import type { ListingMediaRepository } from "../../domain/ports/ListingMediaRepository";
import type { MediaObjectInspector } from "../../domain/ports/MediaObjectInspector";
import type { MediaStoragePort } from "../../domain/ports/MediaStoragePort";
import type { MediaUploadRepository } from "../../domain/ports/MediaUploadRepository";

/** Lets concurrent callers interleave the way separate requests would. */
const yieldToOtherCallers = () => new Promise<void>((resolve) => setImmediate(resolve));

/**
 * One consistent in-memory stand-in for the upload tables and object storage,
 * enforcing what the schema does: an upload is adopted by at most one media row,
 * a media row's upload must exist, and a row and its upload are released together.
 * Tests share it across use cases so two Users and two Listings see one world.
 */
export class InMemoryMediaWorld {
  uploads: Array<Omit<MediaUpload, "adopted">> = [];
  media: ListingMedia[] = [];
  /** Objects currently in storage, by key. */
  objects = new Map<string, StoredObjectInfo>();
  deletedKeys: string[] = [];

  /** Simulates the client's direct PUT to the presigned URL. */
  putObject(key: string, info: StoredObjectInfo): void {
    this.objects.set(key, info);
  }

  /** Puts an object that matches what the recorded upload declared. */
  completeUpload(key: string): void {
    const upload = this.uploads.find((u) => u.key === key);
    if (!upload) throw new Error(`No upload recorded for ${key}`);
    this.putObject(key, { contentType: upload.contentType, sizeBytes: upload.sizeBytes ?? 1024 });
  }

  readonly storage: MediaStoragePort = {
    presignUpload: async ({ key }) => ({ url: `https://media.test/${key}`, key }),
    resolvePublicUrl: (key) => `https://media.test/${key}`,
    deleteObject: async (key) => {
      this.deletedKeys.push(key);
      this.objects.delete(key);
    },
  };

  readonly inspector: MediaObjectInspector = {
    inspect: async (key) => this.objects.get(key) ?? null,
  };

  readonly uploadRepo: MediaUploadRepository = {
    record: async (upload: NewMediaUpload) => {
      this.uploads.push({ ...upload });
    },
    findByKeys: async (keys) =>
      this.uploads
        .filter((u) => keys.includes(u.key))
        .map((u) => ({ ...u, adopted: this.media.some((m) => m.uploadId === u.id) })),
  };

  readonly mediaRepo: ListingMediaRepository = {
    save: async (media) => {
      await yieldToOtherCallers();
      if (media.uploadId) {
        if (!this.uploads.some((u) => u.id === media.uploadId)) {
          throw new DomainError(
            LISTING_ERROR_CODES.UPLOAD_NOT_AVAILABLE,
            "Upload is no longer available",
          );
        }
        if (this.media.some((m) => m.uploadId === media.uploadId)) {
          throw new DomainError(
            LISTING_ERROR_CODES.UPLOAD_ALREADY_ATTACHED,
            "Upload is already attached to a Listing",
          );
        }
      }
      this.media.push(media);
      return media;
    },
    findById: async (id) => this.media.find((m) => m.id === id) ?? null,
    findByListingId: async (listingId) => this.media.filter((m) => m.listingId === listingId),
    delete: async (id) => {
      this.media = this.media.filter((m) => m.id !== id);
    },
    deleteReleasingUpload: async (id) => {
      await yieldToOtherCallers();
      const row = this.media.find((m) => m.id === id);
      if (!row) return { removed: false, ownedKey: null };
      this.media = this.media.filter((m) => m.id !== id);
      if (!row.uploadId) return { removed: true, ownedKey: null };
      const stillReferenced = this.media.some((m) => m.key === row.key);
      this.uploads = this.uploads.filter((u) => u.id !== row.uploadId);
      return { removed: true, ownedKey: stillReferenced ? null : row.key };
    },
    updateSortOrder: async () => {},
  };

  /** Seeds what a legitimate presign, PUT and attach leave behind. */
  seedAdoptedMedia(input: {
    userId: string;
    listingId: string;
    mediaId: string;
    key: string;
    uploadId?: string;
  }): void {
    const uploadId = input.uploadId ?? `upload-${input.mediaId}`;
    this.uploads.push({
      id: uploadId,
      userId: input.userId,
      key: input.key,
      kind: "image",
      contentType: "image/jpeg",
      sizeBytes: 1024,
      createdAt: new Date("2026-05-01T00:00:00Z"),
    });
    this.putObject(input.key, { contentType: "image/jpeg", sizeBytes: 1024 });
    this.media.push(
      ListingMedia.create({
        id: input.mediaId,
        listingId: input.listingId,
        kind: "image",
        key: input.key,
        sortOrder: 0,
        uploadId,
      }),
    );
  }
}
