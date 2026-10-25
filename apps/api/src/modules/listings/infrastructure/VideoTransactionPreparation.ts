import { Prisma, withCampaignPreparation, type CampaignMutation } from "@auto-tm/db";

// Private to the video callers. This is dependency preparation, never source
// write authority. Keep this finite set aligned with the video effect inventory.
const tables = ["users", "sessions", "dealerships", "dealership_members", "listings", "listing_drafts", "media_uploads", "listing_media", "media_upload_cleanups", "video_upload_sessions", "video_generations", "video_process_work", "video_grants", "video_cleanup_work"] as const;
type Table = typeof tables[number];
type Row = Record<string, Prisma.InputJsonValue | null>;
interface Slot { table: Table; key: Record<string, string>; row: Row | null; uniqueOnly?: boolean }
interface Meta { namespace: number; refs: { table: string; columns: string[]; target: string[] }[] }
interface Plan { slots: Slot[]; mutations: CampaignMutation[] }
export interface VideoSelection {
  userId?: string | undefined; sessionId?: string | undefined; businessId?: string | undefined;
  target?: { kind: string; id: string } | undefined;
  videoSessionId?: string | undefined; generationId?: string | undefined;
  cleanupId?: string | undefined; uploadId?: string | undefined;
  grantHash?: string | undefined;
  inserts?: readonly CampaignMutation[] | undefined;
  retiring?: boolean | undefined;
  measurementEventId?: string | undefined;
}
const canonical = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  return JSON.stringify(value);
};
const same = (a: unknown, b: unknown) => canonical(a) === canonical(b);
const pk = (table: Table, id: string) => table === "media_upload_cleanups" ? { uploadId: id } : table === "video_process_work" ? { generationId: id } : { id };

/** Discover the complete finite video/authority union before the first lock.
 * Full rows deliberately participate in rediscovery, including lease/fence and
 * manifest changes. A changed graph aborts; it is never extended after waiting. */
