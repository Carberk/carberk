// @vitest-environment happy-dom
import { createHash } from "node:crypto";

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { fireEvent, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { HistoryPaymentSchemas as P } from "@auto-tm/contracts";

const auth = vi.hoisted(() => ({ token: "" }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ origin: "http://admin.test" }),
  cookies: async () => ({ get: () => ({ value: auth.token }) }) }));
vi.mock("next/navigation", () => ({ unstable_rethrow: () => undefined }));
import { PaymentVerificationPanel } from "./PaymentVerificationPanel";
import { historyPaymentAction } from "./payment-actions";

const actor = { id: "10000000-0000-4000-8000-000000001213", displayName: "Synthetic operator", nameNumber: 1213 };
const id = "10000000-0000-4000-8000-000000001231", sid = "30000000-0000-4000-8000-000000001231";
const scope = createHash("sha256").update(`history-inbox\0${actor.id}\0${sid}`).digest("hex");
const order = { id, acceptedAt: "2026-11-21T05:00:00.000Z", holdExpiresAt: "2026-11-21T07:00:00.000Z", deliveryDay: "2026-11-21",
  acceptedOffer: { version: 2, vin: "DEMA0000000000001", synthetic: true, preflight: { status: "available", providers: [{ name: "Carfax", originalReportDate: null }] },
    proposal: { format: "both", priceTmt: 100, providerRule: "either_available_both_when_obtainable", terms: "service_failure_review", deliveryFrom: "2026-11-21T06:00:00.000Z", deliveryBy: "2026-11-21T07:00:00.000Z" } } };
