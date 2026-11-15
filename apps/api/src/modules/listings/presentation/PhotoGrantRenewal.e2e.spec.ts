import "reflect-metadata";
import { randomUUID } from "node:crypto";
import { createServer, request as forward } from "node:http";
import { once } from "node:events";
import { Test } from "@nestjs/testing";
import { ConfigModule } from "@nestjs/config";
import { Reflector } from "@nestjs/core";
import { JwtModule, JwtService } from "@nestjs/jwt";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { PrismaService } from "@auto-tm/db";
import { UploadsSchemas } from "@auto-tm/contracts";
import sharp from "sharp";
import supertest from "supertest";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

import { JwtAuthGuard } from "../../../common/jwt-auth.guard";
import { AccountDeletionPendingGuard } from "../../../common/account-deletion-pending.guard";
import { GlobalErrorFilter } from "../../../common/error.filter";
import { EnvSchema } from "../../../env.schema";
import { bullTestRoot } from "../../../../test/helpers/bullTestRoot";
import { cleanSuiteFixtures, defineE2eSuite, seedSuiteCatalog } from "../../../../test/helpers/e2eSuite";
import { mintUserJwt } from "../../../../test/helpers/mintUserJwt";
import { ProfilePhotoModule } from "../../identity/profile-photo.module";
import { IDENTITY_CHECK_PORT } from "../../identity/identity.public";
import { imageUploadObjectKeys } from "../domain/imageUploadObjectKeys";
import { MEDIA_UPLOAD_REPOSITORY, type MediaUploadRepository } from "../domain/ports/MediaUploadRepository";
import { UPLOAD_CLAIM_PORT, type UploadClaimPort } from "../domain/ports/UploadClaimPort";
import { ListingsModule } from "../listings.module";

const suite = defineE2eSuite("photo-renewal");
const owner = suite.id("owner"), other = suite.id("other");
const bucket = "listing-photos";

