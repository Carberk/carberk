import "reflect-metadata";
import { createHash, randomUUID } from "node:crypto";

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { Test, type TestingModule } from "@nestjs/testing";
import { ConfigModule } from "@nestjs/config";
import { Reflector } from "@nestjs/core";
import { JwtModule, JwtService } from "@nestjs/jwt";
import { EventEmitterModule } from "@nestjs/event-emitter";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import supertest from "supertest";
import { hash } from "bcryptjs";
import { AdminSchemas } from "@auto-tm/contracts";
import { PrismaService, Prisma } from "@auto-tm/db";

import { AdminModule } from "../admin.module";
import { IdentityModule } from "../../identity/identity.module";
import { ListingsModule } from "../../listings/listings.module";
import { GlobalErrorFilter } from "../../../common/error.filter";
import { JwtAuthGuard } from "../../../common/jwt-auth.guard";
import { EnvSchema } from "../../../env.schema";
import { mintUserJwt } from "../../../../test/helpers/mintUserJwt";
import { mintAdminJwt } from "../../../../test/helpers/mintAdminJwt";
import {
  cleanSuiteFixtures,
  defineE2eSuite,
  seedSuiteCatalog,
} from "../../../../test/helpers/e2eSuite";
import { bullTestRoot } from "../../../../test/helpers/bullTestRoot";

const suite = defineE2eSuite("admin-moderation-controller");
type SuiteUser =
  | "reporter-one"
  | "seller-one"
  | "admin-one"
  | "reporter-two"
  | "seller-two"
  | "admin-two"
  | "photo-owner"
  | "photo-reporter"
  | "photo-admin";
const SUITE_USERS: readonly SuiteUser[] = [
  "reporter-one",
  "seller-one",
  "admin-one",
  "reporter-two",
  "seller-two",
  "admin-two",
  "photo-owner",
  "photo-reporter",
  "photo-admin",
];

