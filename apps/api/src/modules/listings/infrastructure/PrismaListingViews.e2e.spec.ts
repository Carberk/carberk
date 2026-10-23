import { ConfigService } from "@nestjs/config";
import { PrismaService } from "@auto-tm/db";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { cleanSuiteFixtures, defineE2eSuite, seedSuiteCatalog } from "../../../../test/helpers/e2eSuite";
import { PrismaListingViews } from "./PrismaListingViews";
import { PrismaListingRepository } from "./PrismaListingRepository";
import { PrismaFavoriteRepository } from "./PrismaFavoriteRepository";

const suite = defineE2eSuite("listing-views-874");
const now = new Date("2026-10-14T19:00:00Z");
const secret = "synthetic-listing-view-test-secret-874";
describe("Listing-view persistence on hosted disposable PostgreSQL", () => {
  let prisma: PrismaService;
  let views: PrismaListingViews;
  const car = suite.id("car");
  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.onModuleInit();
    views = new PrismaListingViews(prisma, new ConfigService({ LISTING_VIEWS_ENABLED: true, LISTING_VIEW_SALT_SECRET: secret }));
  });
  afterAll(async () => {
    await cleanSuiteFixtures(prisma, suite, { userAliases: ["seller", "buyer"] });
    await prisma.onModuleDestroy();
  });
  beforeEach(async () => {
    await cleanSuiteFixtures(prisma, suite, { userAliases: ["seller", "buyer"] });
    await seedSuiteCatalog(prisma, suite);
    for (const who of ["seller", "buyer"]) await prisma.user.create({ data: { id: suite.id(who), phone: suite.phone(who), phoneVerifiedAt: now } });
    await prisma.listing.create({ data: {
      id: car, sellerId: suite.id("seller"), status: "active",
      brandId: suite.catalog.brandId, modelId: suite.catalog.modelId, cityId: suite.catalog.cityId,
      priceAmount: 100, publishedAt: new Date("2026-10-01T00:00:00Z"), updatedAt: new Date("2026-10-02T00:00:00Z"),
    } });
  });
  const signal = (viewerKey: string, at = now, requestingUserId?: string) => views.record({ listingId: car, viewerKey, now: at, ...(requestingUserId ? { requestingUserId } : {}) });
  it("deduplicates concurrent same-install requests and atomically retains distinct installations", async () => {
    await Promise.all(Array.from({ length: 16 }, () => signal("install:one")));
    expect(await views.counts(car, now)).toEqual({ viewCount: 1, viewsToday: 1 });
    await Promise.all(Array.from({ length: 8 }, (_, n) => signal(`install:other-${n}`)));
    expect(await views.counts(car, now)).toEqual({ viewCount: 9, viewsToday: 9 });
    const rows = await prisma.listingViewFingerprint.findMany({ where: { listingId: car } });
    expect(rows).toHaveLength(9);
    expect(rows.every((row) => /^[a-f0-9]{64}$/.test(row.fingerprint))).toBe(true);
    expect(JSON.stringify(rows)).not.toContain("install:");
    expect(rows[0]?.expiresAt.toISOString()).toBe("2026-10-16T18:55:00.000Z");
  });
  it("leaves publication/update dates and owner ordering unchanged, including stale full-row edits", async () => {
    const repo = new PrismaListingRepository(prisma);
    const stale = await repo.findById(car);
    expect(stale).not.toBeNull();
    await signal("install:one");
    const afterView = await repo.findById(car);
    expect(afterView?.updatedAt.toISOString()).toBe("2026-10-02T00:00:00.000Z");
    expect(afterView?.publishedAt.toISOString()).toBe("2026-10-01T00:00:00.000Z");
    await new PrismaFavoriteRepository(prisma).add(suite.id("buyer"), car);
    await repo.update(stale!);
    expect((await repo.findById(car))?.viewCount).toBe(1);
    expect((await repo.findById(car))?.favoriteCount).toBe(1);
  });
  it("counts same install again only at the next Ashgabat day and changes its salted fingerprint", async () => {
    await signal("install:one", new Date("2026-10-14T18:59:59.999Z"));
    await signal("install:one");
    expect(await views.counts(car, now)).toEqual({ viewCount: 2, viewsToday: 1 });
    expect(await views.counts(car, new Date("2026-10-15T19:00:00Z"))).toEqual({ viewCount: 2, viewsToday: 0 });
    const rows = await prisma.listingViewFingerprint.findMany({ where: { listingId: car } });
    expect(new Set(rows.map((row) => row.fingerprint)).size).toBe(2);
  });
  it("rejects authenticated owner, missing, sold and deleted Listings without a fingerprint", async () => {
    expect(await signal("install:owner", now, suite.id("seller"))).toBe(false);
    expect(await views.record({ listingId: suite.id("missing"), viewerKey: "install:one", now })).toBe(false);
    await prisma.listing.update({ where: { id: car }, data: { status: "sold" } });
    expect(await signal("install:one")).toBe(false);
    await prisma.listing.update({ where: { id: car }, data: { status: "active", deletedAt: now } });
    expect(await signal("install:two")).toBe(false);
    expect(await prisma.listingViewFingerprint.count({ where: { listingId: car } })).toBe(0);
  });
  it("rolls back fingerprint and daily insert if lifetime increment fails", async () => {
    await prisma.listing.update({ where: { id: car }, data: { viewCount: 2147483647 } });
    await expect(signal("install:one")).rejects.toThrow();
    expect(await prisma.listingViewFingerprint.count({ where: { listingId: car } })).toBe(0);
    expect(await prisma.listingViewDay.count({ where: { listingId: car } })).toBe(0);
  });
  it("serializes close against view recording on the Listing row", async () => {
    let releaseClose!: () => void;
    let closed!: () => void;
    const closeHasLock = new Promise<void>((resolve) => { closed = resolve; });
    const closeMayCommit = new Promise<void>((resolve) => { releaseClose = resolve; });
    const close = prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "listings" WHERE "id" = ${car} FOR UPDATE`;
      await tx.listing.update({ where: { id: car }, data: { status: "archived" } });
      closed();
      await closeMayCommit;
    });
    await closeHasLock;
    const pendingView = signal("install:one");
    releaseClose();
    await close;
    expect(await pendingView).toBe(false);
    expect(await views.counts(car, now)).toEqual({ viewCount: 0, viewsToday: 0 });
  });
  it("does not collect while disabled even when an identifier arrives", async () => {
    const off = new PrismaListingViews(prisma, new ConfigService({ LISTING_VIEWS_ENABLED: false }));
    expect(await off.record({ listingId: car, viewerKey: "install:one", now })).toBe(false);
    expect(await views.counts(car, now)).toEqual({ viewCount: 0, viewsToday: 0 });
  });
});
