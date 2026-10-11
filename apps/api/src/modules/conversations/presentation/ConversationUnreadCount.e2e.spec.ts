import "reflect-metadata";

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

import { ConversationsModule } from "../conversations.module";
import { ListingsModule } from "../../listings/listings.module";
import { IdentityModule } from "../../identity/identity.module";
import { IMAGE_VARIANT_GENERATOR } from "../../listings/domain/ports/ImageVariantGenerator";
import { LISTING_EVENT_PUBLISHER } from "../../listings/domain/ports/ListingEventPublisher";
import { MEDIA_OBJECT_INSPECTOR } from "../../listings/domain/ports/MediaObjectInspector";
import { GlobalErrorFilter } from "../../../common/error.filter";
import { JwtAuthGuard } from "../../../common/jwt-auth.guard";
import { EnvSchema } from "../../../env.schema";
import { mintUserJwt } from "../../../../test/helpers/mintUserJwt";
import {
  cleanSuiteFixtures,
  defineE2eSuite,
  fakeMediaObjectInspector,
  seedPresignedPhotos,
  seedSuiteCatalog,
} from "../../../../test/helpers/e2eSuite";
import { bullTestRoot } from "../../../../test/helpers/bullTestRoot";

const suite = defineE2eSuite("conversation-unread-count");
type SuiteUser = "seller-1" | "buyer-1" | "buyer-2" | "loner";
const SUITE_USERS: readonly SuiteUser[] = [
  "seller-1",
  "buyer-1",
  "buyer-2",
  "loner",
];

