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
vi.mock("expo-secure-store", () => {
  const values = new Map<string, string>();
  return {
    getItemAsync: async (key: string) => values.get(key) ?? null,
    setItemAsync: async (key: string, value: string) => { values.set(key, value); },
    deleteItemAsync: async (key: string) => { values.delete(key); },
  };
});
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
function wizardServer(initialPhase: "uploading" | "processing" | "failed", isVideoUploadTester = true, canUploadVideo = true) {
  let published = false;
  let phase = initialPhase;
  let targetReads = 0;
  let retried = false;
  server.use(
    http.get("*/me", () => HttpResponse.json({ id, phone: "+99365000000", email: null, phoneVerified: true, displayName: null, nameNumber: 1234, avatarIndex: 0, avatarKey: null, avatarUrl: null, role: "buyer", locale: "en", createdAt: date, deletionScheduledAt: null, isVideoUploadTester, canUploadVideo })),
    http.get("*/catalog/*", () => HttpResponse.json({ items: [], nextCursor: null })),
    http.get("*/me/contact-phones", () => HttpResponse.json({ items: [] })),
    http.get("*/me/drafts", () => HttpResponse.json({ items: published ? [] : [{ id, userId: id, payload, createdAt: date, updatedAt: date }], nextCursor: null })),
    http.get("*/listings/video-uploads/target/draft/:id", () => {
      targetReads++;
      return HttpResponse.json({ pendingVideo: { id, generationId: listingId, sourceId: id, sessionId: id, status: phase, canReprocess: phase === "failed" } });
    }),
    http.post(`*/listings/video-uploads/${id}/reprocess`, () => {
      retried = true; phase = "processing";
      return HttpResponse.json({ target: { type: "draft", id }, sessionId: id, generationId: listingId, state: "PROCESSING", partSizeBytes: 5242880, confirmedParts: [], parts: [], expiresAt: "2030-01-01T00:00:00.000Z" });
    }),
    http.patch("*/listings/drafts/:id", () => HttpResponse.json({ id, userId: id, payload, createdAt: date, updatedAt: date })),
    http.post("*/listings/drafts/:id/publish", () => { published = true; return HttpResponse.json({ id: listingId, sellerId: id, status: "active", brandId: id, modelId: id, priceAmount: 100000, priceCurrency: "TMT", publishedAt: date }); }),
  );
  return { published: () => published, targetReads: () => targetReads, retried: () => retried };
}
function renderWizard() { return renderMobile(<ToastProvider><ListingVideoTasksProvider><SellScreen /></ListingVideoTasksProvider></ToastProvider>); }

it.each(["uploading", "processing", "failed"] as const)("publishes the real wizard with photos while video is %s", async (phase) => {
  const state = wizardServer(phase);
  const screen = await renderWizard();
  expect(await screen.findByRole("header", { name: "Check and publish, Step 7 of 7" })).toBeTruthy();
  expect(await screen.findByText(`Video · ${phase === "failed" ? "Needs attention" : phase === "processing" ? "Processing" : "Uploading"}`)).toBeTruthy();
  const publish = screen.getByRole("button", { name: "Publish" });
  expect(publish.props.disabled).toBeFalsy();
  await fireEvent.press(publish);
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 25)); });
  expect(state.published()).toBe(true);
  expect(routerMock.push).toHaveBeenCalledWith(`/(public)/listings/${listingId}`);
});

it("publishes photos for a nonmember without reading the forbidden target status", async () => {
  const state = wizardServer("processing", false, false);
  const screen = await renderWizard();
  await screen.findByRole("header", { name: "Check and publish, Step 7 of 7" });
  await fireEvent.press(screen.getByRole("button", { name: "Publish" }));
  expect(state.published()).toBe(true);
  expect(state.targetReads()).toBe(0);
});

it("keeps existing status and stored-source recovery available to a member with new uploads paused", async () => {
  const state = wizardServer("failed", true, false);
  const screen = await renderWizard();
  await screen.findByText("Video · Needs attention");
  expect(screen.getByRole("button", { name: "Publish" }).props.disabled).toBeFalsy();
  await fireEvent.press(screen.getByRole("button", { name: /^Photos,.*Change$/ }));
  await screen.findByText("Couldn’t process this video");
  await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByText("Processing video…")).toBeTruthy();
  expect(state.retried()).toBe(true);
  expect(state.targetReads()).toBeGreaterThan(0);
});

it("can retry an unreadable video status on Review while photos remain publishable", async () => {
  const state = wizardServer("processing");
  let failed = true;
  server.use(http.get("*/listings/video-uploads/target/draft/:id", () => failed ? HttpResponse.error() : HttpResponse.json({})));
  const screen = await renderWizard();
  await screen.findByText("Couldn’t check the video status");
  expect(screen.getByRole("button", { name: "Publish" }).props.disabled).toBeFalsy();
  failed = false;
  await fireEvent.press(screen.getByRole("button", { name: "Check again" }));
  await screen.findByText("Video · None");
  await fireEvent.press(screen.getByRole("button", { name: "Publish" }));
  expect(state.published()).toBe(true);
});
