import { randomUUID } from "node:crypto";

import {
  Inject,
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from "@nestjs/common";

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

import { UploadAdoptionGuard, type UploadClaim } from "./UploadAdoptionGuard";

export interface AttachMediaInput {
  listingId: string;
  userId: string;
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
  ) {}

  async execute(input: AttachMediaInput): Promise<AttachMediaResult> {
    const listing = await this.listings.findById(input.listingId);
    if (!listing || listing.sellerId !== input.userId || listing.deletedAt) {
      throw new NotFoundException("Listing not found");
    }
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

    if (input.kind === "image" && photoCount >= 20) {
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

    // A key alone authorizes nothing (ADR-0077): the caller must hold the
    // presigned upload, still unadopted, with a matching object in storage.
    const claims: UploadClaim[] = [{ key: input.key, kind: input.kind }];
    if (input.posterKey !== undefined) {
      claims.push({ key: input.posterKey, kind: "image" });
    }
    const [upload] = await this.uploadGuard.authorize(input.userId, claims);
    if (!upload) {
      throw new Error("Upload guard returned no upload for the media key");
    }
    if (upload.adopted) {
      throw this.alreadyAttached();
    }

    const classification = await this.classifier.classify(input.key);
    if (!classification.isAcceptable) {
      // Branch exists for Phase 2 ML classifier; in S4 this never triggers
      return {
        media: ListingMedia.create({
          id: randomUUID(),
          listingId: input.listingId,
          kind: input.kind,
          key: input.key,
          sortOrder: input.sortOrder,
          ...(input.width !== undefined ? { width: input.width } : {}),
          ...(input.height !== undefined ? { height: input.height } : {}),
          ...(input.durationMs !== undefined ? { durationMs: input.durationMs } : {}),
          ...(input.posterKey !== undefined ? { posterKey: input.posterKey } : {}),
        }),
      };
    }

    if (input.kind === "image") {
      await this.variantGenerator.generate(input.key);
    }

    const media = ListingMedia.create({
      id: randomUUID(),
      listingId: input.listingId,
      kind: input.kind,
      key: input.key,
      sortOrder: input.sortOrder,
      uploadId: upload.id,
      ...(input.width !== undefined ? { width: input.width } : {}),
      ...(input.height !== undefined ? { height: input.height } : {}),
      ...(input.durationMs !== undefined ? { durationMs: input.durationMs } : {}),
      ...(input.posterKey !== undefined ? { posterKey: input.posterKey } : {}),
    });

    try {
      const saved = await this.mediaRepo.save(media);
      return { media: saved };
    } catch (err) {
      if (
        err instanceof DomainError &&
        err.code === LISTING_ERROR_CODES.UPLOAD_NOT_AVAILABLE
      ) {
        throw new BadRequestException({ code: err.code, message: "Upload is not available for this User" });
      }
      if (
        err instanceof DomainError &&
        err.code === LISTING_ERROR_CODES.UPLOAD_ALREADY_ATTACHED
      ) {
        // A concurrent attach adopted the upload first. If that was this same
        // retry on this Listing, return its row; anything else is a conflict.
        const winner = (await this.mediaRepo.findByListingId(input.listingId)).find(
          (m) => m.uploadId === upload.id,
        );
        if (winner) return { media: winner };
        throw this.alreadyAttached();
      }
      throw err;
    }
  }

  private alreadyAttached(): ConflictException {
    return new ConflictException({
      code: LISTING_ERROR_CODES.UPLOAD_ALREADY_ATTACHED,
      message: "Upload is already attached to a Listing",
    });
  }
}