describe("Conversation unread count e2e", () => {
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
        EventEmitterModule.forRoot(),
        bullTestRoot(),
        IdentityModule,
        ListingsModule,
        ConversationsModule,
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
            thumbnail: `${originalKey}/thumbnail.webp`,
            list: `${originalKey}/list.webp`,
            detail: `${originalKey}/detail.webp`,
            fullscreen: `${originalKey}/fullscreen.webp`,
          },
        }),
      })
      .overrideProvider(LISTING_EVENT_PUBLISHER)
      .useValue({ emit: async () => {} })
      .compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    app.useGlobalGuards(
      new JwtAuthGuard(app.get(Reflector), app.get(JwtService)),
    );
    app.useGlobalFilters(new GlobalErrorFilter());
    await app.listen(0, "127.0.0.1");
    request = supertest(app.getHttpServer());
    prisma = app.get(PrismaService);
  }, 60_000);

  afterAll(async () => {
    await app.close();
  }, 60_000);

  beforeEach(async () => {
    await cleanSuiteFixtures(prisma, suite, { userAliases: SUITE_USERS });
  });

  async function createUser(alias: SuiteUser): Promise<string> {
    await prisma.user.create({
      data: {
        id: suite.id(alias),
        phone: suite.phone(alias),
        phoneVerifiedAt: new Date(),
        role: "buyer",
      },
    });
    return mintUserJwt(suite.id(alias));
  }

  async function publishListing(sellerToken: string): Promise<string> {
    await seedSuiteCatalog(prisma, suite);
    // TMT→TMT is a shared global singleton: upsert, never delete.
    await prisma.exchangeRate.upsert({
      where: {
        fromCurrency_toCurrency: { fromCurrency: "TMT", toCurrency: "TMT" },
      },
      create: { fromCurrency: "TMT", toCurrency: "TMT", rate: 1 },
      update: { rate: 1 },
    });
    const payload = await seedPresignedPhotos(prisma, suite.id("seller-1"), {
      brandId: suite.catalog.brandId,
      modelId: suite.catalog.modelId,
      cityId: suite.catalog.cityId,
      regionId: suite.catalog.regionId,
      priceAmount: 100000,
      priceCurrency: "TMT",
      year: 2020,
      condition: "used",
      mileageKm: 50000,
      description: "Unread count test car",
      contactPhone: suite.phone("seller-1"),
      allowCalls: true,
      allowChat: true,
      conditionDisclosure: { damaged: false },
      photos: [0, 1, 2].map((index) => ({ photoId: suite.id(`photo-${index + 1}`), key: `photo1.webp-${index}`, sortOrder: index })),
    } satisfies Record<string, unknown>);
    const draft = await prisma.listingDraft.create({
      data: {
        userId: suite.id("seller-1"),
        payload: payload as Prisma.InputJsonValue,
      },
    });
    const res = await request
      .post(`/api/v1/listings/drafts/${draft.id}/publish`)
      .set("Authorization", `Bearer ${sellerToken}`)
      .send({})
      .expect(201);
    return res.body.id as string;
  }

  async function openConversation(buyerToken: string, listingId: string) {
    const res = await request
      .post("/api/v1/conversations")
      .set("Authorization", `Bearer ${buyerToken}`)
      .send({ listingId })
      .expect(201);
    return res.body.id as string;
  }

  async function send(token: string, conversationId: string, text: string) {
    const res = await request
      .post(`/api/v1/conversations/${conversationId}/messages`)
      .set("Authorization", `Bearer ${token}`)
      .send({ text })
      .expect(201);
    return res.body.id as string;
  }

  async function unreadCount(token: string) {
    return request
      .get("/api/v1/conversations/unread-count")
      .set("Authorization", `Bearer ${token}`);
  }

  async function listedUnreadSum(token: string): Promise<number> {
    const res = await request
      .get("/api/v1/conversations?limit=50")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    return (res.body.items as Array<{ unreadCount: number }>).reduce(
      (sum, item) => sum + item.unreadCount,
      0,
    );
  }

  /** The seller holds two Conversations on one Listing, one with each buyer. */
  async function seedSellerInbox() {
    const sellerToken = await createUser("seller-1");
    const buyer1Token = await createUser("buyer-1");
    const buyer2Token = await createUser("buyer-2");
    const listingId = await publishListing(sellerToken);
    const withBuyer1 = await openConversation(buyer1Token, listingId);
    const withBuyer2 = await openConversation(buyer2Token, listingId);
    return { sellerToken, buyer1Token, buyer2Token, withBuyer1, withBuyer2 };
  }

  it("counts other participants' Messages across Conversations, matching the list", async () => {
    const { sellerToken, buyer1Token, buyer2Token, withBuyer1, withBuyer2 } =
      await seedSellerInbox();

    await send(buyer1Token, withBuyer1, "one");
    await send(buyer1Token, withBuyer1, "two");
    await send(sellerToken, withBuyer1, "my own reply is not unread");
    await send(buyer2Token, withBuyer2, "three");
    await send(buyer2Token, withBuyer2, "four");

    const res = await unreadCount(sellerToken);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ count: 4 });
    expect(await listedUnreadSum(sellerToken)).toBe(4);
  });

  it("leaves out deleted Messages and keeps muted Conversations", async () => {
    const { sellerToken, buyer2Token, withBuyer2 } = await seedSellerInbox();
    await send(buyer2Token, withBuyer2, "kept");
    const removed = await send(buyer2Token, withBuyer2, "removed");
    await request
      .delete(`/api/v1/conversations/${withBuyer2}/messages/${removed}`)
      .set("Authorization", `Bearer ${buyer2Token}`)
      .expect(200);
    await request
      .post(`/api/v1/conversations/${withBuyer2}/mute`)
      .set("Authorization", `Bearer ${sellerToken}`)
      .send({ muted: true })
      .expect(201);

    const res = await unreadCount(sellerToken);

    expect(res.body).toEqual({ count: 1 });
    expect(await listedUnreadSum(sellerToken)).toBe(1);
  });

  it("drops Messages at or before the read watermark", async () => {
    const { sellerToken, buyer1Token, buyer2Token, withBuyer1, withBuyer2 } =
      await seedSellerInbox();
    await send(buyer1Token, withBuyer1, "one");
    await send(buyer2Token, withBuyer2, "two");
    await send(buyer2Token, withBuyer2, "three");

    await request
      .post(`/api/v1/conversations/${withBuyer2}/watermark`)
      .set("Authorization", `Bearer ${sellerToken}`)
      .send({ lastReadAt: new Date().toISOString() })
      .expect(201);

    const res = await unreadCount(sellerToken);

    expect(res.body).toEqual({ count: 1 });
    expect(await listedUnreadSum(sellerToken)).toBe(1);
  });

  it("returns 0 for a User with no Conversations", async () => {
    const lonerToken = await createUser("loner");

    const res = await unreadCount(lonerToken);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ count: 0 });
  });

  it("answers 401 when signed out", async () => {
    const res = await request.get("/api/v1/conversations/unread-count");

    expect(res.status).toBe(401);
  });

  it("is not read as a Conversation ID", async () => {
    const lonerToken = await createUser("loner");

    const res = await unreadCount(lonerToken);

    expect(res.body).not.toHaveProperty("code", "VALIDATION_FAILED");
    expect(res.body).toHaveProperty("count");
  });
});
