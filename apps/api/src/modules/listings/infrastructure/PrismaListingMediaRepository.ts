import { lockEditableBusinessStock } from "./lockEditableBusinessStock";
import { ListingOwnership, assertListingOwnership, type ListingActor } from "../application/ListingOwnership";
import { Inject, Injectable, Optional } from "@nestjs/common";
import { Prisma, PrismaService, withCampaignPreparation, type CampaignMutation } from "@auto-tm/db";

import { ListingMedia } from "../domain/ListingMedia";
import { DomainError, LISTING_ERROR_CODES } from "../domain/types";
import type { ListingMediaClaim, ListingMediaRepository } from "../domain/ports/ListingMediaRepository";
import { UPLOAD_CLAIM_PORT, type UploadClaimPort } from "../domain/ports/UploadClaimPort";

const mediaTables = ["users", "dealerships", "dealership_members", "sessions", "listings", "media_uploads", "listing_media", "media_upload_cleanups", "video_upload_sessions", "video_generations"] as const;
type MediaTable = typeof mediaTables[number];
type MediaRow = Record<string, Prisma.InputJsonValue | null>;
interface MediaSlot { table: MediaTable; key: Record<string, string>; row: MediaRow | null; uniqueOnly?: boolean }
interface MediaSelection {
  mediaIds: string[]; listingIds: string[]; uploadIds?: string[]; referencedUploadIds?: string[];
  retiringUploadIds?: string[]; floorListingId?: string; actor?: ListingActor | undefined;
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
  return JSON.stringify(value);
}

