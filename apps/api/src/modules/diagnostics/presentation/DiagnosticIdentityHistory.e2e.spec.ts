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
import { cleanSuiteFixtures, defineE2eSuite } from "../../../../test/helpers/e2eSuite";
import { GlobalErrorFilter } from "../../../common/error.filter";
import { JwtAuthGuard } from "../../../common/jwt-auth.guard";
import { IDENTITY_CLOCK_PORT } from "../../identity/identity.public";
import { DiagnosticsModule } from "../diagnostics.module";
import { DIAGNOSTIC_RUNTIME } from "../domain/ports/DiagnosticIntakePort";

const suite = defineE2eSuite("diagnostic-visit-identity-history");
const people = ["buyer", "other", "reception", "technician", "reviewer", "unassigned", "admin"] as const;
type Person = typeof people[number];
const capability: Partial<Record<Person, string>> = {
  reception: "diagnostics.reception", technician: "diagnostics.technician",
  reviewer: "diagnostics.reviewer", unassigned: "diagnostics.technician",
};
const now = new Date("2026-10-18T00:00:00.000Z");
const future = new Date("2026-11-18T00:00:00.000Z");
const centerId = suite.id("center");
const localized = { tk: "Synag", ru: "Тест", en: "Synthetic" };

// Same real Nest/Prisma/current-authority composition as DiagnosticReports.e2e.spec.ts.
// Only time and synthetic admission use that suite's established deterministic overrides.
describe("restricted immutable diagnostic visit identity history", () => {
  let app: NestFastifyApplication;
  let db: PrismaService;
  let jwt: JwtService;
  let request: ReturnType<typeof supertest>;
  const headers = (who: Person) => ({ authorization: `Bearer ${jwt.sign({ sub: suite.id(who), sid: suite.id(`${who}-session`), role: who === "admin" ? "admin" : "buyer" })}` });
  const post = (who: Person, path: string, body: object) => request.post(`/api/v1/diagnostics/${path}`).set(headers(who)).send(body);
  const get = (who: Person, path: string) => request.get(`/api/v1/diagnostics/${path}`).set(headers(who));
  async function cleanup() {
    if (!db) return;
    await db.diagnosticAudit.deleteMany({ where: { centerId } });
    await db.diagnosticOrderAssignment.deleteMany({ where: { order: { centerId } } });
    await db.inspectionOrder.deleteMany({ where: { centerId } });
    await db.diagnosticTemplateVersion.deleteMany({ where: { centerId } });
    await db.diagnosticCenterAssignment.deleteMany({ where: { centerId } });
    await db.diagnosticCenter.deleteMany({ where: { id: centerId } });
    await cleanSuiteFixtures(db, suite, { userAliases: people });
  }
  beforeAll(async () => {
    const testing = await Test.createTestingModule({ imports: [
      ConfigModule.forRoot({ isGlobal: true, load: [() => ({ DIAGNOSTIC_PRIVATE_BUCKET: "diagnostic-test-private" })] }), EventEmitterModule.forRoot(), bullTestRoot(),
      DiagnosticsModule, JwtModule.register({ global: true, secret: "synthetic-diagnostic-test" }),
    ] })
      .overrideProvider(IDENTITY_CLOCK_PORT).useValue({ now: () => now })
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
      await db.user.create({ data: { id: suite.id(who), phone: suite.phone(who), role: who === "admin" ? "admin" : "buyer", phoneVerifiedAt: now } });
      await db.session.create({ data: { id: suite.id(`${who}-session`), userId: suite.id(who), refreshTokenHash: suite.id(`${who}-refresh`), expiresAt: future, adminTotpExpiresAt: future } });
      if (capability[who]) await db.staffGrant.create({ data: { userId: suite.id(who), capability: capability[who]! } });
    }
    await db.diagnosticCenter.create({ data: { id: centerId, code: suite.slugFor("center"), names: localized } });
    for (const who of ["reception", "technician", "reviewer", "unassigned"] as const) {
      await db.diagnosticCenterAssignment.create({ data: { centerId, userId: suite.id(who), capability: capability[who]!, qualifiedUntil: future } });
    }
    await db.staffGrant.create({ data: { userId: suite.id("reception"), capability: "diagnostics.templates" } });
    await db.diagnosticCenterAssignment.create({ data: { centerId, userId: suite.id("reception"), capability: "diagnostics.templates", qualifiedUntil: future } });
  });
  afterAll(async () => { try { await cleanup(); } finally { await app?.close(); } });

  it("lets current assigned staff compare retained physical identity observations without replacing the original or leaking history", async () => {
    const definition = { title: localized, limitations: localized, syntheticNotice: localized,
      checks: [{ id: "brakes", label: localized, required: true, evidenceRequired: false, measurement: null }], panels: [] };
    const { body: template } = await post("reception", `centers/${centerId}/templates`, { expectedVersion: 0, definition, synthetic: true }).expect(201);
    let { body: order } = await post("buyer", "orders", { requestKey: randomUUID(), centerId, templateVersionId: template.id, audience: "buyer_private", synthetic: true }).expect(201);
    for (const who of ["technician", "reviewer"] as const) {
      ({ body: order } = await post("reception", `orders/${order.id}/assignments`, { expectedVersion: order.version, userId: suite.id(who), capability: capability[who], active: true }).expect(201));
    }
    ({ body: order } = await post("reception", `orders/${order.id}/authorization`, { expectedVersion: order.version, kind: "physical", authorityReference: "Synthetic fixture physical access only" }).expect(201));
    for (const state of ["confirmed", "arrived"]) {
      ({ body: order } = await post("reception", `orders/${order.id}/appointment`, { expectedVersion: order.version, state }).expect(201));
    }
    const original = { observedAt: "2026-10-17T10:00:00.000Z", mileageKm: 123000, method: "manual", manualReference: "Synthetic chassis fixture A, initial reading", vin: null };
    const corrected = { observedAt: "2026-10-17T11:00:00.000Z", mileageKm: 123001, method: "manual", manualReference: "Synthetic chassis fixture A, corrected transcription with fixture photo ref A2", vin: null };
    ({ body: order } = await post("technician", `orders/${order.id}/vehicle`, { expectedVersion: order.version, ...original }).expect(201));
    expect(order.observedVehicle).toEqual(original);
    const originalVersion = order.version;
    const path = `orders/${order.id}/identity-records`;
    const technicianHeaders = headers("technician");
    // Intended first RED on the supplied base: real authorized HTTP GET expects 200, route is absent.
    const first = await request.get(`/api/v1/diagnostics/${path}`).set(technicianHeaders).expect(200);
    expect(first.headers["cache-control"]).toContain("no-store");
    expect(first.headers["cache-control"]).toContain("private");
    expect(first.body).toEqual([{ id: expect.any(String), orderId: order.id, orderVersion: originalVersion,
      observationHash: expect.stringMatching(/^[a-f0-9]{64}$/), observation: original,
      recordedBy: suite.id("technician"), recordedAt: now.toISOString() }]);
    expect(first.body[0].id).toMatch(/^[a-f0-9-]{36}$/);

    ({ body: order } = await post("technician", `orders/${order.id}/vehicle`, { expectedVersion: order.version, ...corrected }).expect(201));
    expect(order.observedVehicle).toEqual(corrected);
    const history = await get("reviewer", path).expect(200);
    expect(history.body).toEqual([first.body[0], { id: expect.any(String), orderId: order.id, orderVersion: order.version,
      observationHash: expect.stringMatching(/^[a-f0-9]{64}$/), observation: corrected,
      recordedBy: suite.id("technician"), recordedAt: now.toISOString() }]);
    expect(history.body[1].id).not.toBe(first.body[0].id);
    expect(history.body[1].observationHash).not.toBe(first.body[0].observationHash);
    // Both writes share the recording clock. Ordering must follow capture/version, not timestamp alone.
    expect((await get("technician", path).expect(200)).body).toEqual(history.body);
    expect((await get("technician", `orders/${order.id}`).expect(200)).body.observedVehicle).toEqual(corrected);
    await post("technician", `orders/${order.id}/vehicle`, { expectedVersion: originalVersion, ...original }).expect(409);
    expect((await get("reviewer", path).expect(200)).body).toEqual(history.body);

    const deniedBody = { statusCode: 403, code: "DIAGNOSTIC_NO_ACCESS", message: "Inspection request could not be completed",
      timestamp: expect.any(String), requestId: "unknown" };
    for (const who of ["unassigned", "buyer", "admin", "other"] as const) {
      const denied = await get(who, path).expect(403);
      expect(denied.body).toEqual(deniedBody);
      expect((await get(who, `orders/${suite.id("missing-order")}/identity-records`).expect(403)).body).toEqual(deniedBody);
    }
    await post("reception", `orders/${order.id}/assignments`, { expectedVersion: order.version, userId: suite.id("technician"), capability: capability.technician, active: false }).expect(201);
    // Same JWT and live Session after HTTP revocation: cached assignment cannot retain history access.
    expect((await request.get(`/api/v1/diagnostics/${path}`).set(technicianHeaders).expect(403)).body).toEqual(deniedBody);
    expect((await get("reviewer", path).expect(200)).body).toEqual(history.body);
  });
});
