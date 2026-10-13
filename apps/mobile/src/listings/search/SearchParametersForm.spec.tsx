import type * as Native from "react-native";
import { KeyboardAvoidingView, Platform } from "react-native";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderMobile, act, fireEvent, routerMock, within, getHost } from "../../../test/render";

import { SearchParametersForm } from "./SearchParametersForm";
import type { ListingFilter } from "./useListingFilters";

const state = vi.hoisted(() => ({ count: vi.fn(), record: vi.fn(), total: undefined as number | undefined, mode: "ok" as "ok" | "loading" | "error" }));

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
  let total = state.total ?? 100;
  if (filters.condition === "used") total = 40;
  if (filters.condition === "new") total = 60;
  if (filters.cityId) total = Math.floor(total / 5);
  if (filters.brandId) total = Math.floor(total / 4);
  if (filters.priceMax != null) total = Math.floor(total / 2);
  return { data: { totalMatching: total }, isPending: false, isError: false, refetch: vi.fn() };
} }));

beforeEach(() => { state.total = undefined; state.count.mockClear(); state.record.mockClear(); state.mode = "ok"; });

const lastFilters = () => state.count.mock.lastCall?.[0].filters as ListingFilter;
const filled: ListingFilter = { condition: "used", brandId: "toyota", modelIds: ["camry"], yearMin: 2018, yearMax: 2020, priceMin: 70000, priceMax: 120000, sort: "price_asc" };
const open = (initial: ListingFilter = { sort: "newest" }, returnToResults = true, onBack = vi.fn()) =>
  renderMobile(<SearchParametersForm initial={initial} returnToResults={returnToResults} onBack={onBack} />);

