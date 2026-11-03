import { describe, expect, it } from "vitest";
import { withPreparedReaderFixture } from "../../../../test/helpers/diagnosticPreparedReaderFixture";

describe("issue938 recovery stage1", () => {
  it("lets only the selected current B technician reload a minimal usable handle without A access", async () => {
    await withPreparedReaderFixture("handoff", "current-technician", async f => {
      const { a, b, report } = await f.pair();
      const proofId = await f.issue(a, b, report, 7);
      const storedB = await f.db.inspectionOrder.findUniqueOrThrow({ where: { id: b.order.id } });
      const proof = await f.db.diagnosticContinuityProof.findUniqueOrThrow({ where: { id: proofId } });
      const content = proof.content as { candidate?: { orderId: string; orderVersion: number } };
      if (!b.raw) throw new Error("938_handoff_raw_missing");
      expect(storedB.version).toBe(7);
      expect(content.candidate).toEqual({ orderId: b.order.id, orderVersion: 7, identityRecordId: b.raw.id, identityRecordHash: b.raw.observationHash });

      const response = await f.send("technicianB", "GET", `orders/${b.order.id}/continuity-handoffs`);
      expect(response.status).toBe(200);
      expect(response.headers["cache-control"]).toBe("no-store, private");
      expect(response.body).toEqual({ handoffs: [{ proofId, status: "usable", expectedOrderVersion: 7 }], result: null, nextCursor: null, scope: "current_b_owned_handoffs" });
      expect((await f.send("technicianB", "GET", `orders/${b.order.id}/continuity-proofs/${proofId}`)).status).toBe(403);
      expect((await f.send("reviewer", "GET", `orders/${b.order.id}/continuity-handoffs`)).status).toBe(403);
      expect((await f.send("foreign", "GET", `orders/${b.order.id}/continuity-handoffs`)).status).toBe(403);
      await f.assign(b, "foreign", true);
      const empty = await f.send("foreign", "GET", `orders/${b.order.id}/continuity-handoffs`);
      expect(empty.status).toBe(200);
      expect(empty.body).toEqual({ handoffs: [], result: null, nextCursor: null, scope: "current_b_owned_handoffs" });
    });
  });
});
