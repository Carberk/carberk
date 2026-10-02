import { describe, it, expect, beforeEach } from "vitest";
import { GetListingDetail } from "./GetListingDetail";
import { Listing } from "../domain/Listing";
import { ListingMedia } from "../domain/ListingMedia";
import type { ListingRepository } from "../domain/ports/ListingRepository";
import type { ListingMediaRepository } from "../domain/ports/ListingMediaRepository";
import type { ExchangeRatePort } from "../domain/ports/ExchangeRatePort";
import type { MediaStoragePort } from "../domain/ports/MediaStoragePort";
import type { FavoriteRepository } from "../domain/ports/FavoriteRepository";
import type { VinDecoderPort } from "../domain/ports/VinDecoderPort";
import type {
  SellerProfile,
  SellerProfilePort,
} from "../domain/ports/SellerProfilePort";

class FakeListingRepository implements ListingRepository {
  listings: Listing[] = [];

  async save(listing: Listing): Promise<Listing> {
    this.listings.push(listing);
    return listing;
  }

  async findById(id: string): Promise<Listing | null> {
    return this.listings.find((l) => l.id === id) ?? null;
  }

  async findBySellerId(
    _sellerId: string,
    _opts?: { cursor?: { timestamp: string; id: string }; limit?: number },
  ): Promise<{ items: Listing[]; nextCursor?: { timestamp: string; id: string } }> {
    return { items: this.listings };
  }

  async update(listing: Listing): Promise<Listing> {
    const idx = this.listings.findIndex((l) => l.id === listing.id);
    if (idx >= 0) this.listings[idx] = listing;
    return listing;
  }

  async recomputePriceTmt(): Promise<number> {
    return 0;
  }

  async softDelete(_id: string, _at: Date): Promise<void> {}
}

class FakeListingMediaRepository implements ListingMediaRepository {
  media: ListingMedia[] = [];

  async save(m: ListingMedia): Promise<ListingMedia> {
    this.media.push(m);
    return m;
  }

  async findById(_id: string): Promise<ListingMedia | null> {
    return this.media.find((m) => m.id === _id) ?? null;
  }

  async findByListingId(listingId: string): Promise<ListingMedia[]> {
    return this.media.filter((m) => m.listingId === listingId);
  }

  async delete(_id: string): Promise<void> {}

  async deleteReleasingUpload(): Promise<{ removed: boolean; ownedKey: string | null }> {
    return { removed: false, ownedKey: null };
  }

  async updateSortOrder(_listingId: string, _orders: { mediaId: string; sortOrder: number }[]): Promise<void> {}
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
  favorites: Set<string> = new Set();

  async add(_userId: string, _listingId: string) {
    return { id: "fav-1", userId: _userId, listingId: _listingId, createdAt: new Date() };
  }

  async remove(_userId: string, _listingId: string): Promise<boolean> {
    return true;
  }

  async exists(userId: string, listingId: string): Promise<boolean> {
    return this.favorites.has(`${userId}:${listingId}`);
  }

  async favoritedListingIds(userId: string, listingIds: string[]): Promise<Set<string>> {
    return new Set(listingIds.filter((id) => this.favorites.has(`${userId}:${id}`)));
  }

  async listVisibleByUserId(_userId: string) {
    return { items: [] };
  }

  async countVisibleByUserId(_userId: string) {
    return { total: 0, inactive: 0 };
  }
}

class FakeVinDecoder implements VinDecoderPort {
  result: { decoded: false } | { decoded: true; brand?: string; model?: string; year?: number; bodyType?: string; engineType?: string; confidence: number } = { decoded: false };

  async decode(_vin: string) {
    return this.result;
  }
}

class FakeSellerProfilePort implements SellerProfilePort {
  profiles = new Map<string, SellerProfile>([
    ["user-1", { displayName: "Seller", memberSince: new Date("2025-01-01T00:00:00.000Z") }],
  ]);

  async getSellerProfile(userId: string): Promise<SellerProfile | null> {
    return this.profiles.get(userId) ?? null;
  }
}

function makeUseCase(
  repo?: FakeListingRepository,
  mediaRepo?: FakeListingMediaRepository,
  exchangeRates?: FakeExchangeRatePort,
  storage?: FakeMediaStoragePort,
  favorites?: FakeFavoriteRepository,
  vinDecoder?: FakeVinDecoder,
  sellerProfiles?: FakeSellerProfilePort,
) {
  return new GetListingDetail(
    repo ?? new FakeListingRepository(),
    mediaRepo ?? new FakeListingMediaRepository(),
    exchangeRates ?? new FakeExchangeRatePort(),
    storage ?? new FakeMediaStoragePort(),
    favorites ?? new FakeFavoriteRepository(),
    vinDecoder ?? new FakeVinDecoder(),
    sellerProfiles ?? new FakeSellerProfilePort(),
  );
}

