import type { z } from "zod";
import { describe, it, expect, beforeEach } from "vitest";
import { NotFoundException, BadRequestException } from "@nestjs/common";

import { Listing } from "../domain/Listing";
import type { ListingRepository } from "../domain/ports/ListingRepository";
import type { ListingEventPublisher } from "../domain/ports/ListingEventPublisher";
import type { ExchangeRatePort } from "../domain/ports/ExchangeRatePort";
import { ListingsSchemas } from "@auto-tm/contracts";

import { EditListing } from "./EditListing";
import { InMemoryContactPhones } from "./testing/InMemoryContactPhones";

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

class FakeEventPublisher implements ListingEventPublisher {
  events: Array<{ event: string; listingId: string }> = [];

  async emit(payload: { event: string; listingId: string }): Promise<void> {
    this.events.push(payload);
  }
}

class FakeExchangeRatePort implements ExchangeRatePort {
  rates: Record<string, number> = {};

  async getRate(from: string, to: string): Promise<number> {
    return this.rates[`${from}:${to}`] ?? 0;
  }

  async listAll() {
    return Object.entries(this.rates).map(([key, rate]) => {
      const [fromCurrency, toCurrency] = key.split(":") as ["TMT" | "USD" | "AED", "TMT" | "USD" | "AED"];
      return { fromCurrency, toCurrency, rate, updatedAt: new Date() };
    });
  }

  seed(from: string, to: string, rate: number) {
    this.rates[`${from}:${to}`] = rate;
  }
}

/** Sign-in and confirmed phones the next `makeUseCase()` checks a new number against. */
let contactPhones = new InMemoryContactPhones();
/** The use-case clock; real time unless a test fixes it. */
let clock = { now: () => new Date() };

function makeUseCase(
  repo?: FakeListingRepository,
  prisma?: FakePrisma,
  events?: FakeEventPublisher,
  exchangeRates?: FakeExchangeRatePort,
) {
  return new EditListing(
    repo ?? new FakeListingRepository(),
    (prisma ?? new FakePrisma()) as unknown as ConstructorParameters<typeof EditListing>[1],
    exchangeRates ?? new FakeExchangeRatePort(),
    events ?? new FakeEventPublisher(),
    contactPhones.policy,
    clock,
  );
}

function seedActiveListing(
  repo: FakeListingRepository,
  overrides?: Partial<Parameters<typeof Listing.create>[0]>,
  { answered = true, phone = true }: { answered?: boolean; phone?: boolean } = {},
) {
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
    ...(phone && { contactPhone: "+99361234567" }),
    allowCalls: true,
    allowChat: true,
    publishedAt: new Date("2026-05-01T00:00:00Z"),
    ...(answered && { conditionDisclosure: { damaged: false } }),
    ...overrides,
  });
  repo.listings.push(listing);
  return listing;
}

