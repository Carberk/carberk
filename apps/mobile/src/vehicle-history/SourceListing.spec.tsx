import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { focusManager, onlineManager } from "@tanstack/react-query";
import { AppState } from "react-native";
import { useNavigation } from "expo-router";

import ListingScreen from "../../app/(public)/listings/[id]";
import RequestScreen from "../../app/vehicle-history/requests/[id]";
import { renderMobile, fireEvent, act, routeParams, routerMock } from "../../test/render";
import { server } from "../../test/msw";
import { storeAuthSession } from "../auth/session";

const userId = "00000000-0000-4000-8000-000000000001";
const requestId = "10000000-0000-4000-8000-000000000001";
const listingId = "20000000-0000-4000-8000-000000000001";
const catalogId = "30000000-0000-4000-8000-000000000001";
vi.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 59, left: 4, right: 6, bottom: 34 }),
}));
const enquiry = { id: requestId, sourceListingId: listingId, status: "enquiry", assignmentVersion: 0,
  assignedOperator: null, createdAt: "2026-11-14T08:00:00.000Z" };
const listing = { id: listingId, publicNumber: 12, sellerId: userId, status: "active", brandId: catalogId, modelId: catalogId,
  year: 2020, regionId: catalogId, cityId: catalogId, description: "Current public description — Döwlet / Ответ",
  seller: { displayName: "Seller private context", nameNumber: 2007, avatarIndex: 0, avatarKey: null, deleted: false, memberSince: "2026-01-01T00:00:00.000Z" },
  priceAmount: 10000, priceCurrency: "USD", displayPriceTmt: 35000, allowCalls: true, allowChat: true,
  contactPhone: "+99361000000", acceptsExchange: false, installmentAvailable: false, media: [], viewCount: 1, favoriteCount: 0,
  publishedAt: "2026-01-01T00:00:00.000Z", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" };

beforeEach(async () => {
  vi.mocked(useNavigation).mockReturnValue({ getState: () => undefined } as ReturnType<typeof useNavigation>);
  const disk = new Map<string, string>();
  vi.mocked(AsyncStorage.getItem).mockImplementation(async (key) => disk.get(key) ?? null);
  vi.mocked(AsyncStorage.setItem).mockImplementation(async (key, value) => { disk.set(key, value); });
  let stored: string | null = null;
  vi.mocked(SecureStore.getItemAsync).mockImplementation(async () => stored);
  vi.mocked(SecureStore.setItemAsync).mockImplementation(async (_key, value) => { stored = value; });
  await storeAuthSession({ accessToken: `header.${btoa(JSON.stringify({ sid: "current", sub: userId }))}.signature`, refreshToken: "refresh",
    user: { id: userId, phone: null, email: "fixture@example.test", displayName: null, role: "buyer" } });
  vi.stubEnv("EXPO_PUBLIC_ENV", "development"); vi.stubEnv("EXPO_PUBLIC_VEHICLE_HISTORY_SYNTHETIC", "true");
  AppState.currentState = "active"; focusManager.setFocused(true); onlineManager.setOnline(true);
  routeParams.id = listingId; routeParams.historyRequest = requestId;
  server.use(
    http.get("*/catalog/*", () => HttpResponse.json({ items: [], nextCursor: null, hasMore: false })),
    http.get("*/vehicle-history/requests/:id", () => HttpResponse.json(enquiry)),
    http.get("*/listings/:id", () => HttpResponse.json(listing)),
    http.get("*/vehicle-history/requests/:id/messages", () => HttpResponse.json({ items: [], nextCursor: null })),
    http.get("*/vehicle-history/requests/:id/receipts", () => HttpResponse.json({ items: [] })),
    http.get("*/vehicle-history/requests/:id/reminder", () => HttpResponse.json({ reason: null, since: null, version: 0,
      eligibleAt: null, eligible: false, ineligibleReason: "not_waiting", declined: false, stopped: false, used: false, outcome: null })),
  );
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); routerMock.canGoBack.mockReturnValue(true); routerMock.back.mockReset(); });

it("keeps the source Listing header and Back inside nonzero device safe areas", async () => {
  const view = await renderMobile(<ListingScreen />);
  await view.findByText("Current public description — Döwlet / Ответ");
  for (const content of [view.getByText("Source listing"), view.getByRole("button", { name: "Back to enquiry" })]) {
    let node = content.parent;
    while (node && node.props.style?.paddingTop !== 59) node = node.parent;
    expect(node?.props.style).toMatchObject({ paddingTop: 59, paddingLeft: 4, paddingRight: 6, paddingBottom: 34 });
  }
});

it("places the exact enquiry and Messages history behind a cold Listing link anchored to Tabs", async () => {
  const dispatch = vi.fn();
  const current = { name: "(public)", key: "public-cold", state: { index: 0,
    routes: [{ name: "listings/[id]", key: "source-cold", params: { id: listingId, historyRequest: requestId } }] } };
  vi.mocked(useNavigation).mockReturnValue({ dispatch, getState: () => ({ index: 1,
    routes: [{ name: "(tabs)", state: { index: 0, routes: [{ name: "(search)" }, { name: "chat" }] } }, current],
  }) } as ReturnType<typeof useNavigation>);
  const view = await renderMobile(<ListingScreen />);
  await view.findByText("Current public description — Döwlet / Ответ");
  const action = dispatch.mock.calls[0]?.[0];
  expect(action).toMatchObject({ type: "RESET", payload: { index: 3 } });
  expect(action?.payload.routes.map((route: { name: string }) => route.name))
    .toEqual(["(tabs)", "vehicle-history/requests/index", "vehicle-history/requests/[id]", "(public)"]);
  expect(action?.payload.routes[0].state).toEqual({ index: 1, routes: [{ name: "(search)" }, { name: "chat" }] });
  expect(action?.payload.routes[2]).toMatchObject({ name: "vehicle-history/requests/[id]", params: { id: requestId } });
  expect(action?.payload.routes[3]).toEqual(current);
  await fireEvent.press(view.getByRole("button", { name: "Back to enquiry" }));
  expect(routerMock.back).toHaveBeenCalledOnce();
});

