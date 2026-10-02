import "reflect-metadata";

import { randomUUID } from "node:crypto";

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { Test, type TestingModule } from "@nestjs/testing";
import { ConfigModule, ConfigService } from "@nestjs/config";
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

import { ReportsModule } from "../reports.module";
import { ListingsModule } from "../../listings/listings.module";
import { IdentityModule } from "../../identity/identity.module";
import { IMAGE_VARIANT_GENERATOR } from "../../listings/domain/ports/ImageVariantGenerator";
import { LISTING_EVENT_PUBLISHER } from "../../listings/domain/ports/ListingEventPublisher";
import { GlobalErrorFilter } from "../../../common/error.filter";
import { JwtAuthGuard } from "../../../common/jwt-auth.guard";
import { EnvSchema } from "../../../env.schema";
import { mintUserJwt } from "../../../../test/helpers/mintUserJwt";
import { mintAdminJwt } from "../../../../test/helpers/mintAdminJwt";
import {
  cleanSuiteFixtures,
  defineE2eSuite,
  fakeMediaObjectInspector,
  seedPresignedPhotos,
  seedSuiteCatalog,
} from "../../../../test/helpers/e2eSuite";
import { MEDIA_OBJECT_INSPECTOR } from "../../listings/domain/ports/MediaObjectInspector";

const suite = defineE2eSuite("reports-controller");
type SuiteUser = "seller-1" | "buyer-1" | "admin-1";
const SUITE_USERS: readonly SuiteUser[] = ["seller-1", "buyer-1", "admin-1"];

