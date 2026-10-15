import { beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { waitFor } from "@testing-library/react-native";

import SellScreen from "../../app/(tabs)/sell";
import { ToastProvider } from "../../components/ui/toast";
import { renderMobile, fireEvent, routeParams } from "../render";
import { server } from "../msw";
import { clearAuthSession, storeAuthSession } from "../../src/auth/session";
vi.mock("expo-secure-store", () => { const values = new Map<string, string>(); return { getItemAsync: async (key: string) => values.get(key) ?? null, setItemAsync: async (key: string, value: string) => { values.set(key, value); }, deleteItemAsync: async (key: string) => { values.delete(key); } }; });
vi.mock("@react-navigation/native", async () => ({ NavigationContext: (await import("react")).createContext(undefined), DefaultTheme: { colors: {} }, DarkTheme: { colors: {} } }));
vi.mock("react-native", async () => ({ ...(await vi.importActual<Record<string, unknown>>("react-native")), AppState: { addEventListener: () => ({ remove() {} }) } }));
vi.mock("@react-native-community/netinfo", () => ({ default: { addEventListener: () => () => {}, fetch: async () => ({ isConnected: true }) } }));
vi.mock("expo-file-system/legacy", () => ({ documentDirectory: "file:///documents/", FileSystemUploadType: { BINARY_CONTENT: "BINARY_CONTENT" }, getInfoAsync: async () => ({ exists: true, size: 1024 }), readDirectoryAsync: async () => [], makeDirectoryAsync: async () => {}, deleteAsync: async () => {} }));
vi.mock("expo-image-manipulator", () => ({ ImageManipulator: {}, SaveFormat: { WEBP: "webp" } }));
vi.mock("@rn-primitives/progress", async () => ({ Root: (await import("react-native")).View, Indicator: (await import("react-native")).View }));
vi.mock("@rn-primitives/dialog", async () => {
 const native = await import("react-native"); const { Overlay } = await import("../native-overlays");
 return { Root: Overlay, Trigger: native.Pressable, Portal: native.View, Close: native.Pressable, Overlay: native.View, Content: native.View, Title: native.Text, Description: native.Text };
});
vi.mock("react-native-screens", async () => ({ FullWindowOverlay: (await import("react-native")).View }));
vi.mock("@rn-primitives/switch", async () => ({ Root: (await import("react-native")).View, Thumb: (await import("react-native")).View }));
vi.mock("react-native-safe-area-context", async () => ({ SafeAreaView: (await import("react-native")).View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
const userId = "00000000-0000-4000-8000-000000000001";
const businessId = "00000000-0000-4000-8000-000000000002";
const draftId = "00000000-0000-4000-8000-000000000003";
const id = "00000000-0000-4000-8000-000000000004";
const complete = { brandId: id, modelId: id, year: 2020, condition: "used", mileageKm: 1000, conditionDisclosure: { damaged: false }, priceAmount: 100000, priceCurrency: "TMT", regionId: id, cityId: id, description: "Synthetic business car", contactPhone: "+99365111222", allowCalls: true, allowChat: true, photos: [0, 1, 2].map(n => ({ photoId: `00000000-0000-4000-8000-00000000000${n + 5}`, key: `pending/photo-${n}/original.webp`, sortOrder: n })) };
let draftPayload: Record<string, unknown>; let savedBusiness: string | null; let denied: boolean;
const draft = () => ({ id: draftId, userId, businessId, payload: draftPayload, createdAt: "2026-10-15T00:00:00.000Z", updatedAt: "2026-10-15T00:00:00.000Z" });
beforeEach(async () => {
 draftPayload = complete; savedBusiness = null; denied = false;
 await clearAuthSession(); await storeAuthSession({ accessToken: "synthetic", refreshToken: "refresh", user: { id: userId, phone: "+99365123456", email: null, displayName: null, role: "buyer" } });
 server.use(http.get("*/business/current", () => HttpResponse.json({ workspace: { business: { id: businessId, name: "Ahal Motors", slug: "ahal", status: "active", admissionMode: "synthetic", cityId: null }, membership: { id, role: "sales", status: "active" }, members: [], invitations: [] } })), http.get("*/catalog/*", () => HttpResponse.json({ items: [], hasMore: false, nextCursor: null })), http.get("*/me/contact-phones", () => HttpResponse.json({ items: [{ phone: "+99365111222", source: "confirmed", confirmedAt: new Date().toISOString(), reusableUntil: new Date(Date.now() + 86400000).toISOString() }] })), http.get("*/me/drafts", () => HttpResponse.json({ items: [], nextCursor: null })), http.get("*/businesses/:id/inventory", () => HttpResponse.json({ businessId, status: "active", listings: [], drafts: [draft()], counts: { active: 0, sold: 0, archived: 0, banned: 0, drafts: 1, reviewDue: 0 } })), http.patch("*/listings/drafts/:id", async ({ request }) => { savedBusiness = request.headers.get("x-business-id"); draftPayload = await request.json() as Record<string, unknown>; return HttpResponse.json(draft()); }), http.post("*/listings/drafts/:id/publish", () => HttpResponse.json({ code: "FORBIDDEN", details: { reason: "MEMBERSHIP_REQUIRED" } }, { status: 403 })), http.post("*/listings/drafts", ({ request }) => { savedBusiness = request.headers.get("x-business-id"); return denied ? HttpResponse.json({ code: "FORBIDDEN", details: { reason: "MEMBERSHIP_REQUIRED" } }, { status: 403 }) : HttpResponse.json(draft(), { status: 201 }); }));
});
describe("business context in the actual seven-step Sell wizard", () => {
 it.each([["en", "Publish as: Ahal Motors", "Check and publish"], ["ru", "Разместить от имени: Ahal Motors", "Проверка и публикация"], ["tk", "Kimiň adyndan ýerleşdirmeli: Ahal Motors", "Barlag we neşir"]])("resumes shared stock on Review with fixed business ownership in %s", async (locale, context, reviewTitle) => {
  routeParams.businessId = businessId; routeParams.resumeDraftId = draftId;
  const screen = await renderMobile(<ToastProvider><SellScreen /></ToastProvider>, { locale });
  expect(await screen.findByText(context ?? "")).toBeTruthy();
  await waitFor(() => expect(screen.getByTestId("wizard-header")).toBeTruthy());
  expect(await screen.findByText(reviewTitle ?? "")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Personal account" })).toBeNull();
 });
 it("chooses explicit business context before creating a draft and reports revocation with localized recovery copy", async () => {
  denied = true; const screen = await renderMobile(<ToastProvider><SellScreen /></ToastProvider>);
  await fireEvent.press(await screen.findByRole("button", { name: "Ahal Motors" }));
  await fireEvent.press(await screen.findByRole("button", { name: "New listing" }));
  await waitFor(() => expect(savedBusiness).toBe(businessId));
  expect(await screen.findByText(/Your business access changed/)).toBeTruthy();
 });
});