it("preserves the genuine enquiry caller and its existing native stack", async () => {
  const dispatch = vi.fn();
  vi.mocked(useNavigation).mockReturnValue({ dispatch, getState: () => ({ index: 2, routes: [
    { name: "(tabs)" }, { name: "vehicle-history/requests/[id]", params: { id: requestId } },
    { name: "(public)", state: { index: 0, routes: [{ name: "listings/[id]", params: { id: listingId, historyRequest: requestId } }] } },
  ] }) } as ReturnType<typeof useNavigation>);
  const view = await renderMobile(<ListingScreen />);
  await view.findByText("Current public description — Döwlet / Ответ");
  expect(dispatch).not.toHaveBeenCalled();
  await fireEvent.press(view.getByRole("button", { name: "Back to enquiry" }));
  expect(routerMock.back).toHaveBeenCalledOnce();
});

it.each([
  ["en", "Your message", "View listing", "Back to enquiry", "Send message"],
  ["ru", "Ваше сообщение", "Посмотреть объявление", "Вернуться к обращению", "Отправить сообщение"],
  ["tk", "Habaryňyz", "Bildirişi gör", "Ýüzlenmä dolan", "Habar iber"],
] as const)("returns from the actual read-only Listing route to the same %s request and retained draft", async (locale, input, open, back, send) => {
  routeParams.id = requestId; delete routeParams.historyRequest;
  const view = await renderMobile(<RequestScreen />, { locale });
  await fireEvent.changeText(await view.findByLabelText(input), "Unsent exact question — Döwlet / Ответ");
  await fireEvent.press(view.getByRole("button", { name: open }));
  expect(routerMock.push).toHaveBeenLastCalledWith({ pathname: "/(public)/listings/[id]", params: { id: listingId, historyRequest: requestId } });
  await view.unmount();
  routeParams.id = listingId; routeParams.historyRequest = requestId;
  const source = await renderMobile(<ListingScreen />, { locale });
  await source.findByText("Current public description — Döwlet / Ответ");
  expect(source.queryByText("Seller private context")).toBeNull();
  expect(source.queryByText("+99361000000")).toBeNull();
  expect(source.queryByRole("button", { name: send })).toBeNull();
  await fireEvent.press(source.getByRole("button", { name: back }));
  expect(routerMock.back).toHaveBeenCalledOnce();
  await source.unmount();
  routeParams.id = requestId; delete routeParams.historyRequest;
  const returned = await renderMobile(<RequestScreen />, { locale });
  await returned.findByDisplayValue("Unsent exact question — Döwlet / Ответ");
  expect(returned.i18n.language).toBe(locale);
});

it.each(["draft", "pending_review", "rejected", "deleted", "changed source"])("keeps Back to the enquiry when the source is %s", async (state) => {
  if (state === "changed source") server.use(http.get("*/vehicle-history/requests/:id", () => HttpResponse.json({ ...enquiry, sourceListingId: catalogId })));
  else server.use(http.get("*/listings/:id", () => state === "deleted" ? new HttpResponse(null, { status: 404 }) : HttpResponse.json({ ...listing, status: state })));
  routerMock.canGoBack.mockReturnValue(false);
  const view = await renderMobile(<ListingScreen />);
  await view.findByText("This listing is unavailable. Return to your enquiry to continue.");
  expect(view.queryByText("Current public description — Döwlet / Ответ")).toBeNull();
  await fireEvent.press(view.getByRole("button", { name: "Back to enquiry" }));
  expect(routerMock.replace).toHaveBeenLastCalledWith(`/vehicle-history/requests/${requestId}`);
});

it("never exposes cached Listing context after the current request read is denied", async () => {
  let denied = false;
  server.use(http.get("*/vehicle-history/requests/:id", () => denied
    ? HttpResponse.json({ code: "FORBIDDEN" }, { status: 403 }) : HttpResponse.json(enquiry)));
  const view = await renderMobile(<ListingScreen />);
  await view.findByText("Current public description — Döwlet / Ответ");
  denied = true;
  await act(() => view.queryClient.invalidateQueries({ queryKey: ["vehicle-history"] }));
  await view.findByText("This listing is unavailable. Return to your enquiry to continue.");
  expect(view.queryByText("Current public description — Döwlet / Ответ")).toBeNull();
});

it("recovers a failed public Listing read while keeping the request return", async () => {
  let failed = true;
  server.use(http.get("*/listings/:id", () => failed ? new HttpResponse(null, { status: 503 }) : HttpResponse.json(listing)));
  const view = await renderMobile(<ListingScreen />);
  const retry = await view.findByRole("button", { name: "Retry" });
  expect(view.getByRole("button", { name: "Back to enquiry" })).toBeTruthy();
  failed = false;
  await fireEvent.press(retry);
  await view.findByText("Current public description — Döwlet / Ответ");
  for (const name of ["Call", "Message", "Edit", "Favorite", "Report", "Add video", "View listing"]) {
    expect(view.queryByRole("button", { name })).toBeNull();
  }
});
