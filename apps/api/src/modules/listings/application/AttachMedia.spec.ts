import { describe, it, expect, beforeEach } from "vitest";
import { NotFoundException, BadRequestException } from "@nestjs/common";

import { Listing } from "../domain/Listing";
import { ListingMedia } from "../domain/ListingMedia";
import type { ListingRepository } from "../domain/ports/ListingRepository";
import type { MediaContentClassifierPort } from "../domain/ports/MediaContentClassifierPort";
import type { ImageVariantGenerator } from "../domain/ports/ImageVariantGenerator";

import { AttachMedia } from "./AttachMedia";
import { UploadAdoptionGuard } from "./UploadAdoptionGuard";
import { InMemoryMediaWorld } from "./testing/InMemoryMediaWorld";

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

class FakeContentClassifier implements MediaContentClassifierPort {
  result: { isAcceptable: boolean; confidence: number; reason?: "nsfw" | "not-a-car" | "duplicate" | "unknown" } = {
    isAcceptable: true,
    confidence: 1.0,
  };

  async classify(_key: string) {
    return this.result;
  }
}

class FakeVariantGenerator implements ImageVariantGenerator {
  called = false;

  async generate(originalKey: string) {
    this.called = true;
    return {
      variants: {
        thumbnail: `${originalKey}/thumbnail.jpg`,
        list: `${originalKey}/list.jpg`,
        detail: `${originalKey}/detail.jpg`,
        fullscreen: `${originalKey}/fullscreen.jpg`,
      },
    };
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

describe("AttachMedia", () => {
  let repo: FakeListingRepository;
  let world: InMemoryMediaWorld;
  let classifier: FakeContentClassifier;
  let variantGen: FakeVariantGenerator;
  let uc: AttachMedia;

  /** A presigned upload by `user-1` whose file has reached storage. */
  function presignedUpload(
    key: string,
    kind: "image" | "video" = "image",
    userId = "user-1",
  ): void {
    world.uploads.push({
      id: `upload-${key}`,
      userId,
      key,
      kind,
      contentType: kind === "image" ? "image/jpeg" : "video/mp4",
      sizeBytes: 1024,
      createdAt: new Date("2026-05-01T00:00:00Z"),
    });
    world.completeUpload(key);
  }

  beforeEach(() => {
    repo = new FakeListingRepository();
    world = new InMemoryMediaWorld();
    classifier = new FakeContentClassifier();
    variantGen = new FakeVariantGenerator();
    uc = new AttachMedia(
      repo,
      world.mediaRepo,
      classifier,
      variantGen,
      new UploadAdoptionGuard(world.uploadRepo, world.inspector),
    );
  });

  it("attaches an image and calls variant generator", async () => {
    seedActiveListing(repo);
    presignedUpload("pending/abc/original.jpg");

    const result = await uc.execute({
      listingId: "listing-1",
      userId: "user-1",
      key: "pending/abc/original.jpg",
      kind: "image",
      sortOrder: 0,
      width: 1200,
      height: 800,
    });

    expect(result.media.listingId).toBe("listing-1");
    expect(result.media.kind).toBe("image");
    expect(result.media.uploadId).toBe("upload-pending/abc/original.jpg");
    expect(variantGen.called).toBe(true);
    expect(world.media).toHaveLength(1);
  });

  it("attaches a video without calling variant generator", async () => {
    seedActiveListing(repo);
    presignedUpload("pending/abc/original.mp4", "video");
    presignedUpload("pending/abc/poster.jpg");

    const result = await uc.execute({
      listingId: "listing-1",
      userId: "user-1",
      key: "pending/abc/original.mp4",
      kind: "video",
      sortOrder: 0,
      durationMs: 30000,
      posterKey: "pending/abc/poster.jpg",
    });

    expect(result.media.kind).toBe("video");
    expect(variantGen.called).toBe(false);
    expect(result.media.durationMs).toBe(30000);
    expect(result.media.posterKey).toBe("pending/abc/poster.jpg");
  });

  it("rejects when photo limit (20) is exceeded", async () => {
    seedActiveListing(repo);
    for (let i = 0; i < 20; i++) {
      world.media.push(
        ListingMedia.create({
          id: `media-${i}`,
          listingId: "listing-1",
          kind: "image",
          key: `pending/${i}/original.jpg`,
          sortOrder: i,
        }),
      );
    }
    presignedUpload("pending/extra/original.jpg");

    await expect(
      uc.execute({
        listingId: "listing-1",
        userId: "user-1",
        key: "pending/extra/original.jpg",
        kind: "image",
        sortOrder: 21,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it("rejects when video limit (1) is exceeded", async () => {
    seedActiveListing(repo);
    world.media.push(
      ListingMedia.create({
        id: "media-video",
        listingId: "listing-1",
        kind: "video",
        key: "pending/vid/original.mp4",
        sortOrder: 0,
        durationMs: 30000,
      }),
    );
    presignedUpload("pending/extra/original.mp4", "video");

    await expect(
      uc.execute({
        listingId: "listing-1",
        userId: "user-1",
        key: "pending/extra/original.mp4",
        kind: "video",
        sortOrder: 1,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it("returns 404 for non-owner", async () => {
    seedActiveListing(repo);
    presignedUpload("pending/abc/original.jpg", "image", "user-2");

    await expect(
      uc.execute({
        listingId: "listing-1",
        userId: "user-2",
        key: "pending/abc/original.jpg",
        kind: "image",
        sortOrder: 0,
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it("returns 404 for soft-deleted listing", async () => {
    const listing = seedActiveListing(repo);
    repo.listings[0] = listing.softDelete(new Date());
    presignedUpload("pending/abc/original.jpg");

    await expect(
      uc.execute({
        listingId: "listing-1",
        userId: "user-1",
        key: "pending/abc/original.jpg",
        kind: "image",
        sortOrder: 0,
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it("calls classifier and still attaches when classifier returns unacceptable in S4", async () => {
    seedActiveListing(repo);
    presignedUpload("pending/abc/original.jpg");
    classifier.result = { isAcceptable: false, confidence: 0.9, reason: "nsfw" };

    const result = await uc.execute({
      listingId: "listing-1",
      userId: "user-1",
      key: "pending/abc/original.jpg",
      kind: "image",
      sortOrder: 0,
    });

    expect(result.media).toBeDefined();
    // In S4, NullContentClassifier always returns true; the branch for false exists but no-op
  });
});