describe("ReportsController e2e", () => {
  let app: NestFastifyApplication;
  let request: ReturnType<typeof supertest>;
  let prisma: PrismaService;
  let config: ConfigService;

  beforeAll(async () => {
    process.env["INSPECTION_INTEREST_ENABLED"] = "true";

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          validate: (cfg) => EnvSchema.parse(cfg),
        }),
        EventEmitterModule.forRoot(),
        IdentityModule,
        ListingsModule,
        ReportsModule,
        JwtModule.register({
          global: true,
          secret: process.env["JWT_ACCESS_SECRET"] ?? "dev-secret-change-me",
          signOptions: { expiresIn: "1h" },
        }),
      ],
    })
      .overrideProvider(MEDIA_OBJECT_INSPECTOR)
      .useValue(fakeMediaObjectInspector)
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
    config = app.get(ConfigService);
  }, 60_000);

  afterAll(async () => {
    delete process.env["INSPECTION_INTEREST_ENABLED"];
    await app.close();
  }, 60_000);

  beforeEach(async () => {
    // TMT→TMT is a shared global singleton — seeded via upsert in
    // seedCatalog, never deleted (see e2eSuite helper). This suite owns no
    // exclusive exchange-rate pairs.
    await cleanSuiteFixtures(prisma, suite, {
      userAliases: SUITE_USERS,
      inspectionInterests: true,
    });
  });

  async function createUser(alias: SuiteUser, role: "buyer" | "admin" = "buyer"): Promise<string> {
    await prisma.user.create({
      data: { id: suite.id(alias), phone: suite.phone(alias), phoneVerifiedAt: new Date(), role },
    });
    return mintUserJwt(suite.id(alias));
  }

  async function createElevatedAdmin(): Promise<{ adminId: string; token: string }> {
    const adminId = suite.id("admin-1");
    await prisma.user.create({
      data: { id: adminId, phone: suite.phone("admin-1"), phoneVerifiedAt: new Date(), role: "admin" },
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

  async function seedDraft(alias: SuiteUser, payload: Record<string, unknown>) {
    const seeded = await seedPresignedPhotos(prisma, suite.id(alias), payload);
    return prisma.listingDraft.create({
      data: { userId: suite.id(alias), payload: seeded as Prisma.InputJsonValue },
    });
  }

  const validPayload = {
    brandId: suite.catalog.brandId,
    modelId: suite.catalog.modelId,
    cityId: suite.catalog.cityId,
    regionId: suite.catalog.regionId,
    priceAmount: 100000,
    priceCurrency: "TMT",
    year: 2020,
    condition: "used",
    mileageKm: 50000,
    description: "Great car",
    allowCalls: true,
    allowChat: true,
    conditionDisclosure: { damaged: false },
    photos: [
      {
        photoId: suite.id("photo-1"),
        key: "photo1.jpg",
        sortOrder: 0,
      },
    ],
  };

  describe("POST /api/v1/listings/:id/inspection-interest", () => {
    it("returns 401 without bearer token", async () => {
      await request
        .post("/api/v1/listings/listing-id/inspection-interest")
        .send({})
        .expect(401);
    });

    it("creates buyer interest for an active listing", async () => {
      await seedCatalog();
      const sellerToken = await createUser("seller-1");
      const buyerToken = await createUser("buyer-1");
      const draft = await seedDraft("seller-1", validPayload);

      const publishRes = await request
        .post(`/api/v1/listings/drafts/${draft.id}/publish`)
        .set("Authorization", `Bearer ${sellerToken}`)
        .send({})
        .expect(201);
      const listingId = publishRes.body.id as string;

      const res = await request
        .post(`/api/v1/listings/${listingId}/inspection-interest`)
        .set("Authorization", `Bearer ${buyerToken}`)
        .send({ willingnessToPayTmt: 5000 })
        .expect(201);

      expect(res.body.listingId).toBe(listingId);
      expect(res.body.requesterUserId).toBe(suite.id("buyer-1"));
      expect(res.body.side).toBe("buyer");
      expect(res.body.willingnessToPayTmt).toBe(5000);
      expect(res.body.reusedExisting).toBe(false);
    });

    it("dedupes repeated interest and updates willingness to pay", async () => {
      await seedCatalog();
      const sellerToken = await createUser("seller-1");
      const buyerToken = await createUser("buyer-1");
      const draft = await seedDraft("seller-1", validPayload);

      const publishRes = await request
        .post(`/api/v1/listings/drafts/${draft.id}/publish`)
        .set("Authorization", `Bearer ${sellerToken}`)
        .send({})
        .expect(201);
      const listingId = publishRes.body.id as string;

      const first = await request
        .post(`/api/v1/listings/${listingId}/inspection-interest`)
        .set("Authorization", `Bearer ${buyerToken}`)
        .send({ willingnessToPayTmt: 1000 })
        .expect(201);

      const second = await request
        .post(`/api/v1/listings/${listingId}/inspection-interest`)
        .set("Authorization", `Bearer ${buyerToken}`)
        .send({ willingnessToPayTmt: 3000 })
        .expect(200);

      expect(second.body.id).toBe(first.body.id);
      expect(second.body.willingnessToPayTmt).toBe(3000);
      expect(second.body.reusedExisting).toBe(true);

      const rows = await prisma.inspectionInterest.count();
      expect(rows).toBe(1);
    });

    it("returns 404 for missing listing", async () => {
      const buyerToken = await createUser("buyer-1");

      await request
        .post("/api/v1/listings/non-existent-id/inspection-interest")
        .set("Authorization", `Bearer ${buyerToken}`)
        .send({})
        .expect(404);
    });

    it("returns 404 for banned listing", async () => {
      await seedCatalog();
      const sellerToken = await createUser("seller-1");
      const buyerToken = await createUser("buyer-1");
      const draft = await seedDraft("seller-1", validPayload);

      const publishRes = await request
        .post(`/api/v1/listings/drafts/${draft.id}/publish`)
        .set("Authorization", `Bearer ${sellerToken}`)
        .send({})
        .expect(201);
      const listingId = publishRes.body.id as string;

      await prisma.listing.update({
        where: { id: listingId },
        data: { status: "banned" },
      });

      await request
        .post(`/api/v1/listings/${listingId}/inspection-interest`)
        .set("Authorization", `Bearer ${buyerToken}`)
        .send({})
        .expect(404);
    });

    it("infers seller side when requester owns the listing", async () => {
      await seedCatalog();
      const sellerToken = await createUser("seller-1");
      const draft = await seedDraft("seller-1", validPayload);

      const publishRes = await request
        .post(`/api/v1/listings/drafts/${draft.id}/publish`)
        .set("Authorization", `Bearer ${sellerToken}`)
        .send({})
        .expect(201);
      const listingId = publishRes.body.id as string;

      const res = await request
        .post(`/api/v1/listings/${listingId}/inspection-interest`)
        .set("Authorization", `Bearer ${sellerToken}`)
        .send({})
        .expect(201);

      expect(res.body.side).toBe("seller");
    });
  });

  describe("INSPECTION_INTEREST_ENABLED=false", () => {
    it("returns 403 FEATURE_DISABLED", async () => {
      config.set("INSPECTION_INTEREST_ENABLED", false);

      await seedCatalog();
      const sellerToken = await createUser("seller-1");
      const buyerToken = await createUser("buyer-1");
      const draft = await seedDraft("seller-1", validPayload);

      const publishRes = await request
        .post(`/api/v1/listings/drafts/${draft.id}/publish`)
        .set("Authorization", `Bearer ${sellerToken}`)
        .send({})
        .expect(201);
      const listingId = publishRes.body.id as string;

      const res = await request
        .post(`/api/v1/listings/${listingId}/inspection-interest`)
        .set("Authorization", `Bearer ${buyerToken}`)
        .send({})
        .expect(403);

      expect(res.body.details).toMatchObject({ reason: "FEATURE_DISABLED" });

      config.set("INSPECTION_INTEREST_ENABLED", true);
    });
  });

  describe("GET /api/v1/admin/inspection-interests", () => {
    it("returns 401 without bearer token", async () => {
      await request.get("/api/v1/admin/inspection-interests").expect(401);
    });

    it("returns aggregate counts for admin", async () => {
      await seedCatalog();
      const sellerToken = await createUser("seller-1");
      const buyerToken = await createUser("buyer-1");
      const { token: adminToken } = await createElevatedAdmin();
      const draft = await seedDraft("seller-1", validPayload);

      const publishRes = await request
        .post(`/api/v1/listings/drafts/${draft.id}/publish`)
        .set("Authorization", `Bearer ${sellerToken}`)
        .send({})
        .expect(201);
      const listingId = publishRes.body.id as string;

      await request
        .post(`/api/v1/listings/${listingId}/inspection-interest`)
        .set("Authorization", `Bearer ${buyerToken}`)
        .send({ willingnessToPayTmt: 5000 })
        .expect(201);

      const res = await request
        .get("/api/v1/admin/inspection-interests")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0]).toMatchObject({
        listingId,
        totalInterest: 1,
        buyerInterest: 1,
        sellerInterest: 0,
        willingnessToPayTmtSum: 5000,
        willingnessToPayTmtCount: 1,
        willingnessToPayTmtAvg: 5000,
      });
    });
  });
});
