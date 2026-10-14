import { describe, it, expect, beforeEach } from "vitest";
import { BadRequestException, NotFoundException, ForbiddenException } from "@nestjs/common";

import { Listing } from "../domain/Listing";
import type { ListingRepository } from "../domain/ports/ListingRepository";
import type { ExchangeRatePort } from "../domain/ports/ExchangeRatePort";

import { RepublishListing } from "./RepublishListing";
import { InMemoryContactPhones } from "./testing/InMemoryContactPhones";

/** Sign-in and confirmed phones the next `makeUseCase()` checks the stored number against. */
let contactPhones = new InMemoryContactPhones();
/** The use-case clock; real time unless a test fixes it. */
let clock = { now: () => new Date() };

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

  priceTmtWrites: Array<number | undefined> = [];

  async update(listing: Listing, derived?: { priceTmt: number }): Promise<Listing> {
    this.priceTmtWrites.push(derived?.priceTmt);
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

class FakePrisma {
  photoCount = 3;
  listingMedia = { count: async () => this.photoCount };
  auditLogs: Array<{
    actorId: string;
    action: string;
    targetType: string;
    targetId: string;
    details: unknown;
  }> = [];

  auditLog = {
    create: async ({ data }: { data: unknown }) => {
      this.auditLogs.push(data as FakePrisma["auditLogs"][number]);
    },
  };
}

class FakeExchangeRatePort implements ExchangeRatePort {
  rates: Record<string, number> = {};

  async getRate(from: string, to: string): Promise<number> {
    return this.rates[`${from}:${to}`] ?? 0;
  }

  async listAll() {
    return [];
  }
}

function makeUseCase(
  repo?: FakeListingRepository,
  prisma?: FakePrisma,
  exchangeRates?: FakeExchangeRatePort,
) {
  return new RepublishListing(
    repo ?? new FakeListingRepository(),
    (prisma ?? new FakePrisma()) as unknown as ConstructorParameters<typeof RepublishListing>[1],
    exchangeRates ?? new FakeExchangeRatePort(),
    contactPhones.policy,
    clock,
  );
}

function seedListing(
  repo: FakeListingRepository,
  status: "active" | "sold" | "archived",
  overrides?: Partial<Parameters<typeof Listing.create>[0]>,
  { phone = true }: { phone?: boolean } = {},
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
    ...(phone && { contactPhone: "+99361234567" }),
    allowCalls: true,
    allowChat: true,
    publishedAt: new Date("2026-05-01T00:00:00Z"),
    ...overrides,
  });
  repo.listings.push(listing);
  return listing;
}

