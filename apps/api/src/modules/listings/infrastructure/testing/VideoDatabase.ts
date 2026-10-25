import type { PrismaService } from "@auto-tm/db";

interface Row { [field: string]: unknown }
const tableNames: Record<string, string> = { user: "users", session: "sessions", dealership: "dealerships", dealershipMember: "dealership_members", listing: "listings", listingDraft: "listing_drafts", mediaUpload: "media_uploads", videoUploadSession: "video_upload_sessions", videoGeneration: "video_generations", videoProcessWork: "video_process_work", videoCleanupWork: "video_cleanup_work", videoGrant: "video_grants", listingMedia: "listing_media" };
const refs: Record<string, [string, string][]> = {
  sessions: [["users", "userId"]], dealerships: [], dealership_members: [["users", "userId"], ["dealerships", "dealershipId"]],
  listings: [["users", "sellerId"], ["dealerships", "businessId"], ["video_generations", "activeVideoGenerationId"], ["video_generations", "pendingVideoGenerationId"]],
  listing_drafts: [["users", "userId"], ["dealerships", "businessId"]], media_uploads: [["users", "userId"], ["dealerships", "businessId"]],
  video_upload_sessions: [["users", "userId"], ["media_uploads", "uploadId"], ["listings", "listingId"]],
  video_generations: [["video_upload_sessions", "sessionId"], ["media_uploads", "uploadId"], ["listings", "listingId"]],
  video_grants: [["users", "ownerUserId"], ["sessions", "ownerSessionId"], ["listings", "listingId"], ["video_generations", "generationId"]],
};
const matches = (row: Row, where: Row): boolean => Object.entries(where).every(([key, value]) => {
  if (value && typeof value === "object" && !(value instanceof Date)) {
    const condition = value as Row;
    if ("in" in condition) return (condition["in"] as unknown[]).includes(row[key]);
    if ("notIn" in condition) return !(condition["notIn"] as unknown[]).includes(row[key]);
    if ("gt" in condition) return (row[key] as number) > (condition["gt"] as number);
    if ("not" in condition) return row[key] !== condition["not"];
    return matches(row, condition);
  }
  return row[key] === value;
});

/** Database boundary only. Numeric/trigger/FK behavior remains SQL acceptance.
 * A row lock or write before preparation is an explicit boundary refusal. */
