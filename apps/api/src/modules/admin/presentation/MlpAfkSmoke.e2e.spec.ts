import "reflect-metadata";

import { randomUUID } from "node:crypto";

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
import { PrismaService } from "@auto-tm/db";
import type { Prisma } from "@auto-tm/db";

import { AdminModule } from "../admin.module";
import { ConversationsModule } from "../../conversations/conversations.module";
import { IdentityModule } from "../../identity/identity.module";
import { ListingsModule } from "../../listings/listings.module";
import { IMAGE_VARIANT_GENERATOR } from "../../listings/domain/ports/ImageVariantGenerator";
import { LISTING_EVENT_PUBLISHER } from "../../listings/domain/ports/ListingEventPublisher";
import { GlobalErrorFilter } from "../../../common/error.filter";
import { JwtAuthGuard } from "../../../common/jwt-auth.guard";
import { EnvSchema } from "../../../env.schema";
import { mintAdminJwt } from "../../../../test/helpers/mintAdminJwt";
import {
  cleanSuiteFixtures,
  defineE2eSuite,
  seedSuiteCatalog,
} from "../../../../test/helpers/e2eSuite";

const suite = defineE2eSuite("mlp-afk-smoke");

describe("MLP AFK e2e smoke", () => {
  let app: NestFastifyApplication;
  let request: ReturnType<typeof supertest>;
  let prisma: PrismaService;

  beforeAll(async () => {
    process.env["OTP_TEST_MODE"] = "true";

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, validate: (cfg) => EnvSchema.parse(cfg) }),
        EventEmitterModule.forRoot(),
        IdentityModule,
        ListingsModule,
        ConversationsModule,
        AdminModule,
        JwtModule.register({
          global: true,
          secret: process.env["JWT_ACCESS_SECRET"] ?? "dev-secret-change-me",
          signOptions: { expiresIn: "1h" },
        }),
      ],
    })
      .overrideProvider(IMAGE_VARIANT_GENERATOR)
      .useValue({
        generate: async (originalKey: string) => ({
          variants: {
            thumbnail: `${originalKey}/thumbnail.jpg`,
            list: `${originalKey}/list.jpg`,
            detail: `${originalKey}/detail.jpg`,
            fullscreen: `${originalKey}/fullscreen.jpg`,
          },
        }),
      })
      .overrideProvider(LISTING_EVENT_PUBLISHER)
      .useValue({ emit: async () => {} })
      .compile();

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
  }, 60_000);

  afterAll(async () => {
    delete process.env["OTP_TEST_MODE"];
    await app.close();
  }, 60_000);

  beforeEach(async () => {
    // Users arrive via real OTP login (server-generated IDs), so cleanup
    // scopes by phone as well as id. TMT→TMT is a shared global singleton —
    // seeded via upsert in seedCatalog, never deleted (see e2eSuite helper).
    await cleanSuiteFixtures(prisma, suite, {
      userAliases: [],
      extraUserIds: ["admin-afk-001"],
      extraPhones: ["+99361234001", "+99361234002", "+99369990001"],
    });
  });

  async function login(phone: string): Promise<{
    accessToken: string;
    refreshToken: string;
    userId: string;
  }> {
    const otpRes = await request
      .post("/api/v1/auth/otp/request")
      .send({ phone })
      .expect(201);

    const verifyRes = await request
      .post("/api/v1/auth/otp/verify")
      .send({ phone, code: otpRes.body.testCode, deviceLabel: "AFK smoke" })
      .expect(201);

    return {
      accessToken: verifyRes.body.accessToken as string,
      refreshToken: verifyRes.body.refreshToken as string,
      userId: verifyRes.body.user.id as string,
    };
  }

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

  async function publishListing(input: {
    sellerToken: string;
    sellerId: string;
    catalog: Awaited<ReturnType<typeof seedCatalog>>;
    description?: string;
  }): Promise<string> {
    const draftPayload = {
      brandId: input.catalog.brandId,
      modelId: input.catalog.modelId,
      cityId: input.catalog.cityId,
      regionId: input.catalog.regionId,
      priceAmount: 125000,
      priceCurrency: "TMT",
      year: 2021,
      condition: "used",
      mileageKm: 48000,
      description: input.description ?? "Clean AFK smoke listing",
      allowCalls: true,
      allowChat: true,
      conditionDisclosure: { damaged: false },
      photos: [
        {
          photoId: suite.id("photo-1"),
          key: "afk-smoke-photo.jpg",
          sortOrder: 0,
        },
      ],
    } satisfies Record<string, unknown>;

    const draft = await prisma.listingDraft.create({
      data: {
        userId: input.sellerId,
        payload: draftPayload as Prisma.InputJsonValue,
      },
    });

    const publishRes = await request
      .post(`/api/v1/listings/drafts/${draft.id}/publish`)
      .set("Authorization", `Bearer ${input.sellerToken}`)
      .send({})
      .expect(201);

    expect(publishRes.body.status).toBe("active");
    return publishRes.body.id as string;
  }

  async function createElevatedAdmin(): Promise<{ adminId: string; token: string }> {
    const adminId = "admin-afk-001";
    await prisma.user.create({
      data: { id: adminId, phone: "+99369990001", phoneVerifiedAt: new Date(), role: "admin" },
    });
    const session = await prisma.session.create({
      data: {
        userId: adminId,
        refreshTokenHash: randomUUID(),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        adminTotpExpiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000),
      },
    });

    return { adminId, token: mintAdminJwt(adminId, session.id) };
  }

  it("covers login → create listing → search → contact → reply → report → moderation → deletion recovery", async () => {
    const catalog = await seedCatalog();
    const seller = await login("+99361234001");
    const buyer = await login("+99361234002");
    const { adminId, token: adminToken } = await createElevatedAdmin();

    const listingId = await publishListing({
      sellerToken: seller.accessToken,
      sellerId: seller.userId,
      catalog,
    });

    const feedRes = await request
      .get("/api/v1/listings")
      .query({ brandId: catalog.brandId })
      .expect(200);

    expect(feedRes.body.items.some((item: { id: string }) => item.id === listingId)).toBe(true);

    const conversationRes = await request
      .post("/api/v1/conversations")
      .set("Authorization", `Bearer ${buyer.accessToken}`)
      .send({ listingId })
      .expect(201);

    expect(conversationRes.body.myRole).toBe("buyer");
    expect(conversationRes.body.sellerId).toBe(seller.userId);
    const conversationId = conversationRes.body.id as string;

    const buyerMessageRes = await request
      .post(`/api/v1/conversations/${conversationId}/messages`)
      .set("Authorization", `Bearer ${buyer.accessToken}`)
      .send({ text: "Is the car still available?" })
      .expect(201);

    expect(buyerMessageRes.body.senderId).toBe(buyer.userId);

    const sellerReplyRes = await request
      .post(`/api/v1/conversations/${conversationId}/messages`)
      .set("Authorization", `Bearer ${seller.accessToken}`)
      .send({ text: "Yes, it is available." })
      .expect(201);

    expect(sellerReplyRes.body.senderId).toBe(seller.userId);

    const messagesRes = await request
      .get(`/api/v1/conversations/${conversationId}/messages`)
      .set("Authorization", `Bearer ${buyer.accessToken}`)
      .expect(200);

    expect(messagesRes.body.items.map((m: { text: string }) => m.text)).toEqual(
      expect.arrayContaining([
        "Is the car still available?",
        "Yes, it is available.",
      ]),
    );

    const reportRes = await request
      .post(`/api/v1/listings/${listingId}/report`)
      .set("Authorization", `Bearer ${buyer.accessToken}`)
      .send({ reason: "spam" })
      .expect(201);

    const reportId = reportRes.body.reportId as string;
    expect(reportRes.body.status).toBe("pending");

    const banRes = await request
      .post(`/api/v1/admin/listings/${listingId}/ban`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ reason: "AFK confirmed spam", reportId })
      .expect(200);

    expect(banRes.body.reportStatus).toBe("actioned");
    expect(banRes.body.targetState.status).toBe("banned");

    const audit = await prisma.auditLog.findUnique({
      where: { id: banRes.body.auditLogId as string },
    });
    expect(audit).not.toBeNull();
    expect(audit!.actorId).toBe(adminId);
    expect(audit!.action).toBe("LISTING_BAN");
    expect(audit!.details).toMatchObject({
      reason: "AFK confirmed spam",
      reportId,
    });

    await request
      .get(`/api/v1/listings/${listingId}`)
      .expect(404);

    await request
      .delete("/api/v1/me")
      .set("Authorization", `Bearer ${seller.accessToken}`)
      .expect(204);

    const sellerAfterDelete = await prisma.user.findUnique({
      where: { id: seller.userId },
    });
    expect(sellerAfterDelete?.deletionScheduledAt).not.toBeNull();

    const sellerSessionsAfterDelete = await prisma.session.count({
      where: { userId: seller.userId },
    });
    expect(sellerSessionsAfterDelete).toBe(0);

    // The smoke flow covers recovery rather than retry throttling. Move the
    // earlier successful request beyond its first 60-second backoff window.
    await prisma.otpRequest.updateMany({
      where: { channel: "phone", destination: "+99361234001" },
      data: { createdAt: new Date(Date.now() - 61_000) },
    });

    const recoveryOtpRes = await request
      .post("/api/v1/auth/otp/request")
      .send({ phone: "+99361234001" })
      .expect(201);

    const recoveryRes = await request
      .post("/api/v1/auth/otp/verify")
      .send({ phone: "+99361234001", code: recoveryOtpRes.body.testCode })
      .expect(201);

    expect(recoveryRes.body.user.id).toBe(seller.userId);

    // Signing in leaves the deletion scheduled; the User confirms to restore.
    const sellerAfterSignIn = await prisma.user.findUnique({
      where: { id: seller.userId },
    });
    expect(sellerAfterSignIn?.deletionScheduledAt).not.toBeNull();

    const restoreRes = await request
      .post("/api/v1/me/restore")
      .set("Authorization", `Bearer ${recoveryRes.body.accessToken}`)
      .expect(200);
    expect(restoreRes.body.deletionScheduledAt).toBeNull();

    const sellerAfterRecovery = await prisma.user.findUnique({
      where: { id: seller.userId },
    });
    expect(sellerAfterRecovery?.deletionScheduledAt).toBeNull();
  });
});
