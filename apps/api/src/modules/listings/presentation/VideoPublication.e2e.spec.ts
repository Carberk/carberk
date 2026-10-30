import "reflect-metadata";
import { randomUUID } from "node:crypto";

import { EventEmitterModule } from "@nestjs/event-emitter";
import { ConfigModule } from "@nestjs/config";
import { Reflector } from "@nestjs/core";
import { JwtModule, JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { PrismaService } from "@auto-tm/db";
import { DeleteObjectCommand, S3Client } from "@aws-sdk/client-s3";
import sharp from "sharp";
import supertest from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { IdentityModule } from "../../identity/identity.module";
import { ListingsModule } from "../listings.module";
import { JwtAuthGuard } from "../../../common/jwt-auth.guard";
import { GlobalErrorFilter } from "../../../common/error.filter";
import { EnvSchema } from "../../../env.schema";
import { bullTestRoot } from "../../../../test/helpers/bullTestRoot";
import { cleanSuiteFixtures, defineE2eSuite, seedSuiteCatalog } from "../../../../test/helpers/e2eSuite";

const suite = defineE2eSuite("video-publication-894");
const people = ["owner", "sales", "other"] as const;
type Person = typeof people[number];
const businessId = suite.id("business");
const now = new Date("2026-10-15T12:00:00Z");
/** Hosted disposable PostgreSQL + MinIO, real presign/PUT/Sharp/claim/HTTP paths. */
describe("draft video follows atomic photo publication (#894)", () => {
 let app: NestFastifyApplication; let request: ReturnType<typeof supertest>; let db: PrismaService; let jwt: JwtService; let s3: S3Client;
 const videoIds: string[] = [], videoUploads: string[] = [];
 let image: Buffer; const keys = new Set<string>();
 const sid = (who: Person) => suite.id(`${who}-session`);
 const token = (who: Person) => jwt.sign({ sub: suite.id(who), sid: sid(who), role: "buyer" });
 const auth = (req: ReturnType<ReturnType<typeof supertest>["get"]>, who: Person, business = true) => {
  req.set("authorization", `Bearer ${token(who)}`); if (business) req.set("x-business-id", businessId); return req;
 };
 const post = (path: string, who: Person, body = {}, business = true) => auth(request.post(`/api/v1${path}`), who, business).send(body);
 const get = (path: string, who: Person, business = true) => auth(request.get(`/api/v1${path}`), who, business);
 async function cleanup() {
  if (!db) return;
  await db.listing.updateMany({ where: { sellerId: { in: people.map(who => suite.id(who)) } }, data: { activeVideoGenerationId: null, pendingVideoGenerationId: null } });
  await db.videoGrant.deleteMany({ where: { generationId: { in: videoIds } } });
  await db.videoCleanupWork.deleteMany({ where: { uploadId: { in: videoUploads } } });
  await db.videoProcessWork.deleteMany({ where: { generationId: { in: videoIds } } });
  await db.videoGeneration.deleteMany({ where: { id: { in: videoIds } } });
  await db.videoUploadSession.deleteMany({ where: { id: { in: videoIds } } });
  await cleanSuiteFixtures(db, suite, { userAliases: people, extraPhones: [suite.phone("contact")] });
  await db.dealership.deleteMany({ where: { id: businessId } });
  for (const Key of keys) await s3.send(new DeleteObjectCommand({ Bucket: "listing-photos", Key }));
  keys.clear();
 }
 beforeAll(async () => {
  const endpoint = process.env["MINIO_ENDPOINT"] ?? "";
  if (process.env["GITHUB_ACTIONS"] !== "true" || !["localhost", "127.0.0.1"].includes(new URL(endpoint).hostname) || (process.env["SMS_DRIVER"] ?? "mock") !== "mock") throw new Error("Requires hosted disposable services and mock SMS");
  process.env["OTP_TEST_MODE"] = "true";
  s3 = new S3Client({ endpoint, region: process.env["MINIO_REGION"] ?? "us-east-1", forcePathStyle: true, requestChecksumCalculation: "WHEN_REQUIRED", credentials: { accessKeyId: process.env["MINIO_ACCESS_KEY"] ?? "minioadmin", secretAccessKey: process.env["MINIO_SECRET_KEY"] ?? "minioadmin" } });
  const module = await Test.createTestingModule({ imports: [EventEmitterModule.forRoot(), bullTestRoot(), ConfigModule.forRoot({ isGlobal: true, validate: cfg => EnvSchema.parse(cfg) }), IdentityModule, ListingsModule, JwtModule.register({ global: true, secret: "synthetic-video-publication-894" })] })
   .compile();
  app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter()); db = app.get(PrismaService); jwt = app.get(JwtService);
  app.useGlobalGuards(new JwtAuthGuard(app.get(Reflector), jwt)); app.useGlobalFilters(new GlobalErrorFilter());
  await app.listen(0, "127.0.0.1"); request = supertest(app.getHttpServer());
  image = await sharp({ create: { width: 80, height: 60, channels: 3, background: "#377080" } }).webp().toBuffer();
 });
 afterAll(async () => { await cleanup(); await app?.close(); s3?.destroy(); delete process.env["OTP_TEST_MODE"]; });
 beforeEach(async () => {
  await cleanup(); await seedSuiteCatalog(db, suite);
  for (const who of people) {
   await db.user.create({ data: { id: suite.id(who), phone: suite.phone(who), phoneVerifiedAt: now } });
   await db.session.create({ data: { id: sid(who), userId: suite.id(who), refreshTokenHash: suite.id(`${who}-refresh`), expiresAt: new Date(Date.now() + 86400000) } });
  }
  await db.dealership.create({ data: { id: businessId, name: "Synthetic inventory", slug: suite.slugFor("business"), status: "active", admissionMode: "synthetic", contactPhone: suite.phone("contact"), contactConfirmedAt: new Date() } });
  await db.dealershipMember.createMany({ data: (["owner", "sales"] as const).map(who => ({ dealershipId: businessId, userId: suite.id(who), role: who, status: "active" })) });
 });
 async function upload(who: Person = "sales") {
  const signed = (await post("/uploads/presign", who, { kind: "image", contentType: "image/webp", sizeBytes: image.length }).expect(201)).body as { uploadUrl: string; key: string };
  keys.add(signed.key); for (const size of ["thumbnail", "list", "detail", "fullscreen"]) keys.add(signed.key.replace("original.webp", `${size}.webp`));
  const put = await fetch(signed.uploadUrl, { method: "PUT", headers: { "content-type": "image/webp" }, body: new Uint8Array(image) }); expect(put.ok).toBe(true);
  return signed.key;
 }
 async function draft(who: Person = "sales") {
  const photos = await Promise.all([upload(who), upload(who), upload(who)]);
  const payload = { brandId: suite.catalog.brandId, modelId: suite.catalog.modelId, year: 2020, cityId: suite.catalog.cityId, regionId: suite.catalog.regionId, priceAmount: 100000, priceCurrency: "TMT", condition: "used", mileageKm: 1000, conditionDisclosure: { damaged: false }, description: "Synthetic permitted fixture", contactPhone: suite.phone("contact"), allowCalls: true, allowChat: true, photos: photos.map((key, sortOrder) => ({ photoId: suite.id(`photo-${sortOrder}`), key, sortOrder })) };
  return (await post("/listings/drafts", who, { initialPayload: payload }).expect(201)).body as { id: string; businessId: string };
 }
 async function video(draftId: string, state: "READY" | "PROCESSING" | "UPLOADING" | "FAILED") {
  const id = randomUUID(), uploadId = randomUUID(), completionFence = randomUUID(); videoIds.push(id); videoUploads.push(uploadId);
  const sourceKey = `video/v1/${uploadId}/${id}/source.mp4`;
  const ready = state === "READY", failed = state === "FAILED";
  await db.mediaUpload.create({ data: { id: uploadId, userId: suite.id("sales"), businessId, key: sourceKey, kind: "video", contentType: "video/mp4", sizeBytes: 1000, state: failed ? "RETIRED" : "PREPARING", writeProtocol: "video-v1", objectKeys: [sourceKey], claimTargetType: "video_session", claimTargetId: id, claimToken: failed ? null : id, claimDeadline: failed ? null : new Date(Date.now() + 86400000) } });
  await db.videoUploadSession.create({ data: { id, uploadId, userId: suite.id("sales"), protocolVersion: 1, targetKind: "draft", targetId: draftId, targetRevision: 2, state, sourceKey, sizeBytes: 1000, sha256: "a".repeat(64), posterMs: 0, completionFence, completedAt: state === "UPLOADING" ? null : new Date(), expiresAt: new Date(Date.now() + 86400000) } });
  const assets = [{ path: "master.m3u8", key: `video/v1/${uploadId}/${id}/master.m3u8`, sizeBytes: 100, sha256: "b".repeat(64), purpose: "playback", contentType: "application/vnd.apple.mpegurl" }, { path: "poster.jpg", key: `video/v1/${uploadId}/${id}/poster.jpg`, sizeBytes: 100, sha256: "c".repeat(64), purpose: "poster", contentType: "image/jpeg" }];
  await db.videoGeneration.create({ data: { id, sessionId: id, listingId: draftId, uploadId, targetRevision: 2, state: failed ? "RETIRED" : state, completionFence, processingVersion: "ffmpeg-debian-5.1.9-v1", ...(ready ? { manifest: { assets }, durationMs: 5000, posterKey: assets[1]!.key, readyAt: new Date(), sourceSha256: "a".repeat(64), sourceWidth: 960, sourceHeight: 540 } : {}) } });
  if (state === "PROCESSING") await db.videoProcessWork.create({ data: { generationId: id, uploadId, sessionId: id, completionFence, targetRevision: 2, processingVersion: "ffmpeg-debian-5.1.9-v1", state: "PROCESSING", attempts: 1, leaseToken: randomUUID(), leaseExpiresAt: new Date(Date.now() + 1200000) } });
  return { id, uploadId };
 }
 it("adopts a ready private draft video with the published Listing and all photos", async () => {
  const d = await draft(), row = await video(d.id, "READY");
  const car = (await post(`/listings/drafts/${d.id}/publish`, "sales").expect(201)).body;
  expect(await db.listing.findUniqueOrThrow({ where: { id: car.id } })).toMatchObject({ activeVideoGenerationId: row.id, pendingVideoGenerationId: null, activeVideoRevision: 2 });
  expect(await db.mediaUpload.findUniqueOrThrow({ where: { id: row.uploadId } })).toMatchObject({ state: "ADOPTED", claimTargetType: "listing", claimTargetId: car.id, claimToken: null, claimDeadline: null });
  expect(await db.videoUploadSession.findUniqueOrThrow({ where: { id: row.id } })).toMatchObject({ targetKind: "listing", targetId: car.id, listingId: car.id });
  expect((await db.videoGeneration.findUniqueOrThrow({ where: { id: row.id } })).listingId).toBe(car.id);
  expect(await db.listingMedia.count({ where: { listingId: car.id, kind: "image" } })).toBe(3);
  expect(await db.listingDraft.findUnique({ where: { id: d.id } })).toBeNull();
 });
 it.each(["PROCESSING", "UPLOADING"] as const)("rebinds %s draft video without blocking photo publication or replacing its attempt", async state => {
  const d = await draft(), row = await video(d.id, state);
  const before = await db.videoProcessWork.findUnique({ where: { generationId: row.id } });
  const car = (await post(`/listings/drafts/${d.id}/publish`, "sales").expect(201)).body;
  expect(await db.listing.findUniqueOrThrow({ where: { id: car.id } })).toMatchObject({ activeVideoGenerationId: null, pendingVideoGenerationId: row.id, activeVideoRevision: 2 });
  expect(await db.videoUploadSession.findUniqueOrThrow({ where: { id: row.id } })).toMatchObject({ targetKind: "listing", targetId: car.id, listingId: car.id, state });
  expect((await db.videoGeneration.findUniqueOrThrow({ where: { id: row.id } })).listingId).toBe(car.id);
  expect(await db.videoProcessWork.findUnique({ where: { generationId: row.id } })).toEqual(before);
  expect((await db.mediaUpload.findUniqueOrThrow({ where: { id: row.uploadId } })).state).toBe("PREPARING");
 });
 it("publishes photos when the optional draft video has failed", async () => {
  const d = await draft(); await video(d.id, "FAILED");
  const car = (await post(`/listings/drafts/${d.id}/publish`, "sales").expect(201)).body;
  expect(await db.listing.findUniqueOrThrow({ where: { id: car.id } })).toMatchObject({ activeVideoGenerationId: null, pendingVideoGenerationId: null });
  expect(await db.listingMedia.count({ where: { listingId: car.id } })).toBe(3);
 });
});
