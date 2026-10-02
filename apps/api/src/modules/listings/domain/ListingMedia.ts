import { DomainError, LISTING_ERROR_CODES } from "./types";
import type { MediaKind } from "./types";

export class ListingMedia {
  private constructor(
    readonly id: string,
    readonly listingId: string,
    readonly kind: MediaKind,
    readonly key: string,
    readonly sortOrder: number,
    readonly width: number | undefined,
    readonly height: number | undefined,
    readonly durationMs: number | undefined,
    readonly posterKey: string | undefined,
    readonly createdAt: Date,
    readonly uploadId: string | undefined,
  ) {}

  static create(data: {
    id: string;
    listingId: string;
    kind: MediaKind;
    key: string;
    sortOrder: number;
    width?: number;
    height?: number;
    durationMs?: number;
    posterKey?: string;
    createdAt?: Date;
    /** The MediaUpload this row adopted; absent only on legacy rows (ADR-0077). */
    uploadId?: string;
  }): ListingMedia {
    if (data.posterKey && data.kind !== "video") {
      throw new DomainError(
        LISTING_ERROR_CODES.INVALID_TRANSITION,
        "posterKey is only allowed for video media",
      );
    }
    if (data.durationMs && data.kind !== "video") {
      throw new DomainError(
        LISTING_ERROR_CODES.INVALID_TRANSITION,
        "durationMs is only allowed for video media",
      );
    }
    return new ListingMedia(
      data.id,
      data.listingId,
      data.kind,
      data.key,
      data.sortOrder,
      data.width,
      data.height,
      data.durationMs,
      data.posterKey,
      data.createdAt ?? new Date(),
      data.uploadId,
    );
  }
}
