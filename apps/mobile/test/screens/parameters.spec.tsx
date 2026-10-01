import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderMobile, fireEvent, routeParams, routerMock } from "../render";
import SearchParametersScreen from "../../app/(tabs)/(search)/parameters";

vi.mock("react-native-safe-area-context", async () => ({
  SafeAreaView: (await import("react-native")).View,
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
vi.mock("@react-native-async-storage/async-storage", () => ({ default: { getItem: vi.fn(async () => null), setItem: vi.fn(async () => undefined), removeItem: vi.fn(async () => undefined) } }));
vi.mock("../../src/api/client", () => ({ apiClient: { get: vi.fn() }, ApiError: class ApiError extends Error {} }));
vi.mock("../../src/api/catalog/useBrands", () => ({ useBrands: () => ({ data: { items: [{ id: "toyota", name: "Toyota", slug: "toyota" }] } }) }));
vi.mock("../../src/api/catalog/useModels", () => ({ useModels: () => ({ data: { items: [{ id: "camry", name: "Camry" }, { id: "corolla", name: "Corolla" }] } }) }));
vi.mock("../../src/api/catalog/useRegions", () => ({ useRegions: () => ({ data: { items: [] }, isPending: false, isError: false }) }));
vi.mock("../../src/api/catalog/useCities", () => ({ useCities: () => ({ data: { items: [] }, isPending: false, isError: false }) }));
vi.mock("../../src/api/listings/useListingCount", () => ({ useListingCount: () => ({ data: { totalMatching: 12 }, isPending: false, isError: false }) }));

beforeEach(() => { routerMock.canGoBack.mockReturnValue(true); });

describe("Search parameters route", () => {
  it("opens pre-filled with the filters carried in the route", () => {
    Object.assign(routeParams, { brandId: "toyota", modelIds: "camry,corolla", condition: "new", yearMin: "2019", priceMax: "250000", sort: "year_desc", returnToResults: "1" });
    const view = renderMobile(<SearchParametersScreen />);
    expect(view.getByText("Search parameters")).toBeTruthy();
    expect(view.getByRole("button", { name: "New Condition", selected: true })).toBeTruthy();
    expect(view.getByLabelText("Brand: Toyota")).toBeTruthy();
    expect(view.getByLabelText("Model: 2 selected")).toBeTruthy();
    expect(view.getByDisplayValue("2019")).toBeTruthy();
    expect(view.getByDisplayValue("250000")).toBeTruthy();
  });

  it("Show N returns to the Results below with the form's filters and the carried sort", () => {
    Object.assign(routeParams, { condition: "used", sort: "year_desc", returnToResults: "1" });
    const view = renderMobile(<SearchParametersScreen />);
    fireEvent.press(view.getByRole("button", { name: "Show 12 listings" }));
    expect(routerMock.dismissTo).toHaveBeenCalledWith({ pathname: "/(tabs)/(search)/results", params: expect.objectContaining({ condition: "used", sort: "year_desc" }) });
    expect(routerMock.push).not.toHaveBeenCalled();
  });

  it("Back leaves the form without applying anything", () => {
    Object.assign(routeParams, { condition: "used", returnToResults: "1" });
    const view = renderMobile(<SearchParametersScreen />);
    fireEvent.press(view.getByRole("button", { name: "New Condition" }));
    fireEvent.press(view.getByRole("button", { name: "Back" }));
    expect(routerMock.back).toHaveBeenCalledOnce();
    expect(routerMock.dismissTo).not.toHaveBeenCalled();
    expect(routerMock.setParams).not.toHaveBeenCalled();
  });
});