describe("EditListing", () => {
  let repo: FakeListingRepository;
  let prisma: FakePrisma;
  let events: FakeEventPublisher;
  let exchangeRates: FakeExchangeRatePort;

  beforeEach(() => {
    repo = new FakeListingRepository();
    prisma = new FakePrisma();
    events = new FakeEventPublisher();
    exchangeRates = new FakeExchangeRatePort();
    contactPhones = new InMemoryContactPhones();
    clock = { now: () => new Date() };
  });

  it("edits a published Listing's price without validating or changing its legacy VIN", async () => {
    seedActiveListing(repo, { vin: "Corolla" });
    const { listing } = await makeUseCase(repo, prisma, events, exchangeRates).execute({
      listingId: "listing-1", userId: "user-1", patch: { priceAmount: 120000 },
    });
    expect(listing.priceAmount).toBe(120000);
    expect(listing.vin).toBe("Corolla");
  });

  it("refuses two photos without changing the stored Listing", async () => {
    seedActiveListing(repo);
    prisma.photoCount = 2;
    const error = await makeUseCase(repo, prisma, events, exchangeRates).execute({ listingId: "listing-1", userId: "user-1", patch: { description: "Updated" } }).catch((err: unknown) => err);
    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toMatchObject({ code: "PHOTO_MINIMUM_REQUIRED", details: { minimum: 3 } });
    expect(repo.priceTmtWrites).toEqual([]);
  });

  describe("contact phone (ADR-0081)", () => {
    const DAY = 24 * 60 * 60 * 1000;

    async function editError(
      patch: Parameters<EditListing["execute"]>[0]["patch"],
    ): Promise<unknown> {
      return makeUseCase(repo, prisma, events, exchangeRates)
        .execute({ listingId: "listing-1", userId: "user-1", patch })
        .catch((err: unknown) => err);
    }

    it("changes the number to one the seller confirmed in the last 7 days", async () => {
      seedActiveListing(repo);
      contactPhones.confirm("user-1", "+99365123456", new Date(Date.now() - DAY));

      const { listing } = await makeUseCase(repo, prisma, events, exchangeRates).execute({
        listingId: "listing-1",
        userId: "user-1",
        patch: { contactPhone: "+99365123456" },
      });

      expect(listing.contactPhone).toBe("+99365123456");
    });

    it.each([
      ["never confirmed", undefined, "not_confirmed"],
      ["past its 7 days", 7 * DAY + 1000, "expired"],
    ])("refuses a change to a number %s and changes nothing", async (_name, age, reason) => {
      seedActiveListing(repo);
      if (age !== undefined) {
        contactPhones.confirm("user-1", "+99365123456", new Date(Date.now() - age));
      }

      const error = await editError({ contactPhone: "+99365123456", priceAmount: 1 });

      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toMatchObject({
        code: "CONTACT_PHONE_NOT_CONFIRMED",
        details: { reason },
      });
      expect(repo.listings[0]?.contactPhone).toBe("+99361234567");
      expect(repo.listings[0]?.priceAmount).toBe(100000);
      expect(events.events).toEqual([]);
    });

    it("judges the 7 days by the injected clock", async () => {
      seedActiveListing(repo);
      const confirmedAt = new Date("2026-01-01T00:00:00Z");
      contactPhones.confirm("user-1", "+99365123456", confirmedAt);
      clock = { now: () => new Date(confirmedAt.getTime() + 7 * DAY - 1) };

      const { listing } = await makeUseCase(repo, prisma, events, exchangeRates).execute({
        listingId: "listing-1",
        userId: "user-1",
        patch: { contactPhone: "+99365123456" },
      });

      expect(listing.contactPhone).toBe("+99365123456");
      expect(listing.updatedAt).toEqual(clock.now());
    });

    it("keeps a stored number past its 7 days when the edit leaves it out or resends it", async () => {
      seedActiveListing(repo, { contactPhone: "+99365123456" });
      contactPhones.confirm("user-1", "+99365123456", new Date(Date.now() - 30 * DAY));
      const uc = makeUseCase(repo, prisma, events, exchangeRates);

      await uc.execute({ listingId: "listing-1", userId: "user-1", patch: { description: "New" } });
      await uc.execute({
        listingId: "listing-1",
        userId: "user-1",
        patch: { contactPhone: "+99365123456", description: "Newer" },
      });

      expect(repo.listings[0]?.contactPhone).toBe("+99365123456");
      expect(repo.listings[0]?.description).toBe("Newer");
    });

    it.each([
      ["turns calls off", { allowCalls: false, allowChat: true }],
      ["turns chat off", { allowCalls: true, allowChat: false }],
      ["resends both unchanged", { allowCalls: true, allowChat: true, priceAmount: 90000 }],
    ])("lets a Listing whose number was cleared take an edit that %s", async (_name, patch) => {
      seedActiveListing(repo, {}, { phone: false });

      const { listing } = await makeUseCase(repo, prisma, events, exchangeRates).execute({
        listingId: "listing-1",
        userId: "user-1",
        patch,
      });

      expect(listing.allowCalls).toBe(patch.allowCalls);
      expect(listing.allowChat).toBe(patch.allowChat);
      expect(listing.contactPhone).toBeUndefined();
    });

    it("checks a number set on a Listing whose number was cleared", async () => {
      seedActiveListing(repo, {}, { phone: false });

      const error = await editError({ contactPhone: "+99365123456", allowCalls: false });

      expect((error as BadRequestException).getResponse()).toMatchObject({
        code: "CONTACT_PHONE_NOT_CONFIRMED",
        details: { reason: "not_confirmed" },
      });
      expect(repo.listings[0]?.contactPhone).toBeUndefined();
      expect(repo.listings[0]?.allowCalls).toBe(true);
    });

    it("lets a Listing whose number was cleared take other edits and a confirmed number", async () => {
      seedActiveListing(repo, {}, { phone: false });
      const uc = makeUseCase(repo, prisma, events, exchangeRates);

      await uc.execute({ listingId: "listing-1", userId: "user-1", patch: { description: "New" } });
      await uc.execute({
        listingId: "listing-1",
        userId: "user-1",
        patch: { contactPhone: "+99361234567", allowCalls: false },
      });

      expect(repo.listings[0]?.contactPhone).toBe("+99361234567");
      expect(repo.listings[0]?.allowCalls).toBe(false);
    });
  });

  it("edits description successfully without writing AuditLog", async () => {
    seedActiveListing(repo);

    const uc = makeUseCase(repo, prisma, events, exchangeRates);
    const result = await uc.execute({
      listingId: "listing-1",
      userId: "user-1",
      patch: { description: "Updated description" },
    });

    expect(result.listing.description).toBe("Updated description");
    expect(prisma.auditLogs).toHaveLength(0);
    expect(events.events).toHaveLength(1);
    expect(events.events[0]).toMatchObject({
      event: "ListingUpdated",
      listingId: "listing-1",
    });
  });

  it("rejects changing brandId with LISTING_FIELD_LOCKED", async () => {
    seedActiveListing(repo);

    const uc = makeUseCase(repo, prisma, events, exchangeRates);
    await expect(
      uc.execute({
        listingId: "listing-1",
        userId: "user-1",
        patch: { brandId: "brand-2" } as z.infer<typeof ListingsSchemas.EditListingRequestSchema>,
      }),
    ).rejects.toThrow(BadRequestException);

    try {
      await uc.execute({
        listingId: "listing-1",
        userId: "user-1",
        patch: { brandId: "brand-2" } as z.infer<typeof ListingsSchemas.EditListingRequestSchema>,
      });
    } catch (err) {
      const ex = err as BadRequestException;
      const response = ex.getResponse() as Record<string, unknown>;
      expect(response['code']).toBe("LISTING_FIELD_LOCKED");
      expect(response['details']).toMatchObject({ field: "brandId" });
    }
  });

  it("rejects changing modelId with LISTING_FIELD_LOCKED", async () => {
    seedActiveListing(repo);

    const uc = makeUseCase(repo, prisma, events, exchangeRates);
    try {
      await uc.execute({
        listingId: "listing-1",
        userId: "user-1",
        patch: { modelId: "model-2" } as z.infer<typeof ListingsSchemas.EditListingRequestSchema>,
      });
      expect.fail("should have thrown");
    } catch (err) {
      const ex = err as BadRequestException;
      const response = ex.getResponse() as Record<string, unknown>;
      expect(response['code']).toBe("LISTING_FIELD_LOCKED");
      expect(response['details']).toMatchObject({ field: "modelId" });
    }
  });

  it("rejects changing generationId with LISTING_FIELD_LOCKED", async () => {
    seedActiveListing(repo, { generationId: "gen-1" });

    const uc = makeUseCase(repo, prisma, events, exchangeRates);
    try {
      await uc.execute({
        listingId: "listing-1",
        userId: "user-1",
        patch: { generationId: "gen-2" } as z.infer<typeof ListingsSchemas.EditListingRequestSchema>,
      });
      expect.fail("should have thrown");
    } catch (err) {
      const ex = err as BadRequestException;
      const response = ex.getResponse() as Record<string, unknown>;
      expect(response['code']).toBe("LISTING_FIELD_LOCKED");
      expect(response['details']).toMatchObject({ field: "generationId" });
    }
  });

  it("rejects changing year with LISTING_FIELD_LOCKED", async () => {
    seedActiveListing(repo, { year: 2020 });

    const uc = makeUseCase(repo, prisma, events, exchangeRates);
    try {
      await uc.execute({
        listingId: "listing-1",
        userId: "user-1",
        patch: { year: 2021 } as z.infer<typeof ListingsSchemas.EditListingRequestSchema>,
      });
      expect.fail("should have thrown");
    } catch (err) {
      const ex = err as BadRequestException;
      const response = ex.getResponse() as Record<string, unknown>;
      expect(response['code']).toBe("LISTING_FIELD_LOCKED");
      expect(response['details']).toMatchObject({ field: "year" });
    }
  });

  it("rejects changing vin with LISTING_FIELD_LOCKED", async () => {
    seedActiveListing(repo, { vin: "VIN123" });

    const uc = makeUseCase(repo, prisma, events, exchangeRates);
    try {
      await uc.execute({
        listingId: "listing-1",
        userId: "user-1",
        patch: { vin: "VIN456" } as z.infer<typeof ListingsSchemas.EditListingRequestSchema>,
      });
      expect.fail("should have thrown");
    } catch (err) {
      const ex = err as BadRequestException;
      const response = ex.getResponse() as Record<string, unknown>;
      expect(response['code']).toBe("LISTING_FIELD_LOCKED");
      expect(response['details']).toMatchObject({ field: "vin" });
    }
  });

  it("writes price_changed AuditLog when priceAmount changes", async () => {
    seedActiveListing(repo);

    const uc = makeUseCase(repo, prisma, events, exchangeRates);
    await uc.execute({
      listingId: "listing-1",
      userId: "user-1",
      patch: { priceAmount: 200000 },
    });

    expect(prisma.auditLogs).toHaveLength(1);
    expect(prisma.auditLogs[0]).toMatchObject({
      action: "listing.price_changed",
      targetId: "listing-1",
      details: {
        oldPriceAmount: 100000,
        oldPriceCurrency: "TMT",
        newPriceAmount: 200000,
        newPriceCurrency: "TMT",
      },
    });
  });

  it("writes price_changed AuditLog when priceCurrency changes", async () => {
    seedActiveListing(repo);
    exchangeRates.seed("USD", "TMT", 3.5);

    const uc = makeUseCase(repo, prisma, events, exchangeRates);
    await uc.execute({
      listingId: "listing-1",
      userId: "user-1",
      patch: { priceCurrency: "USD" },
    });

    expect(prisma.auditLogs).toHaveLength(1);
    expect(prisma.auditLogs[0]).toMatchObject({
      action: "listing.price_changed",
      details: {
        oldPriceAmount: 100000,
        oldPriceCurrency: "TMT",
        newPriceAmount: 100000,
        newPriceCurrency: "USD",
      },
    });
  });

  it("writes price_changed AuditLog when both amount and currency change", async () => {
    seedActiveListing(repo);
    exchangeRates.seed("USD", "TMT", 3.5);

    const uc = makeUseCase(repo, prisma, events, exchangeRates);
    await uc.execute({
      listingId: "listing-1",
      userId: "user-1",
      patch: { priceAmount: 30000, priceCurrency: "USD" },
    });

    expect(prisma.auditLogs).toHaveLength(1);
    expect(prisma.auditLogs[0]).toMatchObject({
      action: "listing.price_changed",
      details: {
        oldPriceAmount: 100000,
        oldPriceCurrency: "TMT",
        newPriceAmount: 30000,
        newPriceCurrency: "USD",
      },
    });
  });

  it("does NOT write AuditLog for non-price edits", async () => {
    seedActiveListing(repo);

    const uc = makeUseCase(repo, prisma, events, exchangeRates);
    await uc.execute({
      listingId: "listing-1",
      userId: "user-1",
      patch: { description: "New description", mileageKm: 50000 },
    });

    expect(prisma.auditLogs).toHaveLength(0);
  });

  it("rejects allowCalls=false and allowChat=false with CONTACT_METHOD_REQUIRED", async () => {
    seedActiveListing(repo);

    const uc = makeUseCase(repo, prisma, events, exchangeRates);
    try {
      await uc.execute({
        listingId: "listing-1",
        userId: "user-1",
        patch: { allowCalls: false, allowChat: false },
      });
      expect.fail("should have thrown");
    } catch (err) {
      const ex = err as BadRequestException;
      const response = ex.getResponse() as Record<string, unknown>;
      expect(response['code']).toBe("CONTACT_METHOD_REQUIRED");
    }
  });

  it("rejects changing priceCurrency to AED without exchange rate with EXCHANGE_RATE_MISSING", async () => {
    seedActiveListing(repo);

    const uc = makeUseCase(repo, prisma, events, exchangeRates);
    try {
      await uc.execute({
        listingId: "listing-1",
        userId: "user-1",
        patch: { priceCurrency: "AED" },
      });
      expect.fail("should have thrown");
    } catch (err) {
      const ex = err as BadRequestException;
      const response = ex.getResponse() as Record<string, unknown>;
      expect(response['code']).toBe("EXCHANGE_RATE_MISSING");
    }
  });

  it("writes priceTmt with the saved TMT price", async () => {
    const repo = new FakeListingRepository();
    seedActiveListing(repo);

    await makeUseCase(repo).execute({
      listingId: "listing-1",
      userId: "user-1",
      patch: { priceAmount: 120000 },
    });

    expect(repo.priceTmtWrites).toEqual([120000]);
  });

  it("re-derives priceTmt at the current rate even when the price is unchanged", async () => {
    const repo = new FakeListingRepository();
    const rates = new FakeExchangeRatePort();
    rates.seed("USD", "TMT", 19.5);
    seedActiveListing(repo, { priceAmount: 10000, priceCurrency: "USD" });

    await makeUseCase(repo, undefined, undefined, rates).execute({
      listingId: "listing-1",
      userId: "user-1",
      patch: { description: "Fresh tyres" },
    });

    expect(repo.priceTmtWrites).toEqual([195000]);
  });

  it("returns 404 for non-owner", async () => {
    seedActiveListing(repo);

    const uc = makeUseCase(repo, prisma, events, exchangeRates);
    await expect(
      uc.execute({
        listingId: "listing-1",
        userId: "user-2",
        patch: { description: "Should not work" },
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it("returns 404 for soft-deleted listing", async () => {
    const listing = seedActiveListing(repo);
    repo.listings[0] = listing.softDelete(new Date());

    const uc = makeUseCase(repo, prisma, events, exchangeRates);
    await expect(
      uc.execute({
        listingId: "listing-1",
        userId: "user-1",
        patch: { description: "Should not work" },
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it("allows editing seller terms (acceptsExchange, installmentAvailable)", async () => {
    seedActiveListing(repo);

    const uc = makeUseCase(repo, prisma, events, exchangeRates);
    const result = await uc.execute({
      listingId: "listing-1",
      userId: "user-1",
      patch: { acceptsExchange: true, installmentAvailable: true },
    });

    expect(result.listing.acceptsExchange).toBe(true);
    expect(result.listing.installmentAvailable).toBe(true);
    expect(prisma.auditLogs).toHaveLength(0);
  });

  it.each([true, false])("saves damaged: %s with Known issues", async (damaged) => {
    seedActiveListing(repo);

    const uc = makeUseCase(repo, prisma, events, exchangeRates);
    const result = await uc.execute({
      listingId: "listing-1",
      userId: "user-1",
      patch: { conditionDisclosure: { damaged, knownIssuesText: "Minor scratches" } },
    });

    expect(result.listing.conditionDisclosure).toEqual({
      damaged,
      knownIssuesText: "Minor scratches",
    });
    expect(prisma.auditLogs).toHaveLength(0);
  });

  it("clears existing Known issues when the disclosure patch omits the text", async () => {
    seedActiveListing(repo, {
      conditionDisclosure: { damaged: false, knownIssuesText: "Old scratch" },
    });

    const uc = makeUseCase(repo, prisma, events, exchangeRates);
    const result = await uc.execute({
      listingId: "listing-1",
      userId: "user-1",
      patch: { conditionDisclosure: { damaged: true } },
    });

    expect(result.listing.conditionDisclosure).toEqual({
      damaged: true,
    });
  });

  it("keeps the existing Damaged answer when the patch does not touch the disclosure", async () => {
    seedActiveListing(repo, { conditionDisclosure: { damaged: true } });

    const uc = makeUseCase(repo, prisma, events, exchangeRates);
    const result = await uc.execute({
      listingId: "listing-1",
      userId: "user-1",
      patch: { description: "Updated" },
    });

    expect(result.listing.conditionDisclosure).toEqual({ damaged: true });
  });

  it("rejects an edit of an unanswered Listing that does not answer Damaged", async () => {
    seedActiveListing(repo, {}, { answered: false });

    const uc = makeUseCase(repo, prisma, events, exchangeRates);
    const error = await uc
      .execute({
        listingId: "listing-1",
        userId: "user-1",
        patch: { description: "Updated" },
      })
      .catch((err: unknown) => err);

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toMatchObject({
      code: "DAMAGED_REQUIRED",
      details: { field: "conditionDisclosure.damaged" },
    });
    expect(repo.listings[0]!.description).not.toBe("Updated");
    expect(repo.listings[0]!.conditionDisclosure).toBeUndefined();
  });

  // The HTTP contract rejects this patch earlier; the guard still holds for
  // any other caller of the use-case.
  it("rejects a disclosure patch without damaged on an unanswered Listing", async () => {
    seedActiveListing(repo, {}, { answered: false });

    const uc = makeUseCase(repo, prisma, events, exchangeRates);
    const error = await uc
      .execute({
        listingId: "listing-1",
        userId: "user-1",
        patch: {
          conditionDisclosure: { knownIssuesText: "Rust" } as unknown as {
            damaged: boolean;
            knownIssuesText?: string;
          },
        },
      })
      .catch((err: unknown) => err);

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toMatchObject({
      code: "DAMAGED_REQUIRED",
      details: { field: "conditionDisclosure.damaged" },
    });
    expect(repo.listings[0]!.conditionDisclosure).toBeUndefined();
  });

  describe("a New Listing (ADR-0080)", () => {
    it("stores not damaged when a New Listing has no answer", async () => {
      seedActiveListing(repo, { condition: "new" }, { answered: false });

      const uc = makeUseCase(repo, prisma, events, exchangeRates);
      const result = await uc.execute({
        listingId: "listing-1",
        userId: "user-1",
        patch: { description: "Updated" },
      });

      expect(result.listing.description).toBe("Updated");
      expect(result.listing.conditionDisclosure).toEqual({ damaged: false });
    });

    it("keeps Known issues on a New Listing", async () => {
      seedActiveListing(repo, { condition: "new" });

      const uc = makeUseCase(repo, prisma, events, exchangeRates);
      const result = await uc.execute({
        listingId: "listing-1",
        userId: "user-1",
        patch: { conditionDisclosure: { damaged: false, knownIssuesText: "Paint chip" } },
      });

      expect(result.listing.conditionDisclosure).toEqual({
        damaged: false,
        knownIssuesText: "Paint chip",
      });
    });

    it.each([
      [
        "sends damaged: true for a New Listing",
        { condition: "new" as const },
        { conditionDisclosure: { damaged: true } },
      ],
      [
        "changes Condition to New on a damaged Listing",
        { condition: "used" as const, mileageKm: 1000, conditionDisclosure: { damaged: true } },
        { condition: "new" as const },
      ],
    ])("refuses an edit that %s", async (_name, stored, patch) => {
      seedActiveListing(repo, stored);

      const uc = makeUseCase(repo, prisma, events, exchangeRates);
      const error = await uc
        .execute({ listingId: "listing-1", userId: "user-1", patch })
        .catch((err: unknown) => err);

      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toMatchObject({
        code: "DAMAGED_NOT_ALLOWED_FOR_NEW",
        message: "A New car cannot be damaged. Choose Used for a damaged car.",
        details: { field: "conditionDisclosure.damaged" },
      });
      expect(repo.listings[0]!.condition).toBe(stored.condition);
    });

    it("still requires the answer for a Used Listing", async () => {
      seedActiveListing(repo, { condition: "used", mileageKm: 1000 }, { answered: false });

      const uc = makeUseCase(repo, prisma, events, exchangeRates);
      const error = await uc
        .execute({ listingId: "listing-1", userId: "user-1", patch: { description: "Updated" } })
        .catch((err: unknown) => err);

      expect((error as BadRequestException).getResponse()).toMatchObject({
        code: "DAMAGED_REQUIRED",
      });
    });
  });
});
