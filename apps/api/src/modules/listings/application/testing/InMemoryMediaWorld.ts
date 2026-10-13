import { randomUUID } from "node:crypto";

import { ListingMedia } from "../../domain/ListingMedia";
import type {
  NewMediaUpload,
  StoredObjectInfo,
  UploadState,
} from "../../domain/MediaUpload";
import { DomainError, LISTING_ERROR_CODES } from "../../domain/types";
import type { ListingMediaRepository } from "../../domain/ports/ListingMediaRepository";
import type { MediaObjectInspector } from "../../domain/ports/MediaObjectInspector";
import type { MediaStoragePort } from "../../domain/ports/MediaStoragePort";
import type { MediaUploadRepository } from "../../domain/ports/MediaUploadRepository";
import type { ProfilePhotoLinkPort } from "../../domain/ports/ProfilePhotoLinkPort";
import type {
  UploadClaimPort,
  UploadClaimTarget,
} from "../../domain/ports/UploadClaimPort";

/** Lets concurrent callers interleave the way separate requests would. */
const yieldToOtherCallers = () => new Promise<void>((resolve) => setImmediate(resolve));

interface ClaimRecord {
  state: UploadState;
  token?: string;
  target?: UploadClaimTarget;
}

const notAvailable = () =>
  new DomainError(LISTING_ERROR_CODES.UPLOAD_NOT_AVAILABLE, "Upload is no longer available");
const alreadyAttached = () =>
  new DomainError(LISTING_ERROR_CODES.UPLOAD_ALREADY_ATTACHED, "Upload is already attached");
const sameTarget = (a: UploadClaimTarget | undefined, b: UploadClaimTarget) =>
  a?.type === b.type && a.id === b.id;

/**
 * One consistent in-memory stand-in for the upload tables and object storage,
 * enforcing what the schema and the common claim (ADR-0088) do: an upload has at
 * most one adopter across Listing media and Profile Photos, a retired upload is
 * never adoptable again, and retirement records deletion work instead of
 * deleting. Tests share it across use cases so two Users and two Listings see
 * one world.
 */
export class InMemoryMediaWorld {
  uploads: NewMediaUpload[] = [];
  media: ListingMedia[] = [];
  /** Objects currently in storage, by key. */
  objects = new Map<string, StoredObjectInfo>();
  deletedKeys: string[] = [];
  /** Upload ids with recorded deletion work, in retirement order. */
  cleanups: string[] = [];
  private claimRecords = new Map<string, ClaimRecord>();

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

  /** The claim record of an upload; a row pushed without one is AVAILABLE. */
  claimOf(uploadId: string): ClaimRecord {
    let record = this.claimRecords.get(uploadId);
    if (!record) {
      // A media row seeded directly with an upload stands for a backfilled adopter.
      const adopter = this.media.find((m) => m.uploadId === uploadId);
      record = adopter
        ? { state: "ADOPTED", target: { type: "listing", id: adopter.listingId } }
        : { state: "AVAILABLE" };
      this.claimRecords.set(uploadId, record);
    }
    return record;
  }

  stateOfKey(key: string): UploadState | undefined {
    const upload = this.uploads.find((u) => u.key === key);
    return upload ? this.claimOf(upload.id).state : undefined;
  }

  private retireRecord(uploadId: string): boolean {
    const record = this.claimOf(uploadId);
    if (record.state === "RETIRED" || record.state === "DELETED") return false;
    this.claimRecords.set(uploadId, { state: "RETIRED" });
    this.cleanups.push(uploadId);
    return true;
  }

