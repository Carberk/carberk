import { http, HttpResponse } from "msw";
import type { ListingsSchemas } from "@auto-tm/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { server } from "../../../test/msw";
import { fireEvent, getAllHosts, renderMobile, within } from "../../../test/render";
import { createdPlayers } from "../../../test/native-video";
import { readyVideoFixture, videoCoverAccessFixture } from "../../../test/fixtures/listing";
import { clearAuthSession, storeAuthSession } from "../../auth/session";
import { FavoriteListingCard } from "../favorites/FavoriteListingCard";

import { ListingLargeCard } from "./ListingLargeCard";

// Secure storage is the session's device boundary; a Map keeps the signed-in buyer across reads.
vi.mock("expo-secure-store", () => {
  const values = new Map<string, string>();
  return {
    getItemAsync: async (key: string) => values.get(key) ?? null,
    setItemAsync: async (key: string, value: string) => { values.set(key, value); },
    deleteItemAsync: async (key: string) => { values.delete(key); },
  };
});

const LISTING_ID = "00000000-0000-4000-8000-000000000373";
const user = { id: "00000000-0000-4000-8000-000000000111", phone: null, email: "buyer@example.com", displayName: null, role: "seller" as const };
const cover = videoCoverAccessFixture(LISTING_ID).video.cover;
const summary = {
  id: LISTING_ID, sellerId: "seller", status: "active", brandId: "brand", modelId: "model", year: 2018,
  priceAmount: 2, priceCurrency: "USD", displayPriceTmt: 70000, photoKeys: ["one.webp", "two.webp"], photoCount: 7,
  cityId: "city", publishedAt: "2026-09-30T04:00:00.000Z", video: readyVideoFixture(),
} satisfies ListingsSchemas.ListingSummary;
const feedItem: ListingsSchemas.FeedListingSummary = {
  ...summary, galleryKeys: ["one.webp", "two.webp", "three.webp"], photoCount: 3, allowCalls: true, allowChat: true,
  seller: { displayName: "Aman", nameNumber: 4821, deleted: false },
};
const favorite: ListingsSchemas.FavoriteListingSummary = {
  ...summary, isFavorited: true, contactPhone: "+99365000000", allowCalls: true, allowChat: true,
};

/** Every request the fake server saw, so a spec can prove nothing but the cover grant left before Play. */
let requests: string[] = [];

beforeEach(async () => {
  requests = [];
  await storeAuthSession({ accessToken: "test-token", refreshToken: "test-refresh", user });
  server.events.on("request:start", ({ request }) => { requests.push(`${request.method} ${new URL(request.url).pathname}`); });
  server.use(
    http.get("*/listings/video-access/viewer/listing/:id", ({ params }) => HttpResponse.json(videoCoverAccessFixture(String(params["id"])))),
  );
});
afterEach(async () => {
  server.events.removeAllListeners();
  await clearAuthSession();
});

function resultsCard(listing: ListingsSchemas.FeedListingSummary = feedItem, locale = "en") {
  const onPress = vi.fn();
  return renderMobile(
    <ListingLargeCard listing={listing} brandName="Toyota" modelName="Camry" cityName="Ashgabat" isAuthenticated viewerId={user.id}
      returnTo="/(tabs)/(search)/results" onPress={onPress} />,
    { locale },
  ).then((view) => ({ view, onPress }));
}

/** The strip's images left to right: photos by key, the video by its cover URL. */
function stripSources(view: Awaited<ReturnType<typeof resultsCard>>["view"]) {
  return getAllHosts(view.getByTestId("listing-photo-strip"), "Image").map((image) => String(image.props.source?.uri ?? ""));
}

describe("Video cover on Results and Favorites cards", () => {
  it("puts the video cover second with Play and its duration, and opens the Listing on the video", async () => {
    const { view, onPress } = await resultsCard();
    const tile = await view.findByRole("button", { name: "Video, 42 seconds" });
    expect(within(tile).getByText("0:42")).toBeTruthy();
    expect(within(tile).getByTestId("video-cover-play")).toBeTruthy();
    await view.findByTestId("video-cover-image");
    const sources = stripSources(view);
    expect(sources[0]).toContain("one.webp");
    expect(sources[1]).toBe(cover.detail);
    expect(sources[2]).toContain("two.webp");
    await fireEvent.press(tile);
    expect(onPress).toHaveBeenCalledWith(LISTING_ID, { video: true });
  });

  it("counts the video in +N when the card holds fewer tiles than the Listing has", async () => {
    // Two keys from an older API, seven photos and a video: the cover photo, the video, then +6.
    const { view } = await resultsCard({ ...feedItem, galleryKeys: undefined, photoCount: 7 });
    await view.findByRole("button", { name: "Video, 42 seconds" });
    expect(view.getAllByTestId("listing-photo")).toHaveLength(1);
    expect(view.getByText("+6")).toBeTruthy();
  });

  it("never plays in the list: only the cover grant is requested", async () => {
    const { view } = await resultsCard();
    await view.findByRole("button", { name: "Video, 42 seconds" });
    expect(requests).toEqual([`GET /api/v1/listings/video-access/viewer/listing/${LISTING_ID}`]);
    expect(createdPlayers).toHaveLength(0);
  });

  it("keeps a card without a Ready video photo-only and asks for nothing", async () => {
    const { view } = await resultsCard({ ...feedItem, video: undefined });
    expect(view.queryByRole("button", { name: /Video/ })).toBeNull();
    expect(requests).toEqual([]);
  });

  it.each([["ru", "Видео, 42 секунды"], ["tk", "Wideo, 42 sekunt"]])("labels the video tile in %s", async (locale, label) => {
    const { view } = await resultsCard(feedItem, locale);
    expect(await view.findByRole("button", { name: label })).toBeTruthy();
  });

  it("shows the same video tile on a Favorites card", async () => {
    const onPress = vi.fn();
    const view = await renderMobile(
      <FavoriteListingCard listing={favorite} brandName="Toyota" modelName="Camry" cityName="Ashgabat" onPress={onPress} isOwn={false} onRemoveFavorite={vi.fn()} />,
    );
    const tile = await view.findByRole("button", { name: "Video, 42 seconds" });
    expect(within(tile).getByText("0:42")).toBeTruthy();
    expect(view.getByText("+6")).toBeTruthy();
    await fireEvent.press(tile);
    expect(onPress).toHaveBeenCalledWith(LISTING_ID, { video: true });
    expect(createdPlayers).toHaveLength(0);
  });
});
