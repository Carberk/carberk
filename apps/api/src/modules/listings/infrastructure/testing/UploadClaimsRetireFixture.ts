import { withCampaignPreparation, type CampaignMutation, type Prisma } from "@auto-tm/db";

type Row = Record<string, Prisma.InputJsonValue | null>;
interface Slot { table: string; key: Record<string, string>; row: Row | null }
const tables = ["users", "dealerships", "dealership_members", "sessions", "listings", "media_uploads", "listing_media", "media_upload_cleanups", "video_upload_sessions"];

/** Actual ordinary outer transaction for the direct supplied-retirement cases.
 * Reads the finite fixture graph, prepares its real retirement/cleanup effects,
 * and takes metadata keys before invoking the supplied helper. No receipt seed,
 * source operation, nested preparation, or production API escape. */
export async function retireWithFixturePreparation<T>(tx: Prisma.TransactionClient, id: string, at: Date, work: () => Promise<T>): Promise<T> {
  const slots: Slot[] = [];
  async function add(table: string, value: unknown) {
    if (typeof value !== "string" || !tables.includes(table)) return;
    const key = table === "media_upload_cleanups" ? { uploadId: value } : { id: value };
    if (slots.some(slot => slot.table === table && JSON.stringify(slot.key) === JSON.stringify(key))) return;
    const [found] = await tx.$queryRaw<{ row: Row | null }[]>`SELECT public.diagnostic_source_read(${table}::text,${JSON.stringify(key)}::jsonb) AS row`;
    slots.push({ table, key, row: found?.row ?? null });
  }
  await add("media_uploads", id);
  await add("media_upload_cleanups", id);
  const upload = slots[0]?.row;
  if (upload?.["claimTargetType"] === "listing") await add("listings", upload["claimTargetId"]);
  if (upload?.["claimTargetType"] === "profile") await add("users", upload["claimTargetId"]);
  if (upload?.["claimTargetType"] === "video_session") await add("video_upload_sessions", upload["claimTargetId"]);
  const adopters = await tx.$queryRaw<{ table: string; id: string; listingId: string | null }[]>`
    SELECT 'users' AS table,id,NULL::text AS "listingId" FROM users WHERE "avatarUploadId"=${id}
    UNION ALL SELECT 'listing_media',id,"listingId" FROM listing_media WHERE "uploadId"=${id} ORDER BY 1,2`;
  for (const row of adopters) { await add(row.table, row.id); await add("listings", row.listingId); }
  for (let i = 0; i < slots.length; i++) {
    if (slots.length > 1000) throw new Error("retire_fixture_scope_limit");
    const slot = slots[i];
    if (!slot?.row) continue;
    const [meta] = await tx.$queryRaw<{ refs: { table: string; columns: string[]; target: string[] }[] }[]>`SELECT public.diagnostic_source_meta(${slot.table}::text)->'refs' AS refs`;
    for (const ref of meta?.refs ?? []) {
      if (ref.columns.length === 1 && ref.target[0] === "id" && ref.columns[0]) await add(ref.table, slot.row[ref.columns[0]]);
    }
  }
  const mutations: CampaignMutation[] = slots.filter(slot => slot.row).map(slot => ({ table: slot.table, key: slot.key, verb: "update", next: slot.table === "media_uploads" && slot.key["id"] === id
    ? { state: "RETIRED", retiredAt: at.toISOString(), claimToken: null, claimDeadline: null } : {} }));
  if (upload && !["RETIRED", "DELETED"].includes(String(upload["state"])) && !slots[1]?.row) mutations.push({ table: "media_upload_cleanups", key: { uploadId: id }, verb: "insert", next: {
    uploadId: id, key: upload["key"] ?? null, objectKeys: upload["objectKeys"] ?? [], writeProtocol: upload["writeProtocol"] ?? null,
    status: upload["writeProtocol"] === "conditional-v1" ? "PENDING" : "LEGACY_PENDING",
  } });
  return withCampaignPreparation(tx, mutations, async () => {
    const unique = [{ table: "users", row: { avatarUploadId: id } }, { table: "listing_media", row: { uploadId: id } }];
    const [derived] = await tx.$queryRaw<{ keys: { namespace: number; key: number }[] }[]>`
      SELECT public.diagnostic_source_lock_keys_before_intake(${JSON.stringify(slots)}::jsonb,${JSON.stringify({ rows: mutations })}::jsonb)
        || coalesce((SELECT jsonb_agg(DISTINCT jsonb_build_object('namespace',(public.diagnostic_source_meta(s->>'table')->>'namespace')::int,
          'key',hashtext(jsonb_build_array('unique',fields,public.diagnostic_source_project(s->'row',fields))::text)))
          FROM jsonb_array_elements(${JSON.stringify(unique)}::jsonb) s
          CROSS JOIN LATERAL jsonb_array_elements(public.diagnostic_source_meta(s->>'table')->'unique') fields
          WHERE NOT EXISTS (SELECT 1 FROM jsonb_each(public.diagnostic_source_project(s->'row',fields)) e WHERE e.value='null')),'[]'::jsonb) AS keys`;
    if (!derived) throw new Error("retire_fixture_keys_missing");
    for (const lock of derived.keys.sort((a,b) => a.namespace-b.namespace || a.key-b.key)) {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(${lock.namespace}::int,${lock.key}::int)::text`;
    }
    return work();
  });
}