export class VideoDatabase {
  rows: Record<string, Row[]> = {};
  prepared = false;
  locked = false;
  rejectPreparation = false;
  changeAfterLocks?: () => void;
  reachedWrite = false;
  private changed = false;
  put(table: string, ...rows: Row[]) { this.rows[table] = rows; }
  private list(table: string) { return this.rows[table] ??= []; }
  private delegate(table: string) {
    const find = (where: Row) => this.list(table).find(row => matches(row, where)) ?? null;
    const write = () => { if (!this.prepared) throw new Error("FAKE_PREPARATION_REQUIRED"); this.reachedWrite = true; };
    const update = ({ where, data }: { where: Row; data: Row }) => {
      write(); const row = find(where); if (!row) throw new Error("FAKE_NOT_FOUND");
      for (const [key, value] of Object.entries(data)) row[key] = value && typeof value === "object" && "increment" in value ? Number(row[key]) + Number((value as Row)["increment"]) : value;
      return row;
    };
    const create = ({ data }: { data: Row }) => { write(); const row = { ...data }; this.list(table).push(row); return row; };
    return {
      findUnique: async ({ where }: { where: Row }) => find(where), findUniqueOrThrow: async ({ where }: { where: Row }) => { const row = find(where); if (!row) throw new Error("FAKE_NOT_FOUND"); return row; },
      findFirst: async ({ where }: { where: Row }) => find(where), findMany: async () => this.list(table), count: async ({ where }: { where: Row }) => this.list(table).filter(row => matches(row, where)).length,
      create: async (input: { data: Row }) => create(input), update: async (input: { where: Row; data: Row }) => update(input),
      updateMany: async ({ where, data }: { where: Row; data: Row }) => { write(); const selected = this.list(table).filter(row => matches(row, where)); for (const row of selected) update({ where: { id: row["id"] }, data }); return { count: selected.length }; },
      upsert: async ({ where, create: data, update: patch }: { where: Row; create: Row; update: Row }) => find(where) ? update({ where, data: patch }) : create({ data }),
    };
  }
  readonly prisma = { $transaction: async <T>(work: (tx: unknown) => Promise<T>) => {
    const saved = structuredClone(this.rows); this.prepared = false; this.locked = false; this.changed = false;
    const tx: Record<string, unknown> = { $executeRaw: async () => 0, $queryRaw: this.query.bind(this) };
    for (const [model, table] of Object.entries(tableNames)) tx[model] = this.delegate(table);
    try { return await work(tx); } catch (error) { this.rows = saved; throw error; }
  } } as unknown as PrismaService;
  private async query(input: TemplateStringsArray | { sql: string; values: unknown[] }, ...parameters: unknown[]) {
    const sql = Array.isArray(input) ? input.join("?") : (input as { sql: string }).sql;
    const values = Array.isArray(input) ? parameters : (input as { values: unknown[] }).values;
    if (sql.includes("campaign_prepare(")) { if (this.rejectPreparation) throw new Error("campaign_preparation_changed"); this.prepared = true; return [{ receipt: "receipt" }]; }
    if (sql.includes("campaign_finish(")) return [];
    if (sql.includes("diagnostic_source_lock_keys_before_intake")) return [{ keys: [{ namespace: 200, key: 9 }, { namespace: 100, key: -1 }, { namespace: 200, key: 9 }] }];
    if (sql.includes("diagnostic_source_meta")) return [{ namespace: 100, refs: (refs[String(values[0])] ?? []).map(([table, column]) => ({ table, columns: [column], target: ["id"] })) }];
    if (sql.includes("pg_advisory_xact_lock")) { if (!this.prepared) throw new Error("FAKE_PREPARATION_REQUIRED"); return []; }
    if (/FOR (UPDATE|SHARE)/.test(sql)) {
      if (!this.prepared) throw new Error("FAKE_PREPARATION_REQUIRED"); this.locked = true;
      if (!this.changed && this.changeAfterLocks) { this.changed = true; this.changeAfterLocks(); }
      return [{ id: "locked" }];
    }
    if (sql.includes("SELECT to_jsonb(s) AS row")) {
      const table = /public\.([a-z_]+)/.exec(sql)?.[1];
      const key = JSON.parse(String(values[0])) as Row;
      const row = table ? this.list(table).find(row => matches(row, key)) : null;
      return row ? [{ row: JSON.parse(JSON.stringify(row)) }] : [];
    }
    if (sql.includes("FROM dealership_members")) return this.list("dealership_members").filter(row => sql.includes('"userId"=') ? row["userId"] === values[0] : row["dealershipId"] === values[0] && row["role"] === "owner");
    if (sql.includes("SELECT 'users' AS table")) return [...this.list("users").filter(r => r["avatarUploadId"] === values[0]).map(r => ({ table: "users", id: r["id"] })), ...this.list("listing_media").filter(r => r["uploadId"] === values[1]).map(r => ({ table: "listing_media", id: r["id"] }))];
    if (sql.includes("FROM video_grants")) return this.list("video_grants").filter(r => r[sql.includes('"secretHash"') ? "secretHash" : "generationId"] === values[0]);
    if (sql.includes("FROM listings")) return this.list("listings").filter(r => r["activeVideoGenerationId"] === values[0] || r["pendingVideoGenerationId"] === values[1]);
    if (sql.includes("FROM video_upload_sessions")) return this.list("video_upload_sessions").filter(r => r["targetKind"] === "draft" && r["targetId"] === values[0]);
    throw new Error(`FAKE_UNSUPPORTED_QUERY ${sql}`);
  }
}
