import { beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";

import { renderMobile, fireEvent, act } from "../../test/render";
import { server } from "../../test/msw";
import { clearAuthSession, storeAuthSession } from "../auth/session";
import { getSharedConversationSocket } from "../conversations/socket/ConversationSocket";

// Socket.IO is the network boundary; keep the real socket wrapper and screen.
const wire = vi.hoisted(() => ({ handlers: new Map<string, (event?: unknown) => void>(), connected: true }));
vi.mock("socket.io-client", () => ({ io: () => ({
 get connected() { return wire.connected; },
 on: (event: string, handler: (event?: unknown) => void) => { wire.handlers.set(event, handler); },
 disconnect: () => {},
}) }));
import { EnquiriesScreen } from "./EnquiriesScreen";
vi.mock("expo-secure-store", () => { const values = new Map<string, string>(); return { getItemAsync: async (key: string) => values.get(key) ?? null, setItemAsync: async (key: string, value: string) => { values.set(key, value); }, deleteItemAsync: async (key: string) => { values.delete(key); } }; });
const userId = "00000000-0000-4000-8000-000000000001";
const businessId = "00000000-0000-4000-8000-000000000002";
const enquiryId = "00000000-0000-4000-8000-000000000003";
let assigned: string | null; let version: number; let role: "sales" | "owner"; let closed: boolean;
beforeEach(async () => {
 getSharedConversationSocket().disconnect(); wire.handlers.clear(); wire.connected = true;
 assigned = null; version = 0; role = "sales"; closed = false;
 await clearAuthSession(); await storeAuthSession({ accessToken: "synthetic", refreshToken: "refresh", user: { id: userId, phone: "+99365123456", email: null, displayName: null, role: "buyer" } });
 server.use(http.get("*/business/current", () => HttpResponse.json({ workspace: { business: { id: businessId, name: "Ahal Motors", slug: "ahal-motors", status: "active", admissionMode: "synthetic", cityId: null }, membership: { id: enquiryId, role, status: "active" }, members: [{ userId, role, status: "active" }], invitations: [] } })), http.get("*/conversations/business/:business", ({ request }) => request.headers.get("x-business-id") !== businessId ? HttpResponse.json({ code: "FORBIDDEN" }, { status: 403 }) : HttpResponse.json({ businessId, unanswered: 1, nextCursor: null, items: [{ id: enquiryId, listingId: "car-1", buyerId: "buyer", createdBy: "departed-staff", assigneeId: assigned, status: closed ? "closed" : "open", version, updatedAt: "2026-10-15T12:00:00Z" }] })));
});
describe("current member business inbox", () => {
 it.each([["en", "Unassigned", "Unanswered: 1"], ["ru", "Не назначено", "Без ответа: 1"], ["tk", "Bellenmedik", "Jogapsyz: 1"]])("renders actual scoped enquiries in %s", async (locale, unassigned, count) => {
  const screen = await renderMobile(<EnquiriesScreen />, { locale });
  expect(await screen.findByText(count ?? "")).toBeTruthy();
  expect(screen.getAllByText(unassigned ?? "").length).toBeGreaterThan(0);
  expect(screen.getByText("car-1")).toBeTruthy();
 });
 it("claims with the visible version, reloads assignment and keeps Sales owner controls unavailable", async () => {
  server.use(http.post("*/conversations/business/:business/:id/claim", async ({ request }) => { const body = await request.json() as { expectedVersion: number }; if (body.expectedVersion !== 0 || request.headers.get("x-business-id") !== businessId) return HttpResponse.json({ code: "CONFLICT" }, { status: 409 }); assigned = userId; version = 1; return HttpResponse.json({ id: enquiryId, assigneeId: userId, status: "open", version }); }));
  const screen = await renderMobile(<EnquiriesScreen />); await screen.findByText("car-1");
  await fireEvent.press(screen.getByRole("button", { name: "Claim enquiry" }));
  expect((await screen.findAllByText("Assigned to you")).length).toBe(2);
  expect(screen.queryByRole("button", { name: "Close enquiry" })).toBeNull();
 });
 it("refreshes a stale claim without allowing a reply under the previous assignment", async () => {
  server.use(http.post("*/conversations/business/:business/:id/claim", () => { assigned = "other-staff"; version = 1; return HttpResponse.json({ code: "ENQUIRY_VERSION_CHANGED", message: "Changed" }, { status: 409 }); }));
  const screen = await renderMobile(<EnquiriesScreen />); await screen.findByText("car-1");
  await fireEvent.press(screen.getByRole("button", { name: "Claim enquiry" }));
  expect(await screen.findByText(/This enquiry changed/)).toBeTruthy();
  expect(await screen.findByText("Assigned staff: other-staff")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Send reply" })).toBeNull();
 });
 it("shows current-member history with real author attribution and sends as the assigned user", async () => {
  assigned = userId;
  let reply = "";
  server.use(http.get("*/conversations/:id/messages", ({ request }) => request.headers.get("x-business-id") === businessId ? HttpResponse.json({ items: [{ id: businessId, conversationId: enquiryId, senderId: userId, text: reply || "Previous staff reply", kind: "text", createdAt: "2026-10-15T12:00:00.000Z" }], nextCursor: null }) : HttpResponse.json({ code: "FORBIDDEN" }, { status: 403 })), http.post("*/conversations/:id/messages", async ({ request }) => { const body = await request.json() as { text: string }; if (request.headers.get("x-business-id") !== businessId) return HttpResponse.json({ code: "FORBIDDEN" }, { status: 403 }); reply = body.text; return HttpResponse.json({}); }));
  const screen = await renderMobile(<EnquiriesScreen />); await screen.findByText("car-1");
  await fireEvent.press(screen.getByRole("button", { name: "Open history" }));
  expect(await screen.findByText("Previous staff reply")).toBeTruthy(); expect(screen.getByText(`Business staff: ${userId}`)).toBeTruthy();
  await fireEvent.changeText(screen.getByLabelText("Message"), "Still available today");
  await fireEvent.press(screen.getByRole("button", { name: "Send reply" }));
  expect(await screen.findByText("Still available today")).toBeTruthy(); expect(screen.getByText("Reply sent")).toBeTruthy();
 });
 it("refreshes into a denial without retaining cached private enquiry rows", async () => {
  const screen = await renderMobile(<EnquiriesScreen />); await screen.findByText("car-1");
  server.use(http.get("*/conversations/business/:business", () => HttpResponse.json({ code: "FORBIDDEN", message: "Removed" }, { status: 403 })));
  await fireEvent.press(screen.getByRole("button", { name: "Refresh" }));
  expect(await screen.findByText(/Your business access changed/)).toBeTruthy(); expect(screen.queryByText("car-1")).toBeNull();
 });
 it("lets Owner close and reopen with the latest assignment version", async () => {
  role = "owner";
  server.use(http.post("*/conversations/business/:business/:id/:action", async ({ request, params }) => { const body = await request.json() as { expectedVersion: number }; if (body.expectedVersion !== version) return HttpResponse.json({ code: "CONFLICT" }, { status: 409 }); closed = params.action === "close"; version++; return HttpResponse.json({}); }));
  const screen = await renderMobile(<EnquiriesScreen />); await screen.findByText("car-1");
  await fireEvent.press(screen.getByRole("button", { name: "Close enquiry" }));
  await screen.findByRole("button", { name: "Reopen enquiry" });
  await fireEvent.press(screen.getByRole("button", { name: "Reopen enquiry" }));
  expect(await screen.findByRole("button", { name: "Close enquiry" })).toBeTruthy();
 });
 it("drops cached enquiries on sign-out", async () => {
  const screen = await renderMobile(<EnquiriesScreen />); await screen.findByText("car-1");
  await act(async () => { await clearAuthSession(); });
  expect(await screen.findByText(/Your business access changed/)).toBeTruthy(); expect(screen.queryByText("car-1")).toBeNull();
 });
 it("refreshes visible history on socket delivery/deletion and reconciles missed changes after reconnect", async () => {
  assigned = userId;
  let text = "Before delivery";
  server.use(http.get("*/conversations/:id/messages", () => HttpResponse.json({ items: [{ id: businessId, conversationId: enquiryId, senderId: userId, kind: "text", text, createdAt: "2026-10-15T12:00:00.000Z" }], nextCursor: null })));
  const screen = await renderMobile(<EnquiriesScreen />); await screen.findByText("car-1");
  await fireEvent.press(screen.getByRole("button", { name: "Open history" }));
  await screen.findByText("Before delivery");
  text = "Buyer just replied";
  await act(async () => { wire.handlers.get("message:new")?.({ message: { id: businessId, conversationId: enquiryId, senderId: userId, kind: "text", text, createdAt: "2026-10-15T12:00:00.000Z" } }); });
  expect(await screen.findByText("Buyer just replied")).toBeTruthy();
  text = "Message deleted";
  await act(async () => { wire.handlers.get("message:deleted")?.({ conversationId: enquiryId, messageId: businessId, deletedAt: "2026-10-15T12:01:00.000Z" }); });
  expect(await screen.findByText("Message deleted")).toBeTruthy();
  assigned = "other-staff";
  await act(async () => { wire.handlers.get("disconnect")?.(); wire.handlers.get("connect_error")?.(); wire.handlers.get("connect")?.(); });
  expect(await screen.findByText("Assigned staff: other-staff")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Send reply" })).toBeNull();
 });
 it("keeps an unsent reply when hiding history and changing inbox filters", async () => {
  assigned = userId;
  server.use(http.get("*/conversations/:id/messages", () => HttpResponse.json({ items: [], nextCursor: null })));
  const screen = await renderMobile(<EnquiriesScreen />); await screen.findByText("car-1");
  await fireEvent.press(screen.getByRole("button", { name: "Open history" }));
  await screen.findByText("No messages yet");
  await fireEvent.changeText(screen.getByLabelText("Message"), "Keep this reply");
  await fireEvent.press(screen.getByRole("button", { name: "Hide history" }));
  await fireEvent.press(screen.getByRole("button", { name: "Unassigned" }));
  await fireEvent.press(screen.getByRole("button", { name: "All" }));
  await fireEvent.press(screen.getByRole("button", { name: "Open history" }));
  expect((await screen.findByLabelText("Message")).props.value).toBe("Keep this reply");
 });
 it("removes private rows on reconnect after membership loss", async () => {
  const screen = await renderMobile(<EnquiriesScreen />); await screen.findByText("car-1");
  server.use(http.get("*/conversations/business/:business", () => HttpResponse.json({ code: "FORBIDDEN", message: "Removed" }, { status: 403 })));
  await act(async () => { wire.handlers.get("disconnect")?.(); wire.handlers.get("connect")?.(); });
  expect(await screen.findByText(/Your business access changed/)).toBeTruthy();
  expect(screen.queryByText("car-1")).toBeNull();
 });

 it.each([["en", "Could not load enquiries.", "Refresh"], ["ru", "Не удалось загрузить обращения.", "Обновить"], ["tk", "Ýüz tutmalar ýüklenmedi.", "Täzele"]])("recovers workspace network failure without calling it permission loss in %s", async (locale, error, retry) => {
  server.use(http.get("*/business/current", () => HttpResponse.error()));
  const screen = await renderMobile(<EnquiriesScreen />, { locale });
  expect(await screen.findByText(error ?? "")).toBeTruthy();
  expect(screen.queryByText(/Your business access changed/)).toBeNull();
  server.resetHandlers();
  server.use(http.get("*/business/current", () => HttpResponse.json({ workspace: { business: { id: businessId, name: "Ahal Motors", slug: "ahal-motors", status: "active", admissionMode: "synthetic", cityId: null }, membership: { id: enquiryId, role, status: "active" }, members: [], invitations: [] } })), http.get("*/conversations/business/:business", () => HttpResponse.json({ businessId, unanswered: 0, nextCursor: null, items: [] })));
  await fireEvent.press(screen.getByRole("button", { name: retry ?? "" }));
  expect(await screen.findByText("Ahal Motors")).toBeTruthy();
 });

});
