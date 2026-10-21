import "reflect-metadata";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { ConfigModule } from "@nestjs/config";
import { Reflector } from "@nestjs/core";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { JwtModule, JwtService } from "@nestjs/jwt";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { PrismaService } from "@auto-tm/db";
import supertest from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { bullTestRoot } from "../../../../test/helpers/bullTestRoot";
import { cleanSuiteFixtures, defineE2eSuite } from "../../../../test/helpers/e2eSuite";
import { GlobalErrorFilter } from "../../../common/error.filter";
import { JwtAuthGuard } from "../../../common/jwt-auth.guard";
import { DiagnosticsModule } from "../diagnostics.module";
import { DIAGNOSTIC_RUNTIME } from "../domain/ports/DiagnosticIntakePort";

const suite = defineE2eSuite("diagnostic-identity-account-erasure");
const people = ["buyer", "other", "foreign", "reception", "technician", "reviewer", "controlTechnician"] as const;
type Person = typeof people[number];
const capability: Partial<Record<Person, string>> = {
  reception: "diagnostics.reception", technician: "diagnostics.technician", reviewer: "diagnostics.reviewer", controlTechnician: "diagnostics.technician",
};
const now = new Date("2026-10-18T00:00:00.000Z");
const future = new Date("2026-11-18T00:00:00.000Z");
const centerId = suite.id("center");
const reportIds = [suite.id("buyer-report"), suite.id("other-report")];
const localized = { tk: "Synag", ru: "Тест", en: "Synthetic" };
const deniedBody = { statusCode: 403, code: "DIAGNOSTIC_NO_ACCESS", message: "Inspection request could not be completed",
  timestamp: expect.any(String), requestId: "unknown" };

