import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { waitFor } from "@testing-library/react-native";
import { AppState } from "react-native";

import { renderMobile, act, routeParams, screenFocus } from "../../../test/render";
import { fixture, maps } from "../../../test/fixtures/listing";
import { server } from "../../../test/msw";
import { ListingDetailView } from "../components/ListingDetail";
import ListingDetailScreen from "../../../app/(public)/listings/[id]";

const native = vi.hoisted(() => ({ stored: new Map<string, string>(), listeners: new Set<(state: string) => void>() }));
vi.mock("@react-native-async-storage/async-storage", () => ({ default: {
  getItem: async (key: string) => native.stored.get(key) ?? null,
  setItem: async (key: string, value: string) => { native.stored.set(key, value); },
} }));
vi.mock("expo-crypto", () => ({ randomUUID: () => "10000000-0000-4000-8000-000000000001" }));
vi.mock("expo-secure-store", () => ({ getItemAsync: async () => null, setItemAsync: async () => {}, deleteItemAsync: async () => {} }));
vi.mock("react-native", async (original) => ({ ...await original<typeof import("react-native")>(), AppState: {
  currentState: "active", addEventListener: (_: string, listener: (state: string) => void) => {
    native.listeners.add(listener); return { remove: () => native.listeners.delete(listener) };
  },
} }));
const listing = () => fixture({ brandId: "00000000-0000-4000-8000-000000000010", modelId: "00000000-0000-4000-8000-000000000011", generationId: undefined,
  regionId: "00000000-0000-4000-8000-000000000012", cityId: "00000000-0000-4000-8000-000000000013", viewCount: 1234, viewsToday: 9 });
beforeEach(() => { vi.stubEnv("EXPO_PUBLIC_LISTING_VIEWS_ENABLED", "true"); native.stored.clear(); AppState.currentState = "active"; });
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

async function advance(ms: number) { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); }
async function foreground(state: "active" | "background") {
  await act(async () => { AppState.currentState = state; native.listeners.forEach((listener) => listener(state)); });
}
function serve(detail = listing()) {
  const signals: string[] = [];
  server.use(http.get("*/api/v1/listings/:id", () => HttpResponse.json(detail)),
    http.get("*/api/v1/config", () => HttpResponse.json({ signupsEnabled: true, inspectionInterestEnabled: false, reportEntryEnabled: true })),
    http.get("*/api/v1/catalog/*", () => HttpResponse.json({ items: [] })),
    http.post("*/api/v1/listings/:id/views", ({ request }) => { signals.push(request.headers.get("x-app-install-id") ?? "MISSING"); return new HttpResponse(null, { status: 204 }); }));
  routeParams.id = detail.id;
  return signals;
}

describe("Listing view figures", () => {
  it.each([["en", "1,234 views · 9 today"], ["ru", "1 234 просмотра · 9 сегодня"], ["tk", "1 234 gezek görüldi · şu gün 9"]])("shows full grouped lifetime and today figures in %s", async (locale, expected) => {
    const screen = await renderMobile(<ListingDetailView listing={listing()} maps={maps} />, { locale });
    expect(screen.getByText(expected)).toBeTruthy();
  });
  it("keeps closed figures owner-only, hides zero total and omits zero today", async () => {
    const screen = await renderMobile(<ListingDetailView listing={{ ...listing(), status: "sold" }} maps={maps} />);
    expect(screen.queryByText("1,234 views · 9 today")).toBeNull();
    await screen.rerender(<ListingDetailView listing={{ ...listing(), status: "sold" }} maps={maps} isOwner />);
    expect(screen.getAllByText("1,234 views · 9 today")).toHaveLength(2);
    await screen.rerender(<ListingDetailView listing={{ ...listing(), viewCount: 0 }} maps={maps} />);
    expect(screen.queryByText(/views/)).toBeNull();
    await screen.rerender(<ListingDetailView listing={{ ...listing(), viewsToday: 0 }} maps={maps} />);
    expect(screen.getByText("1,234 views")).toBeTruthy();
    expect(screen.queryByText(/today/)).toBeNull();
  });
  it("accepts the released detail response without today's additive count", async () => {
    const screen = await renderMobile(<ListingDetailView listing={{ ...listing(), viewsToday: undefined }} maps={maps} />);
    expect(screen.getByText("1,234 views")).toBeTruthy();
  });
});

describe("full Listing detail view signal", () => {
  it("sends a private install header after two focused foreground seconds without changing displayed counts", async () => {
    const signals = serve();
    const screen = await renderMobile(<ListingDetailScreen />);
    await waitFor(() => expect(screen.getByText("1,234 views · 9 today")).toBeTruthy());
    vi.useFakeTimers();
    await advance(1999); expect(signals).toEqual([]);
    await advance(2); expect(signals).toEqual(["10000000-0000-4000-8000-000000000001"]);
    expect(screen.getByText("1,234 views · 9 today")).toBeTruthy();
    await advance(5000); expect(signals).toHaveLength(1);
    await screen.unmount();
    vi.useRealTimers();
    const again = await renderMobile(<ListingDetailScreen />);
    await waitFor(() => expect(again.getByText("1,234 views · 9 today")).toBeTruthy());
    vi.useFakeTimers(); await advance(2100);
    expect(signals).toEqual(["10000000-0000-4000-8000-000000000001", "10000000-0000-4000-8000-000000000001"]);
  });
  it("cancels background and covered-screen time, then starts a fresh dwell on return", async () => {
    const signals = serve(); const screen = await renderMobile(<ListingDetailScreen />);
    await waitFor(() => expect(screen.getByText("1,234 views · 9 today")).toBeTruthy());
    vi.useFakeTimers(); await advance(900); await foreground("background"); await advance(4000); expect(signals).toEqual([]);
    await foreground("active"); await advance(1000); screenFocus.focused = false; await screen.rerender(<ListingDetailScreen />);
    await advance(4000); expect(signals).toEqual([]);
    screenFocus.focused = true; await screen.rerender(<ListingDetailScreen />);
    await advance(1999); expect(signals).toEqual([]); await advance(2); expect(signals).toHaveLength(1);
  });
  it.each(["sold", "archived"] as const)("never signals a %s Listing", async (status) => {
    const signals = serve({ ...listing(), status }); const screen = await renderMobile(<ListingDetailScreen />);
    await waitFor(() => expect(screen.getByText("No. 373")).toBeTruthy());
    vi.useFakeTimers(); await advance(4000); expect(signals).toEqual([]);
  });
  it("leaves collection and identifier creation closed by default", async () => {
    vi.stubEnv("EXPO_PUBLIC_LISTING_VIEWS_ENABLED", ""); const signals = serve();
    const screen = await renderMobile(<ListingDetailScreen />);
    await waitFor(() => expect(screen.getByText("No. 373")).toBeTruthy());
    vi.useFakeTimers(); await advance(4000); expect(signals).toEqual([]); expect(native.stored.size).toBe(0);
  });
});
