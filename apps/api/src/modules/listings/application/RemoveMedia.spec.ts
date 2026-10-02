import { describe, it, expect, beforeEach } from "vitest";
import { NotFoundException } from "@nestjs/common";

import { Listing } from "../domain/Listing";
import { ListingMedia } from "../domain/ListingMedia";
import type { ListingRepository } from "../domain/ports/ListingRepository";
import type { ListingMediaRepository } from "../domain/ports/ListingMediaRepository";
import type { MediaStoragePort } from "../domain/ports/MediaStoragePort";

import { RemoveMedia } from "./RemoveMedia";

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

  async deleteReleasingUpload(
    id: string,
  ): Promise<{ removed: boolean; ownedKey: string | null }> {
    const row = this.media.find((m) => m.id === id);
    if (!row) return { removed: false, ownedKey: null };
    this.media = this.media.filter((m) => m.id !== id);
    const shared = this.media.some((m) => m.key === row.key);
    return { removed: true, ownedKey: row.uploadId && !shared ? row.key : null };
  }

  async updateSortOrder(
    _listingId: string,
    orders: { mediaId: string; sortOrder: number }[],
  ): Promise<void> {
    for (const o of orders) {
      const idx = this.media.findIndex((m) => m.id === o.mediaId);
      if (idx >= 0) {
        const old = this.media[idx]!;
        this.media[idx] = ListingMedia.create({
          id: old.id,
          listingId: old.listingId,
          kind: old.kind,
          key: old.key,
          sortOrder: o.sortOrder,
          ...(old.width !== undefined ? { width: old.width } : {}),
          ...(old.height !== undefined ? { height: old.height } : {}),
          ...(old.durationMs !== undefined ? { durationMs: old.durationMs } : {}),
          ...(old.posterKey !== undefined ? { posterKey: old.posterKey } : {}),
          createdAt: old.createdAt,
        });
      }
    }
  }
}

class FakeMediaStorage implements MediaStoragePort {
  deletedKeys: string[] = [];
  shouldThrow = false;

  async presignUpload(): Promise<{ url: string; key: string }> {
    return { url: "", key: "" };
  }

  resolvePublicUrl(_key: string): string {
    return "";
  }

  async deleteObject(key: string): Promise<void> {
    if (this.shouldThrow) throw new Error("S3 error");
    this.deletedKeys.push(key);
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
  storage?: FakeMediaStorage,
) {
  return new RemoveMedia(
    repo ?? new FakeListingRepository(),
    mediaRepo ?? new FakeListingMediaRepository(),
    storage ?? new FakeMediaStorage(),
  );
}

describe("RemoveMedia", () => {
  let repo: FakeListingRepository;
  let mediaRepo: FakeListingMediaRepository;
  let storage: FakeMediaStorage;

  beforeEach(() => {
    repo = new FakeListingRepository();
    mediaRepo = new FakeListingMediaRepository();
    storage = new FakeMediaStorage();
  });

  it("deletes media row and all variant MinIO objects", async () => {
    seedActiveListing(repo);
    mediaRepo.media.push(
      ListingMedia.create({
        id: "media-1",
        listingId: "listing-1",
        kind: "image",
        key: "pending/abc/original.jpg",
        sortOrder: 0,
        uploadId: "upload-1",
      }),
    );

    const uc = makeUseCase(repo, mediaRepo, storage);
    await uc.execute({ listingId: "listing-1", mediaId: "media-1", userId: "user-1" });

    expect(mediaRepo.media).toHaveLength(0);
    expect(storage.deletedKeys.length).toBe(10); // original.jpg/webp + 4 variants × 2 formats
    expect(storage.deletedKeys).toContain("pending/abc/original.jpg");
    expect(storage.deletedKeys).toContain("pending/abc/thumbnail.jpg");
    expect(storage.deletedKeys).toContain("pending/abc/thumbnail.webp");
    expect(storage.deletedKeys).toContain("pending/abc/fullscreen.webp");
  });

  it("succeeds even when MinIO delete throws (best-effort)", async () => {
    seedActiveListing(repo);
    mediaRepo.media.push(
      ListingMedia.create({
        id: "media-1",
        listingId: "listing-1",
        kind: "image",
        key: "pending/abc/original.jpg",
        sortOrder: 0,
        uploadId: "upload-1",
      }),
    );
    storage.shouldThrow = true;

    const uc = makeUseCase(repo, mediaRepo, storage);
    await uc.execute({ listingId: "listing-1", mediaId: "media-1", userId: "user-1" });

    expect(mediaRepo.media).toHaveLength(0);
    expect(storage.deletedKeys).toHaveLength(0);
  });

  it("removes a row without upload provenance but deletes no storage objects", async () => {
    seedActiveListing(repo);
    mediaRepo.media.push(
      ListingMedia.create({
        id: "media-1",
        listingId: "listing-1",
        kind: "image",
        key: "pending/abc/original.jpg",
        sortOrder: 0,
      }),
    );

    const uc = makeUseCase(repo, mediaRepo, storage);
    await uc.execute({ listingId: "listing-1", mediaId: "media-1", userId: "user-1" });

    expect(mediaRepo.media).toHaveLength(0);
    expect(storage.deletedKeys).toEqual([]);
  });

  it("returns 404 and deletes nothing when another caller already removed the media", async () => {
    seedActiveListing(repo);
    mediaRepo.media.push(
      ListingMedia.create({
        id: "media-1",
        listingId: "listing-1",
        kind: "image",
        key: "pending/abc/original.jpg",
        sortOrder: 0,
        uploadId: "upload-1",
      }),
    );
    // findById sees the row, then a concurrent remove wins before this delete.
    const racing = Object.assign(Object.create(mediaRepo) as FakeListingMediaRepository, {
      deleteReleasingUpload: async () => ({ removed: false, ownedKey: null }),
    });

    const uc = makeUseCase(repo, racing, storage);
    await expect(
      uc.execute({ listingId: "listing-1", mediaId: "media-1", userId: "user-1" }),
    ).rejects.toThrow(NotFoundException);
    expect(storage.deletedKeys).toEqual([]);
  });

  it("returns 404 for non-owner", async () => {
    seedActiveListing(repo);

    const uc = makeUseCase(repo, mediaRepo, storage);
    await expect(
      uc.execute({ listingId: "listing-1", mediaId: "media-1", userId: "user-2" }),
    ).rejects.toThrow(NotFoundException);
  });

  it("returns 404 when media does not belong to listing", async () => {
    seedActiveListing(repo);
    mediaRepo.media.push(
      ListingMedia.create({
        id: "media-1",
        listingId: "listing-2",
        kind: "image",
        key: "pending/abc/original.jpg",
        sortOrder: 0,
      }),
    );

    const uc = makeUseCase(repo, mediaRepo, storage);
    await expect(
      uc.execute({ listingId: "listing-1", mediaId: "media-1", userId: "user-1" }),
    ).rejects.toThrow(NotFoundException);
  });
});
