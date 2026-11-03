import { describe, expect, it } from "vitest";
import { withPreparedReaderFixture, type DiagnosticPreparedReaderFixture, type MaterialRights, type PreparedReaderSetup, type Visit } from "../../../../test/helpers/diagnosticPreparedReaderFixture";

describe("issue938 recovery stage1", () => {
  it("lets only the selected current B technician reload a minimal usable handle without A access", async () => {
    await withPreparedReaderFixture("handoff", "current-technician", async f => {
      const { a, b, report } = await f.pair();
      const proofId = await f.issue(a, b, report, 7);
      expect((await f.send("reviewer", "GET", `orders/${b.order.id}/continuity-proofs/${proofId}`)).status).toBe(200);
      const storedB = await f.db.inspectionOrder.findUniqueOrThrow({ where: { id: b.order.id } });
      const proof = await f.db.diagnosticContinuityProof.findUniqueOrThrow({ where: { id: proofId } });
      const content = proof.content as { candidate?: { orderId: string; orderVersion: number } };
      if (!b.raw) throw new Error("938_handoff_raw_missing");
      expect(storedB.version).toBe(7);
      expect(content.candidate).toEqual({ orderId: b.order.id, orderVersion: 7, identityRecordId: b.raw.id, identityRecordHash: b.raw.observationHash });
      expect(f.ledger.filter(entry => entry.orderId === b.order.id)).toEqual([
        { orderId: b.order.id, event: "create", version: 0 },
        { orderId: b.order.id, event: "physical authorization", version: 1 },
        { orderId: b.order.id, event: "reviewer assignment", version: 2 },
        { orderId: b.order.id, event: "technician assignment", version: 3 },
        { orderId: b.order.id, event: "confirmed", version: 4 },
        { orderId: b.order.id, event: "arrived", version: 5 },
        { orderId: b.order.id, event: "no ownership grant", version: 5 },
        { orderId: b.order.id, event: "first raw", version: 6 },
        { orderId: b.order.id, event: "provenance stage-upload", version: 6 },
        { orderId: b.order.id, event: "retained evidence append", version: 7 },
        { orderId: b.order.id, event: "proof issue-read", version: 7 },
      ]);

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

type Handoffs = { handoffs: { proofId: string }[]; result: unknown; nextCursor: string | null; scope: string };
type Requests = { requests: { requestId: string }[]; nextCursor: string | null };
type Transition = { a: Visit; b: Visit; proofId: string; deadline: Date };
const HOUR = 60 * 60_000;

// #939 H1: real-PostgreSQL replacements driven by explicit case clocks, predeclared
// per-visit rights deadlines and ordinary qualification deadlines. No row is rewritten.
describe("issue939 H1 lawful case clocks and rights", () => {
  it.each([
    ["issuer qualification loss", { qualificationOrder: "reviewer-first" }, () => ({}), (f: DiagnosticPreparedReaderFixture) => f.expireReviewerQualification()],
    ["A rights expiry", {}, (deadline: Date) => ({ a: { provenance: deadline } }), (f: DiagnosticPreparedReaderFixture, t: Transition) => f.expireVisitRights(t.a, "provenance", t.deadline)],
    ["B rights expiry", {}, (deadline: Date) => ({ b: { evidence: deadline } }), (f: DiagnosticPreparedReaderFixture, t: Transition) => f.expireVisitRights(t.b, "evidence", t.deadline)],
    // A proof's rightsUntil is its earliest bound material deadline (coordinator-accepted coincidence).
    ["proof rights expiry", {}, (deadline: Date) => ({ a: { evidence: deadline } }), (f: DiagnosticPreparedReaderFixture, t: Transition) => f.expireProofRights(t.proofId, t.deadline)],
  ] as [string, PreparedReaderSetup, (deadline: Date) => { a?: MaterialRights; b?: MaterialRights }, (f: DiagnosticPreparedReaderFixture, t: Transition) => Promise<void>][])(
    "uniformly omits and refuses %s at read and again at action", async (name, setup, rights, transition) => {
    await withPreparedReaderFixture("handoff", `h1-${name.replace(/ /g, "-")}`, async f => {
      const deadline = new Date(f.clock.valueOf() + HOUR);
      const { a, b, report } = await f.pair(false, undefined, rights(deadline));
      const proofId = await f.issue(a, b, report, 7);
      expect((await f.send("reviewer", "GET", `orders/${b.order.id}/continuity-proofs/${proofId}`)).status).toBe(200);
      expect((await f.send<Handoffs>("technicianB", "GET", `orders/${b.order.id}/continuity-handoffs`)).body.handoffs).toHaveLength(1);
      await transition(f, { a, b, proofId, deadline });
      expect((await f.send<Handoffs>("technicianB", "GET", `orders/${b.order.id}/continuity-handoffs`)).body).toEqual({ handoffs: [], result: null, nextCursor: null, scope: "current_b_owned_handoffs" });
      const denied = await f.send("technicianB", "POST", `orders/${b.order.id}/continuity-handoffs/${proofId}/consume`, { reportId: f.id("report-9000"), expectedOrderVersion: 7, reason: "B follow-up" });
      expect(denied).toMatchObject({ status: 403, body: { code: "DIAGNOSTIC_NO_ACCESS", message: "Inspection request could not be completed" } });
      expect(await f.db.diagnosticReportRecord.count({ where: { orderId: b.order.id } })).toBe(0);
      // Original per-case database; shared-worker count is scoped to this case's orders.
      expect(await f.db.diagnosticAudit.count({ where: { action: "CONTINUITY_PROOF_CONSUMED", orderId: { in: [a.order.id, b.order.id] } } })).toBe(0);
    }, setup);
  });

  it("binds continuation to the query, actor, Session, B and expiry, without inherited authority", async () => {
    await withPreparedReaderFixture("handoff", "h1-handoff-continuation", async f => {
      const { a, b, report } = await f.pair();
      // 21 independently issued proofs, lawfully invalidated, then the one current proof.
      for (let n = 0; n < 21; n++) await f.issue(a, b, report, 7);
      await f.invalidateIssuedProofs(b, 21);
      const proofId = await f.issue(a, b, report, 7);
      expect((await f.send("reviewer", "GET", `orders/${b.order.id}/continuity-proofs/${proofId}`)).status).toBe(200);
      const cursor = (await f.send<Handoffs>("technicianB", "GET", `orders/${b.order.id}/continuity-handoffs`)).body.nextCursor as string;
      expect((await f.send("reviewer", "GET", `orders/${b.order.id}/predecessor-candidates?cursor=${cursor}`)).status).toBe(403);
      expect((await f.send("technicianB", "GET", `orders/${b.order.id}/continuity-handoffs?cursor=${cursor.slice(0, -1)}!`)).status).toBe(403);
      f.advance(15 * 60_000);
      expect((await f.send("technicianB", "GET", `orders/${b.order.id}/continuity-handoffs?cursor=${cursor}`)).status).toBe(403);
    });
  });

  it("bounds request discovery, binds continuations to Session/B/query and stages linkage only", async () => {
    await withPreparedReaderFixture("handoff", "h1-request-discovery", async f => {
      const b = await f.candidate();
      const requestPath = `orders/${b.order.id}/continuity-requests`;
      const prepare = async () => {
        const response = await f.send<{ requestId: string }>("technicianB", "POST", requestPath, { kind: "consume" });
        expect(response.status).toBe(201);
        expect(response.headers["cache-control"]).toBe("no-store, private");
        return response.body.requestId;
      };
      for (let n = 0; n < 21; n++) await prepare();
      const first = await f.send<Requests>("technicianB", "GET", requestPath);
      expect(first.body.requests).toHaveLength(20);
      const cursor = first.body.nextCursor as string;
      expect(cursor).toHaveLength(1062);
      const next = await f.send<Requests>("technicianB", "GET", `${requestPath}?cursor=${cursor}`);
      expect(next.body.requests).toHaveLength(1); expect(next.body.nextCursor).toBeNull();
      expect(new Set([...first.body.requests, ...next.body.requests].map(r => r.requestId)).size).toBe(21);
      expect((await f.send("technicianB", "GET", `orders/${b.order.id}/continuity-handoffs?cursor=${cursor}`)).status).toBe(403);
      const rows = await f.db.diagnosticContinuityRequest.findMany({ where: { orderId: b.order.id } });
      for (const row of rows) {
        expect(row).not.toHaveProperty("command"); expect(row).not.toHaveProperty("reason"); expect(row).not.toHaveProperty("commandHash");
        expect(row).toMatchObject({ actorId: f.actors.technicianB.userId, sessionId: f.actors.technicianB.sessionId, kind: "consume", orderId: b.order.id });
      }
      f.advance(15 * 60_000);
      expect((await f.send("technicianB", "GET", `${requestPath}?cursor=${cursor}`)).status).toBe(403);
    });
  });
});