@Injectable()
export class PrismaListingMediaRepository implements ListingMediaRepository {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(UPLOAD_CLAIM_PORT) private readonly claims: UploadClaimPort,
    @Optional() @Inject(ListingOwnership) private readonly ownership?: ListingOwnership,
  ) {}

  async save(media: ListingMedia, claim?: ListingMediaClaim): Promise<ListingMedia> {
    const data = {
      id: media.id,
      listingId: media.listingId,
      kind: media.kind,
      key: media.key,
      sortOrder: media.sortOrder,
      width: media.width ?? null,
      height: media.height ?? null,
      durationMs: media.durationMs ?? null,
      posterKey: media.posterKey ?? null,
      createdAt: media.createdAt,
      uploadId: media.uploadId ?? null,
      thumbHash: media.thumbHash ?? null,
    };
    const uploadId = media.uploadId;
    if (uploadId && !claim) throw new Error("An adopting media row needs its reservation");

    // The row and the adoption commit together (ADR-0088). Listing before
    // upload is the lock order removal uses too.
    return this.prisma.$transaction(async (tx) => {
      const mutations: CampaignMutation[] = [{ table: "listing_media", key: { id: media.id }, verb: "insert", next: { ...data, createdAt: data.createdAt.toISOString() } }];
      return this.preparedMedia(tx, { mediaIds: [media.id], listingIds: [media.listingId],
        uploadIds: uploadId ? [uploadId] : [], referencedUploadIds: claim?.posterUploadId ? [claim.posterUploadId] : [], actor: claim?.actor }, mutations, async () => {
      if (!uploadId || !claim) return this.toDomain(await tx.listingMedia.create({ data }));
      const listing = await tx.listing.findUnique({ where: { id: media.listingId } });
      if (listing?.businessId) {
        if (!claim.actor) throw new Error("Business media needs current actor");
        await assertListingOwnership(this.ownership, claim.actor, { sellerId: listing.sellerId, businessId: listing.businessId }, tx);
        await lockEditableBusinessStock(tx, listing.id);
      }
      await tx.$queryRaw`SELECT id FROM listings WHERE id = ${media.listingId} FOR UPDATE`;
      const outcome = await this.claims.finalize(tx, {
        token: claim.token,
        uploadIds: [uploadId],
        target: { type: "listing", id: media.listingId },
        ...(claim.posterUploadId ? { referencedUploadIds: [claim.posterUploadId] } : {}),
      });
      if (outcome === "already") {
        // A joined retry: the other attempt committed this Listing's row first.
        const existing = await tx.listingMedia.findUnique({ where: { uploadId } });
        if (existing) return this.toDomain(existing);
        throw new DomainError(
          LISTING_ERROR_CODES.UPLOAD_ALREADY_ATTACHED,
          "Upload is already attached to a Listing",
        );
      }
      return this.toDomain(await tx.listingMedia.create({ data }));
      });
    });
  }

  async findById(id: string): Promise<ListingMedia | null> {
    const row = await this.prisma.listingMedia.findUnique({ where: { id } });
    return row ? this.toDomain(row) : null;
  }

  async findByListingId(listingId: string): Promise<ListingMedia[]> {
    const rows = await this.prisma.listingMedia.findMany({
      where: { listingId },
      orderBy: { sortOrder: "asc" },
    });
    return rows.map((r) => this.toDomain(r));
  }

  async delete(id: string): Promise<void> {
    await this.prisma.$transaction(async tx => {
      if (!await tx.listingMedia.findUnique({ where: { id } })) throw this.missingMedia();
      return this.preparedMedia(tx, { mediaIds: [id], listingIds: [] },
      [{ table: "listing_media", key: { id }, verb: "delete", next: null }], async () => {
        await tx.listingMedia.delete({ where: { id } });
      });
    });
  }

  async deleteReleasingUpload(id: string, minimumPhotos?: number, actor?: ListingActor): Promise<{ removed: boolean }> {
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.listingMedia.findUnique({ where: { id } });
      if (!row) return { removed: false };
      const initial = row;
      const upload = row.uploadId ? await tx.mediaUpload.findUnique({ where: { id: row.uploadId } }) : null;
      const retiringUploadIds = upload?.key === row.key && row.uploadId ? [row.uploadId] : [];
      return this.preparedMedia(tx, { mediaIds: [id], listingIds: [row.listingId], retiringUploadIds, actor,
        ...(minimumPhotos !== undefined ? { floorListingId: row.listingId } : {}) },
      [{ table: "listing_media", key: { id }, verb: "delete", next: null }], async () => {
        let current = initial;
        const listing = await tx.listing.findUnique({ where: { id: current.listingId } });
        if (listing?.businessId) {
          if (!actor) throw new Error("Business media needs current actor");
          await assertListingOwnership(this.ownership, actor, { sellerId: listing.sellerId, businessId: listing.businessId }, tx);
          await lockEditableBusinessStock(tx, listing.id);
        }
        if (minimumPhotos !== undefined) {
          // All removals of one Listing serialize, including distinct media IDs.
          await tx.$queryRaw`SELECT id FROM listings WHERE id = ${current.listingId} FOR UPDATE`;
          // The ID read above can precede a competing delete. Re-read after the
          // Listing lock so a lost same-ID removal is 404 before any floor check.
          const refreshed = await tx.listingMedia.findUnique({ where: { id } });
          if (!refreshed) return { removed: false };
          current = refreshed;
          const remaining = await tx.listingMedia.count({ where: {
            listingId: current.listingId, kind: "image", id: { not: id },
          } });
          if (remaining < minimumPhotos) throw new DomainError("PHOTO_MINIMUM_REQUIRED", `At least ${minimumPhotos} photos are required`);
        }

        // deleteMany reports whether this caller won; a concurrent remove sees 0.
        const { count } = await tx.listingMedia.deleteMany({ where: { id } });
        if (count === 0) return { removed: false };
        if (!current.uploadId) return { removed: true };

        // Releasing the adopter retires its upload in this transaction: the key
        // can never be adopted again, and deletion work is recorded for the
        // worker, which alone decides whether the bytes may go. A row whose key
        // is not its upload's key retires nothing.
        const currentUpload = await tx.mediaUpload.findUnique({
          where: { id: current.uploadId },
          select: { key: true },
        });
        if (currentUpload?.key === current.key) await this.claims.retire(tx, current.uploadId);
        return { removed: true };
      }, async () => {
        // Preserve the original losing-delete and floor refusals without
        // proceeding with a changed graph or extending any prepared keys.
        if (!await tx.listingMedia.findUnique({ where: { id } })) return { removed: false };
        if (minimumPhotos !== undefined && await tx.listingMedia.count({ where: {
          listingId: initial.listingId, kind: "image", id: { not: id },
        } }) < minimumPhotos) throw new DomainError("PHOTO_MINIMUM_REQUIRED", `At least ${minimumPhotos} photos are required`);
        throw new Error("media_caller_scope_changed");
      });
    });
  }

  async updateSortOrder(listingId: string, orders: { mediaId: string; sortOrder: number }[], actor?: ListingActor): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await this.preparedMedia(tx, { mediaIds: orders.map(order => order.mediaId), listingIds: [listingId], actor },
        orders.map(order => ({ table: "listing_media", key: { id: order.mediaId }, verb: "update", next: { sortOrder: order.sortOrder } })), async () => {
      const listing = await tx.listing.findUnique({ where: { id: listingId } });
      if (listing?.businessId) {
        if (!actor) throw new Error("Business media needs current actor");
        await assertListingOwnership(this.ownership, actor, { sellerId: listing.sellerId, businessId: listing.businessId }, tx);
        await lockEditableBusinessStock(tx, listing.id);
      }
      for (const order of orders) await tx.listingMedia.update({ where: { id: order.mediaId, listingId }, data: { sortOrder: order.sortOrder } });
      });
    });
  }

  private async mediaScope(tx: Prisma.TransactionClient, selection: MediaSelection) {
    const slots: MediaSlot[] = [];
    const add = async (table: MediaTable, id: unknown) => {
      if (typeof id !== "string") return;
      const key = table === "media_upload_cleanups" ? { uploadId: id } : { id };
      if (slots.some(slot => !slot.uniqueOnly && slot.table === table && canonical(slot.key) === canonical(key))) return;
      if (slots.length >= 1000) throw new Error("media_caller_scope_limit");
      const [found] = await tx.$queryRaw<{ row: MediaRow }[]>(Prisma.sql`
        SELECT to_jsonb(s) AS row FROM public.${Prisma.raw(table)} s WHERE to_jsonb(s) @> ${JSON.stringify(key)}::jsonb`);
      slots.push({ table, key, row: found?.row ?? null });
    };
    for (const id of [...new Set(selection.mediaIds)].sort()) await add("listing_media", id);
    if (selection.floorListingId) {
      const photos = await tx.listingMedia.findMany({ where: { listingId: selection.floorListingId, kind: "image" }, orderBy: { id: "asc" }, select: { id: true } });
      for (const photo of photos) await add("listing_media", photo.id);
    }
    for (const id of [...new Set(selection.listingIds)].sort()) await add("listings", id);
    const ids = [...new Set([...(selection.uploadIds ?? []), ...(selection.referencedUploadIds ?? []), ...(selection.retiringUploadIds ?? [])])].sort();
    for (const id of ids) {
      await add("media_uploads", id);
      if (selection.retiringUploadIds?.includes(id)) await add("media_upload_cleanups", id);
      slots.push({ table: "users", key: { avatarUploadId: id }, row: { avatarUploadId: id }, uniqueOnly: true });
      slots.push({ table: "listing_media", key: { uploadId: id }, row: { uploadId: id }, uniqueOnly: true });
    }
    if (ids.length) {
      const adopters = await tx.$queryRaw<{ table: "users" | "listing_media"; id: string; listingId: string | null }[]>`
        SELECT 'users' AS table, id, NULL::text AS "listingId" FROM users WHERE "avatarUploadId" = ANY(${ids}::text[])
        UNION ALL SELECT 'listing_media', id, "listingId" FROM listing_media WHERE "uploadId" = ANY(${ids}::text[]) ORDER BY 1,2`;
      for (const adopter of adopters) { await add(adopter.table, adopter.id); await add("listings", adopter.listingId); }
    }
    await add("users", selection.actor?.userId);
    await add("sessions", selection.actor?.sessionId);
    await add("dealerships", selection.actor?.businessId);
    if (selection.actor?.businessId) {
      const members = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM dealership_members WHERE "userId" = ${selection.actor.userId}
          OR ("dealershipId" = ${selection.actor.businessId} AND role = 'owner') ORDER BY id`;
      for (const member of members) await add("dealership_members", member.id);
      slots.push({ table: "dealership_members", key: { userId: selection.actor.userId },
        row: { userId: selection.actor.userId, dealershipId: selection.actor.businessId }, uniqueOnly: true });
    }
    for (let index = 0; index < slots.length; index++) {
      if (slots.length > 1000) throw new Error("media_caller_scope_limit");
      const slot = slots[index];
      if (!slot?.row || slot.uniqueOnly) continue;
      if (slot.table === "media_uploads") {
        const type = slot.row["claimTargetType"], id = slot.row["claimTargetId"];
        if (type === "profile") await add("users", id);
        if (type === "listing") await add("listings", id);
        if (type === "video_session") await add("video_upload_sessions", id);
      }
      const [meta] = await tx.$queryRaw<{ refs: { table: MediaTable; columns: string[]; target: string[] }[] }[]>`
        SELECT public.diagnostic_source_meta(${slot.table}::text)->'refs' AS refs`;
      for (const ref of meta?.refs ?? []) {
        const column = ref.columns[0];
        if (ref.columns.length === 1 && column && ref.target[0] === "id" && mediaTables.includes(ref.table)) await add(ref.table, slot.row[column]);
      }
    }
    const mutations: CampaignMutation[] = [];
    for (const id of ids) if (slots.some(slot => !slot.uniqueOnly && slot.table === "media_uploads" && slot.key["id"] === id && slot.row)) {
      const retiring = selection.retiringUploadIds?.includes(id);
      // retiredAt is allocated by the unchanged supplied helper. It has no
      // namespace, FK or unique projection in ordinary campaign preparation.
      mutations.push({ table: "media_uploads", key: { id }, verb: "update", next: retiring ? { state: "RETIRED", claimToken: null, claimDeadline: null }
        : selection.uploadIds?.includes(id) ? { state: "ADOPTED", claimToken: null, claimDeadline: null } : {} });
      const upload = slots.find(slot => !slot.uniqueOnly && slot.table === "media_uploads" && slot.key["id"] === id)?.row;
      if (retiring && upload && upload["state"] !== "RETIRED" && upload["state"] !== "DELETED"
        && !slots.find(slot => slot.table === "media_upload_cleanups" && slot.key["uploadId"] === id)?.row) {
        mutations.push({ table: "media_upload_cleanups", key: { uploadId: id }, verb: "insert", next: {
          uploadId: id, key: upload["key"] ?? null, objectKeys: upload["objectKeys"] ?? [], writeProtocol: upload["writeProtocol"] ?? null,
          status: upload["writeProtocol"] === "conditional-v1" ? "PENDING" : "LEGACY_PENDING",
        } });
      }
    }
    return { slots, mutations };
  }

  /** Ordinary media only. Source publication retains its source-command owner. */
  private async preparedMedia<T>(tx: Prisma.TransactionClient, selection: MediaSelection, writes: CampaignMutation[], work: () => Promise<T>, changed?: () => Promise<T>): Promise<T> {
    const before = await this.mediaScope(tx, selection);
    const mutations = [...writes, ...before.mutations];
    const coverage = mutations.map(mutation => {
      const existing = before.slots.some(slot => !slot.uniqueOnly && slot.table === mutation.table && canonical(slot.key) === canonical(mutation.key) && slot.row);
      if (mutation.verb === "insert" && existing) return { ...mutation, verb: "update" as const, next: {} };
      if (mutation.verb !== "insert" && !existing) throw this.missingMedia();
      return mutation;
    });
    for (const slot of before.slots) if (slot.row && !slot.uniqueOnly && !coverage.some(row => row.table === slot.table && canonical(row.key) === canonical(slot.key))) {
      coverage.push({ table: slot.table, key: slot.key, verb: "update", next: {} });
    }
    if (!coverage.length) return work();
    return withCampaignPreparation(tx, coverage, async () => {
      const [derived] = await tx.$queryRaw<{ keys: { namespace: number; key: number }[] }[]>`
        SELECT public.diagnostic_source_lock_keys_before_intake(${JSON.stringify(before.slots.filter(slot => !slot.uniqueOnly))}::jsonb,
          ${JSON.stringify({ rows: mutations })}::jsonb) || coalesce((
          SELECT jsonb_agg(DISTINCT jsonb_build_object(
            'namespace',(public.diagnostic_source_meta(s->>'table')->>'namespace')::int,
            'key',hashtext(jsonb_build_array('unique',fields,public.diagnostic_source_project(s->'row',fields))::text)))
          FROM jsonb_array_elements(${JSON.stringify(before.slots.filter(slot => slot.uniqueOnly))}::jsonb) s
          CROSS JOIN LATERAL jsonb_array_elements(public.diagnostic_source_meta(s->>'table')->'unique') fields
          WHERE NOT EXISTS (SELECT 1 FROM jsonb_each(public.diagnostic_source_project(s->'row',fields)) e WHERE e.value='null')
        ),'[]'::jsonb) || coalesce((
          SELECT jsonb_agg(DISTINCT jsonb_build_object(
            'namespace',(public.diagnostic_source_meta('dealership_members')->>'namespace')::int,
            'key',hashtext(jsonb_build_array('owner',s->'row'->'dealershipId')::text)))
          FROM jsonb_array_elements(${JSON.stringify(before.slots.filter(slot => slot.uniqueOnly && slot.table === "dealership_members"))}::jsonb) s
        ),'[]'::jsonb) AS keys`;
      if (!derived) throw new Error("media_caller_lock_keys");
      const keys = [...new Map(derived.keys.map(key => [`${key.namespace}:${key.key}`, key])).values()]
        .sort((a, b) => a.namespace - b.namespace || a.key - b.key);
      for (const namespace of [...new Set(keys.map(key => key.namespace))]) {
        for (const key of keys.filter(key => key.namespace === namespace)) await tx.$queryRaw`SELECT pg_advisory_xact_lock(${namespace}::int,${key.key}::int)::text`;
        for (const slot of before.slots.filter(slot => slot.row && !slot.uniqueOnly).sort((a, b) => canonical(a.key).localeCompare(canonical(b.key)))) {
          const [meta] = await tx.$queryRaw<{ namespace: number }[]>`
            SELECT (public.diagnostic_source_meta(${slot.table}::text)->>'namespace')::int AS namespace`;
          if (meta?.namespace === namespace) await tx.$queryRaw(Prisma.sql`
            SELECT 1 FROM public.${Prisma.raw(slot.table)} s WHERE to_jsonb(s) @> ${JSON.stringify(slot.key)}::jsonb FOR UPDATE`);
        }
      }
      if (canonical(before) !== canonical(await this.mediaScope(tx, selection))) {
        if (changed) return changed();
        throw new Error("media_caller_scope_changed");
      }
      return work();
    });
  }

  private missingMedia(): Error {
    return new Prisma.PrismaClientKnownRequestError("Listing media record not found", { code: "P2025", clientVersion: Prisma.prismaVersion.client });
  }

  private toDomain(row: {
    id: string;
    listingId: string;
    kind: string;
    key: string;
    sortOrder: number;
    width: number | null;
    height: number | null;
    durationMs: number | null;
    posterKey: string | null;
    createdAt: Date;
    uploadId: string | null;
    thumbHash: string | null;
  }): ListingMedia {
    return ListingMedia.create({
      id: row.id,
      listingId: row.listingId,
      kind: row.kind as "image" | "video",
      key: row.key,
      sortOrder: row.sortOrder,
      ...(row.width !== null ? { width: row.width } : {}),
      ...(row.height !== null ? { height: row.height } : {}),
      ...(row.durationMs !== null ? { durationMs: row.durationMs } : {}),
      ...(row.posterKey !== null ? { posterKey: row.posterKey } : {}),
      createdAt: row.createdAt,
      ...(row.uploadId !== null ? { uploadId: row.uploadId } : {}),
      ...(row.thumbHash !== null ? { thumbHash: row.thumbHash } : {}),
    });
  }
}
