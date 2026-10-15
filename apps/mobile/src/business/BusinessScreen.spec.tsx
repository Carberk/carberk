import { beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";

import { renderMobile, fireEvent, act } from "../../test/render";
import { server } from "../../test/msw";
import { storeAuthSession, clearAuthSession } from "../auth/session";

import { BusinessScreen } from "./BusinessScreen";
vi.mock("expo-secure-store", () => {
 const store = new Map<string, string>();
 return { getItemAsync: async (key: string) => store.get(key) ?? null, setItemAsync: async (key: string, value: string) => { store.set(key, value); }, deleteItemAsync: async (key: string) => { store.delete(key); } };
});
const userId = "00000000-0000-4000-8000-000000000001";
const businessId = "00000000-0000-4000-8000-000000000002";
const memberId = "00000000-0000-4000-8000-000000000003";
const recipientId = "00000000-0000-4000-8000-000000000004";
const workspace = (role: "owner" | "sales" = "owner", status = "active") => ({ business: { id: businessId, name: "Ahal Motors", slug: "ahal-motors", status, admissionMode: "synthetic", cityId: null }, membership: { id: memberId, role, status: "active" }, members: role === "owner" ? [{ userId, role: "owner", status: "active" }] : [], invitations: [] });
beforeEach(async () => {
 await clearAuthSession();
 await storeAuthSession({ accessToken: "synthetic", refreshToken: "refresh", user: { id: userId, phone: "+99365123456", email: null, displayName: null, role: "buyer" } });
});
describe("business workspace with actual hooks and network boundary", () => {
 it.each([["en", "No business membership", "Accept invitation"], ["ru", "Вы пока не в бизнесе", "Принять приглашение"], ["tk", "Işewürlige agza dälsiňiz", "Çakylygy kabul et"]])("renders empty membership and recipient-bound join in %s", async (locale, title, accept) => {
  server.use(http.get("*/business/current", () => HttpResponse.json({ workspace: null })));
  const screen = await renderMobile(<BusinessScreen />, { locale });
  expect(await screen.findByText(title ?? "")).toBeTruthy();
  expect(screen.getByRole("button", { name: accept ?? "" })).toBeTruthy();
  expect(screen.getByText(userId)).toBeTruthy();
 });
 it("accepts only through the real invitation API then renders the returned current Sales authority", async () => {
  let joined = false;
  server.use(http.get("*/business/current", () => HttpResponse.json({ workspace: joined ? workspace("sales") : null })), http.post("*/business/invitations/redeem", async ({ request }) => {
   const body = await request.json() as { token: string }; if (body.token !== "a".repeat(64)) return HttpResponse.json({ code: "CONFLICT", details: { reason: "INVITATION_INVALID" } }, { status: 409 }); joined = true; return HttpResponse.json({ businessId });
  }));
  const screen = await renderMobile(<BusinessScreen />); await screen.findByText("No business membership");
  await fireEvent.changeText(screen.getByLabelText("Invitation code"), "a".repeat(64)); await fireEvent.press(screen.getByRole("button", { name: "Accept invitation" }));
  expect(await screen.findByText("Ahal Motors")).toBeTruthy();
  expect(screen.queryByText("Business settings")).toBeNull(); expect(screen.queryByText("Invite Sales member")).toBeNull();
 });
 it("shows conflict safely and keeps the invitation form available for retry", async () => {
  server.use(http.get("*/business/current", () => HttpResponse.json({ workspace: null })), http.post("*/business/invitations/redeem", () => HttpResponse.json({ code: "CONFLICT", details: { reason: "INVITATION_INVALID" } }, { status: 409 })));
  const screen = await renderMobile(<BusinessScreen />); await screen.findByText("No business membership");
  await fireEvent.changeText(screen.getByLabelText("Invitation code"), "a".repeat(64)); await fireEvent.press(screen.getByRole("button", { name: "Accept invitation" }));
  expect(await screen.findByText(/The invitation expired/)).toBeTruthy(); expect(screen.getByLabelText("Invitation code")).toBeTruthy();
 });
 it("persists settings and prepares a one-time recipient invitation with real mutation/cache reconciliation", async () => {
  let name = "Ahal Motors";
  server.use(http.get("*/business/current", () => HttpResponse.json({ workspace: { ...workspace(), business: { ...workspace().business, name } } })), http.post("*/business/:id/settings", async ({ request }) => { name = (await request.json() as { name: string }).name; return HttpResponse.json({ ok: true }); }), http.post("*/business/:id/invitations", async ({ request }) => {
   const body = await request.json() as { recipientUserId: string }; return body.recipientUserId === recipientId ? HttpResponse.json({ businessId, invitationId: memberId, token: "b".repeat(64), expiresAt: "2026-10-20T12:00:00.000Z" }) : HttpResponse.json({ code: "CONFLICT" }, { status: 409 });
  }));
  const screen = await renderMobile(<BusinessScreen />); await screen.findByText("Business settings");
  await fireEvent.changeText(screen.getByLabelText("Business name"), "Ahal Business"); await fireEvent.press(screen.getByRole("button", { name: "Save name" }));
  expect(await screen.findByText("Ahal Business")).toBeTruthy();
  await fireEvent.changeText(screen.getByLabelText("Recipient account ID"), recipientId); await fireEvent.press(screen.getByRole("button", { name: "Invite Sales member" }));
  expect(await screen.findByText("b".repeat(64))).toBeTruthy(); expect(screen.getByText(/Share this code privately/)).toBeTruthy();
 });
 it("blocks controls while recovery is required and hides cached membership immediately on sign-out", async () => {
  server.use(http.get("*/business/current", () => HttpResponse.json({ workspace: workspace("owner", "recovery") })));
  const screen = await renderMobile(<BusinessScreen />); await screen.findByText("Ahal Motors");
  expect(screen.getByRole("button", { name: "Save name", disabled: true })).toBeTruthy();
  await act(async () => { await clearAuthSession(); });
  expect(await screen.findByText(/Sign in with your own account/)).toBeTruthy(); expect(screen.queryByText("Ahal Motors")).toBeNull();
 });
 it("shows network failure and reloads actual membership on retry", async () => {
  server.use(http.get("*/business/current", () => HttpResponse.json({ code: "INTERNAL_ERROR" }, { status: 503 })));
  const screen = await renderMobile(<BusinessScreen />); expect(await screen.findByText(/Could not load your business/)).toBeTruthy();
  server.use(http.get("*/business/current", () => HttpResponse.json({ workspace: workspace("sales") })));
  await fireEvent.press(screen.getByRole("button", { name: "Refresh" })); expect(await screen.findByText("Ahal Motors")).toBeTruthy();
 });
});
