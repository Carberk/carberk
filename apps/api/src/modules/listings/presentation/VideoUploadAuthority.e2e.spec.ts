import "reflect-metadata";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { ConfigModule } from "@nestjs/config";
import { Reflector } from "@nestjs/core";
import { JwtModule, JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { PrismaService } from "@auto-tm/db";
import supertest from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { IdentityModule } from "../../identity/identity.module";
import { IDENTITY_CLOCK_PORT } from "../../identity/identity.public";
import { VIDEO_OBJECT_STORAGE } from "../domain/ports/VideoObjectStorage";
import { InMemoryVideoObjectStorage } from "../application/testing/InMemoryVideoObjectStorage";
import { ListingsModule } from "../listings.module";
import { JwtAuthGuard } from "../../../common/jwt-auth.guard";
import { GlobalErrorFilter } from "../../../common/error.filter";
import { EnvSchema } from "../../../env.schema";
import { bullTestRoot } from "../../../../test/helpers/bullTestRoot";
import { cleanSuiteFixtures, defineE2eSuite, seedSuiteCatalog } from "../../../../test/helpers/e2eSuite";

const suite = defineE2eSuite("video-upload-authority");
const people = ["owner", "other"] as const;
type Person = typeof people[number];
const epoch = new Date("2026-10-17T12:00:00Z");
const businessId = suite.id("business");
const priorFlag = process.env["VIDEO_ROLLOUT_ENABLED"];
const priorUploads = process.env["VIDEO_UPLOADS_ENABLED"];
const priorTesters = process.env["VIDEO_TESTER_USER_IDS"];

/** Actual PostgreSQL and full Nest composition. Storage provenance is a boundary fixture. */
describe("video upload current authority and retirement", () => {
  let app: NestFastifyApplication;
  let request: ReturnType<typeof supertest>;
  let db: PrismaService;
  let jwt: JwtService;
  let time = epoch;
  const storage = new InMemoryVideoObjectStorage();
  const sid = (who: Person) => suite.id(`${who}-session`);
  const token = (who: Person, session = sid(who)) => jwt.sign({ sub: suite.id(who), sid: session, role: "buyer" });
  const create = (who: Person, body: object, business = false, session = sid(who)) => {
    const req = request.post("/api/v1/listing-video-upload-sessions").set("authorization", `Bearer ${token(who, session)}`);
    if (business) req.set("x-business-id", businessId);
    return req.send(body);
  };
  const action = (id: string, verb: string, business = false) => {
    const req = request.post(`/api/v1/listing-video-upload-sessions/${id}/${verb}`).set("authorization", `Bearer ${token("owner")}`);
    if (business) req.set("x-business-id", businessId);
    return req.send({});
  };
  async function cleanup() {
    if (!db) return;
    const sessions = await db.videoUploadSession.findMany({ where: { userId: { in: people.map(p => suite.id(p)) } } });
    const ids = sessions.map(row => row.id), uploadIds = sessions.map(row => row.uploadId);
    await db.listing.updateMany({ where: { sellerId: { in: people.map(p => suite.id(p)) } }, data: { pendingVideoGenerationId: null, activeVideoGenerationId: null } });
    await db.videoProcessWork.deleteMany({ where: { sessionId: { in: ids } } });
    await db.videoCleanupWork.deleteMany({ where: { sessionId: { in: ids } } });
    await db.videoGeneration.deleteMany({ where: { id: { in: ids } } });
    await db.videoUploadSession.deleteMany({ where: { id: { in: ids } } });
    await db.mediaUploadCleanup.deleteMany({ where: { uploadId: { in: uploadIds } } });
    await db.mediaUploadCleanup.deleteMany({ where: { uploadId: { in: people.map(p => suite.id(`${p}-upload`)) } } });
    await cleanSuiteFixtures(db, suite, { userAliases: people });
    await db.dealership.deleteMany({ where: { id: businessId } });
  }
  beforeAll(async () => {
    process.env["VIDEO_ROLLOUT_ENABLED"] = "true";
    process.env["VIDEO_UPLOADS_ENABLED"] = "true";
    process.env["VIDEO_TESTER_USER_IDS"] = people.map(p => suite.id(p)).join(",");
    const module = await Test.createTestingModule({ imports: [
      EventEmitterModule.forRoot(), bullTestRoot(),
      ConfigModule.forRoot({ isGlobal: true, validate: cfg => EnvSchema.parse(cfg) }),
      IdentityModule, ListingsModule, JwtModule.register({ global: true, secret: "synthetic-video-authority" }),
    ] }).overrideProvider(VIDEO_OBJECT_STORAGE).useValue(storage).overrideProvider(IDENTITY_CLOCK_PORT).useValue({ now: () => time }).compile();
    app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    db = app.get(PrismaService); jwt = app.get(JwtService);
    app.useGlobalGuards(new JwtAuthGuard(app.get(Reflector), jwt));
    app.useGlobalFilters(new GlobalErrorFilter());
    await app.listen(0, "127.0.0.1"); request = supertest(app.getHttpServer());
  });
  afterAll(async () => {
    await cleanup(); await app?.close();
    if (priorUploads === undefined) delete process.env["VIDEO_UPLOADS_ENABLED"]; else process.env["VIDEO_UPLOADS_ENABLED"] = priorUploads;
    if (priorFlag === undefined) delete process.env["VIDEO_ROLLOUT_ENABLED"]; else process.env["VIDEO_ROLLOUT_ENABLED"] = priorFlag;
    if (priorTesters === undefined) delete process.env["VIDEO_TESTER_USER_IDS"]; else process.env["VIDEO_TESTER_USER_IDS"] = priorTesters;
  });
  beforeEach(async () => {
    time = epoch; storage.initialized = 0; storage.committed = false; storage.loseInitializeResponse = false; storage.loseCompleteResponse = false; storage.afterComplete = () => {}; await cleanup(); await seedSuiteCatalog(db, suite);
    for (const who of people) {
      await db.user.create({ data: { id: suite.id(who), phone: suite.phone(who), phoneVerifiedAt: epoch } });
      await db.session.create({ data: { id: sid(who), userId: suite.id(who), refreshTokenHash: suite.id(`${who}-refresh`), expiresAt: new Date("2026-11-17T12:00:00Z") } });
      await db.listing.create({ data: { id: suite.id(`${who}-listing`), sellerId: suite.id(who), status: "active", brandId: suite.catalog.brandId, modelId: suite.catalog.modelId, cityId: suite.catalog.cityId, priceAmount: 100000, priceCurrency: "TMT" } });
    }
  });
  const body = (listing = "owner-listing", key = "first-video") => ({ protocolVersion: 1, target: { kind: "listing", id: suite.id(listing) }, prepared: { sizeBytes: 1000, sha256: "a".repeat(64) }, posterMs: 0, idempotencyKey: key });
  it("refuses another seller's target and rejects forged upload/source authority", async () => {
    await create("owner", body("other-listing")).expect(404);
    await create("owner", { ...body(), sourceKey: "forged.mp4" }).expect(400);
    await create("owner", { ...body(), uploadId: suite.id("owner-upload") }).expect(400);
    const valid = await create("owner", body()).expect(201);
    expect(valid.body.sourceKey).toBeUndefined();
    const persisted = await db.videoUploadSession.findUniqueOrThrow({ where: { id: valid.body.sessionId } });
    expect(persisted.protocolVersion).toBe(1);
    expect(persisted.sourceKey).toBe(`video/v1/${persisted.uploadId}/${persisted.id}/source.mp4`);
  });
  it("keeps immutable seven-day recovery and refuses renew/pause at the deadline", async () => {
    const { body: session } = await create("owner", body()).expect(201);
    expect(session.expiresAt).toBe("2026-10-24T12:00:00.000Z");
    await action(session.sessionId, "pause").expect(200); await action(session.sessionId, "resume").expect(200);
    time = new Date("2026-10-24T12:00:00Z");
    await action(session.sessionId, "pause").expect(404);
    await request.post(`/api/v1/listing-video-upload-sessions/${session.sessionId}/part-credentials`).set("authorization", `Bearer ${token("owner")}`).send({ partNumbers: [1] }).expect(404);
  });
  it("requires a current matching session even with a valid access JWT", async () => {
    await create("owner", body(), false, suite.id("missing-session")).expect(404);
    const { body: session } = await create("owner", body()).expect(201);
    await db.session.delete({ where: { id: sid("owner") } });
    await action(session.sessionId, "pause").expect(404);
  });
  it("serializes identical idempotent creation and retires cancellation into independent video work", async () => {
    const attempts = await Promise.all([create("owner", body()), create("owner", body())]);
    expect(attempts.every(response => [201, 503].includes(response.status))).toBe(true);
    expect(attempts.some(response => response.status === 201)).toBe(true);
    const { body: session } = await create("owner", body()).expect(201);
    expect(storage.initialized).toBe(1);
    expect(await db.videoUploadSession.count({ where: { userId: suite.id("owner") } })).toBe(1);
    const cancelled = await request.delete(`/api/v1/listing-video-upload-sessions/${session.sessionId}`).set("authorization", `Bearer ${token("owner")}`).expect(202);
    expect(cancelled.body.state).toBe("CLEANUP_PENDING");
    await action(session.sessionId, "resume").expect(404);
    const row = await db.videoUploadSession.findUniqueOrThrow({ where: { id: session.sessionId } });
    const work = await db.videoCleanupWork.findUniqueOrThrow({ where: { id: `session:${row.id}` } });
    expect(work).toMatchObject({ uploadId: row.uploadId, writeProtocol: "video-v1", sourceKey: row.sourceKey, state: "PENDING" });
    expect((await db.mediaUpload.findUniqueOrThrow({ where: { id: row.uploadId } })).state).toBe("RETIRED");
  });
  it("records source completion and durable work without making video public", async () => {
    const { body: session } = await create("owner", body()).expect(201);
    storage.loseCompleteResponse = true;
    expect((await action(session.sessionId, "complete").expect(200)).body.state).toBe("PROCESSING");
    const work = await db.videoProcessWork.findUniqueOrThrow({ where: { generationId: session.generation } });
    expect(work).toMatchObject({ sessionId: session.sessionId, state: "PENDING", targetRevision: 1 });
    const listing = await db.listing.findUniqueOrThrow({ where: { id: suite.id("owner-listing") } });
    expect(listing.activeVideoGenerationId).toBeNull(); expect(listing.pendingVideoGenerationId).toBe(session.generation);
  });
  it("defers cancelled output cleanup beyond active processing and signed part authority", async () => {
    const { body: session } = await create("owner", body()).expect(201);
    await action(session.sessionId, "complete").expect(200);
    const row = await db.videoUploadSession.findUniqueOrThrow({ where: { id: session.sessionId } });
    const leaseExpiry = new Date("2026-10-17T12:20:00Z");
    await db.videoProcessWork.update({ where: { generationId: row.id }, data: { state: "PROCESSING", leaseToken: suite.id("worker-lease"), leaseExpiresAt: leaseExpiry } });
    const key = `video/v1/${row.uploadId}/${row.id}/master.m3u8`;
    await db.videoGeneration.update({ where: { id: row.id }, data: { manifest: { assets: [{ key }] } } });
    await db.videoCleanupWork.create({ data: { id: `session:${row.id}`, sessionId: row.id, generationId: row.id, uploadId: row.uploadId, sourceKey: row.sourceKey, storageUploadId: row.storageUploadId, objectKeys: [key], state: "HELD" } });
    await request.delete(`/api/v1/listing-video-upload-sessions/${row.id}`).set("authorization", `Bearer ${token("owner")}`).expect(202);
    const cleanup = await db.videoCleanupWork.findUniqueOrThrow({ where: { id: `session:${row.id}` } });
    expect(cleanup).toMatchObject({ state: "PENDING", objectKeys: [key], nextAttemptAt: new Date("2026-10-17T12:22:00Z") });
    expect(await db.videoProcessWork.findUniqueOrThrow({ where: { generationId: row.id } })).toMatchObject({ state: "CANCELLED", leaseExpiresAt: leaseExpiry });
  });
  it("rechecks business membership for every mutation", async () => {
    await db.dealership.create({ data: { id: businessId, name: "Synthetic video business", slug: suite.slugFor("business"), status: "active", admissionMode: "synthetic" } });
    await db.dealershipMember.create({ data: { userId: suite.id("owner"), dealershipId: businessId, role: "owner", status: "active" } });
    await db.listing.update({ where: { id: suite.id("owner-listing") }, data: { businessId } });
    await create("owner", body()).expect(404);
    const { body: session } = await create("owner", body(), true).expect(201);
    await db.dealershipMember.update({ where: { userId: suite.id("owner") }, data: { status: "suspended" } });
    await action(session.sessionId, "pause", true).expect(404);
  });
});
