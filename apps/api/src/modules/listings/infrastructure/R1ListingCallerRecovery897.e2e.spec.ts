import { randomUUID } from "node:crypto";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaService, type Prisma } from "@auto-tm/db";
import { cleanSuiteFixtures, defineE2eSuite, seedSuiteCatalog } from "../../../../test/helpers/e2eSuite";
import { configuredIdentityTestPorts } from "../../../common/application/testing/ConfiguredIdentityTestPorts";
import { PrismaMeasurementCommit } from "../../measurement/infrastructure/PrismaMeasurementCommit";
import { PrismaConversationRepository } from "../../conversations/infrastructure/PrismaConversationRepository";
import { Conversation } from "../../conversations/domain/Conversation";
import { Message } from "../../conversations/domain/Message";
import { BanListing } from "../../admin/application/BanListing";
import { UnbanListing } from "../../admin/application/UnbanListing";
import { SuspendUser } from "../../admin/application/SuspendUser";
import { UnsuspendUser } from "../../admin/application/UnsuspendUser";
import { PrismaAuditLogRepository } from "../../admin/infrastructure/PrismaAuditLogRepository";
import { PrismaContentReportRepository } from "../../admin/infrastructure/PrismaContentReportRepository";
import { PublishListing } from "../application/PublishListing";
import { UploadAdoptionGuard } from "../application/UploadAdoptionGuard";
import { ContactPhonePolicy } from "../domain/ContactPhonePolicy";
import { Listing } from "../domain/Listing";
import { PrismaListingRepository } from "./PrismaListingRepository";
import { PrismaListingDraftRepository } from "./PrismaListingDraftRepository";
import { PrismaMediaUploadRepository } from "./PrismaMediaUploadRepository";
import { PrismaUploadClaims } from "./PrismaUploadClaims";
import { PrismaVerifiedContactPhoneRepository } from "./PrismaVerifiedContactPhoneRepository";
import { PrismaExchangeRateRepository } from "./PrismaExchangeRateRepository";
import { PrismaListingsAdminRepository } from "./PrismaListingsAdminRepository";
import { PrismaListingsReadRepository } from "./PrismaListingsReadRepository";
import { EventEmitterListingEventPublisher } from "./EventEmitterListingEventPublisher";

// Authored only. No production caller is wrapped in test-owned preparation.
// Object inspection and byte conversion are the only non-database media fakes.
// Source guard/profile activation and running this suite belong to the parent.
const suite = defineE2eSuite("r1-listing-caller-recovery-897-20261025");
const id = (alias: string) => suite.id(alias);
const seller = id("seller"), buyer = id("buyer"), admin = id("admin"), foreign = id("foreign");
const epoch = id("epoch"), now = new Date("2026-10-25T07:00:00.000Z");
const clock = { now: () => now };

