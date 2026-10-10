import type { ListingsSchemas } from "@auto-tm/contracts";
import { useQuery } from "@tanstack/react-query";
import { Pressable, Text } from "react-native";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderMobile, act, fireEvent } from "../render";
import FavoritesScreen from "../../app/(tabs)/favorites";
import { useListingFavorite } from "../../src/listings/useListingFavorite";
import { queryKeys } from "../../src/api/queryKeys";
import { FAVORITE_REMOVAL_DELAY_MS } from "../../src/api/listings/useFavoriteRemoval";
import { useHideSoldStore } from "../../src/listings/favorites/useFavoritesView";

import { ToastProvider } from "@/components/ui/toast";

type Favorite = ListingsSchemas.FavoriteListingSummary;

const api = vi.hoisted(() => ({ get: vi.fn(), delete: vi.fn(), post: vi.fn() }));
vi.mock("../../src/api/client", () => ({
  apiClient: api,
  ApiError: class ApiError extends Error { constructor(public code: string, public status: number) { super(code); } },
}));
vi.mock("react-native-safe-area-context", async () => ({
  SafeAreaView: (await import("react-native")).View,
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
vi.mock("../../src/auth/useAuth", () => ({ useAuth: () => ({ isAuthenticated: true, phone: "" }) }));
vi.mock("../../src/auth/useViewer", () => ({ useViewer: () => ({ userId: "me" }) }));
vi.mock("../../src/conversations/useOpenListingConversation", () => ({
  useOpenListingConversation: () => ({ open: vi.fn(), retry: vi.fn(), isPending: false, error: null }),
}));
vi.mock("../../src/listings/feed/useFeedCatalogMaps", () => ({ useFeedCatalogMaps: () => ({
  brandName: () => "Toyota", brandLogoUrl: () => undefined, cityName: () => "Ashgabat", modelName: (id: string) => id,
}) }));
vi.mock("../../src/api/catalog/useTransmissions", () => ({ useTransmissions: () => ({ data: { items: [] } }) }));
vi.mock("../../src/api/catalog/useEngineTypes", () => ({ useEngineTypes: () => ({ data: { items: [] } }) }));

function favorite(id: string): Favorite {
  return {
    id, sellerId: "seller", status: "active", brandId: "toyota", modelId: id, year: 2018, priceAmount: 1, priceCurrency: "TMT",
    displayPriceTmt: 100000, photoKeys: [], photoCount: 0, cityId: "city", publishedAt: "2026-09-30T04:00:00.000Z",
    allowCalls: false, allowChat: false, isFavorited: true,
  };
}

let favorites: Favorite[];
async function settle() {
  for (let i = 0; i < 6; i += 1) await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
}

const FEED_KEY = queryKeys.listings.list({ limit: 20 }, "me");
type FeedPages = { pages: { items: { id: string; isFavorited?: boolean }[] }[] };

/** A feed card's ♡, as Home and Results use it: `isFavorited` comes from the cached feed page. */
function FeedHeart({ id }: { id: string }) {
  const feed = useQuery<FeedPages>({ queryKey: FEED_KEY, queryFn: () => new Promise(() => {}), enabled: false });
  const isFavorited = feed.data?.pages[0]?.items.find((item) => item.id === id)?.isFavorited ?? false;
  const { favorited, toggle } = useListingFavorite({ listingId: id, isFavorited, isAuthenticated: true, returnTo: "/" });
  return <Pressable accessibilityRole="button" accessibilityLabel={`feed-heart-${id}`} onPress={toggle}><Text>{favorited ? "♥" : "♡"}</Text></Pressable>;
}

beforeEach(() => {
  useHideSoldStore.setState({ hideSold: true });
  favorites = [favorite("camry")];
  api.get.mockReset().mockImplementation(() => Promise.resolve({ items: favorites, nextCursor: null, counts: { total: favorites.length, inactive: 0 } }));
  api.post.mockReset().mockImplementation((url: string) => {
    const id = url.split("/")[2] as string;
    favorites = [favorite(id), ...favorites];
    return Promise.resolve({ id: "00000000-0000-4000-8000-000000000001", userId: "00000000-0000-4000-8000-000000000002", listingId: id, createdAt: "2026-10-11T00:00:00.000Z" });
  });
  api.delete.mockReset().mockImplementation((url: string) => {
    const id = url.split("/")[2];
    favorites = favorites.filter((item) => item.id !== id);
    return Promise.resolve({ success: true });
  });
});

describe("Favorites stays in step with a ♡ elsewhere", () => {
  it("shows a Listing favorited from a feed card while the tab is mounted", async () => {
    const view = renderMobile(<ToastProvider><FavoritesScreen /><FeedHeart id="prado" /></ToastProvider>);
    await settle();
    expect(view.queryByText("Toyota prado, 2018")).toBeNull();

    fireEvent.press(view.getByLabelText("feed-heart-prado"));
    await settle();

    expect(api.post).toHaveBeenCalledWith("/listings/prado/favorite", {}, expect.anything());
    expect(view.getByText("Toyota prado, 2018")).toBeTruthy();
  });

  it("turns a feed card's ♥ back to ♡ when the Favorite is removed on the tab, and keeps it after a refetch", async () => {
    const view = renderMobile(<ToastProvider><FavoritesScreen /><FeedHeart id="camry" /></ToastProvider>);
    const queryClient = view.queryClient;
    queryClient.setQueryData(FEED_KEY, { pages: [{ items: [{ id: "camry", isFavorited: true }], nextCursor: null }], pageParams: [null] });
    await settle();
    expect(view.getByLabelText("feed-heart-camry")).toHaveTextContent("♥");

    vi.useFakeTimers({ shouldAdvanceTime: true });
    fireEvent.press(view.getByRole("button", { name: "Remove from Favorites" }));
    await act(async () => { await vi.advanceTimersByTimeAsync(FAVORITE_REMOVAL_DELAY_MS + 50); });
    vi.useRealTimers();
    await settle();

    expect(api.delete).toHaveBeenCalledWith("/listings/camry/favorite", expect.anything());
    expect(view.getByLabelText("feed-heart-camry")).toHaveTextContent("♡");

    // The feed refetches with the server's answer: still ♡.
    queryClient.setQueryData(FEED_KEY, { pages: [{ items: [{ id: "camry", isFavorited: false }], nextCursor: null }], pageParams: [null] });
    await settle();
    expect(view.getByLabelText("feed-heart-camry")).toHaveTextContent("♡");
  });
});
