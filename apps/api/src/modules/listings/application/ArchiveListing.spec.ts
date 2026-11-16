import { FakeListingAuditLog } from "./testing/FakeListingAuditLog";
import { describe, it, expect, beforeEach } from "vitest";
import { NotFoundException, ForbiddenException } from "@nestjs/common";

import { Listing } from "../domain/Listing";
import type { ListingRepository } from "../domain/ports/ListingRepository";

import { ArchiveListing } from "./ArchiveListing";

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


function makeUseCase(repo?: FakeListingRepository, prisma?: FakeListingAuditLog) {
  return new ArchiveListing(
    repo ?? new FakeListingRepository(),
    prisma ?? new FakeListingAuditLog(),
  );
}

function seedListing(
  repo: FakeListingRepository,
  status: "active" | "sold" | "archived",
) {
  const listing = Listing.create({
    id: "listing-1",
    publicNumber: 1,
    sellerId: "user-1",
    status,
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

describe("ArchiveListing", () => {
  let repo: FakeListingRepository;
  let prisma: FakeListingAuditLog;

  beforeEach(() => {
    repo = new FakeListingRepository();
    prisma = new FakeListingAuditLog();
  });

  it("archives an active listing", async () => {
    seedListing(repo, "active");

    const uc = makeUseCase(repo, prisma);
    const result = await uc.execute({ listingId: "listing-1", userId: "user-1" });

    expect(result.listing.status).toBe("archived");
    expect(prisma.auditLogs).toHaveLength(1);
    expect(prisma.auditLogs[0]).toMatchObject({
      action: "listing.archived",
      targetId: "listing-1",
      details: { previousStatus: "active" },
    });
  });

  it("archives a sold listing", async () => {
    seedListing(repo, "sold");

    const uc = makeUseCase(repo, prisma);
    const result = await uc.execute({ listingId: "listing-1", userId: "user-1" });

    expect(result.listing.status).toBe("archived");
    const details = prisma.auditLogs[0]?.details as Record<string, unknown> | undefined;
    expect(details?.["previousStatus"]).toBe("sold");
  });

  it("throws NotFoundException for non-existent listing", async () => {
    const uc = makeUseCase(repo, prisma);
    await expect(
      uc.execute({ listingId: "missing", userId: "user-1" }),
    ).rejects.toThrow(NotFoundException);
  });

  it("throws ForbiddenException for another user's listing", async () => {
    seedListing(repo, "active");

    const uc = makeUseCase(repo, prisma);
    await expect(
      uc.execute({ listingId: "listing-1", userId: "user-2" }),
    ).rejects.toThrow(ForbiddenException);
  });

  it("throws DomainError when trying to archive an already-archived listing", async () => {
    seedListing(repo, "active");
    repo.listings = repo.listings.map((l) => (l.id === "listing-1" ? l.archive() : l));

    const uc = makeUseCase(repo, prisma);
    await expect(
      uc.execute({ listingId: "listing-1", userId: "user-1" }),
    ).rejects.toThrow();
  });
});
