import { FakeListingAuditLog } from "./testing/FakeListingAuditLog";
import { describe, it, expect, beforeEach } from "vitest";
import { NotFoundException, ForbiddenException } from "@nestjs/common";

import { Listing } from "../domain/Listing";
import type { ListingRepository } from "../domain/ports/ListingRepository";
import type { ListingEventPublisher } from "../domain/ports/ListingEventPublisher";

import { MarkSold } from "./MarkSold";

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


class FakeEventPublisher implements ListingEventPublisher {
  events: Array<{ event: string; listingId: string; sellerId?: string }> = [];

  async emit(payload: { event: string; listingId: string; sellerId?: string }): Promise<void> {
    this.events.push(payload);
  }
}

function makeUseCase(
  repo?: FakeListingRepository,
  prisma?: FakeListingAuditLog,
  events?: FakeEventPublisher,
) {
  return new MarkSold(
    repo ?? new FakeListingRepository(),
    prisma ?? new FakeListingAuditLog(),
    events ?? new FakeEventPublisher(),
  );
}

function seedActiveListing(repo: FakeListingRepository, overrides?: Partial<Parameters<typeof Listing.create>[0]>) {
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
    ...overrides,
  });
  repo.listings.push(listing);
  return listing;
}

describe("MarkSold", () => {
  let repo: FakeListingRepository;
  let prisma: FakeListingAuditLog;
  let events: FakeEventPublisher;

  beforeEach(() => {
    repo = new FakeListingRepository();
    prisma = new FakeListingAuditLog();
    events = new FakeEventPublisher();
  });

  it("marks an active listing as sold", async () => {
    seedActiveListing(repo);

    const uc = makeUseCase(repo, prisma, events);
    const result = await uc.execute({ listingId: "listing-1", userId: "user-1" });

    expect(result.listing.status).toBe("sold");
    expect(result.listing.soldAt).toBeInstanceOf(Date);
    expect(prisma.auditLogs).toHaveLength(1);
    expect(prisma.auditLogs[0]).toMatchObject({
      action: "listing.marked_sold",
      targetId: "listing-1",
    });
    expect(events.events).toHaveLength(1);
    expect(events.events[0]).toMatchObject({
      event: "ListingSold",
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

  it("throws DomainError when trying to mark an already-sold listing as sold", async () => {
    const listing = seedActiveListing(repo);
    repo.listings[0] = listing.markSold(new Date());

    const uc = makeUseCase(repo, prisma, events);
    await expect(
      uc.execute({ listingId: "listing-1", userId: "user-1" }),
    ).rejects.toThrow();
  });

  it("throws DomainError when trying to mark an archived listing as sold", async () => {
    const listing = seedActiveListing(repo);
    repo.listings[0] = listing.archive();

    const uc = makeUseCase(repo, prisma, events);
    await expect(
      uc.execute({ listingId: "listing-1", userId: "user-1" }),
    ).rejects.toThrow();
  });

  it("throws ForbiddenException for banned listing", async () => {
    seedActiveListing(repo, { status: "banned" });

    const uc = makeUseCase(repo, prisma, events);
    await expect(
      uc.execute({ listingId: "listing-1", userId: "user-1" }),
    ).rejects.toThrow(ForbiddenException);
  });

  it("computes daysActive correctly in audit log", async () => {
    seedActiveListing(repo, {
      publishedAt: new Date("2026-05-10T00:00:00Z"),
    });

    const uc = makeUseCase(repo, prisma, events);
    await uc.execute({ listingId: "listing-1", userId: "user-1" });

    const auditEntry = prisma.auditLogs[0];
    expect(auditEntry?.details).toMatchObject({
      priceAmount: 100000,
      priceCurrency: "TMT",
    });
    const details = auditEntry?.details as Record<string, unknown> | undefined;
    expect(typeof details?.["daysActive"]).toBe("number");
    expect(details?.["daysActive"]).toBeGreaterThanOrEqual(0);
  });
});
