import { describe, expect, it } from "vitest";
import type { PrismaService } from "@auto-tm/db";
import { PrismaVerifiedContactPhoneRepository } from "./PrismaVerifiedContactPhoneRepository";
import { VerifiedContactPhone } from "../domain/VerifiedContactPhone";

// Database boundary only. The database rejects a write without the outer prefix.
// This proves caller integration, not PostgreSQL locking or trigger behavior.
describe("contact confirmation transaction admission", () => {
  it("stores the exact confirmation only after ordinary preparation and finish", async () => {
    let prepared = false;
    let finished = false;
    let stored: unknown;
    const db = {
      $queryRaw: async (sql: TemplateStringsArray, ...values: unknown[]) => {
        const text = Array.isArray(sql) ? sql.join("?") : String((sql as { sql?: string }).sql);
        if (text.includes("campaign_prepare(")) { prepared = true; return [{ receipt: "receipt" }]; }
        if (text.includes("campaign_finish(")) { finished = true; return []; }
        if (text.includes("diagnostic_source_read")) return [{ row: values[0] === "users" ? { id: "seller" } : null }];
        if (text.includes("diagnostic_source_lock_keys")) return [{ keys: [] }];
        if (text.includes("verified_contact_phones")) return [];
        return [];
      },
      verifiedContactPhone: {
        upsert: async ({ create }: { create: unknown }) => {
          if (!prepared) throw new Error("campaign_preparation_missing");
          stored = create;
          return create;
        },
      },
      $transaction: async <T>(work: (tx: unknown) => Promise<T>) => work(db),
    };
    const repo = new PrismaVerifiedContactPhoneRepository(db as unknown as PrismaService);
    const confirmation = VerifiedContactPhone.create({ sellerId: "seller", phone: "+99361000000", confirmedAt: new Date("2026-10-25T00:00:00Z") });
    await expect(repo.record(confirmation)).resolves.toEqual(confirmation);
    expect(stored).toMatchObject({ sellerId: "seller", phone: "+99361000000", confirmedAt: new Date("2026-10-25T00:00:00Z") });
    expect(finished).toBe(true);
  });
});
