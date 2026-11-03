import { describe, expect, it } from "vitest";
import { preparedPredecessorObservation, withPreparedReaderFixture, type Visit } from "../../../../test/helpers/diagnosticPreparedReaderFixture";

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
      expect(refused.error).toMatchObject({ name: "DriverAdapterError", cause: {
        originalCode: "P0001", originalMessage: "diagnostic_identity_evidence_immutable",
      } });
      expect(await f.storedEvidence(a)).toEqual(stored);
    });
  });
});

type Page = { candidates: { reportId: string; observedAt: string; mileageKm: number }[]; nextCursor: string | null; exhausted: boolean; scope: string };

// #939 H1: predecessor report ids are fixture-ordered (orderedId("predecessor", n) for the
// original id(4000 + n)); time is the explicit case clock; rights are predeclared per visit.
describe("issue939 H1 lawful case clocks and rights", () => {
  const MINUTE = 60_000;
  const scope = "currently_authorized_retained_predecessors";

  it("replays a stable page, excludes later arrivals, and rechecks unseen A rights and assignments", async () => {
    await withPreparedReaderFixture("discovery", "h1-replay", async f => {
      const b = await f.candidate();
      const deadline = new Date(f.clock.valueOf() + MINUTE);
      const visits = new Map<number, Visit>();
      for (let n = 30; n < 72; n++) visits.set(n, (await f.predecessor(n, n === 50 ? { provenance: deadline } : {})).visit);
      const route = `orders/${b.order.id}/predecessor-candidates`;
      const first = await f.send<Page>("reviewer", "GET", route);
      expect(first.status).toBe(200); expect(first.body.candidates).toHaveLength(20);
      const next = `${route}?cursor=${encodeURIComponent(first.body.nextCursor as string)}`;
      const page = await f.send<Page>("reviewer", "GET", next);
      expect(page.status).toBe(200);
      expect((await f.send<Page>("reviewer", "GET", next)).body.candidates).toEqual(page.body.candidates);
      // Later arrivals are outside this traversal's initial time fence, even if their id sorts earlier.
      f.advance(1);
      await f.predecessor(25);
      const unseenRights = visits.get(50), unseenAssignment = visits.get(51);
      if (!unseenRights || !unseenAssignment) throw new Error("939_unseen_visits_missing");
      await f.expireVisitRights(unseenRights, "provenance", deadline);
      await f.assign(unseenAssignment, "reviewer", false, "diagnostics.reviewer");
      const changed = await f.send<Page>("reviewer", "GET", next); expect(changed.status).toBe(200);
      expect(changed.body.candidates.map(candidate => candidate.reportId)).toEqual(Array.from({ length: 19 }, (_, index) => f.orderedId("predecessor", 52 + index)));
      expect(JSON.stringify(changed.body)).not.toContain(f.orderedId("predecessor", 50));
      expect(JSON.stringify(changed.body)).not.toContain(f.orderedId("predecessor", 51));
      expect(JSON.stringify(changed.body)).not.toContain(f.orderedId("predecessor", 25));
    });
  });

  it.each(["qualification"])("normalizes current B %s loss and unknown B", async loss => {
    await withPreparedReaderFixture("discovery", `h1-normalized-${loss}`, async f => {
      const b = await f.arrived("B");
      if (loss === "qualification") await f.expireReviewerQualification();
      for (const endpoint of ["predecessor-candidates", "linking-technicians"]) {
        const denied = await f.send("reviewer", "GET", `orders/${b.order.id}/${endpoint}`), missing = await f.send("reviewer", "GET", `orders/${f.id("unknown-B")}/${endpoint}`);
        expect(denied.status).toBe(403); expect(denied.body).toEqual(missing.body);
        expect(denied.headers["cache-control"]).toBe("no-store, private");
      }
    }, { qualificationOrder: "reviewer-first" });
  });

  it("rejects a second current Session, cursor tampering without retaining pair data", async () => {
    await withPreparedReaderFixture("discovery", "h1-second-session", async f => {
      const b = await f.candidate();
      for (let n = 30; n < 51; n++) await f.predecessor(n);
      const route = `orders/${b.order.id}/predecessor-candidates`;
      const first = await f.send<Page>("reviewer", "GET", route); expect(first.status).toBe(200);
      const cursor = first.body.nextCursor as string;
      expect(cursor).toHaveLength(1062);
      const second = await f.secondSession("reviewer");
      expect((await f.send("reviewer", "GET", `${route}?cursor=${cursor}`, undefined, second)).status).toBe(403);
      const tampered = `${cursor[0] === "A" ? "B" : "A"}${cursor.slice(1)}`;
      expect((await f.send("reviewer", "GET", `${route}?cursor=${tampered}`)).status).toBe(403);
      f.advance(15 * MINUTE);
      expect((await f.send("reviewer", "GET", `${route}?cursor=${cursor}`)).status).toBe(403);
    });
  });

  it("allows an empty bounded page to continue without claiming absence", async () => {
    await withPreparedReaderFixture("discovery", "h1-empty-page", async f => {
      const b = await f.candidate();
      const deadline = new Date(f.clock.valueOf() + MINUTE);
      const visits: Visit[] = [];
      for (let n = 30; n < 51; n++) visits.push((await f.predecessor(n, n < 50 ? { provenance: deadline } : {})).visit);
      // The first 20 predeclared provenance deadlines are one instant; reach it through the first.
      const firstExpiring = visits[0]; if (!firstExpiring) throw new Error("939_visits_missing");
      await f.expireVisitRights(firstExpiring, "provenance", deadline);
      const route = `orders/${b.order.id}/predecessor-candidates`;
      const first = await f.send<Page>("reviewer", "GET", route);
      expect(first.status).toBe(200); expect(first.body.candidates).toEqual([]);
      expect(first.body.exhausted).toBe(false); expect(first.body.nextCursor).toHaveLength(1062);
      const second = await f.send<Page>("reviewer", "GET", `${route}?cursor=${first.body.nextCursor}`);
      expect(second.body).toEqual({ candidates: [{ reportId: f.orderedId("predecessor", 50), observedAt: preparedPredecessorObservation.observedAt, mileageKm: 100 }], nextCursor: null, exhausted: true, scope });
    });
  });
});

// #940 H2: grant loss is a staff.manage revocation through ChangeStaffGrant; inactivity is an
// operator-promoted admin's suspension through the SuspendUser use case. No row is rewritten.
describe("issue940 H2 lawful actors and Business graph", () => {
  it.each(["grant", "inactive"])("omits a B technician after current Identity or assignment %s loss", async loss => {
    await withPreparedReaderFixture("discovery", `h2-technician-${loss}`, async f => {
      const b = await f.arrived("B");
      const before = await f.send("reviewer", "GET", `orders/${b.order.id}/linking-technicians`);
      expect(before.body).toEqual({ technicians: [{ userId: f.actors.technicianB.userId, name: "B technician" }] });
      if (loss === "grant") await f.revokeStaffGrant("technicianB", "diagnostics.technician");
      if (loss === "inactive") await f.suspendUser("technicianB");
      const response = await f.send("reviewer", "GET", `orders/${b.order.id}/linking-technicians`);
      expect(response.status).toBe(200); expect(response.body).toEqual({ technicians: [] });
    });
  });
});
