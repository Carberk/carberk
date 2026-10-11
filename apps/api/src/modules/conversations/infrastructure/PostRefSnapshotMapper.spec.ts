import { describe, it, expect } from "vitest";

import {
  buildPostRefSnapshot,
  isListingReferenceActive,
  availabilityMapForListingSummaries,
  withAvailabilityFallback,
} from "./PostRefSnapshotMapper";
import type { ListingSummary } from "../../listings/domain/ports/ListingsReadPort";

function makeListing(overrides?: Partial<ListingSummary>): ListingSummary {
  return {
    id: "listing-1",
    sellerId: "seller-1",
    status: "active",
    brandId: "brand-1",
    modelId: "model-1",
    year: 2021,
    priceAmount: 200000,
    priceCurrency: "TMT",
    displayPriceTmt: 200000,
    coverMediaKey: "cover.webp",
    cityId: "city-1",
    publishedAt: new Date("2026-05-01T00:00:00Z"),
    allowChat: true,
    ...overrides,
  };
}

describe("buildPostRefSnapshot", () => {
  it("builds a full snapshot from a listing summary", () => {
    const listing = makeListing();
    const snapshot = buildPostRefSnapshot(listing);

    expect(snapshot).toEqual({
      listingId: "listing-1",
      brandId: "brand-1",
      modelId: "model-1",
      year: 2021,
      displayPriceTmt: 200000,
      priceCurrency: "TMT",
      coverMediaKey: "cover.webp",
      status: "active",
    });
  });

  it("omits optional fields when they are missing", () => {
    const listing = makeListing();
    const stripped: Partial<ListingSummary> = { ...listing };
    delete stripped.year;
    delete stripped.coverMediaKey;
    const snapshot = buildPostRefSnapshot(stripped as ListingSummary);

    expect(snapshot.year).toBeUndefined();
    expect(snapshot.coverMediaKey).toBeUndefined();
  });
});

describe("isListingReferenceActive", () => {
  it("returns true for active listings", () => {
    expect(isListingReferenceActive(makeListing())).toBe(true);
  });

  it.each([
    { status: "sold" as const },
    { status: "archived" as const },
    { status: "banned" as const },
  ])("returns false for $status listings", (overrides) => {
    expect(isListingReferenceActive(makeListing(overrides))).toBe(false);
  });

  it("returns false for missing listings", () => {
    expect(isListingReferenceActive(null)).toBe(false);
    expect(isListingReferenceActive(undefined)).toBe(false);
  });
});

describe("availabilityMapForListingSummaries", () => {
  it("maps each listing to active availability", () => {
    const map = availabilityMapForListingSummaries([
      makeListing({ id: "active-1", status: "active" }),
      makeListing({ id: "sold-1", status: "sold" }),
    ]);

    expect(map.get("active-1")).toBe(true);
    expect(map.get("sold-1")).toBe(false);
  });
});

describe("withAvailabilityFallback", () => {
  const metadata = buildPostRefSnapshot(makeListing({ id: "listing-1" }));

  it("marks available when the listing is active", () => {
    const map = new Map([["listing-1", true]]);
    const result = withAvailabilityFallback(metadata, map);

    expect(result.available).toBe(true);
  });

  it("marks unavailable when the listing is no longer active", () => {
    const map = new Map([["listing-1", false]]);
    const result = withAvailabilityFallback(metadata, map);

    expect(result.available).toBe(false);
  });

  it("falls back to unavailable when the listing is absent from the map", () => {
    const map = new Map<string, boolean>();
    const result = withAvailabilityFallback(metadata, map);

    expect(result.available).toBe(false);
  });
});
