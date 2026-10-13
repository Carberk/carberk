import { onlineManager, useQuery } from "@tanstack/react-query";
import { Image } from "react-native";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { renderMobile, act, fireEvent, routeParams, routerMock, getAllHosts } from "../render";
import ResultsScreen from "../../app/(tabs)/(search)/results";

const state = vi.hoisted(() => ({
  feed: vi.fn(), count: vi.fn(), pending: false, error: false, empty: false, paused: false,
}));
vi.mock("react-native-safe-area-context", async () => ({
  SafeAreaView: (await import("react-native")).View,
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
vi.mock("react-native-reanimated", async () => {
  const native = await import("react-native");
  return { default: { View: native.View }, useSharedValue: (value: number) => ({ value }),
    useAnimatedStyle: (fn: () => unknown) => fn(), withTiming: (value: number) => value };
});
vi.mock("../../src/api/client", () => ({ apiClient: { get: vi.fn() }, ApiError: class ApiError extends Error { constructor(public code: string, public status: number) { super(code); } } }));
// Catalog hooks and device storage behind the real screen are replaced.
vi.mock("@react-native-async-storage/async-storage", () => ({ default: { getItem: vi.fn(async () => null), setItem: vi.fn(async () => undefined), removeItem: vi.fn(async () => undefined) } }));
vi.mock("../../src/api/catalog/useBrands", () => ({ useBrands: () => ({ data: { items: [{ id: "toyota", name: "Toyota" }] } }) }));
vi.mock("../../src/api/catalog/useRegions", () => ({ useRegions: () => ({ data: { items: [] }, isPending: false, isError: false }) }));
vi.mock("../../src/api/catalog/useCities", () => ({ useCities: () => ({ data: { items: [] }, isPending: false, isError: false }) }));
vi.mock("../../src/auth/useViewer", () => ({ useViewer: () => null }));
vi.mock("../../src/listings/feed/useFeedFavoriteReplay", () => ({ useFeedFavoriteReplay: vi.fn() }));
vi.mock("../../src/listings/useListingFavorite", () => ({ useListingFavorite: () => ({ favorited: false, pending: false, toggle: vi.fn() }) }));
vi.mock("../../src/listings/feed/useFeedCatalogMaps", () => ({ useFeedCatalogMaps: () => ({ brandName: () => "Toyota", brandLogoUrl: () => "https://files.test/toyota.png", modelName: (id: string) => ({ camry: "Camry", corolla: "Corolla", rav4: "RAV4" })[id], cityName: () => "Ashgabat" }) }));
vi.mock("../../src/api/catalog/useModels", () => ({ useModels: () => ({ data: { items: [{ id: "camry", name: "Camry" }, { id: "corolla", name: "Corolla" }, { id: "rav4", name: "RAV4" }] } }) }));
vi.mock("../../src/api/catalog/useTransmissions", () => ({ useTransmissions: () => ({ data: { items: [{ id: "auto", name: "Automatic" }] } }) }));
vi.mock("../../src/api/catalog/useEngineTypes", () => ({ useEngineTypes: () => ({ data: { items: [{ id: "petrol", name: "Petrol" }] } }) }));
const listing = {
  id: "listing-1", sellerId: "seller", status: "active", brandId: "toyota", modelId: "camry", year: 2018,
  priceAmount: 1, priceCurrency: "USD", displayPriceTmt: 70000, photoKeys: ["one.jpg", "two.jpg"], photoCount: 7,
  mileageKm: 80000, transmissionId: "auto", engineTypeId: "petrol", cityId: "ashgabat", publishedAt: "2026-09-30T04:00:00.000Z",
};
vi.mock("../../src/api/listings/useListings", () => ({ useListings: (options: unknown) => {
  state.feed(options); return { data: { pages: [{ items: state.empty || state.pending ? [] : [listing] }] }, isPending: state.pending,
    fetchStatus: state.paused ? "paused" : "idle", isError: state.error, error: new Error("Network request failed"), refetch: vi.fn(), isRefetching: false,
    fetchNextPage: vi.fn(), hasNextPage: false, isFetchingNextPage: false };
} }));
vi.mock("../../src/api/listings/useListingCount", () => ({ useListingCount: (options: unknown) => {
  state.count(options); return { data: { totalMatching: state.empty ? 0 : 12, priceMinTmt: state.empty ? null : 70000, priceMaxTmt: state.empty ? null : 120000 }, isPending: false };
} }));

afterEach(() => vi.useRealTimers());
beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-09-30T12:00:00Z")); state.feed.mockClear(); state.count.mockClear(); state.pending = false; state.error = false; state.empty = false; state.paused = false; });
const sorts = [
  ["Newest first", "newest"], ["Cheapest first", "price_asc"], ["Most expensive first", "price_desc"],
  ["Newest year first", "year_desc"], ["Oldest year first", "year_asc"], ["Lowest mileage first", "mileage_asc"],
];
function QueryProbe(options: { queryKey: string[]; queryFn: () => Promise<unknown>; networkMode?: "offlineFirst"; retry?: number; retryDelay?: number }) {
  useQuery(options);
  return null;
}
/** The match at `index`, failing the test with a clear message when it is missing. */
function matchAt<T>(matches: readonly T[], index: number): T {
  const match = matches.at(index);
  if (match === undefined) throw new Error(`Expected a match at index ${index}, found ${matches.length}`);
  return match;
}

describe("Results approved behavior", () => {
  it.each([["ru", /^Цены: 70.000 – 120.000 TMT$/], ["tk", /^Bahalar: 70.000 – 120.000 TMT$/]])("labels the price range of the results on one line in %s", async (locale, text) => {
    const view = await renderMobile(<ResultsScreen />, { locale: locale as string });
    expect(view.getByText(text as RegExp).props.numberOfLines).toBe(1);
  });
  it("shows the full feed, count, TMT price range and current sort without a brand", async () => {
    const view = await renderMobile(<ResultsScreen />);
    expect(view.getByText("12 listings")).toBeTruthy();
    const range = view.getByText("Prices: 70,000 – 120,000 TMT");
    expect(range.props.numberOfLines).toBe(1);
    expect(view.getByText("Newest first")).toBeTruthy();
    expect(state.feed).toHaveBeenLastCalledWith(expect.objectContaining({ filters: { sort: "newest" } }));
  });
  it.each(sorts)("choosing %s reloads Results in place", async (label, sort) => {
    const view = await renderMobile(<ResultsScreen />);
    await fireEvent.press(view.getByLabelText("Sort"));
    expect(view.getAllByRole("radio")).toHaveLength(6);
    await fireEvent.press(view.getByRole("radio", { name: label }));
    expect(state.feed).toHaveBeenLastCalledWith(expect.objectContaining({ filters: { sort } }));
    expect(state.count).toHaveBeenLastCalledWith(expect.objectContaining({ filters: { sort } }));
    expect(routerMock.setParams).toHaveBeenLastCalledWith(expect.objectContaining({ sort }));
    expect(routerMock.push).not.toHaveBeenCalled();
  });
  it("All / New / Used commits condition in place and keeps it in the route", async () => {
    const view = await renderMobile(<ResultsScreen />);
    for (const [label, condition] of [["New", "new"], ["Used", "used"], ["All", undefined]] as const) {
      await fireEvent.press(view.getByRole("button", { name: `${label} Condition` }));
      expect(state.feed.mock.lastCall?.[0].filters.condition).toBe(condition);
      expect(routerMock.push).not.toHaveBeenCalled();
    }
  });
  it("opens the selected models and clears brand plus models while keeping other filters", async () => {
    Object.assign(routeParams, { brandId: "toyota", modelIds: "camry,corolla,rav4", cityId: "ashgabat" });
    const view = await renderMobile(<ResultsScreen />);
    await fireEvent.press(view.getByRole("button", { name: "Toyota Camry, +2, Change models" }));
    expect(routerMock.push).toHaveBeenCalledWith(expect.objectContaining({ pathname: "/(tabs)/(search)/models", params: expect.objectContaining({ brandId: "toyota", modelIds: "camry,corolla,rav4" }) }));
    await fireEvent.press(view.getByLabelText("Clear brand and models"));
    expect(state.feed).toHaveBeenLastCalledWith(expect.objectContaining({ filters: { sort: "newest", cityId: "ashgabat" } }));
  });
  it("retains route filters and sort on entry for deep links and Back", async () => {
    Object.assign(routeParams, { brandId: "toyota", modelIds: "camry,corolla", condition: "used", priceMin: "70000", yearMax: "2020", sort: "year_asc" });
    await renderMobile(<ResultsScreen />);
    expect(state.feed).toHaveBeenLastCalledWith(expect.objectContaining({ filters: { brandId: "toyota", modelIds: ["camry", "corolla"], condition: "used", priceMin: 70000, yearMax: 2020, sort: "year_asc" } }));
    expect(routerMock.setParams).not.toHaveBeenCalledWith(expect.objectContaining({ brandId: undefined }));
  });
  it("keeps city, price and year chips in no-match and removes complete ranges", async () => {
    state.empty = true;
    Object.assign(routeParams, { cityId: "ashgabat", priceMin: "70000", priceMax: "120000", yearMin: "2018", yearMax: "2020" });
    const view = await renderMobile(<ResultsScreen />);
    expect(view.getByText("No listings match")).toBeTruthy();
    expect(view.getByLabelText("Filters: 3")).toBeTruthy();
    await fireEvent.press(view.getByLabelText("Remove price filter"));
    expect(state.feed).toHaveBeenLastCalledWith(expect.objectContaining({ filters: { sort: "newest", cityId: "ashgabat", yearMin: 2018, yearMax: 2020 } }));
    await fireEvent.press(view.getByLabelText("Remove year filter"));
    await fireEvent.press(view.getByLabelText("Remove city filter"));
    expect(state.feed).toHaveBeenLastCalledWith(expect.objectContaining({ filters: { sort: "newest" } }));
  });
  it("shows large-card loading and retains filters on an offline error", async () => {
    state.pending = true;
    const view = await renderMobile(<ResultsScreen />);
    expect(view.getByLabelText("Loading listings")).toBeTruthy();
    state.pending = false; state.error = true;
    await view.rerender(<ResultsScreen />);
    expect(view.getByLabelText("Filters: 0")).toBeTruthy();
    expect(view.getByText("Retry")).toBeTruthy();
  });
  it("Retry reloads the failed queries a mounted screen uses (count, catalog names) and leaves other screens' failed queries alone", async () => {
    state.error = true;
    const failedOnce = () => vi.fn().mockRejectedValueOnce(new Error("Network request failed")).mockResolvedValue("ok");
    const active = failedOnce();
    const inactive = failedOnce();
    const healthy = vi.fn().mockResolvedValue("ok");
    const view = await renderMobile(<><ResultsScreen /><QueryProbe queryKey={["failed-behind-the-screen"]} queryFn={active} /></>);
    await view.queryClient.fetchQuery({ queryKey: ["failed-on-another-screen"], queryFn: inactive }).catch(() => undefined);
    await view.queryClient.fetchQuery({ queryKey: ["loaded-before-the-outage"], queryFn: healthy });
    await act(async () => { await Promise.resolve(); });
    expect(active).toHaveBeenCalledTimes(1);
    await act(async () => { await fireEvent.press(view.getByText("Retry")); });
    expect(active).toHaveBeenCalledTimes(2);
    expect(inactive).toHaveBeenCalledTimes(1);
    expect(healthy).toHaveBeenCalledTimes(1);
  });
  it("Retry also restarts a query that is paused behind the screen, not only failed ones", async () => {
    state.error = true;
    const values = vi.fn().mockResolvedValueOnce("first").mockRejectedValue(new Error("Network request failed"));
    const view = await renderMobile(<><ResultsScreen /><QueryProbe queryKey={["paused-behind-the-screen"]} queryFn={values} networkMode="offlineFirst" retry={1} retryDelay={0} /></>);
    await act(async () => { await Promise.resolve(); });
    expect(values).toHaveBeenCalledTimes(1);
    try {
      onlineManager.setOnline(false);
      await act(async () => { void view.queryClient.refetchQueries({ queryKey: ["paused-behind-the-screen"] }); await new Promise((resolve) => setTimeout(resolve, 20)); });
      expect(view.queryClient.getQueryState(["paused-behind-the-screen"])?.fetchStatus).toBe("paused");
      const calls = values.mock.calls.length;
      await act(async () => { await fireEvent.press(view.getByText("Retry")); });
      expect(values.mock.calls.length).toBeGreaterThan(calls);
    } finally { onlineManager.setOnline(true); }
  });
  it("shows an offline recovery instead of indefinite skeletons when the initial query is paused", async () => {
    state.pending = true; state.paused = true;
    const view = await renderMobile(<ResultsScreen />);
    expect(view.getByText("No internet connection. Try again when you are online.")).toBeTruthy();
    expect(view.getByText("Retry")).toBeTruthy();
    expect(view.queryByLabelText("Loading listings")).toBeNull();
  });
  it("shows brand-only selection and the approved large-card content", async () => {
    Object.assign(routeParams, { brandId: "toyota" });
    const view = await renderMobile(<ResultsScreen />);
    expect(view.getByText("All models · choose models")).toBeTruthy();
    expect(getAllHosts(view.container, "Image").map((image) => image.props.source?.uri)).toContain("https://files.test/toyota.png");
    expect(view.getByText("Toyota Camry, 2018")).toBeTruthy();
    expect(view.getByText("80,000 km · Automatic · Petrol")).toBeTruthy();
    expect(view.getByText("Ashgabat · Today")).toBeTruthy();
    expect(view.getByLabelText("Photos: 7")).toBeTruthy();
    expect(view.getAllByTestId("listing-photo")).toHaveLength(2);
    await fireEvent.press(view.getByRole("button", { name: /Toyota Camry, 2018/ }));
    expect(routerMock.push).toHaveBeenCalledWith("/(public)/listings/listing-1");
  });
});

describe("Results floating filters row", () => {
  const scrollTo = (view: Awaited<ReturnType<typeof renderMobile>>, y: number) =>
    fireEvent.scroll(view.getByTestId("results-list"), { nativeEvent: { contentOffset: { y } } });
  it("shows a second filters row on an upward scroll past 180pt and hides it on a downward scroll (#781)", async () => {
    Object.assign(routeParams, { cityId: "ashgabat" });
    const view = await renderMobile(<ResultsScreen />);
    const rows = () => view.getAllByLabelText("Filters: 1");
    expect(rows()).toHaveLength(1);
    await scrollTo(view, 181);
    expect(rows()).toHaveLength(1);
    await scrollTo(view, 400);
    expect(rows()).toHaveLength(1);
    await scrollTo(view, 300);
    expect(rows()).toHaveLength(2);
    expect(view.getAllByLabelText("Remove city filter")).toHaveLength(2);
    await scrollTo(view, 320);
    expect(rows()).toHaveLength(1);
    await scrollTo(view, 310);
    expect(rows()).toHaveLength(2);
    await scrollTo(view, 0);
    expect(rows()).toHaveLength(1);
  });
  it("keeps the floating row working: its chip removes the filter and its Filters button opens the form", async () => {
    Object.assign(routeParams, { cityId: "ashgabat" });
    const view = await renderMobile(<ResultsScreen />);
    await scrollTo(view, 400);
    await scrollTo(view, 300);
    await fireEvent.press(matchAt(view.getAllByLabelText("Filters: 1"), 1));
    expect(routerMock.push).toHaveBeenCalledWith({ pathname: "/(tabs)/(search)/parameters", params: expect.objectContaining({ cityId: "ashgabat", returnToResults: "1" }) });
    await fireEvent.press(matchAt(view.getAllByLabelText("Remove city filter"), 1));
    expect(state.feed).toHaveBeenLastCalledWith(expect.objectContaining({ filters: { sort: "newest" } }));
    expect(view.getAllByLabelText("Filters: 0")).toHaveLength(2);
  });
});

describe("Results opens the full-screen Search parameters form", () => {
  const parametersPath = "/(tabs)/(search)/parameters";
  it("pushes the form pre-filled with the applied filters and sort from the Filters button", async () => {
    Object.assign(routeParams, { brandId: "toyota", modelIds: "camry,corolla", cityId: "ashgabat", condition: "used", priceMin: "70000", sort: "price_asc" });
    const view = await renderMobile(<ResultsScreen />);
    await fireEvent.press(view.getByLabelText("Filters: 2"));
    expect(routerMock.push).toHaveBeenCalledOnce();
    expect(routerMock.push).toHaveBeenCalledWith({
      pathname: parametersPath,
      params: expect.objectContaining({ brandId: "toyota", modelIds: "camry,corolla", cityId: "ashgabat", condition: "used", priceMin: "70000", sort: "price_asc", returnToResults: "1" }),
    });
  });
  it("renders no filter sheet: the form is its own screen", async () => {
    const view = await renderMobile(<ResultsScreen />);
    await fireEvent.press(view.getByLabelText("Filters: 0"));
    expect(view.queryByText("Car filters")).toBeNull();
    expect(view.queryByText("Reset all")).toBeNull();
  });
  it("ignores a stale openFilters parameter instead of opening a sheet", async () => {
    Object.assign(routeParams, { openFilters: "1" });
    const view = await renderMobile(<ResultsScreen />);
    expect(view.queryByText("Car filters")).toBeNull();
    expect(routerMock.push).not.toHaveBeenCalled();
    expect(routerMock.setParams.mock.calls.filter(([params]) => "openFilters" in params)).toEqual([]);
  });
  it("keeps the current sort when no-match Reset filters clears the filters", async () => {
    state.empty = true;
    Object.assign(routeParams, { cityId: "ashgabat", condition: "used", sort: "year_asc" });
    const view = await renderMobile(<ResultsScreen />);
    await fireEvent.press(view.getByText("Reset filters"));
    expect(routerMock.setParams).toHaveBeenLastCalledWith(expect.objectContaining({ cityId: undefined, condition: undefined, sort: "year_asc" }));
    expect(state.feed).toHaveBeenLastCalledWith(expect.objectContaining({ filters: { sort: "year_asc" } }));
    expect(view.getByText("Oldest year first")).toBeTruthy();
  });
});

describe("Results large card replacement", () => {
  it("renders title and specs in the approved order", async () => {
    const view = await renderMobile(<ResultsScreen />);
    expect(view.getByText("Toyota Camry, 2018")).toBeTruthy();
    expect(view.getByText("80,000 km · Automatic · Petrol")).toBeTruthy();
  });
  it("shows the two-photo grid and total photo count for a Listing with photos", async () => {
    const view = await renderMobile(<ResultsScreen />);
    expect(view.getAllByTestId("listing-photo")).toHaveLength(2);
    expect(view.getByLabelText("Photos: 7")).toBeTruthy();
  });
  it("shows city and a relative publication date", async () => {
    const view = await renderMobile(<ResultsScreen />);
    expect(view.getByText("Ashgabat · Today")).toBeTruthy();
  });
  it("offers an accessible favorite button on the card", async () => {
    const view = await renderMobile(<ResultsScreen />);
    expect(view.getByRole("button", { name: "Favorite" })).toBeTruthy();
  });
});
