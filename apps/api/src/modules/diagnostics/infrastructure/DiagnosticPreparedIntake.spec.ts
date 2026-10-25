import { describe, expect, it } from "vitest";
import type { PreparedDiagnosticSource, Prisma } from "@auto-tm/db";
import { diagnosticMutation, diagnosticReadPrefix, diagnosticReceiptPrefix } from "./DiagnosticPreparedIntake";

import { diagnosticProtocol } from "../application/testing/ownershipGrantHarness";

function database(changed = false) {
  const protocol = diagnosticProtocol({ changed, scope: () => [{ table: "inspection_orders", key: { id: "visit" } }] });
  return { tx: protocol as unknown as Prisma.TransactionClient, events: protocol.events };
}
const roots = [{ table: "inspection_orders" as const, key: { id: "visit" } }];
describe("diagnostic outer transaction prefix", () => {
  it("keeps reads free of source mutations and refuses a later uncovered visit", async () => {
    const h = database();
    await diagnosticReadPrefix(h.tx, roots);
    await diagnosticReadPrefix(h.tx, [{ table: "listings", key: { id: "retained-listing" } }]);
    await expect(diagnosticReadPrefix(h.tx, [{ table: "inspection_orders", key: { id: "foreign" } }])).rejects.toThrow("DIAGNOSTIC_NO_ACCESS");

    expect(h.events).toEqual(["discover", "keys:897500", 'listing:{"id":"retained-listing"}', "keys:897600", 'order:{"id":"visit"}', "discover"]);
  });
  it("refuses changed discovery before the caller can authorize a read", async () => {
    const h = database(true);
    await expect(diagnosticReadPrefix(h.tx, roots)).rejects.toThrow("DIAGNOSTIC_NO_ACCESS");

  });
  it("reuses a mutation's complete scope for reads and refuses a nested operation", async () => {
    const h = database();
    const command = { operation: "order_change" as const, roots, rows: [], actorUserId: null, sessionId: null, cutoff: null, campaign: null };
    const result = await diagnosticMutation(h.tx, command, async () => {
      await diagnosticReadPrefix(h.tx, roots);
      await expect(diagnosticMutation(h.tx, command, async () => "forbidden")).rejects.toThrow("DIAGNOSTIC_NO_ACCESS");
      return "authorized by caller";
    });
    expect(result).toBe("authorized by caller");
  });
  it("refuses copied, foreign-transaction and wrong-operation receipts before adopting any scope", async () => {
    for (const [receiptId, operation] of [["copied-backend", "order_change"], ["copied-transaction", "order_change"], ["owned-receipt", "observation_append"]] as const) {
      const h = database();
      await expect(diagnosticReceiptPrefix(h.tx, { receiptId } as PreparedDiagnosticSource, operation)).rejects.toThrow("diagnostic_source_receipt");

    }
  });
});
