import { ListingOwnership, assertListingOwnership, type ListingActor } from "../application/ListingOwnership";
import { Inject, Injectable, Optional } from "@nestjs/common";
import { Prisma, PrismaService, withCampaignPreparation, type CampaignMutation } from "@auto-tm/db";

import type { MediaUpload, NewMediaUpload, UploadState } from "../domain/MediaUpload";
import type { MediaUploadRepository } from "../domain/ports/MediaUploadRepository";

const registrationTables = ["users", "dealerships", "dealership_members", "sessions", "listings", "media_uploads", "listing_media", "media_upload_cleanups", "video_upload_sessions", "video_generations"] as const;
type RegistrationTable = typeof registrationTables[number];
type RegistrationRow = Record<string, Prisma.InputJsonValue | null>;
interface RegistrationSlot { table: RegistrationTable; key: Record<string, string>; row: RegistrationRow | null }
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
  return JSON.stringify(value);
}

@Injectable()
export class PrismaMediaUploadRepository implements MediaUploadRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService, @Optional() @Inject(ListingOwnership) private readonly ownership?: ListingOwnership) {}

  async record(upload: NewMediaUpload, actor?: ListingActor): Promise<void> {
    const data = {
      id: upload.id, userId: upload.userId, businessId: upload.businessId ?? null,
      key: upload.key, kind: upload.kind, contentType: upload.contentType, sizeBytes: upload.sizeBytes,
      writeProtocol: upload.writeProtocol ?? "legacy", objectKeys: upload.objectKeys ?? [], createdAt: upload.createdAt,
    };
    await this.prisma.$transaction(async (tx) => {
      // Discovery is unlocked. The campaign fence and the complete finite key
      // union precede current authority, FK/index locks and the actual insert.
      const before = await this.registrationScope(tx, upload, actor);
      const mutation: CampaignMutation = { table: "media_uploads", key: { id: upload.id }, verb: "insert",
        next: { ...data, createdAt: data.createdAt.toISOString() } };
      const observations: CampaignMutation[] = before.slots.filter(slot => slot.row && !(slot.table === "media_uploads" && slot.key["id"] === upload.id))
        .map(slot => ({ table: slot.table, key: slot.key, verb: "update", next: {} }));
      await withCampaignPreparation(tx, [mutation, ...observations], async () => {
        const [derived] = await tx.$queryRaw<{ keys: { namespace: number; key: number }[] }[]>`
          SELECT public.diagnostic_source_lock_keys_before_intake(${JSON.stringify(before.slots)}::jsonb,
            ${JSON.stringify({ rows: [mutation] })}::jsonb) || coalesce((
            SELECT jsonb_agg(DISTINCT jsonb_build_object(
              'namespace',(public.diagnostic_source_meta('dealership_members')->>'namespace')::int,
              'key',hashtext(jsonb_build_array('unique',fields,public.diagnostic_source_project(s,fields))::text)))
            FROM jsonb_array_elements(${JSON.stringify(before.membershipSlots)}::jsonb) s
            CROSS JOIN LATERAL jsonb_array_elements(public.diagnostic_source_meta('dealership_members')->'unique') fields
            WHERE NOT EXISTS (SELECT 1 FROM jsonb_each(public.diagnostic_source_project(s,fields)) e WHERE e.value='null')
          ),'[]'::jsonb) || coalesce((
            SELECT jsonb_agg(DISTINCT jsonb_build_object(
              'namespace',(public.diagnostic_source_meta('dealership_members')->>'namespace')::int,
              'key',hashtext(jsonb_build_array('owner',s->'dealershipId')::text)))
            FROM jsonb_array_elements(${JSON.stringify(before.membershipSlots)}::jsonb) s
          ),'[]'::jsonb) AS keys`;
        if (!derived) throw new Error("media_registration_lock_keys");
        const keys = [...new Map(derived.keys.map(key => [`${key.namespace}:${key.key}`, key])).values()]
          .sort((a, b) => a.namespace - b.namespace || a.key - b.key);
        for (const namespace of [...new Set(keys.map(key => key.namespace))]) {
          for (const key of keys.filter(key => key.namespace === namespace)) {
            await tx.$queryRaw`SELECT pg_advisory_xact_lock(${namespace}::int,${key.key}::int)::text`;
          }
          for (const slot of before.slots.filter(slot => slot.row).sort((a, b) => canonical(a.key).localeCompare(canonical(b.key)))) {
            const [meta] = await tx.$queryRaw<{ namespace: number }[]>`
              SELECT (public.diagnostic_source_meta(${slot.table}::text)->>'namespace')::int AS namespace`;
            if (meta?.namespace === namespace) await tx.$queryRaw(Prisma.sql`
              SELECT 1 FROM public.${Prisma.raw(slot.table)} s WHERE to_jsonb(s) @> ${JSON.stringify(slot.key)}::jsonb FOR UPDATE`);
          }
        }
        if (canonical(before) !== canonical(await this.registrationScope(tx, upload, actor))) throw new Error("media_registration_scope_changed");
        if (upload.businessId) {
          if (!actor) throw new Error("Business upload requires current actor");
          await assertListingOwnership(this.ownership, actor, upload, tx);
        }
        await tx.mediaUpload.create({ data });
      });
    });
  }

  private async registrationScope(tx: Prisma.TransactionClient, upload: NewMediaUpload, actor?: ListingActor) {
    const slots: RegistrationSlot[] = [];
    const add = async (table: RegistrationTable, id: unknown) => {
      if (typeof id !== "string") return;
      const key = table === "media_upload_cleanups" ? { uploadId: id } : { id };
      if (slots.some(slot => slot.table === table && canonical(slot.key) === canonical(key))) return;
      if (slots.length >= 1000) throw new Error("media_registration_scope_limit");
      const [found] = await tx.$queryRaw<{ row: RegistrationRow }[]>(Prisma.sql`
        SELECT to_jsonb(s) AS row FROM public.${Prisma.raw(table)} s WHERE to_jsonb(s) @> ${JSON.stringify(key)}::jsonb`);
      slots.push({ table, key, row: found?.row ?? null });
    };
    await add("media_uploads", upload.id);
    await add("users", upload.userId);
    await add("dealerships", upload.businessId);
    await add("users", actor?.userId);
    await add("sessions", actor?.sessionId);
    await add("dealerships", actor?.businessId);
    const membershipSlots: RegistrationRow[] = [];
    if (upload.businessId && actor) {
      const members = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM dealership_members WHERE "userId" = ${actor.userId}
          OR ("dealershipId" = ${upload.businessId} AND role = 'owner') ORDER BY id`;
      for (const member of members) await add("dealership_members", member.id);
      membershipSlots.push({ userId: actor.userId, dealershipId: upload.businessId });
    }
    // Metadata owns forward references. Newly found endpoints are visited too,
    // including an actor's different Business, retained avatar and suspender.
    for (let index = 0; index < slots.length; index++) {
      const slot = slots[index];
      if (!slot?.row) continue;
      const [meta] = await tx.$queryRaw<{ refs: { table: RegistrationTable; columns: string[]; target: string[] }[] }[]>`
        SELECT public.diagnostic_source_meta(${slot.table}::text)->'refs' AS refs`;
      for (const ref of meta?.refs ?? []) {
        const column = ref.columns[0];
        if (ref.columns.length === 1 && column && ref.target[0] === "id" && registrationTables.includes(ref.table)) await add(ref.table, slot.row[column]);
      }
    }
    return { slots, membershipSlots };
  }

  async findByKeys(keys: string[]): Promise<MediaUpload[]> {
    if (keys.length === 0) return [];
    const rows = await this.prisma.mediaUpload.findMany({
      where: { key: { in: keys } },
      include: { media: { select: { id: true } } },
    });
    return rows.map((row) => ({
      id: row.id,
      userId: row.userId,
      ...(row.businessId ? { businessId: row.businessId } : {}),
      key: row.key,
      kind: row.kind,
      contentType: row.contentType,
      sizeBytes: row.sizeBytes,
      writeProtocol: row.writeProtocol as "legacy" | "conditional-v1",
      objectKeys: row.objectKeys,
      createdAt: row.createdAt,
      adopted: row.state === "ADOPTED" || row.media !== null,
      state: row.state as UploadState,
    }));
  }
}
