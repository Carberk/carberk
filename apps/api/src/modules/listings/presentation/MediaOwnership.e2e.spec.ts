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
import { PrismaService } from "@auto-tm/db";

import { ListingsModule } from "../listings.module";
import { IdentityModule } from "../../identity/identity.module";
import { EnvSchema } from "../../../env.schema";
import { GlobalErrorFilter } from "../../../common/error.filter";
import { JwtAuthGuard } from "../../../common/jwt-auth.guard";
import { mintUserJwt } from "../../../../test/helpers/mintUserJwt";
import {
  cleanSuiteFixtures,
  defineE2eSuite,
  seedSuiteCatalog,
} from "../../../../test/helpers/e2eSuite";
import { IMAGE_VARIANT_GENERATOR } from "../domain/ports/ImageVariantGenerator";
import { LISTING_EVENT_PUBLISHER } from "../domain/ports/ListingEventPublisher";
import { MEDIA_OBJECT_INSPECTOR } from "../domain/ports/MediaObjectInspector";
import { MEDIA_STORAGE_PORT } from "../domain/ports/MediaStoragePort";

// Issue #536 / ADR-0079 against real Postgres: the unique upload link, the
// atomic release and the cleanup guard are database behavior, not fakes.

const suite = defineE2eSuite("media-ownership");
type SuiteUser = "user-a" | "user-b";
const SUITE_USERS: readonly SuiteUser[] = ["user-a", "user-b"];

/** Stands in for MinIO: a presigned PUT is simulated by `put`. */
class FakeObjectStore {
  objects = new Map<string, { contentType: string; sizeBytes: number }>();
  deleted: string[] = [];

  put(key: string, contentType = "image/jpeg", sizeBytes = 2048): void {
    this.objects.set(key, { contentType, sizeBytes });
  }

  presignUpload = async ({ key }: { key: string }) => ({
    url: `https://media.test/presigned/${key}`,
    key,
  });

  resolvePublicUrl = (key: string) => `https://media.test/${key}`;

  deleteObject = async (key: string) => {
    this.deleted.push(key);
    this.objects.delete(key);
  };

  inspect = async (key: string) => this.objects.get(key) ?? null;
}

