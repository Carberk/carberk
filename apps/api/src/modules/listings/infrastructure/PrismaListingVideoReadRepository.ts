import { Inject, Injectable } from "@nestjs/common";
import { PrismaService, type Prisma } from "@auto-tm/db";
import type { VideoUploadTarget } from "../domain/VideoUpload";
import { ListingsSchemas } from "@auto-tm/contracts";
import type { ListingVideoReadPort, ListingVideoProjection } from "../domain/ports/ListingVideoReadPort";
import { ConfigListingVideoAccess } from "../../../common/ConfigListingVideoAccess";
import { IDENTITY_CHECK_PORT, type IdentityCheckPort } from "../../identity/identity.public";

type GenerationRow = {
  id: string;
  sourceId: string;
  status: string;
  manifest: Prisma.JsonValue;
  durationMs: number | null;
  failureType: string | null;
  sourceState: string;
};
type SlotRow = { id: string | null; ownerId: string; listingId: string; active: GenerationRow | null; pending: GenerationRow | null };

@Injectable()
export class PrismaListingVideoReadRepository implements ListingVideoReadPort {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ConfigListingVideoAccess) private readonly access: ConfigListingVideoAccess,
    @Inject(IDENTITY_CHECK_PORT) private readonly identity: IdentityCheckPort,
  ) {}

  async getForTarget(target: VideoUploadTarget, ownerId: string): Promise<ListingVideoProjection | null> {
    const projections = await this.read(target.type === "listing" ? [target.id] : [], ownerId, target.type === "draft" ? target.id : null, true);
    return projections.get(target.id) ?? null;
  }

  async getForListings(listingIds: string[], ownerId?: string, viewerId = ownerId): Promise<Map<string, ListingVideoProjection>> {
    if (listingIds.length === 0 || !viewerId) return new Map();
    const canView = this.access.canViewVideo(viewerId);
    const canReadPending = ownerId === viewerId && this.access.canResumeVideo(viewerId);
    if ((!canView && !canReadPending) || await this.identity.isSuspended(viewerId) || await this.identity.isDeletionScheduled(viewerId)) return new Map();
    return this.read(listingIds, canReadPending ? ownerId : undefined, null, false, canView);
  }

  private async read(listingIds: string[], ownerId?: string, draftId: string | null = null, ownerOnly = false, canView = true): Promise<Map<string, ListingVideoProjection>> {
    if (listingIds.length === 0 && !draftId) return new Map();
    // One statement snapshots slot pointers and generations together. A Ready
    // pending generation is deliberately invisible until lifecycle publishes it.
    const slots = await this.prisma.$queryRaw<SlotRow[]>`
      SELECT v.id, v."ownerId", target.id AS "listingId",
        CASE WHEN a.id IS NOT NULL THEN jsonb_build_object(
          'id', a.id, 'sourceId', a."sourceId", 'status', a.status,
          'manifest', a.manifest, 'durationMs', a."durationMs", 'failureType', a."failureType", 'sourceState', sa.state
        ) END AS active,
        CASE WHEN p.id IS NOT NULL THEN jsonb_build_object(
          'id', p.id, 'sourceId', p."sourceId", 'status', p.status,
          'failureType', p."failureType", 'sourceState', sp.state
        ) END AS pending
      FROM (
        SELECT id, 'listing' AS type FROM listings
        WHERE id = ANY(${listingIds}::text[]) AND "deletedAt" IS NULL
          AND (NOT ${ownerOnly} OR ("sellerId" = ${ownerId ?? null} AND status <> 'banned'))
        UNION ALL
        SELECT id, 'draft' AS type FROM listing_drafts
        WHERE id = ${draftId} AND "userId" = ${ownerId ?? null}
      ) target
      LEFT JOIN listing_videos v ON (
        (target.type = 'listing' AND v."listingId" = target.id)
        OR (target.type = 'draft' AND v."draftId" = target.id)
      ) AND (NOT ${ownerOnly} OR v."ownerId" = ${ownerId ?? null})
      LEFT JOIN video_generations a ON a.id = v."activeGenerationId" AND a."listingVideoId" = v.id AND a.status = 'Ready'
      LEFT JOIN video_sources sa ON sa.id = a."sourceId" AND sa."listingVideoId" = v.id
      LEFT JOIN video_generations p ON p.id = v."pendingGenerationId" AND p."listingVideoId" = v.id AND v."ownerId" = ${ownerId ?? null}
      LEFT JOIN video_sources sp ON sp.id = p."sourceId" AND sp."listingVideoId" = v.id`;
    const result = new Map<string, ListingVideoProjection>();
    for (const slot of slots) {
      if (!slot.listingId) continue;
      const projection: ListingVideoProjection = {};
      const active = slot.active;
      if (canView && active && active.sourceState === "COMPLETED") {
        const manifest = active.manifest;
        const members = manifest && typeof manifest === "object" && !Array.isArray(manifest) ? manifest : {};
        const recorded = (name: string) => {
          const value = members[name];
          return value && typeof value === "object" && !Array.isArray(value) && typeof value["key"] === "string" && value["key"].length > 0 && typeof value["sizeBytes"] === "number" && value["sizeBytes"] > 0;
        };
        const qualities = ([240, 360, 720] as const).filter((tier) => recorded(`playlist:${tier}`) && Object.keys(members).some((name) => name.startsWith(`segment:${tier}:`) && recorded(name)));
        if (recorded("master") && ["thumbnail", "list", "detail", "fullscreen"].every((name) => recorded(`cover:${name}`))) {
          const parsed = ListingsSchemas.ReadyListingVideoSchema.safeParse({
            id: slot.id, generationId: active.id, galleryIndex: 1, durationMs: active.durationMs, qualities,
            cover: { thumbnail: "cover:thumbnail", list: "cover:list", detail: "cover:detail", fullscreen: "cover:fullscreen" },
          });
          if (parsed.success) projection.video = parsed.data;
        }
      }
      if (slot.ownerId === ownerId) {
        const pending = slot.pending;
        if (pending && ["Uploading", "Processing", "Failed"].includes(pending.status) && ["OPEN", "COMPLETING", "COMPLETED"].includes(pending.sourceState)) {
          const parsed = ListingsSchemas.PendingListingVideoSchema.safeParse({
            id: slot.id, generationId: pending.id, sourceId: pending.sourceId, sessionId: pending.sourceId,
            status: pending.status.toLowerCase(),
            ...(pending.failureType ? { failureType: pending.failureType } : {}),
            canReprocess: pending.status === "Failed" && pending.failureType === "TRANSIENT" && pending.sourceState === "COMPLETED",
          });
          if (parsed.success) projection.pendingVideo = parsed.data;
        }
      }
      result.set(slot.listingId, projection);
    }
    return result;
  }
}
