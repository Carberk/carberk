import { beforeEach, describe, expect, it, vi } from "vitest";
import { waitFor } from "@testing-library/react-native";

import { renderMobile, fireEvent, routeParams, routerMock, act } from "../render";
import ResultsScreen from "../../app/(tabs)/(search)/results";
import { useAuthIntentStore } from "../../src/auth/intentStore";
import { queryKeys } from "../../src/api/queryKeys";

const state = vi.hoisted(() => ({
  feed: vi.fn(), count: vi.fn(), pending: false, error: false, empty: false, viewer: null as null | { userId: string }, focused: true, post: vi.fn(),
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
vi.mock("../../src/api/client", () => ({ apiClient: { get: vi.fn(), post: state.post, delete: vi.fn() }, ApiError: class ApiError extends Error {} }));
// Catalog hooks and device storage behind the real screen are replaced.
vi.mock("@react-native-async-storage/async-storage", () => ({ default: { getItem: vi.fn(async () => null), setItem: vi.fn(async () => undefined), removeItem: vi.fn(async () => undefined) } }));
vi.mock("../../src/api/catalog/useBrands", () => ({ useBrands: () => ({ data: { items: [{ id: "toyota", name: "Toyota" }] } }) }));
vi.mock("../../src/api/catalog/useRegions", () => ({ useRegions: () => ({ data: { items: [] }, isPending: false, isError: false }) }));
vi.mock("../../src/api/catalog/useCities", () => ({ useCities: () => ({ data: { items: [] }, isPending: false, isError: false }) }));
vi.mock("../../src/auth/useViewer", () => ({ useViewer: () => state.viewer }));
vi.mock("../../src/listings/feed/useFeedCatalogMaps", () => ({ useFeedCatalogMaps: () => ({ brandName: () => "Toyota", brandLogoUrl: () => undefined, modelName: (id: string) => ({ camry: "Camry", corolla: "Corolla", rav4: "RAV4" })[id], cityName: () => "Ashgabat" }) }));
vi.mock("../../src/api/catalog/useModels", () => ({ useModels: () => ({ data: { items: [{ id: "camry", name: "Camry" }, { id: "corolla", name: "Corolla" }, { id: "rav4", name: "RAV4" }] } }) }));
vi.mock("../../src/api/catalog/useTransmissions", () => ({ useTransmissions: () => ({ data: { items: [{ id: "auto", name: "Automatic" }] } }) }));
vi.mock("../../src/api/catalog/useEngineTypes", () => ({ useEngineTypes: () => ({ data: { items: [{ id: "petrol", name: "Petrol" }] } }) }));
const listing = {
  id: "listing-1", sellerId: "seller", status: "active", brandId: "toyota", modelId: "camry", year: 2018,
  priceAmount: 1, priceCurrency: "USD", displayPriceTmt: 70000, photoKeys: ["one.jpg", "two.jpg"], photoCount: 7,
  mileageKm: 80000, transmissionId: "auto", engineTypeId: "petrol", cityId: "ashgabat", publishedAt: "2026-09-30T04:00:00.000Z",
};
vi.mock("../../src/api/listings/useListings", () => ({ useListings: (options: unknown) => {
  state.feed(options); return { data: { pages: [{ items: state.empty ? [] : [listing] }] }, isPending: state.pending,
    isError: state.error, error: new Error("Network request failed"), refetch: vi.fn(), isRefetching: false,
    fetchNextPage: vi.fn(), hasNextPage: false, isFetchingNextPage: false };
} }));
vi.mock("../../src/api/listings/useListingCount", () => ({ useListingCount: (options: unknown) => {
  state.count(options); return { data: { totalMatching: state.empty ? 0 : 12, priceMinTmt: state.empty ? null : 70000, priceMaxTmt: state.empty ? null : 120000 }, isPending: false };
} }));

vi.mock("expo-router", async () => {
  const mocks = await import("../native-setup");
  return { router: mocks.routerMock, useRouter: () => mocks.routerMock, useLocalSearchParams: () => mocks.routeParams, useIsFocused: () => state.focused, useFocusEffect: vi.fn() };
});

beforeEach(() => {
  state.viewer = null; state.focused = true; state.empty = false; state.post.mockReset(); state.feed.mockClear();
  state.post.mockResolvedValue({ id: "favorite", listingId: listing.id });
  useAuthIntentStore.setState({ intent: null, replayAction: null, replayReturnTo: null });
});
describe("Results favorite sign-in boundary", () => {
  it("returns to the same applied search and replays once only after focus, patching signed-in caches", async () => {
    Object.assign(routeParams, { brandId: "toyota", modelIds: "camry,corolla", cityId: "ashgabat", sort: "price_asc", yearMin: "2018" });
    const view = renderMobile(<ResultsScreen />);
    const signedIn = queryKeys.listings.list({ sort: "price_asc", limit: 20 }, "buyer");
    const anonymous = queryKeys.listings.list({ sort: "price_asc", limit: 20 }, null);
    for (const key of [signedIn, anonymous]) view.queryClient.setQueryData(key, { pages: [{ items: [{ ...listing, id: "page-1-listing", isFavorited: false }], nextCursor: "page-2" }, { items: [{ ...listing, isFavorited: false }], nextCursor: null }], pageParams: [null, "page-2"] });
    fireEvent.press(view.getByRole("button", { name: "Favorite" }));
    const intent = useAuthIntentStore.getState().intent;
    expect(intent).toEqual(expect.objectContaining({ action: { kind: "favorite", listingId: listing.id }, returnTo: expect.objectContaining({ pathname: "/(tabs)/(search)/results", params: expect.objectContaining({ brandId: "toyota", modelIds: "camry,corolla", cityId: "ashgabat", sort: "price_asc", yearMin: "2018" }) }) }));
    expect(routerMock.push).toHaveBeenCalledWith(expect.objectContaining({ pathname: "/(auth)/phone" }));
    expect(state.post).not.toHaveBeenCalled();
    state.focused = false; state.empty = true; view.rerender(<ResultsScreen />);
    act(() => useAuthIntentStore.getState().completeSignIn({ push: routerMock.push, dismissTo: vi.fn() }));
    expect(state.post).not.toHaveBeenCalled();
    expect(view.queryByRole("button", { name: "Favorite" })).toBeNull();
    state.viewer = { userId: "buyer" }; state.focused = true; view.rerender(<ResultsScreen />);
    await waitFor(() => expect(state.post).toHaveBeenCalledOnce());
    expect(state.post).toHaveBeenCalledWith(`/listings/${listing.id}/favorite`, {}, expect.anything());
    expect(state.feed).toHaveBeenLastCalledWith(expect.objectContaining({ viewerId: "buyer" }));
    expect(useAuthIntentStore.getState().replayAction).toBeNull();
    const saved = (key: typeof signedIn) => view.queryClient.getQueryData<{ pages: { items: { id: string; isFavorited: boolean }[] }[] }>(key)?.pages.flatMap((page) => page.items).find((item) => item.id === listing.id)?.isFavorited;
    expect(saved(signedIn)).toBe(true); expect(saved(anonymous)).toBe(false);
    view.rerender(<ResultsScreen />); expect(state.post).toHaveBeenCalledOnce();
  });
  it("cancelling sign-in drops the waiting favorite", () => {
    const view = renderMobile(<ResultsScreen />);
    fireEvent.press(view.getByRole("button", { name: "Favorite" }));
    act(() => useAuthIntentStore.getState().cancelSignIn());
    state.viewer = { userId: "buyer" }; view.rerender(<ResultsScreen />);
    expect(state.post).not.toHaveBeenCalled(); expect(useAuthIntentStore.getState().intent).toBeNull();
  });
});
