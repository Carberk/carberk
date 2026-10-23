import "reflect-metadata";
import { randomUUID } from "node:crypto";
import { ConfigModule } from "@nestjs/config";
import { Reflector } from "@nestjs/core";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { JwtModule, JwtService } from "@nestjs/jwt";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { PrismaService } from "@auto-tm/db";
import supertest from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bullTestRoot } from "../../../../test/helpers/bullTestRoot";
import { cleanSuiteFixtures, defineE2eSuite, seedSuiteCatalog } from "../../../../test/helpers/e2eSuite";
import { GlobalErrorFilter } from "../../../common/error.filter";
import { JwtAuthGuard } from "../../../common/jwt-auth.guard";
import { IDENTITY_CLOCK_PORT } from "../../identity/identity.public";
import { DiagnosticsModule } from "../diagnostics.module";
import { DIAGNOSTIC_RUNTIME } from "../domain/ports/DiagnosticIntakePort";

const suite = defineE2eSuite("diagnostic-report-identity-binding");
const people = ["buyer", "other", "reception", "technician", "reviewer", "reviewerA", "reviewerB", "technicianB", "unassigned", "admin"] as const;
type Person = typeof people[number];
const capability: Partial<Record<Person, string>> = {
  reception: "diagnostics.reception", technician: "diagnostics.technician",
  reviewer: "diagnostics.reviewer", reviewerA: "diagnostics.reviewer", reviewerB: "diagnostics.reviewer", technicianB: "diagnostics.technician", unassigned: "diagnostics.technician",
};
const now = new Date("2026-10-18T00:00:00.000Z");
const future = new Date("2026-11-18T00:00:00.000Z");
const centerId = suite.id("center");
const localized = { tk: "Synag", ru: "Тест", en: "Synthetic" };

