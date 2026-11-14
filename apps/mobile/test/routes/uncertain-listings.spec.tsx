import { http, HttpResponse } from "msw";
import { beforeEach, expect, it, vi } from "vitest";

import SellScreen from "../../app/(tabs)/sell";
import EditListingScreen from "../../app/listings/[id]/edit";
import { clearAuthSession, storeAuthSession } from "../../src/auth/session";
import { queryKeys } from "../../src/api/queryKeys";
import { act, fireEvent, renderMobile, routeParams, routerMock } from "../render";
import { server } from "../msw";
import { photoApiStorage } from "../profile-photo-storage";
import { fixture, mediaFixture } from "../fixtures/listing";

import { ToastProvider } from "@/components/ui/toast";

vi.mock("expo-secure-store", async () => {
  const { photoApiStorage: storage } = await import("../profile-photo-storage");
  return { getItemAsync: async (key: string) => storage.get(key) ?? null,
    setItemAsync: async (key: string, value: string) => { storage.set(key, value); },
    deleteItemAsync: async (key: string) => { storage.delete(key); } };
});
vi.mock("expo-file-system/legacy", () => ({ documentDirectory: "file:///documents/",
  getInfoAsync: async () => ({ exists: true }), readDirectoryAsync: async () => [],
  makeDirectoryAsync: async () => {}, deleteAsync: async () => {} }));
