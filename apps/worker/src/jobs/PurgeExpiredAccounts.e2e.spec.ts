import { createHash, randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaService } from "@auto-tm/db";

import { PurgeExpiredAccounts } from "./PurgeExpiredAccounts";

/**
 * Runs only against the CI disposable Postgres, which the workflow migrates
 * before `pnpm test`. The purge's every-run delete drops ALL code requests
 * older than 30 days in whatever database DATABASE_URL names, and vitest sets
 * NODE_ENV=test on its own, so an environment variable the runner controls
 * (CI=true, which GitHub Actions always sets) gates the suite instead: a dev
 * database pointed at by hand is never touched.
 */
const runWithDatabase = process.env["CI"] === "true" && Boolean(process.env["DATABASE_URL"]);
const describeWithDatabase = runWithDatabase ? describe : describe.skip;

const DAY_MS = 24 * 60 * 60 * 1000;

function suitePhone(alias: string): string {
  const hex = createHash("sha256").update(`purge-e2e:${alias}`).digest("hex");
  let digits = "";
  for (let i = 0; digits.length < 7 && i + 2 <= hex.length; i += 2) {
    digits += String(parseInt(hex.slice(i, i + 2), 16) % 100).padStart(2, "0");
  }
  return `+9936${digits.slice(0, 7)}`;
}

