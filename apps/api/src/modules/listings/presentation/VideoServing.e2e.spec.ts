import "reflect-metadata";
import { randomUUID } from "node:crypto";
import { PrismaService } from "@auto-tm/db";
import { ListingsSchemas } from "@auto-tm/contracts";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { BullModule } from "@nestjs/bullmq";
import { JwtModule, JwtService } from "@nestjs/jwt";
import { Reflector } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import supertest from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { EnvSchema } from "../../../env.schema";
import { ConfigListingVideoAccess } from "../../../common/ConfigListingVideoAccess";
import { JwtAuthGuard } from "../../../common/jwt-auth.guard";
import { GlobalErrorFilter } from "../../../common/error.filter";
import { IdentityModule } from "../../identity/identity.module";
import { IDENTITY_CLOCK_PORT } from "../../identity/identity.public";
import { ServeListingVideo } from "../application/ServeListingVideo";
import { VIDEO_MEDIA_STORAGE } from "../domain/ports/VideoMediaStorage";
import { VIDEO_SERVING_REPOSITORY } from "../domain/ports/VideoServingRepository";
import { PrismaVideoServingRepository } from "../infrastructure/PrismaVideoServingRepository";
import { BucketVideoStorage } from "../infrastructure/BucketVideoStorage";
import { PrismaListingsReadRepository } from "../infrastructure/PrismaListingsReadRepository";
import { defineE2eSuite, seedSuiteCatalog } from "../../../../test/helpers/e2eSuite";
import { VideoServingController } from "./VideoServingController";

