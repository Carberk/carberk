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
        listingDraft: { findUnique: async () => draft, create: mutate, update: mutate, delete: mutate },
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
