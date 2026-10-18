import "reflect-metadata";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Test } from "@nestjs/testing";
import { ConfigModule } from "@nestjs/config";
import { JwtModule, JwtService } from "@nestjs/jwt";
import { Reflector } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { EventEmitterModule, EventEmitter2 } from "@nestjs/event-emitter";
import { PrismaService } from "@auto-tm/db";
import supertest from "supertest";

import { ConversationsModule } from "../conversations.module";
import { JwtAuthGuard } from "../../../common/jwt-auth.guard";
import { GlobalErrorFilter } from "../../../common/error.filter";
import { EnvSchema } from "../../../env.schema";
import { bullTestRoot } from "../../../../test/helpers/bullTestRoot";
import { cleanSuiteFixtures, defineE2eSuite, seedSuiteCatalog } from "../../../../test/helpers/e2eSuite";
import type { MessageSentEvent } from "../domain/ports/MessageEventPublisher";

const suite = defineE2eSuite("business-enquiries-909");
const actors = ["owner", "sales-a", "sales-b", "creator", "buyer", "other"];
/** Hosted disposable database/Redis suite. No local service startup or real recipient delivery. */
describe("business enquiries through real HTTP and PostgreSQL", () => {
 let app: NestFastifyApplication; let prisma: PrismaService; let jwt: JwtService; let request: ReturnType<typeof supertest>;
 let events: MessageSentEvent[] = [];
 const businessId = suite.id("business");
 const token = (actor: string) => jwt.sign({ sub: suite.id(actor), sid: suite.id(`${actor}-session`), role: "admin" });
 const get = (actor: string, path: string, scoped = true) => { const req = request.get(`/api/v1/conversations${path}`).set("authorization", `Bearer ${token(actor)}`); return scoped ? req.set("x-business-id", businessId) : req; };
 const post = (actor: string, path: string, body: object, scoped = true) => { const req = request.post(`/api/v1/conversations${path}`).set("authorization", `Bearer ${token(actor)}`).send(body); return scoped ? req.set("x-business-id", businessId) : req; };
 const inbox = (actor: string) => get(actor, `/business/${businessId}`);
 const open = () => post("buyer", "", { listingId: suite.id("listing") }, false);
 async function cleanup() {
  if (!prisma) return;
  await cleanSuiteFixtures(prisma, suite, { userAliases: actors });
  await prisma.dealership.deleteMany({ where: { id: businessId } });
 }
 beforeAll(async () => {
  const module = await Test.createTestingModule({ imports: [ConfigModule.forRoot({ isGlobal: true, validate: cfg => EnvSchema.parse(cfg) }), EventEmitterModule.forRoot(), bullTestRoot(), ConversationsModule, JwtModule.register({ global: true, secret: "synthetic-enquiries-909" })] }).compile();
  app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter()); prisma = app.get(PrismaService); jwt = app.get(JwtService);
  app.useGlobalGuards(new JwtAuthGuard(app.get(Reflector), jwt)); app.useGlobalFilters(new GlobalErrorFilter()); await app.listen(0, "127.0.0.1"); request = supertest(app.getHttpServer());
  app.get(EventEmitter2).on("MessageSent", (event: MessageSentEvent) => events.push(event));
 }, 60000);
 afterAll(async () => { await cleanup(); await app?.close(); });
 beforeEach(async () => {
  await cleanup(); events = []; await seedSuiteCatalog(prisma, suite);
  for (const actor of actors) {
   await prisma.user.create({ data: { id: suite.id(actor), phone: suite.phone(actor), phoneVerifiedAt: new Date() } });
   await prisma.session.create({ data: { id: suite.id(`${actor}-session`), userId: suite.id(actor), refreshTokenHash: suite.id(`${actor}-refresh`), expiresAt: new Date(Date.now() + 86400000) } });
  }
  await prisma.dealership.create({ data: { id: businessId, slug: suite.slugFor("business"), name: "Synthetic Ahal Motors", status: "active", admissionMode: "synthetic" } });
  await prisma.dealershipMember.createMany({ data: ["owner", "sales-a", "sales-b"].map(actor => ({ dealershipId: businessId, userId: suite.id(actor), role: actor === "owner" ? "owner" as const : "sales" as const })) });
  // Inventory is a different owning context; seed its public current state directly.
  await prisma.listing.create({ data: { id: suite.id("listing"), sellerId: suite.id("creator"), businessId, status: "active", brandId: suite.catalog.brandId, modelId: suite.catalog.modelId, cityId: suite.catalog.cityId, priceAmount: 100000, priceTmt: 100000, priceCurrency: "TMT", allowChat: true, publishedAt: new Date() } });
 });
 it("opens in personal buyer context using listing ownership and displays business identity, independent of creator suspension", async () => {
  await prisma.user.update({ where: { id: suite.id("creator") }, data: { suspendedAt: new Date() } });
  const result = await open().expect(201);
  expect(result.body.peer).toMatchObject({ id: businessId, displayName: "Synthetic Ahal Motors", deleted: false });
  const list = (await inbox("sales-a").expect(200)).body;
  expect(list.items).toEqual([expect.objectContaining({ id: result.body.id, assigneeId: null, status: "open", version: 0 })]);
  await inbox("creator").expect(403); await inbox("other").expect(403);
  expect((await get("buyer", "", false).expect(200)).body.items[0].peer.displayName).toBe("Synthetic Ahal Motors");
 });
 it("serializes competing claims, preserves author history after revocation and requeues responsibility atomically", async () => {
  const id = (await open().expect(201)).body.id as string;
  const results = await Promise.all([post("sales-a", `/business/${businessId}/${id}/claim`, { expectedVersion: 0 }), post("sales-b", `/business/${businessId}/${id}/claim`, { expectedVersion: 0 })]);
  expect(results.map(result => result.status).sort()).toEqual([201, 409]);
  const winner = results[0]?.status === 201 ? "sales-a" : "sales-b";
  await post(winner, `/${id}/messages`, { text: "Available at the business" }).expect(201);
  expect((await get("sales-b", `/${id}/messages`).expect(200)).body.items[0]).toMatchObject({ senderId: suite.id(winner), text: "Available at the business" });
  await post("buyer", `/${id}/messages`, { text: "Thank you" }, false).expect(201);
  expect(events.filter(event => event.senderId === suite.id("buyer")).map(event => event.recipientId)).toEqual([suite.id(winner)]);
  // Identity owns membership changes; its real removal trigger must requeue this enquiry.
  await prisma.dealershipMember.delete({ where: { userId: suite.id(winner) } });
  await get(winner, `/${id}/messages`).expect(403);
  await post(winner, `/${id}/messages`, { text: "Refused after removal" }).expect(403);
  expect((await inbox("owner").expect(200)).body.items[0]).toMatchObject({ assigneeId: null, version: 2 });
  expect((await get("owner", `/${id}/messages`).expect(200)).body.items).toEqual(expect.arrayContaining([expect.objectContaining({ senderId: suite.id(winner), text: "Available at the business" })]));
 });
 it("restricts follow-up changes to Owner and keeps sold continuation while refusing new contact", async () => {
  const id = (await open().expect(201)).body.id as string;
  await post("sales-a", `/business/${businessId}/${id}/close`, { expectedVersion: 0 }).expect(403);
  await post("owner", `/business/${businessId}/${id}/reassign`, { expectedVersion: 0, assigneeId: suite.id("sales-a") }).expect(201);
  await post("owner", `/business/${businessId}/${id}/close`, { expectedVersion: 1 }).expect(201);
  await post("sales-a", `/${id}/messages`, { text: "Closed" }).expect(403);
  await post("owner", `/business/${businessId}/${id}/reopen`, { expectedVersion: 2 }).expect(201);
  await prisma.listing.update({ where: { id: suite.id("listing") }, data: { status: "sold", soldAt: new Date() } });
  await post("sales-a", `/${id}/messages`, { text: "Existing conversation continues" }).expect(201);
  await post("other", "", { listingId: suite.id("listing") }, false).expect(403);
 });
});
