import { EventEmitterModule } from "@nestjs/event-emitter";
import "reflect-metadata";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Test, type TestingModule } from "@nestjs/testing";
import { ConfigModule } from "@nestjs/config";
import { Reflector } from "@nestjs/core";
import { JwtModule, JwtService } from "@nestjs/jwt";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import sharp from "sharp";
import supertest from "supertest";
import { PrismaService } from "@auto-tm/db";

import { AccountDeletionPendingGuard } from "../../../common/account-deletion-pending.guard";
import { GlobalErrorFilter } from "../../../common/error.filter";
import { JwtAuthGuard } from "../../../common/jwt-auth.guard";
import { EnvSchema } from "../../../env.schema";
import { bullTestRoot } from "../../../../test/helpers/bullTestRoot";
import {
  cleanSuiteFixtures,
  defineE2eSuite,
  seedSuiteCatalog,
} from "../../../../test/helpers/e2eSuite";
import { mintUserJwt } from "../../../../test/helpers/mintUserJwt";
import { ListingsModule } from "../../listings/listings.module";
import { IdentityModule } from "../identity.module";
import { IDENTITY_CHECK_PORT } from "../identity.public";
import { ProfilePhotoModule } from "../profile-photo.module";

// Issue #642 on the real path: Postgres, the hosted disposable MinIO and Sharp.
// Nothing between the route and storage is mocked. Uses only the service
// started by hosted ci-services.sh, never a live bucket.

const suite = defineE2eSuite("me-photo");
type SuiteUser = "owner" | "other";
const SUITE_USERS: readonly SuiteUser[] = ["owner", "other"];
const OWNER = suite.id("owner");
const BUCKET = "listing-photos";
const VARIANTS = ["thumbnail", "list", "detail", "fullscreen"].map((name) => `${name}.webp`);

function manifest(key: string): string[] {
  const directory = key.slice(0, key.lastIndexOf("/") + 1);
  return [key, ...VARIANTS.map((name) => `${directory}${name}`)];
}

/** A WebP camera photo carrying a GPS position, as a phone would upload it. */
function photoWithGps(): Promise<Buffer> {
  return sharp({ create: { width: 640, height: 480, channels: 3, background: { r: 30, g: 90, b: 200 } } })
    .webp()
    .withExif({
      IFD0: { Make: "TestCam" },
      IFD3: {
        GPSLatitudeRef: "N",
        GPSLatitude: "37/1 56/1 0/1",
        GPSLongitudeRef: "E",
        GPSLongitude: "58/1 23/1 0/1",
      },
    })
    .toBuffer();
}

