import { describe, it, expect, beforeEach } from "vitest";
import type { CardPhotos } from "../domain/CardPhotos";

import { ListMyFavorites } from "./ListMyFavorites";
import { Favorite } from "../domain/Favorite";
import {
  INACTIVE_VISIBLE_LISTING_STATUSES,
  VISIBLE_LISTING_STATUSES,
} from "../domain/ListingStatus";
import type {
  FavoriteRepository,
  VisibleFavoriteOptions,
} from "../domain/ports/FavoriteRepository";
import type { ListingCard, ListingCardReadPort } from "../domain/ports/ListingCardReadPort";

let favCounter = 0;
function nextFavId(): string {
  favCounter++;
  return `00000000-0000-0000-0000-${favCounter.toString().padStart(12, "0")}`;
}

class FakeFavoriteRepository implements FavoriteRepository {
  favorites: Favorite[] = [];
  /** Listing status by id. A Listing with no entry is deleted: never visible. */
  statuses = new Map<string, string>();

  private newestFirst(userId: string): Favorite[] {
    return this.favorites
      .filter((f) => f.userId === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id));
  }

  async listVisibleByUserId(
    userId: string,
    opts?: VisibleFavoriteOptions,
  ): Promise<{ items: Favorite[]; nextCursor?: { timestamp: string; id: string } }> {
    const allowed: readonly string[] = opts?.activeOnly ? ["active"] : VISIBLE_LISTING_STATUSES;
    const sorted = this.newestFirst(userId).filter((f) =>
      allowed.includes(this.statuses.get(f.listingId) ?? "deleted"),
    );

    const limit = opts?.limit ?? 20;
    const start = opts?.cursor ? sorted.findIndex((f) => f.id === opts.cursor!.id) + 1 : 0;
    const page = sorted.slice(start, start + limit);
    const last = page[page.length - 1];

    return {
      items: page,
      ...(start + limit < sorted.length && last
        ? { nextCursor: { timestamp: last.createdAt.toISOString(), id: last.id } }
        : {}),
    };
  }

  async countVisibleByUserId(userId: string): Promise<{ total: number; inactive: number }> {
    const statuses = this.newestFirst(userId).map((f) => this.statuses.get(f.listingId) ?? "deleted");
    return {
      total: statuses.filter((s) => (VISIBLE_LISTING_STATUSES as readonly string[]).includes(s))
        .length,
      inactive: statuses.filter((s) =>
        (INACTIVE_VISIBLE_LISTING_STATUSES as readonly string[]).includes(s),
      ).length,
    };
  }

  async add(userId: string, listingId: string): Promise<Favorite> {
    const favorite = Favorite.create({
      id: nextFavId(),
      userId,
      listingId,
      createdAt: new Date(),
    });
    this.favorites.push(favorite);
    return favorite;
  }

  async remove(_userId: string, _listingId: string): Promise<boolean> {
    return true;
  }

  async exists(_userId: string, _listingId: string): Promise<boolean> {
    return true;
  }

  async favoritedListingIds(_userId: string, listingIds: string[]): Promise<Set<string>> {
    return new Set(listingIds);
  }

  async listByUserId(
    userId: string,
    opts?: { cursor?: { timestamp: string; id: string }; limit?: number },
  ): Promise<{ items: Favorite[]; nextCursor?: { timestamp: string; id: string } }> {
    const filtered = this.favorites.filter((f) => f.userId === userId);
    const sorted = [...filtered].sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id),
    );

    const take = (opts?.limit ?? 20) + 1;
    let startIndex = 0;

    if (opts?.cursor) {
      const cursorIndex = sorted.findIndex((f) => f.id === opts.cursor!.id);
      if (cursorIndex >= 0) startIndex = cursorIndex + 1;
    }

    const page = sorted.slice(startIndex, startIndex + take);
    const hasMore = page.length === take;
    const items = hasMore ? page.slice(0, -1) : page;
    const last = items[items.length - 1];

    return {
      items,
      ...(hasMore && last
        ? { nextCursor: { timestamp: last.createdAt.toISOString(), id: last.id } }
        : {}),
    };
  }
}

class FakeListingCardReadPort implements ListingCardReadPort {
  summaries: ListingCard[] = [];

  async getCardPhotos(): Promise<Map<string, CardPhotos>> {
    return new Map();
  }

  async getVisibleCards(ids: string[]): Promise<ListingCard[]> {
    return this.summaries.filter((s) => ids.includes(s.id));
  }

  async getOwnerCards(): Promise<{ items: ListingCard[] }> {
    return { items: this.summaries };
  }
}

function makeUseCase(
  favorites?: FakeFavoriteRepository,
  listingsRead?: FakeListingCardReadPort,
) {
  return new ListMyFavorites(
    favorites ?? new FakeFavoriteRepository(),
    listingsRead ?? new FakeListingCardReadPort(),
  );
}

