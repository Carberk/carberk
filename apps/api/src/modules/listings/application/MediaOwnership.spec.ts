import { describe, it, expect, beforeEach, vi } from "vitest";

import { Listing } from "../domain/Listing";
import { ListingMedia } from "../domain/ListingMedia";
import type { ListingRepository } from "../domain/ports/ListingRepository";
import type { ListingMediaRepository } from "../domain/ports/ListingMediaRepository";
import type { MediaContentClassifierPort } from "../domain/ports/MediaContentClassifierPort";
import type { ImageVariantGenerator } from "../domain/ports/ImageVariantGenerator";
import type { MediaStoragePort } from "../domain/ports/MediaStoragePort";

import { AttachMedia } from "./AttachMedia";
import { RemoveMedia } from "./RemoveMedia";

// Issue #536: two Users, two distinct Listings, in-memory ports only. User B's
// Listing exposes its media key publicly (GetListingDetail), so a known key must
// authorize nothing for User A.

const USER_A = "user-a";
const USER_B = "user-b";
const LISTING_A = "listing-a";
const LISTING_B = "listing-b";
const VICTIM_KEY = "pending/victim-upload/original.jpg";

class FakeListingRepository implements ListingRepository {
  listings: Listing[] = [];

  async save(listing: Listing): Promise<Listing> {
    this.listings.push(listing);
    return listing;
  }

  async findById(id: string): Promise<Listing | null> {
    return this.listings.find((l) => l.id === id) ?? null;
  }

  async findBySellerId(): Promise<{ items: Listing[] }> {
    return { items: this.listings };
  }

  async update(listing: Listing): Promise<Listing> {
    return listing;
  }

  async recomputePriceTmt(): Promise<number> {
    return 0;
  }

  async softDelete(): Promise<void> {}
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

  async updateSortOrder(): Promise<void> {}
}

const acceptingClassifier: MediaContentClassifierPort = {
  classify: async () => ({ isAcceptable: true, confidence: 1 }),
};

const fakeVariants: ImageVariantGenerator = {
  generate: async (originalKey: string) => ({
    variants: {
      thumbnail: `${originalKey}/thumbnail.jpg`,
      list: `${originalKey}/list.jpg`,
      detail: `${originalKey}/detail.jpg`,
      fullscreen: `${originalKey}/fullscreen.jpg`,
    },
  }),
};

function activeListing(id: string, sellerId: string, publicNumber: number) {
  return Listing.create({
    id,
    publicNumber,
    sellerId,
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
}

describe("Listing media upload ownership (#536)", () => {
  let listings: FakeListingRepository;
  let mediaRepo: FakeListingMediaRepository;
  let storage: MediaStoragePort & { deleteObject: ReturnType<typeof vi.fn> };
  let attach: AttachMedia;
  let remove: RemoveMedia;

  beforeEach(() => {
    listings = new FakeListingRepository();
    listings.listings.push(
      activeListing(LISTING_A, USER_A, 1),
      activeListing(LISTING_B, USER_B, 2),
    );
    mediaRepo = new FakeListingMediaRepository();
    // User B legitimately uploaded and attached this object to Listing B.
    mediaRepo.media.push(
      ListingMedia.create({
        id: "victim-media",
        listingId: LISTING_B,
        kind: "image",
        key: VICTIM_KEY,
        sortOrder: 0,
      }),
    );
    storage = {
      presignUpload: vi.fn(),
      resolvePublicUrl: vi.fn(),
      deleteObject: vi.fn(async () => undefined),
    };
    attach = new AttachMedia(listings, mediaRepo, acceptingClassifier, fakeVariants);
    remove = new RemoveMedia(listings, mediaRepo, storage);
  });

  it("rejects attaching a key already used by another User's Listing", async () => {
    await expect(
      attach.execute({
        listingId: LISTING_A,
        userId: USER_A,
        key: VICTIM_KEY,
        kind: "image",
        sortOrder: 0,
      }),
    ).rejects.toThrow();

    expect(mediaRepo.media.filter((m) => m.listingId === LISTING_A)).toHaveLength(0);
  });

  it("rejects attaching a key that was never presigned for the caller", async () => {
    await expect(
      attach.execute({
        listingId: LISTING_A,
        userId: USER_A,
        key: "pending/forged-by-user-a/original.jpg",
        kind: "image",
        sortOrder: 0,
      }),
    ).rejects.toThrow();

    expect(mediaRepo.media.filter((m) => m.listingId === LISTING_A)).toHaveLength(0);
  });

  it("never schedules deletion of another User's original or derivatives when removing User A's media", async () => {
    const adopted = await attach
      .execute({
        listingId: LISTING_A,
        userId: USER_A,
        key: VICTIM_KEY,
        kind: "image",
        sortOrder: 0,
      })
      .catch(() => undefined);

    if (adopted) {
      await remove.execute({
        listingId: LISTING_A,
        userId: USER_A,
        mediaId: adopted.media.id,
      });
    }

    const deletedKeys = storage.deleteObject.mock.calls.map(([key]) => key as string);
    expect(deletedKeys.filter((key) => key.startsWith("pending/victim-upload/"))).toEqual([]);
  });

  it("leaves User B's media row and object untouched when User A tries to remove it through Listing A", async () => {
    await expect(
      remove.execute({ listingId: LISTING_A, userId: USER_A, mediaId: "victim-media" }),
    ).rejects.toThrow();

    expect(mediaRepo.media.map((m) => m.id)).toContain("victim-media");
    expect(storage.deleteObject).not.toHaveBeenCalled();
  });
});
