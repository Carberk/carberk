import type { PrismaService } from "@auto-tm/db";

// Offline SQL boundary, not PostgreSQL locking or trigger evidence.
export type Row = Record<string, unknown>;
export class ClaimDatabase {
  tables: Record<string, Row[]> = { users: [{ id: "owner", avatarUploadId: null }], media_uploads: [], listing_media: [], media_upload_cleanups: [] };
  receipt = false;
  supplied: "ordinary" | "source" | undefined;
  covered = true;
  prepared: Row[] = [];
  finished = 0;
  afterWait: (() => void) | undefined;
  failWrite?: number;
  private writes = 0;
  readonly tx = {
    $queryRaw: async (query: TemplateStringsArray | { strings: readonly string[]; values: unknown[] }, ...args: unknown[]): Promise<unknown[]> => {
      const sql = "strings" in query ? query.strings.join("?") : query.join("?");
      const values = "strings" in query ? query.values : args;
      if (sql.includes("campaign_prepare(")) {
        if (this.receipt) throw new Error("nested_preparation");
        this.receipt = true;
        this.prepared = JSON.parse(String(values[0]));
        return [{ receipt: "ordinary-receipt" }];
      }
      if (sql.includes("campaign_finish(")) { this.receipt = false; this.finished++; return []; }
      if (sql.includes("campaign_preparations") && sql.includes("diagnostic_source_commands")) {
        return this.supplied || this.receipt ? [{ covered: this.covered }] : [];
      }
      if (sql.includes("public.diagnostic_source_lock_keys(")) throw new Error("unsupported_command_aware_rows_only_keys");
      if (sql.includes("public.diagnostic_source_lock_keys_before_intake(")) return [{ keys: [{ namespace: 897100, key: 1 }, { namespace: 898100, key: 2 }] }];
      if (sql.includes("diagnostic_source_meta")) {
        const refs: Record<string, string[][]> = { media_uploads: [["users", "userId"], ["dealerships", "businessId"]], users: [["media_uploads", "avatarUploadId"], ["users", "suspendedById"]], sessions: [["users", "userId"]], listings: [["users", "sellerId"], ["dealerships", "businessId"]], dealership_members: [["users", "userId"], ["dealerships", "dealershipId"]] };
        return [{ namespace: values[0] === "users" ? 897100 : 898100, refs: (refs[String(values[0])] ?? []).map(([table, column]) => ({ table, columns: [column], target: ["id"] })) }];
      }
      if (sql.includes("pg_advisory_xact_lock") || sql.includes("FOR UPDATE")) {
        if (!this.receipt && !this.supplied) throw new Error("lock_before_preparation");
        this.afterWait?.(); this.afterWait = undefined;
        if (sql.includes("SELECT 1") || sql.includes("pg_advisory_xact_lock")) return [];
      }
      if (sql.includes("to_jsonb(s) AS row")) {
        const table = sql.match(/FROM public\.(\w+)/)?.[1] ?? "";
        const key = JSON.parse(String(values[0]));
        return (this.tables[table] ?? []).filter(row => Object.entries(key).every(([k,v]) => row[k] === v)).map(row => ({ row: structuredClone(row) }));
      }
      if (sql.includes("'users' AS table")) {
        const ids = values[0] as string[];
        return [
          ...(this.tables["users"] ?? []).filter(r => ids.includes(String(r["avatarUploadId"]))).map(r => ({ table: "users", id: r["id"], listingId: null })),
          ...(this.tables["listing_media"] ?? []).filter(r => ids.includes(String(r["uploadId"]))).map(r => ({ table: "listing_media", id: r["id"], listingId: r["listingId"] })),
        ];
      }
      if (sql.includes("FROM dealership_members")) return structuredClone(this.tables["dealership_members"] ?? []);
      if (sql.includes("AS total")) {
        const ids = values[0] as string[];
        return [{ total: BigInt((this.tables["users"] ?? []).filter(r => ids.includes(String(r["avatarUploadId"]))).length + (this.tables["listing_media"] ?? []).filter(r => ids.includes(String(r["uploadId"]))).length) }];
      }
      if (sql.includes("FROM media_uploads")) {
        const rows = this.tables["media_uploads"] ?? [];
        return structuredClone(rows.filter(r => sql.includes('"claimToken" =') ? r["claimToken"] === values[0] && r["state"] === "PREPARING" : (values[0] as string[]).includes(String(r["id"]))));
      }
      throw new Error(`unhandled_query: ${sql}`);
    },
    $executeRaw: async (query: TemplateStringsArray, ...values: unknown[]): Promise<number> => {
      if (!this.receipt && !this.supplied) throw new Error("write_before_preparation");
      if (++this.writes === this.failWrite) throw new Error("claim_write_sentinel");
      const sql = query.join("?");
      if (sql.includes("INSERT INTO media_upload_cleanups")) {
        const [uploadId, key, objectKeys, writeProtocol, status] = values;
        if (!(this.tables["media_upload_cleanups"] ?? []).some(r => r["uploadId"] === uploadId)) this.tables["media_upload_cleanups"]?.push({ uploadId, key, objectKeys, writeProtocol, status });
      } else {
        const last = values.at(-1);
        const ids = Array.isArray(last) ? last : [last];
        for (const row of (this.tables["media_uploads"] ?? [])) if (ids.includes(row["id"])) {
          if (sql.includes("'PREPARING'")) Object.assign(row, { state: "PREPARING", claimToken: values[0], claimTargetType: values[1], claimTargetId: values[2], claimDeadline: values[3] });
          else if (sql.includes("'ADOPTED'")) Object.assign(row, { state: "ADOPTED", claimToken: null, claimDeadline: null });
          else if (sql.includes("'RETIRED'")) Object.assign(row, { state: "RETIRED", retiredAt: values[0], claimToken: null, claimDeadline: null });
          else Object.assign(row, { state: "AVAILABLE", claimToken: null, claimDeadline: null, claimTargetType: null, claimTargetId: null });
        }
      }
      return 1;
    },
  };
  readonly prisma = { $transaction: async <T>(work: (tx: typeof this.tx) => Promise<T>): Promise<T> => {
    const before = structuredClone(this.tables);
    try { return await work(this.tx); }
    catch (error) { this.tables = before; this.receipt = false; throw error; }
  } } as unknown as PrismaService;
  upload(id = "upload-1", patch: Row = {}): Row {
    const row = { id, userId: "owner", businessId: null, key: `pending/${id}/original.webp`, state: "AVAILABLE", claimToken: null, claimTargetType: null, claimTargetId: null, claimDeadline: null, writeProtocol: "conditional-v1", objectKeys: [`pending/${id}/original.webp`], ...patch };
    (this.tables["media_uploads"] ?? []).push(row);
    return row;
  }
}