describe("same-key photo grants through authenticated HTTP and real S3", () => {
  let app: NestFastifyApplication, api: ReturnType<typeof supertest>, db: PrismaService, s3: S3Client;
  let bytes: Buffer;
  const owned = new Set<string>();
  let afterHead: undefined | { key: string; wait: () => Promise<void> };
  // The network boundary alone delays replies; production modules and storage stay real.
  const proxy = createServer((req, res) => {
    const upstream = forward(new URL(req.url ?? "/", process.env["MINIO_ENDPOINT"]), { method: req.method, headers: req.headers }, response => {
      void (async () => {
        if (req.method === "HEAD" && req.url?.split("?")[0] === `/listing-photos/${afterHead?.key}` && afterHead) {
          const { wait } = afterHead; afterHead = undefined; await wait();
        }
        res.writeHead(response.statusCode ?? 502, response.headers); response.pipe(res);
      })();
    });
    upstream.on("error", () => res.destroy());
    req.pipe(upstream);
  });

  beforeAll(async () => {
    const endpoint = process.env["MINIO_ENDPOINT"] ?? "";
    if (!inject("apiTestDatabases") || !["127.0.0.1", "localhost"].includes(new URL(endpoint).hostname)) {
      throw new Error("Renewal proof requires isolated test databases and loopback S3");
    }
    s3 = new S3Client({ endpoint, region: "us-east-1", forcePathStyle: true, requestChecksumCalculation: "WHEN_REQUIRED",
      credentials: { accessKeyId: process.env["MINIO_ACCESS_KEY"] ?? "minioadmin", secretAccessKey: process.env["MINIO_SECRET_KEY"] ?? "minioadmin" } });
    proxy.listen({ port: 0, host: "127.0.0.1" }); await once(proxy, "listening");
    const address = proxy.address();
    if (!address || typeof address === "string") throw new Error("Missing proxy address");
    const module = await Test.createTestingModule({ imports: [EventEmitterModule.forRoot(), bullTestRoot(),
      ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, load: [() => ({ MINIO_ENDPOINT: `http://127.0.0.1:${address.port}` })], validate: cfg => EnvSchema.parse(cfg) }),
      ListingsModule, ProfilePhotoModule,
      JwtModule.register({ global: true, secret: process.env["JWT_ACCESS_SECRET"] ?? "dev-secret-change-me" }),
    ] }).compile();
    app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    const reflector = app.get(Reflector);
    app.useGlobalGuards(new JwtAuthGuard(reflector, app.get(JwtService)), new AccountDeletionPendingGuard(reflector, app.get(IDENTITY_CHECK_PORT)));
    app.useGlobalFilters(new GlobalErrorFilter());
    await app.listen(0, "127.0.0.1"); api = supertest(app.getHttpServer()); db = app.get(PrismaService);
    for (const alias of ["owner", "other"]) await db.user.create({ data: { id: suite.id(alias), phone: suite.phone(alias), phoneVerifiedAt: new Date() } });
    bytes = await sharp({ create: { width: 32, height: 48, channels: 3, background: "red" } }).webp().toBuffer();
  });
  afterAll(async () => {
    afterHead = undefined;
    if (db) {
      await db.user.updateMany({ where: { id: { in: [owner, other] } }, data: { avatarUploadId: null, avatarKey: null } });
      await db.mediaUploadCleanup.deleteMany({ where: { key: { in: [...owned] } } });
      await cleanSuiteFixtures(db, suite, { userAliases: ["owner", "other"] });
    }
    if (s3) { for (const Key of owned) await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key })); s3.destroy(); }
    await app?.close(); proxy.closeAllConnections(); if (proxy.listening) await new Promise<void>(resolve => proxy.close(() => resolve()));
  });
  const auth = (user = owner) => `Bearer ${mintUserJwt(user)}`;
  async function issue(conditional = true) {
    const response = await api.post("/api/v1/uploads/presign").set("Authorization", auth()).send({ kind: "image", contentType: "image/webp", sizeBytes: bytes.length,
      ...(conditional ? { writeProtocol: "conditional-v1" } : {}) }).expect(201);
    const grant = UploadsSchemas.PresignResponseSchema.parse(response.body);
    for (const key of imageUploadObjectKeys(grant.key)) owned.add(key);
    return grant;
  }
  const renew = (key: string, user = owner, extra = {}) => api.post("/api/v1/uploads/renew").set("Authorization", auth(user)).send({ key, contentType: "image/webp", sizeBytes: bytes.length, ...extra });
  const put = (grant: UploadsSchemas.PresignResponse) => fetch(grant.uploadUrl, { method: "PUT", headers: grant.headers ?? {}, body: new Uint8Array(bytes) });
  async function original(key: string) {
    const response = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    return Buffer.from(await response.Body!.transformToByteArray());
  }
  async function uploadRecord(key: string) {
    const [record] = await app.get<MediaUploadRepository>(MEDIA_UPLOAD_REPOSITORY).findByKeys([key]);
    if (!record) throw new Error("Missing issuance fixture");
    return record;
  }
  function holdHead(key: string) {
    let entered!: () => void, release!: () => void;
    const reached = new Promise<void>(resolve => { entered = resolve; });
    const resume = new Promise<void>(resolve => { release = resolve; });
    afterHead = { key, wait: async () => { entered(); await resume; } };
    return { reached, release };
  }

  it("renews one identity, accepts one competing PUT and adopts exactly those bytes", async () => {
    const first = await issue();
    const renewed = UploadsSchemas.PresignResponseSchema.parse((await renew(first.key).expect(201)).body);
    expect(renewed.key).toBe(first.key);
    expect(renewed.headers).toEqual(first.headers);
    expect(new URL(renewed.uploadUrl).origin).toBe(process.env["MINIO_PUBLIC_URL"]);
    const results = await Promise.all([put(first), put(renewed)]);
    expect(results.map(result => result.status).sort()).toEqual([200, 412]);
    expect(await original(first.key)).toEqual(bytes);
    await renew(first.key).expect(400);
    await api.put("/api/v1/me/photo").set("Authorization", auth()).send({ key: first.key }).expect(200);
    await renew(first.key).expect(400);
    expect((await put(renewed)).status).toBe(412);
    expect(await original(first.key)).toEqual(bytes);
  });

  it("retains the mandatory signed conditional header and declared body size", async () => {
    const grant = await issue(), refreshed = UploadsSchemas.PresignResponseSchema.parse((await renew(grant.key).expect(201)).body);
    const headers = refreshed.headers!;
    expect(new URL(refreshed.uploadUrl).searchParams.get("X-Amz-SignedHeaders")?.split(";")).toContain("if-match");
    for (const sent of [Object.fromEntries(Object.entries(headers).filter(([name]) => name !== "if-match")), { ...headers, "if-match": '"changed"' }]) {
      const result = await fetch(refreshed.uploadUrl, { method: "PUT", headers: sent, body: new Uint8Array(bytes) });
      expect([400, 403, 409, 412]).toContain(result.status);
    }
    const wrongSize = await fetch(refreshed.uploadUrl, { method: "PUT", headers, body: new Uint8Array(bytes.subarray(1)) });
    expect([400, 403, 409, 412]).toContain(wrongSize.status);
    expect(await original(grant.key)).toEqual(Buffer.alloc(0));
    expect((await put(refreshed)).status).toBe(200);
    expect((await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: grant.key }))).ContentType).toBe("image/webp");
  });

  it("publishes renewed photo identities through the existing Listing adoption path", async () => {
    await seedSuiteCatalog(db, suite);
    const photos = [];
    for (let sortOrder = 0; sortOrder < 3; sortOrder++) {
      const first = await issue(), grant = UploadsSchemas.PresignResponseSchema.parse((await renew(first.key).expect(201)).body);
      expect((await put(grant)).status).toBe(200);
      photos.push({ photoId: randomUUID(), key: grant.key, sortOrder });
    }
    const created = await api.post("/api/v1/listings/drafts").set("Authorization", auth()).send({ initialPayload: {
      brandId: suite.catalog.brandId, modelId: suite.catalog.modelId, cityId: suite.catalog.cityId, regionId: suite.catalog.regionId,
      year: 2020, priceAmount: 100000, priceCurrency: "TMT", condition: "used", mileageKm: 50000,
      conditionDisclosure: { damaged: false }, description: "Synthetic renewal proof", contactPhone: suite.phone("owner"),
      allowCalls: true, allowChat: true, photos,
    } }).expect(201);
    const published = await api.post(`/api/v1/listings/drafts/${created.body.id}/publish`).set("Authorization", auth()).send({}).expect(201);
    const detail = await api.get(`/api/v1/listings/${published.body.id}`).expect(200);
    expect(detail.body.media.map((item: { key: string }) => item.key)).toEqual(photos.map(photo => photo.key));
    for (const photo of photos) {
      await renew(photo.key).expect(400);
      const read = await fetch(`${process.env["MINIO_PUBLIC_URL"]}/${bucket}/${photo.key}`);
      expect(read.status).toBe(200); expect(Buffer.from(await read.arrayBuffer())).toEqual(bytes);
    }
  });

  it("refuses missing auth, foreign/unknown/legacy issuance, changed declarations and account restrictions", async () => {
    const grant = await issue();
    await api.post("/api/v1/uploads/renew").send({ key: grant.key, contentType: "image/webp", sizeBytes: bytes.length }).expect(401);
    for (const response of [await renew(grant.key, other), await renew(`pending/${randomUUID()}/original.webp`),
      await renew((await issue(false)).key), await renew(grant.key, owner, { sizeBytes: bytes.length + 1 })]) {
      expect(response.status).toBe(400); expect(response.body.code).toBe("UPLOAD_NOT_AVAILABLE");
      expect(response.body.uploadUrl).toBeUndefined();
    }
    for (const extra of [{ contentType: "image/jpeg" }, { etag: '"caller-value"' }, { uploadUrl: "https://other.test" }]) {
      await renew(grant.key, owner, extra).expect(400);
    }
    await db.user.update({ where: { id: owner }, data: { suspendedAt: new Date() } });
    await renew(grant.key).expect(403);
    await db.user.update({ where: { id: owner }, data: { suspendedAt: null, deletionScheduledAt: new Date() } });
    await renew(grant.key).expect(403);
    await db.user.update({ where: { id: owner }, data: { deletionScheduledAt: null } });
  });

  it("does not repair a missing or changed member or trust malformed recorded provenance", async () => {
    for (const index of [0, 1, 2, 3, 4]) {
      const grant = await issue(), Key = imageUploadObjectKeys(grant.key)[index]!;
      await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key }));
      await renew(grant.key).expect(400);
      await expect(s3.send(new HeadObjectCommand({ Bucket: bucket, Key }))).rejects.toMatchObject({ $metadata: { httpStatusCode: 404 } });
    }
    const changed = await issue();
    await s3.send(new PutObjectCommand({ Bucket: bucket, Key: imageUploadObjectKeys(changed.key)[1], Body: Buffer.alloc(0), CacheControl: "no-store", ContentType: "image/webp" }));
    await renew(changed.key).expect(400);
    const malformed = await issue();
    const wrongFamily = imageUploadObjectKeys(malformed.key).map((key, index) => index === 4 ? key.replace("fullscreen.webp", "unissued.webp") : key);
    await db.mediaUpload.update({ where: { key: malformed.key }, data: { objectKeys: wrongFamily } });
    await renew(malformed.key).expect(400);
    for (const data of [{ sizeBytes: null }, { contentType: "image/jpeg" }]) {
      const grant = await issue();
      await db.mediaUpload.update({ where: { key: grant.key }, data });
      await renew(grant.key).expect(400);
    }
  });

  it("refuses PREPARING/RETIRED/DELETED and either adopter even if a legacy state is inconsistent", async () => {
    const grant = await issue(), record = await uploadRecord(grant.key);
    const claims = app.get<UploadClaimPort>(UPLOAD_CLAIM_PORT);
    const reservation = await claims.reserve({ userId: owner, uploadIds: [record.id], target: { type: "profile", id: owner } });
    await renew(grant.key).expect(400);
    if (!("token" in reservation)) throw new Error("Expected preparation");
    await claims.abandon(reservation.token);
    await renew(grant.key).expect(400);
    // Worker-owned terminal state fixture, not a simulated successful cleanup.
    await db.mediaUpload.update({ where: { id: record.id }, data: { state: "DELETED" } });
    await renew(grant.key).expect(400);
    const linked = await issue();
    await db.user.update({ where: { id: other }, data: { avatarUploadId: (await uploadRecord(linked.key)).id, avatarKey: linked.key } });
    await renew(linked.key).expect(400);
    await db.user.update({ where: { id: other }, data: { avatarUploadId: null, avatarKey: null } });
  });

  it.each(["prepare", "retire"])("rechecks provenance when %s wins during the real HEAD response", async action => {
    const grant = await issue(), record = await uploadRecord(grant.key), barrier = holdHead(grant.key);
    const response = renew(grant.key).then(value => value);
    await barrier.reached;
    const claims = app.get<UploadClaimPort>(UPLOAD_CLAIM_PORT);
    let token: string;
    try {
      const held = await claims.reserve({ userId: owner, uploadIds: [record.id], target: { type: "profile", id: owner } });
      if (!("token" in held)) throw new Error("Expected preparation");
      token = held.token;
      if (action === "retire") await claims.abandon(held.token);
    } finally { barrier.release(); }
    expect((await response).status).toBe(400);
    if (action === "prepare") await claims.abandon(token);
  });

  it("does not turn a lost successful PUT response into permission to overwrite its bytes", async () => {
    const grant = await issue();
    const target = new URL(grant.uploadUrl);
    const loss = createServer((req, res) => {
      const upstream = forward(target, { method: "PUT", headers: { ...req.headers, host: target.host } }, response => {
        response.resume(); response.once("end", () => res.destroy());
      });
      upstream.on("error", () => res.destroy()); req.pipe(upstream);
    });
    loss.listen({ port: 0, host: "127.0.0.1" }); await once(loss, "listening");
    const address = loss.address();
    if (!address || typeof address === "string") throw new Error("Missing loss fixture address");
    try {
      await expect(new Promise<void>((resolve, reject) => {
        const upload = forward({ hostname: "127.0.0.1", port: address.port, path: target.pathname + target.search,
          method: "PUT", headers: { ...grant.headers, "content-length": bytes.length } }, res => { res.resume(); res.once("end", resolve); });
        upload.on("error", reject); upload.end(bytes);
      })).rejects.toThrow();
      expect(await original(grant.key)).toEqual(bytes);
      await renew(grant.key).expect(400);
      expect((await put(grant)).status).toBe(412);
    } finally { loss.closeAllConnections(); await new Promise<void>(resolve => loss.close(() => resolve())); }
  });

  it("keeps the empty fence when a completed PUT overtakes the HEAD response, and cannot recreate a retired key", async () => {
    const grant = await issue(), barrier = holdHead(grant.key);
    const response = renew(grant.key).then(value => value);
    await barrier.reached;
    try { expect((await put(grant)).status).toBe(200); }
    finally { barrier.release(); }
    const raced = await response;
    expect(raced.status).toBe(201);
    const renewed = UploadsSchemas.PresignResponseSchema.parse(raced.body);
    expect(renewed.headers).toEqual(grant.headers);
    expect((await put(renewed)).status).toBe(412);
    expect(await original(grant.key)).toEqual(bytes);
    const empty = await issue(), refreshed = UploadsSchemas.PresignResponseSchema.parse((await renew(empty.key).expect(201)).body);
    const record = await uploadRecord(empty.key), claims = app.get<UploadClaimPort>(UPLOAD_CLAIM_PORT);
    const held = await claims.reserve({ userId: owner, uploadIds: [record.id], target: { type: "profile", id: owner } });
    if (!("token" in held)) throw new Error("Expected preparation");
    await claims.abandon(held.token);
    // The worker's actual storage deletion boundary, after the real permanent claim retirement.
    for (const Key of imageUploadObjectKeys(empty.key)) await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key }));
    expect([404, 409, 412]).toContain((await put(refreshed)).status);
    await renew(empty.key).expect(400);
    await expect(s3.send(new HeadObjectCommand({ Bucket: bucket, Key: empty.key }))).rejects.toMatchObject({ $metadata: { httpStatusCode: 404 } });
  });

  it.skipIf(process.env["PHOTO_RENEWAL_EXPIRY_PROOF"] !== "true")("renews after the real 600-second grant expires without changing object identity", async () => {
    const grant = await issue();
    expect(grant.expiresIn).toBe(600);
    const url = new URL(grant.uploadUrl), stamp = url.searchParams.get("X-Amz-Date")!;
    const issuedAt = Date.parse(stamp.replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/, "$1-$2-$3T$4:$5:$6Z"));
    const waitMs = issuedAt + 602_000 - Date.now();
    if (!Number.isFinite(waitMs) || waitMs < 590_000) throw new Error("Expected a fresh normal-duration grant");
    console.info("Real 600-second photo expiry fixture issued; waiting on owned resources only");
    await new Promise(resolve => setTimeout(resolve, waitMs));
    const expired = await put(grant);
    expect(expired.status).toBe(403);
    expect(await expired.text()).toContain("expired");
    expect(await original(grant.key)).toEqual(Buffer.alloc(0));
    const renewed = UploadsSchemas.PresignResponseSchema.parse((await renew(grant.key).expect(201)).body);
    expect(renewed.key).toBe(grant.key); expect(renewed.headers).toEqual(grant.headers);
    expect((await put(renewed)).status).toBe(200);
    expect(await original(grant.key)).toEqual(bytes);
    await api.put("/api/v1/me/photo").set("Authorization", auth()).send({ key: grant.key }).expect(200);
    await renew(grant.key).expect(400);
    expect((await put(renewed)).status).toBe(412);
    expect(await original(grant.key)).toEqual(bytes);
  }, 650_000);
});
