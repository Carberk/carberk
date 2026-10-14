import { describe, it, expect, beforeEach } from "vitest";
import { ListFeed } from "./ListFeed";
import { Listing } from "../domain/Listing";
import type { CardPhotos } from "../domain/CardPhotos";
import type { FavoriteRepository } from "../domain/ports/FavoriteRepository";
import type { FeedRankingPort } from "../domain/ports/FeedRankingPort";
import type { ListingCard, ListingCardReadPort } from "../domain/ports/ListingCardReadPort";
import type { ExchangeRatePort } from "../domain/ports/ExchangeRatePort";
import type { MediaStoragePort } from "../domain/ports/MediaStoragePort";
import { BadRequestException } from "@nestjs/common";
import { ListingsSchemas } from "@auto-tm/contracts";
import type { FeedCursor, FeedSort, ListingFilterCriteria } from "../domain/types";
import type { SellerProfile } from "../domain/ports/SellerProfilePort";
import { InMemorySellerProfiles } from "./testing/InMemorySellerProfiles";

class FakeFeedRankingPort implements FeedRankingPort {
  items: Listing[] = [];
  nextCursor?: FeedCursor;
  lastViewerId: string | undefined;
  lastSort: FeedSort | undefined;
  lastCursor: FeedCursor | undefined;

  async rank(query: {
    viewerId?: string;
    filters?: ListingFilterCriteria;
    sort: FeedSort;
    cursor?: FeedCursor;
    limit: number;
  }): Promise<{ items: Listing[]; nextCursor?: FeedCursor }> {
    this.lastViewerId = query.viewerId;
    this.lastSort = query.sort;
    this.lastCursor = query.cursor;
    const result: { items: Listing[]; nextCursor?: FeedCursor } = {
      items: this.items,
    };
    if (this.nextCursor !== undefined) {
      result.nextCursor = this.nextCursor;
    }
    return result;
  }

  async count() {
    return { totalMatching: this.items.length, priceMinTmt: null, priceMaxTmt: null };
  }

  async modelCounts(): Promise<Array<{ modelId: string; totalMatching: number }>> {
    return [];
  }

  async brandCounts(): Promise<Array<{ brandId: string; totalMatching: number }>> {
    return [];
  }
}

class FakeExchangeRatePort implements ExchangeRatePort {
  rates: Record<string, number> = {};

  async getRate(from: string, to: string): Promise<number> {
    if (from === to) return 1;
    return this.rates[`${from}->${to}`] ?? 0;
  }

  async listAll() {
    return Object.entries(this.rates).map(([key, rate]) => {
      const [fromCurrency, toCurrency] = key.split("->") as ["TMT" | "USD" | "AED", "TMT" | "USD" | "AED"];
      return { fromCurrency, toCurrency, rate, updatedAt: new Date() };
    });
  }
}

class FakeMediaStoragePort implements MediaStoragePort {
  resolvePublicUrl(key: string): string {
    return `https://media.auto.tm/${key}`;
  }

  async presignUpload(): Promise<{ url: string; key: string }> {
    return { url: "", key: "" };
  }

  async deleteObject(): Promise<void> {}
}

class FakeFavoriteRepository implements FavoriteRepository {
  favorites = new Set<string>();
  lookups = 0;

  async add(): Promise<never> {
    throw new Error("not used");
  }

  async remove(): Promise<boolean> {
    return false;
  }

  async exists(userId: string, listingId: string): Promise<boolean> {
    return this.favorites.has(`${userId}:${listingId}`);
  }

  async favoritedListingIds(userId: string, listingIds: string[]): Promise<Set<string>> {
    this.lookups += 1;
    return new Set(listingIds.filter((id) => this.favorites.has(`${userId}:${id}`)));
  }

  async listVisibleByUserId() {
    return { items: [] };
  }

  async countVisibleByUserId() {
    return { total: 0, inactive: 0 };
  }
}

class FakeListingCardReadPort implements ListingCardReadPort {
  photos = new Map<string, CardPhotos>();
  photoLookups = 0;

