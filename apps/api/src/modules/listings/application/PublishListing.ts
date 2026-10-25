import { MEASUREMENT_COMMIT_PORT, type MeasurementCommitPort } from "../../measurement/measurement.public";
import { Optional ,
  Inject,
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from "@nestjs/common";
import { ListingOwnership, assertListingOwnership } from "./ListingOwnership";
import { randomUUID } from "node:crypto";

import { PrismaService, type Prisma, listingSourceCommand, withDiagnosticSourceCommand, assertDiagnosticSourceCommand, type DiagnosticSourceRoot } from "@auto-tm/db";
import { AuthSchemas, ListingsSchemas, WizardSchemas } from "@auto-tm/contracts";
import type { z } from "zod";

import {
  IDENTITY_CLOCK_PORT,
  type ClockPort,
} from "../../identity/identity.public";
import { ContactPhonePolicy } from "../domain/ContactPhonePolicy";
import { Listing } from "../domain/Listing";
import { toPriceTmt } from "../domain/Price";
import { resolveDamagedAnswer } from "../domain/damagedAnswer";
import { DomainError, LISTING_ERROR_CODES } from "../domain/types";
import {
  LISTING_DRAFT_REPOSITORY,
  type ListingDraftRepository,
} from "../domain/ports/ListingDraftRepository";
import {
  EXCHANGE_RATE_PORT,
  type ExchangeRatePort,
} from "../domain/ports/ExchangeRatePort";
import {
  LISTING_EVENT_PUBLISHER,
  type ListingEventPublisher,
} from "../domain/ports/ListingEventPublisher";
import {
  IMAGE_VARIANT_GENERATOR,
  type ImageVariantGenerator,
} from "../domain/ports/ImageVariantGenerator";
import {
  UPLOAD_CLAIM_PORT,
  type UploadClaimPort,
} from "../domain/ports/UploadClaimPort";

import { contactPhoneRejection } from "./contactPhoneRejection";
import { UploadObjectInvalidError } from "./UploadObjectInvalidError";
import { UploadAdoptionGuard } from "./UploadAdoptionGuard";

const PublishablePayloadSchema = ListingsSchemas.ListingDraftPayloadSchema.required({
  brandId: true,
  modelId: true,
  year: true,
  cityId: true,
  regionId: true,
  priceAmount: true,
  priceCurrency: true,
  condition: true,
  description: true,
  allowCalls: true,
  allowChat: true,
}).extend({
  // Required even when calls are off (D7); whether it is confirmed is the
  // policy check after parsing (ADR-0081).
  contactPhone: AuthSchemas.PhoneTm,
  // Only first publication uses this schema. Edits and republish keep legacy VINs.
  vin: WizardSchemas.VinSchema,
}).refine(
  (data) => data.allowCalls || data.allowChat,
  { message: "CONTACT_METHOD_REQUIRED" },
).refine(
  (data) => (data.photos?.filter((photo) => photo.key).length ?? 0) >= ListingsSchemas.MIN_LISTING_PHOTOS,
  { message: "AT_LEAST_THREE_PHOTOS_REQUIRED" },
).refine(
  (data) => (data.photos?.filter((photo) => photo.key).length ?? 0) <= ListingsSchemas.MAX_LISTING_PHOTOS,
  { message: "MEDIA_LIMIT_EXCEEDED" },
).refine(
  (data) => data.description.trim().length > 0,
  { message: "DESCRIPTION_REQUIRED" },
).refine(
  (data) => {
    if (data.condition === "used") {
      return data.mileageKm !== undefined && data.mileageKm !== null;
    }
    return true;
  },
  { message: "MILEAGE_REQUIRED_FOR_USED" },
).superRefine((data, ctx) => {
  const answer = resolveDamagedAnswer(data.condition, data.conditionDisclosure?.damaged);
  if (!answer.ok) {
    ctx.addIssue({
      code: "custom",
      message: answer.code,
      path: ["conditionDisclosure", "damaged"],
      params: { message: answer.message },
    });
  }
});

/** The HTTP answer for a claim refusal; any other error passes through. */
function claimRejection(err: unknown): unknown {
  if (!(err instanceof DomainError)) return err;
  if (err.code === LISTING_ERROR_CODES.UPLOAD_ALREADY_ATTACHED) {
    return new ConflictException({
      code: err.code,
      message: "A photo upload is already attached to a Listing",
    });
  }
  return new BadRequestException({
    code: err.code,
    message: err.code === LISTING_ERROR_CODES.UPLOAD_NOT_AVAILABLE
      ? "A photo upload is no longer available"
      : err.message,
  });
}

/**
 * Variant generation proved one photo permanently unusable (ADR-0089), carrying
 * the draft's own photo reference so the rejection can name it. Anything else
 * from generation is transient.
 */
class UnusablePhotoError {
  constructor(
    readonly cause: DomainError,
    readonly key: string,
    readonly photoId: string,
  ) {}
}

export interface PublishListingInput {
  draftId: string;
  userId: string;
  sessionId?: string | undefined;
  businessId?: string | undefined;
}

export interface PublishListingResult {
  listing: Listing;
}

@Injectable()
export class PublishListing {
  constructor(
    @Inject(LISTING_DRAFT_REPOSITORY)
    private readonly drafts: ListingDraftRepository,
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Inject(EXCHANGE_RATE_PORT)
    private readonly exchangeRates: ExchangeRatePort,
    @Inject(LISTING_EVENT_PUBLISHER)
    private readonly events: ListingEventPublisher,
    @Inject(IMAGE_VARIANT_GENERATOR)
    private readonly variantGenerator: ImageVariantGenerator,
    @Inject(UploadAdoptionGuard)
    private readonly uploadGuard: UploadAdoptionGuard,
    @Inject(ContactPhonePolicy)
    private readonly contactPhones: ContactPhonePolicy,
    @Inject(IDENTITY_CLOCK_PORT)
    private readonly clock: ClockPort,
    @Inject(UPLOAD_CLAIM_PORT)
    private readonly claims: UploadClaimPort,
    @Optional() @Inject(ListingOwnership) private readonly ownership?: ListingOwnership,
    @Optional() @Inject(MEASUREMENT_COMMIT_PORT) private readonly measurement?: MeasurementCommitPort,
  ) {}

  async execute(input: PublishListingInput): Promise<PublishListingResult> {
    const draft = await this.drafts.findById(input.draftId);
    if (!draft) {
      throw new NotFoundException("Draft not found");
    }
    await assertListingOwnership(this.ownership, input, draft);
    const now = this.clock.now();

    let payload: z.infer<typeof PublishablePayloadSchema>;
    try {
      payload = PublishablePayloadSchema.parse(draft.payload);
    } catch (err) {
      if (err && typeof err === "object" && "issues" in err) {
        const zodError = err as z.ZodError;
        const contactIssue = zodError.issues.find(
          (i) => i.message === "CONTACT_METHOD_REQUIRED",
        );
        if (contactIssue) {
          throw new BadRequestException({
            code: LISTING_ERROR_CODES.CONTACT_METHOD_REQUIRED,
            message: "At least one contact method must be enabled",
          });
        }
        // ADR-0080: a damaged New car gets its own code so the seller can be
        // told to choose Used. A missing answer stays a payload field error.
        const damagedIssue = zodError.issues.find(
          (i) => i.message === LISTING_ERROR_CODES.DAMAGED_NOT_ALLOWED_FOR_NEW,
        );
        if (damagedIssue?.code === "custom") {
          throw new BadRequestException({
            code: LISTING_ERROR_CODES.DAMAGED_NOT_ALLOWED_FOR_NEW,
            message: damagedIssue.params?.["message"],
            details: { field: "conditionDisclosure.damaged" },
          });
        }
        if (zodError.issues.every((i) => i.path[0] === "contactPhone")) {
          // When the phone is the only gap: missing or blank answers
          // CONTACT_PHONE_REQUIRED; free text left in an older draft is a
          // number nobody confirmed. Otherwise every missing field is listed.
          const raw = (draft.payload as { contactPhone?: unknown }).contactPhone;
          const standing = await this.contactPhones.standing(
            input.userId,
            typeof raw === "string" ? raw : null,
            now,
            draft.businessId,
          );
          throw contactPhoneRejection(standing) ?? contactPhoneRejection({ kind: "not_confirmed" });
        }
        throw new BadRequestException({
          code: "INVALID_DRAFT_PAYLOAD",
          message: "Draft is missing required fields",
          details: zodError.flatten(),
        });
      }
      throw err;
    }

    // The schema above refused every Damaged answer this rule rejects.
    const damagedAnswer = resolveDamagedAnswer(payload.condition, payload.conditionDisclosure?.damaged);
    const damaged = damagedAnswer.ok ? damagedAnswer.damaged : null;
    const rejection = contactPhoneRejection(
      await this.contactPhones.standing(input.userId, payload.contactPhone, now, draft.businessId),
    );
    if (rejection) throw rejection;

    const rateToTmt =
      payload.priceCurrency === "TMT"
        ? 1
        : await this.exchangeRates.getRate(payload.priceCurrency, "TMT");
    if (rateToTmt <= 0) {
      throw new BadRequestException({
        code: LISTING_ERROR_CODES.EXCHANGE_RATE_MISSING,
        message: `Exchange rate from ${payload.priceCurrency} to TMT is not available`,
      });
    }
    const priceTmt = toPriceTmt(payload.priceAmount, payload.priceCurrency, rateToTmt);

    const listingId = randomUUID();

    const photos = payload.photos;
    if (!photos) throw new BadRequestException({ code: "INVALID_DRAFT_PAYLOAD", message: "Photos are required" });
    const attachedPhotos = photos.filter((photo) => photo.key);

    // A draft's photo keys are only strings. Each must be an upload this User
    // presigned (ADR-0079), and the common claim below lets only one target
    // adopt it, whether that is a Listing or a Profile Photo (ADR-0088).
    const photoKeys = attachedPhotos.map((photo) => photo.key as string);
    if (new Set(photoKeys).size !== photoKeys.length) {
      throw new BadRequestException({
        code: "INVALID_DRAFT_PAYLOAD",
        message: "A photo key can be used only once",
      });
    }
    const uploads = await this.uploadGuard
      .authorize(
        input.userId,
        photoKeys.map((key) => ({ key, kind: "image" as const })),
        draft.businessId,
      )
      .catch(async (err: unknown) => {
        if (err instanceof UploadObjectInvalidError) {
          if (err.permanentlyInvalid) {
            await this.claims.retireUnclaimed(err.uploadId, input.userId,
              () => this.uploadGuard.isPermanentlyInvalid(err.upload)).catch(() => undefined);
          }
          const photoId = attachedPhotos.find((photo) => photo.key === err.key)?.photoId;
          throw new UploadObjectInvalidError(err.upload, err.permanentlyInvalid, photoId);
        }
        throw err;
      });
    if (uploads.some((upload) => upload.adopted)) {
      throw new ConflictException({
        code: LISTING_ERROR_CODES.UPLOAD_ALREADY_ATTACHED,
        message: "A photo upload is already attached to a Listing",
      });
    }
    const uploadIdByKey = new Map(uploads.map((upload) => [upload.key, upload.id]));

    // Reserve every photo for the new Listing before any variant is written:
    // all of them, or none and nothing is published.
    const claim = {
      uploadIds: uploads.map((upload) => upload.id),
      target: { type: "listing" as const, id: listingId },
    };
    const reservation = await this.claims
      .reserve({ userId: input.userId, ...(input.businessId ? { businessId: input.businessId, sessionId: input.sessionId } : {}), ...claim })
      .catch((err: unknown) => {
        throw claimRejection(err);
      });
    if (!("token" in reservation)) {
      throw claimRejection(new DomainError(LISTING_ERROR_CODES.UPLOAD_ALREADY_ATTACHED, "Already adopted"));
    }

    try {
      const preparations = await Promise.allSettled(
        attachedPhotos.map((photo) =>
          this.variantGenerator
            .generate(photo.key as string, {
              writeProtocol: uploads.find((upload) => upload.key === photo.key)?.writeProtocol ?? "legacy",
            })
            .catch((err: unknown) => {
              // The generator's contract (ADR-0089): bytes that can never be an
              // image arrive as UPLOAD_OBJECT_INVALID; anything else is transient.
              if (err instanceof DomainError && err.code === LISTING_ERROR_CODES.UPLOAD_OBJECT_INVALID) {
                throw new UnusablePhotoError(err, photo.key as string, photo.photoId);
              }
              throw err;
            }),
        ),
      );

      // All generators must stop before any claim can be released or retired.
      // Prefer a permanent refusal if more than one photo failed.
      const failure = preparations.find((result) => result.status === "rejected" && result.reason instanceof UnusablePhotoError)
        ?? preparations.find((result) => result.status === "rejected");
      if (failure?.status === "rejected") throw failure.reason;
      const thumbHashByKey = new Map(attachedPhotos.map((photo, index) => {
        const prepared = preparations[index];
        return [photo.key as string, prepared?.status === "fulfilled" ? prepared.value.thumbHash : undefined];
      }));

      // The Listing, its media, the draft removal, the audit entry and the
      // adoption of every upload commit together or not at all.
      const auditId = randomUUID(), publishedEventId = randomUUID(), visibilityEventId = randomUUID();
      const publicationEvents = [
        { version: 1 as const, eventId: publishedEventId, occurredAt: now.toISOString(), purpose: "product_improvement" as const,
          eventName: "listing_published" as const, context: { platform: "server" as const, release: "server", build: "server", locale: "ru" as const }, payload: { listingId, cityId: payload.cityId, draftId: input.draftId } },
        { version: 1 as const, eventId: visibilityEventId, occurredAt: now.toISOString(), purpose: "product_improvement" as const,
          eventName: "listing_visibility_changed" as const, context: { platform: "server" as const, release: "server", build: "server", locale: "ru" as const }, payload: { listingId, visibility: "public" as const, reason: "published" as const } },
      ];
      const [publicationEvent, visibilityEvent] = publicationEvents;
      if (!publicationEvent || !visibilityEvent) throw new Error("listing_publication_events");
      const measurementPlan = this.measurement?.preparePublication?.(publicationEvents);
      const listingRow = await this.prisma.$transaction(async (tx) => {
        const initialDraft = await tx.listingDraft.findUnique({ where: { id: draft.id } });
        if (!initialDraft || initialDraft.userId !== draft.userId || (initialDraft.businessId ?? null) !== (draft.businessId ?? null)
          || initialDraft.updatedAt.getTime() !== draft.updatedAt.getTime()
          || JSON.stringify(initialDraft.payload) !== JSON.stringify(draft.payload)) throw new Error("diagnostic_source_graph_changed");
        const initialVideo = await this.discoverDraftVideo(tx, draft.id);
        const plannedVideo = this.draftVideoBinding(initialVideo, draft.id, draft.businessId ?? null, now);
        const roots: DiagnosticSourceRoot[] = [
          { table: "users", key: { id: input.userId } },
          { table: "listing_drafts", key: { id: draft.id } },
          { table: "audit_logs", key: { id: auditId } },
          ...(measurementPlan ? [
            { table: "measurement_outbox" as const, key: { id: publishedEventId } },
            { table: "measurement_outbox" as const, key: { id: visibilityEventId } },
          ] : []),
          ...attachedPhotos.map(photo => ({ table: "listing_media" as const, key: { id: photo.photoId } })),
          ...uploads.map(upload => ({ table: "media_uploads" as const, key: { id: upload.id } })),
          ...(initialVideo ? [
            { table: "video_upload_sessions" as const, key: { id: initialVideo.candidate.id } },
            { table: "media_uploads" as const, key: { id: initialVideo.candidate.uploadId } },
            { table: "video_generations" as const, key: { id: initialVideo.candidate.id } },
          ] : []),
        ];
        const command = await listingSourceCommand(tx, { operation: "listing_create", listingId, actorUserId: input.userId, sessionId: input.sessionId,
          publication: { draftId: draft.id, photoIds: attachedPhotos.map(photo => photo.photoId as string), uploadIds: uploads.map(upload => upload.id), auditId,
            ...(measurementPlan ? { measurement: { eventIds: publicationEvents.map(event => event.eventId), environment: measurementPlan.environment, expiresAt: measurementPlan.expiresAt } } : {}) },
          roots, changes: { id: listingId, sellerId: input.userId, businessId: draft.businessId ?? null, vin: payload.vin ?? null,
            brandId: payload.brandId, modelId: payload.modelId, year: payload.year ?? null, deletedAt: null, status: "active", contactPhone: payload.contactPhone ?? null,
            activeVideoGenerationId: plannedVideo.activeVideoGenerationId ?? null, pendingVideoGenerationId: plannedVideo.pendingVideoGenerationId ?? null,
            activeVideoRevision: plannedVideo.activeVideoRevision ?? 0, archivedByDeletion: false } });
        return withDiagnosticSourceCommand(tx, command, async receipt => {
        await assertDiagnosticSourceCommand(tx, receipt, "listing_create");
        const eligibleUsers = await tx.$queryRaw<{ deletionScheduledAt: Date | null }[]>`SELECT "deletionScheduledAt" FROM "users" WHERE "id" = ${input.userId} FOR UPDATE`;
        const captureEligible = !!eligibleUsers[0] && !eligibleUsers[0].deletionScheduledAt;
        await assertListingOwnership(this.ownership, input, draft, tx);
        if (draft.businessId) {
          const rejection = contactPhoneRejection(await this.contactPhones.standing(input.userId, payload.contactPhone, this.clock.now(), draft.businessId, tx));
          if (rejection) throw rejection;
        }
        const video = await this.bindDraftVideo(tx, draft.id, listingId, draft.businessId ?? null, now, initialVideo);
        const lockedDraft = await tx.listingDraft.findUnique({ where: { id: draft.id } });
        if (JSON.stringify(lockedDraft) !== JSON.stringify(initialDraft)) throw new Error("diagnostic_source_graph_changed");
        await this.claims.finalize(tx, { token: reservation.token, ...claim });
        const created = await tx.listing.create({
          data: {
            id: listingId,
            ...video,
            sellerId: input.userId,
            ...(draft.businessId ? { businessId: draft.businessId, lastEditedById: input.userId, availabilityConfirmedAt: now } : {}),
            status: "active",
            brandId: payload.brandId,
            modelId: payload.modelId,
            generationId: payload.generationId ?? null,
            year: payload.year ?? null,
            vin: payload.vin ?? null,
            cityId: payload.cityId,
            regionId: payload.regionId ?? null,
            priceAmount: payload.priceAmount,
            priceCurrency: payload.priceCurrency,
            priceTmt,
            contactPhone: payload.contactPhone,
            allowCalls: payload.allowCalls,
            allowChat: payload.allowChat,
            publishedAt: now,
            condition: payload.condition,
            colorId: payload.colorId ?? null,
            bodyTypeId: payload.bodyTypeId ?? null,
            engineTypeId: payload.engineTypeId ?? null,
            transmissionId: payload.transmissionId ?? null,
            driveTypeId: payload.driveTypeId ?? null,
            enginePower: payload.enginePower ?? null,
            mileageKm: payload.mileageKm ?? null,
            locationText: payload.locationText ?? null,
            description: payload.description,
            acceptsExchange: payload.acceptsExchange ?? false,
            installmentAvailable: payload.installmentAvailable ?? false,
            damaged,
            knownIssuesText: payload.conditionDisclosure?.knownIssuesText ?? null,
          },
        });
        for (const photo of attachedPhotos) {
          await tx.listingMedia.create({
            data: {
              id: photo.photoId,
              listingId,
              kind: "image",
              key: photo.key as string,
              sortOrder: photo.sortOrder,
              uploadId: uploadIdByKey.get(photo.key as string) as string,
              thumbHash: thumbHashByKey.get(photo.key as string) ?? null,
            },
          });
        }
        await tx.listingDraft.delete({ where: { id: draft.id } });
        await tx.auditLog.create({
          data: {
            id: auditId,
            actorId: input.userId,
            action: "listing.published",
            targetType: "Listing",
            targetId: listingId,
            details: {
              brandId: payload.brandId,
              modelId: payload.modelId,
              cityId: payload.cityId,
              priceAmount: payload.priceAmount,
              priceCurrency: payload.priceCurrency,
            },
          },
        });
        try {
          if (captureEligible) await this.measurement?.capture(tx, input.userId, publicationEvent, { conversionEligible: true }, measurementPlan ?? undefined);
          if (captureEligible) await this.measurement?.capture(tx, input.userId, visibilityEvent, { conversionEligible: true }, measurementPlan ?? undefined);
        } catch { /* Measurement outage never rolls back the core publication. */ }
        return created;
        });
      });

      const listing = Listing.create({
        id: listingRow.id,
        publicNumber: listingRow.publicNumber,
        sellerId: listingRow.sellerId,
        ...(listingRow.businessId ? { businessId: listingRow.businessId } : {}),
        status: listingRow.status as "active" | "sold" | "archived",
        brandId: listingRow.brandId,
        modelId: listingRow.modelId,
        cityId: listingRow.cityId,
        priceAmount: listingRow.priceAmount,
        priceCurrency: listingRow.priceCurrency as "TMT" | "USD" | "AED",
        allowCalls: listingRow.allowCalls,
        allowChat: listingRow.allowChat,
        publishedAt: listingRow.publishedAt ?? now,
        createdAt: listingRow.createdAt,
        updatedAt: listingRow.updatedAt,
        ...(listingRow.generationId ? { generationId: listingRow.generationId } : {}),
        ...(listingRow.year ? { year: listingRow.year } : {}),
        ...(listingRow.vin ? { vin: listingRow.vin } : {}),
        ...(listingRow.regionId ? { regionId: listingRow.regionId } : {}),
        ...(listingRow.contactPhone ? { contactPhone: listingRow.contactPhone } : {}),
        ...(listingRow.condition ? { condition: listingRow.condition as "new" | "used" } : {}),
        ...(listingRow.colorId ? { colorId: listingRow.colorId } : {}),
        ...(listingRow.bodyTypeId ? { bodyTypeId: listingRow.bodyTypeId } : {}),
        ...(listingRow.engineTypeId ? { engineTypeId: listingRow.engineTypeId } : {}),
        ...(listingRow.transmissionId ? { transmissionId: listingRow.transmissionId } : {}),
        ...(listingRow.driveTypeId ? { driveTypeId: listingRow.driveTypeId } : {}),
        ...(listingRow.enginePower ? { enginePower: listingRow.enginePower } : {}),
        ...(listingRow.mileageKm ? { mileageKm: listingRow.mileageKm } : {}),
        ...(listingRow.locationText ? { locationText: listingRow.locationText } : {}),
        ...(listingRow.description ? { description: listingRow.description } : {}),
        acceptsExchange: listingRow.acceptsExchange,
        installmentAvailable: listingRow.installmentAvailable,
        ...(listingRow.damaged !== null
          ? {
              conditionDisclosure: {
                damaged: listingRow.damaged,
                ...(listingRow.knownIssuesText ? { knownIssuesText: listingRow.knownIssuesText } : {}),
              },
            }
          : {}),
      });

      await this.events.emit({
        event: "ListingCreated",
        listingId: listing.id,
        sellerId: listing.sellerId,
      });

      return { listing };
    } catch (err) {
      // ADR-0089 supersedes "a failed preparation is terminal" for publish.
      // Only the attempt that created the token settles it; a joined retry must
      // not touch a claim another attempt is still preparing.
      if (!reservation.joined) {
        if (err instanceof UnusablePhotoError) {
          // One photo is permanently unusable: retire exactly it (with its
          // deletion work) and release the others, in one transaction, and
          // name the photo so the seller can re-add it.
          const uploadId = uploadIdByKey.get(err.key);
          const settled =
            uploadId !== undefined &&
            (await this.claims.settle(reservation.token, uploadId).catch(() => false));
          if (settled) {
            throw new BadRequestException({
              code: LISTING_ERROR_CODES.UPLOAD_OBJECT_INVALID,
              message: err.cause.message,
              details: { key: err.key, photoId: err.photoId },
            });
          }
          // The token no longer holds that upload (a scanner retired it
          // meanwhile): release whatever it still holds and report the
          // original error instead of naming a photo.
        }
        // A transient failure (storage, database, timeout) lets go: every
        // upload returns to AVAILABLE with no deletion work recorded, so a
        // retry of the same draft can adopt the same bytes. A stranded claim
        // this release cannot record is released after its deadline by the worker.
        await this.claims.release(reservation.token).catch(() => undefined);
      }
      throw claimRejection(err instanceof UnusablePhotoError ? err.cause : err);
    }
  }
  private async discoverDraftVideo(tx: Prisma.TransactionClient, draftId: string) {
    const candidate = await tx.videoUploadSession.findFirst({ where: { protocolVersion: 1, targetKind: "draft", targetId: draftId }, orderBy: [{ targetRevision: "desc" }, { id: "desc" }] });
    if (!candidate) return null;
    const [upload, generation] = await Promise.all([
      tx.mediaUpload.findUnique({ where: { id: candidate.uploadId } }), tx.videoGeneration.findUnique({ where: { id: candidate.id } }),
    ]);
    return { candidate, upload, generation };
  }

  private draftVideoBinding(initial: Awaited<ReturnType<PublishListing["discoverDraftVideo"]>>, draftId: string, businessId: string | null, now: Date): { activeVideoGenerationId?: string; pendingVideoGenerationId?: string; activeVideoRevision?: number } {
    const session = initial?.candidate, upload = initial?.upload, generation = initial?.generation;
    if (!session || !upload || !generation || session.cancelledAt || session.expiresAt <= now || !session.targetRevision || session.targetId !== draftId || session.targetKind !== "draft" || session.uploadId !== upload.id || upload.businessId !== businessId || upload.userId !== session.userId || upload.writeProtocol !== "video-v1" || upload.kind !== "video" || upload.state !== "PREPARING" || upload.claimToken !== session.id || upload.claimTargetType !== "video_session" || upload.claimTargetId !== session.id || upload.key !== session.sourceKey || session.sourceKey !== `video/v1/${upload.id}/${session.id}/source.mp4` || generation.sessionId !== session.id || generation.uploadId !== upload.id || generation.listingId !== draftId || generation.targetRevision !== session.targetRevision || generation.retiredAt) return {};
    const ready = session.state === "READY" && generation.state === "READY" && !!generation.readyAt && !!generation.durationMs && generation.durationMs <= 90000 && generation.posterKey === `video/v1/${upload.id}/${generation.id}/poster.jpg` && generation.manifest !== null;
    const pending = ["INITIALIZING", "UPLOADING", "PAUSED", "COMPLETING", "PROCESSING"].includes(session.state) && ["UPLOADING", "PROCESSING"].includes(generation.state);
    if (!ready && !pending) return {};
    return { activeVideoRevision: session.targetRevision, ...(ready ? { activeVideoGenerationId: generation.id } : { pendingVideoGenerationId: generation.id }) };
  }

  /** Publication, video rebinding and photo adoption share this transaction.
   * Owner/business locks precede the draft and every upload lock. */
  private async bindDraftVideo(tx: Prisma.TransactionClient, draftId: string, listingId: string, businessId: string | null, now: Date, initial: Awaited<ReturnType<PublishListing["discoverDraftVideo"]>>): Promise<{ activeVideoGenerationId?: string; pendingVideoGenerationId?: string; activeVideoRevision?: number }> {
    const locked = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "listing_drafts" WHERE "id" = ${draftId} FOR UPDATE`;
    if (!locked.length) throw new ConflictException("Draft is no longer available");
    const candidate = await tx.videoUploadSession.findFirst({ where: { protocolVersion: 1, targetKind: "draft", targetId: draftId }, orderBy: [{ targetRevision: "desc" }, { id: "desc" }] });
    if (candidate?.id !== initial?.candidate.id) throw new Error("diagnostic_source_graph_changed");
    if (!candidate) return {};
    await tx.$queryRaw`SELECT "id" FROM "media_uploads" WHERE "id" = ${candidate.uploadId} FOR UPDATE`;
    await tx.$queryRaw`SELECT "id" FROM "video_upload_sessions" WHERE "id" = ${candidate.id} FOR UPDATE`;
    await tx.$queryRaw`SELECT "id" FROM "video_generations" WHERE "id" = ${candidate.id} FOR UPDATE`;
    const [session, upload, generation] = await Promise.all([
      tx.videoUploadSession.findUnique({ where: { id: candidate.id } }), tx.mediaUpload.findUnique({ where: { id: candidate.uploadId } }), tx.videoGeneration.findUnique({ where: { id: candidate.id } }),
    ]);
    if (JSON.stringify({ candidate: session, upload, generation }) !== JSON.stringify(initial)) throw new Error("diagnostic_source_graph_changed");
    const binding = this.draftVideoBinding(session ? { candidate: session, upload, generation } : null, draftId, businessId, now);
    if (!binding.activeVideoGenerationId && !binding.pendingVideoGenerationId) return {};
    if (!session || !upload || !generation) throw new Error("diagnostic_source_graph_changed");
    const ready = !!binding.activeVideoGenerationId;
    await tx.videoUploadSession.update({ where: { id: session.id }, data: { targetKind: "listing", targetId: listingId, listingId } });
    await tx.videoGeneration.update({ where: { id: generation.id }, data: { listingId } });
    if (ready) await tx.mediaUpload.update({ where: { id: upload.id }, data: { state: "ADOPTED", claimTargetType: "listing", claimTargetId: listingId, claimToken: null, claimDeadline: null } });
    return binding;
  }

}
