import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import * as SecureStore from "expo-secure-store";
import { focusManager } from "@tanstack/react-query";
import * as Native from "react-native";
import type { HistoryOrderSchemas as H } from "@auto-tm/contracts";

import RequestScreen from "../../app/vehicle-history/requests/[id]";
import { act, fireEvent, getHost, renderMobile, routeParams } from "../../test/render";
import { server } from "../../test/msw";
import { clearAuthSession, storeAuthSession } from "../auth/session";

const device = vi.hoisted(() => ({ width: 402, height: 874, fontScale: 1, scale: 3 }));
vi.mock("react-native", async (original) => ({
  ...await original<typeof Native>(),
  useWindowDimensions: () => device,
}));

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
  device.fontScale = 1;
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
    http.get("*/vehicle-history/requests/:id/payment-proofs", () => HttpResponse.json({ items: [] })),
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
  await view.findAllByText(new RegExp(`^${waiting}`));
  await view.findByText("SYNTHETIC-VH07-NO-TRANSFER");
  expect(sent).toEqual([{ offer: quote }]);
  expect(view.queryByLabelText("VIN")).toBeNull();
  await fireEvent.press(view.getByRole("button", { name: details }));
  expect(view.getByText(/2026-10-14/)).toBeTruthy();
  await view.unmount();
  const reopened = await renderMobile(<RequestScreen />, { locale });
  await reopened.findAllByText(new RegExp(`^${waiting}`));
  await reopened.findByText("SYNTHETIC-VH07-NO-TRANSFER");
  expect(sent).toEqual([{ offer: quote }]);
});
it("recovers a committed acceptance after response loss through readback without asking for another transfer", async () => {
  server.use(http.post("*/vehicle-history/requests/:id/order", async ({ request }) => {
    sent.push(await request.json()); current = accepted; return HttpResponse.error();
  }));
  const view = await renderMobile(<RequestScreen />);
  await fireEvent.press(await view.findByRole("button", { name: "Confirm VIN and quote · 100 TMT" }));
  await view.findAllByText(/^Awaiting synthetic payment/);
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
  await view.findAllByText(/^Payment hold expired/);
  expect(view.getByText(/The slot is released/)).toBeTruthy();
  expect(view.getByText(/VIN: DEMA0000000000001/)).toBeTruthy();
  expect(view.queryByText("SYNTHETIC-VH07-NO-TRANSFER")).toBeNull();
  expect(sent).toEqual([]);
});
it.each([
  ["en", "Accept new format and extra hour", "Original promise", "Agreed recovery deadline", "Refund under review", "Delivery deadlines"],
  ["ru", "Принять новый формат и дополнительный час", "Первоначальный срок", "Согласованный новый срок", "Возврат на рассмотрении", "Сроки доставки"],
  ["tk", "Täze görnüşi we goşmaça sagady kabul et", "Ilkinji wada berlen möhlet", "Ylalaşylan täze möhlet", "Pul gaýtarmak seljerilýär", "Gowşuryş möhletleri"],
] as const)("shows the paid promise and revised format choice in %s, then retains both deadlines on a second miss", async (locale, choice, original, agreed, pending, deadlines) => {
  const offer: H.HistoryRecoveryState = { version: 2, status: "offered", originalPromiseBy: "2026-11-21T07:00:00.000Z",
    originalFormat: "both", paymentHoldExpiresAt: "2026-11-21T07:00:00.000Z", paymentDeadline: "2026-11-21T07:00:00.000Z",
    failure: "file_delivery", missedAt: "2026-11-21T07:00:31.000Z", offeredDeadline: "2026-11-21T08:00:31.000Z", agreedDeadline: null,
    proposedFormat: "pdf", agreedFormat: null, agreedAt: null, pendingReason: null, refundRequestedAt: null };
  current = { ...accepted, status: "payment_confirmed", wallet: null, preparation: "preparing", recovery: offer, serverNow: "2026-11-21T07:00:00.000Z" };
  server.use(http.post("*/vehicle-history/requests/:id/recovery", async ({ request }) => {
    sent.push(await request.json());
    const next: H.HistoryRecoveryState = { ...offer, version: 4, status: "refund_decision_pending", agreedDeadline: offer.offeredDeadline,
      agreedFormat: "pdf", agreedAt: "2026-11-21T07:01:00.000Z", pendingReason: "recovery_missed", refundRequestedAt: "2026-11-21T08:00:31.000Z" };
    current = { ...current, recovery: next, serverNow: "2026-11-21T08:00:31.000Z" };
    return HttpResponse.error();
  }));
  device.fontScale = 1.5;
  const view = await renderMobile(<RequestScreen />, { locale });
  const button = await view.findByRole("button", { name: choice });
  expect(view.getAllByText(new RegExp(original)).length).toBeGreaterThan(0);
  expect(sent).toEqual([]);
  await fireEvent.press(button);
  await view.findByText(pending);
  expect(view.getByText(deadlines)).toBeTruthy();
  expect(view.getAllByText(new RegExp(agreed)).length).toBeGreaterThan(0);
  expect(view.getAllByText(new RegExp(agreed + ".*13:00:31"))).toHaveLength(2);
  expect(view.getAllByText(new RegExp(original)).length).toBeGreaterThan(0);
  expect(view.queryByRole("button", { name: choice })).toBeNull();
  expect(sent).toEqual([{ kind: "accept", orderId: id, expectedVersion: 2, attemptKey: expect.any(String),
    deadline: "2026-11-21T08:00:31.000Z", format: "pdf" }]);
});

