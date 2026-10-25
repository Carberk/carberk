import { ListingOwnership, assertListingOwnership } from "../application/ListingOwnership";
import { randomUUID } from "node:crypto";

import { Inject, Injectable, Optional } from "@nestjs/common";
import { Prisma, PrismaService, withCampaignPreparation, type CampaignMutation } from "@auto-tm/db";

import {
  IDENTITY_CLOCK_PORT,
  type ClockPort,
} from "../../identity/identity.public";
import { DomainError, LISTING_ERROR_CODES } from "../domain/types";
import type {
  UploadClaimPort,
  UploadClaimTarget,
  UploadFinalization,
  UploadReservation,
} from "../domain/ports/UploadClaimPort";

/** Long enough for classification and Sharp; the worker recovers a stranded publish or retires another preparation after it. */
const PREPARATION_MINUTES = 10;

type Tx = Pick<PrismaService, "$queryRaw" | "$executeRaw">;

interface LockedUpload {
  id: string;
  userId: string;
  businessId: string | null;
  key: string;
  state: string;
  claimToken: string | null;
  claimTargetType: string | null;
  claimTargetId: string | null;
  writeProtocol: string;
  objectKeys: string[];
}

const tables = ["users", "dealerships", "dealership_members", "sessions", "listings", "media_uploads", "listing_media", "media_upload_cleanups", "video_upload_sessions"] as const;
type Table = typeof tables[number];
type Row = Record<string, Prisma.InputJsonValue | null>;
interface Slot { table: Table; key: Record<string, string>; row: Row | null; uniqueOnly?: boolean }
interface Selection {
  ids?: string[]; token?: string; cleanup?: string[] | "selected";
  actor?: { userId: string; sessionId?: string | undefined; businessId?: string | undefined };
  target?: UploadClaimTarget;
}
interface Plan { slots: Slot[]; uploads: LockedUpload[]; mutations: CampaignMutation[] }
interface LockKey { namespace: number; key: number }
type Patch = (upload: LockedUpload) => Row;
const releasePatch: Row = { state: "AVAILABLE", claimToken: null, claimDeadline: null, claimTargetType: null, claimTargetId: null };
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a],[b]) => a.localeCompare(b)).map(([k,v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  return JSON.stringify(value);
}
const same = (a: unknown, b: unknown) => canonical(a) === canonical(b);

const notAvailable = () =>
  new DomainError(LISTING_ERROR_CODES.UPLOAD_NOT_AVAILABLE, "Upload is no longer available");
const alreadyAttached = () =>
  new DomainError(LISTING_ERROR_CODES.UPLOAD_ALREADY_ATTACHED, "Upload is already attached");
const closed = (upload: LockedUpload) => upload.state === "RETIRED" || upload.state === "DELETED";
const heldBy = (upload: LockedUpload, target: UploadClaimTarget) =>
  upload.claimTargetType === target.type && upload.claimTargetId === target.id;

/** The outer entries prepare their entire upload/authority/adopter union before
 * managed locks. Supplied entries reuse their owner's live database receipt. */
@Injectable()
export class PrismaUploadClaims implements UploadClaimPort {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(IDENTITY_CLOCK_PORT) private readonly clock: ClockPort,
    @Optional() @Inject(ListingOwnership) private readonly ownership?: ListingOwnership,
  ) {}

  async reserve(input: Parameters<UploadClaimPort["reserve"]>[0]): Promise<UploadReservation> {
    const token = randomUUID();
    const deadline = new Date(this.clock.now().getTime() + PREPARATION_MINUTES * 60_000);
    return this.prisma.$transaction(async (tx) => this.prepared(tx, { ids: input.uploadIds, actor: input, target: input.target },
      upload => upload.state === "AVAILABLE" ? { state: "PREPARING", claimToken: token,
        claimTargetType: input.target.type, claimTargetId: input.target.id, claimDeadline: deadline.toISOString() } : {}, async plan => {
      if (input.businessId) await assertListingOwnership(this.ownership, input, { businessId: input.businessId }, tx);
      const uploads = plan.uploads;
      if (uploads.length !== new Set(input.uploadIds).size ||
        uploads.some((upload) => (input.businessId ? upload.businessId !== input.businessId : upload.businessId || upload.userId !== input.userId) || closed(upload))) {
        throw notAvailable();
      }
      const mine = uploads.every((upload) => heldBy(upload, input.target));
      if (mine && uploads.every((upload) => upload.state === "ADOPTED")) return { alreadyAdopted: true };
      // A retry for the same target joins the attempt already in flight. The
      // joiner must not abandon the token: only the attempt that created it may.
      const joined = uploads[0]?.claimToken;
      if (mine && joined && uploads.every((u) => u.state === "PREPARING" && u.claimToken === joined)) {
        return { token: joined, joined: true };
      }
      if (uploads.some((upload) => upload.state !== "AVAILABLE") ||
        (await this.adopters(tx, input.uploadIds)) > 0) {
        throw alreadyAttached();
      }

      await tx.$executeRaw`
        UPDATE media_uploads SET "state" = 'PREPARING', "claimToken" = ${token},
          "claimTargetType" = ${input.target.type}, "claimTargetId" = ${input.target.id},
          "claimDeadline" = ${deadline}
        WHERE id = ANY(${input.uploadIds}::text[])`;
      return { token, joined: false };
    }));
  }

  async finalize(tx: unknown, input: UploadFinalization): Promise<"adopted" | "already"> {
    const db = tx as Tx;
    const referenced = input.referencedUploadIds ?? [];
    const plan = await this.assertPrepared(db, { ids: [...input.uploadIds, ...referenced], target: input.target },
      upload => input.uploadIds.includes(upload.id) ? { state: "ADOPTED", claimToken: null, claimDeadline: null } : {});
    const locked = plan.uploads;
    const byId = new Map(locked.map((upload) => [upload.id, upload]));
    if (referenced.some((id) => { const upload = byId.get(id); return !upload || closed(upload); })) {
      throw notAvailable();
    }
    const uploads = input.uploadIds.map((id) => byId.get(id));
    if (uploads.some((upload) => !upload || closed(upload))) throw notAvailable();
    const held = uploads as LockedUpload[];
    if (held.every((upload) => upload.state === "ADOPTED" && heldBy(upload, input.target))) return "already";
    if (held.some((u) => u.state !== "PREPARING" || u.claimToken !== input.token || !heldBy(u, input.target))) {
      throw alreadyAttached();
    }
    if ((await this.adopters(db, input.uploadIds)) > 0) throw alreadyAttached();
    await db.$executeRaw`
      UPDATE media_uploads SET "state" = 'ADOPTED', "claimToken" = NULL, "claimDeadline" = NULL
      WHERE id = ANY(${input.uploadIds}::text[])`;
    return "adopted";
  }

  async retire(tx: unknown, uploadId: string): Promise<boolean> {
    const db = tx as Tx;
    const retiredAt = this.clock.now();
    const plan = await this.assertPrepared(db, { ids: [uploadId], cleanup: [uploadId] },
      () => ({ state: "RETIRED", retiredAt: retiredAt.toISOString(), claimToken: null, claimDeadline: null }));
    return this.retirePrepared(db, uploadId, retiredAt, plan.uploads[0]);
  }

  private async retirePrepared(db: Tx, uploadId: string, retiredAt: Date, upload?: LockedUpload): Promise<boolean> {
    if (!upload || closed(upload)) return false;
    await db.$executeRaw`
      UPDATE media_uploads SET "state" = 'RETIRED', "retiredAt" = ${retiredAt},
        "claimToken" = NULL, "claimDeadline" = NULL
      WHERE id = ${uploadId}`;
    // The exact manifest is copied so the work outlives this row. An unfenced
    // legacy upload is recorded, and its bytes stay until deletion is proven safe.
    const fenced = upload.writeProtocol === "conditional-v1";
    await db.$executeRaw`
      INSERT INTO media_upload_cleanups ("uploadId", "key", "objectKeys", "writeProtocol", "status")
      VALUES (${upload.id}, ${upload.key}, ${upload.objectKeys}::text[], ${upload.writeProtocol},
        ${fenced ? "PENDING" : "LEGACY_PENDING"})
      ON CONFLICT ("uploadId") DO NOTHING`;
    return true;
  }

  async abandon(token: string): Promise<void> {
    const retiredAt = this.clock.now();
    await this.prisma.$transaction(async tx => this.prepared(tx, { token, cleanup: "selected" },
      () => ({ state: "RETIRED", retiredAt: retiredAt.toISOString(), claimToken: null, claimDeadline: null }), async plan => {
        for (const upload of plan.uploads) await this.retirePrepared(tx, upload.id, retiredAt, upload);
      }));
  }

  async release(token: string): Promise<void> {
    await this.prisma.$transaction(async tx => this.prepared(tx, { token }, () => releasePatch, async plan => {
      await this.releasePrepared(tx, plan.uploads.map(upload => upload.id));
    }));
  }

  async settle(token: string, retiredUploadId: string): Promise<boolean> {
    const retiredAt = this.clock.now();
    return this.prisma.$transaction(async tx => this.prepared(tx, { token, cleanup: [retiredUploadId] },
      upload => upload.id === retiredUploadId ? { state: "RETIRED", retiredAt: retiredAt.toISOString(), claimToken: null, claimDeadline: null } : releasePatch,
      async plan => {
        if (!plan.uploads.some(upload => upload.id === retiredUploadId)) return false;
        for (const upload of plan.uploads) {
          if (upload.id === retiredUploadId) await this.retirePrepared(tx, upload.id, retiredAt, upload);
          else await this.releasePrepared(tx, [upload.id]);
        }
        return true;
      }));
  }

  async retireUnclaimed(uploadId: string, userId: string, stillInvalid: () => Promise<boolean>): Promise<boolean> {
    const retiredAt = this.clock.now();
    return this.prisma.$transaction(async tx => this.prepared(tx, { ids: [uploadId], cleanup: [uploadId] },
      () => ({ state: "RETIRED", retiredAt: retiredAt.toISOString(), claimToken: null, claimDeadline: null }), async plan => {
        const [upload] = plan.uploads;
        if (!upload || upload.userId !== userId || upload.state !== "AVAILABLE" ||
          (await this.adopters(tx, [uploadId])) > 0 || !(await stillInvalid())) return false;
        return this.retirePrepared(tx, uploadId, retiredAt, upload);
      }));
  }

  private async releasePrepared(tx: Tx, ids: string[]): Promise<void> {
    if (!ids.length) return;
    await tx.$executeRaw`
      UPDATE media_uploads SET "state" = 'AVAILABLE',
        "claimToken" = NULL, "claimDeadline" = NULL,
        "claimTargetType" = NULL, "claimTargetId" = NULL
      WHERE id = ANY(${ids}::text[])`;
  }

  /** Finite discovery for these claim methods only. Reads do not acquire managed
   * locks. OLD authority and targets, NEW targets and negative adopter slots all
   * participate in the initial union, including missing IDs. */
  private async discover(db: Tx, selection: Selection, patch: Patch): Promise<Plan> {
    const slots: Slot[] = [];
    const add = async (table: Table, id: unknown): Promise<Slot | undefined> => {
      if (typeof id !== "string") return undefined;
      const key = table === "media_upload_cleanups" ? { uploadId: id } : { id };
      const prior = slots.find(slot => slot.table === table && same(slot.key, key));
      if (prior) return prior;
      const [found] = await db.$queryRaw<{ row: Row }[]>(Prisma.sql`
        SELECT to_jsonb(s) AS row FROM public.${Prisma.raw(table)} s WHERE to_jsonb(s) @> ${JSON.stringify(key)}::jsonb`);
      const slot: Slot = { table, key, row: found?.row ?? null };
      slots.push(slot);
      return slot;
    };
    let ids = selection.ids ?? [];
    if (selection.token !== undefined) {
      const selected = await db.$queryRaw<{ id: string }[]>`
        SELECT id FROM media_uploads WHERE "claimToken" = ${selection.token} AND "state" = 'PREPARING' ORDER BY id`;
      ids = selected.map(row => row.id);
    }
    const uploads: LockedUpload[] = [];
    for (const id of [...new Set(ids)].sort()) {
      const upload = await add("media_uploads", id);
      if (upload?.row) uploads.push(upload.row as unknown as LockedUpload);
      if (selection.cleanup === "selected" || selection.cleanup?.includes(id)) await add("media_upload_cleanups", id);
      // Synthetic rows supply metadata-owned UNIQUE keys, not a fabricated PK row.
      slots.push({ table: "users", key: { avatarUploadId: id }, row: { avatarUploadId: id }, uniqueOnly: true });
      slots.push({ table: "listing_media", key: { uploadId: id }, row: { uploadId: id }, uniqueOnly: true });
    }
    const target = async (type: unknown, id: unknown) => {
      if (type === "profile") await add("users", id);
      if (type === "listing") await add("listings", id);
      // video_session is an existing stored target, never a new public claim type.
      if (type === "video_session") await add("video_upload_sessions", id);
    };
    for (const upload of uploads) await target(upload.claimTargetType, upload.claimTargetId);
    if (selection.target) await target(selection.target.type, selection.target.id);
    await add("users", selection.actor?.userId);
    await add("sessions", selection.actor?.sessionId);
    await add("dealerships", selection.actor?.businessId);
    const adopters = await db.$queryRaw<{ table: "users" | "listing_media"; id: string; listingId: string | null }[]>`
      SELECT 'users' AS table, id, NULL::text AS "listingId" FROM users WHERE "avatarUploadId" = ANY(${ids}::text[])
      UNION ALL SELECT 'listing_media', id, "listingId" FROM listing_media WHERE "uploadId" = ANY(${ids}::text[]) ORDER BY 1,2`;
    for (const adopter of adopters) {
      await add(adopter.table, adopter.id);
      await add("listings", adopter.listingId);
    }
    if (selection.actor?.businessId) {
      const members = await db.$queryRaw<{ id: string }[]>`
        SELECT id FROM dealership_members WHERE "userId" = ${selection.actor.userId}
          OR ("dealershipId" = ${selection.actor.businessId} AND role = 'owner') ORDER BY id`;
      for (const member of members) await add("dealership_members", member.id);
      slots.push({ table: "dealership_members", key: { userId: selection.actor.userId },
        row: { userId: selection.actor.userId, dealershipId: selection.actor.businessId }, uniqueOnly: true });
    }
    // Follow the existing registry's actual forward references, including owner
    // Sessions, current membership Business and retained avatar/FK parents.
    for (let i = 0; i < slots.length; i++) {
      if (slots.length > 1000) throw new Error("upload_claim_scope_limit");
      const slot = slots[i];
      if (!slot) continue;
      if (!slot.row || slot.uniqueOnly) continue;
      const [meta] = await db.$queryRaw<{ refs: { table: Table; columns: string[]; target: string[] }[] }[]>`
        SELECT public.diagnostic_source_meta(${slot.table}::text)->'refs' AS refs`;
      for (const ref of meta?.refs ?? []) {
        const column = ref.columns[0];
        if (ref.columns.length === 1 && column && ref.target[0] === "id" && tables.includes(ref.table)) await add(ref.table, slot.row[column]);
      }
    }
    const mutations: CampaignMutation[] = [];
    for (const upload of uploads) {
      const next = patch(upload);
      mutations.push({ table: "media_uploads", key: { id: upload.id }, verb: "update", next });
      if (next["state"] === "RETIRED" && !closed(upload) &&
        !slots.find(slot => slot.table === "media_upload_cleanups" && slot.key["uploadId"] === upload.id)?.row) {
        mutations.push({ table: "media_upload_cleanups", key: { uploadId: upload.id }, verb: "insert", next: {
          uploadId: upload.id, key: upload.key, objectKeys: upload.objectKeys, writeProtocol: upload.writeProtocol,
          status: upload.writeProtocol === "conditional-v1" ? "PENDING" : "LEGACY_PENDING",
        } });
      }
    }
    return { slots, uploads, mutations };
  }

  private async keys(db: Tx, plan: Plan): Promise<LockKey[]> {
    const [derived] = await db.$queryRaw<{ keys: LockKey[] }[]>`
      SELECT public.diagnostic_source_lock_keys(${JSON.stringify(plan.slots.filter(slot => !slot.uniqueOnly))}::jsonb,
        ${JSON.stringify({ rows: plan.mutations })}::jsonb) || coalesce((
          SELECT jsonb_agg(DISTINCT jsonb_build_object(
            'namespace',(public.diagnostic_source_meta(s->>'table')->>'namespace')::int,
            'key',hashtext(jsonb_build_array('unique',fields,public.diagnostic_source_project(s->'row',fields))::text)))
          FROM jsonb_array_elements(${JSON.stringify(plan.slots.filter(slot => slot.uniqueOnly))}::jsonb) s
          CROSS JOIN LATERAL jsonb_array_elements(public.diagnostic_source_meta(s->>'table')->'unique') fields
          WHERE NOT EXISTS (SELECT 1 FROM jsonb_each(public.diagnostic_source_project(s->'row',fields)) e WHERE e.value='null')
        ),'[]'::jsonb) || coalesce((
          SELECT jsonb_agg(DISTINCT jsonb_build_object(
            'namespace',(public.diagnostic_source_meta('dealership_members')->>'namespace')::int,
            'key',hashtext(jsonb_build_array('owner',s->'row'->'dealershipId')::text)))
          FROM jsonb_array_elements(${JSON.stringify(plan.slots.filter(slot => slot.uniqueOnly && slot.table === "dealership_members"))}::jsonb) s
        ),'[]'::jsonb) AS keys`;
    if (!derived) throw new Error("upload_claim_lock_keys");
    return derived.keys;
  }

  private campaignMutations(plan: Plan): CampaignMutation[] {
    // Read dependencies may bring their own campaign namespace. Their current
    // rows are observations, never speculative source commands or insert values.
    const coverage: CampaignMutation[] = [...plan.mutations];
    for (const slot of plan.slots) if (slot.row && !slot.uniqueOnly && !coverage.some(m => m.table === slot.table && same(m.key, slot.key))) {
      coverage.push({ table: slot.table, key: slot.key, verb: "update", next: {} });
    }
    return coverage;
  }

  private async prepared<T>(tx: Prisma.TransactionClient, selection: Selection, patch: Patch, work: (plan: Plan) => Promise<T>): Promise<T> {
    const before = await this.discover(tx, selection, patch);
    const coverage = this.campaignMutations(before);
    if (!coverage.length) return work(before);
    return withCampaignPreparation(tx, coverage, async () => {
      const keys = await this.keys(tx, before);
      for (const namespace of [...new Set(keys.map(key => key.namespace))].sort((a,b) => a-b)) {
        for (const key of keys.filter(key => key.namespace === namespace).sort((a,b) => a.key-b.key)) {
          await tx.$queryRaw`SELECT pg_advisory_xact_lock(${namespace}::int,${key.key}::int)`;
        }
        for (const slot of before.slots.filter(slot => !slot.uniqueOnly && slot.row).sort((a,b) => canonical(a.key).localeCompare(canonical(b.key)))) {
          const [meta] = await tx.$queryRaw<{ namespace: number }[]>`
            SELECT (public.diagnostic_source_meta(${slot.table}::text)->>'namespace')::int AS namespace`;
          if (meta?.namespace === namespace) await tx.$queryRaw(Prisma.sql`
            SELECT 1 FROM public.${Prisma.raw(slot.table)} s WHERE to_jsonb(s) @> ${JSON.stringify(slot.key)}::jsonb FOR UPDATE`);
        }
      }
      if (!same(before, await this.discover(tx, selection, patch))) throw new Error("upload_claim_scope_changed");
      return work(before);
    });
  }

  /** Read only reuse: live backend/full-xid receipt, complete campaign namespace
   * and metadata-key coverage. No marker, preparation, finish or late lock here. */
  private async assertPrepared(db: Tx, selection: Selection, patch: Patch): Promise<Plan> {
    const plan = await this.discover(db, selection, patch);
    const keys = await this.keys(db, plan);
    const [receipt] = await db.$queryRaw<{ covered: boolean }[]>`
      WITH live AS (
        SELECT p.scope FROM public.campaign_preparations p
        LEFT JOIN public.diagnostic_source_commands s
          ON p.backend_pid=s.backend_pid AND p.full_transaction_id=s.full_transaction_id
        WHERE p.backend_pid=pg_backend_pid() AND p.full_transaction_id=pg_current_xact_id()::text
      ), required AS (
        SELECT CASE WHEN jsonb_array_length(${JSON.stringify(this.campaignMutations(plan))}::jsonb)=0
          THEN '{"namespaces":[],"tracked":[]}'::jsonb
          ELSE public.campaign_preparation_scope(${JSON.stringify(this.campaignMutations(plan))}::jsonb) END AS scope
      )
      SELECT NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(required.scope->'namespaces') n
          WHERE NOT (live.scope->'namespaces' ? n)
      ) AND NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(required.scope->'tracked') t
          WHERE NOT (live.scope->'tracked' ? t)
      ) AND NOT EXISTS (
        SELECT 1 FROM jsonb_to_recordset(${JSON.stringify(keys)}::jsonb) k(namespace integer,key integer)
        WHERE NOT EXISTS (SELECT 1 FROM pg_locks l WHERE l.pid=pg_backend_pid() AND l.granted
          AND l.locktype='advisory' AND l.objsubid=2 AND l.classid::bigint=k.namespace
          AND l.objid::bigint=(k.key::bigint & 4294967295))
      ) AS covered FROM live CROSS JOIN required`;
    if (!receipt) throw new Error("upload_claim_preparation_missing");
    if (!receipt.covered) throw new Error("upload_claim_preparation_uncovered");
    return plan;
  }

  /**
   * Rows of either kind that already point at these uploads, counted under
   * their locks. Covers a row written before this protocol recorded state; the
   * unique columns stay a backstop.
   */
  private async adopters(db: Tx, ids: string[]): Promise<number> {
    const [row] = await db.$queryRaw<{ total: bigint }[]>`
      SELECT (SELECT count(*) FROM listing_media WHERE "uploadId" = ANY(${ids}::text[])) +
             (SELECT count(*) FROM users WHERE "avatarUploadId" = ANY(${ids}::text[])) AS total`;
    return Number(row?.total ?? 0);
  }
}
