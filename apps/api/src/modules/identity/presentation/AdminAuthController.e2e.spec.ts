import "reflect-metadata";

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { Test, type TestingModule } from "@nestjs/testing";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { JwtModule, JwtService } from "@nestjs/jwt";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { VehicleHistoryModule } from "../../vehicle-history/vehicle-history.module";
import { AdminModule } from "../../admin/admin.module";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { Reflector } from "@nestjs/core";
import supertest from "supertest";
import { generateSync } from "otplib";
import { PrismaService } from "@auto-tm/db";

import { JwtAuthGuard } from "../../../common/jwt-auth.guard";
import { GlobalErrorFilter } from "../../../common/error.filter";
import { IdentityModule } from "../identity.module";
import { bullTestRoot } from "../../../../test/helpers/bullTestRoot";

const ADMIN_PHONE = "+99365000001";

describe("AdminAuthController e2e — admin TOTP", () => {
  let app: NestFastifyApplication;
  let request: ReturnType<typeof supertest>;
  let prisma: PrismaService;
  let previousOtpTestMode: string | undefined;

  beforeAll(async () => {
    previousOtpTestMode = process.env["OTP_TEST_MODE"];
    process.env["OTP_TEST_MODE"] = "true";

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        bullTestRoot(),
        IdentityModule,
        VehicleHistoryModule,
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        EventEmitterModule.forRoot(),
        AdminModule,

        JwtModule.register({
          global: true,
          secret: process.env["JWT_ACCESS_SECRET"] ?? "dev-secret-change-me",
          signOptions: { expiresIn: "1h" },
        }),
      ],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    const reflector = app.get(Reflector);
    const jwtService = app.get(JwtService);
    app.useGlobalGuards(new JwtAuthGuard(reflector, jwtService));
    app.useGlobalFilters(new GlobalErrorFilter());
    await app.listen(0, "127.0.0.1");
    request = supertest(app.getHttpServer());
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    if (previousOtpTestMode === undefined) {
      delete process.env["OTP_TEST_MODE"];
    } else {
      process.env["OTP_TEST_MODE"] = previousOtpTestMode;
    }
    await app.close();
  });

  beforeEach(async () => {
    await prisma.totpBackupCode.deleteMany();
    await prisma.totpEnrollment.deleteMany();
    await prisma.session.deleteMany();
    await prisma.otpRequest.deleteMany();
    await prisma.user.deleteMany();
  });

  async function loginAdmin(role: "admin" | "buyer" | "moderator" = "admin"): Promise<{ accessToken: string; refreshToken: string; userId: string }> {
    await prisma.user.upsert({
      where: { phone: ADMIN_PHONE },
      update: { role },
      create: { phone: ADMIN_PHONE, phoneVerifiedAt: new Date(), role },
    });

    // This suite tests TOTP enrollment across sessions. Give each helper call
    // a fresh sign-in budget so the identity backoff does not become the
    // subject of these tests.
    await prisma.otpRequest.deleteMany({
      where: { channel: "phone", destination: ADMIN_PHONE },
    });

    const otpRes = await request
      .post("/api/v1/auth/otp/request")
      .send({ phone: ADMIN_PHONE })
      .expect(201);

    const verifyRes = await request
      .post("/api/v1/auth/otp/verify")
      .send({ phone: ADMIN_PHONE, code: otpRes.body.testCode })
      .expect(201);

    expect(verifyRes.body.user.role).toBe(role);

    return {
      accessToken: verifyRes.body.accessToken as string,
      refreshToken: verifyRes.body.refreshToken as string,
      userId: verifyRes.body.user.id as string,
    };
  }

  function currentTotpCode(secret: string): string {
    return generateSync({ secret, strategy: "totp", period: 30 });
  }

  it("keeps a pending enrollment usable when enroll is called again before first verify", async () => {
    const { accessToken, userId } = await loginAdmin();

    const firstEnroll = await request
      .post("/api/v1/auth/admin/totp/enroll")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(201);
    const firstSecret = firstEnroll.body.secret as string;

    const secondEnroll = await request
      .post("/api/v1/auth/admin/totp/enroll")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(201);

    expect(secondEnroll.body.secret).toBe(firstSecret);
    expect(secondEnroll.body.qrCodeUrl).toBe(firstEnroll.body.qrCodeUrl);

    const verify = await request
      .post("/api/v1/auth/admin/totp/verify")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ code: currentTotpCode(firstSecret) })
      .expect(201);

    expect(verify.body.adminTotpExpiresAt).toBeDefined();
    expect(verify.body.backupCodes).toHaveLength(10);

    const storedEnrollment = await prisma.totpEnrollment.findUnique({
      where: { userId },
    });
    expect(storedEnrollment?.verifiedAt).toBeInstanceOf(Date);
  });

  it("accepts the same enrolled authenticator secret in a later admin session", async () => {
    const firstLogin = await loginAdmin();

    const enroll = await request
      .post("/api/v1/auth/admin/totp/enroll")
      .set("Authorization", `Bearer ${firstLogin.accessToken}`)
      .expect(201);
    const enrolledSecret = enroll.body.secret as string;

    await request
      .post("/api/v1/auth/admin/totp/verify")
      .set("Authorization", `Bearer ${firstLogin.accessToken}`)
      .send({ code: currentTotpCode(enrolledSecret) })
      .expect(201);

    const secondLogin = await loginAdmin();

    const statusBeforeTotp = await request
      .get("/api/v1/auth/admin/totp/status")
      .set("Authorization", `Bearer ${secondLogin.accessToken}`)
      .expect(200);
    expect(statusBeforeTotp.body.enrolled).toBe(true);
    expect(statusBeforeTotp.body.elevated).toBe(false);

    await request
      .post("/api/v1/auth/admin/totp/enroll")
      .set("Authorization", `Bearer ${secondLogin.accessToken}`)
      .expect(409);

    const verify = await request
      .post("/api/v1/auth/admin/totp/verify")
      .set("Authorization", `Bearer ${secondLogin.accessToken}`)
      .send({ code: currentTotpCode(enrolledSecret) })
      .expect(201);

    expect(verify.body.adminTotpExpiresAt).toBeDefined();
    expect(verify.body.backupCodes).toBeUndefined();

    const statusAfterTotp = await request
      .get("/api/v1/auth/admin/totp/status")
      .set("Authorization", `Bearer ${secondLogin.accessToken}`)
      .expect(200);
    expect(statusAfterTotp.body.enrolled).toBe(true);
    expect(statusAfterTotp.body.elevated).toBe(true);
  });

  it("returns the same pending secret from a different admin session before first verify", async () => {
    const firstLogin = await loginAdmin();

    const enroll = await request
      .post("/api/v1/auth/admin/totp/enroll")
      .set("Authorization", `Bearer ${firstLogin.accessToken}`)
      .expect(201);
    const pendingSecret = enroll.body.secret as string;

    const secondLogin = await loginAdmin();

    const reEnroll = await request
      .post("/api/v1/auth/admin/totp/enroll")
      .set("Authorization", `Bearer ${secondLogin.accessToken}`)
      .expect(201);

    expect(reEnroll.body.secret).toBe(pendingSecret);
    expect(reEnroll.body.qrCodeUrl).toBe(enroll.body.qrCodeUrl);

    await request
      .post("/api/v1/auth/admin/totp/verify")
      .set("Authorization", `Bearer ${secondLogin.accessToken}`)
      .send({ code: currentTotpCode(pendingSecret) })
      .expect(201);
  });

  it("handles concurrent pending enroll calls without 500 and keeps the same secret", async () => {
    const { accessToken, userId } = await loginAdmin();

    const [first, second] = await Promise.all([
      request
        .post("/api/v1/auth/admin/totp/enroll")
        .set("Authorization", `Bearer ${accessToken}`),
      request
        .post("/api/v1/auth/admin/totp/enroll")
        .set("Authorization", `Bearer ${accessToken}`),
    ]);

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);

    const rows = await prisma.totpEnrollment.findMany({ where: { userId } });
    expect(rows).toHaveLength(1);

    const firstSecret = first.body.secret as string;
    const secondSecret = second.body.secret as string;
    expect(firstSecret).toBe(secondSecret);
    expect(firstSecret.length).toBeGreaterThan(0);
  });
  it("lets explicitly granted ordinary History staff enroll and enter only their scoped desk", async () => {
    const actor = await loginAdmin("buyer");
    await prisma.staffGrant.create({ data: { userId: actor.userId, purpose: "vehicle_history" } });
    const config = app.get(ConfigService);
    config.set("APP_ENV", "test");
    config.set("VEHICLE_HISTORY_SYNTHETIC_ENABLED", true);
    config.set("VEHICLE_HISTORY_SYNTHETIC_USER_IDS", actor.userId);
    const auth = { Authorization: `Bearer ${actor.accessToken}` };
    const base = "/api/v1/auth/admin/totp";
    const status = await request.get(`${base}/status?purpose=vehicle-history`).set(auth).expect(200);
    expect(status.body).toEqual({ enrolled: false, elevated: false });
    await request.get(`${base}/status`).set(auth).expect(403);
    await request.get("/api/v1/vehicle-history/desk").set(auth).expect(403);
    const enroll = await request.post(`${base}/enroll?purpose=vehicle-history`).set(auth).expect(201);
    const verified = await request.post(`${base}/verify?purpose=vehicle-history`).set(auth)
      .send({ code: currentTotpCode(enroll.body.secret) }).expect(201);
    expect(verified.body.backupCodes).toHaveLength(10);
    expect(Date.parse(verified.body.adminTotpExpiresAt) - Date.now()).toBeGreaterThan(43_190_000);
    const desk = await request.get("/api/v1/vehicle-history/desk").set(auth).expect(200);
    expect(desk.body.actor.id).toBe(actor.userId);
    expect(desk.body.requests).toEqual([]);
    await request.get("/api/v1/admin/audit").set(auth).expect(403);
  });

  it.each(["no-grant", "revoked-grant", "future-grant", "suspended", "deleting", "purged", "revoked-session", "expired-session", "wrong-owner", "no-session"])("refuses scoped TOTP with still-valid bearer claims after %s", async (state) => {
    const actor = await loginAdmin("buyer");
    await prisma.staffGrant.create({ data: { userId: actor.userId, purpose: "vehicle_history" } });
    const claims = app.get(JwtService).decode(actor.accessToken) as { sub: string; sid: string };
    let token = actor.accessToken;
    if (state === "no-grant") await prisma.staffGrant.delete({ where: { userId_purpose: { userId: actor.userId, purpose: "vehicle_history" } } });
    if (state === "revoked-grant") await prisma.staffGrant.update({ where: { userId_purpose: { userId: actor.userId, purpose: "vehicle_history" } }, data: { revokedAt: new Date() } });
    if (state === "future-grant") await prisma.staffGrant.update({ where: { userId_purpose: { userId: actor.userId, purpose: "vehicle_history" } }, data: { grantedAt: new Date(Date.now() + 60_000) } });
    if (state === "suspended") await prisma.user.update({ where: { id: actor.userId }, data: { suspendedAt: new Date() } });
    if (state === "deleting") await prisma.user.update({ where: { id: actor.userId }, data: { deletionScheduledAt: new Date() } });
    if (state === "purged") await prisma.user.update({ where: { id: actor.userId }, data: { phone: null, phoneVerifiedAt: null } });
    if (state === "revoked-session") await prisma.session.delete({ where: { id: claims.sid } });
    if (state === "expired-session") await prisma.session.update({ where: { id: claims.sid }, data: { expiresAt: new Date(Date.now() - 1) } });
    if (state === "wrong-owner") {
      const other = await prisma.user.create({ data: { email: "other@example.invalid", emailVerifiedAt: new Date() } });
      token = app.get(JwtService).sign({ sub: other.id, sid: claims.sid, role: "admin", purpose: "vehicle-history" });
    }
    if (state === "no-session") token = app.get(JwtService).sign({ sub: actor.userId, role: "admin", purpose: "vehicle-history" });
    for (const action of ["status", "enroll", "verify"]) {
      const url = `/api/v1/auth/admin/totp/${action}?purpose=vehicle-history`;
      const call = action === "status" ? request.get(url) : request.post(url).send({ code: "123456" });
      const denied = await call.set("Authorization", `Bearer ${token}`).expect(403);
      expect(denied.body.secret).toBeUndefined();
      expect(denied.body.backupCodes).toBeUndefined();
    }
  });

  it.each(["admin", "moderator"] as const)("does not inherit History access from a marketplace %s role", async (role) => {
    const actor = await loginAdmin(role);
    await request.get("/api/v1/auth/admin/totp/status?purpose=vehicle-history")
      .set("Authorization", `Bearer ${actor.accessToken}`).expect(403);
    const refreshed = await request.post("/api/v1/auth/refresh").send({ refreshToken: actor.refreshToken }).expect(201);
    await request.get("/api/v1/me").set("Authorization", `Bearer ${refreshed.body.accessToken}`).expect(200);
    await request.get("/api/v1/auth/admin/totp/status").set("Authorization", `Bearer ${refreshed.body.accessToken}`).expect(role === "admin" ? 200 : 403);
  });

  it("rechecks a marketplace admin's current role instead of inheriting its old claim", async () => {
    const actor = await loginAdmin();
    await prisma.user.update({ where: { id: actor.userId }, data: { role: "buyer" } });
    await request.get("/api/v1/auth/admin/totp/status").set("Authorization", `Bearer ${actor.accessToken}`).expect(403);
  });

  it("retains backup-code single use, throttle, renewal and expired-elevation recovery for History staff", async () => {
    const actor = await loginAdmin("buyer");
    await prisma.staffGrant.create({ data: { userId: actor.userId, purpose: "vehicle_history" } });
    const base = "/api/v1/auth/admin/totp";
    const auth = { Authorization: `Bearer ${actor.accessToken}` };
    const enroll = await request.post(`${base}/enroll?purpose=vehicle-history`).set(auth).expect(201);
    const verified = await request.post(`${base}/verify?purpose=vehicle-history`).set(auth)
      .send({ code: currentTotpCode(enroll.body.secret) }).expect(201);
    const refreshed = await request.post("/api/v1/auth/refresh").send({ refreshToken: actor.refreshToken }).expect(201);
    const current = { Authorization: `Bearer ${refreshed.body.accessToken}` };
    const status = await request.get(`${base}/status?purpose=vehicle-history`).set(current).expect(200);
    expect(status.body.adminTotpExpiresAt).toBe(verified.body.adminTotpExpiresAt);
    const claims = app.get(JwtService).decode(refreshed.body.accessToken) as { sid: string };
    await prisma.session.update({ where: { id: claims.sid }, data: { adminTotpExpiresAt: new Date(Date.now() - 1) } });
    expect((await request.get(`${base}/status?purpose=vehicle-history`).set(current).expect(200)).body.elevated).toBe(false);
    await request.post(`${base}/verify?purpose=vehicle-history`).set(current).send({ code: verified.body.backupCodes[0] }).expect(201);
    await request.post(`${base}/verify?purpose=vehicle-history`).set(current).send({ code: verified.body.backupCodes[0] }).expect(400);
    for (let attempt = 0; attempt < 5; attempt++) {
      await request.post(`${base}/verify?purpose=vehicle-history`).set(current).send({ code: "invalid-backup" }).expect(400);
    }
    const limited = await request.post(`${base}/verify?purpose=vehicle-history`).set(current)
      .send({ code: currentTotpCode(enroll.body.secret) }).expect(400);
    expect(limited.body.code).toBe("RATE_LIMITED");
  });

});
