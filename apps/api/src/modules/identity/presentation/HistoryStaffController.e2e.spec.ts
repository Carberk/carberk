import "reflect-metadata";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Test } from "@nestjs/testing";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Reflector } from "@nestjs/core";
import { JwtModule, JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "@auto-tm/db";
import supertest from "supertest";

import { JwtAuthGuard } from "../../../common/jwt-auth.guard";
import { GlobalErrorFilter } from "../../../common/error.filter";
import { VehicleHistoryModule } from "../../vehicle-history/vehicle-history.module";
import { bullTestRoot } from "../../../../test/helpers/bullTestRoot";
import { STAFF_ACCESS_PORT, type StaffAccessPort } from "../domain/ports/StaffAccessPort";

describe("named History staff authority over HTTP", () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;
  let config: ConfigService;
  let request: ReturnType<typeof supertest>;
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [bullTestRoot(), VehicleHistoryModule,
      JwtModule.register({ global: true, secret: "synthetic-staff-test-secret" })] }).compile();
    app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    app.useGlobalGuards(new JwtAuthGuard(app.get(Reflector), app.get(JwtService)));
    app.useGlobalFilters(new GlobalErrorFilter());
    await app.listen(0, "127.0.0.1");
    request = supertest(app.getHttpServer());
    prisma = app.get(PrismaService);
    config = app.get(ConfigService);
    config.set("APP_ENV", "test");
    config.set("VEHICLE_HISTORY_SYNTHETIC_ENABLED", true);
  });
  afterAll(async () => { await app?.close(); });
  async function actor() {
    const user = await prisma.user.create({ data: { role: "admin", email: `${randomUUID()}@example.invalid`, emailVerifiedAt: new Date(), displayName: "Synthetic founder" } });
    const session = await prisma.session.create({ data: { userId: user.id, refreshTokenHash: randomUUID(),
      expiresAt: new Date(Date.now() + 600_000), adminTotpExpiresAt: new Date(Date.now() + 600_000) } });
    config.set("VEHICLE_HISTORY_SYNTHETIC_USER_IDS", user.id);
    const token = app.get(JwtService).sign({ sub: user.id, sid: session.id, role: "admin" });
    return { user, session, token };
  }
  it("gives an elevated marketplace admin no founder management authority", async () => {
    const founder = await actor();
    expect((await request.get("/api/v1/identity/history-staff").auth(founder.token, { type: "bearer" }).expect(403)).body.code).toBe("HISTORY_ACCESS_DENIED");
  });
  it("shows only an exact named target and its separate capabilities to an explicit founder", async () => {
    const founder = await actor();
    await prisma.staffGrant.create({ data: { userId: founder.user.id, purpose: "vehicle_history_staff_management" } });
    const target = await actor();
    config.set("VEHICLE_HISTORY_SYNTHETIC_USER_IDS", founder.user.id);
    const response = await request.get(`/api/v1/identity/history-staff?targetId=${target.user.id}`).auth(founder.token, { type: "bearer" }).expect(200);
    expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(response.body).toEqual({ actor: { id: founder.user.id, displayName: "Synthetic founder", nameNumber: founder.user.nameNumber },
      target: { id: target.user.id, displayName: "Synthetic founder", nameNumber: target.user.nameNumber, eligible: true,
        capabilities: { "vehicle-history": false, "vehicle-history-payment-evidence": false } } });
  });
  it("grants and revokes through HTTP, audits reasons, and denies the same old desk token immediately", async () => {
    const founder = await actor();
    await prisma.staffGrant.create({ data: { userId: founder.user.id, purpose: "vehicle_history_staff_management" } });
    const target = await actor();
    config.set("VEHICLE_HISTORY_SYNTHETIC_USER_IDS", `${founder.user.id},${target.user.id}`);
    const change = (active: boolean) => request.post("/api/v1/identity/history-staff").auth(founder.token, { type: "bearer" })
      .send({ targetId: target.user.id, capability: "vehicle-history", active, reason: active ? "Assign synthetic desk duty" : "End synthetic desk duty" });
    expect((await change(true).expect(201)).body.target.capabilities["vehicle-history"]).toBe(true);
    await request.get("/api/v1/vehicle-history/desk").auth(target.token, { type: "bearer" }).expect(200);
    expect((await change(false).expect(201)).body.target.capabilities["vehicle-history"]).toBe(false);
    await request.get("/api/v1/vehicle-history/desk").auth(target.token, { type: "bearer" }).expect(403);
    const audit = await prisma.auditLog.findMany({ where: { actorId: founder.user.id, targetId: target.user.id }, orderBy: { createdAt: "asc" } });
    expect(audit.map((row) => ({ action: row.action, targetType: row.targetType, details: row.details }))).toEqual([
      { action: "HISTORY_STAFF_GRANT", targetType: "User", details: { capability: "vehicle-history", reason: "Assign synthetic desk duty" } },
      { action: "HISTORY_STAFF_REVOKE", targetType: "User", details: { capability: "vehicle-history", reason: "End synthetic desk duty" } },
    ]);
  });
  async function managementFixture() {
    const founder = await actor();
    await prisma.staffGrant.create({ data: { userId: founder.user.id, purpose: "vehicle_history_staff_management" } });
    const target = await actor();
    config.set("VEHICLE_HISTORY_SYNTHETIC_USER_IDS", `${founder.user.id},${target.user.id}`);
    const change = (overrides = {}) => request.post("/api/v1/identity/history-staff").auth(founder.token, { type: "bearer" })
      .send({ targetId: target.user.id, capability: "vehicle-history-payment-evidence", active: true, reason: "Synthetic investigation", ...overrides });
    const inspect = (id = target.user.id) => request.get(`/api/v1/identity/history-staff?targetId=${id}`).auth(founder.token, { type: "bearer" });
    return { founder, target, change, inspect };
  }
  it("keeps evidence access distinct from operator, management and refund authority", async () => {
    const { target, change } = await managementFixture();
    const response = await change().expect(201);
    expect(response.body.target.capabilities).toEqual({ "vehicle-history": false, "vehicle-history-payment-evidence": true });
    await request.get("/api/v1/vehicle-history/desk").auth(target.token, { type: "bearer" }).expect(403);
    await request.get("/api/v1/identity/history-staff").auth(target.token, { type: "bearer" }).expect(403);
    await request.get("/api/v1/auth/admin/totp/status?purpose=vehicle-history").auth(target.token, { type: "bearer" }).expect(200);
    const access = app.get<StaffAccessPort>(STAFF_ACCESS_PORT);
    const session = { userId: target.user.id, sessionId: target.session.id };
    expect(await access.findCurrentActor({ ...session, purpose: "vehicle-history-payment-evidence" })).toEqual({
      id: target.user.id, displayName: target.user.displayName, nameNumber: target.user.nameNumber,
    });
    expect(await access.findCurrentActor({ ...session, purpose: "vehicle-history-staff-management" })).toBeNull();
    await change({ active: false }).expect(201);
    expect(await access.findCurrentActor({ ...session, purpose: "vehicle-history-payment-evidence" })).toBeNull();
  });
  it("allows management-only ordinary staff to use scoped TOTP without opening the operator desk", async () => {
    const { founder } = await managementFixture();
    await prisma.user.update({ where: { id: founder.user.id }, data: { role: "buyer" } });
    await request.get("/api/v1/auth/admin/totp/status?purpose=vehicle-history").auth(founder.token, { type: "bearer" }).expect(200);
    await request.get("/api/v1/vehicle-history/desk").auth(founder.token, { type: "bearer" }).expect(403);
  });
  it("rejects self changes, management authority changes and invalid reasons without audits", async () => {
    const { founder, change, inspect } = await managementFixture();
    expect((await change({ targetId: founder.user.id }).expect(403)).body.code).toBe("HISTORY_SELF_CHANGE_DENIED");
    for (const input of [{ capability: "vehicle-history-staff-management" }, { reason: "   " }, { reason: "x".repeat(501) }, { active: "true" }]) await change(input).expect(400);
    expect((await inspect().expect(200)).body.target.capabilities["vehicle-history-payment-evidence"]).toBe(false);
    expect(await prisma.auditLog.count({ where: { actorId: founder.user.id } })).toBe(0);
  });
  it.each(["revoked-grant", "future-grant", "suspended", "deleting", "purged", "expired-session", "expired-totp", "unelevated", "revoked-session", "wrong-owner"])("rechecks founder authority for lookup and mutation after %s", async (state) => {
    const { founder, target, change, inspect } = await managementFixture();
    if (state === "revoked-grant" || state === "future-grant") await prisma.staffGrant.update({ where: { userId_purpose: { userId: founder.user.id, purpose: "vehicle_history_staff_management" } }, data: state === "revoked-grant" ? { revokedAt: new Date() } : { grantedAt: new Date(Date.now() + 60_000) } });
    else if (state === "suspended" || state === "deleting" || state === "purged") await prisma.user.update({ where: { id: founder.user.id }, data: state === "purged" ? { email: null, emailVerifiedAt: null } : { [state === "suspended" ? "suspendedAt" : "deletionScheduledAt"]: new Date() } });
    else if (state === "revoked-session") await prisma.session.delete({ where: { id: founder.session.id } });
    else await prisma.session.update({ where: { id: founder.session.id }, data: state === "wrong-owner" ? { userId: target.user.id } : state === "unelevated" ? { adminTotpExpiresAt: null } : { [state === "expired-session" ? "expiresAt" : "adminTotpExpiresAt"]: new Date(0) } });
    await inspect().expect(403);
    await change().expect(403);
    expect(await prisma.auditLog.count({ where: { actorId: founder.user.id } })).toBe(0);
  });
  it("returns no directory, refuses inactive grants, and permits their revocation", async () => {
    const { founder, target, change, inspect } = await managementFixture();
    await change().expect(201);
    await prisma.user.update({ where: { id: target.user.id }, data: { suspendedAt: new Date() } });
    expect((await inspect().expect(200)).body.target.eligible).toBe(false);
    await change().expect(409);
    await change({ active: false }).expect(201);
    expect((await inspect(randomUUID()).expect(200)).body.target).toBeNull();
    expect((await request.get("/api/v1/identity/history-staff").auth(founder.token, { type: "bearer" }).expect(200)).body.target).toBeNull();
    await inspect("Synthetic").expect(400);
  });
  it("rolls back the capability when the audit database write fails", async () => {
    const { target, change, inspect } = await managementFixture();
    await prisma.$executeRawUnsafe(`CREATE FUNCTION vh1176_refuse_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic audit unavailable'; END $$`);
    await prisma.$executeRawUnsafe(`CREATE TRIGGER vh1176_audit_failure BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION vh1176_refuse_audit()`);
    try {
      await change().expect(500);
      expect((await inspect().expect(200)).body.target.capabilities["vehicle-history-payment-evidence"]).toBe(false);
      expect(await prisma.staffGrant.count({ where: { userId: target.user.id } })).toBe(0);
    } finally {
      await prisma.$executeRawUnsafe(`DROP TRIGGER vh1176_audit_failure ON audit_logs`);
      await prisma.$executeRawUnsafe(`DROP FUNCTION vh1176_refuse_audit()`);
    }
  });
  it.each(["disabled", "not-tester", "staging", "production"])("keeps management synthetic/default-off: %s", async (state) => {
    const { change, inspect } = await managementFixture();
    if (state === "disabled") config.set("VEHICLE_HISTORY_SYNTHETIC_ENABLED", false);
    else if (state === "not-tester") config.set("VEHICLE_HISTORY_SYNTHETIC_USER_IDS", "");
    else config.set("APP_ENV", state);
    await inspect().expect(403); await change().expect(403);
    config.set("APP_ENV", "test"); config.set("VEHICLE_HISTORY_SYNTHETIC_ENABLED", true);
  });
});
