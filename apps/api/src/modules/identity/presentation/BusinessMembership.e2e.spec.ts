import "reflect-metadata";
import { JwtModule, JwtService } from "@nestjs/jwt";
import { Reflector } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { PrismaService } from "@auto-tm/db";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import supertest from "supertest";
import { IdentityModule } from "../identity.module";
import { JwtAuthGuard } from "../../../common/jwt-auth.guard";
import { bullTestRoot } from "../../../../test/helpers/bullTestRoot";
import { cleanSuiteFixtures, defineE2eSuite } from "../../../../test/helpers/e2eSuite";
import { BUSINESS_AUTHORITY_PORT, type BusinessAuthorityPort } from "../identity.public";
const suite = defineE2eSuite("business-membership-902");
const actors = ["founder", "owner", "sales", "other", "replacement", "owner2"];
describe("business admission/membership/recovery through HTTP and disposable PostgreSQL", () => {
 let app: NestFastifyApplication; let request: ReturnType<typeof supertest>; let prisma: PrismaService; let jwt: JwtService;
 const sessionId = (who: string) => suite.id(`${who}-session`);
 const subject = (who: string) => ({ userId: suite.id(who), sessionId: sessionId(who) });
 // Deliberately stale admin role never grants business or staff purpose authority.
 const token = (who: string) => jwt.sign({ sub: suite.id(who), sid: sessionId(who), role: "admin" });
 const post = (path: string, who: string, body: object) => request.post(`/api/v1/business${path}`).set("authorization", `Bearer ${token(who)}`).send(body);
 const current = (who: string) => request.get("/api/v1/business/current").set("authorization", `Bearer ${token(who)}`);
 const admit = async (owner = "owner", alias = "one") => (await post("/admission", "founder", { name: "Synthetic Carberk Business", slug: suite.slugFor(alias), ownerUserId: suite.id(owner), mode: "synthetic", evidence: "Fictional fixture only", reason: "Disposable contract proof" }).expect(201)).body as { businessId: string; invitationId: string; token: string };
 const join = (who: string, invitation: { token: string }) => post("/invitations/redeem", who, invitation);
 async function active() { const invitation = await admit(); await join("owner", invitation).expect(201); return invitation; }
 async function cleanup() {
  const businesses = await prisma.dealership.findMany({ where: { slug: { startsWith: `${suite.slug}-` } }, select: { id: true } });
  const ids = businesses.map((b) => b.id);
  await prisma.auditLog.deleteMany({ where: { OR: [{ targetId: { in: ids } }, { actorId: { in: actors.map((who) => suite.id(who)) } }] } });
  await prisma.dealershipInvitation.deleteMany({ where: { dealershipId: { in: ids } } });
  await prisma.dealershipMember.deleteMany({ where: { dealershipId: { in: ids } } });
  await prisma.dealership.deleteMany({ where: { id: { in: ids } } });
  await cleanSuiteFixtures(prisma, suite, { userAliases: actors });
 }
 beforeAll(async () => {
  const module = await Test.createTestingModule({ imports: [bullTestRoot(), IdentityModule, JwtModule.register({ global: true, secret: "synthetic-business-http-902" })] }).compile();
  app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter()); jwt = app.get(JwtService); prisma = app.get(PrismaService);
  app.useGlobalGuards(new JwtAuthGuard(app.get(Reflector), jwt)); await app.listen(0, "127.0.0.1"); request = supertest(app.getHttpServer());
 });
 afterAll(async () => { await cleanup(); await app?.close(); });
 beforeEach(async () => {
  await cleanup();
  for (const who of actors) {
   await prisma.user.create({ data: { id: suite.id(who), phone: suite.phone(who), phoneVerifiedAt: new Date() } });
   await prisma.session.create({ data: { id: sessionId(who), userId: suite.id(who), refreshTokenHash: suite.id(`${who}-refresh`), expiresAt: new Date(Date.now() + 86400000), adminTotpExpiresAt: new Date(Date.now() + 3600000) } });
  }
  await prisma.staffGrant.createMany({ data: ["founder.admission", "founder.recovery"].map((capability) => ({ userId: suite.id("founder"), capability })) });
 });
 it("invalidates fresh inventory proof when owner admission activates a recovered business",async()=>{
  const invitation=await admit(),epoch=suite.id("baseline"),key=`inventory_baseline:${epoch}`;
  await prisma.measurementState.create({data:{key:"collector",epoch}});await prisma.measurementState.create({data:{key,epoch:new Date().toISOString()}});
  try{await join("owner",invitation).expect(201);expect(await prisma.measurementState.findUnique({where:{key}})).toBeNull();}
  finally{await prisma.measurementState.deleteMany({where:{key:{in:[key,"collector"]}}});}
 });
 it.each(["root", "admitted"])("refuses admission using an existing %s Dealership slug", async (kind) => {
  const slug = suite.slugFor("occupied");
  const businessId = kind === "root"
   ? (await prisma.dealership.create({ data: { name: "Existing root Business", slug } })).id
   : (await admit("owner", "occupied")).businessId;
  const before = await prisma.dealership.findUniqueOrThrow({ where: { id: businessId } });
  const refused = await post("/admission", "founder", {
   name: "Another Business", slug, ownerUserId: suite.id("replacement"), mode: "synthetic", evidence: "Fixture only", reason: "Collision proof",
  }).expect(409);
  expect(refused.body.details.reason).toBe("MEMBERSHIP_CONFLICT");
  expect(await prisma.dealership.findUniqueOrThrow({ where: { id: businessId } })).toEqual(before);
  expect(await prisma.dealershipInvitation.count({ where: { dealershipId: businessId, recipientUserId: suite.id("replacement") } })).toBe(0);
 });

 it("requires current scoped elevated admission authority and records truthful synthetic identity scope", async () => {
  const body = { name: "Business", slug: suite.slugFor("refused"), ownerUserId: suite.id("owner"), mode: "synthetic", evidence: "Fixture only", reason: "Contract proof" };
  await post("/admission", "other", body).expect(403);
  const invitation = await admit(); await join("owner", invitation).expect(201);
  const workspace = (await current("owner").expect(200)).body.workspace;
  expect(workspace.business).toMatchObject({ status: "active", admissionMode: "synthetic" });
  expect(workspace.membership.role).toBe("owner");
  const audit = await prisma.auditLog.findFirstOrThrow({ where: { targetId: invitation.businessId, action: "BUSINESS_ADMITTED" } });
  expect(audit).toMatchObject({ actorId: suite.id("founder"), details: { mode: "synthetic", evidence: "Fictional fixture only", verifiedScope: "Synthetic fixture; no real business verified" } });
  expect(JSON.stringify(audit.details)).not.toContain(invitation.token);
  await prisma.staffGrant.updateMany({ where: { userId: suite.id("founder") }, data: { revokedAt: new Date() } });
  await post("/admission", "founder", body).expect(403);
 });
 it("binds invitations to the intended signed-in User, consumes once, and never reveals contact or token on refusal", async () => {
  const invitation = await active();
  const invite = (await post(`/${invitation.businessId}/invitations`, "owner", { recipientUserId: suite.id("sales") }).expect(201)).body;
  const wrong = await join("other", invite).expect(409);
  expect(wrong.body.details.reason).toBe("INVITATION_INVALID");
  expect(JSON.stringify(wrong.body)).not.toContain(invite.token);
  expect(JSON.stringify(wrong.body)).not.toContain(suite.phone("sales"));
  await join("sales", { token: "0".repeat(64) }).expect(409);
  await join("sales", invite).expect(201); await join("sales", invite).expect(409);
  expect((await current("sales").expect(200)).body.workspace).toMatchObject({ membership: { role: "sales" }, members: [], invitations: [] });
 });
 it("revokes superseded, manually revoked and expired invitations", async () => {
  const { businessId } = await active();
  const invite = async () => (await post(`/${businessId}/invitations`, "owner", { recipientUserId: suite.id("sales") }).expect(201)).body;
  const old = await invite(); const replacement = await invite(); await join("sales", old).expect(409);
  await post(`/${businessId}/invitations/revoke`, "owner", { invitationId: replacement.invitationId }).expect(201); await join("sales", replacement).expect(409);
  const expired = await invite();
  // Time boundary fixture; the production redemption owns the observable refusal.
  await prisma.dealershipInvitation.update({ where: { id: expired.invitationId }, data: { expiresAt: new Date(Date.now() - 1) } });
  await join("sales", expired).expect(409);
 });
 it("serializes concurrent duplicate redemption and competing business membership", async () => {
  const { businessId } = await active();
  const invitation = (await post(`/${businessId}/invitations`, "owner", { recipientUserId: suite.id("sales") }).expect(201)).body;
  expect((await Promise.all([join("sales", invitation), join("sales", invitation)])).map((r) => r.status).sort()).toEqual([201, 409]);
  const second = await admit("owner2", "two"); await join("owner2", second).expect(201);
  await post(`/${second.businessId}/invitations`, "owner2", { recipientUserId: suite.id("sales") }).expect(409);
  const a = (await post(`/${businessId}/invitations`, "owner", { recipientUserId: suite.id("other") }).expect(201)).body;
  const b = (await post(`/${second.businessId}/invitations`, "owner2", { recipientUserId: suite.id("other") }).expect(201)).body;
  expect((await Promise.all([join("other", a), join("other", b)])).map((r) => r.status).sort()).toEqual([201, 409]);
 });
 it("blocks Sales settings/membership, protects the owner, and observes member suspension/removal immediately", async () => {
  const { businessId } = await active();
  const invitation = (await post(`/${businessId}/invitations`, "owner", { recipientUserId: suite.id("sales") }).expect(201)).body; await join("sales", invitation).expect(201);
  await post(`/${businessId}/settings`, "sales", { name: "Refused" }).expect(403);
  await post(`/${businessId}/members`, "sales", { targetUserId: suite.id("owner"), action: "remove" }).expect(403);
  expect((await post(`/${businessId}/members`, "owner", { targetUserId: suite.id("owner"), action: "remove" }).expect(409)).body.details.reason).toBe("SOLE_OWNER");
  await post(`/${businessId}/members`, "owner", { targetUserId: suite.id("sales"), action: "suspend" }).expect(201); await current("sales").expect(403);
  await post(`/${businessId}/members`, "owner", { targetUserId: suite.id("sales"), action: "restore" }).expect(201); await current("sales").expect(200);
  await post(`/${businessId}/members`, "owner", { targetUserId: suite.id("sales"), action: "remove" }).expect(201);
  expect((await current("sales").expect(200)).body.workspace).toBeNull();
  const authority = app.get<BusinessAuthorityPort>(BUSINESS_AUTHORITY_PORT);
  await expect(authority.authorize({ ...subject("sales"), businessId })).rejects.toMatchObject({ reason: "MEMBERSHIP_REQUIRED" });
 });
 it("allows sole-owner deletion, preserves business assets and requires audited founder recovery before operation", async () => {
  const { businessId } = await active();
  const invitation = (await post(`/${businessId}/invitations`, "owner", { recipientUserId: suite.id("sales") }).expect(201)).body; await join("sales", invitation).expect(201);
  await request.delete("/api/v1/me").set("authorization", `Bearer ${token("owner")}`).expect(204);
  await current("owner").expect(403);
  expect((await current("sales").expect(200)).body.workspace.business.status).toBe("recovery");
  const authority = app.get<BusinessAuthorityPort>(BUSINESS_AUTHORITY_PORT);
  await expect(authority.authorize({ ...subject("sales"), businessId })).rejects.toMatchObject({ reason: "BUSINESS_INACTIVE" });
  expect(await authority.authorize({ ...subject("sales"), businessId, history: true })).toMatchObject({ role: "sales", status: "recovery" });
  const recovery = { ownerUserId: suite.id("replacement"), evidence: "Synthetic checked replacement", reason: "Deleted sole owner" };
  await post(`/${businessId}/recovery`, "sales", recovery).expect(403);
  const receipt = (await post(`/${businessId}/recovery`, "founder", recovery).expect(201)).body;
  await join("replacement", receipt).expect(201);
  expect((await current("replacement").expect(200)).body.workspace).toMatchObject({ business: { id: businessId, status: "active" }, membership: { role: "owner" } });
  expect(await authority.authorize({ ...subject("sales"), businessId })).toMatchObject({ role: "sales", status: "active" });
  expect(await prisma.auditLog.findFirst({ where: { targetId: businessId, action: "BUSINESS_OWNER_RECOVERY" } })).toMatchObject({ actorId: suite.id("founder"), details: { reason: "Deleted sole owner" } });
 });
 it("refuses owner recovery to a User who belongs to a different business", async () => {
  const first = await active();
  const second = await admit("owner2", "foreign");
  await join("owner2", second).expect(201);
  await post(`/${second.businessId}/recovery`, "founder", {
   ownerUserId: suite.id("replacement"), evidence: "Existing owner proof", reason: "Must refuse foreign takeover",
  }).expect(409);
  await request.delete("/api/v1/me").set("authorization", `Bearer ${token("owner")}`).expect(204);
  const refused = await post(`/${first.businessId}/recovery`, "founder", {
   ownerUserId: suite.id("owner2"), evidence: "Foreign membership proof", reason: "Must refuse foreign business",
  }).expect(409);
  expect(refused.body.details.reason).toBe("MEMBERSHIP_CONFLICT");
  expect((await current("owner2").expect(200)).body.workspace.business.id).toBe(second.businessId);
 });

 it("requires explicit founder recovery and recipient consent before an existing Sales member becomes Owner", async () => {
  const { businessId } = await active();
  const invitation = (await post(`/${businessId}/invitations`, "owner", { recipientUserId: suite.id("sales") }).expect(201)).body; await join("sales", invitation).expect(201);
  await request.delete("/api/v1/me").set("authorization", `Bearer ${token("owner")}`).expect(204);
  const receipt = (await post(`/${businessId}/recovery`, "founder", { ownerUserId: suite.id("sales"), evidence: "Explicit replacement evidence", reason: "Founder checked replacement" }).expect(201)).body;
  expect((await current("sales").expect(200)).body.workspace.membership.role).toBe("sales");
  await join("sales", receipt).expect(201);
  expect((await current("sales").expect(200)).body.workspace).toMatchObject({ membership: { role: "owner" }, business: { status: "active" } });
 });
 it("rejects revoked sessions and currently suspended Users despite valid access tokens", async () => {
  const { businessId } = await active();
  await prisma.user.update({ where: { id: suite.id("owner") }, data: { suspendedAt: new Date() } }); await current("owner").expect(403);
  await post(`/${businessId}/settings`, "owner", { name: "Refused" }).expect(403);
  await prisma.session.delete({ where: { id: sessionId("founder") } });
  await post(`/${businessId}/recovery`, "founder", { ownerUserId: suite.id("replacement"), evidence: "Fixture", reason: "Stale session" }).expect(403);
 });
});
