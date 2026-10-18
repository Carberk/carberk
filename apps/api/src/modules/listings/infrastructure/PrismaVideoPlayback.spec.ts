import "reflect-metadata";
import { describe, expect, it } from "vitest";
import { APP_GUARD } from "@nestjs/core";
import { JwtModule, JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import supertest from "supertest";
import { JwtAuthGuard } from "../../../common/jwt-auth.guard";
import { VIDEO_GRANT_ISSUER } from "../application/VideoPlaybackPorts";
import { VideoGrantController } from "../presentation/VideoGrantController";
import type { PrismaService } from "@auto-tm/db";
import type { BusinessAuthorityPort } from "../../identity/identity.public";
import { PrismaVideoPlayback } from "./PrismaVideoPlayback";

const secret = "s".repeat(43);
function fixture() {
  const grant = { id: "grant", ownerUserId: "viewer", ownerSessionId: "session", purpose: "playback", listingId: "listing", generationId: "generation", expiresAt: new Date(Date.now() + 60_000), revokedAt: null as Date | null };
  const listing = { id: "listing", activeVideoGenerationId: "generation", sellerId: "seller", businessId: null, status: "sold" };
  const generation = { id: "generation", listingId: "listing", uploadId: "upload", state: "READY", readyAt: new Date(), retiredAt: null as Date | null, manifest: { assets: [{ path: "master.m3u8", key: "video/v1/upload/generation/master.m3u8", purpose: "playback", sizeBytes: 23, contentType: "application/vnd.apple.mpegurl" }] } };
  let active = true; let eligible = true;
  let stored: unknown;
  const transaction = { $executeRaw: async () => 0, $queryRaw: async () => [{ id: "grant" }], videoGrant: { findUnique: async () => grant, create: async ({ data }: { data: unknown }) => { stored = data; return data; } }, listing: { findUnique: async () => listing }, videoGeneration: { findUnique: async () => generation } };
  const prisma = { $transaction: async (run: (tx: typeof transaction) => Promise<unknown>) => run(transaction) } as unknown as PrismaService;
  const identity = { resolve: async () => { if (!active) throw new Error("SESSION_REQUIRED"); return { kind: "personal", userId: "viewer" }; }, authorize: async () => { throw new Error("MEMBERSHIP_REQUIRED"); } } as BusinessAuthorityPort;
  return { grant, listing, generation, stored: () => stored, service: new PrismaVideoPlayback(prisma, identity, { isEligible: () => eligible }), revokeSession: () => { active = false; }, revokeTester: () => { eligible = false; } };
}
describe("current persisted playback authority", () => {
  it("admits worker readback hashes while refusing malformed immutable asset hashes", async () => {
    const f = fixture();
    Object.assign(f.generation.manifest.assets[0]!, { sha256: "a".repeat(64) });
    expect(await f.service.authorize(secret)).toMatchObject({ purpose: "playback", assets: [{ path: "master.m3u8" }] });
    Object.assign(f.generation.manifest.assets[0]!, { sha256: "invalid" });
    expect(await f.service.authorize(secret)).toBeNull();
  });
  it("denies banned Listing video even to the seller on both mint and asset reads", async () => {
    const f = fixture(); f.listing.status = "banned"; f.listing.sellerId = "viewer";
    expect(await f.service.authorize(secret)).toBeNull();
    expect(await f.service.issue({ userId: "viewer", sessionId: "session", listingId: "listing", purpose: "playback" })).toBeNull();
  });
  it("issues over authenticated HTTP from the verified session and refuses body authority injection", async () => {
    const f = fixture();
    const module = await Test.createTestingModule({ imports: [JwtModule.register({ secret: "video-http-synthetic-fixture" })], controllers: [VideoGrantController], providers: [{ provide: APP_GUARD, useClass: JwtAuthGuard }, { provide: VIDEO_GRANT_ISSUER, useValue: f.service }] }).compile();
    const app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    try {
      await app.listen(0, "127.0.0.1"); const request = supertest(app.getHttpServer());
      const url = "/api/v1/listings/00000000-0000-4000-8000-000000000001/video-grants";
      await request.post(url).send({ purpose: "playback" }).expect(401);
      const token = module.get(JwtService).sign({ sub: "viewer", sid: "session" });
      await request.post(url).set("authorization", `Bearer ${token}`).send({ purpose: "playback", ownerUserId: "other" }).expect(400);
      const response = await request.post(url).set("authorization", `Bearer ${token}`).send({ purpose: "playback" }).expect(201);
      expect(response.headers["cache-control"]).toBe("private, no-store"); expect(response.body.url).toMatch(/^\/video-grants\/[A-Za-z0-9_-]{43}\/master\.m3u8$/);
      expect(f.stored()).toMatchObject({ ownerUserId: "viewer", ownerSessionId: "session" });
      f.revokeSession();
      await request.post(url).set("authorization", `Bearer ${token}`).send({ purpose: "playback" }).expect(404);
    } finally { await app.close(); }
  });
  it("mints only same-origin purpose-bound grants for current ready generations", async () => {
    const f = fixture();
    const issued = await f.service.issue({ userId: "viewer", sessionId: "session", listingId: "listing", purpose: "playback" });
    expect(issued?.url).toMatch(/^\/video-grants\/[A-Za-z0-9_-]{43}\/master\.m3u8$/);
    expect(issued?.generationId).toBe("generation");
    expect(f.stored()).toMatchObject({ ownerUserId: "viewer", ownerSessionId: "session", generationId: "generation", purpose: "playback", secretHash: expect.stringMatching(/^[a-f0-9]{64}$/) });
    expect(JSON.stringify(f.stored())).not.toContain(issued!.url.split("/")[2]);
    f.revokeTester();
    expect(await f.service.issue({ userId: "viewer", sessionId: "session", listingId: "listing", purpose: "playback" })).toBeNull();
  });
  it("admits exact ready active generations including ordinary sold Listing visibility", async () => { const f = fixture(); expect(await f.service.authorize(secret)).toMatchObject({ purpose: "playback", assets: [{ path: "master.m3u8" }] }); });
  it("refuses each later request after session, tester, grant or active-generation revocation", async () => {
    const session = fixture(); session.revokeSession(); expect(await session.service.authorize(secret)).toBeNull();
    const tester = fixture(); tester.revokeTester(); expect(await tester.service.authorize(secret)).toBeNull();
    const grant = fixture(); grant.grant.revokedAt = new Date(); expect(await grant.service.authorize(secret)).toBeNull();
    const replaced = fixture(); replaced.listing.activeVideoGenerationId = "replacement"; expect(await replaced.service.authorize(secret)).toBeNull();
    const retired = fixture(); retired.generation.retiredAt = new Date(); expect(await retired.service.authorize(secret)).toBeNull();
  });
  it("refuses unbound legacy grants, expired grants, banned public Listings and arbitrary manifest keys", async () => {
    const legacy = fixture(); legacy.grant.ownerSessionId = ""; expect(await legacy.service.authorize(secret)).toBeNull();
    const expired = fixture(); expired.grant.expiresAt = new Date(0); expect(await expired.service.authorize(secret)).toBeNull();
    const banned = fixture(); banned.listing.status = "banned"; expect(await banned.service.authorize(secret)).toBeNull();
    const escaped = fixture(); escaped.generation.manifest.assets[0]!.key = "private/another-user/secret"; expect(await escaped.service.authorize(secret)).toBeNull();
  });
});
