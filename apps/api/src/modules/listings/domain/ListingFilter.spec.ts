import { describe, it, expect } from "vitest";
import { ListingFilter } from "./ListingFilter";
import { LISTING_ERROR_CODES } from "./types";

describe("ListingFilter", () => {
  it("treats business seller choice as an applied filter and rejects unknown seller types", () => {
    expect(ListingFilter.create({ sellerType: "business" }).isEmpty()).toBe(false);
    expect(() => ListingFilter.create({ sellerType: "promoted" as "business" })).toThrowError(LISTING_ERROR_CODES.INVALID_FILTER_RANGE);
  });
  it("accepts empty criteria", () => {
    const filter = ListingFilter.create({});
    expect(filter.isEmpty()).toBe(true);
    expect(filter.toCriteria()).toEqual({});
  });

  it("accepts partial criteria (brandId only)", () => {
    const filter = ListingFilter.create({ brandId: "b1" });
    expect(filter.isEmpty()).toBe(false);
    expect(filter.toCriteria()).toEqual({ brandId: "b1" });
  });

  it("accepts partial criteria (priceMin only)", () => {
    const filter = ListingFilter.create({ priceMin: 10000 });
    expect(filter.isEmpty()).toBe(false);
    expect(filter.toCriteria()).toEqual({ priceMin: 10000 });
  });

  it("accepts partial criteria (year range)", () => {
    const filter = ListingFilter.create({ yearMin: 2010, yearMax: 2020 });
    expect(filter.isEmpty()).toBe(false);
    expect(filter.toCriteria()).toEqual({ yearMin: 2010, yearMax: 2020 });
  });

  it("accepts full criteria", () => {
    const criteria = {
      brandId: "b1",
      modelId: "m1",
      cityId: "c1",
      priceMin: 5000,
      priceMax: 50000,
      yearMin: 2015,
      yearMax: 2023,
      condition: "used" as const,
    };
    const filter = ListingFilter.create(criteria);
    expect(filter.isEmpty()).toBe(false);
    expect(filter.toCriteria()).toEqual(criteria);
  });

  it("rejects inverted price range", () => {
    expect(() => ListingFilter.create({ priceMin: 50000, priceMax: 5000 })).toThrowError(
      LISTING_ERROR_CODES.INVALID_PRICE,
    );
  });

  it("rejects inverted year range", () => {
    expect(() => ListingFilter.create({ yearMin: 2020, yearMax: 2010 })).toThrowError(
      LISTING_ERROR_CODES.INVALID_FILTER_RANGE,
    );
  });

  it("rejects condition outside new/used", () => {
    expect(() => ListingFilter.create({ condition: "damaged" as "new" })).toThrowError(
      LISTING_ERROR_CODES.INVALID_FILTER_RANGE,
    );
  });

  it("accepts condition new", () => {
    const filter = ListingFilter.create({ condition: "new" });
    expect(filter.toCriteria()).toEqual({ condition: "new" });
  });

  it("accepts condition used", () => {
    const filter = ListingFilter.create({ condition: "used" });
    expect(filter.toCriteria()).toEqual({ condition: "used" });
  });

  it("accepts equal priceMin and priceMax", () => {
    const filter = ListingFilter.create({ priceMin: 5000, priceMax: 5000 });
    expect(filter.toCriteria()).toEqual({ priceMin: 5000, priceMax: 5000 });
  });

  it("accepts equal yearMin and yearMax", () => {
    const filter = ListingFilter.create({ yearMin: 2020, yearMax: 2020 });
    expect(filter.toCriteria()).toEqual({ yearMin: 2020, yearMax: 2020 });
  });

  it("accepts modelIds under a brand", () => {
    const filter = ListingFilter.create({ brandId: "b1", modelIds: ["m1", "m2"] });
    expect(filter.toCriteria()).toEqual({ brandId: "b1", modelIds: ["m1", "m2"] });
    expect(filter.isEmpty()).toBe(false);
  });

  it("treats empty modelIds as no model filter", () => {
    const filter = ListingFilter.create({ brandId: "b1", modelIds: [] });
    expect(filter.isEmpty()).toBe(false);
    expect(filter.toCriteria()).toEqual({ brandId: "b1", modelIds: [] });
  });

  it("rejects modelIds without brandId", () => {
    expect(() => ListingFilter.create({ modelIds: ["m1"] })).toThrowError(
      LISTING_ERROR_CODES.INVALID_FILTER_RANGE,
    );
  });

  it("rejects both modelId and modelIds", () => {
    expect(() =>
      ListingFilter.create({ brandId: "b1", modelId: "m1", modelIds: ["m2"] }),
    ).toThrowError(LISTING_ERROR_CODES.INVALID_FILTER_RANGE);
  });
});
