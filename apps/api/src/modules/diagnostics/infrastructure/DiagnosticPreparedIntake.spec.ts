import { describe, expect, it } from "vitest";
import type { PreparedDiagnosticSource, Prisma } from "@auto-tm/db";
import { diagnosticMutation, diagnosticReadPrefix, diagnosticReceiptPrefix } from "./DiagnosticPreparedIntake";

/** Database boundary only. This does not emulate PostgreSQL concurrency or
 * certify the SQL closure; the authored E2E suite owns those obligations. */
function database(changed = false) {
  let reads = 0, writes = 0;
  const events: string[] = [];
  const tx = {
    $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = strings.join("?");
      if (sql.includes("diagnostic_source_scope")) {
        reads++; events.push("discover");
        return [{ scope: [{ table: "inspection_orders", key: { id: changed && reads > 1 ? "replaced" : "visit" } }, { table: "listings", key: { id: "retained-listing" } }], keys: [], campaigns: [], mutations: [] }];
      }
      if (sql.includes("diagnostic_source_registry")) return [{ table: "listings", namespace: 897500 }, { table: "inspection_orders", namespace: 897600 }];
      if (sql.includes("pg_advisory_xact_lock")) events.push(`keys:${values[1]}`);
      if (sql.includes("diagnostic_assert_source") && (values[0] !== "owned-receipt" || values[1] !== "order_change")) throw new Error("diagnostic_source_receipt");
      if (sql.includes("campaign_prepare")) return [{ receipt: "campaign-receipt" }];
      if (sql.includes("diagnostic_prepare_source")) return [{ receipt: "owned-receipt" }];
      if (sql.includes("SELECT scope FROM")) return [{ scope: [{ table: "inspection_orders", key: { id: "visit" } }] }];
      return [];
    },
    $queryRawUnsafe: async (sql: string, key: string) => { events.push(`${sql.includes("public.listings") ? "listing" : "order"}:${key}`); return []; },
    $executeRawUnsafe: async () => 0,
    inspectionOrder: { update: async () => { writes++; return { id: "visit" }; } },
  };
  return { tx: tx as unknown as Prisma.TransactionClient, writes: () => writes, events };
}
const roots = [{ table: "inspection_orders" as const, key: { id: "visit" } }];
describe("diagnostic outer transaction prefix", () => {
  it("keeps reads free of source mutations and refuses a later uncovered visit", async () => {
    const h = database();
    await diagnosticReadPrefix(h.tx, roots);
    await diagnosticReadPrefix(h.tx, [{ table: "listings", key: { id: "retained-listing" } }]);
    await expect(diagnosticReadPrefix(h.tx, [{ table: "inspection_orders", key: { id: "foreign" } }])).rejects.toThrow("DIAGNOSTIC_NO_ACCESS");
    expect(h.writes()).toBe(0);
    expect(h.events).toEqual(["discover", "keys:897500", 'listing:{"id":"retained-listing"}', "keys:897600", 'order:{"id":"visit"}', "discover"]);
  });
  it("refuses changed discovery before the caller can authorize a read", async () => {
    const h = database(true);
    await expect(diagnosticReadPrefix(h.tx, roots)).rejects.toThrow("DIAGNOSTIC_NO_ACCESS");
    expect(h.writes()).toBe(0);
  });
  it("reuses a mutation's complete scope for reads and refuses a nested operation", async () => {
    const h = database();
    const command = { operation: "order_change" as const, roots, rows: [], actorUserId: null, sessionId: null, cutoff: null, campaign: null };
    const result = await diagnosticMutation(h.tx, command, async () => {
      await diagnosticReadPrefix(h.tx, roots);
      await expect(diagnosticMutation(h.tx, command, async () => "forbidden")).rejects.toThrow("DIAGNOSTIC_NO_ACCESS");
      return "authorized by caller";
    });
    expect(result).toBe("authorized by caller"); expect(h.writes()).toBe(0);
  });
  it("refuses copied, foreign-transaction and wrong-operation receipts before adopting any scope", async () => {
    for (const [receiptId, operation] of [["copied-backend", "order_change"], ["copied-transaction", "order_change"], ["owned-receipt", "observation_append"]] as const) {
      const h = database();
      await expect(diagnosticReceiptPrefix(h.tx, { receiptId } as PreparedDiagnosticSource, operation)).rejects.toThrow("diagnostic_source_receipt");
      expect(h.writes()).toBe(0);
    }
  });
});
