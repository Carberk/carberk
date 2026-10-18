import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService, type Prisma } from "@auto-tm/db";
import {
  BUSINESS_AUTHORITY_PORT, BusinessAuthorityDenied, IDENTITY_CLOCK_PORT,
  type BusinessAuthorityPort, type ClockPort,
} from "../../identity/identity.public";
import { ListingOwnership, type ListingActor } from "../application/ListingOwnership";
import { VideoUploadSessionService, type VideoSessionRecord, type VideoSessionState } from "../application/VideoUploadSession";
import { PrismaUploadClaims } from "./PrismaUploadClaims";

const RECOVERY_MS = 7 * 24 * 60 * 60 * 1000;
type SessionRow = Prisma.VideoUploadSessionGetPayload<Record<string, never>>;
const record = (row: SessionRow): VideoSessionRecord => ({
  id: row.id, uploadId: row.uploadId, userId: row.userId,
  ...(row.listingId ? { listingId: row.listingId } : {}),
  sourceKey: row.sourceKey, state: row.state as VideoSessionState,
  expiresAt: row.expiresAt, claimToken: row.id,
});
const forbidden = () => new ForbiddenException({ code: "VIDEO_UPLOAD_NOT_AUTHORIZED" });
const stale = () => new ConflictException({ code: "VIDEO_SESSION_STALE" });

/** Current identity, Listing ownership and the exclusive upload claim share one transaction. */
@Injectable()
export class PrismaVideoUploadSessionRepository {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(BUSINESS_AUTHORITY_PORT) private readonly authority: BusinessAuthorityPort,
    @Inject(ListingOwnership) private readonly ownership: ListingOwnership,
    @Inject(IDENTITY_CLOCK_PORT) private readonly clock: ClockPort,
    @Inject(PrismaUploadClaims) private readonly claims: PrismaUploadClaims,
    @Inject(VideoUploadSessionService) private readonly sessions: VideoUploadSessionService,
  ) {}

  async find(id: string): Promise<VideoSessionRecord | null> {
    const row = await this.prisma.videoUploadSession.findUnique({ where: { id } });
    return row ? record(row) : null;
  }

  async create(input: { id: string; uploadId: string; actor: ListingActor; listingId?: string }): Promise<VideoSessionRecord> {
    return this.prisma.$transaction(async tx => {
      await this.authorizeActor(tx, input.actor);
      await this.authorizeListing(tx, input.actor, input.listingId);
      const upload = await this.lockUpload(tx, input.uploadId, input.actor);
      if (upload.state !== "AVAILABLE") throw stale();
      // A historical/live adopter also refuses acquisition even if its legacy state is wrong.
      if (await tx.listingMedia.count({ where: { uploadId: upload.id } }) ||
          await tx.videoGeneration.count({ where: { uploadId: upload.id } })) throw stale();
      const expiresAt = new Date(this.clock.now().getTime() + RECOVERY_MS);
      const claimed = await tx.mediaUpload.updateMany({
        where: { id: upload.id, state: "AVAILABLE" },
        data: { state: "PREPARING", claimToken: input.id, claimTargetType: "video_session", claimTargetId: input.id, claimDeadline: expiresAt },
      });
      if (claimed.count !== 1) throw stale();
      return record(await tx.videoUploadSession.create({ data: {
        id: input.id, uploadId: upload.id, userId: input.actor.userId,
        listingId: input.listingId ?? null, sourceKey: upload.key, expiresAt,
      } }));
    });
  }

  async transition(id: string, actor: ListingActor, expectedState: VideoSessionState, action: "pause" | "resume" | "cancel"): Promise<VideoSessionRecord> {
    return this.prisma.$transaction(async tx => {
      await this.authorizeActor(tx, actor);
      const candidate = await tx.videoUploadSession.findUnique({ where: { id } });
      if (!candidate || candidate.userId !== actor.userId) throw forbidden();
      await this.authorizeListing(tx, actor, candidate.listingId ?? undefined);
      const upload = await this.lockUpload(tx, candidate.uploadId, actor);
      await tx.$queryRaw`SELECT id FROM video_upload_sessions WHERE id = ${id} FOR UPDATE`;
      const current = await tx.videoUploadSession.findUniqueOrThrow({ where: { id } });
      if (current.state !== expectedState || upload.state !== "PREPARING" || upload.claimToken !== id) throw stale();
      let next: VideoSessionRecord;
      try { next = this.sessions[action](record(current), actor.userId); }
      catch { throw stale(); }
      if (action === "cancel") {
        // A completed/attached generation owns this source now. Cancellation cannot retire it.
        if (await tx.videoGeneration.count({ where: { uploadId: upload.id } })) throw stale();
        await this.claims.retire(tx, upload.id);
      }
      const changed = await tx.videoUploadSession.updateMany({ where: { id, userId: actor.userId, state: expectedState }, data: { state: next.state } });
      if (changed.count !== 1) throw stale();
      return next;
    });
  }

  private async authorizeActor(tx: Prisma.TransactionClient, actor: ListingActor): Promise<void> {
    if (!actor.sessionId) throw forbidden();
    try {
      const subject = { userId: actor.userId, sessionId: actor.sessionId };
      if (actor.businessId) await this.authority.authorize({ ...subject, businessId: actor.businessId }, tx);
      else await this.authority.resolve(subject, tx);
    } catch (error) {
      if (error instanceof BusinessAuthorityDenied) throw forbidden();
      throw error;
    }
  }

  private async authorizeListing(tx: Prisma.TransactionClient, actor: ListingActor, listingId?: string): Promise<void> {
    if (!listingId) return;
    await tx.$queryRaw`SELECT id FROM listings WHERE id = ${listingId} FOR UPDATE`;
    const listing = await tx.listing.findUnique({ where: { id: listingId } });
    if (!listing) throw new NotFoundException({ code: "VIDEO_LISTING_NOT_FOUND" });
    if (listing.deletedAt || listing.status === "banned") throw forbidden();
    await this.ownership.authorize(actor, { sellerId: listing.sellerId, ...(listing.businessId ? { businessId: listing.businessId } : {}) }, tx);
  }

  private async lockUpload(tx: Prisma.TransactionClient, id: string, actor: ListingActor) {
    await tx.$queryRaw`SELECT id FROM media_uploads WHERE id = ${id} FOR UPDATE`;
    const upload = await tx.mediaUpload.findUnique({ where: { id } });
    if (!upload || upload.kind !== "video" || (actor.businessId
      ? upload.businessId !== actor.businessId
      : upload.businessId !== null || upload.userId !== actor.userId)) throw forbidden();
    return upload;
  }
}