  async getCardPhotos(listingIds: string[]): Promise<Map<string, CardPhotos>> {
    this.photoLookups += 1;
    return new Map([...this.photos].filter(([id]) => listingIds.includes(id)));
  }

  async getVisibleCards(): Promise<ListingCard[]> {
    return [];
  }

  async getOwnerCards(): Promise<{ items: ListingCard[] }> {
    return { items: [] };
  }
}

function makeUseCase(
  ranking?: FakeFeedRankingPort,
  exchangeRates?: FakeExchangeRatePort,
  storage?: FakeMediaStoragePort,
  favorites?: FakeFavoriteRepository,
  cards?: FakeListingCardReadPort,
  sellers?: InMemorySellerProfiles,
) {
  return new ListFeed(
    ranking ?? new FakeFeedRankingPort(),
    exchangeRates ?? new FakeExchangeRatePort(),
    storage ?? new FakeMediaStoragePort(),
    favorites ?? new FakeFavoriteRepository(),
    cards ?? new FakeListingCardReadPort(),
    sellers ?? new InMemorySellerProfiles(),
  );
}

function sellerProfile(overrides: Partial<SellerProfile> = {}): SellerProfile {
  return {
    displayName: null,
    nameNumber: 2057,
    avatarIndex: 7,
    avatarKey: "avatars/seller/a.webp",
    deleted: false,
    memberSince: new Date("2025-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

describe("ListFeed", () => {
  let ranking: FakeFeedRankingPort;
  let exchangeRates: FakeExchangeRatePort;

  beforeEach(() => {
    ranking = new FakeFeedRankingPort();
    exchangeRates = new FakeExchangeRatePort();
  });

  function seedListing(overrides?: Partial<Parameters<typeof Listing.create>[0]>) {
    return Listing.create({
      id: "listing-1",
      publicNumber: 1,
      sellerId: "user-1",
      status: "active",
      brandId: "brand-1",
      modelId: "model-1",
      cityId: "city-1",
      priceAmount: 100000,
      priceCurrency: "TMT",
      allowCalls: true,
      allowChat: true,
      publishedAt: new Date("2026-05-01T00:00:00Z"),
      ...overrides,
    });
  }

  it("returns empty feed when no listings", async () => {
    const uc = makeUseCase(ranking, exchangeRates);
    const result = await uc.execute({});

    expect(result.items).toHaveLength(0);
    expect(result.nextCursor).toBeNull();
  });

  it("returns listings mapped to summary DTOs", async () => {
    ranking.items = [seedListing({ id: "l1" }), seedListing({ id: "l2" })];

    const uc = makeUseCase(ranking, exchangeRates);
    const result = await uc.execute({});

    expect(result.items).toHaveLength(2);
    expect(result.items[0]!.id).toBe("l1");
    expect(result.items[0]!.displayPriceTmt).toBe(100000);
  });

  it("includes coverMediaKey when listing has media", async () => {
    ranking.items = [seedListing({ id: "l1", coverMediaKey: "listings/l1/m1/original.webp" })];

    const uc = makeUseCase(ranking, exchangeRates);
    const result = await uc.execute({});

    expect(result.items[0]!.coverMediaKey).toBe("listings/l1/m1/original.webp");
  });

  it("omits coverMediaKey when listing has no media", async () => {
    ranking.items = [seedListing({ id: "l1" })];

    const uc = makeUseCase(ranking, exchangeRates);
    const result = await uc.execute({});

    expect(result.items[0]!.coverMediaKey).toBeUndefined();
  });

  it("computes displayPriceTmt for USD listings", async () => {
    ranking.items = [seedListing({ id: "l1", priceAmount: 1000, priceCurrency: "USD" })];
    exchangeRates.rates["USD->TMT"] = 3.5;

    const uc = makeUseCase(ranking, exchangeRates);
    const result = await uc.execute({});

    expect(result.items[0]!.displayPriceTmt).toBe(3500);
  });

  it("encodes nextCursor from ranking result", async () => {
    ranking.items = [seedListing({ id: "l1" })];
    ranking.nextCursor = {
      sort: "price_asc",
      value: 35000,
      id: "00000000-0000-0000-0000-000000000001",
    };

    const uc = makeUseCase(ranking, exchangeRates);
    const result = await uc.execute({ sort: "price_asc" });

    expect(ListingsSchemas.decodeFeedCursor(result.nextCursor as string)).toEqual(
      ranking.nextCursor,
    );
  });

  it("defaults to the newest order", async () => {
    await makeUseCase(ranking, exchangeRates).execute({});
    expect(ranking.lastSort).toBe("newest");
  });

  it("passes the requested order to the ranking port", async () => {
    await makeUseCase(ranking, exchangeRates).execute({ sort: "mileage_asc" });
    expect(ranking.lastSort).toBe("mileage_asc");
  });

  it("decodes a cursor for the requested order and passes it on", async () => {
    const cursor = {
      sort: "year_desc",
      value: null,
      id: "00000000-0000-0000-0000-000000000001",
    } as const;

    await makeUseCase(ranking, exchangeRates).execute({
      sort: "year_desc",
      cursor: ListingsSchemas.encodeFeedCursor(cursor),
    });

    expect(ranking.lastCursor).toEqual(cursor);
  });

  it("rejects a cursor from another order with a 400", async () => {
    const cursor = ListingsSchemas.encodeFeedCursor({
      sort: "price_asc",
      value: 1000,
      id: "00000000-0000-0000-0000-000000000001",
    });

    const uc = makeUseCase(ranking, exchangeRates);
    await expect(uc.execute({ sort: "price_desc", cursor })).rejects.toThrow(
      BadRequestException,
    );
    await expect(uc.execute({ cursor })).rejects.toThrow(BadRequestException);
    expect(ranking.lastSort).toBeUndefined();
  });

  it("rejects a malformed cursor with a 400", async () => {
    const legacy = Buffer.from(
      JSON.stringify({ timestamp: "2026-05-01T00:00:00Z", id: "00000000-0000-0000-0000-000000000001" }),
      "utf8",
    ).toString("base64url");

    const uc = makeUseCase(ranking, exchangeRates);
    await expect(uc.execute({ cursor: "not-a-cursor" })).rejects.toThrow(BadRequestException);
    await expect(uc.execute({ cursor: legacy })).rejects.toThrow(BadRequestException);
  });

  it("does not return a per-Listing seller trust signal on summaries", async () => {
    ranking.items = [seedListing({ id: "l1" })];

    const uc = makeUseCase(ranking, exchangeRates);
    const result = await uc.execute({});

    expect(result.items[0]!).not.toHaveProperty("sellerTrust");
  });

  it("throws on missing exchange rate for non-TMT currency", async () => {
    ranking.items = [seedListing({ id: "l1", priceAmount: 1000, priceCurrency: "USD" })];

    const uc = makeUseCase(ranking, exchangeRates);
    await expect(uc.execute({})).rejects.toThrow("Missing exchange rate");
  });

  it("forwards filters to ranking port", async () => {
    let receivedFilters: ListingFilterCriteria | undefined;

    const spyRanking: FeedRankingPort = {
      async rank(query) {
        receivedFilters = query.filters;
        return { items: [] };
      },
      async count() {
        return { totalMatching: 0, priceMinTmt: null, priceMaxTmt: null };
      },
      async modelCounts() {
        return [];
      },
      async brandCounts() {
        return [];
      },
    };

    const uc = new ListFeed(
      spyRanking,
      exchangeRates,
      new FakeMediaStoragePort(),
      new FakeFavoriteRepository(),
      new FakeListingCardReadPort(),
      new InMemorySellerProfiles(),
    );
    await uc.execute({ filters: { brandId: "brand-x", priceMin: 50000 } });

    expect(receivedFilters).toEqual({ brandId: "brand-x", priceMin: 50000 });
  });

  it("returns the photo and gallery keys and photoCount from one batched photo read, none for a Listing without photos", async () => {
    ranking.items = [seedListing({ id: "l1" }), seedListing({ id: "l2" })];
    const cards = new FakeListingCardReadPort();
    cards.photos.set("l1", {
      coverMediaKey: "a",
      photoKeys: ["a", "b"],
      galleryKeys: ["a", "b", "c", "d", "e"],
      photoCount: 5,
    });

    const uc = makeUseCase(ranking, exchangeRates, undefined, undefined, cards);
    const result = await uc.execute({});

    expect(cards.photoLookups).toBe(1);
    expect(result.items[0]).toMatchObject({
      photoKeys: ["a", "b"],
      galleryKeys: ["a", "b", "c", "d", "e"],
      photoCount: 5,
    });
    expect(result.items[1]).toMatchObject({ photoKeys: [], galleryKeys: [], photoCount: 0 });
  });

  it("sends each card photo's ThumbHash beside its key and none for a Listing without hashes", async () => {
    ranking.items = [seedListing({ id: "l1" }), seedListing({ id: "l2" })];
    const cards = new FakeListingCardReadPort();
    cards.photos.set("l1", {
      coverMediaKey: "a",
      photoKeys: ["a", "b"],
      photoThumbHashes: ["1fsDBYCIiIiHiIdweIeHh4d4cIgH", null],
      galleryKeys: ["a", "b", "c"],
      galleryThumbHashes: ["1fsDBYCIiIiHiIdweIeHh4d4cIgH", null, "2yMBBYCIh4iHiHeAiId4dXh3f4f4"],
      photoCount: 3,
    });
    cards.photos.set("l2", { coverMediaKey: "x", photoKeys: ["x"], galleryKeys: ["x"], photoCount: 1 });

    const result = await makeUseCase(ranking, exchangeRates, undefined, undefined, cards).execute({});

    expect(result.items[0]).toMatchObject({
      photoThumbHashes: ["1fsDBYCIiIiHiIdweIeHh4d4cIgH", null],
      galleryThumbHashes: ["1fsDBYCIiIiHiIdweIeHh4d4cIgH", null, "2yMBBYCIh4iHiHeAiId4dXh3f4f4"],
    });
    expect(JSON.parse(JSON.stringify(result.items[1]))).not.toHaveProperty("photoThumbHashes");
    expect(JSON.parse(JSON.stringify(result.items[1]))).not.toHaveProperty("galleryThumbHashes");
  });

  it("returns mileageKm, condition, transmissionId, and engineTypeId when set", async () => {
    ranking.items = [
      seedListing({
        id: "l1",
        mileageKm: 0,
        condition: "new",
        transmissionId: "transmission-1",
        engineTypeId: "engine-1",
      }),
    ];

    const uc = makeUseCase(ranking, exchangeRates);
    const [item] = (await uc.execute({})).items;

    expect(item).toMatchObject({
      mileageKm: 0,
      condition: "new",
      transmissionId: "transmission-1",
      engineTypeId: "engine-1",
    });
  });

  it("omits mileageKm, condition, transmissionId, and engineTypeId when not set", async () => {
    ranking.items = [seedListing({ id: "l1" })];

    const uc = makeUseCase(ranking, exchangeRates);
    const [item] = (await uc.execute({})).items;

    expect(item).not.toHaveProperty("mileageKm");
    expect(item).not.toHaveProperty("condition");
    expect(item).not.toHaveProperty("transmissionId");
    expect(item).not.toHaveProperty("engineTypeId");
  });

  it("returns what the detail preview places: power, drive, body, colour, VIN presence, exchange and installment", async () => {
    ranking.items = [
      seedListing({
        id: "l1",
        enginePower: 150,
        driveTypeId: "drive-1",
        bodyTypeId: "body-1",
        colorId: "color-1",
        vin: "JTDKB20U793456789",
        acceptsExchange: true,
        installmentAvailable: true,
        allowCalls: false,
      }),
      seedListing({ id: "l2", contactPhone: "+99365000000" }),
    ];

    const uc = makeUseCase(ranking, exchangeRates);
    const [full, sparse] = (await uc.execute({})).items;

    expect(full).toMatchObject({
      enginePower: 150,
      driveTypeId: "drive-1",
      bodyTypeId: "body-1",
      colorId: "color-1",
      hasVin: true,
      acceptsExchange: true,
      installmentAvailable: true,
      allowCalls: false,
      allowChat: true,
      hasContactPhone: false,
    });
    expect(full).not.toHaveProperty("vin");
    expect(sparse).toMatchObject({
      hasVin: false, acceptsExchange: false, installmentAvailable: false, hasContactPhone: true,
    });
    expect(sparse).not.toHaveProperty("contactPhone");
    for (const field of ["enginePower", "driveTypeId", "bodyTypeId", "colorId"])
      expect(sparse).not.toHaveProperty(field);
  });

  it("marks isFavorited for a signed-in viewer with one favorites lookup per page", async () => {
    ranking.items = [seedListing({ id: "l1" }), seedListing({ id: "l2" })];
    const favorites = new FakeFavoriteRepository();
    favorites.favorites.add("viewer-1:l2");

    const uc = makeUseCase(ranking, exchangeRates, undefined, favorites);
    const result = await uc.execute({ viewerId: "viewer-1" });

    expect(result.items.map((i) => i.isFavorited)).toEqual([false, true]);
    expect(favorites.lookups).toBe(1);
    expect(ranking.lastViewerId).toBe("viewer-1");
  });

  it("omits isFavorited and skips the favorites lookup for an anonymous viewer", async () => {
    ranking.items = [seedListing({ id: "l1" })];
    const favorites = new FakeFavoriteRepository();

    const uc = makeUseCase(ranking, exchangeRates, undefined, favorites);
    const result = await uc.execute({});

    expect(result.items[0]).not.toHaveProperty("isFavorited");
    expect(favorites.lookups).toBe(0);
  });

  it("tells the card whether the seller takes calls and chat messages", async () => {
    ranking.items = [
      seedListing({ id: "l1", allowCalls: true, allowChat: false }),
      seedListing({ id: "l2", allowCalls: false, allowChat: true }),
    ];

    const result = await makeUseCase(ranking, exchangeRates).execute({});

    expect(result.items.map((i) => [i.allowCalls, i.allowChat])).toEqual([
      [true, false],
      [false, true],
    ]);
  });

  it("names every seller on the page from one identity read, without avatar fields", async () => {
    ranking.items = [
      seedListing({ id: "l1", sellerId: "seller-a" }),
      seedListing({ id: "l2", sellerId: "seller-b" }),
      seedListing({ id: "l3", sellerId: "seller-a" }),
    ];
    const sellers = new InMemorySellerProfiles([
      ["seller-a", sellerProfile({ displayName: "Aýgül", nameNumber: 3310 })],
      ["seller-b", sellerProfile({ nameNumber: 4821 })],
    ]);

    const result = await makeUseCase(
      ranking, exchangeRates, undefined, undefined, undefined, sellers,
    ).execute({});

    expect(result.items.map((i) => i.seller)).toEqual([
      { displayName: "Aýgül", nameNumber: 3310, deleted: false },
      { displayName: null, nameNumber: 4821, deleted: false },
      { displayName: "Aýgül", nameNumber: 3310, deleted: false },
    ]);
    expect(sellers.cardSellerReads).toBe(1);
  });

  it("marks a seller purged after account deletion as deleted with no name", async () => {
    ranking.items = [seedListing({ id: "l1", sellerId: "gone" })];
    const sellers = new InMemorySellerProfiles([["gone", sellerProfile({ deleted: true })]]);

    const result = await makeUseCase(
      ranking, exchangeRates, undefined, undefined, undefined, sellers,
    ).execute({});

    expect(result.items[0]!.seller).toEqual({ displayName: null, nameNumber: 2057, deleted: true });
  });

  it("omits the seller when identity has no such User", async () => {
    ranking.items = [seedListing({ id: "l1", sellerId: "unknown" })];

    const result = await makeUseCase(ranking, exchangeRates).execute({});

    expect(result.items[0]).not.toHaveProperty("seller");
  });

  it("never puts the seller's contact phone in a feed item", async () => {
    ranking.items = [seedListing({ id: "l1", contactPhone: "+99365123456" })];

    const result = await makeUseCase(ranking, exchangeRates).execute({});

    expect(result.items[0]).not.toHaveProperty("contactPhone");
    expect(JSON.stringify(result)).not.toContain("65123456");
  });
});
