// @vitest-environment happy-dom

import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { queryKeys } from "../api/queryKeys";
import { useAuthIntentStore } from "../auth/intentStore";

import { useListingFavorite } from "./useListingFavorite";

const mockPush = vi.fn();

vi.mock("expo-router", () => ({
  router: {
    push: (...args: unknown[]) => mockPush(...args),
    dismissTo: vi.fn(),
  },
}));

/** Each request waits until the test answers it, in the order sent. */
type Call = { kind: "add" | "remove"; resolve: () => void; reject: () => void };
let calls: Call[] = [];
function request(kind: Call["kind"]) {
  return () => new Promise<void>((resolve, reject) => {
    calls.push({ kind, resolve, reject });
  });
}
vi.mock("../api/listings/useFavoriteListing", () => ({
  useFavoriteListing: () => ({ mutateAsync: request("add") }),
}));
vi.mock("../api/listings/useUnfavoriteListing", () => ({
  useUnfavoriteListing: () => ({ mutateAsync: request("remove") }),
}));

const LISTING_ID = "listing-1";
const HOME = "/(tabs)/(search)" as const;
const FEED_KEY = queryKeys.listings.list({ limit: 20 }, "me");
const DETAIL_KEY = queryKeys.listings.detail(LISTING_ID);

let client: QueryClient;

function feedFavorited() {
  return (client.getQueryData(FEED_KEY) as { pages: { items: { isFavorited: boolean }[] }[] }).pages[0]?.items[0]?.isFavorited;
}
function detailFavorited() {
  return (client.getQueryData(DETAIL_KEY) as { isFavorited: boolean }).isFavorited;
}

function render(isAuthenticated: boolean | null, isFavorited = false, replayAfterSignIn = false) {
  client.setQueryData(FEED_KEY, { pages: [{ items: [{ id: LISTING_ID, isFavorited }], nextCursor: null }], pageParams: [null] });
  client.setQueryData(DETAIL_KEY, { id: LISTING_ID, isFavorited });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  // As on a screen: the ♡ reads `isFavorited` from the cached Listing.
  return renderHook(() => {
    const detail = useQuery<{ isFavorited: boolean }>({ queryKey: DETAIL_KEY, queryFn: () => new Promise(() => {}), enabled: false });
    return useListingFavorite({
      listingId: LISTING_ID, isFavorited: detail.data?.isFavorited ?? false, isAuthenticated, returnTo: HOME, replayAfterSignIn,
    });
  }, { wrapper });
}

