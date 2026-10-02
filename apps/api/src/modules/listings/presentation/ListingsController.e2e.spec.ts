import "reflect-metadata";

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { Test, type TestingModule } from "@nestjs/testing";
import { ConfigModule } from "@nestjs/config";
import { Reflector } from "@nestjs/core";
import { JwtModule, JwtService } from "@nestjs/jwt";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import supertest from "supertest";
import { ListingsSchemas } from "@auto-tm/contracts";
import { PrismaService, recomputeListingPricesTmt } from "@auto-tm/db";
import type { Prisma } from "@auto-tm/db";

import { ListingsModule } from "../listings.module";
import { IdentityModule } from "../../identity/identity.module";
import { EnvSchema } from "../../../env.schema";
import { GlobalErrorFilter } from "../../../common/error.filter";
import { JwtAuthGuard } from "../../../common/jwt-auth.guard";
import { mintUserJwt } from "../../../../test/helpers/mintUserJwt";
import {
  cleanSuiteFixtures,
  defineE2eSuite,
  fakeMediaObjectInspector,
  seedPresignedPhotos,
  seedSuiteCatalog,
} from "../../../../test/helpers/e2eSuite";
import { MEDIA_OBJECT_INSPECTOR } from "../domain/ports/MediaObjectInspector";
import { IMAGE_VARIANT_GENERATOR } from "../domain/ports/ImageVariantGenerator";
import { LISTING_EVENT_PUBLISHER } from "../domain/ports/ListingEventPublisher";

const suite = defineE2eSuite("listings-controller");
type SuiteUser = "user-1" | "user-2";
const SUITE_USERS: readonly SuiteUser[] = ["user-1", "user-2"];

