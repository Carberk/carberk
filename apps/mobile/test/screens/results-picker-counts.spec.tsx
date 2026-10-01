import type * as Native from "react-native";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderMobile, routeParams } from "../render";
import ModelPickerScreen from "../../app/(tabs)/(search)/models";
import BrandPickerScreen from "../../app/(tabs)/(search)/brands";
const counts = vi.hoisted(() => ({ models: vi.fn(), brands: vi.fn(), total: vi.fn() }));
vi.mock("react-native-safe-area-context", async () => ({ SafeAreaView: (await import("react-native")).View }));
vi.mock("react-native", async (original) => {
  const native = await original<typeof Native>();
  const React = await import("react");
  type SectionProps = { sections: { data: unknown[] }[]; renderItem: (arg: { item: unknown }) => ReactNode; ListHeaderComponent?: ReactNode };
  return { ...native, SectionList: ({ sections, renderItem, ListHeaderComponent }: SectionProps) => React.createElement(native.ScrollView, null, ListHeaderComponent, sections.flatMap((section) => section.data.map((item, index) => React.createElement(React.Fragment, { key: index }, renderItem({ item }))))) };
});
vi.mock("../../src/api/client", () => ({ apiClient: { get: vi.fn() }, ApiError: class ApiError extends Error {} }));
vi.mock("../../src/listings/search/recentSearches", () => ({ useRecentChoicesStore: (select: (state: unknown) => unknown) => select({ items: [], hydrate: vi.fn(), clear: vi.fn(), record: vi.fn() }) }));
vi.mock("../../src/listings/search/useRoutePickerActions", () => ({ useRoutePickerActions: () => ({ mode: "show", confirm: vi.fn(), pickBrand: vi.fn(), changeBrand: vi.fn(), moreFilters: vi.fn(), pickRecent: vi.fn() }) }));
vi.mock("../../src/api/catalog/useBrands", () => ({ useBrands: () => ({ data: { items: [{ id: "toyota", name: "Toyota", slug: "toyota" }] } }) }));
vi.mock("../../src/api/catalog/useModels", () => ({ useModels: () => ({ data: { items: [{ id: "camry", name: "Camry" }] } }) }));
vi.mock("../../src/api/catalog/useCatalogSearch", () => ({ useCatalogSearch: () => ({ data: undefined }) }));
vi.mock("../../src/api/listings/useListingModelCounts", () => ({ useListingModelCounts: (options: unknown) => { counts.models(options); return { data: { items: [{ modelId: "camry", totalMatching: 2 }] } }; } }));
vi.mock("../../src/api/listings/useListingBrandCounts", () => ({ useListingBrandCounts: (options: unknown) => { counts.brands(options); return { data: { items: [{ brandId: "toyota", totalMatching: 2 }] } }; } }));
vi.mock("../../src/api/listings/useListingCount", () => ({ useListingCount: (options: unknown) => { counts.total(options); return { data: { totalMatching: 2 }, isPending: false }; } }));

const otherFilters = { cityId: "ashgabat", priceMin: 70000, priceMax: 120000, yearMin: 2018, yearMax: 2020, condition: "used" };
beforeEach(() => {
  counts.models.mockClear(); counts.brands.mockClear(); counts.total.mockClear();
  Object.assign(routeParams, { brandId: "toyota", modelIds: "camry", returnToResults: "1", resultsState: JSON.stringify({ ...otherFilters, priceMin: "70000", priceMax: "120000", yearMin: "2018", yearMax: "2020", brandId: "toyota", modelIds: "camry", sort: "price_asc" }) });
});
describe("Results picker route count wiring", () => {
  it("counts the same retained Results filters behind Show N and per-model rows", () => {
    const view = renderMobile(<ModelPickerScreen />);
    expect(view.getByText("Show 2 listings")).toBeTruthy();
    expect(counts.total).toHaveBeenLastCalledWith({ filters: expect.objectContaining({ ...otherFilters, brandId: "toyota", modelIds: ["camry"] }) });
    expect(counts.models).toHaveBeenLastCalledWith({ filters: expect.objectContaining({ ...otherFilters, brandId: "toyota" }) });
  });
  it("counts popular brands against the same retained non-model filters", () => {
    renderMobile(<BrandPickerScreen />);
    expect(counts.brands).toHaveBeenLastCalledWith({ filters: expect.objectContaining(otherFilters) });
  });
  it("never sends the Results sort order to the brand or model counts endpoints, which reject it", () => {
    renderMobile(<ModelPickerScreen />);
    expect(counts.models.mock.lastCall?.[0].filters).not.toHaveProperty("sort");
    renderMobile(<BrandPickerScreen />);
    expect(counts.brands.mock.lastCall?.[0].filters).not.toHaveProperty("sort");
  });
});
