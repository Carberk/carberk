import { Prisma, type PrismaService } from "@auto-tm/db";
import { describe, expect, it } from "vitest";

import { PrismaRetiredUploadLedger } from "./PrismaRetiredUploadLedger";

type Row = Record<string, unknown>;
const NOW = new Date("2000-01-02T00:00:00Z");
const KEY = "pending/21b0b4e0-4d4a-4d2c-8bd6-705555cb7585/original.webp";
const metas: Record<string, { namespace: number; refs: { table: string; columns: string[]; target: string[] }[] }> = {
  users: { namespace: 897100, refs: [{ table: "media_uploads", columns: ["avatarUploadId"], target: ["id"] }] },
  listings: { namespace: 897400, refs: [{ table: "users", columns: ["sellerId"], target: ["id"] }] },
  media_uploads: { namespace: 898100, refs: [{ table: "users", columns: ["userId"], target: ["id"] }] },
  media_upload_cleanups: { namespace: 898106, refs: [{ table: "media_uploads", columns: ["uploadId"], target: ["id"] }] },
  listing_media: { namespace: 898107, refs: [{ table: "media_uploads", columns: ["uploadId"], target: ["id"] }] },
};

/** Database boundary only. Receipts cover exact rows and NEW cleanup values;
 * writes without that coverage fail. This does not simulate PostgreSQL locks. */
class CleanupDatabase {
  rows: Record<string, Row[]> = {
    users: [{ id: "owner", avatarUploadId: null }], listings: [], listing_media: [],
    media_uploads: [{ id: "upload", userId: "owner", key: KEY, objectKeys: [KEY], writeProtocol: "conditional-v1", state: "RETIRED" }],
    media_upload_cleanups: [{ uploadId: "upload", key: KEY, objectKeys: [KEY], writeProtocol: "conditional-v1", status: "PENDING", attempts: 1, lastError: "old" }],
  };
  receipt = false;
  coverage: Row[] = [];
  refuseFinish = false;
  afterPrepare: (() => void) | undefined;
  keySlots: Row[] = [];
  row(table: string, key: Row) { return this.rows[table]?.find(row => Object.entries(key).every(([k, v]) => row[k] === v)); }
  assertWrite(table: string, key: Row) {
    if (!this.receipt || !this.coverage.some(m => m["table"] === table && JSON.stringify(m["key"]) === JSON.stringify(key))) throw new Error("campaign_preparation_missing");
  }
  mediaUploadCleanup = { update: async ({ where, data }: { where: Row; data: Row }) => {
    this.assertWrite("media_upload_cleanups", where);
    const row = this.row("media_upload_cleanups", where);
    if (!row) throw new Error("missing cleanup");
    Object.assign(row, data); return row;
  } };
  mediaUpload = { updateMany: async ({ where, data }: { where: Row; data: Row }) => {
    this.assertWrite("media_uploads", { id: where["id"] });
    const row = this.row("media_uploads", where); if (row) Object.assign(row, data);
    return { count: row ? 1 : 0 };
  } };
  async $transaction<T>(work: ((db: CleanupDatabase) => Promise<T>) | Promise<unknown>[]): Promise<T> {
    const before = structuredClone(this.rows);
    try { return await (Array.isArray(work) ? Promise.all(work) as Promise<T> : work(this)); } catch (error) { this.rows = before; throw error; } finally { this.receipt = false; }
  }
  async $queryRaw(first: TemplateStringsArray | Prisma.Sql, ...args: unknown[]): Promise<unknown> {
    const sql = Array.isArray(first) ? Prisma.sql(first as TemplateStringsArray, ...args) : first as Prisma.Sql;
    const text = sql.text; const values = sql.values;
    if (text.includes("public.campaign_prepare(")) {
      this.coverage = JSON.parse(String(values[0])) as Row[];
      this.receipt = true; this.afterPrepare?.(); return [{ receipt: "receipt" }];
    }
    if (text.includes("public.campaign_finish(")) {
      if (this.refuseFinish) throw new Error("campaign_preparation_receipt");
      this.receipt = false; return [];
    }
    if (text.includes("diagnostic_source_lock_keys_before_intake")) {
      this.keySlots = JSON.parse(String(values[0])) as Row[];
      const slots = [...this.keySlots, ...JSON.parse(String(values[2] ?? "[]")) as Row[]];
      return [{ keys: slots.map((slot, key) => ({ namespace: metas[String(slot["table"])]?.namespace ?? 899000, key })) }];
    }
    if (text.includes("diagnostic_source_meta")) return [metas[String(values[0])] ?? { namespace: 899000, refs: [] }];
    if (text.includes("pg_advisory_xact_lock")) { if (!this.receipt) throw new Error("late preparation"); return []; }
    if (text.includes("SELECT to_jsonb(s) AS row")) {
      const table = /FROM public\.([a-z_]+)/.exec(text)?.[1] ?? "";
      const row = this.row(table, JSON.parse(String(values[0])) as Row);
      return row ? [{ row: structuredClone(row) }] : [];
    }
    if (text.includes("FOR UPDATE")) { if (!this.receipt) throw new Error("late preparation"); return [{ locked: 1 }]; }
    if (text.includes("SELECT 'users' AS table")) {
      const id = values[0]; const directory = String(values[2]);
      return [
        ...(this.rows["users"] ?? []).filter(r => r["avatarUploadId"] === id || typeof r["avatarKey"] === "string" && r["avatarKey"].startsWith(directory)).map(r => ({ table: "users", id: r["id"] })),
        ...(this.rows["listing_media"] ?? []).filter(r => r["uploadId"] === id || [r["key"], r["posterKey"]].some(k => typeof k === "string" && k.startsWith(directory))).map(r => ({ table: "listing_media", id: r["id"] })),
      ];
    }
    throw new Error(`Unsupported offline database query: ${text}`);
  }
  ledger() { return new PrismaRetiredUploadLedger(this as unknown as PrismaService); }
}

