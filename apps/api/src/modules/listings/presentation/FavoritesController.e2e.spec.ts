import "reflect-metadata";

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
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
import { PrismaService } from "@auto-tm/db";
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
import {
  LISTINGS_READ_PORT,
  type ListingsReadPort,
} from "../domain/ports/ListingsReadPort";

const suite = defineE2eSuite("favorites-controller");
type SuiteUser = "seller-1" | "buyer-1";
const SUITE_USERS: readonly SuiteUser[] = ["seller-1", "buyer-1"];

describe("FavoritesController e2e", () => {
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
    await app.close();
  });

  beforeEach(async () => {
    await cleanSuiteFixtures(prisma, suite, { userAliases: SUITE_USERS });
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
    photos: [{ photoId: suite.id("photo-1"), key: "photo1.jpg", sortOrder: 0 }],
  };

  describe("POST /api/v1/listings/:id/favorite", () => {
    it("returns 401 without bearer token", async () => {
      await request
        .post("/api/v1/listings/listing-id/favorite")
        .send({})
        .expect(401);
    });

    it("favorites an active listing", async () => {
      await seedCatalog();
      const sellerToken = await createUser("seller-1");
      const buyerToken = await createUser("buyer-1");
      const draft = await seedDraft("seller-1", validPayload);

      const publishRes = await request
        .post(`/api/v1/listings/drafts/${draft.id}/publish`)
        .set("Authorization", `Bearer ${sellerToken}`)
        .send({})
        .expect(201);
      const listingId = publishRes.body.id;

      const res = await request
        .post(`/api/v1/listings/${listingId}/favorite`)
        .set("Authorization", `Bearer ${buyerToken}`)
        .send({})
        .expect(201);

      expect(res.body.listingId).toBe(listingId);
      expect(res.body.userId).toBe(suite.id("buyer-1"));

      const favRow = await prisma.favorite.findFirst({
        where: { userId: suite.id("buyer-1"), listingId },
      });
      expect(favRow).not.toBeNull();

      const listing = await prisma.listing.findUnique({ where: { id: listingId } });
      expect(listing?.favoriteCount).toBe(1);
    });

    it("is idempotent — second favorite returns same row", async () => {
      await seedCatalog();
      const sellerToken = await createUser("seller-1");
      const buyerToken = await createUser("buyer-1");
      const draft = await seedDraft("seller-1", validPayload);

      const publishRes = await request
        .post(`/api/v1/listings/drafts/${draft.id}/publish`)
        .set("Authorization", `Bearer ${sellerToken}`)
        .send({})
        .expect(201);
      const listingId = publishRes.body.id;

      const first = await request
        .post(`/api/v1/listings/${listingId}/favorite`)
        .set("Authorization", `Bearer ${buyerToken}`)
        .send({})
        .expect(201);

      const second = await request
        .post(`/api/v1/listings/${listingId}/favorite`)
        .set("Authorization", `Bearer ${buyerToken}`)
        .send({})
        .expect(201);

      expect(second.body.id).toBe(first.body.id);

      const listing = await prisma.listing.findUnique({ where: { id: listingId } });
      expect(listing?.favoriteCount).toBe(1);
    });

    it("returns 404 for non-existent listing", async () => {
      const buyerToken = await createUser("buyer-1");

      await request
        .post("/api/v1/listings/non-existent-id/favorite")
        .set("Authorization", `Bearer ${buyerToken}`)
        .send({})
        .expect(404);
    });

    it("returns 404 for soft-deleted listing", async () => {
      await seedCatalog();
      const sellerToken = await createUser("seller-1");
      const buyerToken = await createUser("buyer-1");
      const draft = await seedDraft("seller-1", validPayload);

      const publishRes = await request
        .post(`/api/v1/listings/drafts/${draft.id}/publish`)
        .set("Authorization", `Bearer ${sellerToken}`)
        .send({})
        .expect(201);
      const listingId = publishRes.body.id;

      await request
        .delete(`/api/v1/listings/${listingId}`)
        .set("Authorization", `Bearer ${sellerToken}`)
        .send({})
        .expect(200);

      await request
        .post(`/api/v1/listings/${listingId}/favorite`)
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
      const listingId = publishRes.body.id;

      // Cross-context fixture: banning is owned by admin moderation (covered
      // end-to-end by AdminModerationController.e2e.spec.ts). Convention in
      // test/helpers/e2eSuite.ts allows short-circuiting via prisma here.
      await prisma.listing.update({
        where: { id: listingId },
        data: { status: "banned" },
      });

      await request
        .post(`/api/v1/listings/${listingId}/favorite`)
        .set("Authorization", `Bearer ${buyerToken}`)
        .send({})
        .expect(404);
    });
  });

  describe("DELETE /api/v1/listings/:id/favorite", () => {
    it("returns 401 without bearer token", async () => {
      await request
        .delete("/api/v1/listings/listing-id/favorite")
        .expect(401);
    });

    it("unfavorites a listing", async () => {
      await seedCatalog();
      const sellerToken = await createUser("seller-1");
      const buyerToken = await createUser("buyer-1");
      const draft = await seedDraft("seller-1", validPayload);

      const publishRes = await request
        .post(`/api/v1/listings/drafts/${draft.id}/publish`)
        .set("Authorization", `Bearer ${sellerToken}`)
        .send({})
        .expect(201);
      const listingId = publishRes.body.id;

      await request
        .post(`/api/v1/listings/${listingId}/favorite`)
        .set("Authorization", `Bearer ${buyerToken}`)
        .send({})
        .expect(201);

      const res = await request
        .delete(`/api/v1/listings/${listingId}/favorite`)
        .set("Authorization", `Bearer ${buyerToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);

      const favRow = await prisma.favorite.findFirst({
        where: { userId: suite.id("buyer-1"), listingId },
      });
      expect(favRow).toBeNull();

      const listing = await prisma.listing.findUnique({ where: { id: listingId } });
      expect(listing?.favoriteCount).toBe(0);
    });

    it("is idempotent — unfavorite non-existing returns success", async () => {
      await seedCatalog();
      const sellerToken = await createUser("seller-1");
      const buyerToken = await createUser("buyer-1");
      const draft = await seedDraft("seller-1", validPayload);

      const publishRes = await request
        .post(`/api/v1/listings/drafts/${draft.id}/publish`)
        .set("Authorization", `Bearer ${sellerToken}`)
        .send({})
        .expect(201);
      const listingId = publishRes.body.id;

      const res = await request
        .delete(`/api/v1/listings/${listingId}/favorite`)
        .set("Authorization", `Bearer ${buyerToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
    });
  });

  describe("GET /api/v1/favorites", () => {
    it("returns 401 without bearer token", async () => {
      await request
        .get("/api/v1/favorites")
        .expect(401);
    });

    it("returns favorited listings", async () => {
      await seedCatalog();
      const sellerToken = await createUser("seller-1");
      const buyerToken = await createUser("buyer-1");
      const draft = await seedDraft("seller-1", validPayload);

      const publishRes = await request
        .post(`/api/v1/listings/drafts/${draft.id}/publish`)
        .set("Authorization", `Bearer ${sellerToken}`)
        .send({})
        .expect(201);
      const listingId = publishRes.body.id;

      await request
        .post(`/api/v1/listings/${listingId}/favorite`)
        .set("Authorization", `Bearer ${buyerToken}`)
        .send({})
        .expect(201);

      const res = await request
        .get("/api/v1/favorites")
        .set("Authorization", `Bearer ${buyerToken}`)
        .expect(200);

      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].id).toBe(listingId);
      expect(res.body.nextCursor).toBeNull();
    });

    it("returns card fields and contact preferences on favorite items", async () => {
      await seedCatalog();
      const sellerToken = await createUser("seller-1");
      const buyerToken = await createUser("buyer-1");
      const draft = await seedDraft("seller-1", {
        ...validPayload,
        photos: [
          { photoId: suite.id("photo-a"), key: "a.jpg", sortOrder: 0 },
          { photoId: suite.id("photo-b"), key: "b.jpg", sortOrder: 1 },
          { photoId: suite.id("photo-c"), key: "c.jpg", sortOrder: 2 },
        ],
      });

      const publishRes = await request
        .post(`/api/v1/listings/drafts/${draft.id}/publish`)
        .set("Authorization", `Bearer ${sellerToken}`)
        .send({})
        .expect(201);
      const listingId = publishRes.body.id;
      // contactPhone stays free text until the contact-phone slice (ADR-0056).
      await prisma.listing.update({
        where: { id: listingId },
        data: { contactPhone: "+99365000000", allowCalls: false, allowChat: true },
      });

      await request
        .post(`/api/v1/listings/${listingId}/favorite`)
        .set("Authorization", `Bearer ${buyerToken}`)
        .send({})
        .expect(201);

      const res = await request
        .get("/api/v1/favorites")
        .set("Authorization", `Bearer ${buyerToken}`)
        .expect(200);
      const parsed = ListingsSchemas.MyFavoritesResponseSchema.parse(res.body);

      expect(parsed.items).toHaveLength(1);
      expect(parsed.items[0]).toMatchObject({
        id: listingId,
        photoKeys: ["a.jpg", "b.jpg"],
        photoCount: 3,
        mileageKm: 50000,
        condition: "used",
        contactPhone: "+99365000000",
        allowCalls: false,
        allowChat: true,
      });

      // The cross-context read surface stays narrow: no contact phone.
      const listingsRead = app.get<ListingsReadPort>(LISTINGS_READ_PORT);
      const [summary] = await listingsRead.getListingSummaries([listingId]);
      expect(summary).toBeDefined();
      expect(summary).not.toHaveProperty("contactPhone");
      expect(summary).not.toHaveProperty("photoKeys");
    });

    it("excludes soft-deleted listings from favorites list", async () => {
      await seedCatalog();
      const sellerToken = await createUser("seller-1");
      const buyerToken = await createUser("buyer-1");
      const draft = await seedDraft("seller-1", validPayload);

      const publishRes = await request
        .post(`/api/v1/listings/drafts/${draft.id}/publish`)
        .set("Authorization", `Bearer ${sellerToken}`)
        .send({})
        .expect(201);
      const listingId = publishRes.body.id;

      await request
        .post(`/api/v1/listings/${listingId}/favorite`)
        .set("Authorization", `Bearer ${buyerToken}`)
        .send({})
        .expect(201);

      await request
        .delete(`/api/v1/listings/${listingId}`)
        .set("Authorization", `Bearer ${sellerToken}`)
        .expect(200);

      const res = await request
        .get("/api/v1/favorites")
        .set("Authorization", `Bearer ${buyerToken}`)
        .expect(200);

      expect(res.body.items).toHaveLength(0);
    });

    it("excludes banned listings from favorites list", async () => {
      await seedCatalog();
      const sellerToken = await createUser("seller-1");
      const buyerToken = await createUser("buyer-1");
      const draft = await seedDraft("seller-1", validPayload);

      const publishRes = await request
        .post(`/api/v1/listings/drafts/${draft.id}/publish`)
        .set("Authorization", `Bearer ${sellerToken}`)
        .send({})
        .expect(201);
      const listingId = publishRes.body.id;

      await request
        .post(`/api/v1/listings/${listingId}/favorite`)
        .set("Authorization", `Bearer ${buyerToken}`)
        .send({})
        .expect(201);

      // Cross-context fixture: banning is owned by admin moderation (covered
      // end-to-end by AdminModerationController.e2e.spec.ts). Convention in
      // test/helpers/e2eSuite.ts allows short-circuiting via prisma here.
      await prisma.listing.update({
        where: { id: listingId },
        data: { status: "banned" },
      });

      const res = await request
        .get("/api/v1/favorites")
        .set("Authorization", `Bearer ${buyerToken}`)
        .expect(200);

      expect(res.body.items).toHaveLength(0);
    });

    it("paginates favorites with cursor", async () => {
      await seedCatalog();
      const sellerToken = await createUser("seller-1");
      const buyerToken = await createUser("buyer-1");

      // Publish 3 listings
      const listingIds: string[] = [];
      for (let i = 0; i < 3; i++) {
        const draft = await seedDraft("seller-1", {
          ...validPayload,
          photos: [{ photoId: suite.id(`photo-${i}`), key: `photo${i}.jpg`, sortOrder: 0 }],
        });
        const publishRes = await request
          .post(`/api/v1/listings/drafts/${draft.id}/publish`)
          .set("Authorization", `Bearer ${sellerToken}`)
          .send({})
          .expect(201);
        listingIds.push(publishRes.body.id);
      }

      // Favorite all 3
      for (const listingId of listingIds) {
        await request
          .post(`/api/v1/listings/${listingId}/favorite`)
          .set("Authorization", `Bearer ${buyerToken}`)
          .send({})
          .expect(201);
      }

      // Page with limit=2
      const page1 = await request
        .get("/api/v1/favorites")
        .set("Authorization", `Bearer ${buyerToken}`)
        .query({ limit: 2 })
        .expect(200);

      expect(page1.body.items).toHaveLength(2);
      expect(page1.body.nextCursor).not.toBeNull();

      const page2 = await request
        .get("/api/v1/favorites")
        .set("Authorization", `Bearer ${buyerToken}`)
        .query({ limit: 2, cursor: page1.body.nextCursor })
        .expect(200);

      expect(page2.body.items).toHaveLength(1);
      expect(page2.body.nextCursor).toBeNull();
    });

    describe("activeOnly and counts", () => {
      /** Publishes one Listing per status and Favorites them, oldest first. */
      async function favoriteListingsWithStatuses(
        sellerToken: string,
        buyerToken: string,
        statuses: Array<"active" | "sold" | "archived" | "banned" | "deleted">,
      ): Promise<string[]> {
        const ids: string[] = [];
        for (const [i, status] of statuses.entries()) {
          const draft = await seedDraft("seller-1", {
            ...validPayload,
            photos: [{ photoId: suite.id(`photo-s${i}`), key: `s${i}.jpg`, sortOrder: 0 }],
          });
          const publishRes = await request
            .post(`/api/v1/listings/drafts/${draft.id}/publish`)
            .set("Authorization", `Bearer ${sellerToken}`)
            .send({})
            .expect(201);
          const listingId: string = publishRes.body.id;
          await request
            .post(`/api/v1/listings/${listingId}/favorite`)
            .set("Authorization", `Bearer ${buyerToken}`)
            .send({})
            .expect(201);
          // Cross-context fixture: status changes are owned by listing lifecycle and
          // moderation; short-circuiting via prisma is allowed here (test/helpers/e2eSuite.ts).
          if (status === "deleted") {
            await prisma.listing.update({
              where: { id: listingId },
              data: { deletedAt: new Date() },
            });
          } else if (status !== "active") {
            await prisma.listing.update({ where: { id: listingId }, data: { status } });
          }
          ids.push(listingId);
        }
        return ids;
      }

      it("returns counts and every visible Favorite when activeOnly is not sent", async () => {
        await seedCatalog();
        const sellerToken = await createUser("seller-1");
        const buyerToken = await createUser("buyer-1");
        const ids = await favoriteListingsWithStatuses(sellerToken, buyerToken, [
          "active",
          "sold",
          "archived",
          "banned",
          "deleted",
        ]);

        const res = await request
          .get("/api/v1/favorites")
          .set("Authorization", `Bearer ${buyerToken}`)
          .expect(200);
        const parsed = ListingsSchemas.MyFavoritesResponseSchema.parse(res.body);

        expect(parsed.items.map((i) => i.id)).toEqual([ids[2], ids[1], ids[0]]);
        expect(parsed.counts).toEqual({ total: 3, inactive: 2 });
      });

      it("returns only active Favorites with activeOnly=true and the same counts", async () => {
        await seedCatalog();
        const sellerToken = await createUser("seller-1");
        const buyerToken = await createUser("buyer-1");
        const ids = await favoriteListingsWithStatuses(sellerToken, buyerToken, [
          "active",
          "sold",
          "archived",
          "active",
        ]);

        const res = await request
          .get("/api/v1/favorites")
          .set("Authorization", `Bearer ${buyerToken}`)
          .query({ activeOnly: "true" })
          .expect(200);
        const parsed = ListingsSchemas.MyFavoritesResponseSchema.parse(res.body);

        expect(parsed.items.map((i) => i.id)).toEqual([ids[3], ids[0]]);
        expect(parsed.items.every((i) => i.status === "active")).toBe(true);
        expect(parsed.counts).toEqual({ total: 4, inactive: 2 });
      });

      it("fills the first activeOnly page when newer Favorites are sold", async () => {
        await seedCatalog();
        const sellerToken = await createUser("seller-1");
        const buyerToken = await createUser("buyer-1");
        const ids = await favoriteListingsWithStatuses(sellerToken, buyerToken, [
          "active",
          "active",
          "sold",
          "sold",
          "sold",
        ]);

        const page1 = await request
          .get("/api/v1/favorites")
          .set("Authorization", `Bearer ${buyerToken}`)
          .query({ activeOnly: "true", limit: 1 })
          .expect(200);

        expect(page1.body.items.map((i: { id: string }) => i.id)).toEqual([ids[1]]);
        expect(page1.body.nextCursor).not.toBeNull();
        expect(page1.body.counts).toEqual({ total: 5, inactive: 3 });

        const page2 = await request
          .get("/api/v1/favorites")
          .set("Authorization", `Bearer ${buyerToken}`)
          .query({ activeOnly: "true", limit: 1, cursor: page1.body.nextCursor })
          .expect(200);

        expect(page2.body.items.map((i: { id: string }) => i.id)).toEqual([ids[0]]);
        expect(page2.body.nextCursor).toBeNull();
        expect(page2.body.counts).toEqual({ total: 5, inactive: 3 });
      });

      it("pages over visible Listings when newer Favorites are banned or deleted", async () => {
        await seedCatalog();
        const sellerToken = await createUser("seller-1");
        const buyerToken = await createUser("buyer-1");
        const ids = await favoriteListingsWithStatuses(sellerToken, buyerToken, [
          "active",
          "sold",
          "active",
          "banned",
          "deleted",
        ]);

        const page1 = await request
          .get("/api/v1/favorites")
          .set("Authorization", `Bearer ${buyerToken}`)
          .query({ limit: 2 })
          .expect(200);

        expect(page1.body.items.map((i: { id: string }) => i.id)).toEqual([ids[2], ids[1]]);
        expect(page1.body.nextCursor).not.toBeNull();

        const page2 = await request
          .get("/api/v1/favorites")
          .set("Authorization", `Bearer ${buyerToken}`)
          .query({ limit: 2, cursor: page1.body.nextCursor })
          .expect(200);

        expect(page2.body.items.map((i: { id: string }) => i.id)).toEqual([ids[0]]);
        expect(page2.body.nextCursor).toBeNull();
      });

      it("does not skip a Favorite when the cursor Listing is sold before page 2 with activeOnly", async () => {
        await seedCatalog();
        const sellerToken = await createUser("seller-1");
        const buyerToken = await createUser("buyer-1");
        const ids = await favoriteListingsWithStatuses(sellerToken, buyerToken, [
          "active",
          "active",
          "active",
          "active",
        ]);

        const page1 = await request
          .get("/api/v1/favorites")
          .set("Authorization", `Bearer ${buyerToken}`)
          .query({ activeOnly: "true", limit: 2 })
          .expect(200);
        expect(page1.body.items.map((i: { id: string }) => i.id)).toEqual([ids[3], ids[2]]);

        // The Listing at the cursor leaves the activeOnly set before page 2.
        await prisma.listing.update({ where: { id: ids[2]! }, data: { status: "sold" } });

        const page2 = await request
          .get("/api/v1/favorites")
          .set("Authorization", `Bearer ${buyerToken}`)
          .query({ activeOnly: "true", limit: 2, cursor: page1.body.nextCursor })
          .expect(200);

        expect(page2.body.items.map((i: { id: string }) => i.id)).toEqual([ids[1], ids[0]]);
        expect(page2.body.nextCursor).toBeNull();
      });

      it("does not skip a Favorite when the cursor Listing is banned or deleted before page 2", async () => {
        await seedCatalog();
        const sellerToken = await createUser("seller-1");
        const buyerToken = await createUser("buyer-1");
        const ids = await favoriteListingsWithStatuses(sellerToken, buyerToken, [
          "active",
          "active",
          "active",
          "active",
        ]);

        const page1 = await request
          .get("/api/v1/favorites")
          .set("Authorization", `Bearer ${buyerToken}`)
          .query({ limit: 2 })
          .expect(200);
        await prisma.listing.update({ where: { id: ids[2]! }, data: { deletedAt: new Date() } });

        const page2 = await request
          .get("/api/v1/favorites")
          .set("Authorization", `Bearer ${buyerToken}`)
          .query({ limit: 2, cursor: page1.body.nextCursor })
          .expect(200);

        expect(page2.body.items.map((i: { id: string }) => i.id)).toEqual([ids[1], ids[0]]);
      });

      it("returns the next Favorites when the cursor Favorite is removed before page 2", async () => {
        await seedCatalog();
        const sellerToken = await createUser("seller-1");
        const buyerToken = await createUser("buyer-1");
        const ids = await favoriteListingsWithStatuses(sellerToken, buyerToken, [
          "active",
          "active",
          "active",
        ]);

        const page1 = await request
          .get("/api/v1/favorites")
          .set("Authorization", `Bearer ${buyerToken}`)
          .query({ limit: 1 })
          .expect(200);
        expect(page1.body.items.map((i: { id: string }) => i.id)).toEqual([ids[2]]);

        await request
          .delete(`/api/v1/listings/${ids[2]}/favorite`)
          .set("Authorization", `Bearer ${buyerToken}`)
          .expect(200);

        const page2 = await request
          .get("/api/v1/favorites")
          .set("Authorization", `Bearer ${buyerToken}`)
          .query({ limit: 1, cursor: page1.body.nextCursor })
          .expect(200);

        expect(page2.body.items.map((i: { id: string }) => i.id)).toEqual([ids[1]]);
        expect(page2.body.nextCursor).not.toBeNull();
      });

      it("returns zero counts when the User has no Favorites", async () => {
        const buyerToken = await createUser("buyer-1");

        const res = await request
          .get("/api/v1/favorites")
          .set("Authorization", `Bearer ${buyerToken}`)
          .expect(200);

        expect(res.body.items).toEqual([]);
        expect(res.body.counts).toEqual({ total: 0, inactive: 0 });
      });

      it("rejects an activeOnly value other than true or false", async () => {
        const buyerToken = await createUser("buyer-1");

        await request
          .get("/api/v1/favorites")
          .set("Authorization", `Bearer ${buyerToken}`)
          .query({ activeOnly: "yes" })
          .expect(400);
      });
    });
  });
});
