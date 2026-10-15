import "reflect-metadata";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { ConfigModule, ConfigService } from "@nestjs/config";
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
import { IMAGE_VARIANT_GENERATOR } from "../domain/ports/ImageVariantGenerator";
import { SharpImageVariantGenerator } from "../infrastructure/SharpImageVariantGenerator";
import { JwtAuthGuard } from "../../../common/jwt-auth.guard";
import { GlobalErrorFilter } from "../../../common/error.filter";
import { EnvSchema, type Env } from "../../../env.schema";
import { bullTestRoot } from "../../../../test/helpers/bullTestRoot";
import { cleanSuiteFixtures, defineE2eSuite, seedSuiteCatalog } from "../../../../test/helpers/e2eSuite";

const suite = defineE2eSuite("business-inventory-908");
const people = ["owner", "sales", "other"] as const;
type Person = typeof people[number];
const businessId = suite.id("business");
const now = new Date("2026-10-15T12:00:00Z");
/** Hosted disposable PostgreSQL + MinIO, real presign/PUT/Sharp/claim/HTTP paths. */
describe("business inventory and media preserve shared current ownership (#908)", () => {
 let app: NestFastifyApplication; let request: ReturnType<typeof supertest>; let db: PrismaService; let jwt: JwtService; let s3: S3Client;
 let image: Buffer; let hook: (() => Promise<void>) | undefined; const keys = new Set<string>();
 const sid = (who: Person) => suite.id(`${who}-session`);
 const token = (who: Person) => jwt.sign({ sub: suite.id(who), sid: sid(who), role: "buyer" });
 const auth = (req: ReturnType<ReturnType<typeof supertest>["get"]>, who: Person, business = true) => {
  req.set("authorization", `Bearer ${token(who)}`); if (business) req.set("x-business-id", businessId); return req;
 };
 const post = (path: string, who: Person, body = {}, business = true) => auth(request.post(`/api/v1${path}`), who, business).send(body);
 const get = (path: string, who: Person, business = true) => auth(request.get(`/api/v1${path}`), who, business);
 async function cleanup() {
  hook = undefined;
  if (!db) return;
  await cleanSuiteFixtures(db, suite, { userAliases: people, extraPhones: [suite.phone("contact")] });
  await db.dealership.deleteMany({ where: { id: businessId } });
  for (const Key of keys) await s3.send(new DeleteObjectCommand({ Bucket: "listing-photos", Key }));
  keys.clear();
 }
 beforeAll(async () => {
  const endpoint = process.env["MINIO_ENDPOINT"] ?? "";
  if (process.env["GITHUB_ACTIONS"] !== "true" || !["localhost", "127.0.0.1"].includes(new URL(endpoint).hostname) || (process.env["SMS_DRIVER"] ?? "mock") !== "mock") throw new Error("Requires hosted disposable services and mock SMS");
  process.env["OTP_TEST_MODE"] = "true";
  process.env["LISTING_VIEWS_ENABLED"] = "true";
  process.env["LISTING_VIEW_SALT_SECRET"] = "synthetic-inventory-view-salt-secret-908";
  s3 = new S3Client({ endpoint, region: process.env["MINIO_REGION"] ?? "us-east-1", forcePathStyle: true, requestChecksumCalculation: "WHEN_REQUIRED", credentials: { accessKeyId: process.env["MINIO_ACCESS_KEY"] ?? "minioadmin", secretAccessKey: process.env["MINIO_SECRET_KEY"] ?? "minioadmin" } });
  const module = await Test.createTestingModule({ imports: [EventEmitterModule.forRoot(), bullTestRoot(), ConfigModule.forRoot({ isGlobal: true, validate: cfg => EnvSchema.parse(cfg) }), IdentityModule, ListingsModule, JwtModule.register({ global: true, secret: "synthetic-inventory-http-908" })] })
   .overrideProvider(IMAGE_VARIANT_GENERATOR).useFactory({ inject: [ConfigService], factory: (config: ConfigService<Env, true>) => {
    const realStorage = new SharpImageVariantGenerator(config);
    return { generate: async (...args: Parameters<typeof realStorage.generate>) => { await hook?.(); return realStorage.generate(...args); } };
   } }).compile();
  app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter()); db = app.get(PrismaService); jwt = app.get(JwtService);
  app.useGlobalGuards(new JwtAuthGuard(app.get(Reflector), jwt)); app.useGlobalFilters(new GlobalErrorFilter());
  await app.listen(0, "127.0.0.1"); request = supertest(app.getHttpServer());
  image = await sharp({ create: { width: 80, height: 60, channels: 3, background: "#377080" } }).webp().toBuffer();
 });
 afterAll(async () => { await cleanup(); await app?.close(); s3?.destroy(); delete process.env["OTP_TEST_MODE"]; delete process.env["LISTING_VIEWS_ENABLED"]; delete process.env["LISTING_VIEW_SALT_SECRET"]; });
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
 const inventory = () => get(`/businesses/${businessId}/inventory`, "owner");
 async function publish() { const d = await draft(); return (await post(`/listings/drafts/${d.id}/publish`, "sales").expect(201)).body as { id: string }; }
 const barrier = () => {
  let enter!: () => void; let release!: () => void;
  const entered = new Promise<void>(r => { enter = r; }); const wait = new Promise<void>(r => { release = r; });
  hook = async () => { enter(); await wait; };
  return { entered: Promise.race([entered, new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Preparation never reached storage")), 10000))]), release };
 };
 it("shares business drafts across members while personal context and mismatched headers remain separate", async () => {
  const d = (await post("/listings/drafts", "owner", {}).expect(201)).body;
  await auth(request.patch(`/api/v1/listings/drafts/${d.id}`), "sales").send({ description: "Business edit by Sales" }).expect(200);
  await auth(request.patch(`/api/v1/listings/drafts/${d.id}`), "other").send({ description: "Refused" }).expect(403);
  const personal = (await post("/listings/drafts", "owner", {}, false).expect(201)).body;
  await auth(request.patch(`/api/v1/listings/drafts/${personal.id}`), "sales").send({}).expect(404);
  await post("/listings/drafts", "owner", { businessId: suite.id("wrong") }).expect(400);
  const stock = (await inventory().expect(200)).body;
  expect(stock.counts).toMatchObject({ drafts: 1, active: 0 }); expect(stock.drafts[0].payload.description).toBe("Business edit by Sales");
  expect((await get("/me/drafts", "owner", false).expect(200)).body.items.map((r: { id: string }) => r.id)).toEqual([personal.id]);
 });
 it("requires Owner purpose-bound business proof and lets Sales reuse only that number", async () => {
  await db.dealership.update({ where: { id: businessId }, data: { contactPhone: null, contactConfirmedAt: null } });
  await post("/me/contact-phones/request", "sales", { phone: suite.phone("contact") }).expect(403);
  const personal = (await post("/me/contact-phones/request", "owner", { phone: suite.phone("contact") }, false).expect(200)).body;
  await post("/me/contact-phones/verify", "owner", { phone: suite.phone("contact"), code: personal.testCode }).expect(400);
  // A separate contact number avoids the shared resend budget from the personal proof above.
  const ownerPhone = suite.phone("owner");
  const sent = (await post("/me/contact-phones/request", "owner", { phone: ownerPhone }).expect(200)).body;
  expect(sent.status).toBe("code_sent");
  await post("/me/contact-phones/verify", "owner", { phone: ownerPhone, code: sent.testCode }).expect(200);
  expect((await get("/me/contact-phones", "sales").expect(200)).body.items[0].phone).toBe(ownerPhone);
  expect((await db.user.findUniqueOrThrow({ where: { id: suite.id("sales") } })).phone).toBe(suite.phone("sales"));
 });
 it("publishes shared real storage, excludes current business members from views and confirms availability without republishing", async () => {
  const car = await publish(); const before = await db.listing.findUniqueOrThrow({ where: { id: car.id } });
  expect(before).toMatchObject({ businessId, sellerId: suite.id("sales"), lastEditedById: suite.id("sales"), status: "active" });
  await db.listing.update({ where: { id: car.id }, data: { availabilityConfirmedAt: new Date(Date.now() - 8 * 86400000) } });
  expect((await inventory().expect(200)).body.counts).toMatchObject({ active: 1, drafts: 0, reviewDue: 1 });
  await post(`/businesses/${businessId}/inventory/${car.id}/confirm-availability`, "owner").expect(200);
  const after = await db.listing.findUniqueOrThrow({ where: { id: car.id } }); expect(after.publishedAt).toEqual(before.publishedAt); expect(after.status).toBe("active");
  await post(`/listings/${car.id}/views`, "owner").expect(204); await post(`/listings/${car.id}/views`, "sales").expect(204);
  expect((await db.listing.findUniqueOrThrow({ where: { id: car.id } })).viewCount).toBe(0);
  await post(`/listings/${car.id}/views`, "other").expect(204); expect((await db.listing.findUniqueOrThrow({ where: { id: car.id } })).viewCount).toBe(1);
 });
 it("revocation during image preparation refuses the final publication and preserves the business draft and reusable assets", async () => {
  const d = await draft(); const gate = barrier();
  const pending = post(`/listings/drafts/${d.id}/publish`, "sales").then(r => r);
  try { await gate.entered; await post(`/business/${businessId}/members`, "owner", { targetUserId: suite.id("sales"), action: "remove" }).expect(201); }
  finally { hook = undefined; gate.release(); }
  expect((await pending).status).toBe(403);
  expect((await inventory().expect(200)).body.counts).toMatchObject({ drafts: 1, active: 0 });
  expect(await db.mediaUpload.count({ where: { businessId, state: "AVAILABLE" } })).toBe(3);
  const car = (await post(`/listings/drafts/${d.id}/publish`, "owner").expect(201)).body;
  expect((await db.listing.findUniqueOrThrow({ where: { id: car.id } })).businessId).toBe(businessId);
 });
 it("revocation after media reservation refuses adoption without destroying the business stock", async () => {
  const car = await publish(); const key = await upload(); const gate = barrier();
  const pending = post(`/listings/${car.id}/media/attach`, "sales", { key, kind: "image", sortOrder: 3 }).then(r => r);
  try { await gate.entered; await post(`/business/${businessId}/members`, "owner", { targetUserId: suite.id("sales"), action: "remove" }).expect(201); }
  finally { hook = undefined; gate.release(); }
  expect((await pending).status).toBe(403); expect(await db.listingMedia.count({ where: { listingId: car.id } })).toBe(3);
  expect((await get(`/listings/${car.id}`, "owner").expect(200)).body.contactPhone).toBe(suite.phone("contact"));
 });
 it("business suspension hides public inventory and contact, retains authorized history and never clears moderation", async () => {
  const car = await publish();
  await db.dealership.update({ where: { id: businessId }, data: { status: "suspended" } });
  await get(`/listings/${car.id}`, "other", false).expect(404); await post(`/listings/${car.id}/sold`, "sales").expect(403);
  expect((await inventory().expect(200)).body.counts.active).toBe(1);
  await db.listing.update({ where: { id: car.id }, data: { status: "banned" } });
  await db.dealership.update({ where: { id: businessId }, data: { status: "active" } });
  expect((await inventory().expect(200)).body.counts.banned).toBe(1); await get(`/listings/${car.id}`, "other", false).expect(404);
 });
 it("creator account deletion and restoration preserve business stock, contact and media while personal stock follows its lifecycle", async () => {
  const car = await publish(); const original = await db.listing.findUniqueOrThrow({ where: { id: car.id } });
  const personal = await db.listing.create({ data: { id: suite.id("personal"), sellerId: suite.id("sales"), brandId: suite.catalog.brandId, modelId: suite.catalog.modelId, cityId: suite.catalog.cityId, priceAmount: 10, status: "active", publishedAt: new Date() } });
  const sent = (await request.post("/api/v1/account-deletion/request").send({ phone: suite.phone("sales") }).expect(201)).body;
  await request.post("/api/v1/account-deletion/confirm").send({ phone: suite.phone("sales"), code: sent.testCode }).expect(204);
  expect((await db.listing.findUniqueOrThrow({ where: { id: car.id } }))).toMatchObject({ status: "active", contactPhone: original.contactPhone, publishedAt: original.publishedAt });
  expect(await db.listingMedia.count({ where: { listingId: car.id } })).toBe(3);
  expect((await db.listing.findUniqueOrThrow({ where: { id: personal.id } })).status).toBe("archived");
  await db.session.create({ data: { id: sid("sales"), userId: suite.id("sales"), refreshTokenHash: suite.id("restored-refresh"), expiresAt: new Date(Date.now() + 86400000) } });
  await post("/me/restore", "sales", {}, false).expect(200);
  expect((await db.listing.findUniqueOrThrow({ where: { id: car.id } }))).toMatchObject({ status: "active", contactPhone: original.contactPhone, publishedAt: original.publishedAt });
  expect((await db.listing.findUniqueOrThrow({ where: { id: personal.id } })).status).toBe("active");
  await post(`/listings/${car.id}/sold`, "sales").expect(403);
 });
});
