import { Optional ,
  Inject,
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from "@nestjs/common";
import { ListingOwnership, assertListingOwnership } from "./ListingOwnership";
import { ListingsSchemas } from "@auto-tm/contracts";
import { randomUUID } from "node:crypto";


import { ListingMedia } from "../domain/ListingMedia";
import { DomainError, LISTING_ERROR_CODES } from "../domain/types";
import {
  LISTING_REPOSITORY,
  type ListingRepository,
} from "../domain/ports/ListingRepository";
import {
  LISTING_MEDIA_REPOSITORY,
  type ListingMediaRepository,
} from "../domain/ports/ListingMediaRepository";
import {
  MEDIA_CONTENT_CLASSIFIER_PORT,
  type MediaContentClassifierPort,
} from "../domain/ports/MediaContentClassifierPort";
import {
  IMAGE_VARIANT_GENERATOR,
  type ImageVariantGenerator,
} from "../domain/ports/ImageVariantGenerator";

import {
  UPLOAD_CLAIM_PORT,
  type UploadClaimPort,
} from "../domain/ports/UploadClaimPort";

import { UploadAdoptionGuard, type UploadClaim } from "./UploadAdoptionGuard";

export interface AttachMediaInput {
  listingId: string;
  userId: string;
  sessionId?: string | undefined;
  businessId?: string | undefined;
  key: string;
  kind: "image" | "video";
  sortOrder: number;
  width?: number | undefined;
  height?: number | undefined;
  durationMs?: number | undefined;
  posterKey?: string | undefined;
}

export interface AttachMediaResult {
  media: ListingMedia;
}

@Injectable()
export class AttachMedia {
  constructor(
    @Inject(LISTING_REPOSITORY)
    private readonly listings: ListingRepository,
    @Inject(LISTING_MEDIA_REPOSITORY)
    private readonly mediaRepo: ListingMediaRepository,
    @Inject(MEDIA_CONTENT_CLASSIFIER_PORT)
    private readonly classifier: MediaContentClassifierPort,
    @Inject(IMAGE_VARIANT_GENERATOR)
    private readonly variantGenerator: ImageVariantGenerator,
    @Inject(UploadAdoptionGuard)
    private readonly uploadGuard: UploadAdoptionGuard,
    @Inject(UPLOAD_CLAIM_PORT)
    private readonly claims: UploadClaimPort,
    @Optional() @Inject(ListingOwnership) private readonly ownership?: ListingOwnership,
  ) {}

  async execute(input: AttachMediaInput): Promise<AttachMediaResult> {
    const listing = await this.listings.findById(input.listingId);
    if (!listing || listing.deletedAt) {
      throw new NotFoundException("Listing not found");
    }
    if (!listing.businessId && listing.sellerId !== input.userId) throw new NotFoundException("Listing not found");
    await assertListingOwnership(this.ownership, input, listing);
    if (listing.status === "banned") {
      throw new ForbiddenException({
        code: "FORBIDDEN",
        message: "Listing is banned and media cannot be attached",
      });
    }

    const existingMedia = await this.mediaRepo.findByListingId(input.listingId);

    // Retrying an attachment that already succeeded returns that row instead of
    // adding a duplicate. This needs no new authority: the row is on the
    // caller's own Listing.
    const alreadyAttached = existingMedia.find((m) => m.key === input.key);
    if (alreadyAttached) {
      return { media: alreadyAttached };
    }

    const photoCount = existingMedia.filter((m) => m.kind === "image").length;
    const videoCount = existingMedia.filter((m) => m.kind === "video").length;

    if (input.kind === "image" && photoCount >= ListingsSchemas.MAX_LISTING_PHOTOS) {
      throw new BadRequestException({
        code: LISTING_ERROR_CODES.MEDIA_LIMIT_EXCEEDED,
        message: "Maximum 20 photos per listing",
      });
    }
    if (input.kind === "video" && videoCount >= 1) {
      throw new BadRequestException({
        code: LISTING_ERROR_CODES.MEDIA_LIMIT_EXCEEDED,
        message: "Maximum 1 video per listing",
      });
    }

    // A key alone authorizes nothing (ADR-0079): the caller must hold the
    // presigned upload, still unadopted, with a matching object in storage.
    const claims: UploadClaim[] = [{ key: input.key, kind: input.kind }];
    if (input.posterKey !== undefined) {
      claims.push({ key: input.posterKey, kind: "image" });
    }
    const [upload, poster] = await this.uploadGuard.authorize(input.userId, claims, listing.businessId);
    if (!upload) {
      throw new Error("Upload guard returned no upload for the media key");
    }
    if (upload.adopted) {
      const winner = (await this.mediaRepo.findByListingId(input.listingId)).find(
        (media) => media.uploadId === upload.id,
      );
      if (winner) return { media: winner };
      throw this.alreadyAttached();
    }

    // Reserve before any byte is prepared (ADR-0088): from here this Listing
    // holds the upload, or the request stops without touching storage.
    const reservation = await this.claims
      .reserve({
        userId: input.userId,
        ...(input.businessId ? { businessId: input.businessId, sessionId: input.sessionId } : {}),
        uploadIds: [upload.id],
        target: { type: "listing", id: input.listingId },
      })
      .catch((err: unknown) => {
        throw this.rejection(err);
      });
    if ("alreadyAdopted" in reservation) {
      // An earlier attempt of this same attachment committed in the meantime.
      const winner = (await this.mediaRepo.findByListingId(input.listingId)).find(
        (m) => m.uploadId === upload.id,
      );
      if (winner) return { media: winner };
      throw this.alreadyAttached();
    }

    const details = {
      id: randomUUID(),
      listingId: input.listingId,
      kind: input.kind,
      key: input.key,
      sortOrder: input.sortOrder,
      ...(input.width !== undefined ? { width: input.width } : {}),
      ...(input.height !== undefined ? { height: input.height } : {}),
      ...(input.durationMs !== undefined ? { durationMs: input.durationMs } : {}),
      ...(input.posterKey !== undefined ? { posterKey: input.posterKey } : {}),
    };
    const abandon = () =>
      // Only the attempt that created the token abandons it; a joined retry
      // holds the same in-flight claim as another attempt's and retires
      // nothing (review P1 at 9fc23c13).
      reservation.joined ? Promise.resolve() : this.claims.abandon(reservation.token);
    try {
      const classification = await this.classifier.classify(input.key);
      if (!classification.isAcceptable) {
        // Branch exists for Phase 2 ML classifier; in S4 this never triggers.
        // Nothing adopts the upload, so its preparation ends here.
        await abandon();
        return { media: ListingMedia.create(details) };
      }

      const thumbHash = input.kind === "image"
        ? (await this.variantGenerator.generate(input.key, { writeProtocol: upload.writeProtocol ?? "legacy" })).thumbHash
        : undefined;

      const saved = await this.mediaRepo.save(
        ListingMedia.create({ ...details, uploadId: upload.id, ...(thumbHash !== undefined ? { thumbHash } : {}) }),
        { token: reservation.token, actor: input, ...(poster ? { posterUploadId: poster.id } : {}) },
      );
      return { media: saved };
    } catch (err) {
      // A failed preparation is terminal: the upload is retired, never retried.
      // Only the attempt that created the token abandons it; a joined retry
      // must not retire a claim another attempt is still preparing. If this
      // cannot be recorded now, the storage scanner retires it later.
      await abandon().catch(() => undefined);
      if (err instanceof DomainError && err.code === LISTING_ERROR_CODES.UPLOAD_OBJECT_INVALID) {
        throw new BadRequestException({ code: err.code, message: err.message, details: { key: upload.key } });
      }
      throw this.rejection(err);
    }
  }

  private rejection(err: unknown): unknown {
    if (!(err instanceof DomainError)) return err;
    if (err.code === LISTING_ERROR_CODES.UPLOAD_ALREADY_ATTACHED) return this.alreadyAttached();
    if (err.code === LISTING_ERROR_CODES.UPLOAD_NOT_AVAILABLE) {
      return new BadRequestException({ code: err.code, message: "Upload is not available for this User" });
    }
    return err;
  }

  private alreadyAttached(): ConflictException {
    return new ConflictException({
      code: LISTING_ERROR_CODES.UPLOAD_ALREADY_ATTACHED,
      message: "Upload is already attached to a Listing",
    });
  }
}