describe("R1 actual Listing/publication/admin/conversation PostgreSQL outcomes", () => {
 let db: PrismaService, capture: PrismaMeasurementCommit;
 let identity: Awaited<ReturnType<typeof configuredIdentityTestPorts>>;
 async function cleanup() {
  if (!db) return;
  await db.videoGeneration.deleteMany({ where: { userId: undefined, uploadId: id("video-upload") } } as never);
  await db.videoUploadSession.deleteMany({ where: { userId: { in: [seller, foreign] } } });
  await db.measurementPrincipal.deleteMany({ where: { epoch } });
  await db.measurementState.deleteMany({ where: { key: "collector", epoch } });
  await cleanSuiteFixtures(db, suite, { userAliases: ["seller", "buyer", "admin", "foreign"] });
 }
 beforeAll(async () => {
  db = new PrismaService(); await db.$connect(); identity = await configuredIdentityTestPorts(db);
  capture = new PrismaMeasurementCommit({ enabled: true, environment: "test", purposes: ["product_improvement"], evidenceRef: "authored-r1-caller-recovery-897", realCollectionApproved: false }, epoch, () => now);
 });
 beforeEach(async () => {
  await cleanup(); await seedSuiteCatalog(db, suite);
  for (const alias of ["seller", "buyer", "admin", "foreign"]) {
   const userId = id(alias);
   await db.user.create({ data: { id: userId, phone: suite.phone(alias), phoneVerifiedAt: now, role: alias === "admin" ? "admin" : "seller" } });
   await db.measurementPrincipal.create({ data: { id: id(`${alias}-principal`), userId, epoch, generation: id(`${alias}-generation`), pseudonym: randomUUID().replaceAll("-", "").repeat(2), kind: "account" } });
  }
  await db.measurementState.create({ data: { key: "collector", epoch } });
 });
 afterAll(async () => { await cleanup(); await identity.module.close(); await db.$disconnect(); });
 async function noReceipts() { expect(await db.$queryRaw`SELECT id FROM public.diagnostic_source_commands`).toEqual([]); }
 async function listing() {
  const c = suite.catalog;
  return new PrismaListingRepository(db).save(Listing.create({ id: id("listing"), publicNumber: 0, sellerId: seller, status: "active", brandId: c.brandId, modelId: c.modelId, year: 2020, vin: "WVWZZZ1JZXW000001", cityId: c.cityId, regionId: c.regionId, priceAmount: 1000, priceCurrency: "TMT", contactPhone: suite.phone("seller"), allowCalls: true, allowChat: true, publishedAt: now, createdAt: now, updatedAt: now }));
 }
 function moderation(client = db) {
  const read = new PrismaListingsReadRepository(client, new PrismaExchangeRateRepository(client));
  const listings = new PrismaListingsAdminRepository(client, capture), audits = new PrismaAuditLogRepository(client), reports = new PrismaContentReportRepository(client);
  return { ban: new BanListing(client, read, listings, reports, audits), unban: new UnbanListing(client, read, listings, audits),
   suspend: new SuspendUser(client, identity.read, identity.admin, reports, audits, new PrismaConversationRepository(client)),
   unsuspend: new UnsuspendUser(client, identity.read, identity.admin, audits) };
 }
 async function outbox(userId = seller) { return db.measurementOutbox.findMany({ where: { principalId: id(`${userId === seller ? "seller" : "foreign"}-principal`) } }); }
 async function preparePublication(video: "none" | "ready" | "pending" = "none") {
  const photos = [1, 2, 3].map(n => ({ photoId: id(`photo-${n}`), key: `${suite.slug}/${n}/original.webp`, sortOrder: n - 1 }));
  for (const [n, photo] of photos.entries()) await db.mediaUpload.create({ data: { id: id(`upload-${n}`), userId: seller, key: photo.key, kind: "image", contentType: "image/webp", sizeBytes: 1024, state: "AVAILABLE" } });
  await db.listingDraft.create({ data: { id: id("draft"), userId: seller, payload: { brandId: suite.catalog.brandId, modelId: suite.catalog.modelId, cityId: suite.catalog.cityId, regionId: suite.catalog.regionId, year: 2020, vin: "WVWZZZ1JZXW000001", priceAmount: 1000, priceCurrency: "TMT", contactPhone: suite.phone("seller"), condition: "used", mileageKm: 1000, description: "Checked test car", allowCalls: true, allowChat: true, conditionDisclosure: { damaged: false }, photos } } });
  if (video !== "none") {
   const sourceKey = `video/v1/${id("video-upload")}/${id("video")}/source.mp4`;
   await db.mediaUpload.create({ data: { id: id("video-upload"), userId: seller, key: sourceKey, kind: "video", contentType: "video/mp4", sizeBytes: 1024, writeProtocol: "video-v1", state: "PREPARING", claimToken: id("video"), claimTargetType: "video_session", claimTargetId: id("video") } });
   await db.videoUploadSession.create({ data: { id: id("video"), userId: seller, uploadId: id("video-upload"), sourceKey, protocolVersion: 1, targetKind: "draft", targetId: id("draft"), targetRevision: 1, state: video === "ready" ? "READY" : "PROCESSING", expiresAt: new Date("2026-11-01T00:00:00Z") } });
   await db.videoGeneration.create({ data: { id: id("video"), sessionId: id("video"), uploadId: id("video-upload"), listingId: id("draft"), targetRevision: 1, state: video === "ready" ? "READY" : "PROCESSING", ...(video === "ready" ? { readyAt: now, durationMs: 1000, posterKey: `video/v1/${id("video-upload")}/${id("video")}/poster.jpg`, manifest: { version: 1 } } : {}) } });
  }
 }
 function publisher(client = db) {
  const uploads = new PrismaMediaUploadRepository(client);
  const objects = { inspect: async () => ({ contentType: "image/webp", sizeBytes: 1024 }) };
  const generator = { generate: async (key: string) => ({ variants: { thumbnail: key, list: key, detail: key, fullscreen: key }, thumbHash: "1fsDBYCIiIiHiIdweIeHh4d4cIgH" }) };
  return new PublishListing(new PrismaListingDraftRepository(client), client, new PrismaExchangeRateRepository(client), new EventEmitterListingEventPublisher(new EventEmitter2()), generator,
   new UploadAdoptionGuard(uploads, objects), new ContactPhonePolicy(identity.check, new PrismaVerifiedContactPhoneRepository(client)), clock, new PrismaUploadClaims(client, clock), undefined, capture);
 }
 it.each(["none", "ready", "pending"] as const)("publishes the real draft/photos with %s video and exact persisted source defaults", async video => {
  await preparePublication(video); const { listing: published } = await publisher().execute({ userId: seller, draftId: id("draft") });
  const stored = await db.listing.findUniqueOrThrow({ where: { id: published.id } });
  expect(stored).toMatchObject({ sellerId: seller, status: "active", contactPhone: suite.phone("seller"), archivedByDeletion: false, activeVideoRevision: video === "ready" ? 1 : 0,
   activeVideoGenerationId: video === "ready" ? id("video") : null, pendingVideoGenerationId: video === "pending" ? id("video") : null });
  expect(await db.listingMedia.count({ where: { listingId: published.id } })).toBe(3);
  expect(await db.mediaUpload.count({ where: { userId: seller, kind: "image", state: "ADOPTED", claimTargetId: published.id } })).toBe(3);
  expect(await db.listingDraft.findUnique({ where: { id: id("draft") } })).toBeNull();
  expect(await db.auditLog.count({ where: { targetId: published.id, action: "listing.published" } })).toBe(1);
  expect((await outbox()).map(row => (row.event as { eventName: string }).eventName).sort()).toEqual(["listing_published", "listing_visibility_changed"]);
  expect(await outbox(foreign)).toEqual([]); await noReceipts();
 });
 it("rolls back complete publication after source work, releases photos and permits a legitimate retry", async () => {
  await preparePublication();
  const failing = new Proxy(db, { get(target, key) {
   if (key === "$transaction") return (work: (tx: Prisma.TransactionClient) => Promise<unknown>) => db.$transaction(async tx => {
    const result = await work(tx); if (await tx.listing.count({ where: { sellerId: seller } })) throw new Error("R1 publication failure"); return result;
   });
   const value = Reflect.get(target, key); return typeof value === "function" ? value.bind(target) : value;
  } });
  await expect(publisher(failing).execute({ userId: seller, draftId: id("draft") })).rejects.toThrow("R1 publication failure");
  expect(await db.listing.count({ where: { sellerId: seller } })).toBe(0);
  expect(await db.listingMedia.count({ where: { upload: { userId: seller } } })).toBe(0);
  expect(await db.mediaUpload.count({ where: { userId: seller, state: "AVAILABLE" } })).toBe(3);
  expect(await db.auditLog.count({ where: { actorId: seller } })).toBe(0); expect(await outbox()).toEqual([]);
  expect(await db.listingDraft.findUnique({ where: { id: id("draft") } })).not.toBeNull(); await noReceipts();
  await publisher().execute({ userId: seller, draftId: id("draft") }); expect(await db.listing.count({ where: { sellerId: seller } })).toBe(1);
 });
 it("save/update/delete retain the complete contact/video/deletion projection and the first publication date", async () => {
  await listing(); const repo = new PrismaListingRepository(db, undefined, undefined, clock, capture);
  const original = await repo.findById(id("listing")); expect(original).not.toBeNull();
  await repo.update(original!.archive()); await repo.softDelete(id("listing"), now);
  expect(await db.listing.findUnique({ where: { id: id("listing") } })).toMatchObject({ status: "archived", deletedAt: now, contactPhone: suite.phone("seller"), activeVideoGenerationId: null, pendingVideoGenerationId: null, activeVideoRevision: 0, archivedByDeletion: false, publishedAt: now });
  expect(await outbox()).toHaveLength(1); await noReceipts();
 });
 it("outer ban/unban preserve report/audit/outbox atomicity and reject supplied transactions without a receipt", async () => {
  await listing(); await db.contentReport.create({ data: { id: id("report"), reporterUserId: buyer, targetType: "listing", targetId: id("listing"), reason: "spam" } });
  const actions = moderation(); const input = { listingId: id("listing"), adminUserId: admin, reason: "Reviewed report" };
  await actions.ban.execute({ ...input, reportId: id("report") }); await actions.unban.execute(input);
  expect(await db.contentReport.findUnique({ where: { id: id("report") } })).toMatchObject({ status: "actioned", reviewedById: admin });
  expect(await db.auditLog.findMany({ where: { targetId: id("listing") } })).toEqual(expect.arrayContaining([expect.objectContaining({ action: "LISTING_BAN", details: expect.objectContaining({ reportId: id("report"), before: { status: "active", reportStatus: "pending" } }) }), expect.objectContaining({ action: "LISTING_UNBAN" })]));
  expect(await outbox()).toHaveLength(2);
  await expect(db.$transaction(tx => new PrismaListingsAdminRepository(db).banActiveListing(id("listing"), tx))).rejects.toThrow("diagnostic_source_receipt_required"); await noReceipts();
 });
 it("outer suspend/unsuspend revoke only actual target Sessions and retain report and exact audits", async () => {
  for (const userId of [seller, foreign]) await db.session.create({ data: { id: randomUUID(), userId, refreshTokenHash: randomUUID(), expiresAt: new Date("2026-11-01T00:00:00Z") } });
  await db.contentReport.create({ data: { id: id("report"), reporterUserId: buyer, targetType: "user", targetId: seller, reason: "spam" } });
  const actions = moderation(); const result = await actions.suspend.execute({ userId: seller, adminUserId: admin, reason: "Spam", reportId: id("report") });
  expect(await db.session.count({ where: { userId: seller } })).toBe(0); expect(await db.session.count({ where: { userId: foreign } })).toBe(1);
  await actions.unsuspend.execute({ userId: seller, adminUserId: admin, reason: "Cleared" });
  expect(await db.user.findUnique({ where: { id: seller } })).toMatchObject({ suspendedAt: null, suspendedById: null, suspensionReason: null });
  expect(await db.auditLog.findMany({ where: { targetId: seller } })).toEqual(expect.arrayContaining([expect.objectContaining({ id: result.auditLogId, action: "USER_SUSPEND" }), expect.objectContaining({ action: "USER_UNSUSPEND", details: expect.objectContaining({ before: { suspendedAt: result.targetState.suspendedAt.toISOString(), suspendedById: admin, suspensionReason: "Spam" }, after: { suspendedAt: null, suspendedById: null, suspensionReason: null } }) })])); await noReceipts();
 });
 it("personal conversation/message outcomes suppress scheduled-User capture and retain foreign principals", async () => {
  await listing(); const repo = new PrismaConversationRepository(db, undefined, capture);
  await db.user.update({ where: { id: buyer }, data: { deletionScheduledAt: now } });
  await repo.save(Conversation.create({ id: id("conversation"), listingId: id("listing"), buyerId: buyer, sellerId: seller, createdAt: now }));
  await repo.saveMessage(Message.createText({ id: id("message"), conversationId: id("conversation"), senderId: buyer, text: "PRIVATE", createdAt: now }));
  expect(await repo.findMessageById(id("message"))).toMatchObject({ body: "PRIVATE" });
  expect(await db.measurementOutbox.count({ where: { principalId: id("buyer-principal") } })).toBe(0);
  expect(await db.measurementPrincipal.findUnique({ where: { id: id("foreign-principal") } })).not.toBeNull(); await noReceipts();
 });
});
