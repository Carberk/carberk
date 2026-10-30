import { randomUUID } from "node:crypto";

import { PrismaService } from "@auto-tm/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ExpireListingViewFingerprints } from "./ExpireListingViewFingerprints";
import { PrismaListingViewRetentionLedger } from "./PrismaListingViewRetentionLedger";

// Historical sweep sees only this suite's due rows, never another suite's current work.
// Hosted disposable loopback PostgreSQL only. NODE_ENV=test alone grants no deletion authority.
const databaseUrl = process.env["DATABASE_URL"] ?? "";
const hosted = process.env["GITHUB_ACTIONS"] === "true" && /^postgres(?:ql)?:\/\/[^/]+@(localhost|127\.0\.0\.1):\d+\//.test(databaseUrl);
const NOW = new Date("2000-01-02T18:55:00.000Z");

describe.skipIf(!hosted)("Listing fingerprint retention on actual PostgreSQL (#899)", () => {
  let prisma: PrismaService;
  const ids = { user: randomUUID(), brand: randomUUID(), model: randomUUID(), region: randomUUID(), city: randomUUID(), listing: randomUUID() };
  const slug = `retention-${randomUUID()}`;
  const names = { nameRu: "Retention", nameTk: "Retention", nameEn: "Retention" };
  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.brand.create({ data: { id: ids.brand, slug, ...names } });
    await prisma.model.create({ data: { id: ids.model, brandId: ids.brand, slug, ...names } });
    await prisma.region.create({ data: { id: ids.region, slug, ...names } });
    await prisma.city.create({ data: { id: ids.city, regionId: ids.region, slug, ...names } });
    await prisma.user.create({ data: { id: ids.user } });
    await prisma.listing.create({ data: { id: ids.listing, sellerId: ids.user, brandId: ids.brand, modelId: ids.model,
      cityId: ids.city, priceAmount: 10, viewCount: 17, updatedAt: new Date("1999-12-31T00:00:00.000Z") } });
    await prisma.listingViewDay.create({ data: { listingId: ids.listing, day: 10957, count: 17 } });
  });
  afterAll(async () => {
    if (!prisma) return;
    await prisma.listing.deleteMany({ where: { id: ids.listing } });
    await prisma.user.deleteMany({ where: { id: ids.user } });
    await prisma.city.deleteMany({ where: { id: ids.city } });
    await prisma.region.deleteMany({ where: { id: ids.region } });
    await prisma.model.deleteMany({ where: { id: ids.model } });
    await prisma.brand.deleteMany({ where: { id: ids.brand } });
    await prisma.onModuleDestroy();
  });

  it("deletes expired and exact-boundary rows in bounded batches, retains fresh/concurrent dedupe and never changes durable counts", async () => {
    const before = await prisma.listing.findUniqueOrThrow({ where: { id: ids.listing } });
    const fingerprint = (value: string) => value.padEnd(64, "0");
    await prisma.listingViewFingerprint.createMany({ data: [
      { listingId: ids.listing, day: 10956, fingerprint: fingerprint("a"), expiresAt: new Date("2000-01-02T18:54:59.999Z") },
      { listingId: ids.listing, day: 10956, fingerprint: fingerprint("b"), expiresAt: NOW },
      { listingId: ids.listing, day: 10957, fingerprint: fingerprint("c"), expiresAt: new Date("2000-01-03T18:55:00.000Z") },
    ] });
    const adapter = new PrismaListingViewRetentionLedger(prisma);
    const sweep = new ExpireListingViewFingerprints(adapter);
    const [result] = await Promise.all([
      sweep.execute(NOW, { batchSize: 1 }),
      prisma.listingViewFingerprint.create({ data: { listingId: ids.listing, day: 10957,
        fingerprint: fingerprint("d"), expiresAt: new Date("2000-01-03T18:55:00.000Z") } }),
    ]);
    expect(result.deleted).toBe(2);
    expect(result.health.oldestOverdueAt).toBeNull();
    expect((await sweep.execute(NOW)).deleted).toBe(0);
    const remaining = await prisma.listingViewFingerprint.findMany({ where: { listingId: ids.listing }, orderBy: { fingerprint: "asc" } });
    expect(remaining.map((row) => row.fingerprint.trim())).toEqual([fingerprint("c"), fingerprint("d")]);
    expect(await prisma.listing.findUniqueOrThrow({ where: { id: ids.listing } })).toEqual(before);
    expect(await prisma.listingViewDay.findUniqueOrThrow({ where: { listingId_day: { listingId: ids.listing, day: 10957 } } })).toMatchObject({ count: 17 });
    await expect(prisma.listingViewFingerprint.create({ data: { listingId: ids.listing, day: 10957,
      fingerprint: fingerprint("c"), expiresAt: new Date("2000-01-04T18:55:00.000Z") } })).rejects.toThrow();
    expect((await prisma.listingViewFingerprint.findUniqueOrThrow({ where: { listingId_day_fingerprint: {
      listingId: ids.listing, day: 10957, fingerprint: fingerprint("c") } } })).expiresAt).toEqual(new Date("2000-01-03T18:55:00.000Z"));
  });
});
