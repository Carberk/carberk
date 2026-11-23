import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import * as SecureStore from "expo-secure-store";
import { focusManager } from "@tanstack/react-query";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ImagePicker from "expo-image-picker";
import type { HistoryOrderSchemas as H } from "@auto-tm/contracts";

import RequestScreen from "../../app/vehicle-history/requests/[id]";
import { act, fireEvent, renderMobile, routeParams } from "../../test/render";
import { server } from "../../test/msw";
import { queryKeys } from "../api/queryKeys";
import { clearAuthSession, storeAuthSession } from "../auth/session";

import { proofDevice } from "./application/testing/paymentProofDevice";

vi.mock("react-native-safe-area-context", async () => ({
  SafeAreaView: (await import("react-native")).View,
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

const userId = "00000000-0000-4000-8000-000000000001";
const id = "10000000-0000-4000-8000-000000000101";
const enquiry = { id, sourceListingId: null, createdAt: "2026-11-21T04:00:00.000Z", status: "enquiry", assignmentVersion: 1, assignedOperator: null };
const metadataQuery = { queryKey: queryKeys.vehicleHistory.detail(userId, "session-one", id), exact: true };
const quote: H.AcceptHistoryQuote["offer"] = { version: 2, vin: "DEMA0000000000001", synthetic: true,
  preflight: { status: "available", providers: [{ name: "Carfax", originalReportDate: "2026-10-14" }] },
  proposal: { format: "both", priceTmt: 100, providerRule: "either_available_both_when_obtainable", terms: "service_failure_review",
    deliveryFrom: "2026-11-21T06:00:00.000Z", deliveryBy: "2026-11-21T07:00:00.000Z" } };
const accepted: H.HistoryOrderState = { order: { id, acceptedOffer: quote, acceptedAt: "2026-11-21T05:00:00.000Z",
  holdExpiresAt: "2026-11-21T07:00:00.000Z", deliveryDay: "2026-11-21" }, status: "awaiting_synthetic_payment",
  serverNow: "2026-11-21T05:00:00.000Z", wallet: "SYNTHETIC-VH07-NO-TRANSFER", collectionEnabled: false };
let current: H.HistoryOrderState;
let sent: unknown[];
let proofStatus: "pending" | "uploaded" | "submitted";
const fileId = "20000000-0000-4000-8000-000000000001";
vi.mock("expo-file-system/legacy", async () => (await import("./application/testing/paymentProofDevice")).proofFileSystem);
beforeEach(async () => {
  const values = new Map<string, string>();
  vi.mocked(AsyncStorage.getItem).mockImplementation(async (key) => values.get(key) ?? null);
  vi.mocked(AsyncStorage.setItem).mockImplementation(async (key, value) => { values.set(key, value); });
  vi.mocked(AsyncStorage.removeItem).mockImplementation(async (key) => { values.delete(key); });
  let stored: string | null = null;
  vi.mocked(SecureStore.getItemAsync).mockImplementation(async () => stored);
  vi.mocked(SecureStore.setItemAsync).mockImplementation(async (_key, value) => { stored = value; });
  vi.mocked(SecureStore.deleteItemAsync).mockImplementation(async () => { stored = null; });
  await storeAuthSession({ accessToken: `header.${btoa(JSON.stringify({ sid: "session-one", sub: userId }))}.signature`, refreshToken: "test-refresh",
    user: { id: userId, phone: null, email: "synthetic@example.test", displayName: null, role: "buyer" } });
  vi.stubEnv("EXPO_PUBLIC_ENV", "development"); vi.stubEnv("EXPO_PUBLIC_VEHICLE_HISTORY_SYNTHETIC", "true");
  routeParams.id = id;
  current = { order: null, status: "enquiry", serverNow: "2026-11-21T05:00:00.000Z", wallet: null, collectionEnabled: false };
  current = accepted;
  sent = [];
  proofStatus = "pending";
  proofDevice.files.clear(); proofDevice.failUpload = false;
  proofDevice.files.set("file:///picked.png", { size: 100, bytes: "synthetic receipt" });
  vi.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValue({ canceled: false, assets: [{ uri: "file:///picked.png", width: 64, height: 64, mimeType: "image/png", fileSize: 100 }] });
  server.use(
    http.get("*/vehicle-history/requests/:id/payment-proofs", () => HttpResponse.json({ items: proofStatus === "submitted" ? [proof()] : [] })),
    http.post("*/vehicle-history/requests/:id/payment-proofs", async ({ request }) => { sent.push(await request.json()); return HttpResponse.json(proof(), { status: 201 }); }),
    http.put("*/vehicle-history/requests/:id/payment-proofs/:fileId/content", () => { proofStatus = "uploaded"; return HttpResponse.json(proof()); }),
    http.post("*/vehicle-history/requests/:id/payment-proofs/:fileId/submit", () => { proofStatus = "submitted"; return HttpResponse.json(proof(), { status: 201 }); }),
    http.get("*/vehicle-history/requests/:id/payment-proofs/:fileId/content", () => HttpResponse.json({ file: proof(), dataBase64: "c3ludGhldGlj" })),
    http.get("*/vehicle-history/requests/:id", () => HttpResponse.json(enquiry)),
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

function proof() { return { id: fileId, orderId: id, purpose: "payment_evidence", status: proofStatus,
  sizeBytes: 100, contentType: "image/png", createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 86400000).toISOString(),
  submittedAt: proofStatus === "submitted" ? new Date().toISOString() : null }; }

it.each([
  ["en", "Choose receipt", "Send receipt", "Receipt submitted"],
  ["ru", "Выбрать квитанцию", "Отправить квитанцию", "Квитанция отправлена"],
  ["tk", "Çek saýla", "Çegi iber", "Çek iberildi"],
])("picks and privately previews a receipt in %s, then submits without changing payment status", async (locale, pick, send, submitted) => {
  const view = await renderMobile(<RequestScreen />, { locale });
  await fireEvent.press(await view.findByRole("button", { name: pick }));
  expect(await view.findByLabelText(locale === "en" ? "Selected receipt preview" : locale === "ru" ? "Предпросмотр выбранной квитанции" : "Saýlanan çegiň görnüşi")).toBeTruthy();
  await fireEvent.press(await view.findByRole("button", { name: send }));
  await view.findByText(submitted);
  expect(sent).toMatchObject([{ orderId: id, contentType: "image/png", sizeBytes: 100 }]);
  expect(current).toEqual(accepted);
});
it.each([
  ["receipt_submitted", "receipt_submitted", "Receipt submitted", "Wait for the operator to check the receiving wallet. Do not pay again."],
  ["payment_review", "partial", "Partial payment under review", "The operator is reconciling the amount. Continue in this conversation; do not pay again."],
  ["payment_review", "unmatched", "Transfer not matched", "Check the transfer destination and send its reference here. Do not pay again."],
  ["payment_review", "uncertain", "Payment under review", "The operator is checking the transfer. Continue in this conversation; do not pay again."],
  ["payment_confirmed", "matched", "Payment confirmed", "Your accepted booking is confirmed. No further payment is needed."],
  ["payment_received_no_hold", "matched", "Money received · booking needs agreement", "Your money is recorded. Contact the operator to agree a feasible window; do not pay again."],
] as const)("renders authoritative %s / %s in the real request route without showing transfer instructions", async (status, outcome, heading, next) => {
  current = { ...accepted, wallet: null, status, payment: { outcome, amountMinor: outcome === "partial" ? 6000 : 10000,
    receivedAt: "2026-11-21T05:00:00.000Z", confirmedAt: outcome === "matched" ? "2026-11-21T05:01:00.000Z" : null,
    bookingCommitted: status === "payment_confirmed" } };
  const view = await renderMobile(<RequestScreen />);
  await view.findAllByText(`${heading} · 100 TMT`);
  await view.findAllByText(next);
  if (outcome === "partial") expect(view.getByText("Amount checked: 60 TMT")).toBeTruthy();
  expect(view.queryByText("SYNTHETIC-VH07-NO-TRANSFER")).toBeNull();
  expect(sent).toEqual([]);
});
it.each([
  ["en", "preparing", "Preparing your report", "Check progress here. Your payment is confirmed."],
  ["ru", "checking", "Оператор проверяет результат", "Мы обновим статус после проверки у поставщика."],
  ["tk", "recovery", "Işgär çözgüt gözleýär", "Indiki ädimi maslahatlaşmak üçin şu söhbetde işgäre ýazyň."],
] as const)("renders %s %s preparation on reopen without showing a second transfer action", async (locale, preparation, title, next) => {
  current = { ...accepted, wallet: null, status: "payment_confirmed", preparation, payment: { outcome: "matched", amountMinor: 10000,
    receivedAt: "2026-11-21T05:00:00.000Z", confirmedAt: "2026-11-21T05:01:00.000Z", bookingCommitted: true } };
  const view = await renderMobile(<RequestScreen />, { locale });
  await view.findAllByText(`${title} · 100 TMT`);
  await view.findAllByText(next);
  expect(view.queryByText("SYNTHETIC-VH07-NO-TRANSFER")).toBeNull();
  expect(sent).toEqual([]);
});
it("retains selection across interruption and route reopen, retrying the same attempt with no second payment", async () => {
  proofDevice.failUpload = true;
  const view = await renderMobile(<RequestScreen />);
  await fireEvent.press(await view.findByRole("button", { name: "Choose receipt" }));
  await fireEvent.press(await view.findByRole("button", { name: "Send receipt" }));
  await view.findByText(/do not pay again/i);
  const original = sent[0];
  await view.unmount();
  proofDevice.failUpload = false;
  const reopened = await renderMobile(<RequestScreen />);
  await reopened.findByLabelText("Selected receipt preview");
  await fireEvent.press(await reopened.findByRole("button", { name: "Send receipt" }));
  await reopened.findByText("Receipt submitted");
  expect(sent).toEqual([original, original]);
});
it("rejects oversized native selection while keeping the message draft and no network stage", async () => {
  proofDevice.files.set("file:///picked.png", { size: 9 * 1024 * 1024, bytes: "oversized" });
  const view = await renderMobile(<RequestScreen />);
  const message = await view.findByLabelText("Your message");
  await fireEvent.changeText(message, "Keep my transfer reference");
  await fireEvent.press(await view.findByRole("button", { name: "Choose receipt" }));
  await view.findByText("Use one JPEG, PNG or WebP image up to 8 MB. Try a smaller screenshot.");
  expect(view.getByDisplayValue("Keep my transfer reference")).toBeTruthy();
  expect(sent).toEqual([]);
});
it("discards a delayed picker result after the session ends", async () => {
  let release!: (value: ImagePicker.ImagePickerResult) => void;
  vi.mocked(ImagePicker.launchImageLibraryAsync).mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
  const view = await renderMobile(<RequestScreen />);
  await fireEvent.press(await view.findByRole("button", { name: "Choose receipt" }));
  await act(() => clearAuthSession());
  await act(() => release({ canceled: false, assets: [{ uri: "file:///picked.png", width: 64, height: 64, mimeType: "image/png" }] }));
  expect(view.queryByLabelText("Selected receipt preview")).toBeNull();
  expect(sent).toEqual([]);
});

it("shows actual upload progress and submits only after the byte transfer succeeds", async () => {
  let release!: () => void;
  const uploaded = new Promise<void>((resolve) => { release = resolve; });
  let submissions = 0;
  server.use(
    http.put("*/vehicle-history/requests/:id/payment-proofs/:fileId/content", async () => { await uploaded; proofStatus = "uploaded"; return HttpResponse.json(proof()); }),
    http.post("*/vehicle-history/requests/:id/payment-proofs/:fileId/submit", () => { submissions++; proofStatus = "submitted"; return HttpResponse.json(proof(), { status: 201 }); }),
  );
  const view = await renderMobile(<RequestScreen />);
  await fireEvent.press(await view.findByRole("button", { name: "Choose receipt" }));
  await fireEvent.press(await view.findByRole("button", { name: "Send receipt" }));
  await view.findByRole("progressbar", { value: { min: 0, max: 100, now: 50 } });
  expect(submissions).toBe(0);
  await act(() => release());
  await view.findByText("Receipt submitted");
  expect(submissions).toBe(1);
});
it("renews only expired staging with the retained file and keeps the original order", async () => {
  let expired = true;
  server.use(http.post("*/vehicle-history/requests/:id/payment-proofs", async ({ request }) => {
    sent.push(await request.json());
    if (expired) return HttpResponse.json({ code: "HISTORY_PROOF_EXPIRED" }, { status: 409 });
    return HttpResponse.json(proof(), { status: 201 });
  }));
  const view = await renderMobile(<RequestScreen />);
  await fireEvent.press(await view.findByRole("button", { name: "Choose receipt" }));
  await fireEvent.press(await view.findByRole("button", { name: "Send receipt" }));
  await view.findByRole("button", { name: "Retry receipt upload" });
  expired = false;
  await fireEvent.press(view.getByRole("button", { name: "Retry receipt upload" }));
  await view.findByText("Receipt submitted");
  expect(sent).toHaveLength(2);
  const attempts = sent as { attemptKey: string; orderId: string; contentType: string; sizeBytes: number }[];
  expect(attempts[0]?.attemptKey).not.toBe(attempts[1]?.attemptKey);
  expect(attempts.map(({ orderId, sizeBytes }) => ({ orderId, sizeBytes }))).toEqual([{ orderId: id, sizeBytes: 100 }, { orderId: id, sizeBytes: 100 }]);
  expect(current).toEqual(accepted);
});
it("reconciles a submitted receipt after a lost response without another upload or submission", async () => {
  let submissions = 0, uploads = 0;
  server.use(
    http.put("*/vehicle-history/requests/:id/payment-proofs/:fileId/content", () => { uploads++; proofStatus = "uploaded"; return HttpResponse.json(proof()); }),
    http.post("*/vehicle-history/requests/:id/payment-proofs/:fileId/submit", () => { submissions++; proofStatus = "submitted"; return HttpResponse.error(); }),
  );
  const view = await renderMobile(<RequestScreen />);
  await fireEvent.press(await view.findByRole("button", { name: "Choose receipt" }));
  await fireEvent.press(await view.findByRole("button", { name: "Send receipt" }));
  await fireEvent.press(await view.findByRole("button", { name: "Retry receipt upload" }));
  await view.findByText("Receipt submitted");
  expect({ uploads, submissions }).toEqual({ uploads: 1, submissions: 1 });
});

it("opens the local private preview at screen size and closes back to the retained selection", async () => {
  const view = await renderMobile(<RequestScreen />);
  await fireEvent.press(await view.findByRole("button", { name: "Choose receipt" }));
  await fireEvent.press(await view.findByRole("button", { name: "Selected receipt preview" }));
  await view.findByLabelText("Private payment receipt");
  await fireEvent.press(view.getByRole("button", { name: "Close receipt" }));
  expect(view.queryByLabelText("Private payment receipt")).toBeNull();
  expect(view.getByRole("button", { name: "Send receipt" })).toBeTruthy();
});

it("shows submitted receipts and allows another selection when the retained local file is gone", async () => {
  const view = await renderMobile(<RequestScreen />);
  await fireEvent.press(await view.findByRole("button", { name: "Choose receipt" }));
  await view.findByLabelText("Selected receipt preview");
  await view.unmount();
  proofDevice.files.clear();
  proofStatus = "submitted";

  const reopened = await renderMobile(<RequestScreen />);
  await reopened.findByText("Receipt submitted");
  expect(reopened.getByRole("button", { name: "Choose receipt" })).toBeTruthy();
  expect(reopened.queryByLabelText("Selected receipt preview")).toBeNull();
});

it("keeps the receipt preview open during request refresh and closes it on access denial", async () => {
  const view = await renderMobile(<RequestScreen />);
  await fireEvent.press(await view.findByRole("button", { name: "Choose receipt" }));
  await fireEvent.press(await view.findByRole("button", { name: "Selected receipt preview" }));
  await view.findByRole("button", { name: "Close receipt" });

  const metadata = Promise.withResolvers<undefined>();
  server.use(http.get("*/vehicle-history/requests/:id", async () => { await metadata.promise; return HttpResponse.json(enquiry); }));
  let refreshMetadata: Promise<void> | undefined;
  try {
    await act(async () => { refreshMetadata = view.queryClient.refetchQueries(metadataQuery); });
    await vi.waitFor(() => expect(view.getByRole("button", { name: "Details" })).toBeDisabled());
    expect(view.getByRole("button", { name: "Close receipt" })).toBeTruthy();
  } finally {
    await act(async () => { metadata.resolve(undefined); await refreshMetadata; });
  }
  expect(view.getByRole("button", { name: "Close receipt" })).toBeTruthy();

  server.use(http.get("*/vehicle-history/requests/:id", () => HttpResponse.json({ code: "HISTORY_REQUEST_DENIED" }, { status: 403 })));
  await act(() => view.queryClient.refetchQueries(metadataQuery));
  await vi.waitFor(() => expect(view.queryByRole("button", { name: "Close receipt" })).toBeNull());
  expect(view.queryByLabelText("Selected receipt preview")).toBeNull();
});

it("keeps the receipt preview open when offer readback finishes during request refresh", async () => {
  const view = await renderMobile(<RequestScreen />);
  await fireEvent.press(await view.findByRole("button", { name: "Choose receipt" }));
  await fireEvent.press(await view.findByRole("button", { name: "Selected receipt preview" }));
  await view.findByRole("button", { name: "Close receipt" });

  const metadata = Promise.withResolvers<undefined>();
  const offerRead = Promise.withResolvers<undefined>();
  const offerQuery = { queryKey: [...metadataQuery.queryKey, "offer", enquiry.assignmentVersion], exact: true };
  server.use(http.get("*/vehicle-history/requests/:id", async () => { await metadata.promise; return HttpResponse.json(enquiry); }),
    http.get("*/vehicle-history/requests/:id/offer", async () => { await offerRead.promise; return HttpResponse.json(quote); }));
  let refreshOffer: Promise<void> | undefined;
  let refreshMetadata: Promise<void> | undefined;
  try {
    await act(async () => { refreshOffer = view.queryClient.refetchQueries(offerQuery); });
    await vi.waitFor(() => expect(view.queryClient.isFetching(offerQuery)).toBe(1));
    await act(async () => { refreshMetadata = view.queryClient.refetchQueries(metadataQuery); });
    await vi.waitFor(() => expect(view.getByRole("button", { name: "Details" })).toBeDisabled());
    await act(async () => { offerRead.resolve(undefined); await refreshOffer; });
    expect(view.queryClient.getQueryState(offerQuery.queryKey)?.status).toBe("success");
    expect(view.getByRole("button", { name: "Close receipt" })).toBeTruthy();
  } finally {
    await act(async () => {
      offerRead.resolve(undefined);
      metadata.resolve(undefined);
      await Promise.all([refreshOffer, refreshMetadata]);
    });
  }
});

it("finishes one upload and submission while request refresh is still pending", async () => {
  const upload = Promise.withResolvers<undefined>();
  let submissions = 0;
  server.use(
    http.put("*/vehicle-history/requests/:id/payment-proofs/:fileId/content", async () => {
      await upload.promise; proofStatus = "uploaded"; return HttpResponse.json(proof());
    }),
    http.post("*/vehicle-history/requests/:id/payment-proofs/:fileId/submit", () => {
      submissions++; proofStatus = "submitted"; return HttpResponse.json(proof(), { status: 201 });
    }),
  );
  const view = await renderMobile(<RequestScreen />);
  await fireEvent.press(await view.findByRole("button", { name: "Choose receipt" }));
  const send = await view.findByRole("button", { name: "Send receipt" });
  await act(async () => { void fireEvent.press(send); });
  await view.findByRole("progressbar", { value: { min: 0, max: 100, now: 50 } });

  const metadata = Promise.withResolvers<undefined>();
  server.use(http.get("*/vehicle-history/requests/:id", async () => { await metadata.promise; return HttpResponse.json(enquiry); }));
  let refreshMetadata: Promise<void> | undefined;
  try {
    await act(async () => { refreshMetadata = view.queryClient.refetchQueries(metadataQuery); });
    await vi.waitFor(() => expect(view.queryClient.isFetching(metadataQuery)).toBe(1));
    await act(() => upload.resolve(undefined));
    await view.findByText("Receipt submitted");
    expect(submissions).toBe(1);
  } finally {
    await act(async () => {
      upload.resolve(undefined);
      metadata.resolve(undefined);
      await refreshMetadata;
    });
  }
});