describe("AdminModerationController e2e smoke", () => {
  let app: NestFastifyApplication;
  let request: ReturnType<typeof supertest>;
  let prisma: PrismaService;

  const reporterOneId = suite.id("reporter-one");
  const sellerOneId = suite.id("seller-one");
  const adminOneId = suite.id("admin-one");
  const reporterTwoId = suite.id("reporter-two");
  const sellerTwoId = suite.id("seller-two");
  const adminTwoId = suite.id("admin-two");

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        bullTestRoot(),
        ConfigModule.forRoot({ isGlobal: true, validate: (cfg) => EnvSchema.parse(cfg) }),
        EventEmitterModule.forRoot(),
        AdminModule,
        IdentityModule,
        ListingsModule,
        JwtModule.register({
          global: true,
          secret: process.env["JWT_ACCESS_SECRET"] ?? "dev-secret-change-me",
          signOptions: { expiresIn: "1h" },
        }),
      ],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    const reflector = app.get(Reflector);
    const jwtService = app.get(JwtService);
    app.useGlobalGuards(new JwtAuthGuard(reflector, jwtService));
    app.useGlobalFilters(new GlobalErrorFilter());
    await app.listen(0, "127.0.0.1");
    request = supertest(app.getHttpServer());
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await cleanSuiteFixtures(prisma, suite, { userAliases: SUITE_USERS });
    await app.close();
  });

  beforeEach(async () => {
    // TMT→TMT is a shared global singleton — seeded via upsert in
    // seedCatalog, never deleted (see e2eSuite helper).
    await cleanSuiteFixtures(prisma, suite, { userAliases: SUITE_USERS });
  });

  async function seedCatalog() {
    const catalog = await seedSuiteCatalog(prisma, suite);
    // TMT→TMT is a shared global singleton — upsert, never delete.
    await prisma.exchangeRate.upsert({
      where: { fromCurrency_toCurrency: { fromCurrency: "TMT", toCurrency: "TMT" } },
      create: { fromCurrency: "TMT", toCurrency: "TMT", rate: 1 },
      update: { rate: 1 },
    });
    return catalog;
  }

  async function createUser(alias: SuiteUser, role: "buyer" | "admin" = "buyer") {
    await prisma.user.create({
      data: { id: suite.id(alias), phone: suite.phone(alias), phoneVerifiedAt: new Date(), role },
    });
    return role === "admin" ? null : mintUserJwt(suite.id(alias));
  }

  async function createAdminSession(adminUserId: string) {
    const session = await prisma.session.create({
      data: {
        userId: adminUserId,
        refreshTokenHash: randomUUID(),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        adminTotpExpiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000),
      },
    });
    return mintAdminJwt(adminUserId, session.id);
  }

  it("confirms only current marketplace admins with current-session TOTP", async () => {
    await request.get("/api/v1/admin/authority").expect(401);
    await createUser("admin-one", "admin");
    await createUser("reporter-one");
    const token = await createAdminSession(adminOneId);
    await request.get("/api/v1/admin/authority").set("Authorization", `Bearer ${mintAdminJwt(adminOneId)}`).expect(403);
    await request.get("/api/v1/admin/authority").set("Authorization", `Bearer ${mintUserJwt(reporterOneId)}`).expect(403);
    const response = await request.get("/api/v1/admin/authority").set("Authorization", `Bearer ${token}`).expect(200);
    expect(response.body).toEqual({ marketplaceAdmin: true });
    await prisma.session.updateMany({ where: { userId: adminOneId }, data: { adminTotpExpiresAt: new Date(0) } });
    await request.get("/api/v1/admin/authority").set("Authorization", `Bearer ${token}`).expect(403);
    const elevatedAgain = await createAdminSession(adminOneId);
    await prisma.user.update({ where: { id: adminOneId }, data: { role: "buyer" } });
    await request.get("/api/v1/admin/authority").set("Authorization", `Bearer ${elevatedAgain}`).expect(403);
  });

  it("reads bounded marketplace context without sign-in/contact or private report artifacts", async () => {
    await createUser("admin-one", "admin");
    await createUser("seller-one");
    const token = await createAdminSession(adminOneId);
    const listing = await createActiveListing(sellerOneId);
    await prisma.listing.update({ where: { id: listing.id }, data: { contactPhone: "+99365123456", vin: "TESTVIN", description: "Read-only listing" } });
    const detail = await request.get(`/api/v1/admin/context/listings/${listing.id}`).set("Authorization", `Bearer ${token}`).expect(200);
    expect(detail.body).toMatchObject({ id: listing.id, vin: "TESTVIN", description: "Read-only listing", seller: { id: sellerOneId } });
    expect(JSON.stringify(detail.body)).not.toMatch(/contactPhone|refreshToken|phoneVerified|messageContext|reporterUserId/);
    const users = await request.get(`/api/v1/admin/context/users?q=${sellerOneId}`).set("Authorization", `Bearer ${token}`).expect(200);
    expect(users.body.items).toHaveLength(1);
    expect(Object.keys(users.body.items[0]).sort()).toEqual(["createdAt", "deletionScheduled", "displayName", "id", "nameNumber", "suspended"]);
    await request.get(`/api/v1/admin/context/listings?pageSize=500`).set("Authorization", `Bearer ${token}`).expect(400);
    await request.get(`/api/v1/admin/context/users/${sellerOneId}`).set("Authorization", `Bearer ${mintUserJwt(sellerOneId)}`).expect(403);
    await prisma.listing.update({ where: { id: listing.id }, data: { deletedAt: new Date() } });
    const deleted = await request.get(`/api/v1/admin/context/listings/${listing.id}`).set("Authorization", `Bearer ${token}`).expect(200);
    expect(deleted.body.deletedAt).not.toBeNull();
    await prisma.session.updateMany({ where: { userId: adminOneId }, data: { adminTotpExpiresAt: new Date(0) } });
    await request.get(`/api/v1/admin/context/users/${sellerOneId}`).set("Authorization", `Bearer ${token}`).expect(403);
  });

  async function createActiveListing(sellerId: string) {
    const catalog = await seedCatalog();
    const listing = await prisma.listing.create({
      data: {
        id: randomUUID(),
        sellerId,
        status: "active",
        brandId: catalog.brandId,
        modelId: catalog.modelId,
        cityId: catalog.cityId,
        regionId: catalog.regionId,
        year: 2020,
        mileageKm: 50000,
        priceAmount: 100000,
        priceCurrency: "TMT",
        description: "Great car",
        allowCalls: true,
        allowChat: true,
        publishedAt: new Date(),
      },
    });
    return listing;
  }

  describe("deterministic smoke: report → TOTP admin action → audit → enforcement", () => {
    it("reads only a reported Message for elevated staff, suspends its sender, and enforces messaging and sign-in", async () => {
      const reporterToken = await createUser("reporter-one");
      const senderToken = await createUser("seller-one");
      await createUser("admin-one", "admin");
      const adminToken = await createAdminSession(adminOneId);
      const oldRefresh = "a".repeat(64);
      await prisma.session.create({ data: { userId: sellerOneId, refreshTokenHash: await hash(oldRefresh, 4), expiresAt: new Date(Date.now() + 60_000) } });
      const listing = await createActiveListing(sellerOneId);
      const conversation = await prisma.conversation.create({ data: {
        listingId: listing.id, buyerId: reporterOneId, sellerId: sellerOneId,
        participants: { create: [{ userId: reporterOneId }, { userId: sellerOneId }] },
      } });
      const message = await prisma.message.create({ data: {
        conversationId: conversation.id, senderId: sellerOneId, kind: "text", body: "Reported synthetic text", createdAt: new Date("2026-01-01T12:00:00Z"),
      } });
      await prisma.message.create({ data: { conversationId: conversation.id, senderId: reporterOneId, kind: "text", body: "Unreported private neighbour" } });
      const created = await request.post(`/api/v1/conversations/${conversation.id}/messages/${message.id}/report`)
        .set("Authorization", `Bearer ${reporterToken}`).send({ reason: "spam" }).expect(201);
      const reportId = created.body.reportId as string;
      await request.get(`/api/v1/admin/reports/${reportId}`).expect(401);
      await request.get(`/api/v1/admin/reports/${reportId}`).set("Authorization", `Bearer ${reporterToken}`).expect(403);
      await request.get(`/api/v1/admin/reports/${reportId}`).set("Authorization", `Bearer ${mintUserJwt(adminOneId)}`).expect(403);
      expect(await prisma.auditLog.count({ where: { action: "REPORTED_MESSAGE_READ", targetId: message.id } })).toBe(0);
      const detail = await request.get(`/api/v1/admin/reports/${reportId}`).set("Authorization", `Bearer ${adminToken}`).expect(200);
      expect(detail.headers["cache-control"]).toBe("no-store");
      expect(detail.body.target.messageCreatedAt).toBe("2026-01-01T12:00:00.000Z");
      const parsed = AdminSchemas.GetReportDetailResponseSchema.parse(detail.body);
      expect(parsed.target).toMatchObject({ messageBody: "Reported synthetic text", messageHasAttachment: false, sender: { available: true, userId: sellerOneId } });
      expect(detail.body.messageContext).toBeUndefined();
      expect(JSON.stringify(detail.body)).not.toContain("Unreported private neighbour");
      const readAudit = await prisma.auditLog.findFirstOrThrow({ where: { action: "REPORTED_MESSAGE_READ", targetId: message.id } });
      expect(readAudit).toMatchObject({ actorId: adminOneId, details: { reportId, messageId: message.id } });
      expect(JSON.stringify(readAudit.details)).not.toContain("Reported synthetic text");
      await prisma.message.update({ where: { id: message.id }, data: { kind: "image", body: null, metadata: { key: "synthetic/image.jpg" } } });
      const attachment = await request.get(`/api/v1/admin/reports/${reportId}`).set("Authorization", `Bearer ${adminToken}`).expect(200);
      expect(attachment.body.target.messageHasAttachment).toBe(true);
      expect(attachment.body.target.metadata).toBeUndefined();
      expect(JSON.stringify(attachment.body)).not.toContain("synthetic/image.jpg");
      await prisma.message.update({ where: { id: message.id }, data: { kind: "post_ref", metadata: { listingId: listing.id } } });
      const reference = await request.get(`/api/v1/admin/reports/${reportId}`).set("Authorization", `Bearer ${adminToken}`).expect(200);
      expect(reference.body.target.messageHasAttachment).toBe(false);
      const savedContext = (await prisma.contentReport.findUniqueOrThrow({ where: { id: reportId } })).messageContext;
      await prisma.contentReport.update({ where: { id: reportId }, data: { messageContext: Prisma.DbNull } });
      const suspended = await request.post(`/api/v1/admin/users/${sellerOneId}/suspend`).set("Authorization", `Bearer ${adminToken}`).send({ reason: "Reported spam", reportId }).expect(200);
      expect(suspended.body.reportStatus).toBe("actioned");
      expect(await prisma.session.count({ where: { userId: sellerOneId } })).toBe(0);
      await request.post("/api/v1/auth/refresh").send({ refreshToken: oldRefresh }).expect(401);
      const actionAudit = await prisma.auditLog.findUniqueOrThrow({ where: { id: suspended.body.auditLogId } });
      expect(actionAudit).toMatchObject({ action: "USER_SUSPEND", targetId: sellerOneId, details: { reportId, messageId: message.id } });
      expect((await prisma.contentReport.findUniqueOrThrow({ where: { id: reportId } })).status).toBe("actioned");
      await request.post(`/api/v1/conversations/${conversation.id}/messages`).set("Authorization", `Bearer ${senderToken}`).send({ text: "Denied send" }).expect(403);
      await prisma.otpRequest.create({ data: {
        purpose: "sign_in", channel: "phone", destination: suite.phone("seller-one"),
        codeHash: createHash("sha256").update("123456").digest("hex"),
        expiresAt: new Date(Date.now() + 60_000), ip: "127.0.0.1",
      } });
      const signIn = await request.post("/api/v1/auth/otp/verify").send({ phone: suite.phone("seller-one"), code: "123456" }).expect(403);
      expect(signIn.body).toMatchObject({ code: "FORBIDDEN", details: { reason: "USER_SUSPENDED" } });
      expect((await prisma.otpRequest.findFirstOrThrow({ where: { destination: suite.phone("seller-one") } })).verifiedAt).toBeNull();
      await request.post(`/api/v1/admin/users/${sellerOneId}/unsuspend`).set("Authorization", `Bearer ${adminToken}`).send({ reason: "Appeal accepted" }).expect(200);
      await request.post("/api/v1/auth/otp/verify").send({ phone: suite.phone("seller-one"), code: "123456" }).expect(201);
      await request.post("/api/v1/auth/refresh").send({ refreshToken: oldRefresh }).expect(401);
      await prisma.contentReport.update({ where: { id: reportId }, data: { messageContext: savedContext as Prisma.InputJsonValue } });
      await prisma.message.delete({ where: { id: message.id } });
      await prisma.user.update({ where: { id: sellerOneId }, data: { phone: null, phoneVerifiedAt: null, email: null, emailVerifiedAt: null, displayName: null } });
      const deleted = await request.get(`/api/v1/admin/reports/${reportId}`).set("Authorization", `Bearer ${adminToken}`).expect(200);
      expect(deleted.body.target).toMatchObject({ available: false, label: "Сообщение удалено или недоступно", sender: { available: false, label: "Пользователь удалён" } });
      expect(deleted.body.target.messageBody).toBeUndefined();
    });

    it("report-backed ban flow with audit and public enforcement", async () => {
      // Arrange
      const reporterId = reporterOneId;
      const sellerId = sellerOneId;
      const adminId = adminOneId;

      await createUser("reporter-one", "buyer");
      await createUser("seller-one", "buyer");
      await createUser("admin-one", "admin");

      const reporterToken = mintUserJwt(reporterId);
      const adminToken = await createAdminSession(adminId);

      const listing = await createActiveListing(sellerId);

      // Act 1: Reporter creates a listing report
      const reportRes = await request
        .post(`/api/v1/listings/${listing.id}/report`)
        .set("Authorization", `Bearer ${reporterToken}`)
        .send({ reason: "spam" })
        .expect(201);

      expect(reportRes.body.status).toBe("pending");
      expect(reportRes.body.reusedExisting).toBe(false);
      const reportId = reportRes.body.reportId;

      // Act 2: Admin bans the listing via report-backed action
      const banRes = await request
        .post(`/api/v1/admin/listings/${listing.id}/ban`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ reason: "Confirmed spam", reportId })
        .expect(200);

      expect(banRes.body.targetState.status).toBe("banned");
      expect(banRes.body.reportStatus).toBe("actioned");
      expect(banRes.body.auditLogId).toBeDefined();

      // Assert: Audit row exists with correct target/action/reason
      const audit = await prisma.auditLog.findUnique({
        where: { id: banRes.body.auditLogId },
      });
      expect(audit).not.toBeNull();
      expect(audit!.action).toBe("LISTING_BAN");
      expect(audit!.targetType).toBe("listing");
      expect(audit!.targetId).toBe(listing.id);
      expect(audit!.actorId).toBe(adminId);
      expect(audit!.details).toMatchObject({
        reason: "Confirmed spam",
        reportId,
      });

      // Assert: Public enforcement — non-owner detail returns 404
      await request
        .get(`/api/v1/listings/${listing.id}`)
        .expect(404);

      // Assert: Owner detail returns banned status
      const ownerToken = mintUserJwt(sellerId);
      const ownerRes = await request
        .get(`/api/v1/listings/${listing.id}`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .expect(200);

      expect(ownerRes.body.status).toBe("banned");

      // Assert: Report status is actioned
      const reportAfter = await prisma.contentReport.findUnique({
        where: { id: reportId },
      });
      expect(reportAfter!.status).toBe("actioned");
      expect(reportAfter!.reviewedById).toBe(adminId);
      expect(reportAfter!.reviewedAt).not.toBeNull();
    });

    it("dismiss flow with audit and no target mutation", async () => {
      const reporterId = reporterTwoId;
      const sellerId = sellerTwoId;
      const adminId = adminTwoId;

      await createUser("reporter-two", "buyer");
      await createUser("seller-two", "buyer");
      await createUser("admin-two", "admin");

      const reporterToken = mintUserJwt(reporterId);
      const adminToken = await createAdminSession(adminId);

      const listing = await createActiveListing(sellerId);

      // Reporter creates report
      const reportRes = await request
        .post(`/api/v1/listings/${listing.id}/report`)
        .set("Authorization", `Bearer ${reporterToken}`)
        .send({ reason: "scam" })
        .expect(201);

      const reportId = reportRes.body.reportId;

      // Admin dismisses
      const dismissRes = await request
        .post(`/api/v1/admin/reports/${reportId}/dismiss`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ reason: "Not a violation" })
        .expect(200);

      expect(dismissRes.body.status).toBe("dismissed");
      expect(dismissRes.body.auditLogId).toBeDefined();

      // Audit row targets the content_report
      const audit = await prisma.auditLog.findUnique({
        where: { id: dismissRes.body.auditLogId },
      });
      expect(audit).not.toBeNull();
      expect(audit!.action).toBe("CONTENT_REPORT_RESOLVE");
      expect(audit!.targetType).toBe("content_report");
      expect(audit!.targetId).toBe(reportId);
      expect(audit!.details).toMatchObject({
        reason: "Not a violation",
        reportedTargetType: "listing",
        reportedTargetId: listing.id,
      });

      // Listing remains active
      const listingAfter = await prisma.listing.findUnique({
        where: { id: listing.id },
      });
      expect(listingAfter!.status).toBe("active");
    });
  });

  describe("moderator removes a reported User's Profile Photo (#642)", () => {
    const ownerId = suite.id("photo-owner");
    const photoKey = `pending/${suite.id("photo-directory")}/original.webp`;
    const directory = photoKey.slice(0, photoKey.lastIndexOf("/") + 1);
    const objectKeys = [photoKey, ...["thumbnail", "list", "detail", "fullscreen"]
      .map((name) => `${directory}${name}.webp`)];

    /**
     * A User whose Profile Photo was adopted. The upload pipeline belongs to
     * another context and its own suite (MePhoto.e2e.spec.ts) proves adoption
     * end to end, so these rows are written directly.
     */
    async function createOwnerWithPhoto() {
      await prisma.user.create({
        data: {
          id: ownerId, phone: suite.phone("photo-owner"), phoneVerifiedAt: new Date(),
          nameNumber: 4821, avatarIndex: 7,
        },
      });
      const upload = await prisma.mediaUpload.create({
        data: {
          userId: ownerId, key: photoKey, kind: "image", contentType: "image/webp", sizeBytes: 2048,
          writeProtocol: "conditional-v1", objectKeys,
          state: "ADOPTED", claimTargetType: "profile", claimTargetId: ownerId,
        },
      });
      await prisma.user.update({
        where: { id: ownerId },
        data: { avatarUploadId: upload.id, avatarKey: photoKey },
      });
      return upload;
    }

    function removePhoto(token: string, body: object) {
      return request
        .post(`/api/v1/admin/users/${ownerId}/remove-photo`)
        .set("Authorization", `Bearer ${token}`)
        .send(body);
    }

    it("report, removal, audit entry, retired upload and recorded storage deletion commit together", async () => {
      const upload = await createOwnerWithPhoto();
      await createUser("photo-reporter", "buyer");
      await createUser("photo-admin", "admin");
      const adminToken = await createAdminSession(suite.id("photo-admin"));
      const report = await request
        .post(`/api/v1/users/${ownerId}/report`)
        .set("Authorization", `Bearer ${mintUserJwt(suite.id("photo-reporter"))}`)
        .send({ reason: "other", details: "Offensive profile photo" })
        .expect(201);
      const reportId = report.body.reportId;

      const res = await removePhoto(adminToken, { reason: "Offensive photo", reportId }).expect(200);

      expect(res.body).toEqual({
        targetId: ownerId,
        targetState: { avatarKey: null, avatarIndex: 7 },
        reportId,
        reportStatus: "actioned",
        auditLogId: expect.any(String),
      });
      expect(await prisma.user.findUniqueOrThrow({ where: { id: ownerId } })).toMatchObject({
        avatarKey: null, avatarUploadId: null, avatarIndex: 7, suspendedAt: null,
      });
      expect((await prisma.mediaUpload.findUniqueOrThrow({ where: { id: upload.id } })).state).toBe("RETIRED");
      const work = await prisma.mediaUploadCleanup.findUniqueOrThrow({ where: { uploadId: upload.id } });
      expect(work).toMatchObject({ status: "PENDING", key: photoKey, writeProtocol: "conditional-v1" });
      expect([...work.objectKeys].sort()).toEqual([...objectKeys].sort());
      const audit = await prisma.auditLog.findUniqueOrThrow({ where: { id: res.body.auditLogId } });
      expect(audit).toMatchObject({
        action: "USER_PHOTO_REMOVE",
        targetType: "user",
        targetId: ownerId,
        actorId: suite.id("photo-admin"),
      });
      expect(audit.details).toMatchObject({
        reason: "Offensive photo",
        reportId,
        avatarIndex: 7,
        before: { avatarKey: photoKey, reportStatus: "pending" },
        after: { avatarKey: null, reportStatus: "actioned" },
      });
      expect(await prisma.contentReport.findUniqueOrThrow({ where: { id: reportId } })).toMatchObject({
        status: "actioned", reviewedById: suite.id("photo-admin"),
      });

      // The photo is gone, so a second removal has nothing to act on and writes no audit entry.
      const again = await removePhoto(adminToken, { reason: "Offensive photo" }).expect(409);
      expect(again.body.details).toMatchObject({ reason: "MODERATION_TARGET_STATE_CONFLICT" });
      expect(await prisma.auditLog.count({ where: { targetId: ownerId, action: "USER_PHOTO_REMOVE" } })).toBe(1);
    });

    it("refuses an ordinary User, a signed-out caller and the photo's owner, and keeps the photo", async () => {
      const upload = await createOwnerWithPhoto();
      const strangerToken = await createUser("photo-reporter", "buyer");

      await removePhoto(strangerToken!, { reason: "I do not like it" }).expect(403);
      await removePhoto(mintUserJwt(ownerId), { reason: "Mine" }).expect(403);
      await request.post(`/api/v1/admin/users/${ownerId}/remove-photo`).send({ reason: "x" }).expect(401);

      expect((await prisma.user.findUniqueOrThrow({ where: { id: ownerId } })).avatarKey).toBe(photoKey);
      expect((await prisma.mediaUpload.findUniqueOrThrow({ where: { id: upload.id } })).state).toBe("ADOPTED");
      expect(await prisma.auditLog.count({ where: { targetId: ownerId } })).toBe(0);
    });
  });
});
