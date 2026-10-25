import { describe, expect, it } from "vitest";
import { PrismaService } from "@auto-tm/db";
import { ListingDraft } from "../domain/ListingDraft";
import { PrismaListingDraftRepository } from "./PrismaListingDraftRepository";

// Database boundary refusal tests only. These make no PostgreSQL locking claim.
describe("draft preparation boundary", () => {
  for (const operation of ["save", "saveWithinLimit", "update", "delete"] as const) {
    it(`${operation} refuses before changing a draft when campaign preparation refuses`, async () => {
      const draft = ListingDraft.create({ id: "draft", userId: "owner", payload: { step: 1 } });
      let writes = 0;
      const mutate = async () => { writes++; return draft; };
      const tx = {
        listingDraft: { findUnique: async () => ({ ...draft, businessId: null }), create: mutate, update: mutate, delete: mutate },
        $executeRaw: async () => 0,
        $queryRaw: async (parts: TemplateStringsArray) => {
          const sql = parts.join("?");
          if (sql.includes("campaign_prepare(")) throw new Error("prefix refused");
          if (sql.includes("FOR UPDATE")) throw new Error("row lock before prefix");
          return [{ scope: [], keys: [] }];
        },
      };
      const db = { ...tx, $transaction: async (work: (client: typeof tx) => Promise<unknown>) => work(tx) };
      const repo = new PrismaListingDraftRepository(db as unknown as PrismaService);
      const result = operation === "delete" ? repo.delete(draft.id)
        : operation === "saveWithinLimit" ? repo.saveWithinLimit(draft, 5)
        : repo[operation](draft);
      await expect(result).rejects.toThrow("prefix refused");
      expect(writes).toBe(0);
    });
  }
});

// This boundary models transaction rollback and protocol refusals. It does not
// model PostgreSQL snapshots, advisory locks, FK behavior or concurrent clients.
function boundary(options: { changed?: boolean; finishFails?: boolean; initial?: ListingDraft; count?: number } = {}) {
  let stored = options.initial ? { ...options.initial, businessId: options.initial.businessId ?? null } : null;
  let prepared = false, discoveries = 0;
  const data = () => stored;
  const tx = {
    listingDraft: {
      findUnique: async () => stored,
      count: async () => { if (!prepared) throw new Error("count before prefix"); return options.count ?? (stored ? 1 : 0); },
      create: async ({ data: row }: { data: NonNullable<typeof stored> }) => { if (!prepared) throw new Error("write before prefix"); stored = row; return row; },
      update: async ({ data: patch }: { data: Partial<NonNullable<typeof stored>> }) => {
        if (!prepared) throw new Error("write before prefix");
        if (!stored) throw new Error("P2025");
        stored = { ...stored, ...patch }; return stored;
      },
      delete: async () => { if (!prepared) throw new Error("write before prefix"); const row = stored; stored = null; return row; },
    },
    $executeRaw: async () => 0,
    $queryRaw: async (parts: TemplateStringsArray | { sql: string }) => {
      const sql = Array.isArray(parts) ? parts.join("?") : (parts as { sql: string }).sql;
      if (sql.includes("WITH RECURSIVE")) {
        discoveries++;
        return [{ scope: [{ table: "listing_drafts", key: { id: "draft" }, row: options.changed && discoveries > 1 ? { userId: "changed" } : null }], keys: [{ namespace: 897401, key: 7 }] }];
      }
      if (sql.includes("campaign_prepare(")) { prepared = true; return [{ receipt: "boundary-receipt" }]; }
      if (sql.includes("campaign_finish(")) { if (options.finishFails) throw new Error("finish refused"); return []; }
      if (sql.includes("diagnostic_source_registry")) return [{ table: "listing_drafts", namespace: 897401 }];
      if (sql.includes("pg_advisory_xact_lock") || sql.includes("FOR UPDATE")) {
        if (!prepared) throw new Error("lock before prefix");
        return [];
      }
      throw new Error(`Unexpected database boundary statement: ${sql}`);
    },
  };
  const db = { ...tx, $transaction: async (work: (client: typeof tx) => Promise<unknown>) => {
    const original = stored;
    try { return await work(tx); } catch (error) { stored = original; throw error; }
    finally { prepared = false; }
  } };
  return { repo: new PrismaListingDraftRepository(db as unknown as PrismaService), data };
}

describe("draft transaction outcomes at the offline boundary", () => {
  const at = new Date("2026-10-25T00:00:00.000Z");
  const draft = new ListingDraft("draft", "owner", { step: 1 }, at, at);
  for (const operation of ["save", "saveWithinLimit", "update", "delete"] as const) {
    for (const refusal of ["changed discovery", "finish refusal"] as const) {
      it(`keeps the original state for ${operation} after ${refusal}`, async () => {
        const initial = operation === "update" || operation === "delete" ? draft : undefined;
        const db = boundary({ ...(initial ? { initial } : {}), changed: refusal === "changed discovery", finishFails: refusal === "finish refusal" });
        const result = operation === "delete" ? db.repo.delete(draft.id)
          : operation === "saveWithinLimit" ? db.repo.saveWithinLimit(draft, 5)
          : db.repo[operation](draft.updatePayload({ step: 2 }, new Date("2026-10-25T01:00:00.000Z")));
        await expect(result).rejects.toThrow(refusal === "changed discovery" ? "draft_dependencies_changed" : "finish refused");
        expect(db.data()).toEqual(initial ? { ...initial, businessId: null } : null);
      });
    }
  }
  it("returns null at the limit without changing payload or dates", async () => {
    const db = boundary({ count: 5 });
    expect(await db.repo.saveWithinLimit(draft, 5)).toBeNull();
    expect(db.data()).toBeNull();
  });
  it("preserves payload and explicit dates through create, update and delete", async () => {
    const db = boundary();
    expect(await db.repo.save(draft)).toEqual(draft);
    const changed = draft.updatePayload({ step: 2 }, new Date("2026-10-25T01:00:00.000Z"));
    expect(await db.repo.update(changed)).toEqual(changed);
    await db.repo.delete(draft.id);
    expect(db.data()).toBeNull();
  });
  it("refuses a caller-supplied owner different from the stored owner", async () => {
    const db = boundary({ initial: draft });
    await expect(db.repo.update(new ListingDraft("draft", "other", {}, at, at))).rejects.toThrow("draft_owner_changed");
    expect(db.data()).toEqual({ ...draft, businessId: null });
  });
  it("does not authorize a Business through the actorless save API", async () => {
    const db = boundary();
    await expect(db.repo.save(new ListingDraft("draft", "owner", {}, at, at, "business"))).rejects.toThrow("Business draft requires current actor");
    expect(db.data()).toBeNull();
  });
});
