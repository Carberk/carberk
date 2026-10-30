import "reflect-metadata";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Controller, Get, UseGuards } from "@nestjs/common";
import { JwtModule, JwtService } from "@nestjs/jwt";
import { Reflector } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { PrismaService } from "@auto-tm/db";
import { generateSync } from "otplib";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import supertest from "supertest";
import { IdentityModule } from "../identity.module";
import { JwtAuthGuard } from "../../../common/jwt-auth.guard";
import { AdminGuard } from "../../../common/admin.guard";
import { StaffCapability, StaffGuard } from "../../../common/staff.guard";
import { bullTestRoot } from "../../../../test/helpers/bullTestRoot";
import { cleanSuiteFixtures, defineE2eSuite } from "../../../../test/helpers/e2eSuite";
import { PrismaAccountDeletionUnitOfWork } from "../infrastructure/PrismaAccountDeletionUnitOfWork";
import { STAFF_AUTHORITY_PORT, type StaffAuthorityPort } from "../identity.public";
const suite = defineE2eSuite("staff-authority-900");
@Controller("test/current-staff")
class StaffConsumer {
 @Get() @UseGuards(StaffGuard) @StaffCapability("support.operations") read() { return { allowed: true }; }
 @Get("admin") @UseGuards(AdminGuard) admin() { return { allowed: true }; }
}
describe("current staff authority on real HTTP and disposable PostgreSQL", () => {
 let app: NestFastifyApplication;
 let request: ReturnType<typeof supertest>;
 let prisma: PrismaService;
 let jwt: JwtService;
 const run = promisify(execFile);
 const actors = ["founder", "staff", "admin", "moderator", "ordinary"];
 const sessionId = (who: string) => suite.id(`${who}-session`);
 const token = (who: string, role = "admin") => jwt.sign({ sub: suite.id(who), sid: sessionId(who), role });
 const get = (path: string, who: string) => request.get(path).set("authorization", `Bearer ${token(who)}`);
 const change = (who: string, capability: string, grant = true, target = "staff") => request.post("/api/v1/staff/grants").set("authorization", `Bearer ${token(who)}`).send({ targetUserId: suite.id(target), capability, reason: "Named test coverage", grant });
 beforeAll(async () => {
  const module = await Test.createTestingModule({ imports: [bullTestRoot(), IdentityModule, JwtModule.register({ global: true, secret: "synthetic-hosted-staff-test-900" })], controllers: [StaffConsumer], providers: [StaffGuard, AdminGuard] }).compile();
  app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  jwt = app.get(JwtService);prisma = app.get(PrismaService);
  app.useGlobalGuards(new JwtAuthGuard(app.get(Reflector), jwt));
  await app.listen(0, "127.0.0.1");
  request = supertest(app.getHttpServer());
 });
 afterAll(async () => { await prisma.auditLog.deleteMany({ where: { targetId: { in: actors.map((who) => suite.id(who)) } } });await cleanSuiteFixtures(prisma, suite, { userAliases: actors });await app?.close(); });
 beforeEach(async () => {
  await prisma.auditLog.deleteMany({ where: { targetId: { in: actors.map((who) => suite.id(who)) } } });
  await cleanSuiteFixtures(prisma, suite, { userAliases: actors });
  for (const who of actors) {
   await prisma.user.create({ data: { id: suite.id(who), phone: suite.phone(who), phoneVerifiedAt: new Date(), role: who === "admin" ? "admin" : who === "moderator" ? "moderator" : "buyer" } });
   await prisma.session.create({ data: { id: sessionId(who), userId: suite.id(who), refreshTokenHash: suite.id(`${who}-refresh`), expiresAt: new Date(Date.now() + 86400000), adminTotpExpiresAt: who === "staff" ? null : new Date(Date.now() + 3600000) } });
  }
  await prisma.staffGrant.createMany({ data: ["staff.manage", "founder.control"].map((capability) => ({ userId: suite.id("founder"), capability })) });
 });
 it("grants scoped non-admin enrollment/elevation, preserves backup atomicity and keeps marketplace admin separate", async () => {
  await change("founder", "support.operations").expect(204);
  expect((await get("/api/v1/staff/capabilities", "staff").expect(200)).body).toMatchObject({ capabilities: ["support.operations"], elevated: false });
  await get("/test/current-staff", "staff").expect(403);
  const enrollment = await request.post("/api/v1/auth/staff/totp/enroll").set("authorization", `Bearer ${token("staff", "buyer")}`).expect(201);
  const verified = await request.post("/api/v1/auth/staff/totp/verify").set("authorization", `Bearer ${token("staff", "buyer")}`).send({ code: generateSync({ secret: enrollment.body.secret, strategy: "totp", period: 30 }) }).expect(201);
  expect(verified.body.backupCodes).toHaveLength(10);
  await get("/test/current-staff", "staff").expect(200);
  await get("/test/current-staff/admin", "staff").expect(403);
  await get("/test/current-staff/admin", "admin").expect(200);
  await get("/test/current-staff/admin", "moderator").expect(403);
  const code = verified.body.backupCodes[0];
  const attempts = await Promise.all(Array.from({ length: 2 }, () => request.post("/api/v1/auth/staff/totp/verify").set("authorization", `Bearer ${token("staff", "buyer")}`).send({ code })));
  expect(attempts.map((response) => response.status).sort()).toEqual([201, 400]);
  expect(await prisma.totpBackupCode.count({ where: { totpEnrollment: { userId: suite.id("staff") }, usedAt: { not: null } } })).toBe(1);
 });
 it("observes grant and current Session revocation through a still-valid access token", async () => {
  await change("founder", "support.operations").expect(204);
  await prisma.session.update({ where: { id: sessionId("staff") }, data: { adminTotpExpiresAt: new Date(Date.now() + 3600000) } });
  await get("/test/current-staff", "staff").expect(200);
  await change("founder", "support.operations", false).expect(204);
  expect((await get("/test/current-staff", "staff").expect(403)).body.details.reason).toBe("CAPABILITY_REQUIRED");
  await change("founder", "support.operations").expect(204);
  await prisma.session.delete({ where: { id: sessionId("staff") } });
  expect((await get("/test/current-staff", "staff").expect(403)).body.details.reason).toBe("SESSION_REQUIRED");
  const audit = await prisma.auditLog.findMany({ where: { targetId: suite.id("staff") }, orderBy: { createdAt: "asc" } });
  expect(audit.map((row) => row.action)).toEqual(["STAFF_CAPABILITY_GRANTED", "STAFF_CAPABILITY_REVOKED", "STAFF_CAPABILITY_GRANTED"]);
  expect(audit.every((row) => row.actorId === suite.id("founder"))).toBe(true);
  expect(audit[0]?.details).toMatchObject({ capability: "support.operations", reason: "Named test coverage" });
 });
 it("refuses revoked purpose access inside the owning PostgreSQL transaction", async () => {
  await change("founder", "support.operations").expect(204);
  await prisma.session.update({ where: { id: sessionId("staff") }, data: { adminTotpExpiresAt: new Date(Date.now() + 3600000) } });
  const authority = app.get<StaffAuthorityPort>(STAFF_AUTHORITY_PORT);
  const subject = { userId: suite.id("staff"), sessionId: sessionId("staff"), capability: "support.operations" };
  await prisma.$transaction(async (tx) => {
   await authority.authorize(subject, tx);
   await tx.staffGrant.update({ where: { userId_capability: { userId: subject.userId, capability: subject.capability } }, data: { revokedAt: new Date() } });
   await expect(authority.authorize(subject, tx)).rejects.toMatchObject({ reason: "CAPABILITY_REQUIRED" });
  });
  await get("/test/current-staff", "staff").expect(403);
 });
 it("rejects unsupported, self-escalating and ungranted admin transitions without an audit or grant", async () => {
  await change("admin", "support.operations").expect(403);
  await change("founder", "founder.control").expect(403);
  await change("founder", "support.operations", true, "founder").expect(403);
  await change("ordinary", "analytics.investigate").expect(403);
  await change("ordinary", "support.operations", false).expect(403);
  expect(await prisma.staffGrant.count({ where: { userId: suite.id("staff") } })).toBe(0);
  expect(await prisma.auditLog.count({ where: { targetId: suite.id("staff") } })).toBe(0);
 });
 it("revokes inactive targets and peer-founder root authority without creating an HTTP root-grant path", async () => {
  await change("founder", "support.operations").expect(204);
  await prisma.user.update({ where: { id: suite.id("staff") }, data: { suspendedAt: new Date() } });
  await change("founder", "support.operations", false).expect(204);
  expect((await prisma.staffGrant.findUnique({ where: { userId_capability: { userId: suite.id("staff"), capability: "support.operations" } } }))?.revokedAt).not.toBeNull();
  await prisma.staffGrant.create({ data: { userId: suite.id("ordinary"), capability: "founder.control" } });
  await change("founder", "founder.control", false, "ordinary").expect(204);
  expect((await prisma.staffGrant.findUnique({ where: { userId_capability: { userId: suite.id("ordinary"), capability: "founder.control" } } }))?.revokedAt).not.toBeNull();
 });
 it("refuses expired elevation and suspended/deleting Users on direct reads and TOTP setup", async () => {
  await change("founder", "support.operations").expect(204);
  await prisma.session.update({ where: { id: sessionId("staff") }, data: { adminTotpExpiresAt: new Date(0) } });
  expect((await get("/test/current-staff", "staff").expect(403)).body.details.reason).toBe("ELEVATION_REQUIRED");
  await prisma.user.update({ where: { id: suite.id("staff") }, data: { suspendedAt: new Date() } });
  expect((await get("/test/current-staff", "staff").expect(403)).body.details.reason).toBe("USER_INACTIVE");
  await prisma.user.update({ where: { id: suite.id("staff") }, data: { suspendedAt: null } });
  const deletionScheduledAt = new Date(Date.now() + 86400000);
  await new PrismaAccountDeletionUnitOfWork(prisma).run({ userId: suite.id("staff"), deletionScheduledAt }, async (writes) => {
    await writes.scheduleDeletion(suite.id("staff"), deletionScheduledAt);
    await writes.archiveActiveListings(suite.id("staff"));
  });
  expect((await get("/test/current-staff", "staff").expect(403)).body.details.reason).toBe("USER_INACTIVE");
  await request.post("/api/v1/auth/admin/totp/enroll").set("authorization", `Bearer ${token("staff")}`).expect(403);
  expect((await prisma.staffGrant.findUnique({ where: { userId_capability: { userId: suite.id("staff"), capability: "support.operations" } } }))?.revokedAt).not.toBeNull();
  await prisma.user.update({ where: { id: suite.id("staff") }, data: { deletionScheduledAt: null } });
  expect((await get("/test/current-staff", "staff").expect(403)).body.details.reason).toBe("CAPABILITY_REQUIRED");
 });
 it("rolls back a grant if durable audit persistence refuses the transition", async () => {
  await prisma.$executeRaw`CREATE FUNCTION staff_900_refuse_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic audit refusal'; END $$`;
  await prisma.$executeRaw`CREATE TRIGGER staff_900_refuse_audit BEFORE INSERT ON "audit_logs" FOR EACH ROW EXECUTE FUNCTION staff_900_refuse_audit()`;
  try {
   await change("founder", "support.operations").expect(500);
   expect(await prisma.staffGrant.count({ where: { userId: suite.id("staff") } })).toBe(0);
   expect(await prisma.auditLog.count({ where: { targetId: suite.id("staff") } })).toBe(0);
  } finally {
   await prisma.$executeRaw`DROP TRIGGER staff_900_refuse_audit ON "audit_logs"`;
   await prisma.$executeRaw`DROP FUNCTION staff_900_refuse_audit()`;
  }
 });
 it("bootstraps only an exact verified active User with dry-run, idempotency and atomic system audit", async () => {
  const args = ["--filter", "@auto-tm/db", "staff:bootstrap", "--user-id", suite.id("staff"), "--capability", "support.operations", "--reason", "Synthetic named operator coverage"];
  await run("pnpm", [...args, "--dry-run"], { env: process.env });
  expect(await prisma.staffGrant.count({ where: { userId: suite.id("staff") } })).toBe(0);
  await run("pnpm", args, { env: process.env });
  await run("pnpm", args, { env: process.env });
  expect(await prisma.staffGrant.count({ where: { userId: suite.id("staff") } })).toBe(1);
  const rows = await prisma.auditLog.findMany({ where: { targetId: suite.id("staff"), action: "STAFF_CAPABILITY_BOOTSTRAP" } });
  expect(rows).toHaveLength(1);expect(rows[0]?.actorId).toBeNull();
  expect(rows[0]?.details).toMatchObject({ capability: "support.operations", reason: "Synthetic named operator coverage" });
  await prisma.user.update({ where: { id: suite.id("ordinary") }, data: { phone: null, phoneVerifiedAt: null } });
  const invalid = [...args];invalid[invalid.indexOf(suite.id("staff"))] = suite.id("ordinary");
  await expect(run("pnpm", invalid, { env: process.env })).rejects.toThrow();
  expect(await prisma.staffGrant.count({ where: { userId: suite.id("ordinary") } })).toBe(0);
 });
 it("does not trust stale admin JWT claims when the current User loses the marketplace role", async () => {
  await prisma.user.update({ where: { id: suite.id("admin") }, data: { role: "buyer" } });
  await get("/api/v1/auth/admin/totp/status", "admin").expect(403);
  await get("/test/current-staff/admin", "admin").expect(403);
 });
});