describe("ListMyFavorites", () => {
  let favorites: FakeFavoriteRepository;
  let listingsRead: FakeListingCardReadPort;

  beforeEach(() => {
    favCounter = 0;
    favorites = new FakeFavoriteRepository();
    listingsRead = new FakeListingCardReadPort();
  });

  function seedSummary(overrides?: Partial<ListingCard>): ListingCard {
    const summary: ListingCard = {
      id: "listing-1",
      sellerId: "user-1",
      status: "active",
      brandId: "brand-1",
      modelId: "model-1",
      priceAmount: 100000,
      priceCurrency: "TMT",
      displayPriceTmt: 100000,
      cityId: "city-1",
      publishedAt: new Date("2026-05-01T00:00:00Z"),
      photoKeys: [],
      photoCount: 0,
      allowCalls: true,
      allowChat: true,
      ...overrides,
    };
    listingsRead.summaries.push(summary);
    favorites.statuses.set(summary.id, summary.status);
    return summary;
  }

  /** Favorite `count` Listings of one status, oldest first, ids `${prefix}-1`..`${prefix}-N`. */
  async favoriteListings(prefix: string, status: ListingCard["status"], count: number) {
    for (let i = 1; i <= count; i++) {
      seedSummary({ id: `${prefix}-${i}`, status });
      await favorites.add("user-1", `${prefix}-${i}`);
    }
  }

  it("returns favorited listings", async () => {
    seedSummary({ id: "listing-1" });
    await favorites.add("user-1", "listing-1");

    const uc = makeUseCase(favorites, listingsRead);
    const result = await uc.execute({ userId: "user-1" });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.id).toBe("listing-1");
  });

  it("does not return a per-Listing seller trust signal on favorite summaries", async () => {
    seedSummary({ id: "listing-1" });
    await favorites.add("user-1", "listing-1");

    const uc = makeUseCase(favorites, listingsRead);
    const result = await uc.execute({ userId: "user-1" });

    expect(result.items[0]!).not.toHaveProperty("sellerTrust");
  });

  it("excludes listings no longer visible (banned/deleted)", async () => {
    // favorite exists but read port returns nothing (listing banned/deleted)
    await favorites.add("user-1", "listing-1");

    const uc = makeUseCase(favorites, listingsRead);
    const result = await uc.execute({ userId: "user-1" });

    expect(result.items).toHaveLength(0);
  });

  it("returns multiple favorites in newest-first order", async () => {
    seedSummary({ id: "listing-1" });
    seedSummary({ id: "listing-2" });
    seedSummary({ id: "listing-3" });

    await favorites.add("user-1", "listing-1");
    await favorites.add("user-1", "listing-2");
    await favorites.add("user-1", "listing-3");

    const uc = makeUseCase(favorites, listingsRead);
    const result = await uc.execute({ userId: "user-1" });

    expect(result.items).toHaveLength(3);
    expect(result.items.map((i) => i.id)).toEqual(["listing-3", "listing-2", "listing-1"]);
  });

  it("paginates with cursor", async () => {
    seedSummary({ id: "listing-1" });
    seedSummary({ id: "listing-2" });

    await favorites.add("user-1", "listing-1");
    await favorites.add("user-1", "listing-2");

    const uc = makeUseCase(favorites, listingsRead);
    const page1 = await uc.execute({ userId: "user-1", limit: 1 });

    expect(page1.items).toHaveLength(1);
    expect(page1.items[0]!.id).toBe("listing-2");
    expect(page1.nextCursor).not.toBeNull();

    const page2 = await uc.execute({
      userId: "user-1",
      limit: 1,
      cursor: page1.nextCursor!,
    });

    expect(page2.items).toHaveLength(1);
    expect(page2.items[0]!.id).toBe("listing-1");
    expect(page2.nextCursor).toBeNull();
  });

  it("returns null nextCursor when no more pages", async () => {
    seedSummary({ id: "listing-1" });
    await favorites.add("user-1", "listing-1");

    const uc = makeUseCase(favorites, listingsRead);
    const result = await uc.execute({ userId: "user-1" });

    expect(result.nextCursor).toBeNull();
  });

  it("returns empty list when user has no favorites", async () => {
    const uc = makeUseCase(favorites, listingsRead);
    const result = await uc.execute({ userId: "user-1" });

    expect(result.items).toHaveLength(0);
    expect(result.nextCursor).toBeNull();
  });

  it("returns card fields and contact preferences on favorite items", async () => {
    seedSummary({
      id: "listing-1",
      photoKeys: ["a", "b"],
      photoCount: 4,
      mileageKm: 90000,
      condition: "used",
      transmissionId: "transmission-1",
      engineTypeId: "engine-1",
      contactPhone: "+99365000000",
      allowCalls: false,
      allowChat: true,
    });
    await favorites.add("user-1", "listing-1");

    const uc = makeUseCase(favorites, listingsRead);
    const [item] = (await uc.execute({ userId: "user-1" })).items;

    expect(item).toMatchObject({
      photoKeys: ["a", "b"],
      photoCount: 4,
      mileageKm: 90000,
      condition: "used",
      transmissionId: "transmission-1",
      engineTypeId: "engine-1",
      contactPhone: "+99365000000",
      allowCalls: false,
      allowChat: true,
    });
  });
  describe("activeOnly", () => {
    it("returns sold and archived Favorites too when activeOnly is not sent", async () => {
      await favoriteListings("sold", "sold", 1);
      await favoriteListings("archived", "archived", 1);
      await favoriteListings("active", "active", 1);

      const result = await makeUseCase(favorites, listingsRead).execute({ userId: "user-1" });

      expect(result.items.map((i) => i.id)).toEqual(["active-1", "archived-1", "sold-1"]);
    });

    it("returns only active Favorites when activeOnly is true, newest first", async () => {
      await favoriteListings("active", "active", 1);
      await favoriteListings("sold", "sold", 1);
      await favoriteListings("archived", "archived", 1);
      await favoriteListings("more-active", "active", 1);

      const result = await makeUseCase(favorites, listingsRead).execute({
        userId: "user-1",
        activeOnly: true,
      });

      expect(result.items.map((i) => i.id)).toEqual(["more-active-1", "active-1"]);
      expect(result.items.every((i) => i.status === "active")).toBe(true);
    });

    it("fills the first activeOnly page when more sold Favorites than one page come first", async () => {
      await favoriteListings("active", "active", 3);
      await favoriteListings("sold", "sold", 5);
      const uc = makeUseCase(favorites, listingsRead);

      const page1 = await uc.execute({ userId: "user-1", activeOnly: true, limit: 2 });
      expect(page1.items.map((i) => i.id)).toEqual(["active-3", "active-2"]);
      expect(page1.nextCursor).not.toBeNull();

      const page2 = await uc.execute({
        userId: "user-1",
        activeOnly: true,
        limit: 2,
        cursor: page1.nextCursor!,
      });
      expect(page2.items.map((i) => i.id)).toEqual(["active-1"]);
      expect(page2.nextCursor).toBeNull();
    });
  });

  describe("paging over visible Listings", () => {
    it("fills a page with limit items when newer Favorites are banned or deleted", async () => {
      await favoriteListings("active", "active", 3);
      // Newer Favorites whose Listing is banned, or deleted (no status at all).
      await favorites.add("user-1", "banned-1");
      favorites.statuses.set("banned-1", "banned");
      await favorites.add("user-1", "deleted-1");
      const uc = makeUseCase(favorites, listingsRead);

      const page1 = await uc.execute({ userId: "user-1", limit: 2 });
      expect(page1.items.map((i) => i.id)).toEqual(["active-3", "active-2"]);

      const page2 = await uc.execute({ userId: "user-1", limit: 2, cursor: page1.nextCursor! });
      expect(page2.items.map((i) => i.id)).toEqual(["active-1"]);
      expect(page2.nextCursor).toBeNull();
    });
  });

  describe("counts", () => {
    async function seedMixedFavorites() {
      await favoriteListings("active", "active", 3);
      await favoriteListings("sold", "sold", 2);
      await favoriteListings("archived", "archived", 1);
      await favorites.add("user-1", "banned-1");
      favorites.statuses.set("banned-1", "banned");
      await favorites.add("user-1", "deleted-1");
    }

    it("counts visible Favorites and how many of them are sold or archived", async () => {
      await seedMixedFavorites();

      const result = await makeUseCase(favorites, listingsRead).execute({ userId: "user-1" });

      expect(result.counts).toEqual({ total: 6, inactive: 3 });
    });

    it("does not count banned or deleted Listings", async () => {
      await favorites.add("user-1", "banned-1");
      favorites.statuses.set("banned-1", "banned");
      await favorites.add("user-1", "deleted-1");

      const result = await makeUseCase(favorites, listingsRead).execute({ userId: "user-1" });

      expect(result.counts).toEqual({ total: 0, inactive: 0 });
    });

    it("reports the same counts whatever activeOnly, cursor or limit is sent", async () => {
      await seedMixedFavorites();
      const uc = makeUseCase(favorites, listingsRead);
      const expected = { total: 6, inactive: 3 };

      const all = await uc.execute({ userId: "user-1", limit: 2 });
      const activeOnly = await uc.execute({ userId: "user-1", limit: 2, activeOnly: true });
      const paged = await uc.execute({
        userId: "user-1",
        limit: 1,
        cursor: all.nextCursor!,
      });

      expect(all.counts).toEqual(expected);
      expect(activeOnly.counts).toEqual(expected);
      expect(paged.counts).toEqual(expected);
    });

    it("counts only the requesting User's Favorites", async () => {
      await seedMixedFavorites();
      favorites.favorites.push(
        Favorite.create({
          id: nextFavId(),
          userId: "user-2",
          listingId: "active-1",
          createdAt: new Date(),
        }),
      );

      const result = await makeUseCase(favorites, listingsRead).execute({ userId: "user-2" });

      expect(result.counts).toEqual({ total: 1, inactive: 0 });
    });
  });
});
