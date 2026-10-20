import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import {
  CreateBucketCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import sharp from "sharp";
import { GenericContainer, Wait, type StartedTestContainer } from "testcontainers";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { PrismaClient } from "../generated/prisma/client/client";
import { DEMO_CARS, DEMO_SELLERS } from "../scripts/demo-inventory/content";
import { DEMO_PHOTO_MANIFEST } from "../scripts/demo-inventory/manifest";
import {
  DEMO_ID_PREFIX,
  DEMO_OBJECT_PREFIX,
  demoListingId,
  demoSellerId,
  demoSellerPhone,
} from "../scripts/demo-inventory/marker";
import type * as PhotosModule from "../scripts/demo-inventory/photos";
import { removeDemoInventory } from "../scripts/demo-inventory/remove";
import { DEMO_UPLOAD_CONCURRENCY, seedDemoInventory } from "../scripts/demo-inventory/seed";
import { createS3ObjectStore, type ObjectStore } from "../scripts/demo-inventory/storage";

import { trackPoolClientEnds } from "./helpers/track-pool-client-ends";

// Every stub photo is the same buffer, so the real preparation runs once and each seed reuses its
// files. Preparing about 300 photos per seed, four seeds a run, cost minutes of CPU on a CI runner
// and tested nothing more: encoding the variants is the same work for each identical input.
vi.mock("../scripts/demo-inventory/photos", async (importOriginal) => {
  const actual = await importOriginal<typeof PhotosModule>();
  const prepared = new WeakMap<Buffer, Promise<PhotosModule.PreparedPhoto>>();
  return {
    ...actual,
    preparePhoto(source: Buffer): Promise<PhotosModule.PreparedPhoto> {
      let result = prepared.get(source);
      if (!result) {
        result = actual.preparePhoto(source);
        prepared.set(source, result);
      }
      return result;
    },
  };
});

const run = promisify(execFile);

const BUCKET = "listing-photos";
const CHAT_BUCKET = "chat-attachments";
const packageDir = fileURLToPath(new URL("..", import.meta.url));
const DAY = 86_400_000;
const FIRST_RUN = new Date("2026-10-06T09:00:00.000Z");
const SECOND_RUN = new Date("2026-10-09T15:30:00.000Z");
/** Each seed uploads about 1,500 objects; a CI runner is several times slower than a laptop. */
const SEED_TIMEOUT = 120_000;

const REAL_SELLER = "0a000000-0000-4000-8000-000000000001";
const REAL_BUYER = "0a000000-0000-4000-8000-000000000002";
const REAL_LISTING = "0a000000-0000-4000-8000-000000000101";
const REAL_CONVERSATION = "0a000000-0000-4000-8000-000000000201";
const REAL_OBJECT = "pending/0a000000-0000-4000-8000-000000000301/original.webp";
const REAL_CHAT_PHOTO = `chat-attachments/${REAL_CONVERSATION}/0a000000-0000-4000-8000-000000000401/original.webp`;

const photoCount = DEMO_CARS.reduce(
  (sum, car) => sum + (DEMO_PHOTO_MANIFEST.listings[car.slug]?.photos.length ?? 0),
  0,
);

/** The value, or a failed test when it is missing. */
function must<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error("Expected a value");
  return value;
}