describe("Search parameters: opening", () => {
  it("is a full-screen form titled Search parameters with the six approved fields", async () => {
    const view = await open();
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

  it("is pre-filled with the filters it was opened with", async () => {
    const view = await open(filled);
    expect(view.getByRole("button", { name: "Used Condition", selected: true })).toBeTruthy();
    expect(view.getByLabelText("Brand: Toyota")).toBeTruthy();
    expect(view.getByLabelText("Model: Camry")).toBeTruthy();
    expect(view.getByDisplayValue("2018")).toBeTruthy();
    expect(view.getByDisplayValue("2020")).toBeTruthy();
    expect(view.getByDisplayValue("70,000")).toBeTruthy();
    expect(view.getByDisplayValue("120,000")).toBeTruthy();
    expect(lastFilters()).toEqual(expect.objectContaining({ condition: "used", brandId: "toyota", modelIds: ["camry"], yearMin: 2018, yearMax: 2020, priceMin: 70000, priceMax: 120000 }));
  });
});

describe("Search parameters: the Show N count", () => {
  it("updates as each field changes", async () => {
    const view = await open();
    expect(view.getByRole("button", { name: "Show 100 listings" })).toBeTruthy();
    await fireEvent.press(view.getByRole("button", { name: "Used Condition" }));
    expect(view.getByRole("button", { name: "Show 40 listings" })).toBeTruthy();
    expect(lastFilters().condition).toBe("used");
    await fireEvent.changeText(view.getByPlaceholderText("Max"), "150000");
    expect(view.getByRole("button", { name: "Show 20 listings" })).toBeTruthy();
    expect(lastFilters().priceMax).toBe(150000);
    await fireEvent.press(view.getByRole("button", { name: "New Condition" }));
    expect(view.getByRole("button", { name: "Show 30 listings" })).toBeTruthy();
  });

  it("shows Loading while the count loads and still lets the buyer continue", async () => {
    state.mode = "loading";
    const view = await open();
    const button = view.getByRole("button", { name: "Loading..." });
    await fireEvent.press(button);
    expect(routerMock.dismissTo).toHaveBeenCalledOnce();
  });

  it("falls back to Show results with a message when the count fails", async () => {
    state.mode = "error";
    const view = await open();
    expect(view.getByText("Could not load listing count")).toBeTruthy();
    await fireEvent.press(view.getByRole("button", { name: "Show results" }));
    expect(routerMock.dismissTo).toHaveBeenCalledOnce();
  });

  it("disables Show N and says why when the year range is inverted", async () => {
    const view = await open({ yearMin: 2020, yearMax: 2018, sort: "newest" });
    expect(view.getByText("Check filter values")).toBeTruthy();
    await fireEvent.press(view.getByRole("button", { name: /Show|Apply/ }));
    expect(routerMock.dismissTo).not.toHaveBeenCalled();
    expect(routerMock.push).not.toHaveBeenCalled();
  });

  it("disables Show N when the minimum price exceeds the maximum", async () => {
    const view = await open({ priceMin: 200000, priceMax: 100000, sort: "newest" });
    expect(view.getByText("Check filter values")).toBeTruthy();
    await fireEvent.press(view.getByRole("button", { name: /Show|Apply/ }));
    expect(routerMock.dismissTo).not.toHaveBeenCalled();
  });
});

describe("Search parameters: Reset", () => {
  it("clears a Region selected without a City and disables the City row", async () => {
    const view = await open({ sort: "price_asc" });
    await fireEvent.press(view.getByLabelText("Region: Select region"));
    await fireEvent.press(view.getByRole("button", { name: "Ahal" }));
    await fireEvent.press(view.getByRole("button", { name: "Close" }));
    expect(view.getByLabelText("Region: Ahal")).toBeTruthy();
    expect(view.getByRole("button", { name: "City: Select city", disabled: false })).toBeTruthy();
    expect(lastFilters()).toEqual({ sort: "price_asc" });

    await fireEvent.press(view.getByRole("button", { name: "Reset" }));

    expect(view.getByLabelText("Region: Select region")).toBeTruthy();
    expect(view.getByRole("button", { name: "City: Select a region first", disabled: true })).toBeTruthy();
    expect(lastFilters()).toEqual({ sort: "price_asc" });
    expect(view.getByRole("button", { name: "Show 100 listings" })).toBeTruthy();
  });

  it("updates the count for a selected City, then clears City and Region on Reset", async () => {
    const view = await open({ sort: "price_asc" });
    await fireEvent.press(view.getByLabelText("Region: Select region"));
    await fireEvent.press(view.getByRole("button", { name: "Ahal" }));
    await fireEvent.press(view.getByRole("button", { name: "Anau" }));
    expect(view.getByLabelText("Region: Ahal")).toBeTruthy();
    expect(view.getByLabelText("City: Anau")).toBeTruthy();
    expect(lastFilters()).toEqual({ cityId: "anau", sort: "price_asc" });
    expect(view.getByRole("button", { name: "Show 20 listings" })).toBeTruthy();

    await fireEvent.press(view.getByRole("button", { name: "Reset" }));

    expect(view.getByLabelText("Region: Select region")).toBeTruthy();
    expect(view.getByRole("button", { name: "City: Select a region first", disabled: true })).toBeTruthy();
    expect(lastFilters()).toEqual({ sort: "price_asc" });
    expect(view.getByRole("button", { name: "Show 100 listings" })).toBeTruthy();
  });

  it("clears every field, keeps the sort, and applies nothing yet", async () => {
    const view = await open(filled);
    await fireEvent.press(view.getByRole("button", { name: "Reset" }));
    expect(view.getByRole("button", { name: "Any Condition", selected: true })).toBeTruthy();
    expect(view.getByLabelText("Brand: Select brand")).toBeTruthy();
    expect(view.getByLabelText("Model: Select model")).toBeTruthy();
    expect(view.queryByDisplayValue("2018")).toBeNull();
    expect(view.queryByDisplayValue("2020")).toBeNull();
    expect(view.queryByDisplayValue("70,000")).toBeNull();
    expect(view.queryByDisplayValue("120,000")).toBeNull();
    expect(lastFilters()).toEqual({ sort: "price_asc" });
    expect(view.getByRole("button", { name: "Show 100 listings" })).toBeTruthy();
    expect(routerMock.dismissTo).not.toHaveBeenCalled();
    expect(routerMock.push).not.toHaveBeenCalled();
    expect(routerMock.setParams).not.toHaveBeenCalled();
  });
});

describe("Search parameters: brand and model in Done mode", () => {
  it("picks a brand and models in the pickers and returns to the form with the choice", async () => {
    const view = await open();
    await fireEvent.press(view.getByLabelText("Brand: Select brand"));
    expect(view.getByText("Lexus")).toBeTruthy();
    await fireEvent.press(view.getByText("Lexus"));
    expect(view.getByText("Lexus models")).toBeTruthy();
    expect(view.queryByText("More filters")).toBeNull();
    await fireEvent.press(view.getByText("RX"));
    await fireEvent.press(view.getByRole("button", { name: /^Done/ }));
    expect(view.queryByText("Lexus models")).toBeNull();
    expect(view.getByLabelText("Brand: Lexus")).toBeTruthy();
    expect(view.getByLabelText("Model: RX")).toBeTruthy();
    expect(lastFilters()).toEqual(expect.objectContaining({ brandId: "lexus", modelIds: ["rx"] }));
    expect(state.record).toHaveBeenCalledWith(expect.objectContaining({ brandId: "lexus", modelIds: ["rx"] }));
    expect(routerMock.push).not.toHaveBeenCalled();
    expect(routerMock.dismissTo).not.toHaveBeenCalled();
  });

  it("opens the Model picker from the Model row with the current models ticked", async () => {
    const view = await open(filled);
    await fireEvent.press(view.getByLabelText("Model: Camry"));
    expect(view.getByText("Toyota models")).toBeTruthy();
    expect(view.getByRole("checkbox", { name: "Camry", checked: true })).toBeTruthy();
    expect(view.getByRole("checkbox", { name: "Corolla", checked: false })).toBeTruthy();
  });

  it("changes the model selection when a model checkbox is pressed, box and all", async () => {
    const view = await open(filled);
    await fireEvent.press(view.getByLabelText("Model: Camry"));
    const row = (name: string) => view.getByRole("checkbox", { name });
    // `within` includes the row itself, so two matches are the row plus the
    // Checkbox box inside it; the box must mirror the row's selected state.
    const boxesIn = (name: string, checked: boolean) => within(row(name)).getAllByRole("checkbox", { checked });
    expect(boxesIn("Corolla", false)).toHaveLength(2);
    expect(boxesIn("Camry", true)).toHaveLength(2);

    await fireEvent.press(row("Corolla"));

    expect(boxesIn("Corolla", true)).toHaveLength(2);
    await fireEvent.press(view.getByRole("button", { name: /^Done/ }));
    expect(lastFilters().modelIds).toEqual(["camry", "corolla"]);
    expect(view.getByLabelText("Model: 2 selected")).toBeTruthy();

    await fireEvent.press(view.getByLabelText("Model: 2 selected"));
    await fireEvent.press(row("Camry"));
    expect(boxesIn("Camry", false)).toHaveLength(2);
    await fireEvent.press(view.getByRole("button", { name: /^Done/ }));
    expect(lastFilters().modelIds).toEqual(["corolla"]);
  });
});

describe("Search parameters: Show N", () => {
  it("applies the form to the Results screen below it without stacking a second Results", async () => {
    const view = await open(filled, true);
    await fireEvent.press(view.getByRole("button", { name: "Used Condition" }));
    await fireEvent.press(view.getByRole("button", { name: "New Condition" }));
    await fireEvent.press(view.getByRole("button", { name: /^Show \d+ listings$/ }));
    expect(routerMock.dismissTo).toHaveBeenCalledOnce();
    expect(routerMock.dismissTo).toHaveBeenCalledWith({
      pathname: "/(tabs)/(search)/results",
      params: expect.objectContaining({ condition: "new", brandId: "toyota", modelIds: "camry", yearMin: "2018", yearMax: "2020", priceMin: "70000", priceMax: "120000", sort: "price_asc" }),
    });
    expect(routerMock.push).not.toHaveBeenCalled();
    expect(routerMock.dismissAll).not.toHaveBeenCalled();
  });

  it("clears a filter on Results that the form cleared", async () => {
    const view = await open(filled, true);
    await fireEvent.press(view.getByRole("button", { name: "Reset" }));
    await fireEvent.press(view.getByRole("button", { name: /^Show \d+ listings$/ }));
    const call = routerMock.dismissTo.mock.calls[0]?.[0] as { params: Record<string, string | undefined> };
    expect(call.params).toEqual(expect.objectContaining({ brandId: undefined, modelIds: undefined, condition: undefined, priceMax: undefined, sort: "price_asc" }));
  });

  it("opens Results over Home when the form came from the Model picker, with the pickers taken off the stack", async () => {
    const view = await open({ brandId: "toyota", sort: "newest" }, false);
    await fireEvent.press(view.getByRole("button", { name: /^Show \d+ listings$/ }));
    expect(routerMock.dismissAll).toHaveBeenCalledOnce();
    expect(routerMock.push).toHaveBeenCalledWith({ pathname: "/(tabs)/(search)/results", params: expect.objectContaining({ brandId: "toyota", sort: "newest" }) });
    expect(routerMock.dismissTo).not.toHaveBeenCalled();
  });

  it("saves the applied brand choice to Recent", async () => {
    const view = await open(filled, true);
    await fireEvent.press(view.getByRole("button", { name: /^Show \d+ listings$/ }));
    expect(state.record).toHaveBeenCalledWith(expect.objectContaining({ brandId: "toyota", modelIds: ["camry"] }));
  });
});

/** The text a native field holds after each key of `digits`: "7", "70", "700", ... */
const prefixes = (digits: string) => Array.from(digits, (_, index) => digits.slice(0, index + 1));

describe("Search parameters: price inputs keep every digit typed or pasted", () => {
  // These tests cover the React side of a burst: successive full-text events fired inside one `act`, so
  // React does not re-render between them. Outside `act` each event renders first, which is the
  // digit-by-digit case. They cannot reproduce native ordering between a native text view and a
  // controlled `value`; the simulator capture in docs/evidence/issue-472 covers that.
  const fields = [
    { name: "Min", placeholder: "Min", key: "priceMin" },
    { name: "Max", placeholder: "Max", key: "priceMax" },
  ] as const;

  describe.each(fields)("$name price", ({ placeholder, key }) => {
    it("keeps 7000000 when the digits arrive one at a time with a render between each", async () => {
      const view = await open();
      for (const text of prefixes("7000000")) await fireEvent.changeText(view.getByPlaceholderText(placeholder), text);
      expect(view.getByDisplayValue("7,000,000")).toBeTruthy();
      expect(lastFilters()[key]).toBe(7000000);
    });

    it("keeps 7000000 when every digit arrives in one burst, before any render", async () => {
      const view = await open();
      const field = view.getByPlaceholderText(placeholder);
      await act(async () => {
        // One act batches the events, so React does not re-render between them, as in a native burst.
        for (const text of prefixes("7000000")) await fireEvent.changeText(field, text);
      });
      expect(view.getByDisplayValue("7,000,000")).toBeTruthy();
      expect(lastFilters()[key]).toBe(7000000);
    });

    it.each(["7000000", "7,000,000", "7 000 000", "7 000 000 TMT"])("keeps 7000000 when %j is pasted whole", async (pasted) => {
      const view = await open();
      await fireEvent.changeText(view.getByPlaceholderText(placeholder), pasted);
      expect(view.getByDisplayValue("7,000,000")).toBeTruthy();
      expect(lastFilters()[key]).toBe(7000000);
    });

    it("replaces an existing value with a whole pasted value", async () => {
      const view = await open({ [key]: 70000, sort: "newest" });
      await fireEvent.changeText(view.getByDisplayValue("70,000"), "7000000");
      expect(view.queryByDisplayValue("70,000")).toBeNull();
      expect(view.getByDisplayValue("7,000,000")).toBeTruthy();
      expect(lastFilters()[key]).toBe(7000000);
    });

    it("keeps the digits typed after a delete in the same burst", async () => {
      // Opens at 7000000 and ends on a different value, so a handler that drops every event fails.
      const view = await open({ [key]: 7000000, sort: "newest" });
      const field = view.getByDisplayValue("7,000,000");
      await act(async () => {
        for (const text of ["700000", "70000", "7000", "70005", "700055", "7000555"]) await fireEvent.changeText(field, text);
      });
      expect(view.queryByDisplayValue("7,000,000")).toBeNull();
      expect(view.getByDisplayValue("7,000,555")).toBeTruthy();
      expect(lastFilters()[key]).toBe(7000555);
    });
  });

  it("keeps both whole values when min and max are typed in alternating bursts", async () => {
    const view = await open();
    const min = view.getByPlaceholderText("Min");
    const max = view.getByPlaceholderText("Max");
    await act(async () => {
      const maxTexts = prefixes("7000000");
      for (const [index, text] of prefixes("1500000").entries()) {
        await fireEvent.changeText(min, text);
        await fireEvent.changeText(max, maxTexts[index] as string);
      }
    });
    expect(view.getByDisplayValue("1,500,000")).toBeTruthy();
    expect(view.getByDisplayValue("7,000,000")).toBeTruthy();
    expect(lastFilters()).toEqual(expect.objectContaining({ priceMin: 1500000, priceMax: 7000000 }));
  });

  it("passes both whole values to Results when Show is pressed after a burst", async () => {
    const view = await open({ sort: "newest" });
    const min = view.getByPlaceholderText("Min");
    const max = view.getByPlaceholderText("Max");
    await act(async () => {
      for (const text of prefixes("1500000")) await fireEvent.changeText(min, text);
      for (const text of prefixes("7000000")) await fireEvent.changeText(max, text);
    });
    await fireEvent.press(view.getByRole("button", { name: /^Show \d+ listings$/ }));
    expect(routerMock.dismissTo).toHaveBeenCalledWith({
      pathname: "/(tabs)/(search)/results",
      params: expect.objectContaining({ priceMin: "1500000", priceMax: "7000000" }),
    });
  });

  it("lets a maximum typed digit by digit pass through values below the minimum and end whole", async () => {
    const view = await open({ priceMin: 500000, sort: "newest" });
    await fireEvent.changeText(view.getByPlaceholderText("Max"), "7");
    expect(view.getByText("Minimum price cannot exceed maximum price")).toBeTruthy();
    expect(view.getByDisplayValue("7")).toBeTruthy();
    for (const text of prefixes("7000000").slice(1)) await fireEvent.changeText(view.getByPlaceholderText("Max"), text);
    expect(view.queryByText("Minimum price cannot exceed maximum price")).toBeNull();
    expect(view.getByDisplayValue("7,000,000")).toBeTruthy();
    expect(lastFilters()).toEqual(expect.objectContaining({ priceMin: 500000, priceMax: 7000000 }));
  });
});

describe("Search parameters: Back", () => {
  it("leaves without applying, so unapplied edits are discarded", async () => {
    const onBack = vi.fn();
    const view = await open(filled, true, onBack);
    await fireEvent.press(view.getByRole("button", { name: "Used Condition" }));
    await fireEvent.press(view.getByRole("button", { name: "Back" }));
    expect(onBack).toHaveBeenCalledOnce();
    expect(routerMock.dismissTo).not.toHaveBeenCalled();
    expect(routerMock.push).not.toHaveBeenCalled();
    expect(routerMock.setParams).not.toHaveBeenCalled();
    expect(state.record).not.toHaveBeenCalled();
  });
});

describe("Russian filter result count", () => {
  it.each([[1, "Показать 1 объявление"], [2, "Показать 2 объявления"], [3, "Показать 3 объявления"], [4, "Показать 4 объявления"], [5, "Показать 5 объявлений"], [11, "Показать 11 объявлений"], [12, "Показать 12 объявлений"], [13, "Показать 13 объявлений"], [14, "Показать 14 объявлений"], [21, "Показать 21 объявление"], [22, "Показать 22 объявления"], [25, "Показать 25 объявлений"]])("shows the correct filter button for %i matches", async (count, label) => {
    state.total = count as number;
    const screen = await renderMobile(<SearchParametersForm initial={{}} returnToResults={false} onBack={vi.fn()} />, { locale: "ru" });
    expect(screen.getByRole("button", { name: label })).toBeTruthy();
  });
});

describe("English filter result count", () => {
  it("uses a singular Listing for one match", async () => {
    state.total = 1;
    const screen = await renderMobile(<SearchParametersForm initial={{}} returnToResults={false} onBack={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Show 1 listing" })).toBeTruthy();
  });
});


describe("Filter count without Intl.PluralRules", () => {
  it.each([[1, "Показать 1 объявление"], [2, "Показать 2 объявления"], [5, "Показать 5 объявлений"], [11, "Показать 11 объявлений"], [21, "Показать 21 объявление"], [22, "Показать 22 объявления"], [25, "Показать 25 объявлений"]])("shows %i Russian matches on Hermes without plural rules", async (count, label) => {
    const descriptor = Object.getOwnPropertyDescriptor(Intl, "PluralRules");
    Object.defineProperty(Intl, "PluralRules", { configurable: true, value: undefined });
    try {
      state.total = count as number;
      const screen = await renderMobile(<SearchParametersForm initial={{}} returnToResults={false} onBack={vi.fn()} />, { locale: "ru" });
      expect(screen.getByRole("button", { name: label })).toBeTruthy();
    } finally {
      if (descriptor) Object.defineProperty(Intl, "PluralRules", descriptor);
    }
  });
});

describe("Search parameters: keyboard", () => {
  it.each(["android", "ios"] as const)("keeps the year and price fields and Show N inside the padding avoidance region on %s", async (os) => {
    const previousOS = Platform.OS;
    Platform.OS = os;
    try {
      const view = await open(filled);
      const avoidance = getHost(view.container, "KeyboardAvoidingView");
      expect(avoidance.props.enabled).not.toBe(false);
      expect(avoidance.props.behavior).toBe("padding");
      expect(within(avoidance).getByDisplayValue("2018")).toBeTruthy();
      expect(within(avoidance).getByDisplayValue("70,000")).toBeTruthy();
      expect(within(avoidance).getByRole("button", { name: /^Show \d+ listings?$/ })).toBeTruthy();
    } finally { Platform.OS = previousOS; }
  });
});

describe("Search parameters: price entry", () => {
  it("groups minimum and maximum price while typing and sends plain numbers", async () => {
    const view = await open();
    await fireEvent.changeText(view.getByPlaceholderText("Min"), "420000");
    await fireEvent.changeText(view.getByPlaceholderText("Max"), "2329600");
    expect(view.getByDisplayValue("420,000")).toBeTruthy();
    expect(view.getByDisplayValue("2,329,600")).toBeTruthy();
    expect(lastFilters()).toEqual(expect.objectContaining({ priceMin: 420000, priceMax: 2329600 }));
  });

  it.each(["2 329 600", "2,329,600", "2\u00a0329\u00a0600 TMT"])("parses a pasted %j", async (pasted) => {
    const view = await open();
    await fireEvent.changeText(view.getByPlaceholderText("Max"), pasted);
    expect(view.getByDisplayValue("2,329,600")).toBeTruthy();
    expect(lastFilters()).toEqual(expect.objectContaining({ priceMax: 2329600 }));
  });

  it("leaves the year fields ungrouped", async () => {
    const view = await open(filled);
    expect(view.getByDisplayValue("2018")).toBeTruthy();
    expect(view.getByDisplayValue("2020")).toBeTruthy();
    expect(view.queryByDisplayValue("2,018")).toBeNull();
  });
});
