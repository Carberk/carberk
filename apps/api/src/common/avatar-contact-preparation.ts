import { Prisma, withCampaignPreparation, type CampaignMutation } from "@auto-tm/db";

export const AVATAR_CONTACT_UUID_FACTORY = Symbol("AvatarContactUuidFactory");

type Tx = Prisma.TransactionClient;
type Row = Record<string, Prisma.InputJsonValue | null>;
const tables = ["users", "media_uploads", "media_upload_cleanups", "listing_media", "listings", "dealerships",
  "dealership_members", "sessions", "verified_contact_phones", "content_reports", "audit_logs", "video_generations", "video_upload_sessions"] as const;
type Table = typeof tables[number];
interface Slot { table: Table; key: Record<string, string>; row: Row | null }
interface Plan { slots: Slot[]; mutations: CampaignMutation[] }
export class AvatarContactScopeChanged extends Error {
  readonly removedUserId: string | undefined;
  constructor(before: Plan, after: Plan) {
    super("avatar_contact_scope_changed");
    const oldUser = before.slots[0];
    const currentUser = after.slots[0];
    if (oldUser?.table === "users" && typeof oldUser.row?.["avatarKey"] === "string" &&
      currentUser?.row?.["avatarKey"] === null && currentUser.row["avatarUploadId"] === null) {
      this.removedUserId = oldUser.key["id"];
    }
  }
}
const canonical = (value: unknown): string => JSON.stringify(value, (_key, item: unknown) =>
  item && typeof item === "object" && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
const same = (a: unknown, b: unknown): boolean => canonical(a) === canonical(b);
const update = (table: Table, key: Record<string, string>, next: Row): CampaignMutation => ({ table, key, verb: "update", next });
const insert = (table: Table, key: Record<string, string>, next: Row): CampaignMutation => ({ table, key, verb: "insert", next });

async function read(tx: Tx, table: Table, key: Record<string, string>): Promise<Slot> {
  const [value] = await tx.$queryRaw<{ row: Row | null }[]>`
    SELECT public.diagnostic_source_read(${table}::text,${JSON.stringify(key)}::jsonb) AS row`;
  return { table, key, row: value?.row ?? null };
}
async function add(tx: Tx, slots: Slot[], table: Table, id: unknown): Promise<Slot | undefined> {
  if (typeof id !== "string") return undefined;
  const key = table === "media_upload_cleanups" ? { uploadId: id } : { id };
  const found = slots.find(s => s.table === table && same(s.key, key));
  if (found) return found;
  const slot = await read(tx, table, key);
  slots.push(slot);
  return slot;
}

async function closeReferences(tx: Tx, plan: Plan): Promise<Plan> {
  // Finite forward closure over this caller's rows, not a scan of unrelated rows.
  // Registry endpoints include retained User.suspendedById and avatar references.
  for (let i = 0; i < plan.slots.length; i++) {
    if (plan.slots.length > 1000) throw new Error("avatar_contact_scope_limit");
    const slot = plan.slots[i];
    if (!slot?.row) continue;
    const [meta] = await tx.$queryRaw<{ refs: { table: string; columns: string[]; target: string[] }[] }[]>`
      SELECT public.diagnostic_source_meta(${slot.table}::text)->'refs' AS refs`;
    for (const ref of meta?.refs ?? []) {
      const column = ref.columns[0];
      if (!column || typeof slot.row[column] !== "string") continue;
      if (ref.columns.length !== 1 || ref.target.length !== 1 || ref.target[0] !== "id" ||
        !tables.includes(ref.table as Table)) throw new Error(`avatar_contact_reference_unsupported:${slot.table}.${column}->${ref.table}`);
      await add(tx, plan.slots, ref.table as Table, slot.row[column]);
    }
  }
  return plan;
}

/** Private implementation shared only by the three finite caller preparations below.
 * The SQL registry owns numeric lock keys, including absent PK/unique slots.
 * This is ordinary campaign preparation, never a diagnostic source operation. */
async function run<T>(tx: Tx, discover: () => Promise<Plan>, work: (plan: Plan) => Promise<T>): Promise<T> {
  const before = await closeReferences(tx, await discover());
  if (!before.mutations.length) return work(before); // missing User: no managed locks or writes
  return withCampaignPreparation(tx, before.mutations, async () => {
    const [derived] = await tx.$queryRaw<{ keys: { namespace: number; key: number }[] }[]>`
      SELECT public.diagnostic_source_lock_keys_before_intake(${JSON.stringify(before.slots)}::jsonb,
        ${JSON.stringify({ rows: before.mutations })}::jsonb) AS keys`;
    if (!derived) throw new Error("avatar_contact_lock_keys");
    const namespaces = [...new Set(derived.keys.map(k => k.namespace))].sort((a, b) => a - b);
    for (const namespace of namespaces) {
      for (const key of derived.keys.filter(k => k.namespace === namespace).sort((a, b) => a.key - b.key)) {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(${namespace}::int,${key.key}::int)::text`;
      }
      // Metadata determines the same row class order used by the source kernel.
      for (const slot of [...before.slots].sort((a, b) => JSON.stringify(a.key).localeCompare(JSON.stringify(b.key)))) {
        const [meta] = await tx.$queryRaw<{ namespace: number }[]>`
          SELECT (public.diagnostic_source_meta(${slot.table}::text)->>'namespace')::int AS namespace`;
        if (meta?.namespace !== namespace || !slot.row) continue;
        // Table is a closed internal union, never caller input.
        await tx.$queryRaw(Prisma.sql`SELECT 1 FROM public.${Prisma.raw(slot.table)} s
          WHERE to_jsonb(s) @> ${JSON.stringify(slot.key)}::jsonb FOR UPDATE`);
      }
    }
    // Separate READ COMMITTED statements after all waits. No extension or retry.
    const after = await closeReferences(tx, await discover());
    if (!same(before, after)) throw new AvatarContactScopeChanged(before, after);
    return work(before);
  });
}

export interface PhotoRemovalAudit {
  id: string; actorId: string; action: string; targetType: string; targetId: string; details: (avatarKey: string | null) => Row;
}
export interface PhotoRemovalPreparation {
  audit: PhotoRemovalAudit;
  report?: { id: string; reviewedAt: Date } | undefined;
}
async function photoPlan(tx: Tx, userId: string, proposed?: { uploadId: string; key: string }, removal?: PhotoRemovalPreparation): Promise<Plan> {
  const slots: Slot[] = [];
  const user = await add(tx, slots, "users", userId);
  const mutations: CampaignMutation[] = [];
  if (!user?.row) return { slots, mutations };
  const ids = [...new Set([user.row["avatarUploadId"], proposed?.uploadId].filter((id): id is string => typeof id === "string"))].sort();
  for (const id of ids) {
    const upload = await add(tx, slots, "media_uploads", id);
    const cleanup = await add(tx, slots, "media_upload_cleanups", id);
    await add(tx, slots, "users", upload?.row?.["userId"]);
    await add(tx, slots, "dealerships", upload?.row?.["businessId"]);
    const adopters = await tx.$queryRaw<{ table: "users" | "listing_media"; id: string; listingId: string | null }[]>`
      SELECT 'users' AS table, id, NULL::text AS "listingId" FROM users WHERE "avatarUploadId"=${id}
      UNION ALL SELECT 'listing_media', id, "listingId" FROM listing_media WHERE "uploadId"=${id}
      ORDER BY 1,2`;
    for (const adopter of adopters) {
      await add(tx, slots, adopter.table, adopter.id);
      await add(tx, slots, "listings", adopter.listingId);
    }
    // Both adopter negative unique slots participate even when no adopter exists.
    slots.push({ table: "listing_media", key: { uploadId: id }, row: { uploadId: id } });
    if (!upload?.row) continue;
    if (proposed?.uploadId === id) {
      mutations.push(update("media_uploads", { id }, { state: "ADOPTED", claimToken: null, claimDeadline: null }));
    } else if (!["RETIRED", "DELETED"].includes(String(upload.row["state"]))) {
      mutations.push(update("media_uploads", { id }, { state: "RETIRED", claimToken: null, claimDeadline: null }));
      if (!cleanup?.row) mutations.push(insert("media_upload_cleanups", { uploadId: id }, {
        uploadId: id, key: upload.row["key"] ?? null, objectKeys: upload.row["objectKeys"] ?? [],
        writeProtocol: upload.row["writeProtocol"] ?? null,
        status: upload.row["writeProtocol"] === "conditional-v1" ? "PENDING" : "LEGACY_PENDING",
      }));
    }
  }
  mutations.push(update("users", { id: userId }, {
    avatarUploadId: proposed?.uploadId ?? null, avatarKey: proposed?.key ?? null,
  }));
  if (removal) {
    await add(tx, slots, "users", removal.audit.actorId);
    await add(tx, slots, "audit_logs", removal.audit.id);
    mutations.push(insert("audit_logs", { id: removal.audit.id }, { ...removal.audit, details: removal.audit.details(typeof user.row["avatarKey"] === "string" ? user.row["avatarKey"] : null) }));
    if (removal.report) {
      const report = await add(tx, slots, "content_reports", removal.report.id);
      await add(tx, slots, "users", report?.row?.["reporterUserId"]);
      await add(tx, slots, "users", report?.row?.["reviewedById"]);
      mutations.push(update("content_reports", { id: removal.report.id }, {
        status: "actioned", reviewedById: removal.audit.actorId, reviewedAt: removal.report.reviewedAt.toISOString(),
      }));
    }
  }
  return { slots, mutations };
}

interface PreparedAvatar {
  id: string; backend_pid: number; full_transaction_id: string; plan: Plan;
}
// Capability is private to this finite helper and exists only during work after
// every dependency lock and revalidation. A campaign intent alone cannot mint it.
const preparedAvatars = new WeakMap<Tx, PreparedAvatar>();
async function liveReceipt(tx: Tx) {
  const [receipt] = await tx.$queryRaw<(Omit<PreparedAvatar, "plan"> & { mutations: CampaignMutation[] })[]>`
    SELECT id::text,backend_pid,full_transaction_id,mutations FROM public.campaign_preparations
    WHERE backend_pid=pg_backend_pid() AND full_transaction_id=pg_current_xact_id()::text`;
  return receipt;
}

export function withAvatarPreparation<T>(tx: Tx, userId: string, proposed: { uploadId: string; key: string } | undefined,
  removal: PhotoRemovalPreparation | undefined, work: (present: boolean) => Promise<T>): Promise<T> {
  let present = false;
  return run(tx, async () => {
    const plan = await photoPlan(tx, userId, proposed, removal);
    present = !!plan.slots[0]?.row;
    return plan;
  }, async plan => {
    if (!plan.mutations.length) return work(present);
    const receipt = await liveReceipt(tx);
    if (!receipt) throw new Error("avatar_release_preparation_missing");
    preparedAvatars.set(tx, { id: receipt.id, backend_pid: receipt.backend_pid,
      full_transaction_id: receipt.full_transaction_id, plan });
    try { return await work(present); }
    finally { preparedAvatars.delete(tx); }
  });
}

/** A supplied helper must reuse a live same-backend/transaction ordinary receipt.
 * Check the exact current release union before its first lock. Never prepare here. */
export async function assertAvatarReleasePreparation(tx: Tx, userId: string): Promise<void> {
  const receipt = await liveReceipt(tx);
  if (!receipt) throw new Error("avatar_release_preparation_missing");
  const required = await closeReferences(tx, await photoPlan(tx, userId));
  if (required.mutations.some(m => !receipt.mutations.some(covered => covered.table === m.table &&
    same(covered.key, m.key) && covered.verb === m.verb && same(covered.next, m.next)))) {
    throw new Error("avatar_release_preparation_uncovered");
  }
  const completed = preparedAvatars.get(tx);
  if (!completed || completed.id !== receipt.id || completed.backend_pid !== receipt.backend_pid ||
    completed.full_transaction_id !== receipt.full_transaction_id) throw new Error("avatar_release_dependencies_unprepared");
  if (required.slots.some(slot => !completed.plan.slots.some(covered => same(covered, slot)))) {
    throw new Error("avatar_release_preparation_uncovered");
  }
}

export async function withVerifiedContactPreparation<T>(tx: Tx, input: { sellerId: string; phone: string; confirmedAt: Date }, allocatedId: string,
  work: (id: string) => Promise<T>): Promise<T> {
  let id: string = allocatedId;
  return run(tx, async () => {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM verified_contact_phones WHERE "sellerId"=${input.sellerId} AND phone=${input.phone}`;
    id = rows[0]?.id ?? allocatedId;
    const slots: Slot[] = [];
    await add(tx, slots, "users", input.sellerId);
    const existing = await add(tx, slots, "verified_contact_phones", id);
    const next = { id, sellerId: input.sellerId, phone: input.phone, confirmedAt: input.confirmedAt.toISOString() };
    return { slots, mutations: [(existing?.row ? update : insert)("verified_contact_phones", { id }, next)] };
  }, () => work(id));
}

export function withBusinessContactPreparation<T>(tx: Tx, input: { userId: string; sessionId: string; businessId: string; phone: string; confirmedAt: Date },
  work: () => Promise<T>): Promise<T> {
  return run(tx, async () => {
    const slots: Slot[] = [];
    await add(tx, slots, "users", input.userId);
    const session = await add(tx, slots, "sessions", input.sessionId);
    await add(tx, slots, "users", session?.row?.["userId"]);
    const business = await add(tx, slots, "dealerships", input.businessId);
    const members = await tx.$queryRaw<{ id: string; userId: string; dealershipId: string }[]>`
      SELECT id,"userId","dealershipId" FROM dealership_members WHERE "userId"=${input.userId}
        OR ("dealershipId"=${input.businessId} AND role='owner') ORDER BY id`;
    for (const member of members) {
      await add(tx, slots, "users", member.userId);
      await add(tx, slots, "dealerships", member.dealershipId);
      await add(tx, slots, "dealership_members", member.id);
    }
    // Current-owner and absent unique-user keys use the existing source protocol.
    const absentMember: Slot = { table: "dealership_members", key: { userId: input.userId },
      row: { userId: input.userId, dealershipId: input.businessId } };
    slots.push(absentMember);
    const plan = await closeReferences(tx, { slots, mutations: [] });
    // A missing Business is an authority refusal, not a proposed write to an
    // absent row. Observe actual dependencies through the ordinary campaign
    // prefix while retaining the complete negative-key scope for revalidation.
    plan.mutations = business?.row ? [update("dealerships", { id: input.businessId }, {
      contactPhone: input.phone, contactConfirmedAt: input.confirmedAt.toISOString(),
    })] : plan.slots.filter(slot => slot.row && slot !== absentMember)
      .map(slot => update(slot.table, slot.key, {}));
    return plan;
  }, work);
}