describe("Listing media upload ownership e2e (#536)", () => {
  const store = new FakeObjectStore();
  let app: NestFastifyApplication;
  let request: ReturnType<typeof supertest>;
  let prisma: PrismaService;
  let tokens: Record<SuiteUser, string>;

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
      .overrideProvider(MEDIA_STORAGE_PORT)
      .useValue(store)
      .overrideProvider(MEDIA_OBJECT_INSPECTOR)
      .useValue(store)
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
    app.useGlobalGuards(new JwtAuthGuard(app.get(Reflector), app.get(JwtService)));
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
    store.objects.clear();
    store.deleted = [];
    await cleanSuiteFixtures(prisma, suite, { userAliases: SUITE_USERS });
    await seedSuiteCatalog(prisma, suite);
    tokens = { "user-a": "", "user-b": "" };
    for (const alias of SUITE_USERS) {
      await prisma.user.create({
        data: { id: suite.id(alias), phone: suite.phone(alias), phoneVerifiedAt: new Date(), role: "buyer" },
      });
      tokens[alias] = mintUserJwt(suite.id(alias));
    }
  });

  async function createListing(alias: SuiteUser, name: string) {
    return prisma.listing.create({
      data: {
        id: suite.id(name),
        sellerId: suite.id(alias),
        status: "active",
        brandId: suite.catalog.brandId,
        modelId: suite.catalog.modelId,
        cityId: suite.catalog.cityId,
        priceAmount: 100000,
        priceCurrency: "TMT",
        publishedAt: new Date(),
      },
    });
  }

  /** Presign over HTTP and simulate the client's direct PUT. */
  async function presignAndPut(alias: SuiteUser): Promise<string> {
    const res = await request
      .post("/api/v1/uploads/presign")
      .set("Authorization", `Bearer ${tokens[alias]}`)
      .send({ kind: "image", contentType: "image/jpeg", sizeBytes: 2048 })
      .expect(201);
    store.put(res.body.key);
    return res.body.key as string;
  }

  function attach(alias: SuiteUser, listingId: string, key: string, sortOrder = 0) {
    return request
      .post(`/api/v1/listings/${listingId}/media/attach`)
      .set("Authorization", `Bearer ${tokens[alias]}`)
      .send({ key, kind: "image", sortOrder });
  }

  function removeMedia(alias: SuiteUser, listingId: string, mediaId: string) {
    return request
      .delete(`/api/v1/listings/${listingId}/media/${mediaId}`)
      .set("Authorization", `Bearer ${tokens[alias]}`);
  }

  it("presign, upload, attach and remove still work for the owner", async () => {
    const listing = await createListing("user-a", "listing-a");
    const key = await presignAndPut("user-a");

    const attached = await attach("user-a", listing.id, key).expect(201);
    expect(attached.body.key).toBe(key);
    const row = await prisma.listingMedia.findUniqueOrThrow({ where: { id: attached.body.id } });
    expect(row.uploadId).not.toBeNull();

    await removeMedia("user-a", listing.id, attached.body.id).expect(200);

    expect(await prisma.listingMedia.count({ where: { listingId: listing.id } })).toBe(0);
    expect(await prisma.mediaUpload.count({ where: { key } })).toBe(0);
    const prefix = key.replace(/original\.jpg$/, "");
    expect(store.deleted.length).toBeGreaterThan(0);
    expect(store.deleted.every((k) => k.startsWith(prefix))).toBe(true);
  });

  it("publishes a draft only with uploads the owner presigned", async () => {
    const key = await presignAndPut("user-a");
    const payload = {
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
      photos: [{ photoId: suite.id("photo-1"), key, sortOrder: 0 }],
    };
    await prisma.exchangeRate.upsert({
      where: { fromCurrency_toCurrency: { fromCurrency: "TMT", toCurrency: "TMT" } },
      create: { fromCurrency: "TMT", toCurrency: "TMT", rate: 1 },
      update: { rate: 1 },
    });
    const ownDraft = await prisma.listingDraft.create({
      data: { userId: suite.id("user-a"), payload },
    });
    // User B holds the same key in their own draft: known, but never presigned for B.
    const strangerDraft = await prisma.listingDraft.create({
      data: { userId: suite.id("user-b"), payload },
    });

    const rejected = await request
      .post(`/api/v1/listings/drafts/${strangerDraft.id}/publish`)
      .set("Authorization", `Bearer ${tokens["user-b"]}`)
      .send({})
      .expect(400);
    expect(rejected.body.code).toBe("UPLOAD_NOT_AVAILABLE");
    expect(await prisma.listing.count({ where: { sellerId: suite.id("user-b") } })).toBe(0);

    const published = await request
      .post(`/api/v1/listings/drafts/${ownDraft.id}/publish`)
      .set("Authorization", `Bearer ${tokens["user-a"]}`)
      .send({})
      .expect(201);
    const media = await prisma.listingMedia.findFirstOrThrow({ where: { listingId: published.body.id } });
    expect(media.uploadId).not.toBeNull();

    // The same upload cannot back a second Listing.
    const reuseDraft = await prisma.listingDraft.create({
      data: { userId: suite.id("user-a"), payload },
    });
    const reused = await request
      .post(`/api/v1/listings/drafts/${reuseDraft.id}/publish`)
      .set("Authorization", `Bearer ${tokens["user-a"]}`)
      .send({})
      .expect(409);
    expect(reused.body.code).toBe("UPLOAD_ALREADY_ATTACHED");
  });

  describe("cross-User adoption", () => {
    it("rejects User A attaching the key User B publicly exposes, and removal never reaches B's objects", async () => {
      const listingA = await createListing("user-a", "listing-a");
      const listingB = await createListing("user-b", "listing-b");
      const victimKey = await presignAndPut("user-b");
      const victim = await attach("user-b", listingB.id, victimKey).expect(201);

      const rejected = await attach("user-a", listingA.id, victimKey).expect(400);
      expect(rejected.body.code).toBe("UPLOAD_NOT_AVAILABLE");
      expect(await prisma.listingMedia.count({ where: { listingId: listingA.id } })).toBe(0);

      await removeMedia("user-a", listingA.id, victim.body.id).expect(404);
      expect(await prisma.listingMedia.count({ where: { listingId: listingB.id } })).toBe(1);
      expect(store.deleted).toEqual([]);
    });

    it("rejects a key that was never presigned", async () => {
      const listingA = await createListing("user-a", "listing-a");
      store.put("pending/forged-in-e2e/original.jpg");

      const rejected = await attach("user-a", listingA.id, "pending/forged-in-e2e/original.jpg").expect(400);

      expect(rejected.body.code).toBe("UPLOAD_NOT_AVAILABLE");
    });

    it("rejects an upload whose file never reached storage", async () => {
      const listingA = await createListing("user-a", "listing-a");
      const res = await request
        .post("/api/v1/uploads/presign")
        .set("Authorization", `Bearer ${tokens["user-a"]}`)
        .send({ kind: "image", contentType: "image/jpeg", sizeBytes: 2048 })
        .expect(201);

      const rejected = await attach("user-a", listingA.id, res.body.key).expect(400);

      expect(rejected.body.code).toBe("UPLOAD_OBJECT_INVALID");
    });

    it("removes a pre-existing duplicate row without deleting the original owner's objects", async () => {
      const listingA = await createListing("user-a", "listing-a");
      const listingB = await createListing("user-b", "listing-b");
      const victimKey = await presignAndPut("user-b");
      await attach("user-b", listingB.id, victimKey).expect(201);
      // What the attack left behind before the fix: a row with the key and no upload.
      const duplicate = await prisma.listingMedia.create({
        data: { listingId: listingA.id, kind: "image", key: victimKey, sortOrder: 0 },
      });

      await removeMedia("user-a", listingA.id, duplicate.id).expect(200);

      expect(store.deleted).toEqual([]);
      expect(store.objects.has(victimKey)).toBe(true);
      expect(await prisma.mediaUpload.count({ where: { key: victimKey } })).toBe(1);
    });
  });

  describe("retry and races", () => {
    it("returns the same media when the attach is retried", async () => {
      const listing = await createListing("user-a", "listing-a");
      const key = await presignAndPut("user-a");

      const first = await attach("user-a", listing.id, key).expect(201);
      const retry = await attach("user-a", listing.id, key).expect(201);

      expect(retry.body.id).toBe(first.body.id);
      expect(await prisma.listingMedia.count({ where: { listingId: listing.id } })).toBe(1);
    });

    it("keeps one row when the same attach is sent twice concurrently", async () => {
      const listing = await createListing("user-a", "listing-a");
      const key = await presignAndPut("user-a");

      const [one, two] = await Promise.all([
        attach("user-a", listing.id, key),
        attach("user-a", listing.id, key),
      ]);

      expect([one.status, two.status]).toEqual([201, 201]);
      expect(one.body.id).toBe(two.body.id);
      expect(await prisma.listingMedia.count({ where: { listingId: listing.id } })).toBe(1);
    });

    it("lets one upload back only one Listing when attached concurrently to two", async () => {
      const first = await createListing("user-a", "listing-a");
      const second = await createListing("user-a", "listing-a2");
      const key = await presignAndPut("user-a");

      const results = await Promise.all([
        attach("user-a", first.id, key),
        attach("user-a", second.id, key),
      ]);

      expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
      expect(await prisma.listingMedia.count({ where: { key } })).toBe(1);
    });

    it("deletes storage objects once when the same media is removed concurrently", async () => {
      const listing = await createListing("user-a", "listing-a");
      const key = await presignAndPut("user-a");
      const attached = await attach("user-a", listing.id, key).expect(201);

      const results = await Promise.all([
        removeMedia("user-a", listing.id, attached.body.id),
        removeMedia("user-a", listing.id, attached.body.id),
      ]);

      expect(results.map((r) => r.status).sort()).toEqual([200, 404]);
      expect(new Set(store.deleted).size).toBe(store.deleted.length);
      expect(await prisma.listingMedia.count({ where: { listingId: listing.id } })).toBe(0);
    });

    it("cannot re-attach an upload after its media was removed", async () => {
      const listing = await createListing("user-a", "listing-a");
      const key = await presignAndPut("user-a");
      const attached = await attach("user-a", listing.id, key).expect(201);
      await removeMedia("user-a", listing.id, attached.body.id).expect(200);

      const rejected = await attach("user-a", listing.id, key).expect(400);

      expect(rejected.body.code).toBe("UPLOAD_NOT_AVAILABLE");
      expect(await prisma.listingMedia.count({ where: { listingId: listing.id } })).toBe(0);
    });
  });
});
