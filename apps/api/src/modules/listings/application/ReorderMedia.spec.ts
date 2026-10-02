import { describe, it, expect, beforeEach } from "vitest";
import { NotFoundException } from "@nestjs/common";

import { Listing } from "../domain/Listing";
import { ListingMedia } from "../domain/ListingMedia";
import type { ListingRepository } from "../domain/ports/ListingRepository";
import type { ListingMediaRepository } from "../domain/ports/ListingMediaRepository";

import { ReorderMedia } from "./ReorderMedia";

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

  async softDelete(_id: string, _at: Date): Promise<void> {
    const existing = this.listings.find((l) => l.id === _id);
    if (existing) {
      this.listings = this.listings.map((l) => (l.id === _id ? l.softDelete(_at) : l));
    }
  }
}

class FakeListingMediaRepository implements ListingMediaRepository {
  media: ListingMedia[] = [];
  lastSortOrderCall?: { listingId: string; orders: { mediaId: string; sortOrder: number }[] };

  async save(m: ListingMedia): Promise<ListingMedia> {
    this.media.push(m);
    return m;
  }

  async findById(id: string): Promise<ListingMedia | null> {
    return this.media.find((m) => m.id === id) ?? null;
  }

  async findByListingId(listingId: string): Promise<ListingMedia[]> {
    return this.media.filter((m) => m.listingId === listingId);
  }

  async delete(id: string): Promise<void> {
    this.media = this.media.filter((m) => m.id !== id);
  }

  async deleteReleasingUpload(): Promise<{ removed: boolean; ownedKey: string | null }> {
    return { removed: false, ownedKey: null };
  }

  async updateSortOrder(
    listingId: string,
    orders: { mediaId: string; sortOrder: number }[],
  ): Promise<void> {
    this.lastSortOrderCall = { listingId, orders };
  }
}

function seedActiveListing(repo: FakeListingRepository) {
  const listing = Listing.create({
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
  });
  repo.listings.push(listing);
  return listing;
}

function makeUseCase(
  repo?: FakeListingRepository,
  mediaRepo?: FakeListingMediaRepository,
) {
  return new ReorderMedia(
    repo ?? new FakeListingRepository(),
    mediaRepo ?? new FakeListingMediaRepository(),
  );
}

describe("ReorderMedia", () => {
  let repo: FakeListingRepository;
  let mediaRepo: FakeListingMediaRepository;

  beforeEach(() => {
    repo = new FakeListingRepository();
    mediaRepo = new FakeListingMediaRepository();
  });

  it("calls updateSortOrder with correct parameters", async () => {
    seedActiveListing(repo);

    const uc = makeUseCase(repo, mediaRepo);
    await uc.execute({
      listingId: "listing-1",
      userId: "user-1",
      ordering: [
        { mediaId: "media-2", sortOrder: 0 },
        { mediaId: "media-1", sortOrder: 1 },
      ],
    });

    expect(mediaRepo.lastSortOrderCall).toBeDefined();
    expect(mediaRepo.lastSortOrderCall!.listingId).toBe("listing-1");
    expect(mediaRepo.lastSortOrderCall!.orders).toHaveLength(2);
    expect(mediaRepo.lastSortOrderCall!.orders[0]).toMatchObject({
      mediaId: "media-2",
      sortOrder: 0,
    });
  });

  it("returns 404 for non-owner", async () => {
    seedActiveListing(repo);

    const uc = makeUseCase(repo, mediaRepo);
    await expect(
      uc.execute({
        listingId: "listing-1",
        userId: "user-2",
        ordering: [{ mediaId: "media-1", sortOrder: 0 }],
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it("returns 404 for soft-deleted listing", async () => {
    const listing = seedActiveListing(repo);
    repo.listings[0] = listing.softDelete(new Date());

    const uc = makeUseCase(repo, mediaRepo);
    await expect(
      uc.execute({
        listingId: "listing-1",
        userId: "user-1",
        ordering: [{ mediaId: "media-1", sortOrder: 0 }],
      }),
    ).rejects.toThrow(NotFoundException);
  });
});
