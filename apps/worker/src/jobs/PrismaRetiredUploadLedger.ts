import { Inject, Injectable } from "@nestjs/common";
import { Prisma, PrismaService, withCampaignPreparation, type CampaignMutation } from "@auto-tm/db";

import type { CleanupWork, RetiredUploadLedger } from "./retiredUploadCleanup";

/** The first retry waits this long; each further failure doubles it, up to the cap. */
const BACKOFF_BASE_SECONDS = 60;
const BACKOFF_CAP_SECONDS = 6 * 60 * 60;

/**
 * Cleanup state in Postgres (ADR-0088). Work lives in `media_upload_cleanups`,
 * which has no foreign key, so it outlives the upload record and its User.
 * Only `PENDING` work is ever taken; `LEGACY_PENDING` stays untouched.
 */
@Injectable()
export class PrismaRetiredUploadLedger implements RetiredUploadLedger {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async retireExpiredPreparations(now: Date, limit: number): Promise<number> {
    // Publish reserves a new Listing id; that Listing appears only when it
    // commits with adoption. Attach reserves an existing Listing, and Profile
    // Photo uses a profile target. Recovery and finalization take the same lock.
    return this.prisma.$transaction(tx => this.prepared(tx, { kind: "recover", now, limit }, 0, async plan => {
      const [result] = await tx.$queryRaw<{ recovered: bigint }[]>`
        WITH stranded AS (
          SELECT upload.id, upload."claimDeadline" AS deadline,
            (upload."claimTargetType" = 'listing' AND NOT EXISTS (
              SELECT 1 FROM listings WHERE id = upload."claimTargetId"
            )) AS publish
          FROM media_uploads AS upload
          WHERE upload.id = ANY(${plan.ids}::text[])
            AND upload."state" = 'PREPARING' AND upload."claimDeadline" < ${now}
            AND upload."writeProtocol" <> 'video-v1'
            AND NOT EXISTS (
              SELECT 1 FROM listing_media WHERE "uploadId" = upload.id
                OR starts_with("key", regexp_replace(upload."key", '[^/]+$', ''))
                OR starts_with("posterKey", regexp_replace(upload."key", '[^/]+$', ''))
            )
            AND NOT EXISTS (
              SELECT 1 FROM users WHERE "avatarUploadId" = upload.id
                OR starts_with("avatarKey", regexp_replace(upload."key", '[^/]+$', ''))
            )
          ORDER BY upload."claimDeadline", upload.id LIMIT ${limit}::int
          FOR UPDATE OF upload SKIP LOCKED
        ), recovered AS (
          UPDATE media_uploads SET "state" = CASE WHEN stranded.publish THEN 'AVAILABLE' ELSE 'RETIRED' END,
            "retiredAt" = CASE WHEN stranded.publish THEN media_uploads."retiredAt" ELSE ${now} END,
            "claimToken" = NULL, "claimDeadline" = NULL,
            "claimTargetType" = CASE WHEN stranded.publish THEN NULL ELSE media_uploads."claimTargetType" END,
            "claimTargetId" = CASE WHEN stranded.publish THEN NULL ELSE media_uploads."claimTargetId" END
          FROM stranded WHERE media_uploads.id = stranded.id
          RETURNING media_uploads.id, media_uploads."key", media_uploads."objectKeys",
            media_uploads."writeProtocol", media_uploads."state", stranded.deadline
        ), cleanup AS (
          INSERT INTO media_upload_cleanups ("uploadId", "key", "objectKeys", "writeProtocol", "status", "nextAttemptAt")
          SELECT id, "key", "objectKeys", "writeProtocol",
            CASE WHEN "writeProtocol" = 'conditional-v1' THEN 'PENDING' ELSE 'LEGACY_PENDING' END, deadline
          FROM recovered WHERE "state" = 'RETIRED'
          ON CONFLICT ("uploadId") DO NOTHING
        )
        SELECT count(*) AS recovered FROM recovered`;
      return Number(result?.recovered ?? 0);
    }));
  }

