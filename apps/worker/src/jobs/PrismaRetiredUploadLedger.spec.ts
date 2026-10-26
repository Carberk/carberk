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
  contention = false;
  scalarOnly = false;
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
    if (this.scalarOnly && /diagnostic_source_meta|diagnostic_source_lock_keys|pg_(try_)?advisory|SELECT to_jsonb\(s\)/.test(text)) throw new Error("scalar lease sought source dependency");
    if (text.includes("SELECT to_jsonb(work) AS row")) {
      const ids = values.find(Array.isArray) as string[] | undefined;
      let rows = this.rows["media_upload_cleanups"] ?? [];
      if (ids) rows = rows.filter(r => ids.includes(String(r["uploadId"])));
      else rows = rows.filter(r => r["status"] === "PENDING" && Date.parse(String(r["nextAttemptAt"])) <= (values[0] as Date).getTime()).slice(0, Number(values[1]));
      return rows.map(row => ({ row: structuredClone(row) }));
    }
    if (text.includes('SELECT "uploadId" AS selected')) {
      if (!this.receipt) throw new Error("late preparation");
      if (this.contention) return [];
      const ids = values[0] as string[], now = values[1] as Date;
      return (this.rows["media_upload_cleanups"] ?? []).filter(r => ids.includes(String(r["uploadId"])) && r["status"] === "PENDING" && Date.parse(String(r["nextAttemptAt"])) <= now.getTime()).slice(0, Number(values[2])).map(r => ({ selected: r["uploadId"] }));
    }
    if (text.includes('SELECT upload.id FROM media_uploads upload')) {
      return (this.rows["media_uploads"] ?? []).filter(r => r["state"] === "PREPARING" && r["writeProtocol"] !== "video-v1" &&
        Date.parse(String(r["claimDeadline"])) < (values[0] as Date).getTime()).slice(0, Number(values[1])).map(r => ({ id: r["id"] }));
    }
    if (text.includes('SELECT "uploadId" AS id FROM media_upload_cleanups')) {
      return (this.rows["media_upload_cleanups"] ?? []).filter(r => r["status"] === "PENDING" &&
        Date.parse(String(r["nextAttemptAt"])) <= (values[0] as Date).getTime()).slice(0, Number(values[1])).map(r => ({ id: r["uploadId"] }));
    }
    if (text.includes('WITH stranded AS')) {
      let recovered = 0;
      for (const id of values[0] as string[]) {
        const upload = this.row("media_uploads", { id }); if (!upload) continue;
        this.assertWrite("media_uploads", { id });
        const mutation = this.coverage.find(m => m["table"] === "media_uploads" && (m["key"] as Row)["id"] === id);
        Object.assign(upload, mutation?.["next"]); recovered++;
        const cleanup = this.coverage.find(m => m["table"] === "media_upload_cleanups" && m["verb"] === "insert" && (m["key"] as Row)["uploadId"] === id);
        if (cleanup) this.rows["media_upload_cleanups"]?.push({ ...cleanup["next"] as Row });
      }
      return [{ recovered: BigInt(recovered) }];
    }
    if (text.includes('UPDATE media_upload_cleanups AS work')) {
      const leased: Row[] = [];
      for (const mutation of this.coverage.filter(m => m["table"] === "media_upload_cleanups" && m["verb"] === "update")) {
        const key = mutation["key"] as Row; const row = this.row("media_upload_cleanups", key);
        const ids = values.find(Array.isArray) as string[];
        if (row && ids.includes(String(key["uploadId"]))) { this.assertWrite("media_upload_cleanups", key); Object.assign(row, mutation["next"]); leased.push({ ...row }); }
      }
      return leased;
    }
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
    if (text.includes("pg_try_advisory_xact_lock")) return [{ locked: !this.contention }];
    if (text.includes("pg_advisory_xact_lock")) { if (!this.receipt) throw new Error("late preparation"); return []; }
    if (text.includes("SELECT to_jsonb(s) AS row")) {
      const table = /FROM public\.([a-z_]+)/.exec(text)?.[1] ?? "";
      const row = this.row(table, JSON.parse(String(values[0])) as Row);
      return row ? [{ row: structuredClone(row) }] : [];
    }
    if (text.includes("FOR UPDATE")) { if (!this.receipt) throw new Error("late preparation"); return [{ locked: 1 }]; }
    if (text.includes("SELECT 'users' AS table")) {
      const id = values[0]; const directory = String(values[1]);
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
  it.each(["publish", "attach", "profile", "legacy"])("recovers an expired %s preparation with its original cleanup policy", async kind => {
    const db = new CleanupDatabase(); db.rows["media_upload_cleanups"] = [];
    Object.assign(db.row("media_uploads", { id: "upload" }) ?? {}, { state: "PREPARING", claimToken: "held", claimDeadline: "2000-01-01T00:00:00.000Z", claimTargetType: kind === "profile" ? "profile" : "listing", claimTargetId: kind === "profile" ? "owner" : "target", retiredAt: null,
      writeProtocol: kind === "legacy" ? "legacy" : "conditional-v1" });
    if (kind !== "publish" && kind !== "profile") db.rows["listings"]?.push({ id: "target", sellerId: "owner" });
    expect(await db.ledger().retireExpiredPreparations(NOW, 10)).toBe(1);
    const upload = db.row("media_uploads", { id: "upload" });
    expect(upload).toMatchObject({ state: kind === "publish" ? "AVAILABLE" : "RETIRED", claimToken: null, claimDeadline: null });
    if (kind === "publish") {
      expect(upload).toMatchObject({ claimTargetType: null, claimTargetId: null });
      expect(db.rows["media_upload_cleanups"]).toEqual([]);
    } else expect(db.row("media_upload_cleanups", { uploadId: "upload" })).toMatchObject({ status: kind === "legacy" ? "LEGACY_PENDING" : "PENDING", key: KEY, nextAttemptAt: "2000-01-01T00:00:00.000Z" });
  });
  it("does not recover not-due or video preparations", async () => {
    for (const patch of [{ claimDeadline: "2000-01-03T00:00:00Z" }, { writeProtocol: "video-v1" }]) {
      const db = new CleanupDatabase();
      Object.assign(db.row("media_uploads", { id: "upload" }) ?? {}, { state: "PREPARING", claimDeadline: "2000-01-01T00:00:00Z" }, patch);
      expect(await db.ledger().retireExpiredPreparations(NOW, 10)).toBe(0);
      expect(db.row("media_uploads", { id: "upload" })?.["state"]).toBe("PREPARING");
    }
  });
  it("leases only due PENDING work and saves its retry before returning", async () => {
    const db = new CleanupDatabase();
    Object.assign(db.row("media_upload_cleanups", { uploadId: "upload" }) ?? {}, { nextAttemptAt: "2000-01-01T00:00:00Z", attempts: 0 });
    db.rows["media_upload_cleanups"]?.push({ uploadId: "legacy", status: "LEGACY_PENDING", nextAttemptAt: "2000-01-01T00:00:00Z" }, { uploadId: "future", status: "PENDING", nextAttemptAt: "2000-01-03T00:00:00Z" });
    expect(await db.ledger().lease(NOW, 1)).toMatchObject([{ uploadId: "upload", attempts: 1 }]);
    expect(db.row("media_upload_cleanups", { uploadId: "upload" })).toMatchObject({ nextAttemptAt: "2000-01-02T00:01:00.000Z", status: "PENDING" });
    expect(await db.ledger().lease(NOW, 10)).toEqual([]);
  });
  it("leaves contended batch work untouched", async () => {
    const db = new CleanupDatabase(); db.contention = true;
    Object.assign(db.row("media_upload_cleanups", { uploadId: "upload" }) ?? {}, { nextAttemptAt: "2000-01-01T00:00:00Z" });
    expect(await db.ledger().lease(NOW, 1)).toEqual([]);
    expect(db.row("media_upload_cleanups", { uploadId: "upload" })?.["attempts"]).toBe(1);
  });
  it("leases scalar retry work without seeking upload or source dependencies", async () => {
    const db = new CleanupDatabase(); db.scalarOnly = true;
    Object.assign(db.row("media_upload_cleanups", { uploadId: "upload" }) ?? {}, { nextAttemptAt: "2000-01-01T00:00:00Z", attempts: 0 });
    expect(await db.ledger().lease(NOW, 1)).toMatchObject([{ uploadId: "upload", attempts: 1 }]);
  });
  it.each([[2, 4], [600, 1000]])("bounds candidate pool for output limit %s", async (limit, pool) => {
    const db = new CleanupDatabase(); db.scalarOnly = true;
    db.rows["media_upload_cleanups"] = Array.from({ length: 1002 }, (_, i) => ({ uploadId: `root-${i}`, status: "PENDING", attempts: 0, nextAttemptAt: "2000-01-01T00:00:00Z" }));
    const result = await db.ledger().lease(NOW, limit);
    expect(result).toHaveLength(limit);
    expect(db.coverage).toHaveLength(pool);
    expect(db.rows["media_upload_cleanups"].filter(r => r["attempts"] === 1)).toHaveLength(limit);
  });
  it.each([
    ["manifest", { objectKeys: [KEY, "pending/changed/detail.webp"] }],
    ["attempts", { attempts: 2 }],
    ["retry deadline", { nextAttemptAt: "2000-01-01T01:00:00Z" }],
  ])("refuses a selected cleanup whose %s changed after discovery", async (_field, patch) => {
    const db = new CleanupDatabase(); db.scalarOnly = true;
    Object.assign(db.row("media_upload_cleanups", { uploadId: "upload" }) ?? {}, { nextAttemptAt: "2000-01-01T00:00:00Z", attempts: 0 });
    const before = structuredClone(db.rows);
    db.afterPrepare = () => { Object.assign(db.row("media_upload_cleanups", { uploadId: "upload" }) ?? {}, patch); };
    await expect(db.ledger().lease(NOW, 1)).rejects.toThrow("retired_upload_scope_changed");
    expect(db.rows).toEqual(before);
  });
  it.each([
    ["status", { status: "DONE" }],
    ["retry deadline", { nextAttemptAt: "2000-01-03T00:00:00Z" }],
  ])("allows an unselected candidate's changed %s without extending the fixed pool", async (_field, patch) => {
    const db = new CleanupDatabase(); db.scalarOnly = true;
    Object.assign(db.row("media_upload_cleanups", { uploadId: "upload" }) ?? {}, { nextAttemptAt: "2000-01-01T00:00:00Z", attempts: 0 });
    db.rows["media_upload_cleanups"]?.push({ uploadId: "second", status: "PENDING", attempts: 0, nextAttemptAt: "2000-01-01T00:00:00Z" });
    db.afterPrepare = () => {
      Object.assign(db.row("media_upload_cleanups", { uploadId: "upload" }) ?? {}, patch, { objectKeys: ["changed-but-unselected"] });
      db.rows["media_upload_cleanups"]?.unshift({ uploadId: "new-earlier", status: "PENDING", attempts: 0, nextAttemptAt: "1999-01-01T00:00:00Z" });
    };
    expect(await db.ledger().lease(NOW, 1)).toMatchObject([{ uploadId: "second", attempts: 1 }]);
    expect(db.coverage.map(m => m["key"])).toEqual([{ uploadId: "upload" }, { uploadId: "second" }]);
    expect(db.row("media_upload_cleanups", { uploadId: "upload" })).toMatchObject({ ...patch, attempts: 0, objectKeys: ["changed-but-unselected"] });
    expect(db.row("media_upload_cleanups", { uploadId: "new-earlier" })?.["attempts"]).toBe(0);
  });
  it("rolls back scalar lease backoff if receipt finish refuses", async () => {
    const db = new CleanupDatabase(); db.refuseFinish = true;
    Object.assign(db.row("media_upload_cleanups", { uploadId: "upload" }) ?? {}, { nextAttemptAt: "2000-01-01T00:00:00Z", attempts: 0 });
    await expect(db.ledger().lease(NOW, 1)).rejects.toThrow("campaign_preparation_receipt");
    expect(db.row("media_upload_cleanups", { uploadId: "upload" })).toMatchObject({ attempts: 0, nextAttemptAt: "2000-01-01T00:00:00Z" });
  });
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
    const db = new CleanupDatabase(); db.afterPrepare = () => { Object.assign(db.row("media_uploads", { id: "upload" }) ?? {}, { claimTargetId: "unrelated" }); };
    await expect(db.ledger().complete("upload", NOW)).rejects.toThrow("retired_upload_scope_changed");
    expect(db.row("media_upload_cleanups", { uploadId: "upload" })?.["status"]).toBe("PENDING");
  });
  it.each(["avatar", "media", "poster"])("refuses completion for a legacy %s key reference", async kind => {
    const db = new CleanupDatabase();
    if (kind === "avatar") db.rows["users"]?.push({ id: "legacy", avatarKey: KEY, avatarUploadId: null });
    else db.rows["listing_media"]?.push({ id: "legacy", [kind === "poster" ? "posterKey" : "key"]: KEY, uploadId: null });
    await expect(db.ledger().complete("upload", NOW)).rejects.toThrow("retired_upload_live_reference");
    expect(db.row("media_upload_cleanups", { uploadId: "upload" })?.["status"]).toBe("PENDING");
  });
  it("refuses completion for an adopted upload", async () => {
    const db = new CleanupDatabase(); Object.assign(db.row("media_uploads", { id: "upload" }) ?? {}, { state: "ADOPTED" });
    await expect(db.ledger().complete("upload", NOW)).rejects.toThrow("retired_upload_live_reference");
    expect(db.row("media_upload_cleanups", { uploadId: "upload" })?.["status"]).toBe("PENDING");
  });
});
