import { execSync } from "node:child_process";
import { resolve } from "node:path";

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import { PrismaService, recomputeListingPricesTmt } from "@auto-tm/db";

import { SortedFeedRankingAdapter } from "./SortedFeedRankingAdapter";
import { PrismaExchangeRateRepository } from "./PrismaExchangeRateRepository";
import { PrismaListingRepository } from "./PrismaListingRepository";
import type { Listing } from "../domain/Listing";
import {
  DomainError,
  FEED_SORTS,
  type Currency,
  type FeedCursor,
  type FeedSort,
  type ListingFilterCriteria,
} from "../domain/types";

describe("SortedFeedRankingAdapter — Testcontainers", () => {
  let container: StartedPostgreSqlContainer;
  let prisma: PrismaService;
  let adapter: SortedFeedRankingAdapter;

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine")
      .withUsername("auto_tm")
      .withPassword("auto_tm_pass")
      .withDatabase("auto_tm_test")
      .start();

    const dbUrl = container.getConnectionUri();
    const dbPackagePath = resolve(__dirname, "../../../../../../packages/db");

    execSync("pnpm prisma migrate deploy", {
      cwd: dbPackagePath,
      env: { ...process.env, DATABASE_URL: dbUrl },
      stdio: "pipe",
    });

    process.env["DATABASE_URL"] = dbUrl;
    prisma = new PrismaService();
    const exchangeRates = new PrismaExchangeRateRepository(prisma);
    adapter = new SortedFeedRankingAdapter(prisma, exchangeRates);
  }, 120_000);

  afterAll(async () => {
    await prisma.onModuleDestroy();
    await container.stop();
  });

  beforeEach(async () => {
    await prisma.listingMedia.deleteMany();
    await prisma.listing.deleteMany();
    await prisma.exchangeRate.deleteMany();
    await prisma.model.deleteMany();
    await prisma.brand.deleteMany();
    await prisma.city.deleteMany();
    await prisma.region.deleteMany();
    await prisma.user.deleteMany();
  });

  async function seedRegion(id: string): Promise<void> {
    await prisma.region.create({
      data: { id, slug: id, nameRu: id, nameTk: id, nameEn: id },
    });
  }

  async function seedCity(id: string, regionId: string): Promise<void> {
    await prisma.city.create({
      data: { id, regionId, slug: id, nameRu: id, nameTk: id, nameEn: id },
    });
  }

  async function seedBrand(id: string): Promise<void> {
    await prisma.brand.create({
      data: { id, slug: id, nameRu: id, nameTk: id, nameEn: id },
    });
  }

  async function seedModel(id: string, brandId: string): Promise<void> {
    await prisma.model.create({
      data: { id, brandId, slug: id, nameRu: id, nameTk: id, nameEn: id },
    });
  }

  async function seedUser(id: string): Promise<void> {
    await prisma.user.create({
      data: { id, phone: `+9936${id.slice(-8)}`, phoneVerifiedAt: new Date(), role: "buyer" },
    });
  }

  async function seedExchangeRate(
    from: Currency,
    to: Currency,
    rate: number,
  ): Promise<void> {
    await prisma.exchangeRate.create({
      data: { fromCurrency: from, toCurrency: to, rate, updatedAt: new Date() },
    });
  }

  async function seedListing(data: {
    id: string;
    sellerId: string;
    brandId: string;
    modelId: string;
    cityId: string;
    priceAmount: number;
    priceCurrency: Currency;
    year?: number;
    condition?: "new" | "used";
    mileageKm?: number;
    publishedAt: Date;
    status?: "active" | "sold" | "archived";
    soldAt?: Date;
    deletedAt?: Date;
  }): Promise<void> {
    await prisma.listing.create({
      data: {
        ...data,
        status: data.status ?? "active",
        allowCalls: true,
        allowChat: true,
        acceptsExchange: false,
        installmentAvailable: false,
      },
    });
  }

  async function seedBaseCatalog(): Promise<{
    regionId: string;
    cityA: string;
    cityB: string;
    brandX: string;
    brandY: string;
    modelX: string;
    modelY: string;
    seller: string;
  }> {
    const regionId = "region-1";
    const cityA = "city-a";
    const cityB = "city-b";
    const brandX = "brand-x";
    const brandY = "brand-y";
    const modelX = "model-x";
    const modelY = "model-y";
    const seller = "seller-1";

    await seedRegion(regionId);
    await seedCity(cityA, regionId);
    await seedCity(cityB, regionId);
    await seedBrand(brandX);
    await seedBrand(brandY);
    await seedModel(modelX, brandX);
    await seedModel(modelY, brandY);
    await seedUser(seller);

    return { regionId, cityA, cityB, brandX, brandY, modelX, modelY, seller };
  }

  it("returns all active listings when no filters applied", async () => {
    const { cityA, brandX, modelX, seller } = await seedBaseCatalog();

    const now = new Date();
    await seedListing({
      id: "l1",
      sellerId: seller,
      brandId: brandX,
      modelId: modelX,
      cityId: cityA,
      priceAmount: 100_000,
      priceCurrency: "TMT",
      publishedAt: now,
    });
    await seedListing({
      id: "l2",
      sellerId: seller,
      brandId: brandX,
      modelId: modelX,
      cityId: cityA,
      priceAmount: 200_000,
      priceCurrency: "TMT",
      publishedAt: new Date(now.getTime() - 1000),
    });

    const result = await adapter.rank({ sort: "newest", limit: 10 });
    expect(result.items).toHaveLength(2);
    expect(result.items.map((i) => i.id)).toEqual(["l1", "l2"]);
    expect(result.nextCursor).toBeUndefined();
  });

  it("leaves a relisted Listing at its original place in Newest, not at the top (#871)", async () => {
    const { cityA, brandX, modelX, seller } = await seedBaseCatalog();
    const now = new Date();
    const base = {
      sellerId: seller,
      brandId: brandX,
      modelId: modelX,
      cityId: cityA,
      priceAmount: 100_000,
      priceCurrency: "TMT" as const,
    };
    const firstPublishedAt = new Date(now.getTime() - 10 * 24 * 3_600_000);
    await seedListing({ ...base, id: "relisted", status: "archived", publishedAt: firstPublishedAt });
    await seedListing({ ...base, id: "newer", publishedAt: new Date(now.getTime() - 24 * 3_600_000) });
    await seedListing({ ...base, id: "older", publishedAt: new Date(now.getTime() - 20 * 24 * 3_600_000) });

    const repository = new PrismaListingRepository(prisma);
    const archived = await repository.findById("relisted");
    await repository.update(archived!.republish(now), { priceTmt: 100_000 });

    const stored = await prisma.listing.findUniqueOrThrow({ where: { id: "relisted" } });
    expect(stored.status).toBe("active");
    expect(stored.publishedAt).toEqual(firstPublishedAt);
    const result = await adapter.rank({ sort: "newest", limit: 10 });
    expect(result.items.map((i) => i.id)).toEqual(["newer", "relisted", "older"]);
  });

  it("keeps a mileageKm of 0 on ranked Listings", async () => {
    const { cityA, brandX, modelX, seller } = await seedBaseCatalog();
    await seedListing({
      id: "l1",
      sellerId: seller,
      brandId: brandX,
      modelId: modelX,
      cityId: cityA,
      priceAmount: 100_000,
      priceCurrency: "TMT",
      condition: "new",
      mileageKm: 0,
      publishedAt: new Date(),
    });

    const result = await adapter.rank({ sort: "newest", limit: 10 });
    expect(result.items[0]!.mileageKm).toBe(0);
  });

  it("filters by brandId", async () => {
    const { cityA, brandX, brandY, modelX, modelY, seller } = await seedBaseCatalog();

    const now = new Date();
    await seedListing({
      id: "l1",
      sellerId: seller,
      brandId: brandX,
      modelId: modelX,
      cityId: cityA,
      priceAmount: 100_000,
      priceCurrency: "TMT",
      publishedAt: now,
    });
    await seedListing({
      id: "l2",
      sellerId: seller,
      brandId: brandY,
      modelId: modelY,
      cityId: cityA,
      priceAmount: 200_000,
      priceCurrency: "TMT",
      publishedAt: new Date(now.getTime() - 1000),
    });

    const result = await adapter.rank({ sort: "newest", limit: 10, filters: { brandId: brandX } });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.id).toBe("l1");
  });

  it("filters by modelId", async () => {
    const { cityA, brandX, modelX, modelY, seller } = await seedBaseCatalog();

    const now = new Date();
    await seedListing({
      id: "l1",
      sellerId: seller,
      brandId: brandX,
      modelId: modelX,
      cityId: cityA,
      priceAmount: 100_000,
      priceCurrency: "TMT",
      publishedAt: now,
    });
    await seedListing({
      id: "l2",
      sellerId: seller,
      brandId: brandX,
      modelId: modelY,
      cityId: cityA,
      priceAmount: 200_000,
      priceCurrency: "TMT",
      publishedAt: new Date(now.getTime() - 1000),
    });

    const result = await adapter.rank({ sort: "newest", limit: 10, filters: { modelId: modelX } });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.id).toBe("l1");
  });

  it("filters by cityId", async () => {
    const { cityA, cityB, brandX, modelX, seller } = await seedBaseCatalog();

    const now = new Date();
    await seedListing({
      id: "l1",
      sellerId: seller,
      brandId: brandX,
      modelId: modelX,
      cityId: cityA,
      priceAmount: 100_000,
      priceCurrency: "TMT",
      publishedAt: now,
    });
    await seedListing({
      id: "l2",
      sellerId: seller,
      brandId: brandX,
      modelId: modelX,
      cityId: cityB,
      priceAmount: 200_000,
      priceCurrency: "TMT",
      publishedAt: new Date(now.getTime() - 1000),
    });

    const result = await adapter.rank({ sort: "newest", limit: 10, filters: { cityId: cityA } });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.id).toBe("l1");
  });

  it("filters by condition", async () => {
    const { cityA, brandX, modelX, seller } = await seedBaseCatalog();

    const now = new Date();
    await seedListing({
      id: "l1",
      sellerId: seller,
      brandId: brandX,
      modelId: modelX,
      cityId: cityA,
      priceAmount: 100_000,
      priceCurrency: "TMT",
      condition: "new",
      publishedAt: now,
    });
    await seedListing({
      id: "l2",
      sellerId: seller,
      brandId: brandX,
      modelId: modelX,
      cityId: cityA,
      priceAmount: 200_000,
      priceCurrency: "TMT",
      condition: "used",
      publishedAt: new Date(now.getTime() - 1000),
    });

    const result = await adapter.rank({ sort: "newest", limit: 10, filters: { condition: "new" } });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.id).toBe("l1");
  });

  it("filters by year range", async () => {
    const { cityA, brandX, modelX, seller } = await seedBaseCatalog();

    const now = new Date();
    await seedListing({
      id: "l1",
      sellerId: seller,
      brandId: brandX,
      modelId: modelX,
      cityId: cityA,
      priceAmount: 100_000,
      priceCurrency: "TMT",
      year: 2020,
      publishedAt: now,
    });
    await seedListing({
      id: "l2",
      sellerId: seller,
      brandId: brandX,
      modelId: modelX,
      cityId: cityA,
      priceAmount: 200_000,
      priceCurrency: "TMT",
      year: 2015,
      publishedAt: new Date(now.getTime() - 1000),
    });
    await seedListing({
      id: "l3",
      sellerId: seller,
      brandId: brandX,
      modelId: modelX,
      cityId: cityA,
      priceAmount: 300_000,
      priceCurrency: "TMT",
      year: 2023,
      publishedAt: new Date(now.getTime() - 2000),
    });

    const result = await adapter.rank({ sort: "newest",
      limit: 10,
      filters: { yearMin: 2019, yearMax: 2022 },
    });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.id).toBe("l1");
  });

  it("filters by price range across multiple currencies using FX conversion", async () => {
    const { cityA, brandX, modelX, seller } = await seedBaseCatalog();

    await seedExchangeRate("USD", "TMT", 3.5);
    await seedExchangeRate("AED", "TMT", 0.95);

    const now = new Date();
    // TMT listing: 100k TMT → display 100k TMT
    await seedListing({
      id: "l1",
      sellerId: seller,
      brandId: brandX,
      modelId: modelX,
      cityId: cityA,
      priceAmount: 100_000,
      priceCurrency: "TMT",
      publishedAt: now,
    });
    // USD listing: 30k USD → display 105k TMT (outside 50k-100k range)
    await seedListing({
      id: "l2",
      sellerId: seller,
      brandId: brandX,
      modelId: modelX,
      cityId: cityA,
      priceAmount: 30_000,
      priceCurrency: "USD",
      publishedAt: new Date(now.getTime() - 1000),
    });
    // AED listing: 100k AED → display 95k TMT (inside 50k-100k range)
    await seedListing({
      id: "l3",
      sellerId: seller,
      brandId: brandX,
      modelId: modelX,
      cityId: cityA,
      priceAmount: 100_000,
      priceCurrency: "AED",
      publishedAt: new Date(now.getTime() - 2000),
    });

    const result = await adapter.rank({ sort: "newest",
      limit: 10,
      filters: { priceMin: 50_000, priceMax: 100_000 },
    });
    expect(result.items).toHaveLength(2);
    expect(result.items.map((i) => i.id)).toEqual(["l1", "l3"]);
  });

  it("returns only active Listings: no sold, archived, or deleted ones", async () => {
    const { cityA, brandX, modelX, seller } = await seedBaseCatalog();

    const now = new Date();
    const twelveDaysAgo = new Date(now.getTime() - 12 * 24 * 60 * 60 * 1000);
    const twentyDaysAgo = new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000);

    await seedListing({
      id: "l1",
      sellerId: seller,
      brandId: brandX,
      modelId: modelX,
      cityId: cityA,
      priceAmount: 100_000,
      priceCurrency: "TMT",
      status: "sold",
      soldAt: twelveDaysAgo,
      publishedAt: twelveDaysAgo,
    });
    await seedListing({
      id: "l2",
      sellerId: seller,
      brandId: brandX,
      modelId: modelX,
      cityId: cityA,
      priceAmount: 200_000,
      priceCurrency: "TMT",
      status: "sold",
      soldAt: twentyDaysAgo,
      publishedAt: twentyDaysAgo,
    });

    await seedListing({
      id: "l3",
      sellerId: seller,
      brandId: brandX,
      modelId: modelX,
      cityId: cityA,
      priceAmount: 300_000,
      priceCurrency: "TMT",
      status: "archived",
      publishedAt: twelveDaysAgo,
    });
    await seedListing({
      id: "l4",
      sellerId: seller,
      brandId: brandX,
      modelId: modelX,
      cityId: cityA,
      priceAmount: 400_000,
      priceCurrency: "TMT",
      deletedAt: now,
      publishedAt: twelveDaysAgo,
    });
    await seedListing({
      id: "l5",
      sellerId: seller,
      brandId: brandX,
      modelId: modelX,
      cityId: cityA,
      priceAmount: 500_000,
      priceCurrency: "TMT",
      publishedAt: twentyDaysAgo,
    });

    const result = await adapter.rank({ sort: "newest", limit: 10 });
    expect(result.items.map((i) => i.id)).toEqual(["l5"]);
    expect((await adapter.count({})).totalMatching).toBe(1);
    expect(await adapter.brandCounts({})).toEqual([{ brandId: brandX, totalMatching: 1 }]);
  });

  it("paginates with cursor and remains stable across same-second creates with filters", async () => {
    const { cityA, brandX, brandY, modelX, modelY, seller } = await seedBaseCatalog();

    const sameSecond = new Date();
    // Create 5 listings in same second, alternating brands
    for (let i = 0; i < 5; i++) {
      await seedListing({
        id: `l${i + 1}`,
        sellerId: seller,
        brandId: i % 2 === 0 ? brandX : brandY,
        modelId: i % 2 === 0 ? modelX : modelY,
        cityId: cityA,
        priceAmount: 100_000,
        priceCurrency: "TMT",
        publishedAt: sameSecond,
      });
    }

    const all: Listing[] = [];
    let cursor: FeedCursor | undefined;

    do {
      const page = await adapter.rank({ sort: "newest",
        limit: 1,
        filters: { brandId: brandX },
        ...(cursor ? { cursor } : {}),
      });
      all.push(...page.items);
      cursor = page.nextCursor;
    } while (cursor);

    expect(all).toHaveLength(3); // newest tie-breaker first: l5, l3, l1
    expect(all.map((i) => i.id)).toEqual(["l5", "l3", "l1"]);
  });

  it("returns no results when filter matches nothing", async () => {
    const { cityA, brandX, modelX, seller } = await seedBaseCatalog();

    const now = new Date();
    await seedListing({
      id: "l1",
      sellerId: seller,
      brandId: brandX,
      modelId: modelX,
      cityId: cityA,
      priceAmount: 100_000,
      priceCurrency: "TMT",
      publishedAt: now,
    });

    const result = await adapter.rank({ sort: "newest",
      limit: 10,
      filters: { brandId: "non-existent-brand-id" },
    });
    expect(result.items).toHaveLength(0);
    expect(result.nextCursor).toBeUndefined();
  });

  it("combines multiple filters correctly", async () => {
    const { cityA, cityB, brandX, brandY, modelX, modelY, seller } =
      await seedBaseCatalog();

    const now = new Date();
    await seedListing({
      id: "l1",
      sellerId: seller,
      brandId: brandX,
      modelId: modelX,
      cityId: cityA,
      priceAmount: 100_000,
      priceCurrency: "TMT",
      year: 2020,
      condition: "new",
      publishedAt: now,
    });
    await seedListing({
      id: "l2",
      sellerId: seller,
      brandId: brandX,
      modelId: modelX,
      cityId: cityA,
      priceAmount: 200_000,
      priceCurrency: "TMT",
      year: 2020,
      condition: "used",
      publishedAt: new Date(now.getTime() - 1000),
    });
    await seedListing({
      id: "l3",
      sellerId: seller,
      brandId: brandY,
      modelId: modelY,
      cityId: cityB,
      priceAmount: 100_000,
      priceCurrency: "TMT",
      year: 2020,
      condition: "new",
      publishedAt: new Date(now.getTime() - 2000),
    });

    const result = await adapter.rank({ sort: "newest",
      limit: 10,
      filters: {
        brandId: brandX,
        cityId: cityA,
        yearMin: 2019,
        yearMax: 2021,
        condition: "new",
      },
    });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.id).toBe("l1");
  });

  it("filters by yearMin only", async () => {
    const { cityA, brandX, modelX, seller } = await seedBaseCatalog();

    const now = new Date();
    await seedListing({
      id: "l1",
      sellerId: seller,
      brandId: brandX,
      modelId: modelX,
      cityId: cityA,
      priceAmount: 100_000,
      priceCurrency: "TMT",
      year: 2020,
      publishedAt: now,
    });
    await seedListing({
      id: "l2",
      sellerId: seller,
      brandId: brandX,
      modelId: modelX,
      cityId: cityA,
      priceAmount: 200_000,
      priceCurrency: "TMT",
      year: 2015,
      publishedAt: new Date(now.getTime() - 1000),
    });

    const result = await adapter.rank({ sort: "newest",
      limit: 10,
      filters: { yearMin: 2019 },
    });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.id).toBe("l1");
  });

  it("filters by yearMax only", async () => {
    const { cityA, brandX, modelX, seller } = await seedBaseCatalog();

    const now = new Date();
    await seedListing({
      id: "l1",
      sellerId: seller,
      brandId: brandX,
      modelId: modelX,
      cityId: cityA,
      priceAmount: 100_000,
      priceCurrency: "TMT",
      year: 2020,
      publishedAt: now,
    });
    await seedListing({
      id: "l2",
      sellerId: seller,
      brandId: brandX,
      modelId: modelX,
      cityId: cityA,
      priceAmount: 200_000,
      priceCurrency: "TMT",
      year: 2015,
      publishedAt: new Date(now.getTime() - 1000),
    });

    const result = await adapter.rank({ sort: "newest",
      limit: 10,
      filters: { yearMax: 2018 },
    });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.id).toBe("l2");
  });

  it("filters by priceMin only", async () => {
    const { cityA, brandX, modelX, seller } = await seedBaseCatalog();

    const now = new Date();
    await seedListing({
      id: "l1",
      sellerId: seller,
      brandId: brandX,
      modelId: modelX,
      cityId: cityA,
      priceAmount: 100_000,
      priceCurrency: "TMT",
      publishedAt: now,
    });
    await seedListing({
      id: "l2",
      sellerId: seller,
      brandId: brandX,
      modelId: modelX,
      cityId: cityA,
      priceAmount: 40_000,
      priceCurrency: "TMT",
      publishedAt: new Date(now.getTime() - 1000),
    });

    const result = await adapter.rank({ sort: "newest",
      limit: 10,
      filters: { priceMin: 50_000 },
    });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.id).toBe("l1");
  });

  it("filters by priceMax only", async () => {
    const { cityA, brandX, modelX, seller } = await seedBaseCatalog();

    const now = new Date();
    await seedListing({
      id: "l1",
      sellerId: seller,
      brandId: brandX,
      modelId: modelX,
      cityId: cityA,
      priceAmount: 100_000,
      priceCurrency: "TMT",
      publishedAt: now,
    });
    await seedListing({
      id: "l2",
      sellerId: seller,
      brandId: brandX,
      modelId: modelX,
      cityId: cityA,
      priceAmount: 40_000,
      priceCurrency: "TMT",
      publishedAt: new Date(now.getTime() - 1000),
    });

    const result = await adapter.rank({ sort: "newest",
      limit: 10,
      filters: { priceMax: 50_000 },
    });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.id).toBe("l2");
  });

  it("excludes listings in currencies with missing FX rates when price filter is applied", async () => {
    const { cityA, brandX, modelX, seller } = await seedBaseCatalog();

    // Only seed TMT rate; USD rate is intentionally missing
    await seedExchangeRate("TMT", "TMT", 1);

    const now = new Date();
    await seedListing({
      id: "l1",
      sellerId: seller,
      brandId: brandX,
      modelId: modelX,
      cityId: cityA,
      priceAmount: 80_000,
      priceCurrency: "TMT",
      publishedAt: now,
    });
    await seedListing({
      id: "l2",
      sellerId: seller,
      brandId: brandX,
      modelId: modelX,
      cityId: cityA,
      priceAmount: 20_000,
      priceCurrency: "USD",
      publishedAt: new Date(now.getTime() - 1000),
    });

    const result = await adapter.rank({ sort: "newest",
      limit: 10,
      filters: { priceMin: 50_000, priceMax: 100_000 },
    });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.id).toBe("l1");
  });

  describe("sort orders", () => {
    // priceTmt at USD->TMT 19.5 with no AED rate:
    //   s01 195_000 · s02 100_000 · s03 null · s04 100_000 · s05 97_500 · s06 250_000 · s07 60_000
    // year:    s01 2018 · s02 2020 · s03 null · s04 2018 · s05 null · s06 2015 · s07 2022
    // mileage: s01 50k  · s02 null · s03 120k · s04 50k  · s05 null · s06 200k · s07 0
    const EXPECTED: Record<FeedSort, string[]> = {
      newest: ["s01", "s03", "s02", "s04", "s05", "s06", "s07"],
      price_asc: ["s07", "s05", "s02", "s04", "s01", "s06", "s03"],
      price_desc: ["s06", "s01", "s04", "s02", "s05", "s07", "s03"],
      year_desc: ["s07", "s02", "s04", "s01", "s06", "s05", "s03"],
      year_asc: ["s06", "s01", "s04", "s02", "s07", "s03", "s05"],
      mileage_asc: ["s07", "s01", "s04", "s03", "s06", "s02", "s05"],
    };

    async function seedSortCatalog() {
      const base = await seedBaseCatalog();
      const { cityA, brandX, brandY, modelX, modelY, seller } = base;
      await seedExchangeRate("USD", "TMT", 19.5);

      const now = Date.now();
      const at = (hoursAgo: number) => new Date(now - hoursAgo * 3_600_000);
      const x = { sellerId: seller, brandId: brandX, modelId: modelX, cityId: cityA };
      const y = { sellerId: seller, brandId: brandY, modelId: modelY, cityId: cityA };

      await seedListing({ ...x, id: "s01", priceAmount: 10_000, priceCurrency: "USD", year: 2018, mileageKm: 50_000, publishedAt: at(1) });
      await seedListing({ ...x, id: "s02", priceAmount: 100_000, priceCurrency: "TMT", year: 2020, condition: "new", publishedAt: at(2) });
      await seedListing({ ...x, id: "s03", priceAmount: 30_000, priceCurrency: "AED", mileageKm: 120_000, publishedAt: at(2) });
      await seedListing({ ...x, id: "s04", priceAmount: 100_000, priceCurrency: "TMT", year: 2018, mileageKm: 50_000, publishedAt: at(4) });
      await seedListing({ ...x, id: "s05", priceAmount: 5_000, priceCurrency: "USD", condition: "new", publishedAt: at(5) });
      await seedListing({ ...y, id: "s06", priceAmount: 250_000, priceCurrency: "TMT", year: 2015, mileageKm: 200_000, publishedAt: at(6) });
      await seedListing({ ...y, id: "s07", priceAmount: 60_000, priceCurrency: "TMT", year: 2022, mileageKm: 0, publishedAt: at(7) });
      // Never in the feed, whatever the order.
      await seedListing({ ...x, id: "s08", priceAmount: 1_000, priceCurrency: "TMT", year: 2024, mileageKm: 1, status: "sold", soldAt: at(1), publishedAt: at(1) });
      await seedListing({ ...y, id: "s09", priceAmount: 2_000, priceCurrency: "TMT", year: 2024, mileageKm: 1, deletedAt: at(1), publishedAt: at(1) });

      await recomputeListingPricesTmt(prisma);
      return base;
    }

    async function pageThrough(
      sort: FeedSort,
      limit: number,
      filters?: ListingFilterCriteria,
    ): Promise<string[]> {
      const ids: string[] = [];
      let cursor: FeedCursor | undefined;
      let pages = 0;
      do {
        const page = await adapter.rank({
          sort,
          limit,
          ...(filters ? { filters } : {}),
          ...(cursor ? { cursor } : {}),
        });
        ids.push(...page.items.map((i) => i.id));
        cursor = page.nextCursor;
        pages += 1;
        expect(pages).toBeLessThanOrEqual(20);
      } while (cursor);
      return ids;
    }

    it("returns every active Listing exactly once, in order, at any page size", async () => {
      await seedSortCatalog();

      for (const sort of FEED_SORTS) {
        for (const limit of [1, 2, 3, 7, 50]) {
          const ids = await pageThrough(sort, limit);
          expect({ sort, limit, ids }).toEqual({ sort, limit, ids: EXPECTED[sort] });
          expect(new Set(ids).size).toBe(ids.length);
        }
      }
    });

    it("orders by the price in TMT across currencies", async () => {
      await seedSortCatalog();

      const page = await adapter.rank({ sort: "price_desc", limit: 50 });
      const ids = page.items.map((i) => i.id);
      // 10,000 USD at 19.5 is 195,000 TMT, above the 100,000 TMT Listings.
      expect(ids.indexOf("s01")).toBeLessThan(ids.indexOf("s02"));
      expect(ids.indexOf("s01")).toBeLessThan(ids.indexOf("s04"));
    });

    it("keeps the order and exact-once paging with filters applied", async () => {
      const { brandX } = await seedSortCatalog();

      expect(await pageThrough("price_asc", 2, { brandId: brandX })).toEqual([
        "s05", "s02", "s04", "s01", "s03",
      ]);
      expect(await pageThrough("mileage_asc", 1, { condition: "new" })).toEqual(["s02", "s05"]);
    });

    it("ends with no cursor when the last page is exactly full", async () => {
      await seedSortCatalog();

      const page = await adapter.rank({ sort: "year_asc", limit: 7 });
      expect(page.items).toHaveLength(7);
      expect(page.nextCursor).toBeUndefined();
    });

    it("issues a null-valued cursor once paging reaches Listings without the key", async () => {
      await seedSortCatalog();

      const first = await adapter.rank({ sort: "year_desc", limit: 6 });
      expect(first.nextCursor).toEqual({ sort: "year_desc", value: null, id: "s05" });
      const rest = await adapter.rank({
        sort: "year_desc",
        limit: 6,
        cursor: first.nextCursor as FeedCursor,
      });
      expect(rest.items.map((i) => i.id)).toEqual(["s03"]);
    });

    it("rejects a cursor from another order", async () => {
      await seedSortCatalog();

      await expect(
        adapter.rank({
          sort: "price_asc",
          limit: 2,
          cursor: { sort: "price_desc", value: 100_000, id: "s02" },
        }),
      ).rejects.toThrow(DomainError);
    });

    it("counts matches with the TMT price range, null when nothing matches", async () => {
      const { brandY } = await seedSortCatalog();

      expect(await adapter.count({})).toEqual({
        totalMatching: 7,
        priceMinTmt: 60_000,
        priceMaxTmt: 250_000,
      });
      expect(await adapter.count({ filters: { brandId: brandY } })).toEqual({
        totalMatching: 2,
        priceMinTmt: 60_000,
        priceMaxTmt: 250_000,
      });
      expect(await adapter.count({ filters: { yearMin: 2030 } })).toEqual({
        totalMatching: 0,
        priceMinTmt: null,
        priceMaxTmt: null,
      });
    });

    it("counts active Listings per brand, most first, ignoring brand and model filters", async () => {
      const { brandX, brandY, modelY } = await seedSortCatalog();

      expect(await adapter.brandCounts({})).toEqual([
        { brandId: brandX, totalMatching: 5 },
        { brandId: brandY, totalMatching: 2 },
      ]);
      expect(
        await adapter.brandCounts({ filters: { brandId: brandY, modelId: modelY } }),
      ).toEqual([
        { brandId: brandX, totalMatching: 5 },
        { brandId: brandY, totalMatching: 2 },
      ]);
      // Ties break by brandId.
      expect(await adapter.brandCounts({ filters: { yearMin: 2019 } })).toEqual([
        { brandId: brandX, totalMatching: 1 },
        { brandId: brandY, totalMatching: 1 },
      ]);
    });
  });

  describe("priceTmt recompute", () => {
    it("derives priceTmt from the stored rates and rewrites only changed rows", async () => {
      const { cityA, brandX, modelX, seller } = await seedBaseCatalog();
      const repository = new PrismaListingRepository(prisma);
      const x = { sellerId: seller, brandId: brandX, modelId: modelX, cityId: cityA, publishedAt: new Date() };
      await seedListing({ ...x, id: "r1", priceAmount: 100_000, priceCurrency: "TMT" });
      await seedListing({ ...x, id: "r2", priceAmount: 10_000, priceCurrency: "USD" });
      await seedListing({ ...x, id: "r3", priceAmount: 30_000, priceCurrency: "AED" });
      await seedExchangeRate("USD", "TMT", 19.5);
      const before = await prisma.listing.findUniqueOrThrow({ where: { id: "r1" } });

      const priceTmt = async () =>
        Object.fromEntries(
          (await prisma.listing.findMany({ orderBy: { id: "asc" } })).map((r) => [r.id, r.priceTmt]),
        );

      expect(await repository.recomputePriceTmt()).toBe(2);
      expect(await priceTmt()).toEqual({ r1: 100_000, r2: 195_000, r3: null });

      await seedExchangeRate("AED", "TMT", 5.3);
      expect(await repository.recomputePriceTmt()).toBe(1);
      expect((await priceTmt())["r3"]).toBe(30_000 * 5.3);

      await prisma.exchangeRate.update({
        where: { fromCurrency_toCurrency: { fromCurrency: "USD", toCurrency: "TMT" } },
        data: { rate: 20 },
      });
      expect(await repository.recomputePriceTmt()).toBe(1);
      expect((await priceTmt())["r2"]).toBe(200_000);

      expect(await repository.recomputePriceTmt()).toBe(0);
      const after = await prisma.listing.findUniqueOrThrow({ where: { id: "r1" } });
      expect(after.updatedAt).toEqual(before.updatedAt);
    });
  });
});
