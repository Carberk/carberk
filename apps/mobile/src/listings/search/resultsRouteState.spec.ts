import { describe, expect, it } from "vitest";

import { readPickerResultsFilters, readResultsRouteState, writeResultsRouteState } from "./resultsRouteState";

describe("readResultsRouteState", () => {
  it("retains seller type through the applied Results route and rejects unknown choices", () => {
    expect(readResultsRouteState({ sellerType: "business" })).toEqual({ sort: "newest", sellerType: "business" });
    expect(readResultsRouteState({ sellerType: "promoted" })).toEqual({ sort: "newest" });
  });
  it("returns the newest-first full feed when there are no parameters", () => {
    expect(readResultsRouteState({})).toEqual({ sort: "newest" });
  });

  it("falls back to newest for an unknown sort and keeps each approved sort", () => {
    expect(readResultsRouteState({ sort: "best_deal" }).sort).toBe("newest");
    for (const sort of ["newest", "price_asc", "price_desc", "year_desc", "year_asc", "mileage_asc"]) {
      expect(readResultsRouteState({ sort }).sort).toBe(sort);
    }
  });

  it("reads the first value of a repeated parameter", () => {
    expect(readResultsRouteState({ cityId: ["ashgabat", "mary"], sort: ["year_asc", "price_asc"] })).toEqual({ sort: "year_asc", cityId: "ashgabat" });
  });

  it("keeps models only together with a brand, from modelIds or the legacy modelId", () => {
    expect(readResultsRouteState({ modelIds: "camry,corolla" })).toEqual({ sort: "newest" });
    expect(readResultsRouteState({ brandId: "toyota", modelIds: "camry,corolla" }).modelIds).toEqual(["camry", "corolla"]);
    expect(readResultsRouteState({ brandId: "toyota", modelId: "camry" }).modelIds).toEqual(["camry"]);
    expect(readResultsRouteState({ brandId: "toyota", modelIds: "corolla", modelId: "camry" }).modelIds).toEqual(["corolla"]);
  });

  it("drops duplicate and empty models", () => {
    expect(readResultsRouteState({ brandId: "toyota", modelIds: "camry,,camry,corolla,camry" }).modelIds).toEqual(["camry", "corolla"]);
    expect(readResultsRouteState({ brandId: "toyota", modelIds: ",," })).toEqual({ sort: "newest", brandId: "toyota" });
  });

  it("drops years outside 1900 to 2100 and non-integer years, but keeps the boundaries", () => {
    expect(readResultsRouteState({ yearMin: "1899", yearMax: "2101" })).toEqual({ sort: "newest" });
    expect(readResultsRouteState({ yearMin: "2018.5" })).toEqual({ sort: "newest" });
    expect(readResultsRouteState({ yearMin: "1900", yearMax: "2100" })).toEqual({ sort: "newest", yearMin: 1900, yearMax: 2100 });
  });

  it("drops prices and years that are not positive finite numbers", () => {
    expect(readResultsRouteState({ priceMin: "0", priceMax: "-5", yearMin: "-2018", yearMax: "abc" })).toEqual({ sort: "newest" });
    expect(readResultsRouteState({ priceMin: "Infinity", priceMax: "" })).toEqual({ sort: "newest" });
    expect(readResultsRouteState({ priceMin: "70000", priceMax: "120000.5" })).toEqual({ sort: "newest", priceMin: 70000, priceMax: 120000.5 });
  });

  it("accepts only the new and used conditions", () => {
    expect(readResultsRouteState({ condition: "new" }).condition).toBe("new");
    expect(readResultsRouteState({ condition: "used" }).condition).toBe("used");
    expect(readResultsRouteState({ condition: "damaged" }).condition).toBeUndefined();
  });
});

describe("writeResultsRouteState", () => {
  it("writes every key, joining models and leaving absent filters undefined", () => {
    expect(writeResultsRouteState({ brandId: "toyota", modelIds: ["camry", "corolla"], priceMin: 70000, sort: "price_asc" })).toEqual({
      brandId: "toyota", modelIds: "camry,corolla", modelId: undefined, cityId: undefined, priceMin: "70000", priceMax: undefined,
      yearMin: undefined, yearMax: undefined, condition: undefined, sellerType: undefined, sort: "price_asc",
    });
  });

  it("writes newest when no sort is set, and round-trips through the reader", () => {
    expect(writeResultsRouteState({}).sort).toBe("newest");
    const filters = { brandId: "toyota", modelIds: ["camry"], cityId: "ashgabat", priceMin: 70000, priceMax: 120000, yearMin: 2018, yearMax: 2020, condition: "used" as const, sort: "year_desc" as const };
    const written = writeResultsRouteState(filters);
    expect(readResultsRouteState(Object.fromEntries(Object.entries(written).filter(([, value]) => value !== undefined)))).toEqual(filters);
  });
});

describe("readPickerResultsFilters", () => {
  const state = JSON.stringify({ brandId: "toyota", modelIds: "camry", sort: "price_asc", priceMin: "70000" });

  it("returns the carried Results filters only when the picker came from Results", () => {
    expect(readPickerResultsFilters({ returnToResults: "1", resultsState: state })).toEqual({ brandId: "toyota", modelIds: ["camry"], sort: "price_asc", priceMin: 70000 });
    expect(readPickerResultsFilters({ resultsState: state })).toBeUndefined();
    expect(readPickerResultsFilters({ returnToResults: "0", resultsState: state })).toBeUndefined();
  });

  it("treats a missing state as the full feed and ignores non-string values", () => {
    expect(readPickerResultsFilters({ returnToResults: "1" })).toEqual({ sort: "newest" });
    expect(readPickerResultsFilters({ returnToResults: "1", resultsState: JSON.stringify({ cityId: 5, condition: "new" }) })).toEqual({ sort: "newest", condition: "new" });
  });

  it("returns undefined for malformed or non-object state", () => {
    for (const resultsState of ["{not json", "[]", "null", "\"text\"", "12"]) {
      expect(readPickerResultsFilters({ returnToResults: "1", resultsState })).toBeUndefined();
    }
  });
});