  readonly claims: UploadClaimPort = {
    reserve: async ({ userId, uploadIds, target }) => {
      await yieldToOtherCallers();
      const records = uploadIds.map((id) => {
        if (this.uploads.find((u) => u.id === id)?.userId !== userId) throw notAvailable();
        return this.claimOf(id);
      });
      if (records.some((r) => r.state === "RETIRED" || r.state === "DELETED")) throw notAvailable();
      if (records.every((r) => r.state === "ADOPTED" && sameTarget(r.target, target))) {
        return { alreadyAdopted: true };
      }
      const joined = records[0]?.token;
      if (joined && records.every((r) => r.state === "PREPARING" && r.token === joined && sameTarget(r.target, target))) {
        return { token: joined, joined: true };
      }
      if (records.some((r) => r.state !== "AVAILABLE")) throw alreadyAttached();
      const token = randomUUID();
      for (const id of uploadIds) this.claimRecords.set(id, { state: "PREPARING", token, target });
      return { token, joined: false };
    },
    finalize: async (_tx, { token, uploadIds, target, referencedUploadIds }) => {
      for (const id of referencedUploadIds ?? []) {
        const { state } = this.claimOf(id);
        if (state === "RETIRED" || state === "DELETED") throw notAvailable();
      }
      const records = uploadIds.map((id) => this.claimOf(id));
      if (records.every((r) => r.state === "ADOPTED" && sameTarget(r.target, target))) return "already";
      for (const record of records) {
        if (record.state === "RETIRED" || record.state === "DELETED") throw notAvailable();
        if (record.state !== "PREPARING" || record.token !== token || !sameTarget(record.target, target)) {
          throw alreadyAttached();
        }
      }
      for (const id of uploadIds) this.claimRecords.set(id, { state: "ADOPTED", target });
      return "adopted";
    },
    retire: async (_tx, uploadId) => this.retireRecord(uploadId),
    abandon: async (token) => {
      for (const [id, record] of this.claimRecords) {
        if (record.state === "PREPARING" && record.token === token) this.retireRecord(id);
      }
    },
    release: async (token) => {
      for (const [id, record] of this.claimRecords) {
        if (record.state === "PREPARING" && record.token === token) {
          this.claimRecords.set(id, { state: "AVAILABLE" });
        }
      }
    },
    settle: async (token, retiredUploadId) => {
      const record = this.claimOf(retiredUploadId);
      if (record.state !== "PREPARING" || record.token !== token) return false;
      this.retireRecord(retiredUploadId);
      for (const [id, held] of this.claimRecords) {
        if (id !== retiredUploadId && held.state === "PREPARING" && held.token === token) {
          this.claimRecords.set(id, { state: "AVAILABLE" });
        }
      }
      return true;
    },
    retireUnclaimed: async (uploadId, userId, stillInvalid) => {
      const referenced = () => this.media.some((m) => m.uploadId === uploadId) ||
        [...this.profilePhotos.values()].some((photo) => photo.uploadId === uploadId);
      if (this.uploads.find((upload) => upload.id === uploadId)?.userId !== userId ||
        this.claimOf(uploadId).state !== "AVAILABLE" || referenced() || !(await stillInvalid())) return false;
      // The fake has no database lock: recheck after the asynchronous storage read.
      if (this.claimOf(uploadId).state !== "AVAILABLE" || referenced()) return false;
      return this.retireRecord(uploadId);
    },
  };

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
        .map((u) => {
          const { state } = this.claimOf(u.id);
          return { ...u, state, adopted: state === "ADOPTED" || this.media.some((m) => m.uploadId === u.id) };
        }),
  };

  readonly mediaRepo: ListingMediaRepository = {
    save: async (media, claim) => {
      await yieldToOtherCallers();
      if (media.uploadId) {
        if (!this.uploads.some((u) => u.id === media.uploadId)) throw notAvailable();
        if (!claim) throw new Error("An adopting media row needs its reservation");
        const outcome = await this.claims.finalize(null, {
          token: claim.token,
          uploadIds: [media.uploadId],
          target: { type: "listing", id: media.listingId },
          ...(claim.posterUploadId ? { referencedUploadIds: [claim.posterUploadId] } : {}),
        });
        const existing = this.media.find((m) => m.uploadId === media.uploadId);
        if (outcome === "already" && existing) return existing;
        if (existing) throw alreadyAttached();
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
      if (!row) return { removed: false };
      this.media = this.media.filter((m) => m.id !== id);
      const uploadId = row.uploadId;
      if (uploadId && this.uploads.some((u) => u.id === uploadId && u.key === row.key)) {
        this.retireRecord(uploadId);
      }
      return { removed: true };
    },
    updateSortOrder: async () => {},
  };

  /** The Profile Photo link of each User, as `users.avatarUploadId` and `avatarKey` hold it. */
  profilePhotos = new Map<string, { uploadId: string; key: string }>();
  /** Users the link refuses when it rechecks them, such as one suspended meanwhile. */
  ineligibleUsers = new Set<string>();
  /** Every `tx` handed to `unbind`, so a test can see the caller's transaction arrive. */
  unbindTransactions: unknown[] = [];

  readonly photoLink: ProfilePhotoLinkPort = {
    bind: async ({ userId, uploadId, key, token }) => {
      await yieldToOtherCallers();
      if (this.ineligibleUsers.has(userId)) throw new Error("User may not change their profile");
      const outcome = await this.claims.finalize(null, {
        token,
        uploadIds: [uploadId],
        target: { type: "profile", id: userId },
      });
      if (outcome === "already") return;
      const previous = this.profilePhotos.get(userId);
      if (previous && previous.uploadId !== uploadId) this.retireRecord(previous.uploadId);
      this.profilePhotos.set(userId, { uploadId, key });
    },
    unbind: async (userId, tx) => {
      this.unbindTransactions.push(tx);
      const current = this.profilePhotos.get(userId);
      if (!current) return null;
      this.retireRecord(current.uploadId);
      this.profilePhotos.delete(userId);
      return current.key;
    },
  };

  /** Seeds what a legitimate presign, PUT and attach leave behind. */
  seedAdoptedMedia(input: {
    userId: string;
    listingId: string;
    mediaId: string;
    key: string;
    uploadId?: string;
    kind?: "image" | "video";
  }): void {
    const uploadId = input.uploadId ?? `upload-${input.mediaId}`;
    const kind = input.kind ?? "image";
    const contentType = kind === "image" ? "image/webp" : "video/mp4";
    this.uploads.push({
      id: uploadId,
      userId: input.userId,
      key: input.key,
      kind,
      contentType,
      sizeBytes: 1024,
      createdAt: new Date("2026-05-01T00:00:00Z"),
    });
    this.putObject(input.key, { contentType, sizeBytes: 1024 });
    this.media.push(
      ListingMedia.create({
        id: input.mediaId,
        listingId: input.listingId,
        kind,
        key: input.key,
        sortOrder: 0,
        uploadId,
      }),
    );
    this.claimRecords.set(uploadId, {
      state: "ADOPTED",
      target: { type: "listing", id: input.listingId },
    });
  }
}
