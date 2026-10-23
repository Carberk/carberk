import "reflect-metadata";
import { Controller, Get, UseGuards } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { JwtModule, JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import supertest from "supertest";
import { JwtAuthGuard } from "../../../common/jwt-auth.guard";
import { StaffCapability, StaffGuard } from "../../../common/staff.guard";
import { CheckStaffAuthority } from "../application/CheckStaffAuthority";
import { ChangeStaffGrant } from "../application/ChangeStaffGrant";
import { InMemoryStaffAuthority } from "../application/testing/InMemoryStaffAuthority";
import { STAFF_AUTHORITY_PORT } from "../domain/ports/StaffAuthorityPort";
import { STAFF_AUTHORITY_REPOSITORY } from "../domain/ports/StaffAuthorityRepository";
import { IDENTITY_TOKENS } from "../identity.tokens";
import { StaffController } from "./StaffController";

@Controller("test/staff-purpose")
@UseGuards(StaffGuard)
class PurposeConsumer {
  @Get() @StaffCapability("support.operations") read() { return { allowed: true }; }
  @Get("unscoped") unscoped() { return { allowed: true }; }
}
const now = new Date("2026-10-15T00:00:00Z");
const repository = new InMemoryStaffAuthority();
describe("current staff HTTP authority with real JWT and purpose guards", () => {
 let app: NestFastifyApplication;
 let request: ReturnType<typeof supertest>;
 let token: string;
 beforeAll(async () => {
  const module = await Test.createTestingModule({
   imports: [JwtModule.register({ secret: "synthetic-staff-http-test-900" })],
   controllers: [StaffController, PurposeConsumer],
   providers: [CheckStaffAuthority, ChangeStaffGrant, StaffGuard,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: STAFF_AUTHORITY_PORT, useExisting: CheckStaffAuthority },
    { provide: STAFF_AUTHORITY_REPOSITORY, useValue: repository },
    { provide: IDENTITY_TOKENS.ClockPort, useValue: { now: () => now } }],
  }).compile();
  app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  await app.listen(0, "127.0.0.1");
  request = supertest(app.getHttpServer());
  token = module.get(JwtService).sign({ sub: "person", sid: "session", role: "admin" });
 });
 afterAll(async () => { await app?.close(); });
 beforeEach(() => {
  repository.changes.length = 0;
  repository.snapshot = { userId: "person", sessionUserId: "person", role: "buyer", suspended: false, deleting: false, expiresAt: new Date("2026-10-16T00:00:00Z"), elevatedUntil: new Date("2026-10-15T12:00:00Z"), capabilities: ["support.operations"] };
 });
 const get = (path: string) => request.get(path).set("authorization", `Bearer ${token}`);
 it("returns a scoped summary and permits that purpose despite current non-admin role", async () => {
  expect((await get("/api/v1/staff/capabilities").expect(200)).body).toEqual({ capabilities: ["support.operations"], elevated: true, adminTotpExpiresAt: "2026-10-15T12:00:00.000Z" });
  expect((await get("/test/staff-purpose").expect(200)).body).toEqual({ allowed: true });
 });
 it("observes grant/session revocation through the same stale bearer", async () => {
  await get("/test/staff-purpose").expect(200);
  repository.snapshot!.capabilities = [];
  expect((await get("/test/staff-purpose").expect(403)).body.details.reason).toBe("CAPABILITY_REQUIRED");
  repository.snapshot = null;
  expect((await get("/test/staff-purpose").expect(403)).body.details.reason).toBe("SESSION_REQUIRED");
 });
 it.each(["suspended", "deleting"] as const)("refuses current %s status", async (field) => {
  repository.snapshot![field] = true;
  expect((await get("/test/staff-purpose").expect(403)).body.details.reason).toBe("USER_INACTIVE");
 });
 it("keeps setup summary accessible after elevation expiry and refuses purpose reads", async () => {
  repository.snapshot!.elevatedUntil = now;
  expect((await get("/api/v1/staff/capabilities").expect(200)).body.elevated).toBe(false);
  expect((await get("/test/staff-purpose").expect(403)).body.details.reason).toBe("ELEVATION_REQUIRED");
 });
 it("fails closed when a guarded route has no purpose", async () => {
  expect((await get("/test/staff-purpose/unscoped").expect(403)).body.details.reason).toBe("CAPABILITY_REQUIRED");
 });
 it("refuses stale admin claims when changing staff grants, without writing a transition", async () => {
  const body = { targetUserId: "550e8400-e29b-41d4-a716-446655440000", capability: "support.operations", reason: "Coverage", grant: true };
  const response = await request.post("/api/v1/staff/grants").set("authorization", `Bearer ${token}`).send(body).expect(403);
  expect(response.body.details.reason).toBe("GRANT_FORBIDDEN");
  expect(repository.changes).toEqual([]);
 });
 it("writes only the explicitly authorized named transition", async () => {
  repository.snapshot!.capabilities = ["staff.manage"];
  const body = { targetUserId: "550e8400-e29b-41d4-a716-446655440000", capability: "support.operations", reason: "Coverage", grant: true };
  await request.post("/api/v1/staff/grants").set("authorization", `Bearer ${token}`).send(body).expect(204);
  expect(repository.changes).toEqual([{ userId: "person", sessionId: "session", ...body }]);
 });

});