it("keeps the original and recovery deadlines in the delivered report history", async () => {
  current = { ...accepted, status: "payment_confirmed", wallet: null, preparation: "delivered",
    recovery: { version: 2, status: "agreed", originalPromiseBy: "2026-11-21T07:00:00.000Z",
      originalFormat: "both", paymentHoldExpiresAt: "2026-11-21T07:00:00.000Z", paymentDeadline: "2026-11-21T07:00:00.000Z",
      failure: "file_delivery", missedAt: "2026-11-21T07:00:31.000Z", offeredDeadline: "2026-11-21T08:00:31.000Z",
      agreedDeadline: "2026-11-21T08:00:31.000Z", proposedFormat: "link", agreedFormat: "link", agreedAt: "2026-11-21T07:01:00.000Z",
      pendingReason: null, refundRequestedAt: null } };
  server.use(http.get("*/vehicle-history/requests/:id/report", () => HttpResponse.json({
    status: "delivered", deliveredAt: "2026-11-21T07:02:00.000Z", artifact: { id, format: "link", source: "new_source",
      report: { reportId: "synthetic", provider: "Carfax", vin: quote.vin, originalReportDate: "2026-10-14", language: "en", permittedUse: true } },
  })));
  const view = await renderMobile(<RequestScreen />);
  await view.findByRole("button", { name: "Open report" });
  expect(view.getByText("Report delivery history")).toBeTruthy();
  expect(view.getByText(/Original promise.*12:00/)).toBeTruthy();
  expect(view.getByText(/Agreed recovery deadline.*13:00:31/)).toBeTruthy();
  expect(view.queryByText("Recovery time agreed")).toBeNull();
  expect(view.queryByText("The agreed report files or link could not be delivered.")).toBeNull();
});