describe("retired upload transaction preparation", () => {
  it("completes cleanup and a retired upload together", async () => {
    const db = new CleanupDatabase();
    await db.ledger().complete("upload", NOW);
    expect(db.row("media_upload_cleanups", { uploadId: "upload" })).toMatchObject({ status: "DONE", lastError: null, completedAt: NOW });
    expect(db.row("media_uploads", { id: "upload" })?.["state"]).toBe("DELETED");
  });
  it("retains cleanup after the upload and User are gone", async () => {
    const db = new CleanupDatabase(); db.rows["media_uploads"] = []; db.rows["users"] = [];
    await db.ledger().complete("upload", NOW);
    expect(db.row("media_upload_cleanups", { uploadId: "upload" })?.["status"]).toBe("DONE");
  });
  it("rolls back both completion writes if finishing the receipt refuses", async () => {
    const db = new CleanupDatabase(); db.refuseFinish = true;
    await expect(db.ledger().complete("upload", NOW)).rejects.toThrow("campaign_preparation_receipt");
    expect(db.row("media_upload_cleanups", { uploadId: "upload" })?.["status"]).toBe("PENDING");
    expect(db.row("media_uploads", { id: "upload" })?.["state"]).toBe("RETIRED");
  });
  it("keeps a durable failure reason without completing work", async () => {
    const db = new CleanupDatabase();
    await db.ledger().recordFailure("upload", "storage unavailable");
    expect(db.row("media_upload_cleanups", { uploadId: "upload" })).toMatchObject({ status: "PENDING", attempts: 1, lastError: "storage unavailable" });
    expect(db.row("media_uploads", { id: "upload" })?.["state"]).toBe("RETIRED");
  });
  it("refuses completion when a post-wait upload target changes", async () => {
    const db = new CleanupDatabase(); db.afterPrepare = () => { db.rows["media_uploads"]![0]!["claimTargetId"] = "unrelated"; };
    await expect(db.ledger().complete("upload", NOW)).rejects.toThrow("retired_upload_scope_changed");
    expect(db.row("media_upload_cleanups", { uploadId: "upload" })?.["status"]).toBe("PENDING");
  });
  it.each(["avatar", "media", "poster"])("refuses completion for a legacy %s key reference", async kind => {
    const db = new CleanupDatabase();
    if (kind === "avatar") db.rows["users"]!.push({ id: "legacy", avatarKey: KEY, avatarUploadId: null });
    else db.rows["listing_media"]!.push({ id: "legacy", [kind === "poster" ? "posterKey" : "key"]: KEY, uploadId: null });
    await expect(db.ledger().complete("upload", NOW)).rejects.toThrow("retired_upload_live_reference");
    expect(db.row("media_upload_cleanups", { uploadId: "upload" })?.["status"]).toBe("PENDING");
  });
  it("refuses completion for an adopted upload", async () => {
    const db = new CleanupDatabase(); db.rows["media_uploads"]![0]!["state"] = "ADOPTED";
    await expect(db.ledger().complete("upload", NOW)).rejects.toThrow("retired_upload_live_reference");
    expect(db.row("media_upload_cleanups", { uploadId: "upload" })?.["status"]).toBe("PENDING");
  });
});
