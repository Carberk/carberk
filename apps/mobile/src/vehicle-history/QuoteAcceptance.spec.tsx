import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import * as SecureStore from "expo-secure-store";
import { focusManager } from "@tanstack/react-query";
import type { HistoryOrderSchemas as H } from "@auto-tm/contracts";

import RequestScreen from "../../app/vehicle-history/requests/[id]";
import { act, fireEvent, renderMobile, routeParams } from "../../test/render";
import { server } from "../../test/msw";
import { clearAuthSession, storeAuthSession } from "../auth/session";

vi.mock("react-native-safe-area-context", async () => ({
  SafeAreaView: (await import("react-native")).View,
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

const userId = "00000000-0000-4000-8000-000000000001";
const id = "10000000-0000-4000-8000-000000000101";
const quote: H.AcceptHistoryQuote["offer"] = { version: 2, vin: "DEMA0000000000001", synthetic: true,
  preflight: { status: "available", providers: [{ name: "Carfax", originalReportDate: "2026-10-14" }] },
  proposal: { format: "both", priceTmt: 100, providerRule: "either_available_both_when_obtainable", terms: "service_failure_review",
    deliveryFrom: "2026-11-21T06:00:00.000Z", deliveryBy: "2026-11-21T07:00:00.000Z" } };
const accepted: H.HistoryOrderState = { order: { id, acceptedOffer: quote, acceptedAt: "2026-11-21T05:00:00.000Z",
  holdExpiresAt: "2026-11-21T07:00:00.000Z", deliveryDay: "2026-11-21" }, status: "awaiting_synthetic_payment",
  serverNow: "2026-11-21T05:00:00.000Z", wallet: "SYNTHETIC-VH07-NO-TRANSFER", collectionEnabled: false };
let current: H.HistoryOrderState;
let sent: unknown[];
beforeEach(async () => {
  let stored: string | null = null;
  vi.mocked(SecureStore.getItemAsync).mockImplementation(async () => stored);
  vi.mocked(SecureStore.setItemAsync).mockImplementation(async (_key, value) => { stored = value; });
  vi.mocked(SecureStore.deleteItemAsync).mockImplementation(async () => { stored = null; });
  await storeAuthSession({ accessToken: `header.${btoa(JSON.stringify({ sid: "session-one", sub: userId }))}.signature`, refreshToken: "test-refresh",
    user: { id: userId, phone: null, email: "synthetic@example.test", displayName: null, role: "buyer" } });
  vi.stubEnv("EXPO_PUBLIC_ENV", "development"); vi.stubEnv("EXPO_PUBLIC_VEHICLE_HISTORY_SYNTHETIC", "true");
  routeParams.id = id;
  current = { order: null, status: "enquiry", serverNow: "2026-11-21T05:00:00.000Z", wallet: null, collectionEnabled: false };
  sent = [];
  server.use(
    http.get("*/vehicle-history/requests/:id", () => HttpResponse.json({ id, sourceListingId: null,
      createdAt: "2026-11-21T04:00:00.000Z", status: "enquiry", assignmentVersion: 1, assignedOperator: null })),
    http.get("*/vehicle-history/requests/:id/messages", () => HttpResponse.json({ items: [], nextCursor: null })),
    http.get("*/vehicle-history/requests/:id/receipts", () => HttpResponse.json({ items: [] })),
    http.get("*/vehicle-history/requests/:id/reminder", () => HttpResponse.json({ reason: null, since: null, version: 0,
      eligibleAt: null, eligible: false, ineligibleReason: "not_waiting", declined: false, stopped: false, used: false, outcome: null })),
    http.get("*/vehicle-history/requests/:id/offer", () => HttpResponse.json(quote)),
    http.get("*/vehicle-history/requests/:id/order", () => HttpResponse.json(current)),
    http.post("*/vehicle-history/requests/:id/order", async ({ request }) => {
      sent.push(await request.json()); current = accepted;
      return HttpResponse.json(current, { status: 201 });
    }),
  );
});

afterEach(async () => { await act(() => focusManager.setFocused(true)); vi.unstubAllEnvs(); });

it.each([
  ["en", "Confirm VIN and quote · 100 TMT", "Awaiting synthetic payment", "Agreed details"],
  ["ru", "Подтвердить VIN и предложение · 100 TMT", "Ожидается тестовая оплата", "Согласованные условия"],
  ["tk", "VIN-i we teklibi tassykla · 100 TMT", "Synag tölegine garaşylýar", "Ylalaşylan şertler"],
])("confirms the displayed exact quote in %s and reopens its immutable order without another POST", async (locale, confirm, waiting, details) => {
  const view = await renderMobile(<RequestScreen />, { locale });
  const button = await view.findByRole("button", { name: confirm });
  expect(view.queryByText("SYNTHETIC-VH07-NO-TRANSFER")).toBeNull();
  expect(view.getByText(/2026-10-14/)).toBeTruthy();
  await fireEvent.press(button);
  await view.findByText(waiting);
  await view.findByText("SYNTHETIC-VH07-NO-TRANSFER");
  expect(sent).toEqual([{ offer: quote }]);
  expect(view.queryByLabelText("VIN")).toBeNull();
  await fireEvent.press(view.getByRole("button", { name: details }));
  expect(view.getByText(/2026-10-14/)).toBeTruthy();
  await view.unmount();
  const reopened = await renderMobile(<RequestScreen />, { locale });
  await reopened.findByText(waiting);
  await reopened.findByText("SYNTHETIC-VH07-NO-TRANSFER");
  expect(sent).toEqual([{ offer: quote }]);
});
it("recovers a committed acceptance after response loss through readback without asking for another transfer", async () => {
  server.use(http.post("*/vehicle-history/requests/:id/order", async ({ request }) => {
    sent.push(await request.json()); current = accepted; return HttpResponse.error();
  }));
  const view = await renderMobile(<RequestScreen />);
  await fireEvent.press(await view.findByRole("button", { name: "Confirm VIN and quote · 100 TMT" }));
  await view.findByText("Awaiting synthetic payment");
  await view.findByText("SYNTHETIC-VH07-NO-TRANSFER");
  expect(sent).toEqual([{ offer: quote }]);
});
it.each([
  ["HISTORY_ORDER_STALE", "The quote changed or its window is no longer feasible."],
  ["HISTORY_ORDER_CAPACITY", "This day or window is full."],
])("shows actionable %s without wallet instructions or automatic acceptance", async (code, message) => {
  server.use(http.post("*/vehicle-history/requests/:id/order", () => HttpResponse.json({ code }, { status: 409 })));
  const view = await renderMobile(<RequestScreen />);
  await fireEvent.press(await view.findByRole("button", { name: "Confirm VIN and quote · 100 TMT" }));
  await view.findByText(new RegExp(message.replaceAll(".", "\\.")));
  expect(view.queryByText("SYNTHETIC-VH07-NO-TRANSFER")).toBeNull();
  expect(view.getByRole("button", { name: "Confirm VIN and quote · 100 TMT" })).toBeDisabled();
});
it("shows expiry with the original promise and a contact-operator next action", async () => {
  current = { ...accepted, serverNow: "2026-11-21T07:00:00.000Z", status: "hold_expired", wallet: null };
  const view = await renderMobile(<RequestScreen />);
  await view.findByText("Payment hold expired");
  expect(view.getByText(/The slot is released/)).toBeTruthy();
  expect(view.getByText(/VIN: DEMA0000000000001/)).toBeTruthy();
  expect(view.queryByText("SYNTHETIC-VH07-NO-TRANSFER")).toBeNull();
  expect(sent).toEqual([]);
});
it("discards delayed acceptance when the customer session ends", async () => {
  let release!: () => void;
  const delayed = new Promise<void>((resolve) => { release = resolve; });
  let started = false;
  server.use(http.post("*/vehicle-history/requests/:id/order", async () => { started = true; await delayed; return HttpResponse.json(accepted); }));
  const view = await renderMobile(<RequestScreen />);
  await fireEvent.press(await view.findByRole("button", { name: "Confirm VIN and quote · 100 TMT" }));
  await vi.waitFor(() => expect(started).toBe(true));
  await act(() => clearAuthSession());
  await act(() => release());
  expect(view.queryByText("SYNTHETIC-VH07-NO-TRANSFER")).toBeNull();
});
it("requires metadata, focus and unedited VIN before explicit acceptance", async () => {
  const view = await renderMobile(<RequestScreen />);
  const confirm = await view.findByRole("button", { name: "Confirm VIN and quote · 100 TMT" });
  await fireEvent.changeText(view.getByLabelText("VIN"), "DEMA0000000000006");
  expect(confirm).toBeDisabled();
  await fireEvent.changeText(view.getByLabelText("VIN"), "");
  await act(() => focusManager.setFocused(false));
  expect(view.queryByRole("button", { name: "Confirm VIN and quote · 100 TMT" })).toBeNull();
  expect(sent).toEqual([]);
  await act(() => focusManager.setFocused(true));
});
it("refuses wallet instructions when the accepted-format readback is incomplete", async () => {
  server.use(http.get("*/vehicle-history/requests/:id/order", () => HttpResponse.json({ ...accepted,
    order: { ...accepted.order, acceptedOffer: { ...quote, proposal: { ...quote.proposal, format: null } } } } )));
  const view = await renderMobile(<RequestScreen />);
  await view.findByText("Could not update the offer. Refresh its current state before trying again.");
  expect(view.queryByText("SYNTHETIC-VH07-NO-TRANSFER")).toBeNull();
  expect(view.queryByRole("button", { name: "Confirm VIN and quote · 100 TMT" })).toBeNull();
});
