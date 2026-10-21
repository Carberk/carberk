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
      return { id: order.id as string, history, raw };
    }
    const erased = await visit("buyer", "technician");
    const retained = await visit("other", "technician");
    const foreign = await visit("foreign", "controlTechnician");
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