describe("demo inventory seed and removal — Testcontainers Postgres and MinIO", () => {
  let postgres: StartedPostgreSqlContainer;
  let minio: StartedTestContainer;
  let pool: Pool;
  let waitForClientEnds: ReturnType<typeof trackPoolClientEnds> | undefined;
  let db: PrismaClient;
  let s3: S3Client;
  let storage: ObjectStore;
  let downloads: string[];
  let loadsInFlight = 0;
  let maxLoadsInFlight = 0;
  let putsInFlight = 0;
  let maxPutsInFlight = 0;
  let photos: PhotosModule.PhotoSource;
  /** What the first seed drew per Listing, to compare with a seed after a removal. */
  let firstDraw: { id: string; publishedAt: Date | null; viewCount: number }[];

  beforeAll(async () => {
    // "An empty migrated database with the catalog seeded": the real migrations and catalog seed,
    // run while MinIO starts.
    const migrateAndSeedCatalog = async (started: StartedPostgreSqlContainer) => {
      const env = { ...process.env, DATABASE_URL: started.getConnectionUri() };
      await run(`${packageDir}node_modules/.bin/prisma`, ["migrate", "deploy"], { cwd: packageDir, env });
      await run(`${packageDir}node_modules/.bin/tsx`, ["src/seed.ts"], { cwd: packageDir, env });
      return started;
    };
    [postgres, minio] = await Promise.all([
      new PostgreSqlContainer("postgres:16-alpine")
        .withUsername("auto_tm")
        .withPassword("auto_tm_pass")
        .withDatabase("auto_tm_test")
        // A throwaway database: no commit waits for the disk. The catalog seed alone commits
        // about 5,500 times, which took most of this setup on a CI runner.
        .withCommand(["postgres", "-c", "fsync=off", "-c", "synchronous_commit=off", "-c", "full_page_writes=off"])
        .start()
        .then(migrateAndSeedCatalog),
      new GenericContainer("cgr.dev/chainguard/minio@sha256:4692462f35d97d7e82c30371d82f057703c5d9489bcae726010594c812f2d285")
        .withEnvironment({ MINIO_ROOT_USER: "minioadmin", MINIO_ROOT_PASSWORD: "minioadmin" })
        .withCommand(["server", "/data"])
        .withExposedPorts(9000)
        .withWaitStrategy(Wait.forHttp("/minio/health/live", 9000))
        .start(),
    ]);

    pool = new Pool({ connectionString: postgres.getConnectionUri() });
    waitForClientEnds = trackPoolClientEnds(pool);
    db = new PrismaClient({ adapter: new PrismaPg(pool) });

    const endpoint = `http://${minio.getHost()}:${minio.getMappedPort(9000)}`;
    const credentials = { accessKeyId: "minioadmin", secretAccessKey: "minioadmin" };
    s3 = new S3Client({ endpoint, region: "us-east-1", credentials, forcePathStyle: true });
    await s3.send(new CreateBucketCommand({ Bucket: BUCKET }));
    await s3.send(new CreateBucketCommand({ Bucket: CHAT_BUCKET }));
    const s3Store = createS3ObjectStore({
      endpoint,
      region: "us-east-1",
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
    });
    // Counts the uploads in flight, so the test sees the seed's upload concurrency.
    storage = {
      ...s3Store,
      async put(key, body, contentType) {
        putsInFlight += 1;
        maxPutsInFlight = Math.max(maxPutsInFlight, putsInFlight);
        try {
          await s3Store.put(key, body, contentType);
        } finally {
          putsInFlight -= 1;
        }
      },
    };

    // The download is stubbed: no test reaches Commons. The stub photo carries EXIF and an
    // orientation tag, as a real camera file would, so the seed has metadata to remove.
    // It is small on purpose: preparing it into five files is real work (see the `preparePhoto`
    // mock above), and a full-size frame makes that slower without testing anything more.
    const stub = await sharp({ create: { width: 480, height: 320, channels: 3, background: "#7a8fa3" } })
      .jpeg()
      .withExif({ IFD0: { Artist: "A Real Photographer", Copyright: "CC BY-SA 4.0" } })
      .withMetadata({ orientation: 6 })
      .toBuffer();
    downloads = [];
    photos = {
      async load(photo) {
        loadsInFlight += 1;
        maxLoadsInFlight = Math.max(maxLoadsInFlight, loadsInFlight);
        downloads.push(photo.sourceFile);
        // Yield, so an overlapping second load would be seen.
        await new Promise((resolve) => setImmediate(resolve));
        loadsInFlight -= 1;
        return stub;
      },
    };
  }, 300_000);

  afterAll(async () => {
    await db?.$disconnect();
    await pool?.end();
    await waitForClientEnds?.();
    s3?.destroy();
    storage?.close();
    await postgres?.stop();
    await minio?.stop();
  });

  async function bucketKeys(bucket = BUCKET): Promise<string[]> {
    const keys: string[] = [];
    let token: string | undefined;
    do {
      const page = await s3.send(new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: token }));
      for (const object of page.Contents ?? []) keys.push(`${object.Key} ${object.ETag}`);
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token);
    return keys.sort();
  }

  /** Every row of every application table, so "as it was before" is checked column by column. */
  async function databaseSnapshot(): Promise<Record<string, unknown[]>> {
    const tables = await pool.query<{ tablename: string }>(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations' ORDER BY tablename`,
    );
    // The tables are read concurrently, over the pool's connections; nothing writes meanwhile.
    const entries = await Promise.all(
      tables.rows.map(async ({ tablename }) => {
        const rows = await pool.query(`SELECT to_jsonb(t) AS row FROM "${tablename}" AS t ORDER BY to_jsonb(t)::text`);
        return [tablename, rows.rows.map((entry) => entry.row)] as const;
      }),
    );
    return Object.fromEntries(entries);
  }

  /** The seeded rows without `updatedAt`, the one column a rerun is allowed to touch. */
  async function seededRows() {
    const strip = <T extends { updatedAt: Date }>({ updatedAt: _touched, ...row }: T) => row;
    const [users, listings, media] = await Promise.all([
      db.user.findMany({ where: { id: { startsWith: DEMO_ID_PREFIX } }, orderBy: { id: "asc" } }),
      db.listing.findMany({ where: { sellerId: { startsWith: DEMO_ID_PREFIX } }, orderBy: { id: "asc" } }),
      db.listingMedia.findMany({
        where: { listing: { sellerId: { startsWith: DEMO_ID_PREFIX } } },
        orderBy: { id: "asc" },
      }),
    ]);
    return { users: users.map(strip), listings: listings.map(strip), media };
  }

  async function createRealUserRows(): Promise<void> {
    const catalog = await db.listing.findUniqueOrThrow({
      where: { id: demoListingId(0) },
      select: { brandId: true, modelId: true, cityId: true, regionId: true },
    });
    await db.user.createMany({
      data: [
        { id: REAL_SELLER, phone: "+99365550001", phoneVerifiedAt: FIRST_RUN, displayName: "Real Seller", role: "seller" },
        { id: REAL_BUYER, phone: "+99365550002", phoneVerifiedAt: FIRST_RUN, displayName: "Real Buyer", role: "buyer" },
      ],
    });
    await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: REAL_OBJECT, Body: "real photo", ContentType: "image/webp" }));
    await s3.send(new PutObjectCommand({ Bucket: CHAT_BUCKET, Key: REAL_CHAT_PHOTO, Body: "real chat photo", ContentType: "image/webp" }));
    await db.listing.create({
      data: {
        id: REAL_LISTING,
        sellerId: REAL_SELLER,
        status: "active",
        ...catalog,
        priceAmount: 150_000,
        priceTmt: 150_000,
        publishedAt: FIRST_RUN,
        damaged: false,
        favoriteCount: 1,
        media: { create: [{ kind: "image", key: REAL_OBJECT, sortOrder: 0 }] },
      },
    });
    await db.favorite.create({ data: { userId: REAL_BUYER, listingId: REAL_LISTING } });
    await db.conversation.create({
      data: {
        id: REAL_CONVERSATION,
        listingId: REAL_LISTING,
        buyerId: REAL_BUYER,
        sellerId: REAL_SELLER,
        participants: { create: [{ userId: REAL_BUYER }, { userId: REAL_SELLER }] },
        messages: { create: [{ senderId: REAL_BUYER, kind: "text", body: "Is it still for sale?" }] },
      },
    });
    await db.contentReport.create({
      data: { reporterUserId: REAL_BUYER, targetType: "listing", targetId: REAL_LISTING, reason: "misleading" },
    });
  }

  /** What reviewers and testers leave on demo content: the rows removal must take with it. */
  async function createRowsHangingOffDemoContent(): Promise<void> {
    const demoListing = demoListingId(3);
    const demoSeller = (await db.listing.findUniqueOrThrow({ where: { id: demoListing } })).sellerId;
    await db.favorite.create({ data: { userId: REAL_BUYER, listingId: demoListing } });
    await db.listing.update({ where: { id: demoListing }, data: { favoriteCount: 1, viewCount: { increment: 7 } } });
    const conversation = await db.conversation.create({
      data: {
        listingId: demoListing,
        buyerId: REAL_BUYER,
        sellerId: demoSeller,
        participants: { create: [{ userId: REAL_BUYER }, { userId: demoSeller }] },
        messages: { create: [{ senderId: REAL_BUYER, kind: "text", body: "Salam!" }] },
      },
      include: { messages: true },
    });
    // A photo the buyer sent in that Conversation. It is public, and no row points at it once
    // the Conversation is gone.
    await s3.send(
      new PutObjectCommand({
        Bucket: CHAT_BUCKET,
        Key: `chat-attachments/${conversation.id}/0a000000-0000-4000-8000-000000000402/original.webp`,
        Body: "chat photo",
        ContentType: "image/webp",
      }),
    );
    await db.contentReport.createMany({
      data: [
        { reporterUserId: REAL_BUYER, targetType: "listing", targetId: demoListing, reason: "misleading" },
        { reporterUserId: REAL_BUYER, targetType: "user", targetId: demoSeller, reason: "spam" },
        {
          reporterUserId: REAL_BUYER,
          targetType: "message",
          targetId: must(conversation.messages[0]).id,
          reason: "abuse",
          messageContext: { conversationId: conversation.id },
        },
      ],
    });
    await db.inspectionInterest.create({
      data: { listingId: demoListing, requesterUserId: REAL_BUYER, side: "buyer" },
    });
  }

  it("refuses a car whose seller is not listed, and writes nothing", async () => {
    const car = { ...must(DEMO_CARS[0]), sellerKey: "nobody" };
    const entry = must(DEMO_PHOTO_MANIFEST.listings[car.slug]);
    const result = await seedDemoInventory({
      prisma: db,
      storage,
      photos,
      now: FIRST_RUN,
      cars: [car],
      manifest: { ...DEMO_PHOTO_MANIFEST, listings: { [car.slug]: entry } },
    });
    expect(result.exitCode).toBe(1);
    expect(result.message).toMatch(/refused: camry-xv70-graphite names a seller that is not listed/);
    expect(await db.user.count()).toBe(0);
    expect(await bucketKeys()).toEqual([]);
    expect(downloads).toEqual([]);
  });

  it("seeds about 50 active Listings with 5 to 8 clean photos each, for sellers who cannot sign in", async () => {
    const result = await seedDemoInventory({ prisma: db, storage, photos, now: FIRST_RUN });
    expect(result.exitCode, result.message).toBe(0);
    expect(result.counts).toMatchObject({
      sellers: DEMO_SELLERS.length,
      listings: DEMO_CARS.length,
      photos: photoCount,
      objects: photoCount * 5,
    });

    const { users, listings, media } = await seededRows();
    expect(users).toHaveLength(DEMO_SELLERS.length);
    expect(users.length).toBeGreaterThanOrEqual(8);
    expect(users.length).toBeLessThanOrEqual(12);
    for (const user of users) {
      expect(user).toMatchObject({ phone: demoSellerPhone(user.id), email: null, emailVerifiedAt: null, role: "seller" });
      // The API signs in only `+993…` mobiles, so nobody can ask for a code for this value. It is
      // stored because a User with neither phone nor email is shown to buyers as a deleted User.
      expect(user.phone).not.toMatch(/^\+993[67]\d{7}$/);
      expect(user.phoneVerifiedAt).toEqual(user.createdAt);
      expect(user.displayName).toBeTruthy();
    }
    expect(new Set(users.map((user) => user.createdAt.toISOString())).size).toBe(users.length);
    expect(await db.session.count({ where: { userId: { startsWith: DEMO_ID_PREFIX } } })).toBe(0);

    expect(listings).toHaveLength(DEMO_CARS.length);
    expect(listings.length).toBeGreaterThanOrEqual(45);
    expect(listings.length).toBeLessThanOrEqual(55);
    expect(new Set(listings.map((listing) => listing.publicNumber)).size).toBe(listings.length);
    for (const listing of listings) {
      expect(listing).toMatchObject({
        status: "active",
        contactPhone: null,
        allowCalls: false,
        allowChat: true,
        deletedAt: null,
      });
      expect(typeof listing.damaged).toBe("boolean");
      expect(listing.priceTmt).toBeGreaterThan(0);
      const age = FIRST_RUN.getTime() - must(listing.publishedAt).getTime();
      expect(age).toBeGreaterThanOrEqual(0);
      expect(age).toBeLessThanOrEqual(30 * DAY);
    }
    const publishedDays = new Set(listings.map((listing) => must(listing.publishedAt).toISOString().slice(0, 10)));
    expect(publishedDays.size).toBeGreaterThanOrEqual(15);
    expect(new Set(listings.map((listing) => listing.viewCount)).size).toBeGreaterThan(listings.length / 2);
    const usd = must(listings.find((listing) => listing.priceCurrency === "USD"));
    // priceTmt is amount times the seeded USD->TMT catalog rate.
    expect(usd.priceTmt).toBeCloseTo(usd.priceAmount * 18.2, 5);

    expect(media).toHaveLength(photoCount);
    expect(new Set(media.map((row) => row.key)).size).toBe(media.length);
    for (const listing of listings) {
      const rows = media.filter((row) => row.listingId === listing.id);
      expect(rows.length, listing.id).toBeGreaterThanOrEqual(5);
      expect(rows.length, listing.id).toBeLessThanOrEqual(8);
      expect(rows.map((row) => row.sortOrder).sort((a, b) => a - b)).toEqual(rows.map((_, order) => order));
    }

    // Each media row has its original and the four variants GetListingDetail builds URLs for.
    const keys = new Set((await bucketKeys()).map((entry) => entry.split(" ")[0]));
    expect(keys.size).toBe(photoCount * 5);
    for (const row of media) {
      expect(row.key.startsWith(DEMO_OBJECT_PREFIX)).toBe(true);
      expect(row.key.endsWith("/original.webp")).toBe(true);
      const base = row.key.replace(/\/original\.webp$/, "");
      for (const name of ["original", "thumbnail", "list", "detail", "fullscreen"]) {
        expect(keys.has(`${base}/${name}.webp`), `${base}/${name}.webp`).toBe(true);
      }
    }

    // Seeded originals are as clean as the ones the Listing photo pipeline leaves behind.
    const sample = must(media[0]);
    const object = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: sample.key }));
    const original = Buffer.from(await must(object.Body).transformToByteArray());
    const meta = await sharp(original).metadata();
    expect(meta.exif).toBeUndefined();
    expect(meta.xmp).toBeUndefined();
    expect(meta.iptc).toBeUndefined();
    expect(meta.orientation ?? 1).toBe(1);
    expect(original.includes("A Real Photographer")).toBe(false);
    expect({ width: meta.width, height: meta.height }).toEqual({ width: sample.width, height: sample.height });

    expect(new Set(downloads).size).toBe(photoCount);
    // Commons asks automated clients to stay sequential: one photo is loaded at a time. Uploads
    // to the bucket overlap.
    expect(maxLoadsInFlight).toBe(1);
    expect(maxPutsInFlight).toBeGreaterThan(1);
    expect(maxPutsInFlight).toBeLessThanOrEqual(DEMO_UPLOAD_CONCURRENCY);
    firstDraw = listings.map(({ id, publishedAt, viewCount }) => ({ id, publishedAt, viewCount }));
  }, SEED_TIMEOUT);

  it("converges on the same rows and objects when run again", async () => {
    const before = await seededRows();
    const keysBefore = (await bucketKeys()).map((entry) => entry.split(" ")[0]);
    const totals = async () => ({
      users: await db.user.count(),
      listings: await db.listing.count(),
      media: await db.listingMedia.count(),
    });
    const totalsBefore = await totals();

    const result = await seedDemoInventory({ prisma: db, storage, photos, now: SECOND_RUN });
    expect(result.exitCode, result.message).toBe(0);

    expect(await seededRows()).toEqual(before);
    expect(await totals()).toEqual(totalsBefore);
    expect((await bucketKeys()).map((entry) => entry.split(" ")[0])).toEqual(keysBefore);
  }, SEED_TIMEOUT);

  it("removes exactly what it created and leaves a real user's rows and objects alone", async () => {
    // Start from a database that holds a real seller, buyer, Listing, favourite, Conversation and report.
    await createRealUserRows();
    const cleared = await removeDemoInventory({ prisma: db, storage });
    expect(cleared.exitCode, cleared.message).toBe(0);
    const databaseBefore = await databaseSnapshot();
    const bucketBefore = await bucketKeys();
    const chatBucketBefore = await bucketKeys(CHAT_BUCKET);
    expect(chatBucketBefore).toHaveLength(1);
    expect(databaseBefore["users"]).toHaveLength(2);
    expect(bucketBefore).toHaveLength(1);

    const seeded = await seedDemoInventory({ prisma: db, storage, photos, now: FIRST_RUN });
    // A fresh seed draws the publication times and view counts the first one drew: the random
    // choices come from a fixed seed, not from the run.
    expect(
      (await seededRows()).listings.map(({ id, publishedAt, viewCount }) => ({ id, publishedAt, viewCount })),
    ).toEqual(firstDraw);
    expect(seeded.exitCode, seeded.message).toBe(0);
    await createRowsHangingOffDemoContent();

    const removed = await removeDemoInventory({ prisma: db, storage });
    expect(removed.exitCode, removed.message).toBe(0);
    expect(removed.counts).toEqual({
      sellers: DEMO_SELLERS.length,
      listings: DEMO_CARS.length,
      photos: photoCount,
      objects: photoCount * 5,
      favorites: 1,
      conversations: 1,
      messages: 1,
      chatPhotos: 1,
      reports: 3,
      inspectionInterests: 1,
    });
    expect(removed.message).toContain(`${DEMO_CARS.length} Listings`);

    expect(await databaseSnapshot()).toEqual(databaseBefore);
    expect(await bucketKeys()).toEqual(bucketBefore);
    // The photo sent in the demo Conversation is gone; the real Conversation's photo is not.
    expect(await bucketKeys(CHAT_BUCKET)).toEqual(chatBucketBefore);

    // The real user's Listing, favourite and Conversation are still there, named one by one.
    expect(await db.listing.findUnique({ where: { id: REAL_LISTING } })).toMatchObject({
      sellerId: REAL_SELLER,
      status: "active",
      favoriteCount: 1,
    });
    expect(await db.favorite.count({ where: { userId: REAL_BUYER, listingId: REAL_LISTING } })).toBe(1);
    expect(await db.conversation.count({ where: { id: REAL_CONVERSATION } })).toBe(1);
    expect(await db.message.count({ where: { conversationId: REAL_CONVERSATION } })).toBe(1);
    expect(await db.listingMedia.count({ where: { listingId: REAL_LISTING } })).toBe(1);
    expect(await db.contentReport.count({ where: { targetId: REAL_LISTING } })).toBe(1);
  }, SEED_TIMEOUT);

  it("is safe to run twice", async () => {
    const databaseBefore = await databaseSnapshot();
    const bucketBefore = await bucketKeys();
    const again = await removeDemoInventory({ prisma: db, storage });
    expect(again.exitCode, again.message).toBe(0);
    expect(Object.values(again.counts).every((count) => count === 0)).toBe(true);
    expect(await databaseSnapshot()).toEqual(databaseBefore);
    expect(await bucketKeys()).toEqual(bucketBefore);
  });

  it("refuses to remove when a seeded seller has gained a Sign-in Method, and deletes nothing", async () => {
    // Every seller and two cars: the refusal turns on a seller, and the full inventory's seed and
    // removal are covered above.
    const cars = DEMO_CARS.slice(0, 2);
    const listings = Object.fromEntries(cars.map((car) => [car.slug, must(DEMO_PHOTO_MANIFEST.listings[car.slug])]));
    const seeded = await seedDemoInventory({
      prisma: db,
      storage,
      photos,
      now: FIRST_RUN,
      cars,
      manifest: { ...DEMO_PHOTO_MANIFEST, listings },
    });
    expect(seeded.exitCode, seeded.message).toBe(0);
    expect(await db.user.count({ where: { id: { startsWith: DEMO_ID_PREFIX } } })).toBe(DEMO_SELLERS.length);
    await db.user.update({
      where: { id: demoSellerId(2) },
      data: { phone: "+99365550009", phoneVerifiedAt: FIRST_RUN },
    });
    const databaseBefore = await databaseSnapshot();
    const bucketBefore = await bucketKeys();

    const refused = await removeDemoInventory({ prisma: db, storage });
    expect(refused.exitCode).toBe(1);
    expect(refused.message).toMatch(/refused: a seeded seller has gained a Sign-in Method/);
    expect(refused.message).not.toContain("+99365550009");
    expect(await databaseSnapshot()).toEqual(databaseBefore);
    expect(await bucketKeys()).toEqual(bucketBefore);

    const reseed = await seedDemoInventory({ prisma: db, storage, photos, now: SECOND_RUN });
    expect(reseed.exitCode).toBe(1);
    expect(reseed.message).toMatch(/refused: a seeded seller has gained a Sign-in Method/);
    expect(await db.user.findUnique({ where: { id: demoSellerId(2) } })).toMatchObject({ phone: "+99365550009" });

    await db.user.update({
      where: { id: demoSellerId(2) },
      data: { phone: null, phoneVerifiedAt: null, email: "someone@example.com", emailVerifiedAt: FIRST_RUN },
    });
    expect((await removeDemoInventory({ prisma: db, storage })).exitCode).toBe(1);

    await db.user.update({ where: { id: demoSellerId(2) }, data: { email: null, emailVerifiedAt: null } });
    expect((await removeDemoInventory({ prisma: db, storage })).exitCode).toBe(0);
    expect(await db.user.count({ where: { id: { startsWith: DEMO_ID_PREFIX } } })).toBe(0);
  }, SEED_TIMEOUT);
});