// Same real Nest/Prisma/current-authority composition as DiagnosticReports.e2e.spec.ts.
// Only time and synthetic admission use that suite's established deterministic overrides.
describe("reports retain the identity selected at first draft creation", () => {
  let app: NestFastifyApplication;
  let db: PrismaService;
  let jwt: JwtService;
  let request: ReturnType<typeof supertest>;
  const headers = (who: Person) => ({ authorization: `Bearer ${jwt.sign({ sub: suite.id(who), sid: suite.id(`${who}-session`), role: who === "admin" ? "admin" : "buyer" })}` });
  const post = (who: Person, path: string, body: object) => request.post(`/api/v1/diagnostics/${path}`).set(headers(who)).send(body);
  const get = (who: Person, path: string) => request.get(`/api/v1/diagnostics/${path}`).set(headers(who));
  async function cleanup() {
    if (!db) return;
    // Teardown only: no report/identity/proof rows are seeded or inspected by this journey.
    await db.diagnosticPdfArtifact.deleteMany({ where: { report: { order: { centerId } } } });
    await db.diagnosticReportRecord.deleteMany({ where: { order: { centerId }, predecessorId: { not: null } } });
    await db.diagnosticReportRecord.deleteMany({ where: { order: { centerId } } });
    await db.diagnosticAudit.deleteMany({ where: { centerId } });
    await db.diagnosticOrderAssignment.deleteMany({ where: { order: { centerId } } });
    await db.inspectionOrder.deleteMany({ where: { centerId } });
    await db.diagnosticTemplateVersion.deleteMany({ where: { centerId } });
    await db.diagnosticCenterAssignment.deleteMany({ where: { centerId } });
    await db.diagnosticCenter.deleteMany({ where: { id: centerId } });
    await db.listing.deleteMany({ where: { sellerId: suite.id("buyer") } });
    await cleanSuiteFixtures(db, suite, { userAliases: people });
  }
  beforeAll(async () => {
    const testing = await Test.createTestingModule({ imports: [
      ConfigModule.forRoot({ isGlobal: true, load: [() => ({ DIAGNOSTIC_PRIVATE_BUCKET: "diagnostic-test-private" })] }), EventEmitterModule.forRoot(), bullTestRoot(),
      DiagnosticsModule, JwtModule.register({ global: true, secret: "synthetic-diagnostic-test" }),
    ] })
      .overrideProvider(IDENTITY_CLOCK_PORT).useValue({ now: () => now })
      .overrideProvider(DIAGNOSTIC_RUNTIME).useValue({ now: () => now, id: randomUUID,
        publicSyntheticAllowed: () => true,
        syntheticAllowed: ({ userId }: { userId: string }) => people.some(who => suite.id(who) === userId),
      }).compile();
    app = testing.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    db = app.get(PrismaService); jwt = app.get(JwtService);
    app.useGlobalGuards(new JwtAuthGuard(app.get(Reflector), jwt));
    app.useGlobalFilters(new GlobalErrorFilter());
    await app.listen(0, "127.0.0.1"); request = supertest(app.getHttpServer());
    await cleanup();
    for (const who of people) {
      await db.user.create({ data: { id: suite.id(who), phone: suite.phone(who), role: who === "admin" ? "admin" : "buyer", phoneVerifiedAt: now } });
      await db.session.create({ data: { id: suite.id(`${who}-session`), userId: suite.id(who), refreshTokenHash: suite.id(`${who}-refresh`), expiresAt: future, adminTotpExpiresAt: future } });
      if (capability[who]) await db.staffGrant.create({ data: { userId: suite.id(who), capability: capability[who]! } });
    }
    await db.diagnosticCenter.create({ data: { id: centerId, code: suite.slugFor("center"), names: localized } });
    for (const who of ["reception", "technician", "reviewer", "reviewerA", "reviewerB", "technicianB", "unassigned"] as const) {
      await db.diagnosticCenterAssignment.create({ data: { centerId, userId: suite.id(who), capability: capability[who]!, qualifiedUntil: future } });
    }
    await db.staffGrant.create({ data: { userId: suite.id("reception"), capability: "diagnostics.templates" } });
    await db.diagnosticCenterAssignment.create({ data: { centerId, userId: suite.id("reception"), capability: "diagnostics.templates", qualifiedUntil: future } });
    await seedSuiteCatalog(db, suite);
    await db.listing.create({ data: { id: suite.id("car"), sellerId: suite.id("buyer"), brandId: suite.catalog.brandId,
      modelId: suite.catalog.modelId, cityId: suite.catalog.cityId, status: "active", priceAmount: 100000, priceTmt: 100000, priceCurrency: "TMT" } });
  });
  afterAll(async () => { try { await cleanup(); } finally { await app?.close(); } });

  it("keeps A's first-draft identity through reobservation and correction, with comparison restricted to current staff on both visits", async () => {
    const definition = { title: localized, limitations: localized, syntheticNotice: localized,
      checks: [{ id: "brakes", label: localized, required: true, evidenceRequired: false, measurement: null }], panels: [] };
    const { body: template } = await post("reception", `centers/${centerId}/templates`, { expectedVersion: 0, definition, synthetic: true }).expect(201);
    async function visit(extraStaff: "reviewerA" | "reviewerB") {
      let { body: order } = await post("buyer", "orders", { requestKey: randomUUID(), centerId, templateVersionId: template.id,
        audience: "listing_public", listingId: suite.id("car"), synthetic: true }).expect(201);
      for (const who of ["technician", "reviewer", extraStaff, ...(extraStaff === "reviewerB" ? ["technicianB"] as const : [])] as const) {
        ({ body: order } = await post("reception", `orders/${order.id}/assignments`, { expectedVersion: order.version, userId: suite.id(who), capability: capability[who], active: true }).expect(201));
      }
      for (const kind of ["physical", "publication"]) {
        ({ body: order } = await post("reception", `orders/${order.id}/authorization`, { expectedVersion: order.version, kind, authorityReference: `Synthetic ${kind} authorization` }).expect(201));
      }
      for (const state of ["confirmed", "arrived"]) {
        ({ body: order } = await post("reception", `orders/${order.id}/appointment`, { expectedVersion: order.version, state }).expect(201));
      }
      return order;
    }
    // These are synthetic observations for binding only. Freeform manualReference proves no continuity.
    const original = { observedAt: "2026-10-17T10:00:00.000Z", mileageKm: 123000, method: "manual", manualReference: "Synthetic A initial observation", vin: null };
    const duringDraft = { observedAt: "2026-10-17T10:30:00.000Z", mileageKm: 123001, method: "manual", manualReference: "Synthetic A observation while draft exists", vin: null };
    const later = { observedAt: "2026-10-17T11:00:00.000Z", mileageKm: 123001, method: "manual", manualReference: "Synthetic A later observation", vin: null };
    const candidate = { observedAt: "2026-10-18T00:00:00.000Z", mileageKm: 124000, method: "manual", manualReference: "Synthetic B independent observation", vin: null };
    let a = await visit("reviewerA");
    ({ body: a } = await post("technician", `orders/${a.id}/vehicle`, { expectedVersion: a.version, ...original }).expect(201));
    expect(a).toMatchObject({ version: 8, observedVehicle: original });
    const historyPath = `orders/${a.id}/identity-records`;
    const { body: firstHistory } = await get("reviewer", historyPath).expect(200);
    expect(firstHistory).toEqual([{ id: expect.stringMatching(/^[a-f0-9-]{36}$/), orderId: a.id, orderVersion: 8,
      observationHash: expect.stringMatching(/^[a-f0-9]{64}$/), observation: original, recordedBy: suite.id("technician"), recordedAt: now.toISOString() }]);
    const ia = firstHistory[0];
    const { body: draft } = await post("technician", `orders/${a.id}/reports`, { reportId: randomUUID(), expectedOrderVersion: 8 }).expect(201);
    // A release-time pin would be wrong too: first draft already selected IA.
    ({ body: a } = await post("technician", `orders/${a.id}/vehicle`, { expectedVersion: 8, ...duringDraft }).expect(201));
    expect(a).toMatchObject({ version: 9, observedVehicle: duringDraft });
    const { body: draftHistory } = await get("reviewer", historyPath).expect(200);
    expect(draftHistory).toEqual([ia, { id: expect.any(String), orderId: a.id, orderVersion: 9,
      observationHash: expect.stringMatching(/^[a-f0-9]{64}$/), observation: duringDraft, recordedBy: suite.id("technician"), recordedAt: now.toISOString() }]);
    expect(draftHistory[1].id).not.toBe(ia.id);
    expect(draftHistory[1].observationHash).not.toBe(ia.observationHash);
    const finding = { id: randomUUID(), checkId: "brakes", assessment: "normal", explanation: null, evidenceIds: [], kind: null, source: null, measurement: null, location: null };
    await post("technician", `reports/${draft.id}/findings`, { expectedVersion: 0, finding }).expect(201);
    await post("technician", `reports/${draft.id}/transition`, { expectedVersion: 1, action: "submit" }).expect(201);
    await post("reviewer", `reports/${draft.id}/transition`, { expectedVersion: 2, action: "finalize" }).expect(201);
    const { body: released } = await get("reviewer", `reports/${draft.id}`).expect(200);
    expect(released).toMatchObject({ version: 3, status: "finalized", observedAt: original.observedAt, mileageKm: 123000 });
    const commissionerBefore = (await get("buyer", `reports/${draft.id}`).expect(200)).body;
    const publicRead = () => request.get(`/api/v1/public-diagnostics/reports/${draft.id}`);
    const publicBefore = (await publicRead().expect(200)).body;

    ({ body: a } = await post("technician", `orders/${a.id}/vehicle`, { expectedVersion: 9, ...later }).expect(201));
    expect(a).toMatchObject({ version: 10, observedVehicle: later });
    const { body: aHistory } = await get("reviewer", historyPath).expect(200);
    expect(aHistory).toEqual([...draftHistory, { id: expect.any(String), orderId: a.id, orderVersion: 10,
      observationHash: expect.stringMatching(/^[a-f0-9]{64}$/), observation: later, recordedBy: suite.id("technician"), recordedAt: now.toISOString() }]);
    expect(aHistory[2].id).not.toBe(ia.id);
    expect(aHistory[2].observationHash).not.toBe(ia.observationHash);
    let b = await visit("reviewerB");
    ({ body: b } = await post("technicianB", `orders/${b.id}/vehicle`, { expectedVersion: b.version, ...candidate }).expect(201));
    expect(b).toMatchObject({ version: 9, observedVehicle: candidate });
    const { body: bHistory } = await get("reviewer", `orders/${b.id}/identity-records`).expect(200);
    expect(bHistory).toEqual([{ id: expect.stringMatching(/^[a-f0-9-]{36}$/), orderId: b.id, orderVersion: 9,
      observationHash: expect.stringMatching(/^[a-f0-9]{64}$/), observation: candidate, recordedBy: suite.id("technicianB"), recordedAt: now.toISOString() }]);
    const ib = bHistory[0];
    const comparisonPath = (orderId = b.id, predecessorId = draft.id) => `orders/${orderId}/reinspection-comparison?predecessorId=${predecessorId}`;
    const reviewerHeaders = headers("reviewer");
    // First new behavior assertion: expected hosted RED is absent route 404 versus 200.
    const comparison = await request.get(`/api/v1/diagnostics/${comparisonPath()}`).set(reviewerHeaders).expect(200);
    const privateNoStore = (response: { headers: Record<string, string> }) => {
      expect(response.headers["cache-control"]).toContain("private");
      expect(response.headers["cache-control"]).toContain("no-store");
    };
    privateNoStore(comparison);
    // Each identity is exactly the retained raw observation; no structured evidence was captured, so none is invented.
    const unstructured = (observation: object) => ({ observation, evidence: null, corrections: [], evidenceGeneration: 0, correctionHeadHash: null });
    expect(comparison.body).toEqual({
      predecessor: { reportId: draft.id, reportVersion: 3, snapshotHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        identityRecordId: ia.id, identityRecordHash: ia.observationHash, identity: unstructured(original) },
      candidate: { orderId: b.id, orderVersion: 9, identityRecordId: ib.id, identityRecordHash: ib.observationHash, identity: unstructured(candidate) },
    });
    const expected = comparison.body;
    const technicianComparison = await get("technician", comparisonPath()).expect(200);
    privateNoStore(technicianComparison);
    expect(technicianComparison.body).toEqual(expected);
    expect((await get("reviewer", `reports/${draft.id}`).expect(200)).body).toEqual(released);
    expect((await get("buyer", `reports/${draft.id}`).expect(200)).body).toEqual(commissionerBefore);
    expect((await publicRead().expect(200)).body).toEqual(publicBefore);
    const noPin = (body: unknown) => {
      const serialized = JSON.stringify(body);
      expect(serialized).not.toMatch(/identityRecordId|identityRecordHash|observationHash|snapshotHash|manualReference|provenance/);
      for (const value of [ia.id, ia.observationHash, aHistory[1].id, aHistory[1].observationHash, aHistory[2].id, aHistory[2].observationHash, ib.id, ib.observationHash,
        original.manualReference, duringDraft.manualReference, later.manualReference, candidate.manualReference]) expect(serialized).not.toContain(value);
    };
    for (const body of [draft, released, commissionerBefore, publicBefore]) noPin(body);
    for (const who of ["technician", "buyer"] as const) noPin((await get(who, `orders/${a.id}/reports`).expect(200)).body);
    expect((await get("reviewer", `orders/${b.id}/reports`).expect(200)).body).toEqual([]);

    const { body: correction } = await post("technician", `reports/${draft.id}/corrections`, {
      expectedVersion: 3, successorId: randomUUID(), reason: "Synthetic editorial correction only" }).expect(201);
    expect(correction).toMatchObject({ status: "draft", version: 0, successorOf: draft.id, lineageKind: "correction", observedAt: original.observedAt, mileageKm: 123000 });
    noPin(correction);
    await post("technician", `reports/${correction.id}/transition`, { expectedVersion: 0, action: "submit" }).expect(201);
    await post("reviewer", `reports/${correction.id}/transition`, { expectedVersion: 1, action: "finalize" }).expect(201);
    const correctedComparison = await get("reviewer", comparisonPath(b.id, correction.id)).expect(200);
    privateNoStore(correctedComparison);
    expect(correctedComparison.body).toEqual({ predecessor: { ...expected.predecessor, reportId: correction.id, reportVersion: 2,
      snapshotHash: expect.stringMatching(/^[a-f0-9]{64}$/) }, candidate: expected.candidate });
    expect(correctedComparison.body.predecessor.snapshotHash).not.toBe(expected.predecessor.snapshotHash);
    const originalAgain = await get("reviewer", comparisonPath()).expect(200);
    expect(originalAgain.body).toEqual(expected);
    noPin((await get("buyer", `reports/${correction.id}`).expect(200)).body);
    noPin((await request.get(`/api/v1/public-diagnostics/reports/${correction.id}`).expect(200)).body);

    const deniedBody = { statusCode: 403, code: "DIAGNOSTIC_NO_ACCESS", message: "Inspection request could not be completed",
      timestamp: expect.any(String), requestId: "unknown" };
    const denied = async (who: Person, path: string) => {
      const response = await get(who, path).expect(403);
      privateNoStore(response);
      expect(response.body).toEqual(deniedBody);
    };
    // Neither B-only technicians nor reviewers with just one order can compare A.
    for (const who of ["technicianB", "reviewerA", "reviewerB", "buyer", "admin", "other", "unassigned"] as const) {
      await denied(who, comparisonPath());
      await denied(who, comparisonPath(b.id, suite.id("missing-report")));
      await denied(who, comparisonPath(suite.id("missing-order"), draft.id));
    }
    await denied("reviewer", comparisonPath(b.id, suite.id("missing-report")));
    await denied("reviewer", comparisonPath(suite.id("missing-order"), draft.id));
    await post("reception", `orders/${a.id}/assignments`, { expectedVersion: 10, userId: suite.id("reviewer"), capability: capability.reviewer, active: false }).expect(201);
    // The identical JWT/session still has B authority, but HTTP revocation on A immediately denies.
    const revoked = await request.get(`/api/v1/diagnostics/${comparisonPath()}`).set(reviewerHeaders).expect(403);
    privateNoStore(revoked);
    expect(revoked.body).toEqual(deniedBody);
    await denied("reviewer", comparisonPath(b.id, suite.id("missing-report")));
    expect((await get("technician", comparisonPath()).expect(200)).body).toEqual(expected);
  });
});