let root: Root, container: HTMLDivElement, checks: P.HistoryPaymentCheck[], sent: P.HistoryPaymentCheckInput[];
let denied: boolean, failAfterCommit: boolean, unavailable: boolean, late: boolean, rejectCheck: boolean;
let deskReads: number, assignmentVersion: number;
let afterPaymentRead: (() => void) | undefined;
const changed = vi.fn(), invalidated = vi.fn();
const accessToken = (session: string) => `e30.${Buffer.from(JSON.stringify({ sub: actor.id, sid: session, exp: Math.floor(Date.now() / 1000) + 900 })).toString("base64url")}.synthetic`;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubEnv("NODE_ENV", "test"); vi.stubEnv("API_BASE_URL", "http://api.test"); vi.stubEnv("ADMIN_ORIGIN", "http://admin.test");
  auth.token = accessToken(sid);
  localStorage.clear(); checks = []; sent = []; denied = false; failAfterCommit = false; unavailable = false; late = false; rejectCheck = false;
  deskReads = 0; assignmentVersion = 1; afterPaymentRead = undefined;
  changed.mockClear(); invalidated.mockClear();
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const path = new URL(url).pathname;
    if (denied) return Response.json({ code: "HISTORY_OPERATOR_DENIED" }, { status: 403 });
    if (path.endsWith("/desk")) {
      if (++deskReads > 1) return Response.json({ code: "RATE_LIMITED" }, { status: 429 });
      return Response.json({ purpose: "vehicle-history", mode: "synthetic", actor, requests: [] });
    }
    if (path.endsWith("/payment-verification")) {
      if (unavailable) return Response.json({ code: "HISTORY_PAYMENT_UNAVAILABLE" }, { status: 503 });
      if (init?.method === "POST") {
        if (rejectCheck) return Response.json({ code: "HISTORY_PAYMENT_INVALID" }, { status: 400 });
        const input = JSON.parse(String(init.body)) as P.HistoryPaymentCheckInput;
        sent.push(input);
        if (!checks.some((check) => check.input.attemptKey === input.attemptKey)) checks.push({ input, actorId: actor.id, version: checks.length + 1,
          checkedAt: "2026-11-21T05:01:00.000Z", confirmedAt: input.outcome === "matched" ? "2026-11-21T05:01:00.000Z" : null, bookingCommitted: input.outcome === "matched" && !late });
        if (failAfterCommit) throw new Error("Synthetic lost response");
      }
      afterPaymentRead?.();
      return Response.json({ orderId: id, version: checks.length, checks });
    }
    if (path.endsWith("/payment-proofs")) return Response.json({ items: [] });
    if (path.endsWith("/order")) return Response.json({ order, status: checks.at(-1)?.confirmedAt ? late ? "payment_received_no_hold" : "payment_confirmed" : "awaiting_synthetic_payment",
      serverNow: "2026-11-21T05:01:00.000Z", wallet: null, collectionEnabled: false });
    return Response.json({ id, createdAt: "2026-11-21T05:00:00.000Z", status: "enquiry", mine: true, assignmentVersion,
      requester: { displayName: "Synthetic customer", nameNumber: 1231, deleted: false }, assignedOperator: actor, sourceListingId: null });
  }));
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); localStorage.clear(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
const panel = (locale: "en" | "ru" | "tk" = "en") => <PaymentVerificationPanel {...{ locale, id, version: 1, scope, actorId: actor.id, revision: 0 }} invalidate={invalidated} onOrder={changed} />;
const view = () => within(container);
async function submit() {
  const form = container.querySelector("form");
  if (!form) throw new Error("Missing wallet-check form");
  await act(async () => fireEvent.submit(form));
}
async function fill() {
  await act(async () => {
    fireEvent.change(view().getByLabelText("Check result"), { target: { value: "matched" } });
    fireEvent.change(view().getByLabelText("Amount checked (TMT)"), { target: { value: "100" } });
    fireEvent.change(view().getByLabelText("Transfer reference"), { target: { value: "SYNTHETIC-REFERENCE" } });
    fireEvent.change(view().getByLabelText("Independent wallet evidence"), { target: { value: "Synthetic wallet ledger checked independently" } });
    fireEvent.change(view().getByLabelText("Received at · Ashgabat time"), { target: { value: "2026-11-21T10:00" } });
  });
}
it("records an explicit independent check through the real server action and reads the immutable agreement", async () => {
  await act(async () => root.render(panel()));
  await view().findByText("No wallet check recorded. A receipt alone does not confirm money.");
  await fill();
  expect((view().getByRole("button", { name: "Record wallet check" }) as HTMLButtonElement).disabled).toBe(true);
  await act(async () => fireEvent.click(view().getByRole("checkbox")));
  await submit();
  await view().findByText("Payment confirmed");
  expect(sent).toMatchObject([{ orderId: id, expectedAssignmentVersion: 1, expectedPaymentVersion: 0, walletChecked: true, outcome: "matched",
    amountMinor: 10000, receivedAt: "2026-11-21T05:00:00.000Z", reference: "SYNTHETIC-REFERENCE", evidence: "Synthetic wallet ledger checked independently" }]);
  expect(changed).toHaveBeenLastCalledWith(expect.objectContaining({ status: "payment_confirmed" }));
  expect(deskReads).toBe(0);
  expect(view().queryByRole("button", { name: "Record wallet check" })).toBeNull();
  expect(localStorage.length).toBe(0);
  await act(async () => fireEvent.click(view().getByText("Recorded wallet checks")));
  expect(container.textContent).toContain(actor.id);
  expect(container.textContent).toContain("SYNTHETIC-REFERENCE");
});
it("refuses a stale selection before submitting a wallet check from a different session", async () => {
  auth.token = accessToken("30000000-0000-4000-8000-000000001232");
  const mutation = { attemptKey: "40000000-0000-4000-8000-000000001231", orderId: id, expectedAssignmentVersion: 1,
    expectedPaymentVersion: 0, walletChecked: true, outcome: "unmatched", amountMinor: 0,
    reference: "SYNTHETIC-REFERENCE", evidence: "Synthetic wallet check", receivedAt: null, evidenceFileId: null };
  expect((await historyPaymentAction("en", { id, scope, expectedAssignmentVersion: 1, mutation })).status).toBe("stale");
  expect(sent).toEqual([]);
});
it.each(["session", "assignment"] as const)("withholds payment readback after the %s changes", async (change) => {
  afterPaymentRead = () => {
    if (change === "session") auth.token = accessToken("30000000-0000-4000-8000-000000001232");
    else assignmentVersion = 2;
  };
  const result = await historyPaymentAction("en", { id, scope, expectedAssignmentVersion: 1 });
  expect(result.status).toBe(change === "session" ? "stale" : "conflict");
  expect(result).not.toHaveProperty("data");
});
it("reconciles a lost confirmation response through GET with no second POST", async () => {
  failAfterCommit = true;
  await act(async () => root.render(panel()));
  await view().findByText("No wallet check recorded. A receipt alone does not confirm money.");
  await fill();
  await act(async () => fireEvent.click(view().getByRole("checkbox")));
  await submit();
  await view().findByRole("alert");
  expect(sent).toHaveLength(1);
  expect(localStorage.length).toBe(1);
  await act(async () => fireEvent.click(view().getByRole("button", { name: "Refresh payment review" })));
  await view().findByText("Payment confirmed");
  expect(sent).toHaveLength(1);
  expect(localStorage.length).toBe(0);
});
it.each([
  ["en", "Payment under review", "Refresh payment review", "Transfer not matched"],
  ["ru", "Оплата на проверке", "Обновить проверку оплаты", "Перевод не найден"],
  ["tk", "Töleg barlanýar", "Töleg barlagyny täzele", "Geçirim tapylmady"],
] as const)("shows a recorded unmatched review and denial recovery in %s", async (locale, review, refresh, unmatched) => {
  checks = [{ input: { attemptKey: "40000000-0000-4000-8000-000000001231", orderId: id, expectedAssignmentVersion: 1, expectedPaymentVersion: 0,
    walletChecked: true, outcome: "unmatched", amountMinor: 0, reference: "SYNTHETIC-UNMATCHED", evidence: "Synthetic wallet has no matching entry", receivedAt: null, evidenceFileId: null },
    actorId: actor.id, version: 1, checkedAt: "2026-11-21T05:01:00.000Z", confirmedAt: null, bookingCommitted: false }];
  await act(async () => root.render(panel(locale)));
  await view().findByText(review);
  expect(container.textContent).toContain(unmatched);
  denied = true;
  await act(async () => fireEvent.click(view().getByRole("button", { name: refresh })));
  await view().findByRole("alert");
  expect(container.textContent).not.toContain("SYNTHETIC-UNMATCHED");
  expect(view().queryByRole("checkbox")).toBeNull();
  expect(invalidated).toHaveBeenCalled();
});
it("keeps full verified funds outside fulfilment when the booking is invalid", async () => {
  late = true;
  await act(async () => root.render(panel()));
  await view().findByText("No wallet check recorded. A receipt alone does not confirm money.");
  await fill();
  await act(async () => fireEvent.click(view().getByRole("checkbox")));
  await submit();
  await view().findByText("Money received · no valid booking");
  expect(container.textContent).toContain("do not fulfil or request another payment");
});
it("offers recoverable loading failure without a wallet action", async () => {
  unavailable = true;
  await act(async () => root.render(panel()));
  await view().findByRole("alert");
  expect(view().queryByRole("checkbox")).toBeNull();
  unavailable = false;
  await act(async () => fireEvent.click(view().getByRole("button", { name: "Refresh payment review" })));
  await waitFor(() => expect(view().getByRole("checkbox")).toBeTruthy());
});
it("lets the operator correct refused input and records fractional TMT exactly", async () => {
  rejectCheck = true;
  await act(async () => root.render(panel()));
  await view().findByText("No wallet check recorded. A receipt alone does not confirm money.");
  await fill();
  await act(async () => fireEvent.click(view().getByRole("checkbox")));
  await submit();
  await view().findByRole("alert");
  expect(localStorage.length).toBe(0);
  rejectCheck = false;
  await act(async () => fireEvent.click(view().getByRole("button", { name: "Refresh payment review" })));
  await view().findByRole("checkbox");
  await act(async () => {
    fireEvent.change(view().getByLabelText("Check result"), { target: { value: "partial" } });
    fireEvent.change(view().getByLabelText("Amount checked (TMT)"), { target: { value: "60.01" } });
  });
  await submit();
  await view().findByText("Payment under review");
  expect(sent).toMatchObject([{ amountMinor: 6001, outcome: "partial" }]);
});
