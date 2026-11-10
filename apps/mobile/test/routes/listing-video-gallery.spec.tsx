import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ListingDetailScreen from "../../app/(public)/listings/[id]";
import { clearAuthSession, storeAuthSession } from "../../src/auth/session";
import { fixture, mediaFixture, readyVideoFixture, videoCoverAccessFixture } from "../fixtures/listing";
import { server } from "../msw";
import { createdPlayers } from "../native-video";
import { fireEvent, getAllHosts, getHost, renderMobile, routeParams, routerMock, screenFocus, within } from "../render";

// Secure storage is the session's device boundary; a Map keeps the signed-in buyer across reads.
vi.mock("expo-secure-store", () => {
  const values = new Map<string, string>();
  return {
    getItemAsync: async (key: string) => values.get(key) ?? null,
    setItemAsync: async (key: string, value: string) => { values.set(key, value); },
    deleteItemAsync: async (key: string) => { values.delete(key); },
  };
});

// The real detail route, queries, strip and viewer; HTTP goes through MSW and
// the player route is reached through the router boundary.
const listing = fixture({
  brandId: "00000000-0000-4000-8000-000000000001",
  modelId: "00000000-0000-4000-8000-000000000002",
  generationId: "00000000-0000-4000-8000-000000000003",
  regionId: "00000000-0000-4000-8000-000000000004",
  cityId: "00000000-0000-4000-8000-000000000005",
  media: mediaFixture(3),
  video: readyVideoFixture(),
});
const cover = videoCoverAccessFixture(listing.id).video.cover;
const user = { id: "00000000-0000-4000-8000-000000000111", phone: null, email: "buyer@example.com", displayName: null, role: "seller" as const };
const PLAYER = `/(public)/listings/${listing.id}/video`;
let requests: string[] = [];

beforeEach(async () => {
  requests = [];
  routeParams.id = listing.id;
  await storeAuthSession({ accessToken: "test-token", refreshToken: "test-refresh", user });
  server.events.on("request:start", ({ request }) => { requests.push(`${request.method} ${new URL(request.url).pathname}`); });
  server.use(
    http.get("*/listings/video-access/viewer/listing/:id", () => HttpResponse.json(videoCoverAccessFixture(listing.id))),
    http.get("*/listings/:id/similar", () => HttpResponse.json({ items: [] })),
    http.get("*/listings/:id", () => HttpResponse.json(listing)),
    http.get("*/catalog/*", () => HttpResponse.json({ items: [], nextCursor: null, hasMore: false })),
    http.get("*/config", () => HttpResponse.json({ reportEntryEnabled: true, adminModerationActionsEnabled: false, inspectionInterestEnabled: false })),
    http.get("*/exchange-rates*", () => HttpResponse.json({ rates: [] })),
  );
});
afterEach(async () => {
  server.events.removeAllListeners();
  await clearAuthSession();
});

/** Nothing that could start playback left the app: no Play control, no playlist, no native player. */
function expectNothingPlayed() {
  expect(requests.filter((request) => request.startsWith("POST") || request.includes("video-files"))).toEqual([]);
  expect(createdPlayers).toHaveLength(0);
}

describe("Listing detail video tile", () => {
  it("shows the video cover second in the 4:3 strip and opens the player on Play", async () => {
    const screen = await renderMobile(<ListingDetailScreen />);
    const play = await screen.findByRole("button", { name: "Play video, 42 seconds" });
    expect(screen.getByRole("button", { name: "1 of 4" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "3 of 4" })).toBeTruthy();
    const strip = screen.getByTestId("detail-photo-strip");
    expect(getAllHosts(strip, "Image").map((image) => image.props.source.uri)[1]).toBe(cover.detail);
    expectNothingPlayed();
    await fireEvent.press(play);
    expect(routerMock.push).toHaveBeenCalledWith(PLAYER);
  });

  it("lands on the video when a card's video tile opened the Listing", async () => {
    routeParams.media = "video";
    const screen = await renderMobile(<ListingDetailScreen />);
    await screen.findByRole("button", { name: "Play video, 42 seconds" });
    // One interval in: the 358 dp tile and its 2 dp seam.
    expect(screen.getByTestId("detail-photo-strip").props.contentOffset).toEqual({ x: 360, y: 0 });
    expectNothingPlayed();
  });
});

