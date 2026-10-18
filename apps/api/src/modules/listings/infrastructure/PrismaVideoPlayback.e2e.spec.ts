import { createHash } from "node:crypto";
import { PrismaService } from "@auto-tm/db";
import { beforeAll, beforeEach, afterAll, describe, expect, it } from "vitest";
import { cleanSuiteFixtures, defineE2eSuite, seedSuiteCatalog } from "../../../../test/helpers/e2eSuite";
import type { BusinessAuthorityPort } from "../../identity/identity.public";
import { PrismaVideoPlayback } from "./PrismaVideoPlayback";

const suite = defineE2eSuite("video-playback-authority");
const car = suite.id("car"), generation = suite.id("generation"), session = suite.id("session"), grant = suite.id("grant"), upload = suite.id("upload");
const secret = "p".repeat(43);
describe("video playback authority on disposable PostgreSQL", () => {
  let prisma: PrismaService; let playback: PrismaVideoPlayback;
  // Identity is an external boundary here. Its own suites prove public authority resolution.
  const identity: BusinessAuthorityPort = {
    resolve: async (subject) => { const found = await prisma.session.findUnique({ where: { id: subject.sessionId }, include: { user: true } }); if (!found || found.userId !== subject.userId || found.expiresAt <= new Date() || found.user.suspendedAt || found.user.deletionScheduledAt) throw new Error("USER_INACTIVE"); return { kind: "personal", userId: subject.userId }; },
    authorize: async () => { throw new Error("MEMBERSHIP_REQUIRED"); },
  };
  const clean = async () => {
    await prisma.videoGrant.deleteMany({ where: { listingId: car } });
    await prisma.listing.updateMany({ where: { id: car }, data: { activeVideoGenerationId: null } });
    await prisma.videoGeneration.deleteMany({ where: { listingId: car } });
    await cleanSuiteFixtures(prisma, suite, { userAliases: ["seller", "viewer"] });
  };
  beforeAll(async () => { prisma = new PrismaService(); await prisma.$connect(); playback = new PrismaVideoPlayback(prisma, identity, { isEligible: () => true }); });
  beforeEach(async () => {
    await clean(); await seedSuiteCatalog(prisma, suite);
    for (const who of ["seller", "viewer"]) await prisma.user.create({ data: { id: suite.id(who), phone: suite.phone(who), phoneVerifiedAt: new Date() } });
    await prisma.session.create({ data: { id: session, userId: suite.id("viewer"), refreshTokenHash: suite.id("refresh-hash"), expiresAt: new Date(Date.now() + 3_600_000) } });
    await prisma.listing.create({ data: { id: car, sellerId: suite.id("seller"), status: "active", brandId: suite.catalog.brandId, modelId: suite.catalog.modelId, cityId: suite.catalog.cityId, priceAmount: 100 } });
    await prisma.videoGeneration.create({ data: { id: generation, listingId: car, uploadId: upload, state: "READY", readyAt: new Date(), manifest: { assets: [{ path: "master.m3u8", key: `video/v1/${upload}/${generation}/master.m3u8`, purpose: "playback", sizeBytes: 23, contentType: "application/vnd.apple.mpegurl" }] } } });
    await prisma.listing.update({ where: { id: car }, data: { activeVideoGenerationId: generation } });
    await prisma.videoGrant.create({ data: { id: grant, secretHash: createHash("sha256").update(secret).digest("hex"), ownerUserId: suite.id("viewer"), ownerSessionId: session, listingId: car, generationId: generation, purpose: "playback", expiresAt: new Date(Date.now() + 300_000) } });
  });
  afterAll(async () => { await clean(); await prisma.onModuleDestroy(); });
  it("authorizes exact generation and refuses subsequent reads after session deletion", async () => {
    expect(await playback.authorize(secret)).toMatchObject({ purpose: "playback" });
    await prisma.session.delete({ where: { id: session } });
    expect(await prisma.videoGrant.findUnique({ where: { id: grant } })).toBeNull();
    expect(await playback.authorize(secret)).toBeNull();
  });
  it("refuses an old grant immediately after canonical generation removal", async () => {
    await prisma.listing.update({ where: { id: car }, data: { activeVideoGenerationId: null, activeVideoRevision: { increment: 1 } } });
    expect(await playback.authorize(secret)).toBeNull();
  });
  it("stores only the grant hash and stops issuing when the current session is no longer valid", async () => {
    const issued = await playback.issue({ userId: suite.id("viewer"), sessionId: session, listingId: car, purpose: "playback" });
    expect(issued?.url).toMatch(/^\/video-grants\/[A-Za-z0-9_-]{43}\/master\.m3u8$/);
    const rows = await prisma.videoGrant.findMany({ where: { listingId: car } });
    expect(rows).toHaveLength(2); expect(JSON.stringify(rows)).not.toContain(issued!.url.split("/")[2]);
    await prisma.session.update({ where: { id: session }, data: { expiresAt: new Date(0) } });
    expect(await playback.issue({ userId: suite.id("viewer"), sessionId: session, listingId: car, purpose: "playback" })).toBeNull();
  });
});