describe("GetListingDetail", () => {
  let repo: FakeListingRepository;
  let mediaRepo: FakeListingMediaRepository;
  let exchangeRates: FakeExchangeRatePort;
  let storage: FakeMediaStoragePort;
  let favorites: FakeFavoriteRepository;
  let vinDecoder: FakeVinDecoder;

  beforeEach(() => {
    repo = new FakeListingRepository();
    mediaRepo = new FakeListingMediaRepository();
    exchangeRates = new FakeExchangeRatePort();
    storage = new FakeMediaStoragePort();
    favorites = new FakeFavoriteRepository();
    vinDecoder = new FakeVinDecoder();
  });

  function seedListing(overrides?: Partial<Parameters<typeof Listing.create>[0]>) {
    const listing = Listing.create({
      id: "listing-1",
      publicNumber: 10482,
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
    repo.listings.push(listing);
    return listing;
  }

  it("returns detail for an active listing", async () => {
    seedListing();
    const uc = makeUseCase(repo, mediaRepo, exchangeRates, storage, favorites);
    const result = await uc.execute({ listingId: "listing-1" });

    expect(result.id).toBe("listing-1");
    expect(result.status).toBe("active");
    expect(result.displayPriceTmt).toBe(100000);
  });

  it("does not return a per-Listing seller trust signal", async () => {
    seedListing();
    const uc = makeUseCase(repo, mediaRepo, exchangeRates, storage, favorites);
    const result = await uc.execute({ listingId: "listing-1" });

    expect(result).not.toHaveProperty("sellerTrust");
  });

  it("returns a named seller, join date, and public number from persisted data", async () => {
    seedListing();
    const profiles = new FakeSellerProfilePort();
    profiles.profiles.set("user-1", {
      displayName: "Aýgül",
      memberSince: new Date("2024-06-10T12:00:00Z"),
    });

    const result = await makeUseCase(
      repo, mediaRepo, exchangeRates, storage, favorites, vinDecoder, profiles,
    ).execute({ listingId: "listing-1" });

    expect(result.publicNumber).toBe(10482);
    expect(result.seller).toEqual({
      displayName: "Aýgül",
      memberSince: "2024-06-10T12:00:00.000Z",
    });
  });

  it("returns a null display name for an unnamed seller", async () => {
    seedListing();
    const profiles = new FakeSellerProfilePort();
    profiles.profiles.set("user-1", {
      displayName: null,
      memberSince: new Date("2024-06-10T12:00:00Z"),
    });

    const result = await makeUseCase(
      repo, mediaRepo, exchangeRates, storage, favorites, vinDecoder, profiles,
    ).execute({ listingId: "listing-1" });

    expect(result.seller).toEqual({
      displayName: null,
      memberSince: "2024-06-10T12:00:00.000Z",
    });
  });

  it("returns 404 for soft-deleted listing", async () => {
    const listing = seedListing();
    repo.listings = [listing.softDelete(new Date())];

    const uc = makeUseCase(repo, mediaRepo, exchangeRates, storage, favorites);
    await expect(uc.execute({ listingId: "listing-1" })).rejects.toThrow("Listing not found");
  });

  it("returns 404 for non-existent listing", async () => {
    const uc = makeUseCase(repo, mediaRepo, exchangeRates, storage, favorites);
    await expect(uc.execute({ listingId: "missing" })).rejects.toThrow("Listing not found");
  });

  it("computes displayPriceTmt via exchange rate for USD", async () => {
    seedListing({ priceAmount: 1000, priceCurrency: "USD" });
    exchangeRates.rates["USD->TMT"] = 3.5;

    const uc = makeUseCase(repo, mediaRepo, exchangeRates, storage, favorites);
    const result = await uc.execute({ listingId: "listing-1" });

    expect(result.displayPriceTmt).toBe(3500);
  });

  it("includes media with variant urls", async () => {
    seedListing();
    const media = ListingMedia.create({
      id: "media-1",
      listingId: "listing-1",
      kind: "image",
      key: "listings/listing-1/media-1/original.jpg",
      sortOrder: 0,
    });
    mediaRepo.media.push(media);

    const uc = makeUseCase(repo, mediaRepo, exchangeRates, storage, favorites);
    const result = await uc.execute({ listingId: "listing-1" });

    expect(result.media).toHaveLength(1);
    expect(result.media[0]!.variants.thumbnail).toBe(
      "https://media.auto.tm/listings/listing-1/media-1/thumbnail.jpg",
    );
  });

  it("returns video url for all variant slots on video media", async () => {
    seedListing();
    const media = ListingMedia.create({
      id: "media-1",
      listingId: "listing-1",
      kind: "video",
      key: "listings/listing-1/media-1/video.mp4",
      sortOrder: 0,
    });
    mediaRepo.media.push(media);

    const uc = makeUseCase(repo, mediaRepo, exchangeRates, storage, favorites);
    const result = await uc.execute({ listingId: "listing-1" });

    expect(result.media[0]!.variants.thumbnail).toBe(
      "https://media.auto.tm/listings/listing-1/media-1/video.mp4",
    );
  });

  it("returns 404 for banned listing when requester is not owner", async () => {
    seedListing({ status: "banned", sellerId: "user-1" });

    const uc = makeUseCase(repo, mediaRepo, exchangeRates, storage, favorites);
    await expect(
      uc.execute({ listingId: "listing-1", requestingUserId: "user-2" }),
    ).rejects.toThrow("Listing not found");
  });

  it("returns detail for banned listing when requester is owner", async () => {
    seedListing({ status: "banned", sellerId: "user-1" });

    const uc = makeUseCase(repo, mediaRepo, exchangeRates, storage, favorites);
    const result = await uc.execute({ listingId: "listing-1", requestingUserId: "user-1" });

    expect(result.id).toBe("listing-1");
    expect(result.status).toBe("banned");
  });

  describe("buyer visibility regression (#366)", () => {
    it("returns 404 for a soft-deleted listing requested by a buyer", async () => {
      const listing = seedListing({ sellerId: "user-1" });
      repo.listings = [listing.softDelete(new Date())];

      const uc = makeUseCase(repo, mediaRepo, exchangeRates, storage, favorites);
      await expect(
        uc.execute({ listingId: "listing-1", requestingUserId: "user-2" }),
      ).rejects.toThrow("Listing not found");
    });

    it("returns 404 for a banned listing requested anonymously", async () => {
      seedListing({ status: "banned", sellerId: "user-1" });

      const uc = makeUseCase(repo, mediaRepo, exchangeRates, storage, favorites);
      await expect(uc.execute({ listingId: "listing-1" })).rejects.toThrow(
        "Listing not found",
      );
    });

    it.each(["sold", "archived"] as const)(
      "serves a %s listing to buyers so the client can show it closed for contact",
      async (status) => {
        seedListing({ status, sellerId: "user-1" });

        const uc = makeUseCase(repo, mediaRepo, exchangeRates, storage, favorites);
        const result = await uc.execute({
          listingId: "listing-1",
          requestingUserId: "user-2",
        });

        expect(result.status).toBe(status);
      },
    );
  });

  it("returns isFavorited=false when no requestingUserId", async () => {
    seedListing();
    favorites.favorites.add("user-1:listing-1");

    const uc = makeUseCase(repo, mediaRepo, exchangeRates, storage, favorites);
    const result = await uc.execute({ listingId: "listing-1" });

    expect(result.isFavorited).toBe(false);
  });

  it("returns isFavorited=true when the user has favorited", async () => {
    seedListing();
    favorites.favorites.add("user-2:listing-1");

    const uc = makeUseCase(repo, mediaRepo, exchangeRates, storage, favorites);
    const result = await uc.execute({ listingId: "listing-1", requestingUserId: "user-2" });

    expect(result.isFavorited).toBe(true);
  });

  it("returns isFavorited=false when the user has not favorited", async () => {
    seedListing();
    favorites.favorites.add("user-2:listing-1");

    const uc = makeUseCase(repo, mediaRepo, exchangeRates, storage, favorites);
    const result = await uc.execute({ listingId: "listing-1", requestingUserId: "user-3" });

    expect(result.isFavorited).toBe(false);
  });

  it("omits vinHistory when listing has no VIN", async () => {
    seedListing();
    const uc = makeUseCase(repo, mediaRepo, exchangeRates, storage, favorites, vinDecoder);

    const result = await uc.execute({ listingId: "listing-1" });

    expect(result.vinHistory).toBeUndefined();
  });

  it("returns decoded=false vinHistory when decoder cannot decode", async () => {
    seedListing({ vin: "WBA1234567890VIN" });
    vinDecoder.result = { decoded: false };

    const uc = makeUseCase(repo, mediaRepo, exchangeRates, storage, favorites, vinDecoder);
    const result = await uc.execute({ listingId: "listing-1" });

    expect(result.vinHistory).toEqual({ decoded: false });
  });

  it("returns decoded vinHistory with only fields the decoder provides", async () => {
    seedListing({ vin: "WBA1234567890VIN" });
    vinDecoder.result = {
      decoded: true,
      brand: "BMW",
      model: "X5",
      year: 2018,
      confidence: 0.92,
    };

    const uc = makeUseCase(repo, mediaRepo, exchangeRates, storage, favorites, vinDecoder);
    const result = await uc.execute({ listingId: "listing-1" });

    expect(result.vinHistory).toEqual({
      decoded: true,
      brand: "BMW",
      model: "X5",
      year: 2018,
      confidence: 0.92,
    });
  });
});