describe("diagnostic identity history after product account deletion and due purge", () => {
  let app: NestFastifyApplication;
  let db: PrismaService;
  let jwt: JwtService;
  let request: ReturnType<typeof supertest>;
  const headers = (who: Person) => ({ authorization: `Bearer ${jwt.sign({ sub: suite.id(who), sid: suite.id(`${who}-session`), role: "buyer" })}` });
  const post = (who: Person, path: string, body: object) => request.post(`/api/v1/diagnostics/${path}`).set(headers(who)).send(body);
  const get = (who: Person, path: string) => request.get(`/api/v1/diagnostics/${path}`).set(headers(who));
  const records = (orderId: string) => db.diagnosticIdentityRecord.findMany({ where: { orderId }, orderBy: { orderVersion: "asc" } });
  async function cleanup() {
    if (!db) return;
    // Exact suite-owned release leaves first, then reports before their orders/identity pins.
    await db.diagnosticPdfArtifact.deleteMany({ where: { reportId: { in: reportIds } } });
    await db.diagnosticReportRecord.deleteMany({ where: { id: { in: reportIds } } });
    await db.diagnosticAudit.deleteMany({ where: { centerId } });
    await db.diagnosticOrderAssignment.deleteMany({ where: { order: { centerId } } });
    // Teardown only. Identity records cascade from these suite-owned orders.
    await db.inspectionOrder.deleteMany({ where: { centerId } });
    await db.diagnosticTemplateVersion.deleteMany({ where: { centerId } });
    await db.diagnosticCenterAssignment.deleteMany({ where: { centerId } });
    await db.diagnosticCenter.deleteMany({ where: { id: centerId } });
    await cleanSuiteFixtures(db, suite, { userAliases: people });
  }
  beforeAll(async () => {
    // Fake only the time boundary; real timers and product deletion/authority remain active.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(now);
    const testing = await Test.createTestingModule({ imports: [
      ConfigModule.forRoot({ isGlobal: true, load: [() => ({ DIAGNOSTIC_PRIVATE_BUCKET: "diagnostic-test-private" })] }),
      EventEmitterModule.forRoot(), bullTestRoot(), DiagnosticsModule,
      JwtModule.register({ global: true, secret: "synthetic-diagnostic-erasure-test" }),
    ] })
      .overrideProvider(DIAGNOSTIC_RUNTIME).useValue({ now: () => now, id: randomUUID,
        publicSyntheticAllowed: () => false,
        syntheticAllowed: ({ userId }: { userId: string }) => people.some(who => suite.id(who) === userId),
      }).compile();
    app = testing.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    db = app.get(PrismaService); jwt = app.get(JwtService);
    app.useGlobalGuards(new JwtAuthGuard(app.get(Reflector), jwt));
    app.useGlobalFilters(new GlobalErrorFilter());
    await app.listen(0, "127.0.0.1"); request = supertest(app.getHttpServer());
    await cleanup();
    for (const who of people) {
      await db.user.create({ data: { id: suite.id(who), phone: suite.phone(who), role: "buyer", phoneVerifiedAt: now } });
      await db.session.create({ data: { id: suite.id(`${who}-session`), userId: suite.id(who), refreshTokenHash: suite.id(`${who}-refresh`), expiresAt: future, adminTotpExpiresAt: future } });
      if (capability[who]) await db.staffGrant.create({ data: { userId: suite.id(who), capability: capability[who]! } });
    }
    await db.diagnosticCenter.create({ data: { id: centerId, code: suite.slugFor("center"), names: localized } });
    for (const who of ["reception", "technician", "reviewer", "controlTechnician"] as const) {
      await db.diagnosticCenterAssignment.create({ data: { centerId, userId: suite.id(who), capability: capability[who]!, qualifiedUntil: future } });
    }
    await db.staffGrant.create({ data: { userId: suite.id("reception"), capability: "diagnostics.templates" } });
    await db.diagnosticCenterAssignment.create({ data: { centerId, userId: suite.id("reception"), capability: "diagnostics.templates", qualifiedUntil: future } });
  });
  afterAll(async () => {
    try { await cleanup(); } finally {
      try { await app?.close(); } finally { vi.useRealTimers(); }
    }
  });

  async function deleteAndPurge(who: "buyer" | "technician", orderId: string) {
    await request.delete("/api/v1/me").set(headers(who)).expect(204, "");
    const scheduled = await db.user.findUniqueOrThrow({ where: { id: suite.id(who) } });
    expect(scheduled.deletionScheduledAt?.toISOString()).toBe("2026-11-17T00:00:00.000Z");
    expect(await db.session.count({ where: { userId: suite.id(who) } })).toBe(0);
    for (const suffix of ["", "/identity-records"]) {
      expect((await get(who, `orders/${orderId}${suffix}`).expect(403)).body).toEqual(deniedBody);
    }
    // Same bounded single Node/tsx subprocess pattern as CampaignFullV3.
    // No Prisma proxy or fake worker: execute the production job on the worker DB.
    // Refuse BEFORE mutation if its global selection/OTP retention could touch a foreign namespace.
    const workerPath = resolve(__dirname, "../../../../../worker/src/jobs/PurgeExpiredAccounts.ts");
    const script = `
      require('reflect-metadata');
      const { PrismaService } = require('@auto-tm/db');
      const { PurgeExpiredAccounts } = require(${JSON.stringify(workerPath)});
      async function main() {
        const db = new PrismaService();
        try {
          const now = new Date(${JSON.stringify(scheduled.deletionScheduledAt!.toISOString())});
          const target = ${JSON.stringify(suite.id(who))};
          const due = await db.user.findMany({ where: { deletionScheduledAt: { lte: now } }, select: { id: true } });
          if (due.length !== 1 || due[0].id !== target) throw new Error('Identity erasure isolation refused: foreign or missing due account');
          const stale = await db.otpRequest.findMany({ where: { createdAt: { lt: new Date(now.getTime() - 30 * 86400000) } },
            select: { userId: true, destination: true } });
          if (stale.some(row => !(row.userId === target || row.userId === null && row.destination === ${JSON.stringify(suite.phone(who))}))) throw new Error('Identity erasure isolation refused: foreign expired OTP rows');
          const result = await new PurgeExpiredAccounts(db).execute({ now });
          if (result.purgedCount !== 1) throw new Error('Expected exactly one product-scheduled account purge');
        } finally { await db.$disconnect(); }
      }
      void main().catch(error => { console.error(error); process.exitCode = 1; });
    `;
    await promisify(execFile)(process.execPath, ["--import", "tsx", "-e", script], {
      cwd: resolve(__dirname, "../../../.."), env: process.env, timeout: 30000, killSignal: "SIGKILL",
    });
    expect(await db.user.findUniqueOrThrow({ where: { id: suite.id(who) }, select: { phone: true, deletionScheduledAt: true } }))
      .toEqual({ phone: null, deletionScheduledAt: null });
  }

  it("erases commissioner identity content, detaches a deleted recorder elsewhere and preserves foreign visits", async () => {
    const definition = { title: localized, limitations: localized, syntheticNotice: localized,
      checks: [{ id: "brakes", label: localized, required: true, evidenceRequired: false, measurement: null }], panels: [] };
    const { body: template } = await post("reception", `centers/${centerId}/templates`, { expectedVersion: 0, definition, synthetic: true }).expect(201);
    async function visit(commissioner: "buyer" | "other" | "foreign", recorder: "technician" | "controlTechnician") {
      let { body: order } = await post(commissioner, "orders", { requestKey: randomUUID(), centerId, templateVersionId: template.id, audience: "buyer_private", synthetic: true }).expect(201);
      for (const who of ["technician", "reviewer", ...(recorder === "controlTechnician" ? ["controlTechnician"] as const : [])] as const) {
        ({ body: order } = await post("reception", `orders/${order.id}/assignments`, { expectedVersion: order.version, userId: suite.id(who), capability: capability[who], active: true }).expect(201));
      }
      ({ body: order } = await post("reception", `orders/${order.id}/authorization`, { expectedVersion: order.version, kind: "physical", authorityReference: "Synthetic fixture physical access only" }).expect(201));
      for (const state of ["confirmed", "arrived"]) {
        ({ body: order } = await post("reception", `orders/${order.id}/appointment`, { expectedVersion: order.version, state }).expect(201));
      }
      for (const mileageKm of [123000, 123001]) {
        ({ body: order } = await post(recorder, `orders/${order.id}/vehicle`, { expectedVersion: order.version,
          observedAt: "2026-10-17T10:00:00.000Z", mileageKm, method: "manual", manualReference: `Synthetic ${commissioner} chassis fixture ${mileageKm}`, vin: null }).expect(201));
      }
      const history = (await get("reviewer", `orders/${order.id}/identity-records`).expect(200)).body;
      expect(history).toHaveLength(2);
      expect(history.map((row: { observation: object }) => row.observation)).toEqual([
        { observedAt: "2026-10-17T10:00:00.000Z", mileageKm: 123000, method: "manual", manualReference: `Synthetic ${commissioner} chassis fixture 123000`, vin: null },
        { observedAt: "2026-10-17T10:00:00.000Z", mileageKm: 123001, method: "manual", manualReference: `Synthetic ${commissioner} chassis fixture 123001`, vin: null },
      ]);
      for (const row of history) expect(row).toMatchObject({ orderId: order.id, recordedBy: suite.id(recorder), observationHash: expect.stringMatching(/^[a-f0-9]{64}$/) });
      const raw = await records(order.id);
      expect(raw).toHaveLength(2);
      for (const row of raw) expect(row).toMatchObject({ erasedAt: null, recordedById: suite.id(recorder), observationHash: expect.stringMatching(/^[a-f0-9]{64}$/) });
      return { id: order.id as string, version: order.version as number, history, raw };
    }
    const erased = await visit("buyer", "technician");
    const retained = await visit("other", "technician");
    const foreign = await visit("foreign", "controlTechnician");
    async function release(visit: typeof erased, reportId: string, commissioner: "buyer" | "other") {
      const { body: draft } = await post("technician", `orders/${visit.id}/reports`, { reportId, expectedOrderVersion: visit.version }).expect(201);
      const finding = { id: randomUUID(), checkId: "brakes", assessment: "normal", explanation: null, evidenceIds: [], kind: null, source: null, measurement: null, location: null };
      await post("technician", `reports/${reportId}/findings`, { expectedVersion: 0, finding }).expect(201);
      await post("technician", `reports/${reportId}/transition`, { expectedVersion: 1, action: "submit" }).expect(201);
      await post("reviewer", `reports/${reportId}/transition`, { expectedVersion: 2, action: "finalize" }).expect(201);
      const staff = (await get("reviewer", `reports/${reportId}`).expect(200)).body;
      const customer = (await get(commissioner, `reports/${reportId}`).expect(200)).body;
      expect(staff).toMatchObject({ id: reportId, status: "finalized", version: 3, authorId: suite.id("technician"), reviewerId: suite.id("reviewer"),
        observedAt: "2026-10-17T10:00:00.000Z", mileageKm: 123001 });
      return { id: reportId, draft, staff, customer };
    }
    const erasedReport = await release(erased, reportIds[0]!, "buyer");
    const retainedReport = await release(retained, reportIds[1]!, "other");
    const comparisonPath = (candidateId: string, predecessorId: string) => `orders/${candidateId}/reinspection-comparison?predecessorId=${predecessorId}`;
    const privateNoStore = (response: { headers: Record<string, string> }) => {
      expect(response.headers["cache-control"]).toContain("private");
      expect(response.headers["cache-control"]).toContain("no-store");
    };
    async function compare(candidate: typeof erased, predecessor: typeof erasedReport, priorVisit: typeof erased) {
      const response = await get("reviewer", comparisonPath(candidate.id, predecessor.id)).expect(200);
      privateNoStore(response);
      expect(response.body).toEqual({
        predecessor: { reportId: predecessor.id, reportVersion: 3, snapshotHash: expect.stringMatching(/^[a-f0-9]{64}$/),
          identityRecordId: priorVisit.history[1].id, identityRecordHash: priorVisit.history[1].observationHash, identity: priorVisit.history[1].observation },
        candidate: { orderId: candidate.id, orderVersion: candidate.version,
          identityRecordId: candidate.history[1].id, identityRecordHash: candidate.history[1].observationHash, identity: candidate.history[1].observation },
      });
      return response.body;
    }
    await compare(retained, erasedReport, erased);
    await compare(erased, retainedReport, retained);
    const survivingPair = await compare(foreign, retainedReport, retained);
    const noIdentityMaterial = (body: unknown) => {
      const serialized = JSON.stringify(body);
      expect(serialized).not.toMatch(/identityRecordId|identityRecordHash|observationHash|snapshotHash|manualReference|provenance/);
      for (const visit of [erased, retained, foreign]) for (const row of visit.history) {
        for (const value of [row.id, row.observationHash, row.observation.manualReference]) expect(serialized).not.toContain(value);
      }
    };
    for (const [visit, report, commissioner] of [[erased, erasedReport, "buyer"], [retained, retainedReport, "other"]] as const) {
      for (const body of [report.draft, report.staff, report.customer]) noIdentityMaterial(body);
      for (const who of ["reviewer", commissioner] as const) noIdentityMaterial((await get(who, `orders/${visit.id}/reports`).expect(200)).body);
      const publicResponse = await request.get(`/api/v1/public-diagnostics/reports/${report.id}`).expect(404);
      noIdentityMaterial(publicResponse.body);
    }
    async function deniedComparison(candidateId: string, predecessorId: string) {
      // Compare actual erased references to each missing side using the surviving reviewer/session.
      const responses = [];
      for (const path of [comparisonPath(candidateId, predecessorId), comparisonPath(candidateId, suite.id("missing-report")),
        comparisonPath(suite.id("missing-order"), predecessorId)]) {
        const response = await get("reviewer", path).expect(403);
        privateNoStore(response);
        expect(response.body).toEqual(deniedBody);
        responses.push(response.body);
      }
      expect(responses[0]).toEqual(responses[1]);
      expect(responses[0]).toEqual(responses[2]);
    }
    const foreignOrder = await db.inspectionOrder.findUniqueOrThrow({ where: { id: foreign.id } });
    const foreignUser = await db.user.findUniqueOrThrow({ where: { id: suite.id("foreign") } });
    const retainedOrder = await db.inspectionOrder.findUniqueOrThrow({ where: { id: retained.id } });
    const retainedUser = await db.user.findUniqueOrThrow({ where: { id: suite.id("other") } });
    const missing = suite.id("missing-order");
    async function denied(who: Person, id: string) {
      for (const suffix of ["", "/identity-records"]) {
        expect((await get(who, `orders/${id}${suffix}`).expect(403)).body).toEqual(deniedBody);
        expect((await get(who, `orders/${missing}${suffix}`).expect(403)).body).toEqual(deniedBody);
      }
    }
    async function foreignUnchanged() {
      expect(await records(foreign.id)).toEqual(foreign.raw);
      expect((await get("reviewer", `orders/${foreign.id}/identity-records`).expect(200)).body).toEqual(foreign.history);
      await get("foreign", `orders/${foreign.id}`).expect(200);
      expect(await db.inspectionOrder.findUniqueOrThrow({ where: { id: foreign.id } })).toEqual(foreignOrder);
      expect(await db.user.findUniqueOrThrow({ where: { id: suite.id("foreign") } })).toEqual(foreignUser);
      expect(await db.user.findUniqueOrThrow({ where: { id: suite.id("other") } })).toEqual(retainedUser);
      expect(await db.inspectionOrder.findUniqueOrThrow({ where: { id: retained.id } })).toEqual(retainedOrder);
    }

    await deleteAndPurge("buyer", erased.id);
    // No authorized HTTP interface exposes erased pin/linkage; inspect only its clearing here.
    expect(await db.diagnosticReportRecord.findUniqueOrThrow({ where: { id: erasedReport.id },
      select: { identityRecordId: true, identityRecordHash: true, erasedAt: true, state: true } }))
      .toMatchObject({ identityRecordId: null, identityRecordHash: null, erasedAt: new Date("2026-11-17T00:00:00.000Z"),
        state: { authorId: null, reviewerId: null, returnReason: null, correctionReason: null } });
    await deniedComparison(retained.id, erasedReport.id);
    await deniedComparison(erased.id, retainedReport.id);
    for (const who of people) expect((await get(who, `reports/${erasedReport.id}`).expect(403)).body).toEqual(deniedBody);
    expect((await get("reviewer", comparisonPath(foreign.id, retainedReport.id)).expect(200)).body).toEqual(survivingPair);
    expect((await get("reviewer", `reports/${retainedReport.id}`).expect(200)).body).toEqual(retainedReport.staff);
    expect((await get("other", `reports/${retainedReport.id}`).expect(200)).body).toEqual(retainedReport.customer);
    expect(await records(erased.id)).toEqual(erased.raw.map(row => ({ ...row,
      observation: null, observationHash: null, recordedById: null, erasedAt: new Date("2026-11-17T00:00:00.000Z") })));
    expect(await db.inspectionOrder.findUniqueOrThrow({ where: { id: erased.id } })).toMatchObject({
      commissionerId: null, observedVehicle: null, physicalAuthorization: null, publicationAuthorization: null,
      listingId: null, listingIdentityDigest: null, associationValidatedAt: null, erasedAt: new Date("2026-11-17T00:00:00.000Z"),
    });
    expect(await db.diagnosticOrderAssignment.count({ where: { orderId: erased.id } })).toBe(0);
    for (const who of people) await denied(who, erased.id);
    expect(await records(retained.id)).toEqual(retained.raw);
    expect((await get("reviewer", `orders/${retained.id}/identity-records`).expect(200)).body).toEqual(retained.history);
    await foreignUnchanged();

    await deleteAndPurge("technician", retained.id);
    const survivingComparison = await get("reviewer", comparisonPath(foreign.id, retainedReport.id)).expect(200);
    privateNoStore(survivingComparison);
    expect(survivingComparison.body).toEqual({ ...survivingPair, predecessor: { ...survivingPair.predecessor, reportVersion: 4 } });
    const staffAfter = (await get("reviewer", `reports/${retainedReport.id}`).expect(200)).body;
    const customerAfter = (await get("other", `reports/${retainedReport.id}`).expect(200)).body;
    expect(staffAfter).toEqual({ ...retainedReport.staff, authorId: null, version: 4 });
    expect(customerAfter).toEqual({ ...retainedReport.customer, version: 4 });
    noIdentityMaterial(staffAfter);
    noIdentityMaterial(customerAfter);
    expect((await get("technician", `reports/${retainedReport.id}`).expect(403)).body).toEqual(deniedBody);
    const deletedComparison = await get("technician", comparisonPath(foreign.id, retainedReport.id)).expect(403);
    privateNoStore(deletedComparison);
    expect(deletedComparison.body).toEqual(deniedBody);
    await deniedComparison(retained.id, erasedReport.id);
    await deniedComparison(erased.id, retainedReport.id);
    // Full-row equality proves content, hashes, versions, times and erasure state survive exactly.
    expect(await records(retained.id)).toEqual(retained.raw.map(row => ({ ...row, recordedById: null })));
    expect((await get("reviewer", `orders/${retained.id}/identity-records`).expect(200)).body)
      .toEqual(retained.history.map((row: object) => ({ ...row, recordedBy: null })));
    await get("other", `orders/${retained.id}`).expect(200);
    await denied("technician", retained.id);
    await denied("technician", foreign.id);
    expect(await db.diagnosticOrderAssignment.count({ where: { userId: suite.id("technician") } })).toBe(0);
    expect(await db.diagnosticCenterAssignment.count({ where: { userId: suite.id("technician") } })).toBe(0);
    expect(await db.staffGrant.count({ where: { userId: suite.id("technician"), revokedAt: null } })).toBe(0);
    await foreignUnchanged();
  });
});