it("shows the exact recovery deadline on a pending correction and the saved window in correction history", async () => {
  const previous = { ...quote, proposal: { ...quote.proposal, deliveryFrom: "2026-11-21T05:00:00.000Z",
    deliveryBy: "2026-11-21T05:45:00.000Z" } };
  const vin = "DEMA0000000000006", deadline = "2026-11-21T08:00:31.000Z";
  current = { ...accepted, status: "payment_confirmed", wallet: null, preparation: "queued",
    recovery: { version: 2, status: "agreed", originalPromiseBy: quote.proposal.deliveryBy,
      originalFormat: "both", paymentHoldExpiresAt: quote.proposal.deliveryBy, paymentDeadline: quote.proposal.deliveryBy,
      failure: "file_delivery", missedAt: quote.proposal.deliveryBy, offeredDeadline: deadline, agreedDeadline: deadline,
      proposedFormat: null, agreedFormat: "both", agreedAt: "2026-11-21T07:01:00.000Z", pendingReason: null, refundRequestedAt: null },
    agreement: { version: 5, acceptedRevision: 3, handoff: null,
      accepted: [{ revision: 0, offer: previous, acceptedAt: accepted.serverNow, cause: null },
        { revision: 3, offer: quote, acceptedAt: accepted.serverNow, cause: "company_error" }],
      pending: { vin, requestedAt: accepted.serverNow, review: { cause: "company_error", offer: { ...quote, vin } } } } };
  const view = await renderMobile(<RequestScreen />);
  await view.findByText(vin);
  expect(view.getAllByText(/Agreed recovery deadline.*13:00:31/)).toHaveLength(3);
  await fireEvent.press(view.getByRole("button", { name: "Previous agreements" }));
  expect(view.getByText(/10:00.*10:45/)).toBeTruthy();
  expect(view.getAllByText(/Agreed recovery deadline.*13:00:31/)).toHaveLength(3);
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

it("shows accepted facts and the next action with access to the agreed details", async () => {
  current = accepted;
  const view = await renderMobile(<RequestScreen />);
  const details = await view.findByRole("button", { name: "Details" });
  expect(view.getByText("DEMA0000000000001 · PDF and provider link")).toBeTruthy();
  expect(view.getByText("Open Details to send or view your test receipt.")).toBeTruthy();
  await fireEvent.press(details);
  expect(view.getByRole("header", { name: "Accepted order" })).toBeTruthy();
});

it("keeps the persistent summary compact and the full correction reachable at accessibility text size", async () => {
  device.fontScale = 2;
  current = accepted;
  const view = await renderMobile(<RequestScreen />, { locale: "ru" });
  await view.findByRole("button", { name: "Условия" });
  expect(view.getByText("Ожидается тестовая оплата · 100 TMT")).toBeTruthy();
  expect(view.queryByText("DEMA0000000000001 · PDF и ссылка провайдера")).toBeNull();
  expect(view.getByText("VIN: DEMA0000000000001")).toBeTruthy();
  await fireEvent.press(await view.findByRole("button", { name: "Исправить VIN" }));
  expect(view.getByLabelText("Исправленный VIN").props.editable).toBe(true);
});

it("keeps the accepted status and reply available while typing and restores details after the keyboard closes", async () => {
  current = accepted;
  const callbacks = new Map<string, (event: Native.KeyboardEvent) => void>();
  const subscribe = Native.Keyboard.addListener;
  const listenerSpy = vi.spyOn(Native.Keyboard, "addListener").mockImplementation((event, callback) => {
    callbacks.set(event, callback);
    return subscribe(event, callback);
  });
  const openKeyboard: Native.KeyboardEvent = { duration: 250, easing: "keyboard",
    endCoordinates: { screenX: 0, screenY: 540, width: 402, height: 334 } };
  try {
    const view = await renderMobile(<RequestScreen />);
    await view.findByRole("button", { name: "Details" });
    const draft = await view.findByLabelText("Your message");
    await fireEvent.changeText(draft, "Test acceptance reference");
    await act(() => callbacks.get("keyboardWillShow")?.(openKeyboard));
    expect(view.getByText("Awaiting synthetic payment · 100 TMT")).toBeTruthy();
    expect(view.queryByText("DEMA0000000000001 · PDF and provider link")).toBeNull();
    expect(view.getByDisplayValue("Test acceptance reference")).toBeTruthy();
    expect(await view.findByRole("button", { name: "Send message", disabled: false })).toBeTruthy();
    await act(() => callbacks.get("keyboardDidHide")?.(openKeyboard));
    expect(view.getByRole("button", { name: "Details" })).toBeTruthy();
    expect(view.getByText("DEMA0000000000001 · PDF and provider link")).toBeTruthy();
  } finally { listenerSpy.mockRestore(); }
});

it("keeps the accepted VIN visible while requesting a correction on that same order", async () => {
  current = accepted;
  server.use(http.post("*/vehicle-history/requests/:id/correction", async ({ request }) => {
    const input = await request.json() as H.HistoryCorrectionMutation;
    sent.push(input);
    const agreement: H.HistoryCorrectionState = { version: 1, acceptedRevision: 0, handoff: null,
      accepted: [{ revision: 0, offer: quote, acceptedAt: "2026-11-21T05:00:00.000Z", cause: null }],
      pending: { vin: "DEMA0000000000006", requestedAt: "2026-11-21T05:01:00.000Z", review: null } };
    current = { ...accepted, agreement, wallet: null };
    return HttpResponse.json(agreement, { status: 201 });
  }));
  const view = await renderMobile(<RequestScreen />);
  await fireEvent.press(await view.findByRole("button", { name: "Correct VIN" }));
  await fireEvent.changeText(view.getByLabelText("Corrected VIN"), "DEMA0000000000006");
  await fireEvent.press(view.getByRole("button", { name: "Request correction" }));
  await view.findAllByText("VIN correction under review");
  expect(view.getAllByText(/DEMA0000000000001/).length).toBeGreaterThan(0);
  expect(sent).toEqual([expect.objectContaining({ kind: "request", vin: "DEMA0000000000006", expectedVersion: 0 })]);
});

it("lets the customer retry the same correction after a request refresh invalidates its response", async () => {
  current = accepted;
  const agreement: H.HistoryCorrectionState = { version: 1, acceptedRevision: 0, handoff: null,
    accepted: [{ revision: 0, offer: quote, acceptedAt: "2026-11-21T05:00:00.000Z", cause: null }],
    pending: { vin: "DEMA0000000000006", requestedAt: "2026-11-21T05:01:00.000Z", review: null } };
  let finishWrite!: () => void, finishRefresh!: () => void;
  const write = new Promise<void>((resolve) => { finishWrite = resolve; });
  const refresh = new Promise<void>((resolve) => { finishRefresh = resolve; });
  server.use(http.post("*/vehicle-history/requests/:id/correction", async ({ request }) => {
    sent.push(await request.json());
    await write;
    current = { ...accepted, agreement, wallet: null };
    return HttpResponse.json(agreement, { status: 201 });
  }));
  const view = await renderMobile(<RequestScreen />);
  await fireEvent.press(await view.findByRole("button", { name: "Correct VIN" }));
  await fireEvent.changeText(view.getByLabelText("Corrected VIN"), "DEMA0000000000006");
  await fireEvent.press(view.getByRole("button", { name: "Request correction" }));
  await vi.waitFor(() => expect(sent).toHaveLength(1));
  let refreshing = false;
  server.use(http.get("*/vehicle-history/requests/:id", async () => {
    refreshing = true;
    await refresh;
    return HttpResponse.json({ id, sourceListingId: null, createdAt: "2026-11-21T04:00:00.000Z",
      status: "enquiry", assignmentVersion: 1, assignedOperator: null });
  }));
  await act(() => getHost(view.container, "RCTScrollView").props.refreshControl.props.onRefresh());
  await vi.waitFor(() => expect(refreshing).toBe(true));
  await act(() => finishWrite());
  await act(() => finishRefresh());
  const retry = await view.findByRole("button", { name: "Retry correction" });
  await vi.waitFor(() => expect(retry).toBeEnabled());
  expect(view.queryByText("Saving correction…")).toBeNull();
  await fireEvent.press(retry);
  await vi.waitFor(() => expect(sent).toHaveLength(2));
  expect(sent).toEqual([expect.objectContaining({ kind: "request", vin: "DEMA0000000000006" }), sent[0]]);
  await vi.waitFor(() => expect(view.queryByRole("button", { name: "Retry correction" })).toBeNull());
});

it("lets the customer repair a rejected VIN without replaying the invalid request", async () => {
  current = accepted;
  const inputs: H.HistoryCorrectionMutation[] = [];
  server.use(http.post("*/vehicle-history/requests/:id/correction", async ({ request }) => {
    inputs.push(await request.json() as H.HistoryCorrectionMutation);
    return HttpResponse.json({ code: "HISTORY_CORRECTION_INVALID" }, { status: 400 });
  }));
  const view = await renderMobile(<RequestScreen />);
  await fireEvent.press(await view.findByRole("button", { name: "Correct VIN" }));
  await fireEvent.changeText(view.getByLabelText("Corrected VIN"), "INVALID-O");
  await fireEvent.press(view.getByRole("button", { name: "Request correction" }));
  expect(view.getByLabelText("Corrected VIN").props.editable).toBe(true);
  await fireEvent.changeText(view.getByLabelText("Corrected VIN"), "DEMA0000000000006");
  await fireEvent.press(view.getByRole("button", { name: "Request correction" }));
  expect(inputs).toEqual([expect.objectContaining({ vin: "INVALID-O" }), expect.objectContaining({ vin: "DEMA0000000000006" })]);
  expect(inputs[1]?.attemptKey).not.toBe(inputs[0]?.attemptKey);
});

it.each([
  ["en", "Refund approved", "Refund completed", "Original promise", "Agreed recovery deadline"],
  ["ru", "Возврат одобрен", "Деньги возвращены", "Первоначальный срок", "Согласованный новый срок"],
  ["tk", "Pul gaýtarym tassyklandy", "Pul yzyna gaýtaryldy", "Ilkinji wada berlen möhlet", "Ylalaşylan täze möhlet"],
] as const)("keeps both deadlines visible in %s and shows the return reference only after execution", async (locale, approved, completed, original, recovery) => {
  const facts = { amountMinor: 12550, originalPromiseBy: quote.proposal.deliveryBy,
    agreedRecoveryDeadline: "2026-11-21T08:00:00.000Z", approvedAt: "2026-11-21T08:10:00.000Z" };
  current = { ...accepted, status: "payment_confirmed", wallet: null, refund: { ...facts, status: "approved" } };
  const view = await renderMobile(<RequestScreen />, { locale });
  await view.findByText(approved);
  expect(view.getByText(new RegExp(`${original}.*12:00`))).toBeTruthy();
  expect(view.getByText(new RegExp(`${recovery}.*13:00`))).toBeTruthy();
  expect(view.queryByText(/SYNTHETIC-VH18-RETURN/)).toBeNull();
  await view.unmount();

  current = { ...current, refund: { ...facts, status: "completed", recordedAt: "2026-11-21T08:30:00.000Z",
    externalReference: "SYNTHETIC-VH18-RETURN" } };
  const reopened = await renderMobile(<RequestScreen />, { locale });
  await reopened.findByText(completed);
  expect(reopened.getByText(new RegExp(`${original}.*12:00`))).toBeTruthy();
  expect(reopened.getByText(new RegExp(`${recovery}.*13:00`))).toBeTruthy();
  expect(reopened.getByText(/SYNTHETIC-VH18-RETURN/)).toBeTruthy();
  expect(sent).toEqual([]);
});

it("refreshes the refund headline and details together after an external return is recorded", async () => {
  const facts = { amountMinor: 12550, originalPromiseBy: quote.proposal.deliveryBy,
    agreedRecoveryDeadline: "2026-11-21T08:00:00.000Z", approvedAt: "2026-11-21T08:10:00.000Z" };
  current = { ...accepted, status: "payment_confirmed", wallet: null, refund: { ...facts, status: "approved" } };
  const view = await renderMobile(<RequestScreen />);
  await view.findByText("The money return is still pending.");
  current = { ...current, refund: { ...facts, status: "completed", recordedAt: "2026-11-21T08:30:00.000Z",
    externalReference: "SYNTHETIC-VH18-RECORDED" } };
  await act(() => getHost(view.container, "RCTScrollView").props.refreshControl.props.onRefresh());
  await view.findByText("Refund completed");
  await view.findByText(/SYNTHETIC-VH18-RECORDED/);
  expect(view.queryByText("The money return is still pending.")).toBeNull();
});
