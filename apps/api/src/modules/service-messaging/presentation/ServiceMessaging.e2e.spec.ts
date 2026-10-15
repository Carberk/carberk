import "reflect-metadata";
import sharp from "sharp";
import { S3Client, CreateBucketCommand } from "@aws-sdk/client-s3";
import { randomUUID } from "node:crypto";

import { EventEmitterModule } from "@nestjs/event-emitter";
import { io, type Socket } from "socket.io-client";
import { Test } from "@nestjs/testing";
import { JwtModule, JwtService } from "@nestjs/jwt";
import { Reflector } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { PrismaService } from "@auto-tm/db";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import supertest from "supertest";

import { JwtAuthGuard } from "../../../common/jwt-auth.guard";
import { GlobalErrorFilter } from "../../../common/error.filter";
import { defineE2eSuite } from "../../../../test/helpers/e2eSuite";
import { bullTestRoot } from "../../../../test/helpers/bullTestRoot";
import { ServiceMessagingModule } from "../service-messaging.module";
import { SERVICE_PRIVATE_STORE, SERVICE_RUNTIME, type ServicePrivateStore } from "../domain/ports/ServiceMessagingPort";

const suite = defineE2eSuite("service-messaging-boundaries");
let app: NestFastifyApplication; let db: PrismaService; let request: ReturnType<typeof supertest>; let jwt: JwtService;
const customer = suite.id("customer"), oldStaff = suite.id("operator"), nextStaff = suite.id("next"), stranger = suite.id("stranger");
const ids = [customer, oldStaff, nextStaff, stranger];
const tokens = new Map<string, string>();
beforeAll(async () => {
 const module = await Test.createTestingModule({ imports: [EventEmitterModule.forRoot(), bullTestRoot(), ServiceMessagingModule, JwtModule.register({ global: true, secret: "service-test-secret" })] }).overrideProvider(SERVICE_RUNTIME).useValue({ now: () => new Date(), id: randomUUID, syntheticEnabled: () => true, syntheticSubjectAllowed: (subject: { userId: string }) => ids.includes(subject.userId) }).compile();
 app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
 jwt = app.get(JwtService); db = app.get(PrismaService);
 app.useGlobalGuards(new JwtAuthGuard(app.get(Reflector), jwt)); app.useGlobalFilters(new GlobalErrorFilter());
 await app.listen(0, "127.0.0.1"); request = supertest(app.getHttpServer());
 const storage = new S3Client({ endpoint: process.env["MINIO_ENDPOINT"] ?? "http://localhost:9000", region: "us-east-1", forcePathStyle: true, credentials: { accessKeyId: process.env["MINIO_ACCESS_KEY"] ?? "minioadmin", secretAccessKey: process.env["MINIO_SECRET_KEY"] ?? "minioadmin" } });
 try { await storage.send(new CreateBucketCommand({ Bucket: "service-private" })); } catch (error) { if (!(error instanceof Error) || !["BucketAlreadyExists", "BucketAlreadyOwnedByYou"].includes(error.name)) throw error; } finally { storage.destroy(); }
 for (const id of ids) {
  await db.user.create({ data: { id, phone: suite.phone(id), phoneVerifiedAt: new Date(), role: id === stranger ? "admin" : "buyer", ...(id === customer ? { suspendedAt: new Date() } : {}) } });
  const session = await db.session.create({ data: { userId: id, refreshTokenHash: randomUUID(), expiresAt: new Date(Date.now() + 3600000), adminTotpExpiresAt: new Date(Date.now() + 3600000) } });
  tokens.set(id, jwt.sign({ sub: id, sid: session.id }));
 }
 await db.staffGrant.createMany({ data: [oldStaff, nextStaff].map(userId => ({ userId, capability: "support.operations" })) });
});
afterAll(async () => {
 if (db) {
  const histories = await db.vehicleHistoryRequest.findMany({ where: { customerId: { in: ids } }, select: { conversation: { select: { id: true } } } });
  const scopes = await db.supportCase.findMany({ where: { customerId: { in: ids } }, select: { conversation: { select: { id: true } } } });
  const conversations = [...scopes, ...histories].flatMap(scope => scope.conversation ? [scope.conversation.id] : []);
  const ownedFiles = await db.serviceAttachment.findMany({ where: { conversationId: { in: conversations } }, select: { objectKey: true } });
  for (const file of ownedFiles) if (file.objectKey) await app.get<ServicePrivateStore>(SERVICE_PRIVATE_STORE).remove(file.objectKey);
  await db.serviceOutbox.deleteMany({ where: { conversationId: { in: conversations } } });
  await db.serviceMessage.deleteMany({ where: { conversationId: { in: conversations } } });
  await db.serviceAttachment.deleteMany({ where: { conversationId: { in: conversations } } });
  await db.serviceReadState.deleteMany({ where: { conversationId: { in: conversations } } });
  await db.serviceErasureFence.deleteMany({ where: { conversationId: { in: conversations } } });
  await db.serviceConversation.deleteMany({ where: { id: { in: conversations } } });
  await db.serviceAudit.deleteMany({ where: { actorId: { in: ids } } });
  await db.supportCase.deleteMany({ where: { customerId: { in: ids } } });
  await db.vehicleHistoryRequest.deleteMany({ where: { customerId: { in: ids } } });
  await db.user.deleteMany({ where: { id: { in: ids } } });
 }
 await app?.close();
});
async function watchSocket(userId: string, conversationId: string): Promise<Socket> {
 const socket = io(`${await app.getUrl()}/ws/services`, { auth: { token: tokens.get(userId) }, transports: ["websocket"], reconnection: false });
 await new Promise<void>((resolve, reject) => { socket.once("connect", () => resolve()); socket.once("connect_error", reject); });
 const ack = await socket.timeout(3000).emitWithAck("service:watch", { conversationId });
 expect(ack.ok).toBe(true); return socket;
}
const auth = (id: string) => `Bearer ${tokens.get(id)}`;
it("preserves restricted-user appeals, separate identities, exact assignment and idempotent sends", async () => {
 const opened = await request.post("/api/v1/services/conversations").set("Authorization", auth(customer)).send({ purpose: "support", synthetic: true }).expect(201);
 const id = opened.body.id as string;
 expect(await db.conversation.count({ where: { buyerId: customer } })).toBe(0);
 await request.get(`/api/v1/services/conversations/${id}`).set("Authorization", auth(stranger)).expect(403);
 const sent = { clientMessageId: randomUUID(), body: "Restricted appeal, synthetic fixture", visibility: "customer" };
 const [one, retry] = await Promise.all([request.post(`/api/v1/services/conversations/${id}/messages`).set("Authorization", auth(customer)).send(sent), request.post(`/api/v1/services/conversations/${id}/messages`).set("Authorization", auth(customer)).send(sent)]);
 expect(one.status).toBe(201); expect(retry.status).toBe(201); expect(one.body.id).toBe(retry.body.id);
 await request.post(`/api/v1/services/conversations/${id}/assignment`).set("Authorization", auth(oldStaff)).send({ expectedVersion: 0 }).expect(201);
 await request.post(`/api/v1/services/conversations/${id}/messages`).set("Authorization", auth(oldStaff)).send({ clientMessageId: randomUUID(), body: "Internal note", visibility: "staff" }).expect(201);
 const customerView = await request.get(`/api/v1/services/conversations/${id}`).set("Authorization", auth(customer)).expect(200);
 expect(JSON.stringify(customerView.body)).not.toContain("Internal note");
 expect(customerView.body.messages).toHaveLength(1);
 const oldSocket = await watchSocket(oldStaff, id);
 const denied = new Promise<void>(resolve => oldSocket.once("service:denied", () => resolve()));
 await request.post(`/api/v1/services/conversations/${id}/assignment`).set("Authorization", auth(oldStaff)).send({ expectedVersion: 1, targetUserId: nextStaff }).expect(201);
 await denied; oldSocket.disconnect();
 await request.get(`/api/v1/services/conversations/${id}`).set("Authorization", auth(oldStaff)).expect(403);
 await request.get(`/api/v1/services/conversations/${id}`).set("Authorization", auth(nextStaff)).expect(200);
 await request.get(`/api/v1/services/conversations/${id}`).set("Authorization", auth(customer)).expect(200);
 await db.staffGrant.update({ where: { userId_capability: { userId: nextStaff, capability: "support.operations" } }, data: { revokedAt: new Date() } });
 await request.get(`/api/v1/services/conversations/${id}`).set("Authorization", auth(nextStaff)).expect(403);
 const audits = await db.serviceAudit.findMany({ where: { resourceId: opened.body.resourceId } });
 expect(audits.length).toBeGreaterThan(0); expect(JSON.stringify(audits)).not.toContain("Internal note");
});
it("keeps staged bytes unusable until exact adoption and checks current audience on every private download", async () => {
 const opened = await request.post("/api/v1/services/conversations").set("Authorization", auth(stranger)).send({ purpose: "support", synthetic: true }).expect(201);
 const id = opened.body.id as string;
 const other = await request.post("/api/v1/services/conversations").set("Authorization", auth(customer)).send({ purpose: "history", synthetic: true }).expect(201);
 const original = await sharp({ create: { width: 20, height: 10, channels: 3, background: "red" } }).jpeg().withExif({ IFD0: { Artist: "Synthetic private metadata" } }).toBuffer();
 const rights = { category: "support_communication", purpose: "Synthetic fixture", basis: "Owned test data", provenance: "Generated red pixels", identifiability: "personal", use: ["service"], schedule: { kind: "support_case", closedDays: 90, eraseOnAccountDeletion: true }, supplierRestrictions: "", hold: null };
 const staged = await request.post(`/api/v1/services/conversations/${id}/attachments`).set("Authorization", auth(stranger)).send({ category: "support_communication", contentType: "image/jpeg", sizeBytes: original.length, filename: "synthetic.jpg", rights }).expect(201);
 const file = staged.body.id as string;
 expect(staged.body).not.toHaveProperty("objectKey"); expect(staged.body).not.toHaveProperty("url");
 await request.get(`/api/v1/services/conversations/${id}/attachments/${file}`).set("Authorization", auth(stranger)).expect(403);
 await request.post(`/api/v1/services/conversations/${other.body.id}/attachments/${file}/bytes`).set("Authorization", auth(customer)).set("Content-Type", "application/octet-stream").send(original).expect(400);
 const privateStore = app.get<ServicePrivateStore>(SERVICE_PRIVATE_STORE), put = privateStore.putImmutable.bind(privateStore);
 const lostResponse = vi.spyOn(privateStore, "putImmutable").mockImplementationOnce(async (...args) => { await put(...args); throw new Error("Synthetic lost storage response"); });
 await request.post(`/api/v1/services/conversations/${id}/attachments/${file}/bytes`).set("Authorization", auth(stranger)).set("Content-Type", "application/octet-stream").send(original).expect(500);
 const pending = await db.serviceAttachment.findUniqueOrThrow({ where: { id: file } }); expect(pending.objectKey).not.toBeNull(); expect(pending.sizeBytes).toBeNull();
 lostResponse.mockRestore();
 await request.post(`/api/v1/services/conversations/${id}/attachments/${file}/bytes`).set("Authorization", auth(stranger)).set("Content-Type", "application/octet-stream").send(original).expect(201);
 await request.post(`/api/v1/services/conversations/${id}/attachments/${file}/bytes`).set("Authorization", auth(stranger)).set("Content-Type", "application/octet-stream").send(original).expect(201);
 await request.get(`/api/v1/services/conversations/${id}/attachments/${file}`).set("Authorization", auth(stranger)).expect(403);
 const message = { clientMessageId: randomUUID(), attachmentId: file, visibility: "customer" };
 const first = await request.post(`/api/v1/services/conversations/${id}/messages`).set("Authorization", auth(stranger)).send(message).expect(201);
 const retry = await request.post(`/api/v1/services/conversations/${id}/messages`).set("Authorization", auth(stranger)).send(message).expect(201);
 expect(first.body.id).toBe(retry.body.id);
 await request.post(`/api/v1/services/conversations/${id}/messages`).set("Authorization", auth(stranger)).send({ ...message, body: "Different content" }).expect(409);
 const downloaded = await request.get(`/api/v1/services/conversations/${id}/attachments/${file}`).set("Authorization", auth(stranger)).expect(200);
 expect(downloaded.headers["cache-control"]).toContain("no-store");
 expect((await sharp(downloaded.body as Buffer).metadata()).exif).toBeUndefined();
 await request.get(`/api/v1/services/conversations/${id}/attachments/${file}`).set("Authorization", auth(customer)).expect(403);
 const row = await db.serviceAttachment.findUniqueOrThrow({ where: { id: file } });
 const anonymous = await fetch(`${process.env["MINIO_ENDPOINT"]}/service-private/${row.objectKey}`); expect([401, 403]).toContain(anonymous.status);
 await db.session.deleteMany({ where: { userId: stranger } });
 await request.get(`/api/v1/services/conversations/${id}/attachments/${file}`).set("Authorization", auth(stranger)).expect(403);
});
