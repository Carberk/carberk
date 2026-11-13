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
import { VehicleHistoryModule } from "../vehicle-history.module";
import { bullTestRoot } from "../../../../test/helpers/bullTestRoot";

describe("Vehicle History desk HTTP authorization", () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;
  let config: ConfigService;
  let request: ReturnType<typeof supertest>;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [bullTestRoot(), VehicleHistoryModule, JwtModule.register({ global: true, secret: "synthetic-history-test-secret" })],
    }).compile();
    app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    app.useGlobalGuards(new JwtAuthGuard(app.get(Reflector), app.get(JwtService)));
    app.useGlobalFilters(new GlobalErrorFilter());
    await app.listen(0, "127.0.0.1");
    request = supertest(app.getHttpServer());
    prisma = app.get(PrismaService);
    config = app.get(ConfigService);
  });

  afterAll(async () => { await app?.close(); });

  async function fixture(role: "admin" | "dealer" | "buyer" = "admin", granted = true) {
    const user = await prisma.user.create({ data: {
      role: role === "dealer" ? "seller" : role,
      ...(role === "dealer" ? { dealershipMemberships: { create: { role: "owner" as const, dealership: { create: { name: "Synthetic Dealer", slug: randomUUID() } } } } } : {}),
      email: `synthetic-${randomUUID()}@example.invalid`, emailVerifiedAt: new Date(),
      displayName: "Synthetic History Operator", nameNumber: 1175,
      ...(granted ? { staffGrants: { create: { purpose: "vehicle_history" as const } } } : {}),
    } });
    const session = await prisma.session.create({ data: {
      userId: user.id, refreshTokenHash: randomUUID(),
      expiresAt: new Date(Date.now() + 60_000), adminTotpExpiresAt: new Date(Date.now() + 60_000),
    } });
    config.set("APP_ENV", "test");
    config.set("VEHICLE_HISTORY_SYNTHETIC_ENABLED", true);
    config.set("VEHICLE_HISTORY_SYNTHETIC_USER_IDS", user.id);
    const token = app.get(JwtService).sign({ sub: user.id, sid: session.id, role });
    const get = (bearer = token, locale = "en") => request
      .get("/api/v1/vehicle-history/desk").set("Authorization", `Bearer ${bearer}`).set("Accept-Language", locale);
    return { user, session, token, get };
  }

  it.each(["admin", "dealer", "buyer"] as const)("gives an elevated marketplace %s no automatic purpose access", async (role) => {
    const actor = await fixture(role, false);
    const response = await actor.get().expect(403);
    expect(response.body.code).toBe("HISTORY_ACCESS_DENIED");
    expect(response.body.actor).toBeUndefined();
  });

  it("opens only the empty synthetic destination for a specifically granted current actor", async () => {
    const actor = await fixture();
    const response = await actor.get().expect(200);
    expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(response.body).toEqual({
      purpose: "vehicle-history", mode: "synthetic", requests: [],
      actor: { id: actor.user.id, displayName: "Synthetic History Operator", nameNumber: 1175 },
    });
  });

  it("refuses the same still-valid token immediately after its purpose grant is revoked", async () => {
    const actor = await fixture();
    await actor.get().expect(200);
    await prisma.staffGrant.update({ where: { userId_purpose: { userId: actor.user.id, purpose: "vehicle_history" } }, data: { revokedAt: new Date() } });
    const response = await actor.get().expect(403);
    expect(response.body.code).toBe("HISTORY_ACCESS_DENIED");
    expect(response.body.actor).toBeUndefined();
  });

  it.each(["suspendedAt", "deletionScheduledAt"] as const)("refuses a current grant and stale bearer after %s changes", async (field) => {
    const actor = await fixture();
    await actor.get().expect(200);
    await prisma.user.update({ where: { id: actor.user.id }, data: { [field]: new Date() } });
    expect((await actor.get().expect(403)).body.code).toBe("HISTORY_ACCESS_DENIED");
  });

  it("refuses a purged actor even if an old grant and session survive", async () => {
    const actor = await fixture();
    await prisma.user.update({ where: { id: actor.user.id }, data: { email: null, emailVerifiedAt: null } });
    await actor.get().expect(403);
  });

  it("refuses a revoked session while its signed access token remains valid", async () => {
    const actor = await fixture();
    await actor.get().expect(200);
    await prisma.session.delete({ where: { id: actor.session.id } });
    await actor.get().expect(403);
  });

  it.each(["expiresAt", "adminTotpExpiresAt"] as const)("refuses current grants after %s expires", async (field) => {
    const actor = await fixture();
    await prisma.session.update({ where: { id: actor.session.id }, data: { [field]: new Date(Date.now() - 1) } });
    await actor.get().expect(403);
  });

  it("does not treat an ordinary current session as TOTP elevation", async () => {
    const actor = await fixture();
    await prisma.session.update({ where: { id: actor.session.id }, data: { adminTotpExpiresAt: null } });
    await actor.get().expect(403);
  });

  it("does not activate a future-dated purpose grant", async () => {
    const actor = await fixture();
    await prisma.staffGrant.update({ where: { userId_purpose: { userId: actor.user.id, purpose: "vehicle_history" } }, data: { grantedAt: new Date(Date.now() + 60_000) } });
    await actor.get().expect(403);
  });

  it("cannot borrow another actor's elevated session or a token's claimed purpose", async () => {
    const actor = await fixture();
    const other = await fixture();
    config.set("VEHICLE_HISTORY_SYNTHETIC_USER_IDS", actor.user.id);
    const forgedClaims = app.get(JwtService).sign({ sub: actor.user.id, sid: other.session.id, role: "admin", purpose: "vehicle-history" });
    await actor.get(forgedClaims).expect(403);
    const noSession = app.get(JwtService).sign({ sub: actor.user.id, role: "admin", purpose: "vehicle-history" });
    await actor.get(noSession).expect(403);
  });

  it.each(["disabled", "not-a-tester", "staging", "production"])("keeps incomplete/live entry closed: %s", async (state) => {
    const actor = await fixture();
    if (state === "disabled") config.set("VEHICLE_HISTORY_SYNTHETIC_ENABLED", false);
    else if (state === "not-a-tester") config.set("VEHICLE_HISTORY_SYNTHETIC_USER_IDS", "");
    else config.set("APP_ENV", state);
    await actor.get().expect(403);
  });

  it.each([
    ["tk", "Awtoulag taryhy üçin häzirki işgär rugsady we tassyklanan sessiýa gerek. Gaýtadan giriň ýa-da esaslandyryja ýüz tutuň."],
    ["ru", "Нужны действующий доступ к истории автомобиля и подтверждённая сессия. Войдите снова или обратитесь к основателю."],
    ["en", "Current Vehicle History staff access and a verified session are required. Sign in again or contact the founder."],
  ])("returns an actionable %s refusal without actor details", async (locale, message) => {
    const actor = await fixture("admin", false);
    const response = await actor.get(actor.token, locale).expect(403);
    expect(response.body.message).toBe(message);
    expect(response.body.actor).toBeUndefined();
  });

  it("requires a signed bearer token", async () => {
    await request.get("/api/v1/vehicle-history/desk").expect(401);
    await request.get("/api/v1/vehicle-history/desk").set("Authorization", "Bearer invalid").expect(401);
  });
});
