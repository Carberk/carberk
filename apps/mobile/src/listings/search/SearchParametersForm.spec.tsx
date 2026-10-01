import type * as Native from "react-native";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderMobile, fireEvent, routerMock, within } from "../../../test/render";

import { SearchParametersForm } from "./SearchParametersForm";
import type { ListingFilter } from "./useListingFilters";

const state = vi.hoisted(() => ({ count: vi.fn(), record: vi.fn(), mode: "ok" as "ok" | "loading" | "error" }));

vi.mock("react-native-safe-area-context", async () => ({
  SafeAreaView: (await import("react-native")).View,
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
vi.mock("react-native", async (original) => {
  const native = await original<typeof Native>();
  const React = await import("react");
  type SectionProps = { sections: { data: unknown[] }[]; renderItem: (arg: { item: unknown }) => ReactNode; ListHeaderComponent?: ReactNode };
  return { ...native, SectionList: ({ sections, renderItem, ListHeaderComponent }: SectionProps) => React.createElement(native.ScrollView, null, ListHeaderComponent, sections.flatMap((section) => section.data.map((item, index) => React.createElement(React.Fragment, { key: index }, renderItem({ item }))))) };
});
vi.mock("../../api/client", () => ({ apiClient: { get: vi.fn() }, ApiError: class ApiError extends Error {} }));
vi.mock("@react-native-async-storage/async-storage", () => ({ default: { getItem: vi.fn(async () => null), setItem: vi.fn(async () => undefined), removeItem: vi.fn(async () => undefined) } }));
vi.mock("./recentSearches", () => ({ useRecentChoicesStore: (select: (s: unknown) => unknown) => select({ items: [], hydrate: vi.fn(), clear: vi.fn(), record: state.record }) }));
vi.mock("../../api/catalog/useBrands", () => ({ useBrands: () => ({ data: { items: [{ id: "toyota", name: "Toyota", slug: "toyota" }, { id: "lexus", name: "Lexus", slug: "lexus" }] } }) }));
vi.mock("../../api/catalog/useModels", () => ({ useModels: (brandId: string) => ({ data: { items: brandId === "lexus" ? [{ id: "rx", name: "RX" }, { id: "es", name: "ES" }] : [{ id: "camry", name: "Camry" }, { id: "corolla", name: "Corolla" }] } }) }));
vi.mock("../../api/catalog/useCatalogSearch", () => ({ useCatalogSearch: () => ({ data: undefined }) }));
vi.mock("../../api/catalog/useRegions", () => ({ useRegions: () => ({ data: { items: [{ id: "ahal", name: "Ahal" }] }, isPending: false, isError: false }) }));
vi.mock("../../api/catalog/useCities", () => ({ useCities: (regionId: string) => ({ data: { items: regionId === "ahal" ? [{ id: "anau", name: "Anau" }] : [] }, isPending: false, isError: false }) }));
vi.mock("../../api/listings/useListingModelCounts", () => ({ useListingModelCounts: () => ({ data: { items: [] } }) }));
vi.mock("../../api/listings/useListingBrandCounts", () => ({ useListingBrandCounts: () => ({ data: { items: [] } }) }));
// The count follows the filters it is asked about, so a test sees the button react to each edit.
vi.mock("../../api/listings/useListingCount", () => ({ useListingCount: (options: { filters: ListingFilter }) => {
  state.count(options);
  if (state.mode === "loading") return { data: undefined, isPending: true, isError: false, refetch: vi.fn() };
  if (state.mode === "error") return { data: undefined, isPending: false, isError: true, refetch: vi.fn() };
  const { filters } = options;
  let total = 100;
  if (filters.condition === "used") total = 40;
  if (filters.condition === "new") total = 60;
  if (filters.cityId) total = Math.floor(total / 5);
  if (filters.brandId) total = Math.floor(total / 4);
  if (filters.priceMax != null) total = Math.floor(total / 2);
  return { data: { totalMatching: total }, isPending: false, isError: false, refetch: vi.fn() };
} }));

beforeEach(() => { state.count.mockClear(); state.record.mockClear(); state.mode = "ok"; });

const lastFilters = () => state.count.mock.lastCall?.[0].filters as ListingFilter;
const filled: ListingFilter = { condition: "used", brandId: "toyota", modelIds: ["camry"], yearMin: 2018, yearMax: 2020, priceMin: 70000, priceMax: 120000, sort: "price_asc" };
const open = (initial: ListingFilter = { sort: "newest" }, returnToResults = true, onBack = vi.fn()) =>
  renderMobile(<SearchParametersForm initial={initial} returnToResults={returnToResults} onBack={onBack} />);

describe("Search parameters: opening", () => {
  it("is a full-screen form titled Search parameters with the six approved fields", () => {
    const view = open();
    expect(view.getByText("Search parameters")).toBeTruthy();
    expect(view.getByRole("button", { name: "Any Condition" })).toBeTruthy();
    expect(view.getAllByText("City").length).toBeGreaterThan(0);
    expect(view.getByLabelText("Brand: Select brand")).toBeTruthy();
    expect(view.getByLabelText("Model: Select model")).toBeTruthy();
    expect(view.getByText("Year range")).toBeTruthy();
    expect(view.getByText("Price range")).toBeTruthy();
    expect(view.getByRole("button", { name: "Reset" })).toBeTruthy();
    expect(view.getByRole("button", { name: "Show 100 listings" })).toBeTruthy();
  });

  it("is pre-filled with the filters it was opened with", () => {
    const view = open(filled);
    expect(view.getByRole("button", { name: "Used Condition", selected: true })).toBeTruthy();
    expect(view.getByLabelText("Brand: Toyota")).toBeTruthy();
    expect(view.getByLabelText("Model: Camry")).toBeTruthy();
    expect(view.getByDisplayValue("2018")).toBeTruthy();
    expect(view.getByDisplayValue("2020")).toBeTruthy();
    expect(view.getByDisplayValue("70000")).toBeTruthy();
    expect(view.getByDisplayValue("120000")).toBeTruthy();
    expect(lastFilters()).toEqual(expect.objectContaining({ condition: "used", brandId: "toyota", modelIds: ["camry"], yearMin: 2018, yearMax: 2020, priceMin: 70000, priceMax: 120000 }));
  });
});

describe("Search parameters: the Show N count", () => {
  it("updates as each field changes", () => {
    const view = open();
    expect(view.getByRole("button", { name: "Show 100 listings" })).toBeTruthy();
    fireEvent.press(view.getByRole("button", { name: "Used Condition" }));
    expect(view.getByRole("button", { name: "Show 40 listings" })).toBeTruthy();
    expect(lastFilters().condition).toBe("used");
    fireEvent.changeText(view.getByPlaceholderText("Max"), "150000");
    expect(view.getByRole("button", { name: "Show 20 listings" })).toBeTruthy();
    expect(lastFilters().priceMax).toBe(150000);
    fireEvent.press(view.getByRole("button", { name: "New Condition" }));
    expect(view.getByRole("button", { name: "Show 30 listings" })).toBeTruthy();
  });

  it("shows Loading while the count loads and still lets the buyer continue", () => {
    state.mode = "loading";
    const view = open();
    const button = view.getByRole("button", { name: "Loading..." });
    fireEvent.press(button);
    expect(routerMock.dismissTo).toHaveBeenCalledOnce();
  });

  it("falls back to Show results with a message when the count fails", () => {
    state.mode = "error";
    const view = open();
    expect(view.getByText("Could not load listing count")).toBeTruthy();
    fireEvent.press(view.getByRole("button", { name: "Show results" }));
    expect(routerMock.dismissTo).toHaveBeenCalledOnce();
  });

  it("disables Show N and says why when the year range is inverted", () => {
    const view = open({ yearMin: 2020, yearMax: 2018, sort: "newest" });
    expect(view.getByText("Check filter values")).toBeTruthy();
    fireEvent.press(view.getByRole("button", { name: /Show|Apply/ }));
    expect(routerMock.dismissTo).not.toHaveBeenCalled();
    expect(routerMock.push).not.toHaveBeenCalled();
  });

  it("disables Show N when the minimum price exceeds the maximum", () => {
    const view = open({ priceMin: 200000, priceMax: 100000, sort: "newest" });
    expect(view.getByText("Check filter values")).toBeTruthy();
    fireEvent.press(view.getByRole("button", { name: /Show|Apply/ }));
    expect(routerMock.dismissTo).not.toHaveBeenCalled();
  });
});

describe("Search parameters: Reset", () => {
  it("clears a Region selected without a City and disables the City row", () => {
    const view = open({ sort: "price_asc" });
    fireEvent.press(view.getByLabelText("Region: Select region"));
    fireEvent.press(view.getByRole("button", { name: "Ahal" }));
    fireEvent.press(view.getByRole("button", { name: "Close" }));
    expect(view.getByLabelText("Region: Ahal")).toBeTruthy();
    expect(view.getByRole("button", { name: "City: Select city", disabled: false })).toBeTruthy();
    expect(lastFilters()).toEqual({ sort: "price_asc" });

    fireEvent.press(view.getByRole("button", { name: "Reset" }));

    expect(view.getByLabelText("Region: Select region")).toBeTruthy();
    expect(view.getByRole("button", { name: "City: Select a region first", disabled: true })).toBeTruthy();
    expect(lastFilters()).toEqual({ sort: "price_asc" });
    expect(view.getByRole("button", { name: "Show 100 listings" })).toBeTruthy();
  });

  it("updates the count for a selected City, then clears City and Region on Reset", () => {
    const view = open({ sort: "price_asc" });
    fireEvent.press(view.getByLabelText("Region: Select region"));
    fireEvent.press(view.getByRole("button", { name: "Ahal" }));
    fireEvent.press(view.getByRole("button", { name: "Anau" }));
    expect(view.getByLabelText("Region: Ahal")).toBeTruthy();
    expect(view.getByLabelText("City: Anau")).toBeTruthy();
    expect(lastFilters()).toEqual({ cityId: "anau", sort: "price_asc" });
    expect(view.getByRole("button", { name: "Show 20 listings" })).toBeTruthy();

    fireEvent.press(view.getByRole("button", { name: "Reset" }));

    expect(view.getByLabelText("Region: Select region")).toBeTruthy();
    expect(view.getByRole("button", { name: "City: Select a region first", disabled: true })).toBeTruthy();
    expect(lastFilters()).toEqual({ sort: "price_asc" });
    expect(view.getByRole("button", { name: "Show 100 listings" })).toBeTruthy();
  });

  it("clears every field, keeps the sort, and applies nothing yet", () => {
    const view = open(filled);
    fireEvent.press(view.getByRole("button", { name: "Reset" }));
    expect(view.getByRole("button", { name: "Any Condition", selected: true })).toBeTruthy();
    expect(view.getByLabelText("Brand: Select brand")).toBeTruthy();
    expect(view.getByLabelText("Model: Select model")).toBeTruthy();
    expect(view.queryByDisplayValue("2018")).toBeNull();
    expect(view.queryByDisplayValue("2020")).toBeNull();
    expect(view.queryByDisplayValue("70000")).toBeNull();
    expect(view.queryByDisplayValue("120000")).toBeNull();
    expect(lastFilters()).toEqual({ sort: "price_asc" });
    expect(view.getByRole("button", { name: "Show 100 listings" })).toBeTruthy();
    expect(routerMock.dismissTo).not.toHaveBeenCalled();
    expect(routerMock.push).not.toHaveBeenCalled();
    expect(routerMock.setParams).not.toHaveBeenCalled();
  });
});

describe("Search parameters: brand and model in Done mode", () => {
  it("picks a brand and models in the pickers and returns to the form with the choice", () => {
    const view = open();
    fireEvent.press(view.getByLabelText("Brand: Select brand"));
    expect(view.getByText("Lexus")).toBeTruthy();
    fireEvent.press(view.getByText("Lexus"));
    expect(view.getByText("Lexus models")).toBeTruthy();
    expect(view.queryByText("More filters")).toBeNull();
    fireEvent.press(view.getByText("RX"));
    fireEvent.press(view.getByRole("button", { name: /^Done/ }));
    expect(view.queryByText("Lexus models")).toBeNull();
    expect(view.getByLabelText("Brand: Lexus")).toBeTruthy();
    expect(view.getByLabelText("Model: RX")).toBeTruthy();
    expect(lastFilters()).toEqual(expect.objectContaining({ brandId: "lexus", modelIds: ["rx"] }));
    expect(state.record).toHaveBeenCalledWith(expect.objectContaining({ brandId: "lexus", modelIds: ["rx"] }));
    expect(routerMock.push).not.toHaveBeenCalled();
    expect(routerMock.dismissTo).not.toHaveBeenCalled();
  });

  it("opens the Model picker from the Model row with the current models ticked", () => {
    const view = open(filled);
    fireEvent.press(view.getByLabelText("Model: Camry"));
    expect(view.getByText("Toyota models")).toBeTruthy();
    expect(view.getByRole("checkbox", { name: "Camry", checked: true })).toBeTruthy();
    expect(view.getByRole("checkbox", { name: "Corolla", checked: false })).toBeTruthy();
  });

  it("changes the model selection when a model checkbox is pressed, box and all", () => {
    const view = open(filled);
    fireEvent.press(view.getByLabelText("Model: Camry"));
    const row = (name: string) => view.getByRole("checkbox", { name });
    // `within` includes the row itself, so two matches are the row plus the
    // Checkbox box inside it; the box must mirror the row's selected state.
    const boxesIn = (name: string, checked: boolean) => within(row(name)).getAllByRole("checkbox", { checked });
    expect(boxesIn("Corolla", false)).toHaveLength(2);
    expect(boxesIn("Camry", true)).toHaveLength(2);

    fireEvent.press(row("Corolla"));

    expect(boxesIn("Corolla", true)).toHaveLength(2);
    fireEvent.press(view.getByRole("button", { name: /^Done/ }));
    expect(lastFilters().modelIds).toEqual(["camry", "corolla"]);
    expect(view.getByLabelText("Model: 2 selected")).toBeTruthy();

    fireEvent.press(view.getByLabelText("Model: 2 selected"));
    fireEvent.press(row("Camry"));
    expect(boxesIn("Camry", false)).toHaveLength(2);
    fireEvent.press(view.getByRole("button", { name: /^Done/ }));
    expect(lastFilters().modelIds).toEqual(["corolla"]);
  });
});

describe("Search parameters: Show N", () => {
  it("applies the form to the Results screen below it without stacking a second Results", () => {
    const view = open(filled, true);
    fireEvent.press(view.getByRole("button", { name: "Used Condition" }));
    fireEvent.press(view.getByRole("button", { name: "New Condition" }));
    fireEvent.press(view.getByRole("button", { name: /^Show \d+ listings$/ }));
    expect(routerMock.dismissTo).toHaveBeenCalledOnce();
    expect(routerMock.dismissTo).toHaveBeenCalledWith({
      pathname: "/(tabs)/(search)/results",
      params: expect.objectContaining({ condition: "new", brandId: "toyota", modelIds: "camry", yearMin: "2018", yearMax: "2020", priceMin: "70000", priceMax: "120000", sort: "price_asc" }),
    });
    expect(routerMock.push).not.toHaveBeenCalled();
    expect(routerMock.dismissAll).not.toHaveBeenCalled();
  });

  it("clears a filter on Results that the form cleared", () => {
    const view = open(filled, true);
    fireEvent.press(view.getByRole("button", { name: "Reset" }));
    fireEvent.press(view.getByRole("button", { name: /^Show \d+ listings$/ }));
    const call = routerMock.dismissTo.mock.calls[0]?.[0] as { params: Record<string, string | undefined> };
    expect(call.params).toEqual(expect.objectContaining({ brandId: undefined, modelIds: undefined, condition: undefined, priceMax: undefined, sort: "price_asc" }));
  });

  it("opens Results over Home when the form came from the Model picker, with the pickers taken off the stack", () => {
    const view = open({ brandId: "toyota", sort: "newest" }, false);
    fireEvent.press(view.getByRole("button", { name: /^Show \d+ listings$/ }));
    expect(routerMock.dismissAll).toHaveBeenCalledOnce();
    expect(routerMock.push).toHaveBeenCalledWith({ pathname: "/(tabs)/(search)/results", params: expect.objectContaining({ brandId: "toyota", sort: "newest" }) });
    expect(routerMock.dismissTo).not.toHaveBeenCalled();
  });

  it("saves the applied brand choice to Recent", () => {
    const view = open(filled, true);
    fireEvent.press(view.getByRole("button", { name: /^Show \d+ listings$/ }));
    expect(state.record).toHaveBeenCalledWith(expect.objectContaining({ brandId: "toyota", modelIds: ["camry"] }));
  });
});

describe("Search parameters: Back", () => {
  it("leaves without applying, so unapplied edits are discarded", () => {
    const onBack = vi.fn();
    const view = open(filled, true, onBack);
    fireEvent.press(view.getByRole("button", { name: "Used Condition" }));
    fireEvent.press(view.getByRole("button", { name: "Back" }));
    expect(onBack).toHaveBeenCalledOnce();
    expect(routerMock.dismissTo).not.toHaveBeenCalled();
    expect(routerMock.push).not.toHaveBeenCalled();
    expect(routerMock.setParams).not.toHaveBeenCalled();
    expect(state.record).not.toHaveBeenCalled();
  });
});