  async lease(now: Date, limit: number): Promise<CleanupWork[]> {
    // Taking work and scheduling its next attempt are one statement, so the
    // backoff is saved before any deletion starts. SKIP LOCKED keeps two
    // overlapping sweeps from taking the same work.
    return this.prisma.$transaction(tx => this.prepared(tx, { kind: "lease", now, limit }, [], async plan => tx.$queryRaw<CleanupWork[]>`
      UPDATE media_upload_cleanups AS work
      SET "attempts" = work."attempts" + 1,
        "nextAttemptAt" = ${now}::timestamp + LEAST(
          ${BACKOFF_BASE_SECONDS}::float8 * power(2::float8, LEAST(work."attempts", 30)),
          ${BACKOFF_CAP_SECONDS}::float8) * interval '1 second'
      FROM (
        SELECT "uploadId" FROM media_upload_cleanups
        WHERE "uploadId" = ANY(${plan.ids}::text[])
          AND "status" = 'PENDING' AND "nextAttemptAt" <= ${now}
        ORDER BY "nextAttemptAt", "uploadId" LIMIT ${limit}::int FOR UPDATE SKIP LOCKED
      ) AS due
      WHERE work."uploadId" = due."uploadId"
      RETURNING work."uploadId", work."key", work."objectKeys", work."writeProtocol", work."attempts"`));
  }

  async blockingReference(work: CleanupWork, directory: string): Promise<string | null> {
    // New references are written only through the claim, which refuses a
    // retired upload, so none can appear after this read. Rows from before the
    // claim, with no upload link, are found by their key.
    const [found] = await this.prisma.$queryRaw<{ live: bigint; listing: bigint; profile: bigint }[]>`
      SELECT
        (SELECT count(*) FROM media_uploads WHERE id = ${work.uploadId} AND "state" <> 'RETIRED') AS live,
        (SELECT count(*) FROM listing_media WHERE "uploadId" = ${work.uploadId}
          OR starts_with("key", ${directory}) OR starts_with("posterKey", ${directory})) AS listing,
        (SELECT count(*) FROM users WHERE "avatarUploadId" = ${work.uploadId}
          OR starts_with("avatarKey", ${directory})) AS profile`;
    if (Number(found?.live ?? 0) > 0) return "Live claim: the upload is not retired";
    if (Number(found?.listing ?? 0) > 0) return "Live reference: Listing media still uses this directory";
    if (Number(found?.profile ?? 0) > 0) return "Live reference: a Profile Photo still uses this directory";
    return null;
  }

  async complete(uploadId: string, now: Date): Promise<void> {
    await this.prisma.$transaction(tx => this.prepared(tx, { kind: "complete", uploadId, now }, undefined, async plan => {
      const upload = plan.slots.find(s => s.table === "media_uploads" && s.key["id"] === uploadId)?.row;
      if ((upload && upload["state"] !== "RETIRED" && upload["state"] !== "DELETED") || plan.references.length) {
        throw new Error("retired_upload_live_reference");
      }
      await tx.mediaUploadCleanup.update({
        where: { uploadId }, data: { status: "DONE", completedAt: now, lastError: null },
      });
      if (upload?.["state"] === "RETIRED") await tx.mediaUpload.updateMany({ where: { id: uploadId, state: "RETIRED" }, data: { state: "DELETED" } });
    }));
  }

  async recordFailure(uploadId: string, reason: string): Promise<void> {
    await this.prisma.$transaction(tx => this.prepared(tx, { kind: "failure", uploadId, reason }, undefined, async () => {
      await tx.mediaUploadCleanup.update({ where: { uploadId }, data: { lastError: reason } });
    }));
  }

