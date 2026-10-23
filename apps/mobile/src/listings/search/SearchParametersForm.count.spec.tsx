import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { renderMobile, act, fireEvent } from "../../../test/render";

import { SearchParametersForm } from "./SearchParametersForm";
import type { ListingFilter } from "./useListingFilters";

const api = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock("react-native-safe-area-context", async () => ({
  SafeAreaView: (await import("react-native")).View,
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
vi.mock("../../api/client", () => ({ apiClient: api, ApiError: class ApiError extends Error {} }));
vi.mock("@react-native-async-storage/async-storage", () => ({ default: { getItem: vi.fn(async () => null), setItem: vi.fn(async () => undefined), removeItem: vi.fn(async () => undefined) } }));
vi.mock("../../api/catalog/useBrands", () => ({ useBrands: () => ({ data: { items: [] } }) }));
vi.mock("../../api/catalog/useModels", () => ({ useModels: () => ({ data: { items: [] } }) }));
vi.mock("../../api/catalog/useCatalogSearch", () => ({ useCatalogSearch: () => ({ data: undefined }) }));
vi.mock("../../api/catalog/useRegions", () => ({ useRegions: () => ({ data: { items: [] }, isPending: false, isError: false }) }));
vi.mock("../../api/catalog/useCities", () => ({ useCities: () => ({ data: { items: [] }, isPending: false, isError: false }) }));
vi.mock("../../api/listings/useListingModelCounts", () => ({ useListingModelCounts: () => ({ data: { items: [] } }) }));
vi.mock("../../api/listings/useListingBrandCounts", () => ({ useListingBrandCounts: () => ({ data: { items: [] } }) }));

const open = (initial: ListingFilter) =>
  renderMobile(<SearchParametersForm initial={initial} returnToResults onBack={vi.fn()} />);
const requestedUrls = () => api.get.mock.calls.map((call) => String(call[0]));
const settle = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

// The real count hook runs here; only the transport is faked, so a request the
// API would answer with HTTP 400 is visible as a dispatched URL.
describe("Search parameters: count requests while the year range is edited", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    api.get.mockReset();
    api.get.mockResolvedValue({ totalMatching: 5 });
  });
  afterEach(() => vi.useRealTimers());

  it("counts the selected seller type through the real hook before applying", async () => {
    const view = await open({ sort: "newest" });
    await fireEvent.press(view.getByRole("button", { name: "Business Seller type" }));
    await settle(500);
    expect(requestedUrls().some(url => url.includes("sellerType=business"))).toBe(true);
    expect(view.getByRole("button", { name: "Business Seller type" }).props.accessibilityState.selected).toBe(true);
  });

  it("requests no invalid year range when an inverted range is corrected, then shows the current count", async () => {
    const view = await open({ yearMin: 2020, yearMax: 2018, sort: "newest" });
    await settle(500);
    expect(api.get).not.toHaveBeenCalled();
    expect(view.getByText("Check filter values")).toBeTruthy();

    await fireEvent.changeText(view.getByLabelText("To"), "2021");
    await settle(300);
    await settle(10);

    expect(requestedUrls().filter((url) => url.includes("yearMax=2018"))).toEqual([]);
    expect(requestedUrls()).toEqual(["/listings/count?yearMin=2020&yearMax=2021&sort=newest"]);
    expect(view.getByRole("button", { name: /Show 5/ })).toBeTruthy();
  });

  it("requests no invalid year range when a valid range is broken and then corrected", async () => {
    const view = await open({ yearMin: 2018, yearMax: 2020, sort: "newest" });
    await settle(300);
    api.get.mockClear();

    await fireEvent.changeText(view.getByLabelText("To"), "2015");
    await settle(500);
    expect(api.get).not.toHaveBeenCalled();

    await fireEvent.changeText(view.getByLabelText("To"), "2022");
    await settle(300);

    expect(requestedUrls().filter((url) => url.includes("yearMax=2015"))).toEqual([]);
    expect(requestedUrls()).toEqual(["/listings/count?yearMin=2018&yearMax=2022&sort=newest"]);
  });
});

describe("Search parameters: count error and Retry", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    api.get.mockReset();
  });
  afterEach(() => vi.useRealTimers());

  it("offers Retry when the count fails and shows the count once Retry succeeds", async () => {
    api.get.mockRejectedValueOnce(new Error("count failed")).mockResolvedValue({ totalMatching: 7 });
    const view = await open({ brandId: "toyota", sort: "newest" });
    await settle(10);

    expect(view.getByText("Could not load listing count")).toBeTruthy();
    expect(view.getByRole("button", { name: "Show results" })).toBeTruthy();

    await fireEvent.press(view.getByRole("button", { name: "Retry" }));
    await settle(10);

    expect(api.get).toHaveBeenCalledTimes(2);
    expect(requestedUrls()[1]).toBe(requestedUrls()[0]);
    expect(view.queryByText("Could not load listing count")).toBeNull();
    expect(view.getByRole("button", { name: "Show 7 listings" })).toBeTruthy();
  });
});

describe("Search parameters: Show N wording", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    api.get.mockReset();
  });
  afterEach(() => vi.useRealTimers());

  it.each([
    ["en", 0, "Show 0 listings"],
    ["en", 1, "Show 1 listing"],
    ["en", 12, "Show 12 listings"],
    ["ru", 1, "Показать 1 объявление"],
    ["ru", 3, "Показать 3 объявления"],
    ["ru", 5, "Показать 5 объявлений"],
    ["tk", 1, "1 bildirişi görkez"],
  ])("in %s reads the count %i as %s", async (locale, total, label) => {
    api.get.mockResolvedValue({ totalMatching: total });
    const view = await renderMobile(<SearchParametersForm initial={{ sort: "newest" }} returnToResults onBack={vi.fn()} />, { locale });
    await settle(10);

    expect(view.getByRole("button", { name: label })).toBeTruthy();
  });
});