/** A refetch, or a write from another screen, lands in the cache. */
async function serverSays(isFavorited: boolean) {
  await act(async () => {
    client.setQueryData(DETAIL_KEY, { id: LISTING_ID, isFavorited });
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

/** Answers the oldest open request and lets the queue send the next one. */
async function answer(outcome: "ok" | "fail" = "ok") {
  const call = calls.shift();
  if (!call) throw new Error("No request in flight");
  await act(async () => {
    if (outcome === "ok") call.resolve();
    else call.reject();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe("useListingFavorite", () => {
  beforeEach(() => {
    calls = [];
    client = new QueryClient();
    mockPush.mockReset();
    useAuthIntentStore.setState({ intent: null, replayAction: null, replayReturnTo: null });
  });

  it("signed out, opens sign-in with a pending Favorite that returns to Home", () => {
    const { result } = render(false);

    act(() => result.current.toggle());

    expect(calls).toHaveLength(0);
    expect(useAuthIntentStore.getState().intent).toEqual({
      returnTo: HOME,
      action: { kind: "favorite", listingId: LISTING_ID },
    });
    expect(mockPush).toHaveBeenCalledWith(expect.objectContaining({ pathname: "/(auth)/phone" }));
  });

  it("leaves a waiting Favorite to the list screen", () => {
    render(false);

    act(() => {
      useAuthIntentStore.setState({ replayAction: { kind: "favorite", listingId: LISTING_ID } });
    });

    expect(calls).toHaveLength(0);
    expect(useAuthIntentStore.getState().replayAction).not.toBeNull();
  });

  it("ignores taps while the session is still loading", () => {
    const { result } = render(null);

    act(() => result.current.toggle());

    expect(calls).toHaveLength(0);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("shows a tap at once and writes it into the cached feed pages and detail", () => {
    const { result } = render(true);

    act(() => result.current.toggle());

    expect(result.current.favorited).toBe(true);
    expect(feedFavorited()).toBe(true);
    expect(detailFavorited()).toBe(true);
    expect(calls.map((call) => call.kind)).toEqual(["add"]);
  });

  it("takes taps while a request is in flight and ends on the last one", async () => {
    const { result } = render(true);

    act(() => result.current.toggle()); // ♥
    act(() => result.current.toggle()); // ♡
    act(() => result.current.toggle()); // ♥
    act(() => result.current.toggle()); // ♡
    expect(result.current.favorited).toBe(false);
    expect(calls.map((call) => call.kind)).toEqual(["add"]);

    await answer();
    // The add landed; the last tap wants it gone, so one remove follows.
    expect(calls.map((call) => call.kind)).toEqual(["remove"]);
    expect(result.current.favorited).toBe(false);

    await answer();
    expect(calls).toHaveLength(0);
    expect(result.current.favorited).toBe(false);
    expect(feedFavorited()).toBe(false);
  });

  it("sends nothing more when the taps come back to what the server already holds", async () => {
    const { result } = render(true);

    act(() => result.current.toggle()); // ♥, sent
    act(() => result.current.toggle()); // ♡
    act(() => result.current.toggle()); // ♥ again
    await answer();

    expect(calls).toHaveLength(0);
    expect(result.current.favorited).toBe(true);
  });

  it("puts back what the server last confirmed when a request fails", async () => {
    const { result } = render(true, true);

    act(() => result.current.toggle());
    expect(result.current.favorited).toBe(false);

    await answer("fail");

    expect(result.current.favorited).toBe(true);
    expect(feedFavorited()).toBe(true);
    expect(detailFavorited()).toBe(true);
  });

  it("drops taps queued behind a failed request", async () => {
    const { result } = render(true);

    act(() => result.current.toggle()); // ♥, sent
    act(() => result.current.toggle()); // ♡, queued
    await answer("fail");

    expect(calls).toHaveLength(0);
    expect(result.current.favorited).toBe(false);
  });

  it("queues a tap on a second ♡ of the same Listing behind the first one's request", async () => {
    // As detail's header ♡ and its photo-viewer ♡, or a Home and a Results card.
    const header = render(true).result;
    const viewer = render(true).result;

    act(() => header.current.toggle()); // ♥, sent
    // The viewer's ♡ reads the header's tap from the cache before it is tapped.
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
    expect(viewer.current.favorited).toBe(true);
    act(() => viewer.current.toggle()); // ♡, must wait for the add
    expect(calls.map((call) => call.kind)).toEqual(["add"]);
    expect(viewer.current.favorited).toBe(false);

    await answer();
    expect(calls.map((call) => call.kind)).toEqual(["remove"]);
    await answer();

    expect(calls).toHaveLength(0);
    expect(header.current.favorited).toBe(false);
    expect(viewer.current.favorited).toBe(false);
    expect(feedFavorited()).toBe(false);
    expect(detailFavorited()).toBe(false);
  });

  it("shows the cached state once nothing is in flight, so a refetch always corrects it", async () => {
    const { result } = render(true, true);

    act(() => result.current.toggle());
    await answer();
    expect(result.current.favorited).toBe(false);

    // Favorited again elsewhere, then removed on the Favorites tab: the ♡ follows each.
    await serverSays(true);
    expect(result.current.favorited).toBe(true);
    await serverSays(false);
    expect(result.current.favorited).toBe(false);
  });

  it("with replayAfterSignIn, finishes a pending Favorite for this Listing once", async () => {
    // Signed-in state has not caught up yet when the replay runs.
    const { result } = render(false, false, true);

    act(() => {
      useAuthIntentStore.setState({ replayAction: { kind: "favorite", listingId: LISTING_ID } });
    });

    expect(calls.map((call) => call.kind)).toEqual(["add"]);
    expect(result.current.favorited).toBe(true);
    expect(useAuthIntentStore.getState().replayAction).toBeNull();

    await serverSays(false);
    expect(calls).toHaveLength(1);
  });

  it("with replayAfterSignIn, ignores a pending Favorite for another Listing", () => {
    render(false, false, true);

    act(() => {
      useAuthIntentStore.setState({ replayAction: { kind: "favorite", listingId: "other-listing" } });
    });

    expect(calls).toHaveLength(0);
  });
});
