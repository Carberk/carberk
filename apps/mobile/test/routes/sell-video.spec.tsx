import { beforeEach, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { Enums } from "@auto-tm/contracts";

import SellScreen from "../../app/(tabs)/sell";
import { ToastProvider } from "../../components/ui/toast";
import { storeAuthSession } from "../../src/auth/session";
import { ListingVideoTasksProvider } from "../../src/listings/video/ListingVideoTasks";
import { act, fireEvent, renderMobile, routeParams, routerMock } from "../render";
import { server } from "../msw";

vi.mock("@react-navigation/native", async () => ({ NavigationContext: (await import("react")).createContext(undefined) }));
vi.mock("react-native-safe-area-context", async () => ({ SafeAreaView: (await import("react-native")).View, useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) }));
vi.mock("@react-native-community/netinfo", () => ({ default: { addEventListener: () => () => {}, fetch: async () => ({ isConnected: true }) } }));
vi.mock("@rn-primitives/dialog", async () => {
  const { View, Text, Pressable } = await import("react-native");
  return { Root: ({ open, children }: { open: boolean; children: React.ReactNode }) => open ? children : null, Trigger: Pressable, Portal: View, Overlay: View, Content: View, Close: Pressable, Title: Text, Description: Text };
});
vi.mock("react-native-screens", async () => ({ FullWindowOverlay: (await import("react-native")).View }));
vi.mock("@rn-primitives/switch", async () => ({ Root: (await import("react-native")).Pressable, Thumb: (await import("react-native")).View }));
vi.mock("@rn-primitives/progress", async () => ({ Root: (await import("react-native")).View, Indicator: (await import("react-native")).View }));
vi.mock("expo-image-picker", () => ({ launchImageLibraryAsync: vi.fn(), launchCameraAsync: vi.fn() }));
vi.mock("expo-image-manipulator", () => ({ ImageManipulator: {}, SaveFormat: { WEBP: "webp" } }));
vi.mock("expo-file-system/legacy", () => ({
  documentDirectory: "file:///documents/", getInfoAsync: async () => ({ exists: true }),
  readDirectoryAsync: async () => [], deleteAsync: async () => {}, makeDirectoryAsync: async () => {},
}));
const id = "11111111-1111-4111-8111-111111111111";
const listingId = "22222222-2222-4222-8222-222222222222";
const date = "2026-11-01T00:00:00.000Z";
const payload = { brandId: id, modelId: id, year: 2020, condition: "used", mileageKm: 10000,
  conditionDisclosure: { damaged: false }, priceAmount: 100000, priceCurrency: "TMT", description: "One owner",
  regionId: id, cityId: id, contactPhone: "+99365000000", allowCalls: true, allowChat: true,
  photos: [0, 1, 2].map((n) => ({ photoId: `33333333-3333-4333-8333-${String(n).padStart(12, "0")}`, key: `photo-${n}.webp`, sortOrder: n })) };

beforeEach(async () => {
  await storeAuthSession({ accessToken: "test-access", refreshToken: "test-refresh", user: { id, phone: "+99365000000", email: null, displayName: null, role: Enums.UserRole.Buyer } });
  routeParams.resumeDraftId = id;
});
it.each(["uploading", "processing", "failed"] as const)("publishes the real wizard with photos while video is %s", async (phase) => {
  let published = false;
  server.use(
    http.get("*/catalog/*", () => HttpResponse.json({ items: [], nextCursor: null })),
    http.get("*/me/contact-phones", () => HttpResponse.json({ items: [] })),
    http.get("*/me/drafts", () => HttpResponse.json({ items: published ? [] : [{ id, userId: id, payload, createdAt: date, updatedAt: date }], nextCursor: null })),
    http.get("*/listings/video-uploads/target/draft/:id", () => HttpResponse.json({ pendingVideo: { id, generationId: listingId, sourceId: id, sessionId: id, status: phase, canReprocess: phase === "failed" } })),
    http.patch("*/listings/drafts/:id", () => HttpResponse.json({ id, userId: id, payload, createdAt: date, updatedAt: date })),
    http.post("*/listings/drafts/:id/publish", () => { published = true; return HttpResponse.json({ id: listingId, sellerId: id, status: "active", brandId: id, modelId: id, priceAmount: 100000, priceCurrency: "TMT", publishedAt: date }); }),
  );
  const screen = await renderMobile(<ToastProvider><ListingVideoTasksProvider><SellScreen /></ListingVideoTasksProvider></ToastProvider>);
  expect(await screen.findByRole("header", { name: "Check and publish, Step 7 of 7" })).toBeTruthy();
  expect(await screen.findByText(`Video · ${phase === "failed" ? "Needs attention" : phase === "processing" ? "Processing" : "Uploading"}`)).toBeTruthy();
  const publish = screen.getByRole("button", { name: "Publish" });
  expect(publish.props.disabled).toBeFalsy();
  await fireEvent.press(publish);
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 25)); });
  expect(published).toBe(true);
  expect(routerMock.push).toHaveBeenCalledWith(`/(public)/listings/${listingId}`);
});