describe("RepublishListing", () => {
  let repo: FakeListingRepository;
  let prisma: FakePrisma;

  beforeEach(() => {
    repo = new FakeListingRepository();
    prisma = new FakePrisma();
    contactPhones = new InMemoryContactPhones();
    clock = { now: () => new Date() };
  });

  it("republishes an archived Listing with a legacy VIN unchanged", async () => {
    seedListing(repo, "archived", { vin: "Corolla" });
    const { listing } = await makeUseCase(repo, prisma).execute({ listingId: "listing-1", userId: "user-1" });
    expect(listing.status).toBe("active");
    expect(listing.vin).toBe("Corolla");
  });

  it("refuses two photos without changing the stored Listing", async () => {
    seedListing(repo, "archived");
    prisma.photoCount = 2;
    const error = await makeUseCase(repo, prisma).execute({ listingId: "listing-1", userId: "user-1" }).catch((err: unknown) => err);
    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toMatchObject({ code: "PHOTO_MINIMUM_REQUIRED", details: { minimum: 3 } });
    expect(repo.priceTmtWrites).toEqual([]);
  });

  describe("stored contact phone (ADR-0081)", () => {
    const DAY = 24 * 60 * 60 * 1000;

    async function republishError(contactPhone: string | undefined): Promise<unknown> {
      if (contactPhone === undefined) seedListing(repo, "archived", {}, { phone: false });
      else seedListing(repo, "archived", { contactPhone });
      return makeUseCase(repo, prisma)
        .execute({ listingId: "listing-1", userId: "user-1" })
        .catch((err: unknown) => err);
    }

    function expectUnchanged(): void {
      expect(repo.listings[0]?.status).toBe("archived");
      expect(repo.priceTmtWrites).toEqual([]);
      expect(prisma.auditLogs).toEqual([]);
    }

    it("republishes with a number the seller confirmed in the last 7 days", async () => {
      contactPhones.confirm("user-1", "+99365123456", new Date(Date.now() - DAY));
      seedListing(repo, "archived", { contactPhone: "+99365123456" });

      const result = await makeUseCase(repo, prisma).execute({
        listingId: "listing-1",
        userId: "user-1",
      });

      expect(result.listing.status).toBe("active");
    });

    it("judges the 7 days by the injected clock", async () => {
      const confirmedAt = new Date("2026-01-01T00:00:00Z");
      contactPhones.confirm("user-1", "+99365123456", confirmedAt);
      clock = { now: () => new Date(confirmedAt.getTime() + 7 * DAY - 1) };

      expect(await republishError("+99365123456")).not.toBeInstanceOf(Error);
      expect(repo.listings[0]?.status).toBe("active");
    });

    it("answers CONTACT_PHONE_REQUIRED when the Listing stores no number", async () => {
      const error = await republishError(undefined);

      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toMatchObject({
        code: "CONTACT_PHONE_REQUIRED",
      });
      expectUnchanged();
    });

    it("answers CONTACT_PHONE_NOT_CONFIRMED / expired after the number's 7 days", async () => {
      contactPhones.confirm("user-1", "+99365123456", new Date(Date.now() - 8 * DAY));

      const error = await republishError("+99365123456");

      expect((error as BadRequestException).getResponse()).toMatchObject({
        code: "CONTACT_PHONE_NOT_CONFIRMED",
        details: { reason: "expired" },
      });
      expectUnchanged();
    });

    it("answers CONTACT_PHONE_NOT_CONFIRMED / not_confirmed for a number never confirmed", async () => {
      const error = await republishError("+99365123456");

      expect((error as BadRequestException).getResponse()).toMatchObject({
        code: "CONTACT_PHONE_NOT_CONFIRMED",
        details: { reason: "not_confirmed" },
      });
      expectUnchanged();
    });
  });

  it("republishes an archived listing", async () => {
    seedListing(repo, "archived");

    const uc = makeUseCase(repo, prisma);
    const result = await uc.execute({ listingId: "listing-1", userId: "user-1" });

    expect(result.listing.status).toBe("active");
    expect(result.listing.soldAt).toBeUndefined();
    expect(prisma.auditLogs).toHaveLength(1);
    expect(prisma.auditLogs[0]).toMatchObject({
      action: "listing.republished",
      targetId: "listing-1",
    });
  });

  it("keeps the original publish date, so relisting is no bump to the top of Newest (#871)", async () => {
    const firstPublishedAt = new Date("2026-05-01T00:00:00Z");
    const archivedAt = new Date("2026-05-10T00:00:00Z");
    const relistedAt = new Date("2026-05-20T09:30:00Z");
    seedListing(repo, "archived", {
      publishedAt: firstPublishedAt,
      soldAt: new Date("2026-05-08T00:00:00Z"),
      updatedAt: archivedAt,
    });
    clock = { now: () => relistedAt };

    const { listing } = await makeUseCase(repo, prisma).execute({
      listingId: "listing-1",
      userId: "user-1",
    });

    expect(listing.status).toBe("active");
    expect(listing.soldAt).toBeUndefined();
    expect(listing.publishedAt).toEqual(firstPublishedAt);
    expect(listing.updatedAt).toEqual(relistedAt);
    expect(repo.listings[0]?.publishedAt).toEqual(firstPublishedAt);
    expect(prisma.auditLogs).toEqual([
      expect.objectContaining({
        action: "listing.republished",
        targetId: "listing-1",
        details: { previousArchivedAt: archivedAt.toISOString() },
      }),
    ]);
  });

  it("writes priceTmt at today's rate when a foreign-currency Listing returns", async () => {
    seedListing(repo, "archived", { priceAmount: 10000, priceCurrency: "USD" });
    const rates = new FakeExchangeRatePort();
    rates.rates["USD:TMT"] = 19.5;

    await makeUseCase(repo, prisma, rates).execute({ listingId: "listing-1", userId: "user-1" });

    expect(repo.priceTmtWrites).toEqual([195000]);
  });

  it("writes a TMT price as its own priceTmt", async () => {
    seedListing(repo, "archived");

    await makeUseCase(repo, prisma).execute({ listingId: "listing-1", userId: "user-1" });

    expect(repo.priceTmtWrites).toEqual([100000]);
  });

  it("rejects with EXCHANGE_RATE_MISSING when the currency has no rate", async () => {
    seedListing(repo, "archived", { priceAmount: 10000, priceCurrency: "AED" });

    await expect(
      makeUseCase(repo, prisma).execute({ listingId: "listing-1", userId: "user-1" }),
    ).rejects.toThrow(BadRequestException);
    expect(repo.priceTmtWrites).toEqual([]);
    expect(repo.listings[0]?.status).toBe("archived");
  });

  it("throws NotFoundException for non-existent listing", async () => {
    const uc = makeUseCase(repo, prisma);
    await expect(
      uc.execute({ listingId: "missing", userId: "user-1" }),
    ).rejects.toThrow(NotFoundException);
  });

  it("throws ForbiddenException for another user's listing", async () => {
    seedListing(repo, "archived");

    const uc = makeUseCase(repo, prisma);
    await expect(
      uc.execute({ listingId: "listing-1", userId: "user-2" }),
    ).rejects.toThrow(ForbiddenException);
  });

  it("throws NotFoundException for soft-deleted listing", async () => {
    seedListing(repo, "archived");
    repo.listings = repo.listings.map((l) => (l.id === "listing-1" ? l.softDelete(new Date()) : l));

    const uc = makeUseCase(repo, prisma);
    await expect(
      uc.execute({ listingId: "listing-1", userId: "user-1" }),
    ).rejects.toThrow(NotFoundException);
  });

  it("throws DomainError when trying to republish an active listing", async () => {
    seedListing(repo, "active");

    const uc = makeUseCase(repo, prisma);
    await expect(
      uc.execute({ listingId: "listing-1", userId: "user-1" }),
    ).rejects.toThrow();
  });
});