describe("ListingsController e2e", () => {
  let app: NestFastifyApplication;
  let request: ReturnType<typeof supertest>;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          validate: (cfg) => EnvSchema.parse(cfg),
        }),
        ListingsModule,
        IdentityModule,
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
  });

  afterAll(async () => {
    // Card-field fixtures reference suite-owned transmission / engine type
    // rows, so drop the suite's listings first, then those lookup rows.
    await cleanSuiteFixtures(prisma, suite, {
      userAliases: SUITE_USERS,
      exchangeRatePairs: [{ from: "USD", to: "TMT" }],
    });
    await prisma.transmission.deleteMany({ where: { id: suite.id("transmission") } });
    await prisma.engineType.deleteMany({ where: { id: suite.id("engine-type") } });
    await app.close();
  });

  beforeEach(async () => {
    // Only this suite owns the USD→TMT pair; the EXCHANGE_RATE_MISSING test
    // depends on its absence at test start. TMT→TMT is shared with other
    // suites — seeded via upsert, never deleted (see e2eSuite helper).
    await cleanSuiteFixtures(prisma, suite, {
      userAliases: SUITE_USERS,
      exchangeRatePairs: [{ from: "USD", to: "TMT" }],
    });
  });

  async function createUser(alias: SuiteUser): Promise<string> {
    await prisma.user.create({
      data: { id: suite.id(alias), phone: suite.phone(alias), phoneVerifiedAt: new Date(), role: "buyer" },
    });
    return mintUserJwt(suite.id(alias));
  }

  async function seedCatalog() {
    return seedSuiteCatalog(prisma, suite);
  }

  async function seedDraft(alias: SuiteUser, payload: Record<string, unknown>) {
    const seeded = await seedPresignedPhotos(prisma, suite.id(alias), payload);
    const draft = await prisma.listingDraft.create({
      data: { userId: suite.id(alias), payload: seeded as Prisma.InputJsonValue },
    });
    return draft;
  }

  async function seedExchangeRate(from: "TMT" | "USD" | "AED", to: "TMT" | "USD" | "AED", rate: number) {
    await prisma.exchangeRate.upsert({
      where: { fromCurrency_toCurrency: { fromCurrency: from, toCurrency: to } },
      create: { fromCurrency: from, toCurrency: to, rate },
      update: { rate },
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
    photos: [{ photoId: suite.id("photo-1"), key: "photo1.jpg", sortOrder: 0 }],
    conditionDisclosure: {
      damaged: true,
      knownIssuesText: "Small scratch",
    },
  };

  describe("POST /api/v1/listings/drafts/:id/publish", () => {
    it("returns 401 without bearer token", async () => {
      await request
        .post("/api/v1/listings/drafts/draft-id/publish")
        .send({})
        .expect(401);
    });

    it("publishes a valid draft", async () => {
      await seedCatalog();
      const token = await createUser("user-1");
      const draft = await seedDraft("user-1", validPayload);

      const res = await request
        .post(`/api/v1/listings/drafts/${draft.id}/publish`)
        .set("Authorization", `Bearer ${token}`)
        .send({})
        .expect(201);

      expect(res.body.status).toBe("active");
      expect(res.body.brandId).toBe(validPayload.brandId);
      expect(res.body.priceAmount).toBe(validPayload.priceAmount);

      // Draft should be deleted
      const draftAfter = await prisma.listingDraft.findUnique({ where: { id: draft.id } });
      expect(draftAfter).toBeNull();

      // Media should be created
      const media = await prisma.listingMedia.findMany({ where: { listingId: res.body.id } });
      expect(media).toHaveLength(1);

      // Condition disclosure and the stored TMT price should be persisted
      const listing = await prisma.listing.findUnique({ where: { id: res.body.id } });
      expect(listing).toMatchObject({
        priceTmt: validPayload.priceAmount,
        damaged: true,
        knownIssuesText: validPayload.conditionDisclosure.knownIssuesText,
      });

      // Audit log should be written
      const audit = await prisma.auditLog.findFirst({
        where: { action: "listing.published", targetId: res.body.id },
      });
      expect(audit).not.toBeNull();
    });

    it("rejects with EXCHANGE_RATE_MISSING for USD without rate", async () => {
      await seedCatalog();
      const token = await createUser("user-1");
      const draft = await seedDraft("user-1", { ...validPayload, priceCurrency: "USD" });

      const res = await request
        .post(`/api/v1/listings/drafts/${draft.id}/publish`)
        .set("Authorization", `Bearer ${token}`)
        .send({})
        .expect(400);

      expect(res.body.code).toBe("EXCHANGE_RATE_MISSING");
    });

    it("publishes USD-priced draft when rate exists", async () => {
      await seedCatalog();
      const token = await createUser("user-1");
      await seedExchangeRate("USD", "TMT", 3.5);
      const draft = await seedDraft("user-1", { ...validPayload, priceCurrency: "USD" });

      const res = await request
        .post(`/api/v1/listings/drafts/${draft.id}/publish`)
        .set("Authorization", `Bearer ${token}`)
        .send({})
        .expect(201);

      expect(res.body.priceCurrency).toBe("USD");
      const listing = await prisma.listing.findUniqueOrThrow({ where: { id: res.body.id } });
      expect(listing.priceTmt).toBe(validPayload.priceAmount * 3.5);
    });

    it("keeps priceTmt at the current rate through edit and republish", async () => {
      await seedCatalog();
      const token = await createUser("user-1");
      await seedExchangeRate("USD", "TMT", 3.5);
      const draft = await seedDraft("user-1", {
        ...validPayload,
        priceAmount: 10000,
        priceCurrency: "USD",
      });
      const { body } = await request
        .post(`/api/v1/listings/drafts/${draft.id}/publish`)
        .set("Authorization", `Bearer ${token}`)
        .send({})
        .expect(201);
      const priceTmt = async () =>
        (await prisma.listing.findUniqueOrThrow({ where: { id: body.id } })).priceTmt;
      expect(await priceTmt()).toBe(35000);

      await seedExchangeRate("USD", "TMT", 4);
      await request
        .patch(`/api/v1/listings/${body.id}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ description: "New tyres" })
        .expect(200);
      expect(await priceTmt()).toBe(40000);

      await request
        .patch(`/api/v1/listings/${body.id}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ priceAmount: 150000, priceCurrency: "TMT" })
        .expect(200);
      expect(await priceTmt()).toBe(150000);

      await request
        .patch(`/api/v1/listings/${body.id}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ priceAmount: 12000, priceCurrency: "USD" })
        .expect(200);
      expect(await priceTmt()).toBe(48000);

      await request
        .post(`/api/v1/listings/${body.id}/archive`)
        .set("Authorization", `Bearer ${token}`)
        .send({})
        .expect(201);
      await seedExchangeRate("USD", "TMT", 5);
      await request
        .post(`/api/v1/listings/${body.id}/republish`)
        .set("Authorization", `Bearer ${token}`)
        .send({})
        .expect(201);
      expect(await priceTmt()).toBe(60000);
    });

    it("rejects for another user's draft", async () => {
      await seedCatalog();
      await createUser("user-1");
      const token2 = await createUser("user-2");
      const draft = await seedDraft("user-1", validPayload);

      await request
        .post(`/api/v1/listings/drafts/${draft.id}/publish`)
        .set("Authorization", `Bearer ${token2}`)
        .send({})
        .expect(403);
    });
  });

  describe("Full lifecycle", () => {
    it("publish → mark sold → archive → republish → delete", async () => {
      await seedCatalog();
      const token = await createUser("user-1");
      const draft = await seedDraft("user-1", validPayload);

      // Publish
      const publishRes = await request
        .post(`/api/v1/listings/drafts/${draft.id}/publish`)
        .set("Authorization", `Bearer ${token}`)
        .send({})
        .expect(201);
      const listingId = publishRes.body.id;
      expect(publishRes.body.status).toBe("active");

      // Mark sold
      const soldRes = await request
        .post(`/api/v1/listings/${listingId}/sold`)
        .set("Authorization", `Bearer ${token}`)
        .send({})
        .expect(201);
      expect(soldRes.body.status).toBe("sold");
      expect(soldRes.body.soldAt).toBeTruthy();

      const soldAudit = await prisma.auditLog.findFirst({
        where: { action: "listing.marked_sold", targetId: listingId },
      });
      expect(soldAudit).not.toBeNull();

      // Archive
      const archiveRes = await request
        .post(`/api/v1/listings/${listingId}/archive`)
        .set("Authorization", `Bearer ${token}`)
        .send({})
        .expect(201);
      expect(archiveRes.body.status).toBe("archived");

      const archiveAudit = await prisma.auditLog.findFirst({
        where: { action: "listing.archived", targetId: listingId },
      });
      expect(archiveAudit).not.toBeNull();

      // Republish
      const republishRes = await request
        .post(`/api/v1/listings/${listingId}/republish`)
        .set("Authorization", `Bearer ${token}`)
        .send({})
        .expect(201);
      expect(republishRes.body.status).toBe("active");
      expect(republishRes.body.publishedAt).toBeTruthy();

      const republishAudit = await prisma.auditLog.findFirst({
        where: { action: "listing.republished", targetId: listingId },
      });
      expect(republishAudit).not.toBeNull();

      // Delete
      await request
        .delete(`/api/v1/listings/${listingId}`)
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      const listingAfter = await prisma.listing.findUnique({ where: { id: listingId } });
      expect(listingAfter).not.toBeNull();
      expect(listingAfter?.deletedAt).not.toBeNull();
      expect(listingAfter?.status).toBe("active"); // status preserved

      const deleteAudit = await prisma.auditLog.findFirst({
        where: { action: "listing.deleted", targetId: listingId },
      });
      expect(deleteAudit).not.toBeNull();

      // Media rows should still exist
      const mediaAfter = await prisma.listingMedia.findMany({ where: { listingId } });
      expect(mediaAfter).toHaveLength(1);
    });
  });

  describe("PATCH /api/v1/listings/:id", () => {
    it("edits a listing's description", async () => {
      await seedCatalog();
      const token = await createUser("user-1");
      const draft = await seedDraft("user-1", validPayload);

      const publishRes = await request
        .post(`/api/v1/listings/drafts/${draft.id}/publish`)
        .set("Authorization", `Bearer ${token}`)
        .send({})
        .expect(201);
      const listingId = publishRes.body.id;

      const editRes = await request
        .patch(`/api/v1/listings/${listingId}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ description: "Updated description" })
        .expect(200);

      expect(editRes.body.description).toBe("Updated description");
      expect(editRes.body.id).toBe(listingId);
    });

    it("writes price_changed audit log on price update", async () => {
      await seedCatalog();
      const token = await createUser("user-1");
      const draft = await seedDraft("user-1", validPayload);

      const publishRes = await request
        .post(`/api/v1/listings/drafts/${draft.id}/publish`)
        .set("Authorization", `Bearer ${token}`)
        .send({})
        .expect(201);
      const listingId = publishRes.body.id;

      await request
        .patch(`/api/v1/listings/${listingId}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ priceAmount: 200000 })
        .expect(200);

      const audit = await prisma.auditLog.findFirst({
        where: { action: "listing.price_changed", targetId: listingId },
      });
      expect(audit).not.toBeNull();
      expect(audit?.details).toMatchObject({
        oldPriceAmount: 100000,
        oldPriceCurrency: "TMT",
        newPriceAmount: 200000,
        newPriceCurrency: "TMT",
      });
    });

    it("rejects locked field changes", async () => {
      await seedCatalog();
      const token = await createUser("user-1");
      const draft = await seedDraft("user-1", validPayload);

      const publishRes = await request
        .post(`/api/v1/listings/drafts/${draft.id}/publish`)
        .set("Authorization", `Bearer ${token}`)
        .send({})
        .expect(201);
      const listingId = publishRes.body.id;

      const res = await request
        .patch(`/api/v1/listings/${listingId}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ brandId: "00000000-0000-0000-0000-000000000099" })
        .expect(400);

      expect(res.body.code).toBe("VALIDATION_ERROR");
    });

    it("returns a complete mobile edit response and clears Known issues", async () => {
      await seedCatalog();
      const token = await createUser("user-1");
      const draft = await seedDraft("user-1", validPayload);

      const publishRes = await request
        .post(`/api/v1/listings/drafts/${draft.id}/publish`)
        .set("Authorization", `Bearer ${token}`)
        .send({})
        .expect(201);
      const listingId = publishRes.body.id;

      const editRes = await request
        .patch(`/api/v1/listings/${listingId}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ conditionDisclosure: { damaged: false } })
        .expect(200);

      expect(ListingsSchemas.ListingDetailSchema.safeParse(editRes.body).success).toBe(true);
      expect(editRes.body.conditionDisclosure).toEqual({ damaged: false });
      const row = await prisma.listing.findUniqueOrThrow({ where: { id: listingId } });
      expect(row.damaged).toBe(false);
      expect(row.knownIssuesText).toBeNull();
    });

    it("rejects an edit whose disclosure has no Damaged answer", async () => {
      await seedCatalog();
      const token = await createUser("user-1");
      const draft = await seedDraft("user-1", validPayload);

      const publishRes = await request
        .post(`/api/v1/listings/drafts/${draft.id}/publish`)
        .set("Authorization", `Bearer ${token}`)
        .send({})
        .expect(201);

      const res = await request
        .patch(`/api/v1/listings/${publishRes.body.id}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ conditionDisclosure: { knownIssuesText: "Rust" } })
        .expect(400);

      expect(res.body.code).toBe("VALIDATION_ERROR");
    });

    it("rejects an edit of a Listing without a Damaged answer until it is answered", async () => {
      await seedCatalog();
      const token = await createUser("user-1");
      const draft = await seedDraft("user-1", validPayload);

      const publishRes = await request
        .post(`/api/v1/listings/drafts/${draft.id}/publish`)
        .set("Authorization", `Bearer ${token}`)
        .send({})
        .expect(201);
      const listingId = publishRes.body.id;
      // A row from before the migration has no answer.
      await prisma.listing.update({ where: { id: listingId }, data: { damaged: null } });

      const res = await request
        .patch(`/api/v1/listings/${listingId}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ description: "Updated description" })
        .expect(400);

      expect(res.body.code).toBe("DAMAGED_REQUIRED");
      const row = await prisma.listing.findUniqueOrThrow({ where: { id: listingId } });
      expect(row.damaged).toBeNull();
      expect(row.description).not.toBe("Updated description");
    });

    it("rejects conditionDisclosure with knownIssuesText over 1000 chars", async () => {
      await seedCatalog();
      const token = await createUser("user-1");
      const draft = await seedDraft("user-1", validPayload);

      const publishRes = await request
        .post(`/api/v1/listings/drafts/${draft.id}/publish`)
        .set("Authorization", `Bearer ${token}`)
        .send({})
        .expect(201);
      const listingId = publishRes.body.id;

      await request
        .patch(`/api/v1/listings/${listingId}`)
        .set("Authorization", `Bearer ${token}`)
        .send({
          conditionDisclosure: {
            damaged: false,
            knownIssuesText: "x".repeat(1001),
          },
        })
        .expect(400);
    });

    it("returns 403 when trying to modify another user's listing", async () => {
      await seedCatalog();
      const token1 = await createUser("user-1");
      const token2 = await createUser("user-2");
      const draft = await seedDraft("user-1", validPayload);

      const publishRes = await request
        .post(`/api/v1/listings/drafts/${draft.id}/publish`)
        .set("Authorization", `Bearer ${token1}`)
        .send({})
        .expect(201);
      const listingId = publishRes.body.id;

      await request
        .post(`/api/v1/listings/${listingId}/sold`)
        .set("Authorization", `Bearer ${token2}`)
        .send({})
        .expect(403);

      await request
        .post(`/api/v1/listings/${listingId}/archive`)
        .set("Authorization", `Bearer ${token2}`)
        .send({})
        .expect(403);

      await request
        .post(`/api/v1/listings/${listingId}/republish`)
        .set("Authorization", `Bearer ${token2}`)
        .send({})
        .expect(403);

      await request
        .delete(`/api/v1/listings/${listingId}`)
        .set("Authorization", `Bearer ${token2}`)
        .send({})
        .expect(403);
    });
  });

  describe("GET /api/v1/listings/:id", () => {
    it("returns detail for a published listing", async () => {
      await seedCatalog();
      const token = await createUser("user-1");
      const memberSince = new Date("2024-06-10T12:00:00.000Z");
      await prisma.user.update({
        where: { id: suite.id("user-1") },
        data: { displayName: "Aýgül", createdAt: memberSince },
      });
      const draft = await seedDraft("user-1", validPayload);

      const publishRes = await request
        .post(`/api/v1/listings/drafts/${draft.id}/publish`)
        .set("Authorization", `Bearer ${token}`)
        .send({})
        .expect(201);
      const listingId = publishRes.body.id;

      const res = await request
        .get(`/api/v1/listings/${listingId}`)
        .expect(200);

      expect(res.body.id).toBe(listingId);
      const persisted = await prisma.listing.findUniqueOrThrow({ where: { id: listingId } });
      expect(res.body.publicNumber).toBe(persisted.publicNumber);
      expect(res.body.publicNumber).toBeGreaterThan(0);
      expect(res.body.seller).toEqual({
        displayName: "Aýgül",
        memberSince: memberSince.toISOString(),
      });
      expect(res.body).not.toHaveProperty("sellerTrust");
      expect(res.body.status).toBe("active");
      expect(res.body.priceAmount).toBe(validPayload.priceAmount);
      expect(res.body.displayPriceTmt).toBe(validPayload.priceAmount);
      expect(res.body.media).toHaveLength(1);
      expect(res.body.media[0].variants.thumbnail).toContain("thumbnail.jpg");
    });

    it("returns 404 for soft-deleted listing", async () => {
      await seedCatalog();
      const token = await createUser("user-1");
      const draft = await seedDraft("user-1", validPayload);

      const publishRes = await request
        .post(`/api/v1/listings/drafts/${draft.id}/publish`)
        .set("Authorization", `Bearer ${token}`)
        .send({})
        .expect(201);
      const listingId = publishRes.body.id;

      await request
        .delete(`/api/v1/listings/${listingId}`)
        .set("Authorization", `Bearer ${token}`)
        .send({})
        .expect(200);

      await request
        .get(`/api/v1/listings/${listingId}`)
        .expect(404);
    });

    it("returns detail with conditionDisclosure", async () => {
      await seedCatalog();
      const token = await createUser("user-1");
      const draft = await seedDraft("user-1", validPayload);

      const publishRes = await request
        .post(`/api/v1/listings/drafts/${draft.id}/publish`)
        .set("Authorization", `Bearer ${token}`)
        .send({})
        .expect(201);
      const listingId = publishRes.body.id;

      const res = await request
        .get(`/api/v1/listings/${listingId}`)
        .expect(200);

      expect(res.body.id).toBe(listingId);
      expect(res.body.seller.displayName).toBeNull();
      expect(res.body.conditionDisclosure).toMatchObject(validPayload.conditionDisclosure);
    });

    it("returns detail without conditionDisclosure when a Listing has no Damaged answer", async () => {
      await seedCatalog();
      const token = await createUser("user-1");
      const draft = await seedDraft("user-1", validPayload);

      const publishRes = await request
        .post(`/api/v1/listings/drafts/${draft.id}/publish`)
        .set("Authorization", `Bearer ${token}`)
        .send({})
        .expect(201);
      const listingId = publishRes.body.id;
      // A Listing published before the migration has no answer.
      await prisma.listing.update({ where: { id: listingId }, data: { damaged: null } });

      const res = await request
        .get(`/api/v1/listings/${listingId}`)
        .expect(200);

      expect(res.body.conditionDisclosure).toBeUndefined();
    });

    it("rejects publishing a draft without a Damaged answer", async () => {
      await seedCatalog();
      const token = await createUser("user-1");
      const { conditionDisclosure: _, ...payloadWithoutDisclosure } = validPayload;
      const draft = await seedDraft("user-1", payloadWithoutDisclosure);

      const res = await request
        .post(`/api/v1/listings/drafts/${draft.id}/publish`)
        .set("Authorization", `Bearer ${token}`)
        .send({})
        .expect(400);

      expect(res.body.code).toBe("INVALID_DRAFT_PAYLOAD");
      expect(res.body.details.fieldErrors.conditionDisclosure).toEqual(["DAMAGED_REQUIRED"]);
    });
  });

  describe("GET /api/v1/listings", () => {
    it("returns empty feed when no listings", async () => {
      // Scoped to this suite's brand: concurrent e2e suites share the dev
      // stack, so a global empty-feed assertion is not meaningful.
      const res = await request
        .get("/api/v1/listings")
        .query({ brandId: suite.catalog.brandId })
        .expect(200);

      expect(res.body.items).toHaveLength(0);
      expect(res.body.nextCursor).toBeNull();
    });

    it("returns a response that matches the shared feed contract", async () => {
      await seedCatalog();
      await createUser("user-1");
      await prisma.listing.create({
        data: {
          sellerId: suite.id("user-1"),
          status: "active",
          brandId: validPayload.brandId,
          modelId: validPayload.modelId,
          cityId: validPayload.cityId,
          year: validPayload.year,
          priceAmount: validPayload.priceAmount,
          priceCurrency: "TMT",
          publishedAt: new Date("2026-07-18T12:00:00.000Z"),
        },
      });

      const feed = await request.get("/api/v1/listings").query({ brandId: suite.catalog.brandId }).expect(200);
      const parsed = ListingsSchemas.FeedResponseSchema.parse(feed.body);

      expect(parsed.items).toHaveLength(1);
      expect(feed.body.items[0]).not.toHaveProperty("sellerTrust");
    });

    async function seedFeedListing(overrides: Partial<Prisma.ListingUncheckedCreateInput> = {}) {
      return prisma.listing.create({
        data: {
          sellerId: suite.id("user-1"),
          status: "active",
          brandId: validPayload.brandId,
          modelId: validPayload.modelId,
          cityId: validPayload.cityId,
          priceAmount: validPayload.priceAmount,
          priceCurrency: "TMT",
          publishedAt: new Date(),
          ...overrides,
        },
      });
    }

    it("returns card photo and spec fields, omitting unset specs", async () => {
      await seedCatalog();
      await createUser("user-1");
      const transmission = await prisma.transmission.upsert({
        where: { id: suite.id("transmission") },
        create: { id: suite.id("transmission"), nameRu: "e2e", nameTk: "e2e", nameEn: "e2e" },
        update: {},
      });
      const engineType = await prisma.engineType.upsert({
        where: { id: suite.id("engine-type") },
        create: { id: suite.id("engine-type"), nameRu: "e2e", nameTk: "e2e", nameEn: "e2e" },
        update: {},
      });

      const full = await seedFeedListing({
        mileageKm: 0,
        condition: "new",
        transmissionId: transmission.id,
        engineTypeId: engineType.id,
        publishedAt: new Date("2026-07-18T12:00:00.000Z"),
      });
      const bare = await seedFeedListing({
        publishedAt: new Date("2026-07-17T12:00:00.000Z"),
      });
      await prisma.listingMedia.createMany({
        data: [
          { listingId: full.id, kind: "image", key: "p2", sortOrder: 2 },
          { listingId: full.id, kind: "image", key: "p0", sortOrder: 0 },
          { listingId: full.id, kind: "video", key: "v1", sortOrder: 1 },
          { listingId: full.id, kind: "image", key: "p3", sortOrder: 3 },
        ],
      });

      const feed = await request
        .get("/api/v1/listings")
        .query({ brandId: suite.catalog.brandId })
        .expect(200);
      const parsed = ListingsSchemas.FeedResponseSchema.parse(feed.body);

      const fullItem = parsed.items.find((i) => i.id === full.id);
      expect(fullItem).toMatchObject({
        photoKeys: ["p0", "p2"],
        photoCount: 3,
        mileageKm: 0,
        condition: "new",
        transmissionId: transmission.id,
        engineTypeId: engineType.id,
      });

      const bareItem = feed.body.items.find((i: { id: string }) => i.id === bare.id);
      expect(bareItem.photoKeys).toEqual([]);
      expect(bareItem.photoCount).toBe(0);
      expect(bareItem).not.toHaveProperty("mileageKm");
      expect(bareItem).not.toHaveProperty("condition");
      expect(bareItem).not.toHaveProperty("transmissionId");
      expect(bareItem).not.toHaveProperty("engineTypeId");
    });

    it("marks isFavorited for a signed-in viewer and omits it for an anonymous one", async () => {
      await seedCatalog();
      await createUser("user-1");
      const viewerToken = await createUser("user-2");
      const favorited = await seedFeedListing();
      const other = await seedFeedListing();
      await prisma.favorite.create({
        data: { userId: suite.id("user-2"), listingId: favorited.id },
      });

      const signedIn = await request
        .get("/api/v1/listings")
        .set("Authorization", `Bearer ${viewerToken}`)
        .query({ brandId: suite.catalog.brandId })
        .expect(200);
      const byId = new Map(
        signedIn.body.items.map((i: { id: string; isFavorited?: boolean }) => [i.id, i.isFavorited]),
      );
      expect(byId.get(favorited.id)).toBe(true);
      expect(byId.get(other.id)).toBe(false);

      const anonymous = await request
        .get("/api/v1/listings")
        .query({ brandId: suite.catalog.brandId })
        .expect(200);
      expect(anonymous.body.items).toHaveLength(2);
      for (const item of anonymous.body.items) {
        expect(item).not.toHaveProperty("isFavorited");
      }
    });

    it("makes the same number of SQL queries regardless of page size", async () => {
      await seedCatalog();
      await createUser("user-1");
      const viewerToken = await createUser("user-2");
      await seedExchangeRate("USD", "TMT", 20);
      for (let i = 0; i < 12; i++) {
        const listing = await seedFeedListing({
          priceCurrency: i % 2 === 0 ? "TMT" : "USD",
          publishedAt: new Date(Date.now() - i * 1000),
        });
        await prisma.listingMedia.createMany({
          data: [0, 1, 2].map((sortOrder) => ({
            listingId: listing.id,
            kind: "image" as const,
            key: `${listing.id}/${sortOrder}`,
            sortOrder,
          })),
        });
        if (i % 3 === 0) {
          await prisma.favorite.create({
            data: { userId: suite.id("user-2"), listingId: listing.id },
          });
        }
      }

      // PrismaService (@auto-tm/db) hands its private pg Pool to PrismaPg
      // (@prisma/adapter-pg 7.x), which sends every non-transaction SQL
      // statement through pool.query(). If that wiring changes, the
      // `small > 0` guard below fails loudly instead of passing vacuously.
      const pool = (prisma as unknown as { pool: { query: (...args: unknown[]) => unknown } }).pool;
      const querySpy = vi.spyOn(pool, "query");

      async function queriesForPage(limit: number): Promise<number> {
        querySpy.mockClear();
        const res = await request
          .get("/api/v1/listings")
          .set("Authorization", `Bearer ${viewerToken}`)
          .query({ brandId: suite.catalog.brandId, limit })
          .expect(200);
        expect(res.body.items).toHaveLength(limit);
        return querySpy.mock.calls.length;
      }

      try {
        const small = await queriesForPage(2);
        const large = await queriesForPage(12);

        // Guards against a spy that never fires (0 === 0).
        expect(small).toBeGreaterThan(0);
        expect(large).toBe(small);
        // listings + cover media include + card photos + exchange rates + favorites.
        expect(large).toBeLessThanOrEqual(5);
      } finally {
        querySpy.mockRestore();
      }
    });

    it("returns coverMediaKey for published listings with media", async () => {
      await seedCatalog();
      const token = await createUser("user-1");
      const draft = await seedDraft("user-1", validPayload);

      const publishRes = await request
        .post(`/api/v1/listings/drafts/${draft.id}/publish`)
        .set("Authorization", `Bearer ${token}`)
        .send({})
        .expect(201);
      const listingId = publishRes.body.id;

      const feed = await request
        .get("/api/v1/listings")
        .query({ brandId: suite.catalog.brandId })
        .expect(200);

      const item = feed.body.items.find((i: { id: string }) => i.id === listingId);
      expect(item).toBeDefined();
      const media = await prisma.listingMedia.findFirstOrThrow({ where: { listingId } });
      expect(item.coverMediaKey).toBe(media.key);
    });

    it("paginates feed with cursor", async () => {
      await seedCatalog();
      const token = await createUser("user-1");

      // Publish 25 listings
      for (let i = 0; i < 25; i++) {
        const draft = await seedDraft("user-1", {
          ...validPayload,
          photos: [{ photoId: suite.id(`photo-${i}`), key: `photo${i}.jpg`, sortOrder: 0 }],
        });
        await request
          .post(`/api/v1/listings/drafts/${draft.id}/publish`)
          .set("Authorization", `Bearer ${token}`)
          .send({})
          .expect(201);
      }

      // First page
      const page1 = await request
        .get("/api/v1/listings")
        .query({ brandId: suite.catalog.brandId })
        .expect(200);

      expect(page1.body.items).toHaveLength(20);
      expect(page1.body.nextCursor).not.toBeNull();

      // Second page
      const page2 = await request
        .get("/api/v1/listings")
        .query({ brandId: suite.catalog.brandId, cursor: page1.body.nextCursor })
        .expect(200);

      expect(page2.body.items).toHaveLength(5);
      expect(page2.body.nextCursor).toBeNull();
    });

    it("hides sold listings from the feed", async () => {
      await seedCatalog();
      const token = await createUser("user-1");
      const draft = await seedDraft("user-1", validPayload);

      const publishRes = await request
        .post(`/api/v1/listings/drafts/${draft.id}/publish`)
        .set("Authorization", `Bearer ${token}`)
        .send({})
        .expect(201);
      const listingId = publishRes.body.id;

      await request
        .post(`/api/v1/listings/${listingId}/sold`)
        .set("Authorization", `Bearer ${token}`)
        .send({})
        .expect(201);

      const feed = await request
        .get("/api/v1/listings")
        .query({ brandId: suite.catalog.brandId })
        .expect(200);

      expect(feed.body.items.some((item: { id: string }) => item.id === listingId)).toBe(false);
    });

    it("excludes soft-deleted listings from feed", async () => {
      await seedCatalog();
      const token = await createUser("user-1");
      const draft = await seedDraft("user-1", validPayload);

      const publishRes = await request
        .post(`/api/v1/listings/drafts/${draft.id}/publish`)
        .set("Authorization", `Bearer ${token}`)
        .send({})
        .expect(201);
      const listingId = publishRes.body.id;

      await request
        .delete(`/api/v1/listings/${listingId}`)
        .set("Authorization", `Bearer ${token}`)
        .send({})
        .expect(200);

      const feed = await request
        .get("/api/v1/listings")
        .query({ brandId: suite.catalog.brandId })
        .expect(200);

      expect(feed.body.items.some((item: { id: string }) => item.id === listingId)).toBe(false);
    });

    it("filters feed by brandId", async () => {
      await seedCatalog();
      const brand2 = await prisma.brand.create({
        data: {
          id: suite.id("brand-2"),
          slug: suite.slugFor("brand-2"),
          nameRu: "Test Brand 2",
          nameTk: "Test Brand 2",
          nameEn: "Test Brand 2",
        },
      });
      await prisma.model.create({
        data: {
          id: suite.id("model-2"),
          brandId: brand2.id,
          slug: suite.slugFor("model-2"),
          nameRu: "Test Model 2",
          nameTk: "Test Model 2",
          nameEn: "Test Model 2",
        },
      });

      const token = await createUser("user-1");

      const draft1 = await seedDraft("user-1", validPayload);
      const draft2 = await seedDraft("user-1", {
        ...validPayload,
        brandId: brand2.id,
        modelId: suite.id("model-2"),
        photos: [
          {
            photoId: suite.id("photo-2"),
            key: "photo2.jpg",
            sortOrder: 0,
          },
        ],
      });

      const publish1 = await request
        .post(`/api/v1/listings/drafts/${draft1.id}/publish`)
        .set("Authorization", `Bearer ${token}`)
        .send({})
        .expect(201);

      await request
        .post(`/api/v1/listings/drafts/${draft2.id}/publish`)
        .set("Authorization", `Bearer ${token}`)
        .send({})
        .expect(201);

      const feed = await request
        .get("/api/v1/listings")
        .query({ brandId: validPayload.brandId })
        .expect(200);

      expect(feed.body.items).toHaveLength(1);
      expect(feed.body.items[0].id).toBe(publish1.body.id);
      expect(feed.body.nextCursor).toBeNull();
    });

    it("returns empty result for zero-match filter", async () => {
      await seedCatalog();
      const token = await createUser("user-1");
      const draft = await seedDraft("user-1", validPayload);

      await request
        .post(`/api/v1/listings/drafts/${draft.id}/publish`)
        .set("Authorization", `Bearer ${token}`)
        .send({})
        .expect(201);

      const feed = await request
        .get("/api/v1/listings")
        .query({ brandId: "00000000-0000-0000-0000-000000000999" })
        .expect(200);

      expect(feed.body.items).toHaveLength(0);
      expect(feed.body.nextCursor).toBeNull();
    });

    it("paginates to cursor end with filters applied", async () => {
      await seedCatalog();
      const brand2 = await prisma.brand.create({
        data: {
          id: suite.id("brand-2"),
          slug: suite.slugFor("brand-2"),
          nameRu: "Test Brand 2",
          nameTk: "Test Brand 2",
          nameEn: "Test Brand 2",
        },
      });
      await prisma.model.create({
        data: {
          id: suite.id("model-2"),
          brandId: brand2.id,
          slug: suite.slugFor("model-2"),
          nameRu: "Test Model 2",
          nameTk: "Test Model 2",
          nameEn: "Test Model 2",
        },
      });

      const token = await createUser("user-1");

      // Publish 4 listings alternating brands
      for (let i = 0; i < 4; i++) {
        const draft = await seedDraft("user-1", {
          ...validPayload,
          brandId: i % 2 === 0 ? validPayload.brandId : brand2.id,
          modelId: i % 2 === 0 ? validPayload.modelId : suite.id("model-2"),
          photos: [{ photoId: suite.id(`photo-${i}`), key: `photo${i}.jpg`, sortOrder: 0 }],
        });
        await request
          .post(`/api/v1/listings/drafts/${draft.id}/publish`)
          .set("Authorization", `Bearer ${token}`)
          .send({})
          .expect(201);
      }

      // Page through with limit=1 and brand filter (should get 2 listings)
      const page1 = await request
        .get("/api/v1/listings")
        .query({ brandId: validPayload.brandId, limit: 1 })
        .expect(200);

      expect(page1.body.items).toHaveLength(1);
      expect(page1.body.nextCursor).not.toBeNull();

      const page2 = await request
        .get("/api/v1/listings")
        .query({ brandId: validPayload.brandId, limit: 1, cursor: page1.body.nextCursor })
        .expect(200);

      expect(page2.body.items).toHaveLength(1);
      expect(page2.body.nextCursor).toBeNull();
    });

    it("returns 400 VALIDATION_ERROR for invalid filter range", async () => {
      const res = await request
        .get("/api/v1/listings")
        .query({ priceMin: 200000, priceMax: 100000 })
        .expect(400);

      expect(res.body.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("GET /api/v1/listings?sort", () => {
    type Row = {
      id: string;
      priceTmt: number | null;
      year: number | null;
      mileageKm: number | null;
      publishedAt: Date;
    };
    const SPECS: Record<ListingsSchemas.FeedSort, { key: keyof Row; dir: 1 | -1 }> = {
      newest: { key: "publishedAt", dir: -1 },
      price_asc: { key: "priceTmt", dir: 1 },
      price_desc: { key: "priceTmt", dir: -1 },
      year_desc: { key: "year", dir: -1 },
      year_asc: { key: "year", dir: 1 },
      mileage_asc: { key: "mileageKm", dir: 1 },
    };

    /** Reference order: key then id in the order's direction; missing keys last. */
    function expectedOrder(rows: Row[], sort: ListingsSchemas.FeedSort): string[] {
      const { key, dir } = SPECS[sort];
      const value = (r: Row) => {
        const v = r[key];
        return v instanceof Date ? v.getTime() : (v as number | null);
      };
      return [...rows]
        .sort((a, b) => {
          const va = value(a);
          const vb = value(b);
          if (va === null && vb !== null) return 1;
          if (va !== null && vb === null) return -1;
          if (va !== null && vb !== null && va !== vb) return (va - vb) * dir;
          return (a.id < b.id ? -1 : 1) * dir;
        })
        .map((r) => r.id);
    }

    async function seedMixedListings(): Promise<Row[]> {
      await seedCatalog();
      await createUser("user-1");
      await seedExchangeRate("USD", "TMT", 19.5);
      const at = (hoursAgo: number) => new Date(Date.now() - hoursAgo * 3_600_000);
      const listings = [
        { alias: "sort-a", priceAmount: 10000, priceCurrency: "USD", year: 2018, mileageKm: 50000, publishedAt: at(1) },
        { alias: "sort-b", priceAmount: 100000, priceCurrency: "TMT", year: null, mileageKm: null, publishedAt: at(2) },
        { alias: "sort-c", priceAmount: 100000, priceCurrency: "TMT", year: 2020, mileageKm: 0, publishedAt: at(2) },
        { alias: "sort-d", priceAmount: 60000, priceCurrency: "TMT", year: 2018, mileageKm: null, publishedAt: at(4) },
        { alias: "sort-e", priceAmount: 250000, priceCurrency: "TMT", year: null, mileageKm: 200000, publishedAt: at(5) },
        { alias: "sort-sold", priceAmount: 1000, priceCurrency: "TMT", year: 2024, mileageKm: 1, publishedAt: at(1), status: "sold" },
        { alias: "sort-archived", priceAmount: 2000, priceCurrency: "TMT", year: 2024, mileageKm: 1, publishedAt: at(1), status: "archived" },
      ] as const;
      for (const l of listings) {
        await prisma.listing.create({
          data: {
            id: suite.id(l.alias),
            sellerId: suite.id("user-1"),
            status: "status" in l ? l.status : "active",
            brandId: suite.catalog.brandId,
            modelId: suite.catalog.modelId,
            cityId: suite.catalog.cityId,
            priceAmount: l.priceAmount,
            priceCurrency: l.priceCurrency,
            year: l.year,
            mileageKm: l.mileageKm,
            publishedAt: l.publishedAt,
            allowCalls: true,
            allowChat: true,
          },
        });
      }
      await recomputeListingPricesTmt(prisma);
      return prisma.listing.findMany({
        where: { sellerId: suite.id("user-1"), status: "active" },
        select: { id: true, priceTmt: true, year: true, mileageKm: true, publishedAt: true },
      }) as Promise<Row[]>;
    }

    async function pageThrough(sort: ListingsSchemas.FeedSort, limit: number): Promise<string[]> {
      const ids: string[] = [];
      let cursor: string | null = null;
      do {
        const res = await request
          .get("/api/v1/listings")
          .query({ brandId: suite.catalog.brandId, sort, limit, ...(cursor ? { cursor } : {}) })
          .expect(200);
        const page = ListingsSchemas.FeedResponseSchema.parse(res.body);
        ids.push(...page.items.map((item) => item.id));
        cursor = page.nextCursor;
        expect(ids.length).toBeLessThanOrEqual(10);
      } while (cursor);
      return ids;
    }

    it("pages every order through each active Listing exactly once", async () => {
      const rows = await seedMixedListings();
      expect(rows).toHaveLength(5);

      for (const sort of ListingsSchemas.FEED_SORT_VALUES) {
        const ids = await pageThrough(sort, 2);
        expect({ sort, ids }).toEqual({ sort, ids: expectedOrder(rows, sort) });
        expect(new Set(ids).size).toBe(5);
      }
      // The 10,000 USD Listing (195,000 TMT) is the second most expensive.
      expect((await pageThrough("price_desc", 50)).slice(0, 2)).toEqual([
        suite.id("sort-e"),
        suite.id("sort-a"),
      ]);
    });

    it("defaults to newest when sort is missing", async () => {
      const rows = await seedMixedListings();

      const res = await request
        .get("/api/v1/listings")
        .query({ brandId: suite.catalog.brandId })
        .expect(200);

      expect(res.body.items.map((item: { id: string }) => item.id)).toEqual(
        expectedOrder(rows, "newest"),
      );
    });

    it("returns 400 for an unknown sort", async () => {
      const res = await request.get("/api/v1/listings").query({ sort: "best_deal" }).expect(400);
      expect(res.body.code).toBe("VALIDATION_ERROR");
    });

    it("returns 400 for a cursor from another order or a malformed cursor", async () => {
      await seedMixedListings();
      const first = await request
        .get("/api/v1/listings")
        .query({ brandId: suite.catalog.brandId, sort: "price_asc", limit: 2 })
        .expect(200);
      expect(first.body.nextCursor).toEqual(expect.any(String));

      for (const query of [
        { sort: "year_asc", cursor: first.body.nextCursor },
        { cursor: first.body.nextCursor },
        { sort: "price_asc", cursor: "not-a-cursor" },
      ]) {
        const res = await request
          .get("/api/v1/listings")
          .query({ brandId: suite.catalog.brandId, ...query })
          .expect(400);
        expect(res.body.code).toBe("VALIDATION_ERROR");
      }
    });
  });

  describe("GET /api/v1/listings/filter-options/brands", () => {
    it("returns active-Listing counts per brand, most first", async () => {
      await seedBrandCountListings();

      const res = await request
        .get("/api/v1/listings/filter-options/brands")
        .query({ cityId: suite.catalog.cityId })
        .expect(200);

      expect(ListingsSchemas.ListingBrandCountResponseSchema.parse(res.body)).toEqual({
        items: [
          { brandId: suite.catalog.brandId, totalMatching: 2 },
          { brandId: suite.id("brand-popular-2"), totalMatching: 1 },
        ],
      });

      const newOnly = await request
        .get("/api/v1/listings/filter-options/brands")
        .query({ cityId: suite.catalog.cityId, condition: "new" })
        .expect(200);
      expect(newOnly.body).toEqual({
        items: [{ brandId: suite.id("brand-popular-2"), totalMatching: 1 }],
      });
    });

    it("returns 400 when a brand filter is sent", async () => {
      const res = await request
        .get("/api/v1/listings/filter-options/brands")
        .query({ brandId: suite.catalog.brandId })
        .expect(400);
      expect(res.body.code).toBe("VALIDATION_ERROR");
    });

    async function seedBrandCountListings(): Promise<void> {
      await seedCatalog();
      await createUser("user-1");
      await prisma.brand.create({
        data: {
          id: suite.id("brand-popular-2"),
          slug: suite.slugFor("brand-popular-2"),
          nameRu: "Popular 2",
          nameTk: "Popular 2",
          nameEn: "Popular 2",
        },
      });
      await prisma.model.create({
        data: {
          id: suite.id("model-popular-2"),
          brandId: suite.id("brand-popular-2"),
          slug: suite.slugFor("model-popular-2"),
          nameRu: "Popular 2",
          nameTk: "Popular 2",
          nameEn: "Popular 2",
        },
      });
      const rows = [
        { alias: "brand-l1", brandId: suite.catalog.brandId, modelId: suite.catalog.modelId, condition: "used", status: "active" },
        { alias: "brand-l2", brandId: suite.catalog.brandId, modelId: suite.catalog.modelId, condition: "used", status: "active" },
        { alias: "brand-l3", brandId: suite.catalog.brandId, modelId: suite.catalog.modelId, condition: "used", status: "sold" },
        { alias: "brand-l4", brandId: suite.id("brand-popular-2"), modelId: suite.id("model-popular-2"), condition: "new", status: "active" },
      ] as const;
      for (const row of rows) {
        await prisma.listing.create({
          data: {
            id: suite.id(row.alias),
            sellerId: suite.id("user-1"),
            status: row.status,
            brandId: row.brandId,
            modelId: row.modelId,
            cityId: suite.catalog.cityId,
            condition: row.condition,
            priceAmount: 100000,
            priceCurrency: "TMT",
            priceTmt: 100000,
            publishedAt: new Date(),
            allowCalls: true,
            allowChat: true,
          },
        });
      }
    }
  });

  describe("GET /api/v1/listings/count", () => {
    it("returns zero when no listings exist", async () => {
      // Scoped to this suite's brand — see the empty-feed note above.
      const res = await request
        .get("/api/v1/listings/count")
        .query({ brandId: suite.catalog.brandId })
        .expect(200);

      expect(res.body.totalMatching).toBe(0);
    });

    it("counts all eligible listings", async () => {
      await seedCatalog();
      const token = await createUser("user-1");

      for (let i = 0; i < 3; i++) {
        const draft = await seedDraft("user-1", {
          ...validPayload,
          photos: [{ photoId: suite.id(`photo-${i}`), key: `photo${i}.jpg`, sortOrder: 0 }],
        });
        await request
          .post(`/api/v1/listings/drafts/${draft.id}/publish`)
          .set("Authorization", `Bearer ${token}`)
          .send({})
          .expect(201);
      }

      const res = await request
        .get("/api/v1/listings/count")
        .query({ brandId: suite.catalog.brandId })
        .expect(200);

      expect(res.body.totalMatching).toBe(3);
    });

    it("counts listings matching brand filter", async () => {
      await seedCatalog();
      const brand2 = await prisma.brand.create({
        data: {
          id: suite.id("brand-2"),
          slug: suite.slugFor("brand-2"),
          nameRu: "Test Brand 2",
          nameTk: "Test Brand 2",
          nameEn: "Test Brand 2",
        },
      });
      await prisma.model.create({
        data: {
          id: suite.id("model-2"),
          brandId: brand2.id,
          slug: suite.slugFor("model-2"),
          nameRu: "Test Model 2",
          nameTk: "Test Model 2",
          nameEn: "Test Model 2",
        },
      });

      const token = await createUser("user-1");

      const draft1 = await seedDraft("user-1", validPayload);
      const draft2 = await seedDraft("user-1", {
        ...validPayload,
        brandId: brand2.id,
        modelId: suite.id("model-2"),
        photos: [
          {
            photoId: suite.id("photo-2"),
            key: "photo2.jpg",
            sortOrder: 0,
          },
        ],
      });

      await request
        .post(`/api/v1/listings/drafts/${draft1.id}/publish`)
        .set("Authorization", `Bearer ${token}`)
        .send({})
        .expect(201);
      await request
        .post(`/api/v1/listings/drafts/${draft2.id}/publish`)
        .set("Authorization", `Bearer ${token}`)
        .send({})
        .expect(201);

      const res = await request
        .get("/api/v1/listings/count")
        .query({ brandId: validPayload.brandId })
        .expect(200);

      expect(res.body.totalMatching).toBe(1);
    });

    it("excludes soft-deleted listings from count", async () => {
      await seedCatalog();
      const token = await createUser("user-1");
      const draft = await seedDraft("user-1", validPayload);

      const publishRes = await request
        .post(`/api/v1/listings/drafts/${draft.id}/publish`)
        .set("Authorization", `Bearer ${token}`)
        .send({})
        .expect(201);
      const listingId = publishRes.body.id;

      await request
        .delete(`/api/v1/listings/${listingId}`)
        .set("Authorization", `Bearer ${token}`)
        .send({})
        .expect(200);

      const res = await request
        .get("/api/v1/listings/count")
        .query({ brandId: suite.catalog.brandId })
        .expect(200);

      expect(res.body.totalMatching).toBe(0);
    });

    it("excludes sold listings from the count", async () => {
      await seedCatalog();
      const token = await createUser("user-1");
      const draft = await seedDraft("user-1", validPayload);

      const publishRes = await request
        .post(`/api/v1/listings/drafts/${draft.id}/publish`)
        .set("Authorization", `Bearer ${token}`)
        .send({})
        .expect(201);
      const listingId = publishRes.body.id;

      await request
        .post(`/api/v1/listings/${listingId}/sold`)
        .set("Authorization", `Bearer ${token}`)
        .send({})
        .expect(201);

      const res = await request
        .get("/api/v1/listings/count")
        .query({ brandId: suite.catalog.brandId })
        .expect(200);

      expect(res.body).toEqual({ totalMatching: 0, priceMinTmt: null, priceMaxTmt: null });
    });

    it("returns the TMT price range of the matches", async () => {
      await seedCatalog();
      await seedExchangeRate("USD", "TMT", 19.5);
      const token = await createUser("user-1");
      const prices = [
        { priceAmount: 100000, priceCurrency: "TMT" },
        { priceAmount: 10000, priceCurrency: "USD" },
        { priceAmount: 60000, priceCurrency: "TMT" },
      ];
      for (const [i, price] of prices.entries()) {
        const draft = await seedDraft("user-1", {
          ...validPayload,
          ...price,
          photos: [{ photoId: suite.id(`photo-${i}`), key: `photo${i}.jpg`, sortOrder: 0 }],
        });
        await request
          .post(`/api/v1/listings/drafts/${draft.id}/publish`)
          .set("Authorization", `Bearer ${token}`)
          .send({})
          .expect(201);
      }

      const res = await request
        .get("/api/v1/listings/count")
        .query({ brandId: suite.catalog.brandId, sort: "price_desc" })
        .expect(200);

      expect(ListingsSchemas.ListingCountResponseSchema.parse(res.body)).toEqual({
        totalMatching: 3,
        priceMinTmt: 60000,
        priceMaxTmt: 195000,
      });
    });

    it("returns 400 VALIDATION_ERROR for an unknown sort", async () => {
      const res = await request
        .get("/api/v1/listings/count")
        .query({ sort: "relevance" })
        .expect(400);

      expect(res.body.code).toBe("VALIDATION_ERROR");
    });

    it("respects FX-aware price filters", async () => {
      await seedCatalog();
      await seedExchangeRate("USD", "TMT", 3.5);
      const token = await createUser("user-1");

      const draftTmt = await seedDraft("user-1", { ...validPayload, priceAmount: 100000, priceCurrency: "TMT" });
      const draftUsd = await seedDraft("user-1", {
        ...validPayload,
        priceAmount: 20000,
        priceCurrency: "USD",
        photos: [
          {
            photoId: suite.id("photo-2"),
            key: "photo2.jpg",
            sortOrder: 0,
          },
        ],
      });

      await request
        .post(`/api/v1/listings/drafts/${draftTmt.id}/publish`)
        .set("Authorization", `Bearer ${token}`)
        .send({})
        .expect(201);
      await request
        .post(`/api/v1/listings/drafts/${draftUsd.id}/publish`)
        .set("Authorization", `Bearer ${token}`)
        .send({})
        .expect(201);

      const res = await request
        .get("/api/v1/listings/count")
        .query({ brandId: suite.catalog.brandId, priceMin: 50000, priceMax: 80000 })
        .expect(200);

      expect(res.body.totalMatching).toBe(1);
    });

    it("returns 400 VALIDATION_ERROR for invalid filter range", async () => {
      const res = await request
        .get("/api/v1/listings/count")
        .query({ priceMin: 200000, priceMax: 100000 })
        .expect(400);

      expect(res.body.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("GET /api/v1/me/listings", () => {
    it("returns 401 without bearer token", async () => {
      await request
        .get("/api/v1/me/listings")
        .expect(401);
    });

    it("returns owner's listings", async () => {
      await seedCatalog();
      const token = await createUser("user-1");
      const draft = await seedDraft("user-1", validPayload);

      const publishRes = await request
        .post(`/api/v1/listings/drafts/${draft.id}/publish`)
        .set("Authorization", `Bearer ${token}`)
        .send({})
        .expect(201);
      const listingId = publishRes.body.id;

      const res = await request
        .get("/api/v1/me/listings")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].id).toBe(listingId);
    });
  });

  describe("GET /api/v1/me/listings/counts", () => {
    async function seedOwned(
      alias: SuiteUser,
      status: NonNullable<Prisma.ListingUncheckedCreateInput["status"]>,
      overrides: Partial<Prisma.ListingUncheckedCreateInput> = {},
    ) {
      return prisma.listing.create({
        data: {
          sellerId: suite.id(alias),
          status,
          brandId: validPayload.brandId,
          modelId: validPayload.modelId,
          cityId: validPayload.cityId,
          priceAmount: validPayload.priceAmount,
          priceCurrency: "TMT",
          publishedAt: new Date(),
          ...overrides,
        },
      });
    }

    it("returns 401 without bearer token", async () => {
      await request.get("/api/v1/me/listings/counts").expect(401);
    });

    it("returns all zeros for a User with nothing", async () => {
      const token = await createUser("user-1");

      const res = await request
        .get("/api/v1/me/listings/counts")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      expect(ListingsSchemas.MyListingCountsResponseSchema.parse(res.body)).toEqual({
        active: 0,
        sold: 0,
        archived: 0,
        banned: 0,
        drafts: 0,
        total: 0,
      });
    });

    it("counts each status, drafts, and a total that includes statuses with no field", async () => {
      await seedCatalog();
      const token = await createUser("user-1");
      await seedOwned("user-1", "active");
      await seedOwned("user-1", "active");
      await seedOwned("user-1", "sold");
      await seedOwned("user-1", "archived");
      await seedOwned("user-1", "banned");
      await seedOwned("user-1", "pending_review");
      await seedOwned("user-1", "rejected");
      await seedDraft("user-1", validPayload);

      const res = await request
        .get("/api/v1/me/listings/counts")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      expect(ListingsSchemas.MyListingCountsResponseSchema.parse(res.body)).toEqual({
        active: 2,
        sold: 1,
        archived: 1,
        banned: 1,
        drafts: 1,
        total: 8,
      });
    });

    it("never counts soft-deleted Listings, in any status or in total", async () => {
      await seedCatalog();
      const token = await createUser("user-1");
      await seedOwned("user-1", "active");
      await seedOwned("user-1", "active", { deletedAt: new Date() });
      await seedOwned("user-1", "banned", { deletedAt: new Date() });

      const res = await request
        .get("/api/v1/me/listings/counts")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      expect(res.body).toEqual({
        active: 1,
        sold: 0,
        archived: 0,
        banned: 0,
        drafts: 0,
        total: 1,
      });
    });

    it("never counts another User's Listings or drafts", async () => {
      await seedCatalog();
      const token = await createUser("user-1");
      await createUser("user-2");
      await seedOwned("user-1", "active");
      await seedOwned("user-2", "active");
      await seedOwned("user-2", "banned");
      await seedDraft("user-2", validPayload);

      const res = await request
        .get("/api/v1/me/listings/counts")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      expect(res.body).toEqual({
        active: 1,
        sold: 0,
        archived: 0,
        banned: 0,
        drafts: 0,
        total: 1,
      });
    });

    it("leaves GET /api/v1/me/listings and GET /api/v1/listings/:id routed to their own handlers", async () => {
      await seedCatalog();
      const token = await createUser("user-1");
      const listing = await seedOwned("user-1", "active");

      const mine = await request
        .get("/api/v1/me/listings")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);
      expect(mine.body.items).toHaveLength(1);

      const detail = await request.get(`/api/v1/listings/${listing.id}`).expect(200);
      expect(detail.body.id).toBe(listing.id);
    });
  });
});
