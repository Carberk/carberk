import { BadRequestException } from "@nestjs/common";
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { CardPhotos } from "../domain/CardPhotos";
import { ListMyListings } from "./ListMyListings";
import type { ListingCard, ListingCardReadPort } from "../domain/ports/ListingCardReadPort";

class FakeListingCardReadPort implements ListingCardReadPort {
  summaries: ListingCard[] = [];

  async getCardPhotos(): Promise<Map<string, CardPhotos>> {
    return new Map();
  }
  nextCursor?: { timestamp: string; id: string };

  async getVisibleCards(_ids: string[]): Promise<ListingCard[]> {
    return this.summaries;
  }

  async getOwnerCards(): Promise<{
    items: ListingCard[];
    nextCursor?: { timestamp: string; id: string };
  }> {
    const result: { items: ListingCard[]; nextCursor?: { timestamp: string; id: string } } = {
      items: this.summaries,
    };
    if (this.nextCursor !== undefined) {
      result.nextCursor = this.nextCursor;
    }
    return result;
  }
}

function makeUseCase(port?: FakeListingCardReadPort) {
  return new ListMyListings(port ?? new FakeListingCardReadPort());
}

describe("ListMyListings", () => {
  let port: FakeListingCardReadPort;

  beforeEach(() => {
    port = new FakeListingCardReadPort();
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
      galleryKeys: [],
      photoCount: 0,
      allowCalls: true,
      allowChat: true,
      ...overrides,
    };
    port.summaries.push(summary);
    return summary;
  }

  it("sends the owner's card photo ThumbHashes beside their keys", async () => {
    seedSummary({ coverMediaKey: "a", photoKeys: ["a", "b"], photoThumbHashes: ["1fsDBYCIiIiHiIdweIeHh4d4cIgH", null], galleryKeys: ["a", "b"], photoCount: 2 });

    const result = await makeUseCase(port).execute({ userId: "user-1" });

    expect(result.items[0]).toMatchObject({ photoThumbHashes: ["1fsDBYCIiIiHiIdweIeHh4d4cIgH", null] });
  });

  it("returns owner's listings", async () => {
    seedSummary();
    const uc = makeUseCase(port);
    const result = await uc.execute({ userId: "user-1" });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.id).toBe("listing-1");
  });

  it("returns photoKeys and photoCount on owner summaries", async () => {
    seedSummary({ photoKeys: ["a", "b"], photoCount: 3 });
    const uc = makeUseCase(port);
    const result = await uc.execute({ userId: "user-1" });

    expect(result.items[0]!.photoKeys).toEqual(["a", "b"]);
    expect(result.items[0]!.photoCount).toBe(3);
  });

  it("does not return a per-Listing seller trust signal on owner summaries", async () => {
    seedSummary();
    const uc = makeUseCase(port);
    const result = await uc.execute({ userId: "user-1" });

    expect(result.items[0]!).not.toHaveProperty("sellerTrust");
  });

  it("returns encoded nextCursor", async () => {
    seedSummary();
    port.nextCursor = { timestamp: "2026-05-01T00:00:00Z", id: "listing-1" };

    const uc = makeUseCase(port);
    const result = await uc.execute({ userId: "user-1" });

    expect(result.nextCursor).not.toBeNull();
    expect(typeof result.nextCursor).toBe("string");
  });

  it("returns null nextCursor when no more pages", async () => {
    seedSummary();
    const uc = makeUseCase(port);
    const result = await uc.execute({ userId: "user-1" });

    expect(result.nextCursor).toBeNull();
  });

  it("rejects a malformed or forged cursor with a 400 and never reads", async () => {
    const forgedTimestamp = Buffer.from(
      JSON.stringify({
        timestamp: "not-a-date",
        id: "00000000-0000-0000-0000-000000000001",
      }),
      "utf8",
    ).toString("base64url");
    const readSpy = vi.spyOn(port, "getOwnerCards");

    const uc = makeUseCase(port);

    for (const cursor of ["not-a-cursor", forgedTimestamp]) {
      await expect(uc.execute({ userId: "user-1", cursor })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      await expect(uc.execute({ userId: "user-1", cursor })).rejects.toMatchObject({
        response: {
          code: "VALIDATION_FAILED",
          details: { reason: "INVALID_CURSOR" },
        },
      });
    }
    expect(readSpy).not.toHaveBeenCalled();
  });
});
