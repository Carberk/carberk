import { FakeListingMediaCounts } from "./testing/FakeListingMediaCounts";
import { FakeListingAuditLog } from "./testing/FakeListingAuditLog";
import { describe, it, expect, beforeEach } from "vitest";
import { NotFoundException, ForbiddenException } from "@nestjs/common";

import { Listing } from "../domain/Listing";
import type { ListingRepository } from "../domain/ports/ListingRepository";
import type { ListingEventPublisher } from "../domain/ports/ListingEventPublisher";

import { DeleteListing } from "./DeleteListing";

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

  async softDelete(id: string, at: Date): Promise<void> {
    const existing = this.listings.find((l) => l.id === id);
    if (existing) {
      this.listings = this.listings.map((l) => (l.id === id ? l.softDelete(at) : l));
    }
  }
}


class FakeEventPublisher implements ListingEventPublisher {
  events: Array<{ event: string; listingId: string; sellerId?: string }> = [];

  async emit(payload: { event: string; listingId: string; sellerId?: string }): Promise<void> {
    this.events.push(payload);
  }
}

let mediaCounts = new FakeListingMediaCounts();

function makeUseCase(
  repo?: FakeListingRepository,
  prisma?: FakeListingAuditLog,
  events?: FakeEventPublisher,
) {
  return new DeleteListing(
    repo ?? new FakeListingRepository(),
    prisma ?? new FakeListingAuditLog(),
    events ?? new FakeEventPublisher(),
    mediaCounts,
  );
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

describe("DeleteListing", () => {
  let repo: FakeListingRepository;
  let prisma: FakeListingAuditLog;
  let events: FakeEventPublisher;

  beforeEach(() => {
    mediaCounts = new FakeListingMediaCounts();
    repo = new FakeListingRepository();
    prisma = new FakeListingAuditLog();
    events = new FakeEventPublisher();
  });

  it("soft-deletes a listing and preserves media rows", async () => {
    seedActiveListing(repo);
    mediaCounts.mediaCount = 3;

    const uc = makeUseCase(repo, prisma, events);
    await uc.execute({ listingId: "listing-1", userId: "user-1" });

    const listing = repo.listings.find((l) => l.id === "listing-1");
    expect(listing?.deletedAt).toBeInstanceOf(Date);
    expect(listing?.status).toBe("active");
    expect(prisma.auditLogs).toHaveLength(1);
    expect(prisma.auditLogs[0]).toMatchObject({
      action: "listing.deleted",
      targetId: "listing-1",
      details: { status: "active", mediaCount: 3 },
    });
    expect(events.events).toHaveLength(1);
    expect(events.events[0]).toMatchObject({
      event: "ListingDeleted",
      listingId: "listing-1",
    });
  });

  it("throws NotFoundException for non-existent listing", async () => {
    const uc = makeUseCase(repo, prisma, events);
    await expect(
      uc.execute({ listingId: "missing", userId: "user-1" }),
    ).rejects.toThrow(NotFoundException);
  });

  it("throws ForbiddenException for another user's listing", async () => {
    seedActiveListing(repo);

    const uc = makeUseCase(repo, prisma, events);
    await expect(
      uc.execute({ listingId: "listing-1", userId: "user-2" }),
    ).rejects.toThrow(ForbiddenException);
  });
});
