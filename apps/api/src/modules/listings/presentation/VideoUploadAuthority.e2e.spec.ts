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
  const sid = (who: Person) => suite.id(`${who}-session`);
  const token = (who: Person, session = sid(who)) => jwt.sign({ sub: suite.id(who), sid: session, role: "buyer" });
  const create = (who: Person, body: object, business = false, session = sid(who)) => {
    const req = request.post("/api/v1/listings/video/sessions").set("authorization", `Bearer ${token(who, session)}`);
    if (business) req.set("x-business-id", businessId);
    return req.send(body);
  };
  const action = (id: string, verb: string, business = false) => {
    const req = request.patch(`/api/v1/listings/video/sessions/${id}/${verb}`).set("authorization", `Bearer ${token("owner")}`);
    if (business) req.set("x-business-id", businessId);
    return req;
  };
  async function cleanup() {
    if (!db) return;
    await db.videoUploadSession.deleteMany({ where: { userId: { in: people.map(p => suite.id(p)) } } });
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
    ] }).overrideProvider(IDENTITY_CLOCK_PORT).useValue({ now: () => time }).compile();
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
    time = epoch; await cleanup(); await seedSuiteCatalog(db, suite);
    for (const who of people) {
      await db.user.create({ data: { id: suite.id(who), phone: suite.phone(who), phoneVerifiedAt: epoch } });
      await db.session.create({ data: { id: sid(who), userId: suite.id(who), refreshTokenHash: suite.id(`${who}-refresh`), expiresAt: new Date("2026-11-17T12:00:00Z") } });
      await db.mediaUpload.create({ data: { id: suite.id(`${who}-upload`), userId: suite.id(who), key: `pending/${suite.id(`${who}-upload`)}/original.mp4`, kind: "video", contentType: "video/mp4", sizeBytes: 1000 } });
      await db.listing.create({ data: { id: suite.id(`${who}-listing`), sellerId: suite.id(who), status: "active", brandId: suite.catalog.brandId, modelId: suite.catalog.modelId, cityId: suite.catalog.cityId, priceAmount: 100000, priceCurrency: "TMT" } });
    }
  });
  const body = (listing = "owner-listing") => ({ uploadId: suite.id("owner-upload"), listingId: suite.id(listing) });
  it("does not claim an owned upload for another seller's Listing or accept a forged source key", async () => {
    await create("owner", body("other-listing")).expect(403);
    await create("owner", { ...body(), sourceKey: "forged.mp4" }).expect(400);
    const valid = await create("owner", body()).expect(201);
    expect(valid.body.sourceKey).toBe(`pending/${suite.id("owner-upload")}/original.mp4`);
  });
  it("has exactly seven days of recovery and refuses pause after expiry", async () => {
    const { body: session } = await create("owner", body()).expect(201);
    expect(session.expiresAt).toBe("2026-10-24T12:00:00.000Z");
    await action(session.id, "pause").expect(200);
    await action(session.id, "resume").expect(200);
    time = new Date("2026-10-24T12:00:00Z");
    await action(session.id, "pause").expect(409);
  });
  it("requires a live matching session even with a valid access JWT", async () => {
    await create("owner", body(), false, suite.id("missing-session")).expect(403);
    const { body: session } = await create("owner", body()).expect(201);
    await db.session.delete({ where: { id: sid("owner") } });
    await action(session.id, "pause").expect(403);
  });
  it("serializes two claims and permanently retires cancellation without allowing reuse", async () => {
    const attempts = await Promise.all([create("owner", body()), create("owner", body())]);
    expect(attempts.map(r => r.status).sort()).toEqual([201, 409]);
    const id = attempts.find(r => r.status === 201)!.body.id as string;
    expect((await action(id, "cancel").expect(200)).body.state).toBe("CLEANUP_PENDING");
    await create("owner", body()).expect(409);
    await action(id, "resume").expect(409);
    const work = await db.mediaUploadCleanup.findUniqueOrThrow({ where: { uploadId: suite.id("owner-upload") } });
    expect(work.status).toBe("LEGACY_PENDING");
  });
  it("rechecks current business membership instead of trusting upload creator identity", async () => {
    await db.dealership.create({ data: { id: businessId, name: "Synthetic video business", slug: suite.slugFor("business"), status: "active", admissionMode: "synthetic" } });
    await db.dealershipMember.create({ data: { userId: suite.id("owner"), dealershipId: businessId, role: "owner", status: "active" } });
    await db.mediaUpload.update({ where: { id: suite.id("owner-upload") }, data: { businessId } });
    await db.listing.update({ where: { id: suite.id("owner-listing") }, data: { businessId } });
    await create("owner", body()).expect(403);
    const { body: session } = await create("owner", body(), true).expect(201);
    await db.dealershipMember.update({ where: { userId: suite.id("owner") }, data: { status: "revoked" } });
    await action(session.id, "pause", true).expect(403);
  });
});
