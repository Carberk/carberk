import { describe, expect, it } from "vitest";
import { withPreparedReaderFixture } from "../../../../test/helpers/diagnosticPreparedReaderFixture";

describe("issue938 recovery stage1", () => {
  it("returns only named currently eligible distinct B technicians to a non-reception reviewer", async () => {
    await withPreparedReaderFixture("discovery", "eligible-technicians", async f => {
      const b = await f.arrived("B");
      expect(f.actors.reviewer.userId).not.toBe(f.actors.technicianB.userId);
      expect(await f.db.staffGrant.count({ where: { userId: f.actors.reviewer.userId, capability: "diagnostics.reception", revokedAt: null } })).toBe(0);
      const response = await f.send("reviewer", "GET", `orders/${b.order.id}/linking-technicians`);
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ technicians: [{ userId: f.actors.technicianB.userId, name: "B technician" }] });
      expect((await f.send("foreign", "GET", `orders/${b.order.id}/linking-technicians`)).status).toBe(403);
      await f.expireSelectedQualification();
      const expired = await f.send("reviewer", "GET", `orders/${b.order.id}/linking-technicians`);
      expect(expired.status).toBe(200);
      expect(expired.body).toEqual({ technicians: [] });
    });
  });

  it("omits malformed required retained evidence without a partial candidate or protected error", async () => {
    await withPreparedReaderFixture("discovery", "malformed-retained-read", async f => {
      const { a, b, report } = await f.pair();
      const route = `orders/${b.order.id}/predecessor-candidates`;
      const baseline = await f.send("reviewer", "GET", route);
      expect(baseline.status).toBe(200);
      expect(baseline.body).toEqual({ candidates: [{ reportId: report.id, observedAt: "2026-10-21T12:00:00.000Z", mileageKm: 123000 }],
        nextCursor: null, exhausted: true, scope: "currently_authorized_retained_predecessors" });
      const stored = await f.storedEvidence(a), bStored = await f.storedEvidence(b);
      try {
        await f.withMalformedCopiedProvenance(a, async () => {
          const response = await f.send("reviewer", "GET", route);
          expect(response.status).toBe(200);
          expect(response.body).toEqual({ candidates: [], nextCursor: null, exhausted: true, scope: "currently_authorized_retained_predecessors" });
        });
      } finally {
        expect(await f.storedEvidence(a)).toEqual(stored);
        expect(await f.storedEvidence(b)).toEqual(bStored);
        const restored = await f.send("reviewer", "GET", route);
        expect(restored.status).toBe(200);
        expect(restored.body).toEqual(baseline.body);
      }
    });
  });

  it("[938 control] rejects persisted provenance rewrite without changing stored evidence", async () => {
    await withPreparedReaderFixture("discovery", "immutable-write-control", async f => {
      const { a } = await f.pair();
      const stored = await f.storedEvidence(a);
      const refused = await f.illegalProvenanceRewrite(a);
      expect(refused.reached).toBe(true);
      expect(refused.error).toMatchObject({ meta: { driverAdapterError: { cause: {
        originalCode: "P0001", originalMessage: "diagnostic_identity_evidence_immutable",
      } } } });
      expect(await f.storedEvidence(a)).toEqual(stored);
    });
  });
});