describeWithDatabase("PurgeExpiredAccounts — Postgres", () => {
  const now = new Date();
  const expiredUserId = randomUUID();
  const otherUserId = randomUUID();
  const stockUserId = randomUUID();
  const businessId = randomUUID();
  const brandId = randomUUID();
  const modelId = randomUUID();
  const regionId = randomUUID();
  const cityId = randomUUID();
  const expiredPhone = suitePhone("expired");
  const otherPhone = suitePhone("other");
  const strangerPhone = suitePhone("stranger");

  let prisma: PrismaService;

  beforeAll(async () => {
    prisma = new PrismaService();
  });

  afterAll(async () => {
    await prisma.otpRequest.deleteMany({
      where: {
        OR: [
          { userId: { in: [expiredUserId, otherUserId] } },
          { destination: { in: [expiredPhone, otherPhone, strangerPhone] } },
        ],
      },
    });
    await prisma.listingMedia.deleteMany({ where: { listing: { sellerId: stockUserId } } });
    await prisma.mediaUpload.deleteMany({ where: { userId: stockUserId } });
    await prisma.listing.deleteMany({ where: { sellerId: stockUserId } });
    await prisma.listingDraft.deleteMany({ where: { userId: stockUserId } });
    await prisma.dealership.deleteMany({ where: { id: businessId } });
    await prisma.city.deleteMany({ where: { id: cityId } });
    await prisma.region.deleteMany({ where: { id: regionId } });
    await prisma.model.deleteMany({ where: { id: modelId } });
    await prisma.brand.deleteMany({ where: { id: brandId } });
    await prisma.user.deleteMany({ where: { id: { in: [expiredUserId, otherUserId, stockUserId] } } });
    await prisma.onModuleDestroy();
  });

  it("deletes code requests past retention and the purged User's own, and keeps the rest", async () => {
    await prisma.user.create({
      data: {
        id: expiredUserId,
        phone: expiredPhone,
        phoneVerifiedAt: now,
        deletionScheduledAt: new Date(now.getTime() - 1_000),
      },
    });
    await prisma.user.create({
      data: { id: otherUserId, phone: otherPhone, phoneVerifiedAt: now },
    });

    const old = new Date(now.getTime() - 31 * DAY_MS);
    const seed = (data: {
      destination: string;
      userId?: string;
      createdAt: Date;
    }) =>
      prisma.otpRequest.create({
        data: {
          purpose: "sign_in",
          channel: "phone",
          codeHash: "e2e-code-hash",
          expiresAt: new Date(now.getTime() + DAY_MS),
          ip: "10.0.0.1",
          ...data,
          userId: data.userId ?? null,
        },
      });

    // Past retention: gone on every run, whoever they belong to.
    const oldStranger = await seed({ destination: strangerPhone, createdAt: old });
    const oldExpiredPhone = await seed({ destination: expiredPhone, createdAt: old });
    // Recent, but the purged User's: by User id, or by the purged phone from
    // a signed-out request.
    const recentOwn = await seed({ destination: strangerPhone, userId: expiredUserId, createdAt: now });
    const recentSignedOut = await seed({ destination: expiredPhone, createdAt: now });
    // Recent and not the purged User's: stay until they are 30 days old.
    const recentStranger = await seed({ destination: strangerPhone, createdAt: now });
    const recentOtherUser = await seed({ destination: otherPhone, userId: otherUserId, createdAt: now });

    const result = await new PurgeExpiredAccounts(prisma).execute({ now });

    // The CI database is shared with other suites, which may leave their own
    // due Users behind: this suite answers only for the rows it created.
    expect(result.purgedCount).toBeGreaterThanOrEqual(1);
    const remaining = await prisma.otpRequest.findMany({
      where: {
        id: {
          in: [
            oldStranger.id,
            oldExpiredPhone.id,
            recentOwn.id,
            recentSignedOut.id,
            recentStranger.id,
            recentOtherUser.id,
          ],
        },
      },
      select: { id: true },
    });
    expect(remaining.map((row) => row.id).sort()).toEqual(
      [recentStranger.id, recentOtherUser.id].sort(),
    );

    const purged = await prisma.user.findUnique({
      where: { id: expiredUserId },
      select: { phone: true, deletionScheduledAt: true },
    });
    expect(purged).toEqual({ phone: null, deletionScheduledAt: null });
  });

  it("retains business stock, adopted media and contact after the creator is purged", async () => {
    const label = { nameRu: "Synthetic", nameTk: "Synthetic", nameEn: "Synthetic" };
    await prisma.user.create({ data: { id: stockUserId, phone: suitePhone("stock"), phoneVerifiedAt: now, deletionScheduledAt: new Date(now.getTime() - 1000) } });
    await prisma.brand.create({ data: { id: brandId, slug: `purge-${brandId}`, ...label } });
    await prisma.model.create({ data: { id: modelId, brandId, slug: "synthetic", ...label } });
    await prisma.region.create({ data: { id: regionId, slug: `purge-${regionId}`, ...label } });
    await prisma.city.create({ data: { id: cityId, regionId, slug: "synthetic", ...label } });
    const contactPhone = suitePhone("business-contact");
    await prisma.dealership.create({ data: { id: businessId, name: "Synthetic stock", slug: `purge-${businessId}`, contactPhone, contactConfirmedAt: now } });
    await prisma.dealershipMember.create({ data: { dealershipId: businessId, userId: stockUserId, role: "sales" } });
    const listingData = { sellerId: stockUserId, brandId, modelId, cityId, priceAmount: 100, contactPhone };
    const stock = await prisma.listing.create({ data: { ...listingData, businessId, status: "active", publishedAt: now } });
    const personal = await prisma.listing.create({ data: { ...listingData, status: "archived", archivedByDeletion: true } });
    const sharedDraft = await prisma.listingDraft.create({ data: { userId: stockUserId, businessId, payload: { contactPhone } } });
    const personalDraft = await prisma.listingDraft.create({ data: { userId: stockUserId, payload: {} } });
    const upload = await prisma.mediaUpload.create({ data: { userId: stockUserId, businessId, key: `pending/purge-${stock.id}/original.webp`, kind: "image", contentType: "image/webp", state: "ADOPTED", claimTargetType: "listing", claimTargetId: stock.id } });
    const media = await prisma.listingMedia.create({ data: { listingId: stock.id, uploadId: upload.id, key: upload.key, kind: "image", sortOrder: 0 } });

    await new PurgeExpiredAccounts(prisma).execute({ now });

    expect(await prisma.user.findUniqueOrThrow({ where: { id: stockUserId }, select: { phone: true } })).toEqual({ phone: null });
    expect(await prisma.listing.findUniqueOrThrow({ where: { id: stock.id }, select: { status: true, contactPhone: true, publishedAt: true, businessId: true } })).toEqual({ status: "active", contactPhone, publishedAt: now, businessId });
    expect(await prisma.listingMedia.findUnique({ where: { id: media.id } })).not.toBeNull();
    expect((await prisma.mediaUpload.findUniqueOrThrow({ where: { id: upload.id } })).state).toBe("ADOPTED");
    expect(await prisma.listingDraft.findUnique({ where: { id: sharedDraft.id } })).not.toBeNull();
    expect(await prisma.listingDraft.findUnique({ where: { id: personalDraft.id } })).toBeNull();
    expect((await prisma.listing.findUniqueOrThrow({ where: { id: personal.id } })).contactPhone).toBeNull();
    expect((await prisma.dealership.findUniqueOrThrow({ where: { id: businessId } })).contactPhone).toBe(contactPhone);
  });

});