async function discover(tx: Prisma.TransactionClient, selection: VideoSelection): Promise<Plan> {
  const slots: Slot[] = [];
  const add = async (table: Table, id: unknown): Promise<void> => {
    if (typeof id !== "string") return;
    const key = pk(table, id);
    if (slots.some(s => s.table === table && same(s.key, key))) return;
    if (slots.length >= 1000) throw new Error("VIDEO_PREPARATION_LIMIT");
    const [found] = await tx.$queryRaw<{ row: Row }[]>(Prisma.sql`
      SELECT to_jsonb(s) AS row FROM public.${Prisma.raw(table)} s WHERE to_jsonb(s) @> ${JSON.stringify(key)}::jsonb`);
    slots.push({ table, key, row: found?.row ?? null });
  };
  const unique = (table: Table, row: Row) => {
    if (!slots.some(s => s.uniqueOnly && s.table === table && same(s.row, row))) {
      if (slots.length >= 1000) throw new Error("VIDEO_PREPARATION_LIMIT");
      slots.push({ table, key: {}, row, uniqueOnly: true });
    }
  };
  const target = async (kind: unknown, id: unknown) => {
    if (kind === "listing") await add("listings", id);
    if (kind === "draft") await add("listing_drafts", id);
    if (kind === "profile") await add("users", id);
    if (kind === "video_session") await add("video_upload_sessions", id);
  };
  await add("users", selection.userId);
  await add("sessions", selection.sessionId);
  await add("dealerships", selection.businessId);
  if (selection.target) await target(selection.target.kind, selection.target.id);
  await add("video_upload_sessions", selection.videoSessionId);
  await add("video_generations", selection.generationId);
  await add("video_cleanup_work", selection.cleanupId);
  await add("media_uploads", selection.uploadId);
  if (selection.grantHash) {
    unique("video_grants", { secretHash: selection.grantHash });
    const grants = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM video_grants WHERE "secretHash"=${selection.grantHash} ORDER BY id`;
    for (const grant of grants) await add("video_grants", grant.id);
  }
  for (const insert of selection.inserts ?? []) {
    if (!tables.includes(insert.table as Table) || insert.verb !== "insert") throw new Error("VIDEO_PREPARATION_INSERT");
    const table = insert.table as Table;
    if (table === "video_upload_sessions" && insert.next?.["userId"] && insert.next["idempotencyKey"]) {
      const existing = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM video_upload_sessions WHERE "userId"=${insert.next["userId"]} AND "idempotencyKey"=${insert.next["idempotencyKey"]} ORDER BY id`;
      for (const session of existing) await add("video_upload_sessions", session.id);
    }
    const id = Object.values(insert.key)[0];
    await add(table, id);
  }
  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i];
    if (!slot || slot.uniqueOnly) continue;
    const proposed = selection.inserts?.find(m => m.table === slot.table && same(m.key, slot.key))?.next;
    // A proposed insert supplies NEW unique/FK endpoints without pretending that
    // the absent PK exists. OLD and NEW are both passed to metadata derivation.
    const row = slot.row ?? proposed;
    if (row) {
      const [meta] = await tx.$queryRaw<Meta[]>`SELECT (public.diagnostic_source_meta(${slot.table})->>'namespace')::int AS namespace, public.diagnostic_source_meta(${slot.table})->'refs' AS refs`;
      if (!meta) throw new Error("VIDEO_PREPARATION_METADATA");
      for (const ref of meta.refs) {
        const column = ref.columns[0];
        if (!column || ref.columns.length !== 1 || ref.target.length !== 1 || ref.target[0] !== "id" || !tables.includes(ref.table as Table)) throw new Error("VIDEO_PREPARATION_REFERENCE");
        await add(ref.table as Table, row[column]);
      }
    }
    const id = Object.values(slot.key)[0];
    if (!id) throw new Error("VIDEO_PREPARATION_KEY");
    if (slot.table === "users") {
      unique("dealership_members", { userId: id });
      const members = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM dealership_members WHERE "userId"=${id} ORDER BY id`;
      for (const member of members) await add("dealership_members", member.id);
    }
    if (slot.table === "dealerships") {
      unique("dealership_members", { dealershipId: id });
      const owners = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM dealership_members WHERE "dealershipId"=${id} AND role='owner' ORDER BY id`;
      for (const owner of owners) await add("dealership_members", owner.id);
    }
    if (slot.table === "media_uploads") {
      unique("users", { avatarUploadId: id }); unique("listing_media", { uploadId: id });
      await add("media_upload_cleanups", id);
      if (row) await target(row["claimTargetType"], row["claimTargetId"]);
      const adopters = await tx.$queryRaw<{ table: "users" | "listing_media"; id: string }[]>`
        SELECT 'users' AS table,id FROM users WHERE "avatarUploadId"=${id}
        UNION ALL SELECT 'listing_media',id FROM listing_media WHERE "uploadId"=${id} ORDER BY 1,2`;
      for (const adopter of adopters) await add(adopter.table, adopter.id);
      if (row && typeof row["key"] === "string") {
        const references = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM listing_media WHERE key=${row["key"]} OR "posterKey"=${row["key"]} ORDER BY id`;
        for (const reference of references) await add("listing_media", reference.id);
      }
    }
    if (slot.table === "listing_drafts") {
      // Drafts have no pending pointer. All revisions participate so a newer
      // reservation cannot appear unnoticed during a wait.
      const sessions = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM video_upload_sessions WHERE "targetKind"='draft' AND "targetId"=${id} ORDER BY id`;
      for (const session of sessions) await add("video_upload_sessions", session.id);
    }
    if (slot.table === "video_upload_sessions") {
      await add("video_generations", id); await add("video_process_work", id);
      await add("video_cleanup_work", `session:${id}`);
      if (row) await target(row["targetKind"], row["targetId"]);
    }
    if (slot.table === "video_cleanup_work" && row) {
      const objectKeys = Array.isArray(row["objectKeys"]) ? row["objectKeys"] : [];
      const references = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM listing_media WHERE key=ANY(${[row["sourceKey"], ...objectKeys]}::text[]) OR "posterKey"=ANY(${objectKeys}::text[]) ORDER BY id`;
      for (const reference of references) await add("listing_media", reference.id);
    }
    if (slot.table === "video_generations") {
      await add("video_process_work", id);
      const grants = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM video_grants WHERE "generationId"=${id} ORDER BY id`;
      for (const grant of grants) await add("video_grants", grant.id);
      // Both reverse Listing pointer slots matter, including malformed foreign
      // references which must be refused by the production caller.
      const listings = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM listings WHERE "activeVideoGenerationId"=${id} OR "pendingVideoGenerationId"=${id} ORDER BY id`;
      for (const listing of listings) await add("listings", listing.id);
    }

  }
  const mutations: CampaignMutation[] = [...selection.inserts ?? []];
  for (const slot of slots) if (slot.row && !slot.uniqueOnly && !mutations.some(m => m.table === slot.table && same(m.key, slot.key))) mutations.push({ table: slot.table, key: slot.key, verb: "update", next: {} });
  if (selection.retiring) for (const slot of slots) {
    if (slot.table !== "media_uploads" || !slot.row || slot.row["writeProtocol"] !== "video-v1" || ["RETIRED", "DELETED"].includes(String(slot.row["state"]))) continue;
    const upload = slot.row;
    if (!slots.some(s => s.table === "media_upload_cleanups" && s.key["uploadId"] === upload["id"] && s.row)) mutations.push({ table: "media_upload_cleanups", key: { uploadId: String(upload["id"]) }, verb: "insert", next: { uploadId: upload["id"] ?? null, key: upload["key"] ?? null, objectKeys: upload["objectKeys"] ?? null, writeProtocol: upload["writeProtocol"] ?? null, status: upload["writeProtocol"] === "conditional-v1" ? "PENDING" : "LEGACY_PENDING" } });
  }
  return { slots: slots.sort((a,b) => canonical([a.table,a.key,a.uniqueOnly]).localeCompare(canonical([b.table,b.key,b.uniqueOnly]))), mutations };
}

/** Every public ledger entry calls this before Identity/target/upload locks.
 * Existing supplied claim calls reuse this receipt; never nest preparation. */
export async function preparedVideo<T>(tx: Prisma.TransactionClient, selection: VideoSelection, work: () => Promise<T>): Promise<T> {
  const before = await discover(tx, selection);
  const run = async () => {
    const [derived] = await tx.$queryRaw<{ keys: { namespace: number; key: number }[] }[]>`
      SELECT public.diagnostic_source_lock_keys_before_intake(${JSON.stringify(before.slots.filter(s => !s.uniqueOnly))}::jsonb, ${JSON.stringify({ rows: before.mutations })}::jsonb)
      || coalesce((SELECT jsonb_agg(DISTINCT jsonb_build_object('namespace',(public.diagnostic_source_meta(s->>'table')->>'namespace')::int,'key',hashtext(jsonb_build_array('unique',fields,public.diagnostic_source_project(s->'row',fields))::text)))
        FROM jsonb_array_elements(${JSON.stringify(before.slots.filter(s => s.uniqueOnly))}::jsonb) s
        CROSS JOIN LATERAL jsonb_array_elements(public.diagnostic_source_meta(s->>'table')->'unique') fields
        WHERE NOT EXISTS(SELECT 1 FROM jsonb_each(public.diagnostic_source_project(s->'row',fields)) e WHERE e.value='null')), '[]'::jsonb)
      || coalesce((SELECT jsonb_agg(DISTINCT jsonb_build_object('namespace',(public.diagnostic_source_meta('dealership_members')->>'namespace')::int,'key',hashtext(jsonb_build_array('owner',s->'row'->'dealershipId')::text)))
        FROM jsonb_array_elements(${JSON.stringify(before.slots.filter(s => s.uniqueOnly && s.table === "dealership_members" && s.row?.["dealershipId"]))}::jsonb) s), '[]'::jsonb) AS keys`;
    if (!derived) throw new Error("VIDEO_PREPARATION_KEYS");
    const keys = [...new Map(derived.keys.map(k => [`${k.namespace}:${k.key}`, k])).values()].sort((a,b) => a.namespace-b.namespace || a.key-b.key);
    for (const namespace of [...new Set(keys.map(k => k.namespace))]) {
      for (const key of keys.filter(k => k.namespace === namespace)) await tx.$queryRaw`SELECT pg_advisory_xact_lock(${namespace}::int,${key.key}::int)::text`;
      for (const slot of before.slots.filter(s => !s.uniqueOnly && s.row)) {
        const [meta] = await tx.$queryRaw<{ namespace: number }[]>`SELECT (public.diagnostic_source_meta(${slot.table})->>'namespace')::int AS namespace`;
        if (meta?.namespace === namespace) await tx.$queryRaw(Prisma.sql`SELECT 1 FROM public.${Prisma.raw(slot.table)} s WHERE to_jsonb(s) @> ${JSON.stringify(slot.key)}::jsonb FOR UPDATE`);
      }
    }
    if (!same(before, await discover(tx, selection))) throw new Error("VIDEO_PREPARATION_CHANGED");
    return work();
  };
  return before.mutations.length ? withCampaignPreparation(tx, before.mutations, run) : run();
}