vi.mock("expo-image-manipulator", () => ({ SaveFormat: { WEBP: "webp" } }));
vi.mock("@react-native-community/netinfo", () => ({ default: {
  addEventListener: () => () => {}, fetch: async () => ({ isConnected: true }),
} }));
vi.mock("@react-navigation/native", async () => ({
  NavigationContext: (await import("react")).createContext(undefined),
}));
vi.mock("@rn-primitives/progress", async () => ({
  Root: (await import("react-native")).View, Indicator: (await import("react-native")).View,
}));
vi.mock("@rn-primitives/dialog", async () => {
  const { View, Text } = await import("react-native");
  return { Root: ({ open, children }: { open: boolean; children: React.ReactNode }) => open ? children : null,
    Trigger: View, Portal: View, Close: View, Overlay: View, Content: View, Title: Text, Description: Text };
});
vi.mock("react-native-screens", async () => ({ FullWindowOverlay: (await import("react-native")).View }));
vi.mock("react-native-safe-area-context", async () => ({
  SafeAreaView: (await import("react-native")).View,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const id = "00000000-0000-4000-8000-000000000373";
const listing = fixture({ id, sellerId: id, brandId: id, modelId: id, generationId: undefined,
  regionId: id, cityId: id, condition: "used", mileageKm: 10000, media: mediaFixture(3) });
const payload = { ...listing, photos: listing.media.map((media) => ({
  photoId: media.id, key: media.key, sortOrder: media.sortOrder,
})) };
const page = (items: unknown[]) => HttpResponse.json({ items, nextCursor: null, hasMore: false });

beforeEach(async () => {
  vi.stubGlobal("__DEV__", false);
  photoApiStorage.clear();
  await clearAuthSession();
  await storeAuthSession({ accessToken: "owner", refreshToken: "owner-refresh", user: {
    id, phone: "+99361000000", email: null, displayName: null, role: "seller",
  } });
  server.use(
    http.get("*/catalog/brands", () => page([{ id, name: "Toyota", slug: "toyota" }])),
    http.get("*/catalog/brands/:brandId/models", () => page([{ id, brandId: id, name: "Camry", slug: "camry" }])),
    http.get("*/catalog/*", () => page([])),
    http.get("*/exchange-rates", () => HttpResponse.json({ rates: [] })),
    http.get("*/me", () => HttpResponse.json({ id, phone: "+99361000000", email: null,
      phoneVerified: true, displayName: null, nameNumber: 1234, avatarIndex: 0, avatarKey: null,
      avatarUrl: null, role: "seller", locale: "en", createdAt: "2026-11-01T00:00:00Z", deletionScheduledAt: null })),
    http.get("*/me/contact-phones", () => HttpResponse.json({ items: [] })),
    http.get("*/me/drafts", () => page([{ id, userId: id, payload, updatedAt: "2026-11-01T00:00:00Z", createdAt: "2026-11-01T00:00:00Z" }])),
    http.get("*/me/listings", () => page([])),
    http.patch("*/listings/drafts/:id", () => HttpResponse.json({ id, userId: id, payload, createdAt: "2026-11-01T00:00:00Z", updatedAt: "2026-11-01T00:00:00Z" })),
    http.get("*/listings/:id", () => HttpResponse.json(listing)),
  );
});

it("offers My listings after a lost publication without publishing again or claiming a saved server draft", async () => {
  let publications = 0;
  let reachable = false;
  server.use(
    http.post("*/listings/drafts/:id/publish", () => { publications++; return HttpResponse.error(); }),
    http.get("*/me/listings", () => reachable ? page([{ ...listing, photoKeys: [], photoCount: 3 }]) : HttpResponse.error()),
  );
  const screen = await renderMobile(<ToastProvider><SellScreen /></ToastProvider>);
  await fireEvent.press(await screen.findByRole("button", { name: "Continue" }));
  await fireEvent.press(await screen.findByRole("button", { name: "Publish", disabled: false }));
  await screen.findByText("Publication was not confirmed. The listing may be in My listings. Check before publishing again.");
  expect(screen.queryByRole("button", { name: "Publish" })).toBeNull();
  expect(screen.queryByRole("button", { name: /Change$/ })).toBeNull();
  expect(screen.queryByText("Saved")).toBeNull();
  screen.queryClient.setQueryData(queryKeys.listings.myListingsInfinite(), { pages: [{ items: [], nextCursor: null }], pageParams: [null] });
  await fireEvent.press(screen.getByRole("button", { name: "My listings" }));
  expect(routerMock.push).not.toHaveBeenCalled();
  expect(screen.getByRole("alert")).toBeTruthy();
  reachable = true;
  await fireEvent.press(screen.getByRole("button", { name: "My listings" }));
  expect(routerMock.push).toHaveBeenCalledWith("/listings/manage");
  expect(screen.queryClient.getQueryData(queryKeys.listings.myListingsInfinite())).toMatchObject({ pages: [{ items: [{ id }] }] });
  expect(publications).toBe(1);
});

it("keeps changed fields in the editor after a lost save and opens the same authoritative Listing", async () => {
  routeParams.id = id;
  let edits = 0;
  let reachable = true;
  let saved = listing;
  server.use(
    http.patch("*/listings/:id", async ({ request }) => {
      saved = { ...listing, ...await request.json() as object }; edits++; reachable = false;
      return HttpResponse.error();
    }),
    http.get("*/listings/:id", () => reachable ? HttpResponse.json(saved) : HttpResponse.error()),
  );
  const screen = await renderMobile(<ToastProvider><EditListingScreen /></ToastProvider>);
  await fireEvent.press(await screen.findByRole("button", { name: /^Price, .*Change$/ }));
  await fireEvent.changeText(screen.getByDisplayValue("10,000"), "12000");
  await fireEvent.press(screen.getByRole("button", { name: "Done", disabled: false }));
  await act(async () => { void fireEvent.press(screen.getByRole("button", { name: "Save changes", disabled: false })); });
  await screen.findByText("Save was not confirmed. Some changes may have been saved. Check the listing before editing again.");
  expect(screen.queryByText("Not saved. Retry")).toBeNull();
  expect(screen.getByRole("button", { name: /^Price, 12,000 USD, Change$/ })).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "Check listing" }));
  expect(routerMock.push).not.toHaveBeenCalled();
  reachable = true;
  await fireEvent.press(screen.getByRole("button", { name: "Check listing" }));
  expect(routerMock.push).toHaveBeenCalledWith(`/(public)/listings/${id}`);
  expect(screen.queryClient.getQueryData(queryKeys.listings.detail(id))).toMatchObject({ id, priceAmount: 12000 });
  expect(edits).toBe(1);
});