const enabled = process.env["VIDEO_STORAGE_E2E"] === "1" || process.env["GITHUB_ACTIONS"] === "true";
describe.skipIf(!enabled)("every Listing video HTTP request on real Postgres/Bucket", () => {
  const suite = defineE2eSuite(`serve-video-${randomUUID().slice(0, 8)}`);
  const owner = suite.id("owner"), viewer = suite.id("viewer"), admin = suite.id("admin"), outsider = suite.id("outsider");
  const listingId = suite.id("listing"), videoId = suite.id("video"), generationId = suite.id("generation"), sourceId = suite.id("source");
  const prefix = `test-serving/${suite.slug}/`;
  const keys: string[] = [];
  let now = new Date();
  let app: NestFastifyApplication, prisma: PrismaService, request: ReturnType<typeof supertest>, storage: BucketVideoStorage, config: ConfigService;
  let s3: S3Client;
  let manifest: Record<string, { key: string; sizeBytes: number }>;
  const path = (audience = "viewer", type = "listing", id = listingId) => `/api/v1/listings/video-access/${audience}/${type}/${id}`;
  const auth = (id = viewer) => ({ Authorization: `Bearer ${app.get(JwtService).sign({ sub: id, sid: suite.id(`session-${id}`) })}` });
  const masterBody = () => `#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-STREAM-INF:BANDWIDTH=100000,CODECS="avc1.64001e",RESOLUTION=202x360\n${prefix}hls/360p/index.m3u8\n`;
  const local = (url: string) => { const parsed = new URL(url); expect(parsed.origin).toBe("https://media.example.test"); return parsed.pathname + parsed.search; };
  async function read(audience = "viewer", id = viewer, play = false, type = "listing", targetId = listingId) {
    return request[play ? "post" : "get"](path(audience, type, targetId) + (play ? "/playback" : "")).set(auth(id)).expect(play ? 201 : 200);
  }
  async function children(url: string) {
    const response = await request.get(local(url)).expect(200);
    expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(response.headers["content-type"]).toContain("application/vnd.apple.mpegurl");
    const urls = response.text.match(/https:\/\/[^\s"]+/g) ?? [];
    expect(urls.length).toBeGreaterThan(0);
    for (const child of urls) expect(new URL(child).searchParams.get("grant")).toBeTruthy();
    return urls;
  }
  beforeAll(async () => {
    const env = EnvSchema.parse({ ...process.env, LISTING_VIDEO_API_ORIGIN: "https://media.example.test", LISTING_VIDEO_VIEW_TESTER_USER_IDS: viewer, LISTING_VIDEO_UPLOAD_TESTER_USER_IDS: owner });
    const module = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, load: [() => env] }), EventEmitterModule.forRoot(), BullModule.forRoot({ connection: { url: env.REDIS_URL } }), JwtModule.register({ global: true, secret: env.JWT_ACCESS_SECRET }), IdentityModule],
      controllers: [VideoServingController],
      providers: [PrismaService, ServeListingVideo, ConfigListingVideoAccess, { provide: VIDEO_SERVING_REPOSITORY, useClass: PrismaVideoServingRepository }, { provide: VIDEO_MEDIA_STORAGE, useClass: BucketVideoStorage }],
    }).overrideProvider(IDENTITY_CLOCK_PORT).useValue({ now: () => now }).compile();
    app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    app.useGlobalGuards(new JwtAuthGuard(app.get(Reflector), app.get(JwtService)));
    app.useGlobalFilters(new GlobalErrorFilter());
    await app.listen(0, "127.0.0.1");
    request = supertest(app.getHttpServer()); prisma = app.get(PrismaService); storage = app.get(VIDEO_MEDIA_STORAGE); config = app.get(ConfigService);
    s3 = new S3Client({ endpoint: env.MINIO_ENDPOINT, region: env.MINIO_REGION, credentials: { accessKeyId: env.MINIO_ACCESS_KEY, secretAccessKey: env.MINIO_SECRET_KEY }, forcePathStyle: true });
    const multipart = await storage.createMultipart({ key: `${prefix}bootstrap`, contentType: "video/mp4" });
    await storage.abortMultipart({ key: `${prefix}bootstrap`, uploadId: multipart.uploadId });
    await seedSuiteCatalog(prisma, suite);
    for (const id of [owner, viewer, admin, outsider]) {
      await prisma.user.create({ data: { id, role: id === admin ? "admin" : "buyer" } });
      await prisma.session.create({ data: { id: suite.id(`session-${id}`), userId: id, refreshTokenHash: randomUUID(), expiresAt: new Date(now.getTime() + 86_400_000), adminTotpExpiresAt: new Date(now.getTime() + 3_600_000) } });
    }
    await prisma.listing.create({ data: { id: listingId, sellerId: owner, status: "active", brandId: suite.catalog.brandId, modelId: suite.catalog.modelId, year: 2020, condition: "used", priceAmount: 100, priceCurrency: "TMT", priceTmt: 100, regionId: suite.catalog.regionId, cityId: suite.catalog.cityId, contactPhone: suite.phone("owner"), publishedAt: now } });
    await prisma.listingVideo.create({ data: { id: videoId, ownerId: owner, listingId } });
    await prisma.videoSource.create({ data: { id: sourceId, userId: owner, listingVideoId: videoId, bucket: storage.bucket, objectKey: `${prefix}source.mp4`, multipartUploadId: "fixture", contentType: "video/mp4", sizeBytes: 10, partSizeBytes: 10, partCount: 1, state: "COMPLETED", coverOffsetMs: 0, expiresAt: now } });
    manifest = {};
    // Worker format (ListingVideoProcessor): every playlist line is a full recorded Bucket key.
    const assets: Record<string, [string, string]> = { master: ["hls/master.m3u8", masterBody()], "playlist:360": ["hls/360p/index.m3u8", `#EXTM3U\n#EXT-X-MEDIA:TYPE=SUBTITLES,URI="${prefix}hls/360p/360-000.ts"\n#EXTINF:3,\n${prefix}hls/360p/360-000.ts\n#EXT-X-ENDLIST\n`], "segment:360:0": ["hls/360p/360-000.ts", "0123456789"] };
    for (const variant of ["thumbnail", "list", "detail", "fullscreen"]) assets[`cover:${variant}`] = [`${variant}.webp`, "WEBPfixture"];
    for (const [member, [relative, body]] of Object.entries(assets)) {
      const key = prefix + relative; keys.push(key); manifest[member] = { key, sizeBytes: Buffer.byteLength(body) };
      await s3.send(new PutObjectCommand({ Bucket: storage.bucket, Key: key, Body: body }));
    }
    await prisma.videoGeneration.create({ data: { id: generationId, listingVideoId: videoId, sourceId, status: "Ready", coverOffsetMs: 0, durationMs: 3000, manifest } });
    const replacementSource = await prisma.videoSource.create({ data: { userId: owner, listingVideoId: videoId, bucket: storage.bucket, objectKey: `${prefix}replacement.mp4`, multipartUploadId: "replacement-fixture", contentType: "video/mp4", sizeBytes: 10, partSizeBytes: 10, partCount: 1, state: "COMPLETED", coverOffsetMs: 0, expiresAt: now } });
    await prisma.videoGeneration.create({ data: { id: suite.id("new-generation"), listingVideoId: videoId, sourceId: replacementSource.id, status: "Ready", coverOffsetMs: 0, durationMs: 3000, manifest } });
    await prisma.listingVideo.update({ where: { id: videoId }, data: { activeGenerationId: generationId } });
  });
  beforeEach(async () => {
    now = new Date(); config.set("LISTING_VIDEO_VIEW_TESTER_USER_IDS", viewer); config.set("LISTING_VIDEO_UPLOAD_TESTER_USER_IDS", owner);
    await prisma.user.updateMany({ where: { id: { in: [owner, viewer, admin, outsider] } }, data: { suspendedAt: null, deletionScheduledAt: null } });
    await prisma.user.update({ where: { id: admin }, data: { role: "admin" } });
    await prisma.listing.update({ where: { id: listingId }, data: { status: "active", deletedAt: null } });
    await prisma.videoGeneration.update({ where: { id: generationId }, data: { status: "Ready", manifest } });
    await prisma.listingVideo.update({ where: { id: videoId }, data: { activeGenerationId: generationId } });
    await prisma.session.upsert({ where: { id: suite.id(`session-${viewer}`) }, create: { id: suite.id(`session-${viewer}`), userId: viewer, refreshTokenHash: randomUUID(), expiresAt: new Date(now.getTime() + 86_400_000) }, update: { expiresAt: new Date(now.getTime() + 86_400_000) } });
    await prisma.session.update({ where: { id: suite.id(`session-${admin}`) }, data: { adminTotpExpiresAt: new Date(now.getTime() + 3_600_000) } });
  });
  afterAll(async () => {
    for (const key of keys) await storage.deleteObject(key);
    s3?.destroy();
    await app?.close();
  });
  it("issues cover-only reads, starts HLS only on Play and rewrites every child explicitly", async () => {
    const cover = await read(); expect(ListingsSchemas.VideoAccessResponseSchema.safeParse(cover.body).success).toBe(true); expect(cover.body.url).toBeUndefined();
    await request.get(local(cover.body.video.cover.detail)).expect("Content-Type", "image/webp").expect(200);
    const play = await read("viewer", viewer, true);
    expect(new URL(play.body.url).pathname).toMatch(/\.m3u8$/);
    const [variant] = await children(play.body.url); expect(new URL(variant!).pathname).toMatch(/\.m3u8$/);
    const segments = await children(variant!);
    const bytes = await request.get(local(segments[0]!)).expect("Content-Type", "video/mp2t").expect(200);
    expect(bytes.body.toString()).toBe("0123456789");
    const coverGrant = new URL(cover.body.video.cover.detail).searchParams.get("grant")!;
    const master = new URL(play.body.url); master.searchParams.set("grant", coverGrant);
    await request.get(local(master.toString())).expect(404);
  });
  it("shortens grants only for local testing, never in a deployed environment", async () => {
    const lifetime = async () => { const body = (await read("viewer", viewer, true)).body; return new Date(body.expiresAt).getTime() - Date.now(); };
    const appEnv = config.get("APP_ENV");
    try {
      expect(await lifetime()).toBeGreaterThan(290_000);
      config.set("LISTING_VIDEO_GRANT_TTL_SECONDS", 20);
      expect(await lifetime()).toBeLessThanOrEqual(20_000);
      config.set("APP_ENV", "staging");
      expect(await lifetime()).toBeGreaterThan(290_000);
    } finally {
      config.set("APP_ENV", appEnv); config.set("LISTING_VIDEO_GRANT_TTL_SECONDS", 300);
    }
  });
  it("returns binary ranges, suffixes, HEAD, validators and unsatisfiable ranges without cache bypass", async () => {
    const play = await read("viewer", viewer, true); const [variant] = await children(play.body.url); const [segment] = await children(variant!); const url = local(segment!);
    const ranged = await request.get(url).set("Range", "bytes=2-5").expect(206);
    expect(ranged.body.toString()).toBe("2345"); expect(ranged.headers["content-range"]).toBe("bytes 2-5/10"); expect(ranged.headers["content-length"]).toBe("4"); expect((ranged.headers["etag"] ?? "")).toBeTruthy();
    const suffix = await request.get(url).set("Range", "bytes=-3").expect(206); expect(suffix.body.toString()).toBe("789");
    await request.head(url).expect(200).expect("Content-Length", "10").expect("Accept-Ranges", "bytes");
    await request.head(url).set("Range", "bytes=1-2").expect(206).expect("Content-Length", "2");
    await request.get(url).set("Range", "bytes=99-").expect(416).expect("Content-Range", "bytes */10");
    await request.get(url).set("Range", "bytes=0-1,3-4").expect(416);
    await request.get(url).set("If-None-Match", (ranged.headers["etag"] ?? "")).expect(200);
    await prisma.listing.update({ where: { id: listingId }, data: { status: "banned" } });
    await request.head(url).set("If-None-Match", (ranged.headers["etag"] ?? "")).expect(404).expect("Cache-Control", "private, no-store");
  });
  it.each(["banned", "archived", "deleted", "replaced", "removed", "retired"])("revokes cover, playlist and segment after %s", async (state) => {
    const cover = await read(); const play = await read("viewer", viewer, true); const [variant] = await children(play.body.url); const [segment] = await children(variant!);
    if (state === "banned" || state === "archived") await prisma.listing.update({ where: { id: listingId }, data: { status: state } });
    else if (state === "deleted") await prisma.listing.update({ where: { id: listingId }, data: { deletedAt: now } });
    else if (state === "retired") await prisma.videoGeneration.update({ where: { id: generationId }, data: { status: "Retired" } });
    else await prisma.listingVideo.update({ where: { id: videoId }, data: { activeGenerationId: state === "replaced" ? suite.id("new-generation") : null } });
    for (const url of [cover.body.video.cover.detail, play.body.url, variant, segment]) await request.get(local(url)).expect(404).expect("Cache-Control", "private, no-store");
    if (state === "replaced") { const replacement = await read("viewer", viewer, true); await request.get(local(replacement.body.url)).expect(200); }
  });
  it("rejects non-testers, removed view membership and invalid signatures while uploads are off", async () => {
    await request.get(path()).set(auth(outsider)).expect(404); await request.get(path()).expect(401);
    const cover = await read(); const url = local(cover.body.video.cover.detail);
    config.set("LISTING_VIDEO_UPLOADS_ENABLED", false); await request.get(url).expect(200);
    await request.get(url.replace(/grant=./, "grant=X")).expect(404);
    config.set("LISTING_VIDEO_VIEW_TESTER_USER_IDS", ""); await request.get(url).expect(404);
  });
  it.each(["expiry", "logout", "session-expired", "suspended", "deleting"])("rechecks %s on requests and authenticated renewal", async (state) => {
    const cover = await read(); const url = local(cover.body.video.cover.detail);
    if (state === "expiry") now = new Date(now.getTime() + 300_001);
    else if (state === "logout") await prisma.session.delete({ where: { id: suite.id(`session-${viewer}`) } });
    else if (state === "session-expired") await prisma.session.update({ where: { id: suite.id(`session-${viewer}`) }, data: { expiresAt: now } });
    else await prisma.user.update({ where: { id: viewer }, data: state === "suspended" ? { suspendedAt: now } : { deletionScheduledAt: now } });
    await request.get(url).expect(404).expect("Cache-Control", "private, no-store");
    await request.post(path() + "/playback").set(auth()).expect(state === "expiry" ? 201 : 404);
  });
  it("isolates upload-only owner preview, moderator permission, and viewer routes", async () => {
    await request.get(path()).set(auth(owner)).expect(404);
    const preview = await read("owner-preview", owner, true);
    await request.get(local(preview.body.url)).expect(200);
    await request.get(local(preview.body.url).replace("/owner-preview/", "/viewer/")).expect(404);
    await request.get(path("owner-preview")).set(auth(outsider)).expect(404);
    await prisma.listing.update({ where: { id: listingId }, data: { status: "banned" } });
    const moderated = await read("moderator", admin, true); const url = local(moderated.body.url); await request.get(url).expect(200);
    await request.get(url.replace("/moderator/", "/viewer/")).expect(404);
    await prisma.user.update({ where: { id: admin }, data: { role: "buyer" } }); await request.get(url).expect(404);
    await prisma.user.update({ where: { id: admin }, data: { role: "admin" } });
    await prisma.session.update({ where: { id: suite.id(`session-${admin}`) }, data: { adminTotpExpiresAt: now } }); await request.get(url).expect(404);
  });
  it("keeps Ready Draft private and refuses injected playlist resources outside the manifest", async () => {
    const draft = await prisma.listingDraft.create({ data: { userId: owner, payload: {} } });
    await prisma.listingVideo.update({ where: { id: videoId }, data: { listingId: null, draftId: draft.id } });
    try {
      const preview = await read("owner-preview", owner, true, "draft", draft.id); await request.get(local(preview.body.url)).expect(200);
      await request.get(path("viewer", "draft", draft.id)).set(auth()).expect(404);
      const master = manifest["master"]!.key;
      await s3.send(new PutObjectCommand({ Bucket: storage.bucket, Key: master, Body: '#EXTM3U\nhttps://evil.example/segment.ts\n' }));
      await request.get(local(preview.body.url)).expect(404);
      await s3.send(new PutObjectCommand({ Bucket: storage.bucket, Key: master, Body: '#EXTM3U\n../not-recorded.ts\n' }));
      await request.get(local(preview.body.url)).expect(404);
      await s3.send(new PutObjectCommand({ Bucket: storage.bucket, Key: master, Body: '#EXTM3U\nhls/360p/index.m3u8\n' }));
      await request.get(local(preview.body.url)).expect(404);
      await request.get(local(preview.body.url).replace(/\/[^/]+\.m3u8\?/, "/source.mp4?")).expect(404);
    } finally {
      await prisma.listingVideo.update({ where: { id: videoId }, data: { listingId, draftId: null } });
      await prisma.listingDraft.delete({ where: { id: draft.id } });
      await s3.send(new PutObjectCommand({ Bucket: storage.bucket, Key: manifest["master"]!.key, Body: masterBody() }));
    }
  });
  it("binds control authority to the current login session rather than a User id alone", async () => {
    const jwt = app.get(JwtService);
    for (const actor of [{ sub: viewer }, { sub: owner, sid: suite.id(`session-${viewer}`) }]) {
      await request.get(path()).set("Authorization", `Bearer ${jwt.sign(actor)}`).expect(404);
    }
  });
  it("hides a seller's pending replacement or first upload from viewers but not from owner or moderator", async () => {
    const pending = suite.id("new-generation");
    await prisma.videoGeneration.update({ where: { id: pending }, data: { status: "Processing" } });
    await prisma.listingVideo.update({ where: { id: videoId }, data: { pendingGenerationId: pending } });
    try {
      const viewerReady = await read(); expect(viewerReady.body.status).toBe("ready"); expect(viewerReady.body.pendingStatus).toBeUndefined();
      expect((await read("owner-preview", owner)).body.pendingStatus).toBe("processing");
      expect((await read("moderator", admin)).body.pendingStatus).toBe("processing");
      await prisma.listingVideo.update({ where: { id: videoId }, data: { activeGenerationId: null } });
      expect((await read()).body).toEqual({ status: "none" });
      expect((await read("owner-preview", owner)).body).toEqual({ status: "processing" });
    } finally {
      await prisma.listingVideo.update({ where: { id: videoId }, data: { pendingGenerationId: null } });
      await prisma.videoGeneration.update({ where: { id: pending }, data: { status: "Ready" } });
    }
  });
  it("turns owner preview off with the upload list and on banned Listings, including issued grants", async () => {
    const preview = await read("owner-preview", owner, true); const url = local(preview.body.url);
    config.set("LISTING_VIDEO_UPLOAD_TESTER_USER_IDS", "");
    await request.get(path("owner-preview")).set(auth(owner)).expect(404); await request.get(url).expect(404);
    await request.get(path("owner-preview")).set(auth(outsider)).expect(404);
    config.set("LISTING_VIDEO_UPLOAD_TESTER_USER_IDS", owner); await request.get(url).expect(200);
    await prisma.listing.update({ where: { id: listingId }, data: { status: "banned" } });
    await request.get(path("owner-preview")).set(auth(owner)).expect(404); await request.get(url).expect(404);
  });
  it("flags Admin report Listings with a current non-retired video only", async () => {
    const reads = new PrismaListingsReadRepository(prisma, {} as never);
    expect((await reads.getListingAdminSummaries([listingId]))[0]?.hasVideo).toBe(true);
    await prisma.videoGeneration.update({ where: { id: generationId }, data: { status: "Retired" } });
    expect((await reads.getListingAdminSummaries([listingId]))[0]?.hasVideo).toBe(false);
    await prisma.listingVideo.update({ where: { id: videoId }, data: { activeGenerationId: null } });
    expect((await reads.getListingAdminSummaries([listingId]))[0]?.hasVideo).toBe(false);
  });
  it("never lets moderators reuse retained grants after removal or purge", async () => {
    const cover = await read("moderator", admin); const play = await read("moderator", admin, true);
    const [variant] = await children(play.body.url); const [segment] = await children(variant!);
    const urls = [cover.body.video.cover.detail, play.body.url, variant, segment];
    await prisma.listingVideo.update({ where: { id: videoId }, data: { activeGenerationId: null } });
    for (const url of urls) await request.get(local(url)).expect(404);
    await prisma.listingVideo.delete({ where: { id: videoId } });
    for (const url of urls) await request.get(local(url)).expect(404);
  });

});