describe("Listing detail video audience and status", () => {
  it("reads the cover as owner-preview and plays with that audience on the owner's pending Listing", async () => {
    const owned = { ...listing, sellerId: user.id, status: "pending_review" as const };
    server.use(
      http.get("*/listings/video-access/owner-preview/listing/:id", () => HttpResponse.json(videoCoverAccessFixture(listing.id))),
      http.get("*/listings/:id", () => HttpResponse.json(owned)),
    );
    const screen = await renderMobile(<ListingDetailScreen />);
    const play = await screen.findByRole("button", { name: "Play video, 42 seconds" });
    expect(requests.filter((request) => request.includes("video-access"))).toEqual([
      `GET /api/v1/listings/video-access/owner-preview/listing/${listing.id}`,
    ]);
    await fireEvent.press(play);
    expect(routerMock.push).toHaveBeenCalledWith(`${PLAYER}?audience=owner-preview`);
  });

  it("shows no video tile to a buyer on an archived Listing", async () => {
    server.use(http.get("*/listings/:id", () => HttpResponse.json({ ...listing, status: "archived" as const })));
    const screen = await renderMobile(<ListingDetailScreen />);
    await screen.findByRole("button", { name: /1 of 3/ });
    expect(screen.queryByRole("button", { name: /Play video/ })).toBeNull();
    expect(requests.filter((request) => request.includes("video-access"))).toEqual([]);
  });

  it("refreshes the detail cover when its grant expires, not on a fixed timer", async () => {
    server.use(
      http.get("*/listings/video-access/viewer/listing/:id", () => HttpResponse.json({
        ...videoCoverAccessFixture(listing.id),
        expiresAt: new Date(Date.now() + 10_000).toISOString(),
      })),
    );
    const screen = await renderMobile(<ListingDetailScreen />);
    await screen.findByRole("button", { name: "Play video, 42 seconds" });
    const coverQuery = screen.queryClient.getQueryCache().getAll().find((query) => JSON.stringify(query.queryKey).includes("video-cover"));
    if (!coverQuery) throw new Error("the detail cover query is missing");
    const interval = (coverQuery.options as { refetchInterval?: unknown }).refetchInterval;
    const ms = typeof interval === "function" ? interval(coverQuery as never) : interval;
    // The grant dies in 10 seconds, so the refresh is due well inside it —
    // never the old fixed four minutes a short local grant would outlive.
    expect(ms).toBeGreaterThan(0);
    expect(ms).toBeLessThan(10_000);
  });
});

describe("Fullscreen gallery video", () => {
  it("counts the video, pages to its cover without playing, and returns to it after the player", async () => {
    const screen = await renderMobile(<ListingDetailScreen />);
    await fireEvent.press(await screen.findByRole("button", { name: "1 of 4" }));
    expect(screen.getByText("1 / 4")).toBeTruthy();

    const thumbnail = screen.getByRole("button", { name: "Video, 42 seconds" });
    expect(getHost(thumbnail, "Image").props.source.uri).toBe(cover.thumbnail);
    await fireEvent.press(thumbnail);
    expect(screen.getByText("2 / 4")).toBeTruthy();
    const page = screen.getByTestId("photo-viewer-pager");
    const play = within(page).getByRole("button", { name: "Play video, 42 seconds" });
    expect(getAllHosts(page, "Image").some((image) => image.props.source.uri === cover.detail)).toBe(true);
    expectNothingPlayed();

    await fireEvent.press(play);
    expect(routerMock.push).toHaveBeenCalledWith(PLAYER);
    expect(screen.queryByText("2 / 4")).toBeNull();

    // The player covers detail, then closes back onto it.
    screenFocus.focused = false;
    await screen.rerender(<ListingDetailScreen />);
    screenFocus.focused = true;
    await screen.rerender(<ListingDetailScreen />);
    expect(screen.getByText("2 / 4")).toBeTruthy();
    // Reopening on the video counts as loaded: its neighbour photos show too.
    const pagerUris = getAllHosts(screen.getByTestId("photo-viewer-pager"), "Image").map((image) => String(image.props.source.uri));
    expect(pagerUris.some((uri) => uri.includes("media.test/1/detail.webp"))).toBe(true);
  });

  it("swiping onto the video shows its cover and Play, not playback", async () => {
    const screen = await renderMobile(<ListingDetailScreen />);
    await fireEvent.press(await screen.findByRole("button", { name: "1 of 4" }));
    await fireEvent(screen.getByTestId("photo-viewer-pager"), "momentumScrollEnd", { nativeEvent: { contentOffset: { x: 390, y: 0 } } });
    expect(screen.getByText("2 / 4")).toBeTruthy();
    expect(within(screen.getByTestId("photo-viewer-pager")).getByRole("button", { name: "Play video, 42 seconds" })).toBeTruthy();
    expectNothingPlayed();
  });
});