  /** One unlocked bounded selection, then the whole OLD/NEW/absent dependency
   * union. No storage operation or source command runs in this transaction. */
  private async discover(tx: Prisma.TransactionClient, selection: Selection): Promise<Plan> {
    let ids: string[];
    if (selection.kind === "recover") {
      const rows = await tx.$queryRaw<{ id: string }[]>`
        SELECT upload.id FROM media_uploads upload
        WHERE upload."state"='PREPARING' AND upload."claimDeadline" < ${selection.now}
          AND upload."writeProtocol" <> 'video-v1'
          AND NOT EXISTS (SELECT 1 FROM listing_media WHERE "uploadId"=upload.id
            OR starts_with(key,regexp_replace(upload.key,'[^/]+$',''))
            OR starts_with("posterKey",regexp_replace(upload.key,'[^/]+$','')))
          AND NOT EXISTS (SELECT 1 FROM users WHERE "avatarUploadId"=upload.id
            OR starts_with("avatarKey",regexp_replace(upload.key,'[^/]+$','')))
        ORDER BY upload."claimDeadline",upload.id LIMIT ${selection.limit}::int`;
      ids = rows.map(r => r.id);
    } else if (selection.kind === "lease") {
      const rows = await tx.$queryRaw<{ id: string }[]>`
        SELECT "uploadId" AS id FROM media_upload_cleanups
        WHERE status='PENDING' AND "nextAttemptAt" <= ${selection.now}
        ORDER BY "nextAttemptAt","uploadId" LIMIT ${selection.limit}::int`;
      ids = rows.map(r => r.id);
    } else ids = [selection.uploadId];
    const slots: Slot[] = [];
    const references: { table: string; id: string }[] = [];
    const add = async (table: string, id: unknown): Promise<void> => {
      if (typeof id !== "string") return;
      if (!TABLES.includes(table)) throw new Error("retired_upload_reference_table");
      const key = table === "media_upload_cleanups" ? { uploadId: id } : { id };
      if (slots.some(s => s.table === table && same(s.key, key))) return;
      if (slots.length >= 1000) throw new Error("retired_upload_scope_limit");
      const [found] = await tx.$queryRaw<{ row: Row }[]>(Prisma.sql`
        SELECT to_jsonb(s) AS row FROM public.${Prisma.raw(table)} s WHERE to_jsonb(s) @> ${JSON.stringify(key)}::jsonb`);
      slots.push({ table, key, row: found?.row ?? null });
    };
    for (const id of ids) { await add("media_uploads", id); await add("media_upload_cleanups", id); }
    // Both reverse UNIQUE keys are needed even when there is no adopter yet.
    // Legacy references have no upload FK; retain their full rows and parents.
    for (const id of ids) {
      const upload = slots.find(s => s.table === "media_uploads" && s.key["id"] === id)?.row;
      const cleanup = slots.find(s => s.table === "media_upload_cleanups" && s.key["uploadId"] === id)?.row;
      const key = upload?.["key"] ?? cleanup?.["key"];
      if (typeof key !== "string") continue;
      const directory = key.replace(/[^/]+$/, "");
      const found = await tx.$queryRaw<{ table: string; id: string }[]>`
        SELECT 'users' AS table,id FROM users WHERE "avatarUploadId"=${id}
          OR starts_with("avatarKey",${directory})
        UNION ALL SELECT 'listing_media',id FROM listing_media WHERE "uploadId"=${id}
          OR starts_with(key,${directory}) OR starts_with("posterKey",${directory}) ORDER BY 1,2 LIMIT 1001`;
      references.push(...found);
      for (const ref of found) await add(ref.table, ref.id);
    }
    // Follow the metadata's actual stored FK endpoints recursively. The cleanup
    // registry edge is a lock dependency only: its table deliberately has no FK.
    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      if (!slot?.row) continue;
      const [meta] = await tx.$queryRaw<Meta[]>`SELECT (public.diagnostic_source_meta(${slot.table})->>'namespace')::int AS namespace,
        public.diagnostic_source_meta(${slot.table})->'refs' AS refs`;
      if (!meta) throw new Error("retired_upload_metadata");
      for (const ref of meta.refs) {
        if (ref.columns.length !== 1 || ref.target.length !== 1 || ref.target[0] !== "id") throw new Error("retired_upload_reference_key");
        await add(ref.table, slot.row[ref.columns[0] ?? ""]);
      }
      if (slot.table !== "media_uploads") continue;
      const type = slot.row["claimTargetType"], target = slot.row["claimTargetId"];
      if (type === "listing") await add("listings", target);
      if (type === "profile") await add("users", target);
      if (type === "video_session") await add("video_upload_sessions", target);
    }
    const mutations: CampaignMutation[] = [];
    for (const id of ids) {
      const upload = slots.find(s => s.table === "media_uploads" && s.key["id"] === id)?.row;
      const cleanup = slots.find(s => s.table === "media_upload_cleanups" && s.key["uploadId"] === id)?.row;
      if (selection.kind === "recover" && upload) {
        const publish = upload["claimTargetType"] === "listing" && !slots.find(s => s.table === "listings" && s.key["id"] === upload["claimTargetId"])?.row;
        mutations.push({ table: "media_uploads", key: { id }, verb: "update", next: {
          state: publish ? "AVAILABLE" : "RETIRED", retiredAt: publish ? upload["retiredAt"] ?? null : selection.now.toISOString(),
          claimToken: null, claimDeadline: null,
          claimTargetType: publish ? null : upload["claimTargetType"] ?? null,
          claimTargetId: publish ? null : upload["claimTargetId"] ?? null,
        } });
        if (!publish && !cleanup) mutations.push({ table: "media_upload_cleanups", key: { uploadId: id }, verb: "insert", next: {
          uploadId: id, key: upload["key"] ?? null, objectKeys: upload["objectKeys"] ?? null, writeProtocol: upload["writeProtocol"] ?? null,
          status: upload["writeProtocol"] === "conditional-v1" ? "PENDING" : "LEGACY_PENDING", nextAttemptAt: upload["claimDeadline"] ?? null,
        } });
      }
      if (selection.kind === "lease" && cleanup) mutations.push({ table: "media_upload_cleanups", key: { uploadId: id }, verb: "update", next: {
        attempts: Number(cleanup["attempts"]) + 1,
        nextAttemptAt: new Date(selection.now.getTime() + Math.min(BACKOFF_BASE_SECONDS * 2 ** Math.min(Number(cleanup["attempts"]), 30), BACKOFF_CAP_SECONDS) * 1000).toISOString(),
      } });
      if (selection.kind === "complete") {
        mutations.push({ table: "media_upload_cleanups", key: { uploadId: id }, verb: "update", next: { status: "DONE", completedAt: selection.now.toISOString(), lastError: null } });
        if (upload?.["state"] === "RETIRED") mutations.push({ table: "media_uploads", key: { id }, verb: "update", next: { state: "DELETED" } });
      }
      if (selection.kind === "failure") mutations.push({ table: "media_upload_cleanups", key: { uploadId: id }, verb: "update", next: { lastError: selection.reason } });
    }
    return { ids, slots, references, mutations };
  }

  private async prepared<T>(tx: Prisma.TransactionClient, selection: Selection, skipped: T, work: (plan: Plan) => Promise<T>): Promise<T> {
    const before = await this.discover(tx, selection);
    if (!before.ids.length) return skipped;
    const coverage = [...before.mutations];
    for (const slot of before.slots) if (slot.row && !coverage.some(m => m.table === slot.table && same(m.key, slot.key))) {
      coverage.push({ table: slot.table, key: slot.key, verb: "update", next: {} });
    }
    return withCampaignPreparation(tx, coverage, async () => {
      const unique = before.ids.flatMap(id => [
        { table: "users", row: { avatarUploadId: id } }, { table: "listing_media", row: { uploadId: id } },
      ]);
      const [derived] = await tx.$queryRaw<{ keys: { namespace: number; key: number }[] }[]>`
        SELECT public.diagnostic_source_lock_keys_before_intake(${JSON.stringify(before.slots)}::jsonb,
          ${JSON.stringify({ rows: before.mutations })}::jsonb) || coalesce((
          SELECT jsonb_agg(DISTINCT jsonb_build_object('namespace',(public.diagnostic_source_meta(s->>'table')->>'namespace')::int,
            'key',hashtext(jsonb_build_array('unique',fields,public.diagnostic_source_project(s->'row',fields))::text)))
          FROM jsonb_array_elements(${JSON.stringify(unique)}::jsonb) s
          CROSS JOIN LATERAL jsonb_array_elements(public.diagnostic_source_meta(s->>'table')->'unique') fields
          WHERE NOT EXISTS (SELECT 1 FROM jsonb_each(public.diagnostic_source_project(s->'row',fields)) e WHERE e.value='null')
        ),'[]'::jsonb) AS keys`;
      if (!derived) throw new Error("retired_upload_lock_keys");
      const keys = [...new Map(derived.keys.map(k => [`${k.namespace}:${k.key}`, k])).values()].sort((a,b) => a.namespace-b.namespace || a.key-b.key);
      const batch = selection.kind === "recover" || selection.kind === "lease";
      for (const namespace of [...new Set(keys.map(k => k.namespace))]) {
        for (const key of keys.filter(k => k.namespace === namespace)) {
          if (batch) {
            const [locked] = await tx.$queryRaw<{ locked: boolean }[]>`SELECT pg_try_advisory_xact_lock(${namespace}::int,${key.key}::int) AS locked`;
            if (!locked?.locked) return skipped;
          } else await tx.$queryRaw`SELECT pg_advisory_xact_lock(${namespace}::int,${key.key}::int)::text AS locked`;
        }
        for (const slot of before.slots.filter(s => s.row).sort((a,b) => canonical(a.key).localeCompare(canonical(b.key)))) {
          const [meta] = await tx.$queryRaw<Meta[]>`SELECT (public.diagnostic_source_meta(${slot.table})->>'namespace')::int AS namespace`;
          if (meta?.namespace !== namespace) continue;
          const rows = await tx.$queryRaw<{ locked: number }[]>(Prisma.sql`
            SELECT 1 AS locked FROM public.${Prisma.raw(slot.table)} s WHERE to_jsonb(s) @> ${JSON.stringify(slot.key)}::jsonb
            FOR UPDATE ${Prisma.raw(batch ? "SKIP LOCKED" : "")}`);
          if (batch && !rows.length) return skipped;
        }
      }
      if (!same(before, await this.discover(tx, selection))) throw new Error("retired_upload_scope_changed");
      return work(before);
    });
  }
}

const TABLES: readonly string[] = ["users", "dealerships", "dealership_members", "listings", "listing_drafts", "media_uploads", "media_upload_cleanups", "listing_media", "video_upload_sessions", "video_generations"];
type Row = Record<string, Prisma.InputJsonValue | null>;
interface Slot { table: string; key: Record<string, string>; row: Row | null }
interface Meta { namespace: number; refs: { table: string; columns: string[]; target: string[] }[] }
interface Plan { ids: string[]; slots: Slot[]; references: { table: string; id: string }[]; mutations: CampaignMutation[] }
type Selection = { kind: "recover"; now: Date; limit: number }
  | { kind: "lease"; now: Date; limit: number }
  | { kind: "complete"; uploadId: string; now: Date }
  | { kind: "failure"; uploadId: string; reason: string };
const canonical = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a],[b]) => a.localeCompare(b)).map(([k,v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  return JSON.stringify(value);
};
const same = (a: unknown, b: unknown) => canonical(a) === canonical(b);
