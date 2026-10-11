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
import { DomainError, LISTING_ERROR_CODES } from "../domain/types";
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
import { bullTestRoot } from "../../../../test/helpers/bullTestRoot";

// Issue #536 / ADR-0079 against real Postgres: the unique upload link, the
// atomic release and the cleanup guard are database behavior, not fakes.

const suite = defineE2eSuite("media-ownership");
type SuiteUser = "user-a" | "user-b";
const SUITE_USERS: readonly SuiteUser[] = ["user-a", "user-b"];

/** Stands in for MinIO: a presigned PUT is simulated by `put`. */
class FakeObjectStore {
  objects = new Map<string, { contentType: string; sizeBytes: number }>();
  deleted: string[] = [];

  put(key: string, contentType = "image/webp", sizeBytes = 2048): void {
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
  let generationHook: ((key: string) => Promise<void>) | undefined;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        bullTestRoot(),
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
        generate: async (originalKey: string) => {
          await generationHook?.(originalKey);
          return { variants: {
            thumbnail: `${originalKey}/thumbnail.webp`,
            list: `${originalKey}/list.webp`,
            detail: `${originalKey}/detail.webp`,
            fullscreen: `${originalKey}/fullscreen.webp`,
          } };
        },
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
    generationHook = undefined;
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
        media: { create: [0, 1, 2].map((i) => ({ kind: "image", key: `review-floor/${name}-${i}.webp`, sortOrder: i + 10 })) },
      },
    });
  }

  /** Presign over HTTP and simulate the client's direct PUT. */
  async function presignAndPut(alias: SuiteUser): Promise<string> {
    const res = await request
      .post("/api/v1/uploads/presign")
      .set("Authorization", `Bearer ${tokens[alias]}`)
      .send({ kind: "image", contentType: "image/webp", sizeBytes: 2048 })
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

  it("allows only one of two concurrent removals from a four-photo Listing", async () => {
    const listing = await createListing("user-a", "concurrent-floor");
    const key = await presignAndPut("user-a");
    const fourth = await attach("user-a", listing.id, key).expect(201);
    const baseline = await prisma.listingMedia.findFirstOrThrow({ where: { listingId: listing.id, id: { not: fourth.body.id } } });
    const responses = await Promise.all([
      removeMedia("user-a", listing.id, fourth.body.id),
      removeMedia("user-a", listing.id, baseline.id),
    ]);
    expect(responses.map((r) => r.status).sort()).toEqual([200, 400]);
    expect(responses.find((r) => r.status === 400)?.body.code).toBe("PHOTO_MINIMUM_REQUIRED");
    expect(await prisma.listingMedia.count({ where: { listingId: listing.id, kind: "image" } })).toBe(3);
  });

  it("presign, upload, attach and remove still work for the owner", async () => {
    const listing = await createListing("user-a", "listing-a");
    const key = await presignAndPut("user-a");

    const attached = await attach("user-a", listing.id, key).expect(201);
    expect(attached.body.key).toBe(key);
    const row = await prisma.listingMedia.findUniqueOrThrow({ where: { id: attached.body.id } });
    expect(row.uploadId).not.toBeNull();

    await removeMedia("user-a", listing.id, attached.body.id).expect(200);

    // ADR-0088: removal retires the upload in the same transaction and records
    // deletion work. An installed client's legacy upload stays explicitly
    // pending; the request deletes no bytes itself.
    expect(await prisma.listingMedia.count({ where: { listingId: listing.id } })).toBe(3);
    const retired = await prisma.mediaUpload.findUniqueOrThrow({ where: { key } });
    expect(retired.state).toBe("RETIRED");
    expect(await prisma.mediaUploadCleanup.findUnique({ where: { uploadId: retired.id } }))
      .toMatchObject({ status: "LEGACY_PENDING", key });
    expect(store.deleted).toEqual([]);
  });

  it("publishes a draft only with uploads the owner presigned", async () => {
    const key = await presignAndPut("user-a");
    const supportKeys = [await presignAndPut("user-a"), await presignAndPut("user-a")];
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
      // User A's own sign-in phone needs no code (ADR-0081).
      contactPhone: suite.phone("user-a"),
      allowCalls: true,
      allowChat: true,
      conditionDisclosure: { damaged: false },
      photos: [{ photoId: suite.id("photo-1"), key, sortOrder: 0 }, ...supportKeys.map((photoKey, i) => ({ photoId: suite.id(`support-${i}`), key: photoKey, sortOrder: i + 1 }))],
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
      data: { userId: suite.id("user-b"), payload: { ...payload, contactPhone: suite.phone("user-b") } },
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
      expect(await prisma.listingMedia.count({ where: { listingId: listingA.id } })).toBe(3);

      await removeMedia("user-a", listingA.id, victim.body.id).expect(404);
      expect(await prisma.listingMedia.count({ where: { listingId: listingB.id } })).toBe(4);
      expect(store.deleted).toEqual([]);
    });

    it("rejects a key that was never presigned", async () => {
      const listingA = await createListing("user-a", "listing-a");
      store.put("pending/forged-in-e2e/original.webp");

      const rejected = await attach("user-a", listingA.id, "pending/forged-in-e2e/original.webp").expect(400);

      expect(rejected.body.code).toBe("UPLOAD_NOT_AVAILABLE");
    });

    it("rejects an upload whose file never reached storage", async () => {
      const listingA = await createListing("user-a", "listing-a");
      const res = await request
        .post("/api/v1/uploads/presign")
        .set("Authorization", `Bearer ${tokens["user-a"]}`)
        .send({ kind: "image", contentType: "image/webp", sizeBytes: 2048 })
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

  it.each(["same-key duplicate", "sibling video"])(
    "preserves a victim's objects when removing the adopted row with a legacy %s",
    async (scenario) => {
      const listingA = await createListing("user-a", "listing-a");
      const listingB = await createListing("user-b", "listing-b");
      const victimKey = await presignAndPut("user-b");
      const victim = await attach("user-b", listingB.id, victimKey).expect(201);
      const siblingKey = victimKey.replace(/original\.webp$/, "original.mp4");
      let removedId = victim.body.id as string;
      let removedUser: SuiteUser = "user-b";
      let removedListing = listingB.id;
      if (scenario === "sibling video") {
        // The migration backfills each distinct key, including legacy forged siblings.
        const upload = await prisma.mediaUpload.create({ data: {
          userId: suite.id("user-a"), key: siblingKey, kind: "video",
          contentType: "video/mp4", sizeBytes: null,
        } });
        const sibling = await prisma.listingMedia.create({ data: {
          listingId: listingA.id, kind: "video", key: siblingKey, sortOrder: 0, uploadId: upload.id,
        } });
        removedId = sibling.id;
        removedUser = "user-a";
        removedListing = listingA.id;
      } else {
        await prisma.listingMedia.create({ data: {
          listingId: listingA.id, kind: "image", key: victimKey, sortOrder: 0,
        } });
      }

      await removeMedia(removedUser, removedListing, removedId).expect(200);

      expect(store.deleted).toEqual([]);
      expect(store.objects.has(victimKey)).toBe(true);
      expect(await prisma.listingMedia.count({ where: { key: victimKey } })).toBe(1);
    },
  );

  it("cannot clean a legacy chat sibling owned outside listing_media", async () => {
    const listing = await createListing("user-a", "listing-a");
    const directory = `chat-attachments/${suite.id("conversation")}/${suite.id("chat-upload")}/`;
    const victimKey = `${directory}original.webp`;
    const attackerKey = `${directory}original.mp4`;
    // The victim's chat object has no ListingMedia row. Only the legacy forged
    // video key is backfilled, just as the applied migration would do.
    store.put(victimKey);
    const upload = await prisma.mediaUpload.create({ data: {
      userId: suite.id("user-a"), key: attackerKey, kind: "video",
      contentType: "video/mp4", sizeBytes: null,
    } });
    const attacker = await prisma.listingMedia.create({ data: {
      listingId: listing.id, kind: "video", key: attackerKey, sortOrder: 0, uploadId: upload.id,
    } });

    await removeMedia("user-a", listing.id, attacker.id).expect(200);

    expect(store.deleted).toEqual([]);
    expect(store.objects.has(victimKey)).toBe(true);
    expect(await prisma.listingMedia.findUnique({ where: { id: attacker.id } })).toBeNull();
  });

  it("rolls the Listing, its media and the draft removal back when a reservation is retired before publication commits", async () => {
    const key = await presignAndPut("user-a");
    const supportKeys = [await presignAndPut("user-a"), await presignAndPut("user-a")];
    const draft = await prisma.listingDraft.create({ data: {
      userId: suite.id("user-a"), payload: {
        brandId: suite.catalog.brandId, modelId: suite.catalog.modelId,
        cityId: suite.catalog.cityId, regionId: suite.catalog.regionId,
        priceAmount: 100000, priceCurrency: "TMT", year: 2020,
        condition: "used", mileageKm: 50000, description: "Rollback evidence car",
        contactPhone: suite.phone("user-a"), allowCalls: true, allowChat: true, conditionDisclosure: { damaged: false },
        photos: [{ photoId: suite.id("rollback-photo"), key, sortOrder: 0 }, ...supportKeys.map((photoKey, i) => ({ photoId: suite.id(`rollback-support-${i}`), key: photoKey, sortOrder: i + 1 }))],
      },
    } });
    let stateDuringGeneration: string | undefined;
    generationHook = async (originalKey) => {
      if (originalKey !== key) return;
      generationHook = undefined;
      stateDuringGeneration = (await prisma.mediaUpload.findUniqueOrThrow({ where: { key } })).state;
      // What the storage scanner does to a stranded preparation.
      await prisma.mediaUpload.update({ where: { key }, data: {
        state: "RETIRED", retiredAt: new Date(), claimToken: null, claimDeadline: null,
      } });
    };

    const rejected = await request.post(`/api/v1/listings/drafts/${draft.id}/publish`)
      .set("Authorization", `Bearer ${tokens["user-a"]}`).send({});

    expect(stateDuringGeneration).toBe("PREPARING");
    expect(rejected.status).toBe(400);
    expect(rejected.body.code).toBe("UPLOAD_NOT_AVAILABLE");
    expect(await prisma.listing.count({ where: { sellerId: suite.id("user-a") } })).toBe(0);
    expect(await prisma.listingMedia.count({ where: { key } })).toBe(0);
    expect(await prisma.listingDraft.findUnique({ where: { id: draft.id } })).not.toBeNull();
    expect(await prisma.auditLog.count({ where: { actorId: suite.id("user-a"), action: "listing.published" } })).toBe(0);
  });

  it("refuses the attachment that overlaps a publication holding the upload, and publishes once", async () => {
    const listing = await createListing("user-a", "listing-a");
    const key = await presignAndPut("user-a");
    const supportKeys = [await presignAndPut("user-a"), await presignAndPut("user-a")];
    const draft = await prisma.listingDraft.create({ data: {
      userId: suite.id("user-a"), payload: {
        brandId: suite.catalog.brandId, modelId: suite.catalog.modelId,
        cityId: suite.catalog.cityId, regionId: suite.catalog.regionId,
        priceAmount: 100000, priceCurrency: "TMT", year: 2020,
        condition: "used", mileageKm: 50000, description: "Race evidence car",
        contactPhone: suite.phone("user-a"), allowCalls: true, allowChat: true, conditionDisclosure: { damaged: false },
        photos: [{ photoId: suite.id("race-photo"), key, sortOrder: 0 }, ...supportKeys.map((photoKey, i) => ({ photoId: suite.id(`race-support-${i}`), key: photoKey, sortOrder: i + 1 }))],
      },
    } });
    let reached!: () => void;
    let release!: () => void;
    const authorized = new Promise<void>((resolve) => { reached = resolve; });
    const resume = new Promise<void>((resolve) => { release = resolve; });
    generationHook = async (originalKey) => {
      if (originalKey !== key) return;
      generationHook = undefined;
      reached();
      await resume;
    };
    const publishing = request.post(`/api/v1/listings/drafts/${draft.id}/publish`)
      .set("Authorization", `Bearer ${tokens["user-a"]}`).send({}).then((response) => response);
    try {
      await Promise.race([
        authorized,
        publishing.then((response) => {
          throw new Error(`Publication completed before the race barrier: ${response.status}`);
        }),
      ]);
      // Publication reserved the upload before generating (ADR-0088), so the
      // overlapping attachment loses and writes nothing.
      const loser = await attach("user-a", listing.id, key);
      expect(loser.status).toBe(409);
      expect(loser.body.code).toBe("UPLOAD_ALREADY_ATTACHED");
      // Only the three photos the Listing already had.
      expect(await prisma.listingMedia.count({ where: { listingId: listing.id } })).toBe(3);
      release();
      const published = await publishing;
      expect(published.status).toBe(201);
      const media = await prisma.listingMedia.findMany({ where: { key } });
      expect(media.map((row) => row.listingId)).toEqual([published.body.id]);
      expect(await prisma.mediaUpload.findUniqueOrThrow({ where: { key } })).toMatchObject({
        state: "ADOPTED", claimTargetType: "listing", claimTargetId: published.body.id,
      });
      expect(await prisma.listingDraft.findUnique({ where: { id: draft.id } })).toBeNull();
    } finally {
      release();
      generationHook = undefined;
      await publishing;
    }
  });

  describe("retry and races", () => {
    it("returns the same media when the attach is retried", async () => {
      const listing = await createListing("user-a", "listing-a");
      const key = await presignAndPut("user-a");

      const first = await attach("user-a", listing.id, key).expect(201);
      const retry = await attach("user-a", listing.id, key).expect(201);

      expect(retry.body.id).toBe(first.body.id);
      expect(await prisma.listingMedia.count({ where: { listingId: listing.id } })).toBe(4);
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
      expect(await prisma.listingMedia.count({ where: { listingId: listing.id } })).toBe(4);
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

    it("records deletion work once when the same media is removed concurrently", async () => {
      const listing = await createListing("user-a", "listing-a");
      const key = await presignAndPut("user-a");
      const attached = await attach("user-a", listing.id, key).expect(201);

      const results = await Promise.all([
        removeMedia("user-a", listing.id, attached.body.id),
        removeMedia("user-a", listing.id, attached.body.id),
      ]);

      expect(results.map((r) => r.status).sort()).toEqual([200, 404]);
      const upload = await prisma.mediaUpload.findUniqueOrThrow({ where: { key } });
      expect(upload.state).toBe("RETIRED");
      expect(await prisma.mediaUploadCleanup.count({ where: { uploadId: upload.id } })).toBe(1);
      expect(store.deleted).toEqual([]);
      expect(await prisma.listingMedia.count({ where: { listingId: listing.id } })).toBe(3);
    });

    it("cannot re-attach an upload after its media was removed", async () => {
      const listing = await createListing("user-a", "listing-a");
      const key = await presignAndPut("user-a");
      const attached = await attach("user-a", listing.id, key).expect(201);
      await removeMedia("user-a", listing.id, attached.body.id).expect(200);

      const rejected = await attach("user-a", listing.id, key).expect(400);

      expect(rejected.body.code).toBe("UPLOAD_NOT_AVAILABLE");
      expect(await prisma.listingMedia.count({ where: { listingId: listing.id } })).toBe(3);
    });
  });

  describe("publish retry after a transient failure (#735)", () => {
    const publishPayload = (keys: string[]) => ({
      brandId: suite.catalog.brandId,
      modelId: suite.catalog.modelId,
      cityId: suite.catalog.cityId,
      regionId: suite.catalog.regionId,
      priceAmount: 100000,
      priceCurrency: "TMT",
      year: 2020,
      condition: "used",
      mileageKm: 50000,
      description: "Retry evidence car",
      // The seller's own sign-in phone needs no code (ADR-0081).
      contactPhone: suite.phone("user-a"),
      allowCalls: true,
      allowChat: true,
      conditionDisclosure: { damaged: false },
      photos: keys.map((key, i) => ({ photoId: suite.id(`retry-photo-${i}`), key, sortOrder: i })),
    });

    async function draftWithPhotos(keys: string[]) {
      return prisma.listingDraft.create({ data: { userId: suite.id("user-a"), payload: publishPayload(keys) } });
    }

    function publish(draftId: string) {
      return request
        .post(`/api/v1/listings/drafts/${draftId}/publish`)
        .set("Authorization", `Bearer ${tokens["user-a"]}`)
        .send({});
    }

    it("releases the photos when generation fails transiently and republishes with the same photos on retry", async () => {
      const keys = [await presignAndPut("user-a"), await presignAndPut("user-a"), await presignAndPut("user-a")] as [string, string, string];
      const draft = await draftWithPhotos(keys);
      let failed = false;
      generationHook = async () => {
        if (failed) return;
        failed = true;
        generationHook = undefined;
        throw new Error("storage timeout");
      };

      const rejected = await publish(draft.id);

      // A transient storage failure is a plain 500; the draft is untouched.
      expect(rejected.status).toBe(500);
      expect(await prisma.listingDraft.findUnique({ where: { id: draft.id } })).not.toBeNull();
      expect(await prisma.listing.count({ where: { sellerId: suite.id("user-a") } })).toBe(0);
      // #735 / ADR-0089: the failure released the reservation. No upload is
      // retired and nothing is recorded for deletion, so the same photos can
      // be adopted by a retry of the same draft.
      const uploads = await prisma.mediaUpload.findMany({ where: { key: { in: keys } } });
      expect(uploads.map((u) => u.state).sort()).toEqual(["AVAILABLE", "AVAILABLE", "AVAILABLE"]);
      expect(await prisma.mediaUploadCleanup.count({ where: { uploadId: { in: uploads.map((u) => u.id) } } })).toBe(0);

      const published = await publish(draft.id).expect(201);

      const media = await prisma.listingMedia.findMany({ where: { listingId: published.body.id } });
      expect(media.map((m) => m.key).sort()).toEqual([...keys].sort());
      expect((await prisma.mediaUpload.findMany({ where: { key: { in: keys } } })).map((u) => u.state).sort())
        .toEqual(["ADOPTED", "ADOPTED", "ADOPTED"]);
    });

    it("names the photo, retires only that upload and leaves the others adoptable when a photo is permanently unusable", async () => {
      const keys = [await presignAndPut("user-a"), await presignAndPut("user-a"), await presignAndPut("user-a")] as [string, string, string];
      const draft = await draftWithPhotos(keys);
      generationHook = async (originalKey) => {
        if (originalKey !== keys[1]) return;
        generationHook = undefined;
        // What SharpImageVariantGenerator raises for bytes that can never be an image.
        throw new DomainError(LISTING_ERROR_CODES.UPLOAD_OBJECT_INVALID, "Uploaded file is not a usable image");
      };

      const rejected = await publish(draft.id);

      expect(rejected.status).toBe(400);
      expect(rejected.body).toMatchObject({
        code: "UPLOAD_OBJECT_INVALID",
        details: { key: keys[1], photoId: suite.id("retry-photo-1") },
      });
      const bad = await prisma.mediaUpload.findUniqueOrThrow({ where: { key: keys[1] } });
      expect(bad.state).toBe("RETIRED");
      expect(await prisma.mediaUploadCleanup.count({ where: { uploadId: bad.id } })).toBe(1);
      expect(await prisma.mediaUpload.findUniqueOrThrow({ where: { key: keys[0] } })).toMatchObject({ state: "AVAILABLE" });
      expect(await prisma.mediaUpload.findUniqueOrThrow({ where: { key: keys[2] } })).toMatchObject({ state: "AVAILABLE" });
      expect(await prisma.listing.count({ where: { sellerId: suite.id("user-a") } })).toBe(0);
      expect(await prisma.listingDraft.findUnique({ where: { id: draft.id } })).not.toBeNull();
    });

    it("refuses an overlapping attachment while a retry of the released photos is in flight", async () => {
      const listing = await createListing("user-a", "listing-a");
      const keys = [await presignAndPut("user-a"), await presignAndPut("user-a"), await presignAndPut("user-a")] as [string, string, string];
      const draft = await draftWithPhotos(keys);
      let failed = false;
      let signalInFlight!: () => void;
      let releaseGeneration!: () => void;
      const inFlight = new Promise<void>((resolve) => {
        signalInFlight = resolve;
      });
      const hold = new Promise<void>((resolve) => {
        releaseGeneration = resolve;
      });
      generationHook = async (originalKey) => {
        if (!failed) {
          failed = true;
          generationHook = async (retryKey) => {
            if (retryKey === keys[0]) {
              signalInFlight();
              await hold;
            }
          };
          throw new Error("storage timeout");
        }
      };

      await publish(draft.id).expect(500);
      const retrying = publish(draft.id).then((response) => response);
      await inFlight;
      try {
        // The retry re-reserved the photos, so the overlapping attachment
        // loses exactly as it did against the first attempt (#721).
        const loser = await attach("user-a", listing.id, keys[0]);
        expect(loser.status).toBe(409);
        expect(loser.body.code).toBe("UPLOAD_ALREADY_ATTACHED");
        expect(await prisma.listingMedia.count({ where: { listingId: listing.id } })).toBe(3);
      } finally {
        releaseGeneration();
      }
      const published = await retrying;
      expect(published.status).toBe(201);
      expect(await prisma.listingMedia.findMany({ where: { listingId: published.body.id } })).toHaveLength(3);
    });
  });
});