describe("PUT and DELETE /api/v1/me/photo e2e (#642)", () => {
  let app: NestFastifyApplication;
  let request: ReturnType<typeof supertest>;
  let prisma: PrismaService;
  let s3: S3Client;
  let photo: Buffer;
  const tokens = {} as Record<SuiteUser, string>;
  const ownedKeys = new Set<string>();

  beforeAll(async () => {
    const endpoint = process.env["MINIO_ENDPOINT"] ?? "";
    if (process.env["GITHUB_ACTIONS"] !== "true" ||
      !["localhost", "127.0.0.1"].includes(new URL(endpoint).hostname)) {
      throw new Error("This suite requires hosted disposable MinIO; live/local provider tests are forbidden");
    }
    s3 = new S3Client({
      endpoint,
      region: "us-east-1",
      forcePathStyle: true,
      requestChecksumCalculation: "WHEN_REQUIRED",
      credentials: {
        accessKeyId: process.env["MINIO_ACCESS_KEY"] ?? "minioadmin",
        secretAccessKey: process.env["MINIO_SECRET_KEY"] ?? "minioadmin",
      },
    });
    photo = await photoWithGps();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        EventEmitterModule.forRoot(),
        bullTestRoot(),
        ConfigModule.forRoot({ isGlobal: true, validate: (cfg) => EnvSchema.parse(cfg) }),
        IdentityModule,
        ListingsModule,
        ProfilePhotoModule,
        JwtModule.register({
          global: true,
          secret: process.env["JWT_ACCESS_SECRET"] ?? "dev-secret-change-me",
          signOptions: { expiresIn: "1h" },
        }),
      ],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    const reflector = app.get(Reflector);
    app.useGlobalGuards(
      new JwtAuthGuard(reflector, app.get(JwtService)),
      new AccountDeletionPendingGuard(reflector, app.get(IDENTITY_CHECK_PORT)),
    );
    app.useGlobalFilters(new GlobalErrorFilter());
    await app.listen(0, "127.0.0.1");
    request = supertest(app.getHttpServer());
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    if (prisma) await cleanSuiteFixtures(prisma, suite, { userAliases: SUITE_USERS });
    if (s3) {
      for (const Key of ownedKeys) await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key }));
      s3.destroy();
    }
    await app?.close();
  });

  beforeEach(async () => {
    await cleanSuiteFixtures(prisma, suite, { userAliases: SUITE_USERS });
    await seedSuiteCatalog(prisma, suite);
    for (const alias of SUITE_USERS) {
      await prisma.user.create({
        data: {
          id: suite.id(alias),
          phone: suite.phone(alias),
          phoneVerifiedAt: new Date("2026-05-01T00:00:00Z"),
          nameNumber: 4821,
          avatarIndex: 7,
        },
      });
      tokens[alias] = mintUserJwt(suite.id(alias));
    }
  });

  /** Presigns a fenced image upload, as the app does for a Profile Photo. */
  async function presign(alias: SuiteUser, body: object = {}) {
    const res = await request
      .post("/api/v1/uploads/presign")
      .set("Authorization", `Bearer ${tokens[alias]}`)
      .send({
        kind: "image",
        contentType: "image/webp",
        sizeBytes: photo.length,
        writeProtocol: "conditional-v1",
        ...body,
      })
      .expect(201);
    const signed = res.body as { key: string; uploadUrl: string; headers?: Record<string, string> };
    for (const member of manifest(signed.key)) ownedKeys.add(member);
    return signed;
  }

  /** Presign and the client's own PUT to storage with the required headers. */
  async function upload(alias: SuiteUser): Promise<string> {
    const signed = await presign(alias);
    const put = await fetch(signed.uploadUrl, {
      method: "PUT",
      headers: { "content-type": "image/webp", ...signed.headers },
      body: new Uint8Array(photo),
    });
    expect(put.status).toBe(200);
    return signed.key;
  }

  function setPhoto(alias: SuiteUser | null, key: string) {
    const req = request.put("/api/v1/me/photo");
    if (alias) req.set("Authorization", `Bearer ${tokens[alias]}`);
    return req.send({ key });
  }

  function removePhoto(alias: SuiteUser | null) {
    const req = request.delete("/api/v1/me/photo");
    if (alias) req.set("Authorization", `Bearer ${tokens[alias]}`);
    return req.send();
  }

  function me(alias: SuiteUser) {
    return request.get("/api/v1/me").set("Authorization", `Bearer ${tokens[alias]}`).expect(200);
  }

  async function createListing() {
    return prisma.listing.create({
      data: {
        id: suite.id("listing"),
        sellerId: OWNER,
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

  function attach(key: string) {
    return request
      .post(`/api/v1/listings/${suite.id("listing")}/media/attach`)
      .set("Authorization", `Bearer ${tokens.owner}`)
      .send({ key, kind: "image", sortOrder: 0 });
  }

  const ownerRow = () => prisma.user.findUniqueOrThrow({ where: { id: OWNER } });
  const uploadRow = (key: string) => prisma.mediaUpload.findUniqueOrThrow({ where: { key } });
  const cleanupFor = async (key: string) =>
    prisma.mediaUploadCleanup.findUnique({ where: { uploadId: (await uploadRow(key)).id } });

  async function stored(key: string): Promise<Buffer> {
    const object = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
    return Buffer.from(await object.Body!.transformToByteArray());
  }

  it("sets the photo: /me carries the key, the variants exist, and no stored object keeps EXIF or GPS", async () => {
    expect((await sharp(photo).metadata()).exif).toBeDefined();
    const key = await upload("owner");

    const res = await setPhoto("owner", key).expect(200);

    expect(res.body).toMatchObject({ id: OWNER, avatarKey: key, avatarIndex: 7, nameNumber: 4821 });
    expect((await me("owner")).body).toEqual(res.body);
    for (const member of manifest(key)) {
      const bytes = await stored(member);
      expect(bytes.length, `${member} is empty`).toBeGreaterThan(0);
      expect((await sharp(bytes).metadata()).exif, `${member} carries EXIF`).toBeUndefined();
    }
    const row = await ownerRow();
    const adopted = await uploadRow(key);
    expect(row.avatarUploadId).toBe(adopted.id);
    expect(adopted).toMatchObject({ state: "ADOPTED", claimTargetType: "profile", claimTargetId: OWNER });
  });

  it("refuses a made-up key, another User's key and a video key with one indistinguishable error", async () => {
    const othersKey = await upload("other");
    const video = await request
      .post("/api/v1/uploads/presign")
      .set("Authorization", `Bearer ${tokens.owner}`)
      .send({ kind: "video", contentType: "video/mp4", sizeBytes: 2048 })
      .expect(201);
    ownedKeys.add(video.body.key);
    await s3.send(new PutObjectCommand({
      Bucket: BUCKET, Key: video.body.key, Body: Buffer.alloc(2048, 1), ContentType: "video/mp4",
    }));

    const bodies = [];
    for (const key of ["pending/11111111-1111-4111-8111-111111111111/original.webp", othersKey, video.body.key]) {
      const res = await setPhoto("owner", key).expect(400);
      // Everything the caller can tell apart; the timestamp differs per request.
      const { timestamp: _timestamp, ...answer } = res.body as Record<string, unknown>;
      bodies.push(answer);
    }

    expect(bodies[0]).toMatchObject({ code: "UPLOAD_NOT_AVAILABLE" });
    expect(bodies[1]).toEqual(bodies[0]);
    expect(bodies[2]).toEqual(bodies[0]);
    expect(await ownerRow()).toMatchObject({ avatarKey: null, avatarUploadId: null });
    expect((await uploadRow(othersKey)).state).toBe("AVAILABLE");
  });

  it("refuses an upload presigned without the fenced protocol like an unknown key", async () => {
    const res = await request
      .post("/api/v1/uploads/presign")
      .set("Authorization", `Bearer ${tokens.owner}`)
      .send({ kind: "image", contentType: "image/webp", sizeBytes: photo.length })
      .expect(201);
    ownedKeys.add(res.body.key);
    await fetch(res.body.uploadUrl, {
      method: "PUT", headers: { "content-type": "image/webp" }, body: new Uint8Array(photo),
    });

    const refused = await setPhoto("owner", res.body.key).expect(400);

    expect(refused.body.code).toBe("UPLOAD_NOT_AVAILABLE");
    expect((await ownerRow()).avatarKey).toBeNull();
  });

  it("refuses a key whose file never reached storage, is too large, or is of another type", async () => {
    const neverSent = await presign("owner");
    const tooLarge = await presign("owner");
    const wrongType = await presign("owner");
    await s3.send(new PutObjectCommand({
      Bucket: BUCKET, Key: tooLarge.key, Body: Buffer.alloc(5 * 1024 * 1024 + 1, 1),
      ContentType: "image/webp", IfMatch: tooLarge.headers!["if-match"],
    }));
    await s3.send(new PutObjectCommand({
      Bucket: BUCKET, Key: wrongType.key, Body: photo,
      ContentType: "image/png", IfMatch: wrongType.headers!["if-match"],
    }));

    for (const { key } of [neverSent, tooLarge, wrongType]) {
      const res = await setPhoto("owner", key).expect(400);
      expect(res.body.code).toBe("UPLOAD_OBJECT_INVALID");
      expect((await uploadRow(key)).state).toBe("AVAILABLE");
    }
    expect(await ownerRow()).toMatchObject({ avatarKey: null, avatarUploadId: null });
  });

  it("keeps one adopter: a Listing's upload cannot become a photo, and a photo cannot join a Listing", async () => {
    await createListing();
    const listingKey = await upload("owner");
    const photoKey = await upload("owner");
    await attach(listingKey).expect(201);
    await setPhoto("owner", photoKey).expect(200);

    const asPhoto = await setPhoto("owner", listingKey).expect(409);
    const asMedia = await attach(photoKey).expect(409);

    expect(asPhoto.body.code).toBe("UPLOAD_ALREADY_ATTACHED");
    expect(asMedia.body.code).toBe("UPLOAD_ALREADY_ATTACHED");
    expect((await ownerRow()).avatarKey).toBe(photoKey);
    expect(await prisma.listingMedia.count({ where: { listingId: suite.id("listing") } })).toBe(1);
  });

  it("refuses to publish a draft that carries the Profile Photo's key", async () => {
    const photoKey = await upload("owner");
    const others = [await upload("owner"), await upload("owner")];
    await setPhoto("owner", photoKey).expect(200);
    await prisma.exchangeRate.upsert({
      where: { fromCurrency_toCurrency: { fromCurrency: "TMT", toCurrency: "TMT" } },
      create: { fromCurrency: "TMT", toCurrency: "TMT", rate: 1 },
      update: { rate: 1 },
    });
    const draft = await prisma.listingDraft.create({
      data: {
        userId: OWNER,
        payload: {
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
          contactPhone: suite.phone("owner"),
          allowCalls: true,
          allowChat: true,
          conditionDisclosure: { damaged: false },
          photos: [photoKey, ...others].map((key, i) => ({
            photoId: suite.id(`photo-${i}`), key, sortOrder: i,
          })),
        },
      },
    });

    const res = await request
      .post(`/api/v1/listings/drafts/${draft.id}/publish`)
      .set("Authorization", `Bearer ${tokens.owner}`)
      .send({})
      .expect(409);

    expect(res.body.code).toBe("UPLOAD_ALREADY_ATTACHED");
    expect(await prisma.listing.count({ where: { sellerId: OWNER } })).toBe(0);
    expect((await ownerRow()).avatarKey).toBe(photoKey);
    expect((await uploadRow(photoKey)).state).toBe("ADOPTED");
  });

  it("lets exactly one of a concurrent photo request and Listing attach adopt the upload", async () => {
    await createListing();
    const key = await upload("owner");

    const [asPhoto, asMedia] = await Promise.all([setPhoto("owner", key), attach(key)]);

    const photoWon = asPhoto.status === 200;
    expect([asPhoto.status, asMedia.status]).toEqual(photoWon ? [200, 409] : [409, 201]);
    const row = await ownerRow();
    const media = await prisma.listingMedia.count({ where: { listingId: suite.id("listing") } });
    expect([row.avatarKey === key, media === 1]).toEqual([photoWon, !photoWon]);
    expect((await uploadRow(key)).state).toBe("ADOPTED");
    expect(await cleanupFor(key)).toBeNull();
  });

  it("answers two concurrent requests for one key with that one photo", async () => {
    const key = await upload("owner");

    const responses = await Promise.all([setPhoto("owner", key), setPhoto("owner", key)]);

    // A request that overlaps the first one's preparation is refused with 409
    // and prepares nothing; one that arrives after it finished answers 200.
    const statuses = responses.map((r) => r.status).sort();
    expect([[200, 200], [200, 409]]).toContainEqual(statuses);
    for (const refused of responses.filter((r) => r.status === 409)) {
      expect(refused.body.code).toBe("UPLOAD_ALREADY_ATTACHED");
    }
    expect(await ownerRow()).toMatchObject({ avatarKey: key });
    expect((await uploadRow(key)).state).toBe("ADOPTED");
    expect(await cleanupFor(key)).toBeNull();
  });

  it("succeeds and changes nothing when the current photo's key is sent again", async () => {
    const key = await upload("owner");
    const first = await setPhoto("owner", key).expect(200);
    const before = await ownerRow();

    const again = await setPhoto("owner", key).expect(200);

    expect(again.body).toEqual(first.body);
    expect(await ownerRow()).toEqual(before);
    expect(await cleanupFor(key)).toBeNull();
  });

  it("replaces the photo: the first key is gone from /me and its exact objects are recorded for deletion", async () => {
    const first = await upload("owner");
    const second = await upload("owner");
    await setPhoto("owner", first).expect(200);

    const res = await setPhoto("owner", second).expect(200);

    expect(res.body).toMatchObject({ avatarKey: second, avatarIndex: 7 });
    expect((await me("owner")).body.avatarKey).toBe(second);
    expect((await ownerRow()).avatarUploadId).toBe((await uploadRow(second)).id);
    expect((await uploadRow(first)).state).toBe("RETIRED");
    const work = await cleanupFor(first);
    expect(work).toMatchObject({ status: "PENDING", writeProtocol: "conditional-v1", key: first });
    expect([...work!.objectKeys].sort()).toEqual(manifest(first).sort());
    expect(await cleanupFor(second)).toBeNull();
    // A replaced photo is never adoptable again.
    expect((await setPhoto("owner", first).expect(400)).body.code).toBe("UPLOAD_NOT_AVAILABLE");
  });

  it("removes the photo, keeps the Assigned Avatar index, and records the deletion work", async () => {
    const key = await upload("owner");
    await setPhoto("owner", key).expect(200);

    const res = await removePhoto("owner").expect(200);

    expect(res.body).toMatchObject({ id: OWNER, avatarKey: null, avatarIndex: 7 });
    expect((await me("owner")).body).toEqual(res.body);
    expect(await ownerRow()).toMatchObject({ avatarKey: null, avatarUploadId: null, avatarIndex: 7 });
    expect((await uploadRow(key)).state).toBe("RETIRED");
    expect(await cleanupFor(key)).toMatchObject({ status: "PENDING" });
    // The bytes stay until the worker deletes them; no request deletes storage.
    await expect(s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }))).resolves.toBeDefined();
  });

  it("removing with no photo succeeds, and so does removing twice", async () => {
    const none = await removePhoto("owner").expect(200);
    expect(none.body).toMatchObject({ avatarKey: null, avatarIndex: 7 });

    const key = await upload("owner");
    await setPhoto("owner", key).expect(200);
    await removePhoto("owner").expect(200);
    const again = await removePhoto("owner").expect(200);

    expect(again.body).toMatchObject({ avatarKey: null, avatarIndex: 7 });
  });

  it("answers 401 on both routes without a session", async () => {
    await setPhoto(null, "pending/x/original.webp").expect(401);
    await removePhoto(null).expect(401);
  });

  it("refuses a suspended User on both routes and keeps the photo", async () => {
    const key = await upload("owner");
    const next = await upload("owner");
    await setPhoto("owner", key).expect(200);
    await prisma.user.update({ where: { id: OWNER }, data: { suspendedAt: new Date() } });

    const set = await setPhoto("owner", next).expect(403);
    const removed = await removePhoto("owner").expect(403);

    expect(set.body).toMatchObject({ code: "FORBIDDEN", details: { reason: "USER_SUSPENDED" } });
    expect(removed.body).toMatchObject({ code: "FORBIDDEN", details: { reason: "USER_SUSPENDED" } });
    expect((await ownerRow()).avatarKey).toBe(key);
    expect((await uploadRow(next)).state).toBe("AVAILABLE");
  });

  it("refuses a User whose deletion is scheduled on both routes and keeps the photo", async () => {
    const key = await upload("owner");
    const next = await upload("owner");
    await setPhoto("owner", key).expect(200);
    await prisma.user.update({ where: { id: OWNER }, data: { deletionScheduledAt: new Date() } });

    const set = await setPhoto("owner", next).expect(403);
    const removed = await removePhoto("owner").expect(403);

    expect(set.body.details).toMatchObject({ reason: "ACCOUNT_DELETION_PENDING" });
    expect(removed.body.details).toMatchObject({ reason: "ACCOUNT_DELETION_PENDING" });
    expect((await ownerRow()).avatarKey).toBe(key);
  });
});
