import { useEffect } from "react";
import { useFocusEffect } from "expo-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";

import { renderMobile, fireEvent, act, screenFocus } from "../../test/render";
import { server } from "../../test/msw";
import { storeAuthSession, clearAuthSession } from "../auth/session";

import { InventoryScreen } from "./InventoryScreen";
vi.mock("expo-secure-store", () => {
 const values = new Map<string, string>();
 return { getItemAsync: async (key: string) => values.get(key) ?? null, setItemAsync: async (key: string, value: string) => { values.set(key, value); }, deleteItemAsync: async (key: string) => { values.delete(key); } };
});
const userId = "00000000-0000-4000-8000-000000000001";
const businessId = "00000000-0000-4000-8000-000000000002";
const listingId = "00000000-0000-4000-8000-000000000003";
const memberId = "00000000-0000-4000-8000-000000000004";
let due: boolean; let role: "owner" | "sales"; let status: "active" | "recovery";
const stock = () => ({ businessId, status, listings: [{ id: listingId, status: "active", brandId: memberId, modelId: memberId, year: 2020, publishedAt: "2026-10-01T12:00:00.000Z", availabilityConfirmedAt: null, reviewDue: due }], drafts: [], counts: { active: 1, sold: 0, archived: 0, banned: 0, drafts: 0, reviewDue: due ? 1 : 0 } });
beforeEach(async () => {
 vi.mocked(useFocusEffect).mockImplementation(callback => useEffect(() => screenFocus.focused ? callback() : undefined, [callback, screenFocus.focused]));
 due = true; role = "owner"; status = "active";
 await clearAuthSession(); await storeAuthSession({ accessToken: "synthetic", refreshToken: "refresh", user: { id: userId, phone: "+99365123456", email: null, displayName: null, role: "buyer" } });
 server.use(http.get("*/business/current", () => HttpResponse.json({ workspace: { business: { id: businessId, name: "Ahal Motors", slug: "ahal-motors", status, admissionMode: "synthetic", cityId: null }, membership: { id: memberId, role, status: "active" }, members: [], invitations: [] } })), http.get("*/businesses/:id/inventory", () => HttpResponse.json(stock())), http.get("*/me/contact-phones", ({ request }) => request.headers.get("x-business-id") === businessId ? HttpResponse.json({ items: [{ phone: "+99365111222", source: "confirmed", confirmedAt: "2026-10-15T00:00:00.000Z", reusableUntil: "2026-10-22T00:00:00.000Z" }] }) : HttpResponse.json({ code: "FORBIDDEN" }, { status: 403 })), http.get("*/catalog/brands", () => HttpResponse.json({ items: [] })));
});
describe("business stock using real UI, auth and API hooks", () => {
 it.each([["en", "Active: 1", "Availability review due: 1", "Confirm business phone"], ["ru", "Активные: 1", "Пора подтвердить наличие: 1", "Подтвердить телефон бизнеса"], ["tk", "Işjeň: 1", "Barlygyny tassyklamaly: 1", "Işewürligiň belgisini tassykla"]])("renders truthful stock counts and Owner phone controls in %s", async (locale, active, reviewDue, phone) => {
  const screen = await renderMobile(<InventoryScreen />, { locale });
  expect(await screen.findByText(active ?? "")).toBeTruthy(); expect(screen.getByText(reviewDue ?? "")).toBeTruthy();
  expect(screen.getByRole("button", { name: phone ?? "" })).toBeTruthy(); expect(await screen.findByText("+99365111222")).toBeTruthy();
 });
 it("confirms weekly availability with explicit business scope and refreshes the due count", async () => {
  server.use(http.post("*/businesses/:id/inventory/:listing/confirm-availability", ({ request }) => { if (request.headers.get("x-business-id") !== businessId) return HttpResponse.json({ code: "FORBIDDEN" }, { status: 403 }); due = false; return HttpResponse.json({ success: true }); }));
  const screen = await renderMobile(<InventoryScreen />); await screen.findByText("Availability review due: 1");
  await fireEvent.press(screen.getByRole("button", { name: "Still available" }));
  expect(await screen.findByText("Availability review due: 0")).toBeTruthy(); expect(screen.getByText("Active: 1")).toBeTruthy();
 });
 it("lets Sales reuse the business number without controls to change it", async () => {
  role = "sales"; const screen = await renderMobile(<InventoryScreen />); expect(await screen.findByText("+99365111222")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Confirm business phone" })).toBeNull(); expect(screen.getByRole("button", { name: "New business listing" })).toBeTruthy();
 });
 it("keeps recovery history readable, disables changes and clears it immediately on sign-out", async () => {
  status = "recovery"; const screen = await renderMobile(<InventoryScreen />); await screen.findByText("Active: 1");
  expect(screen.getByRole("button", { name: "Still available", disabled: true })).toBeTruthy(); expect(screen.getByRole("button", { name: "New business listing", disabled: true })).toBeTruthy();
  await act(async () => { await clearAuthSession(); }); expect(await screen.findByText(/Your business access changed/)).toBeTruthy(); expect(screen.queryByText("Active: 1")).toBeNull();
 });
 it("shows removed-member refusal and offers retry without displaying cached stock", async () => {
  server.use(http.get("*/businesses/:id/inventory", () => HttpResponse.json({ code: "FORBIDDEN" }, { status: 403 })));
  const screen = await renderMobile(<InventoryScreen />); expect(await screen.findByText(/Your business access changed/)).toBeTruthy(); expect(screen.queryByText("Active: 1")).toBeNull(); expect(screen.getByRole("button", { name: "Refresh" })).toBeTruthy();
 });
 it.each([["en", "Could not load inventory.", "Refresh"], ["ru", "Не удалось загрузить склад.", "Обновить"], ["tk", "Ulaglar ýüklenmedi.", "Täzele"]])("offers recovery after an offline workspace read in %s", async (locale, _error, retry) => {
  server.use(http.get("*/business/current", () => HttpResponse.error()));
  const screen = await renderMobile(<InventoryScreen />, { locale });
  // Recovery is available without claiming membership was revoked.
  const refresh = await screen.findByRole("button", { name: retry ?? "" });
  expect(screen.queryByText(/Your business access changed/)).toBeNull();
  server.use(http.get("*/business/current", () => HttpResponse.json({ workspace: { business: { id: businessId, name: "Ahal Motors", slug: "ahal-motors", status, admissionMode: "synthetic", cityId: null }, membership: { id: memberId, role, status: "active" }, members: [], invitations: [] } })));
  await fireEvent.press(refresh);
  expect(await screen.findByText("Ahal Motors")).toBeTruthy();
 });
 it("reconciles inventory after returning from another screen and hides revoked stock", async () => {
  const screen = await renderMobile(<InventoryScreen />); await screen.findByText("Availability review due: 1");
  screenFocus.focused = false; await screen.rerender(<InventoryScreen />);
  due = false;
  screenFocus.focused = true; await screen.rerender(<InventoryScreen />);
  expect(await screen.findByText("Availability review due: 0")).toBeTruthy();
  screenFocus.focused = false; await screen.rerender(<InventoryScreen />);
  server.use(http.get("*/businesses/:id/inventory", () => HttpResponse.json({ code: "FORBIDDEN" }, { status: 403 })));
  screenFocus.focused = true; await screen.rerender(<InventoryScreen />);
  expect(await screen.findByText(/Your business access changed/)).toBeTruthy();
  expect(screen.queryByText("Active: 1")).toBeNull();
 });

});
