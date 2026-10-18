// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ServiceMessagingSchemas as S } from "@auto-tm/contracts";

import { HistoryWorkspace } from "./HistoryWorkspace";
import { HistoryReportsWorkspace } from "./HistoryReportsWorkspace";
import { historyCopy } from "./historyCopy";
import { reportCopy } from "./reportCopy";

// Framework boundary only: real actions and feature children execute. Next may
// reject before the action result wrapper, just as a failed browser RPC does.
const framework = vi.hoisted(() => ({ fail: false }));
vi.mock("next/headers", () => ({ headers: async () => { if (framework.fail) throw new Error("private RPC failure"); return new Headers(); }, cookies: async () => ({ get: () => ({ value: "synthetic-access" }) }) }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(url); }, unstable_rethrow: () => {} }));
const id = "11111111-1111-4111-8111-111111111111";
const conversation: S.ServiceConversation = { id, resourceId: id, purpose: "history", status: "enquiry", assignmentVersion: 1, assigned: true, operatorName: "Operator", sourceListingId: null, canSend: true, messages: [], lastSequence: 0, readThrough: 0, unread: 0, hasMore: false };
const order = { id, quoteId: id, state: "paid", version: 1, day: "2026-10-20", holdExpiresAt: "2026-10-20T10:00:00Z", promiseAt: "2026-10-20T12:00:00Z", paidAt: null, escalatedAt: null, recoveryDeadline: null, recoveryOfferedDeadline: null, recoveryOfferExpiresAt: null, recoveryAgreedAt: null, recoveryUsed: false, refundState: null };
const artifact = { id, provider: "carfax", vin: "1HGCM82633A004352", originalDate: "2020-01-01T00:00:00Z", sizeBytes: 4, expectedPages: 1, sharedLink: null, deliveredAt: null, state: "verified", canShare: true, vehicleIdentity: null, mileage: null, sourceObservations: [] };
let accepted: Record<string, unknown>[];
beforeEach(() => {
 framework.fail = false; accepted = [];
 vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
  if (init?.method === "POST") { accepted.push(JSON.parse(String(init.body))); return Response.json(String(url).endsWith("payment-history") ? { synthetic: true, quotes: [], order: { ...order, state: "delivered" }, payments: [] } : { ok: true }); }
  return Response.json(String(url).endsWith("reports") ? { delivered: [], staged: [], archive: [artifact] } : { synthetic: true, quotes: [], order: { ...order, state: "delivered" }, payments: [] });
 });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it.each(["en", "ru", "tk"])("recovers historical payment rejection with draft and explicit retry in %s", async locale => {
 const c = historyCopy(locale);
 render(<HistoryWorkspace conversation={conversation} locale={locale} denied={() => {}}/>);
 await screen.findByText(/2026-10-20 \/ /);
 fireEvent.change(screen.getByLabelText(c.reason), { target: { value: "Investigate payment" } });
 framework.fail = true;
 fireEvent.click(screen.getByRole("button", { name: c.historyPayments }));
 await screen.findByRole("alert");
 expect((screen.getByRole("button", { name: c.refresh }) as HTMLButtonElement).disabled).toBe(false);
 expect((screen.getByLabelText(c.reason) as HTMLInputElement).value).toBe("Investigate payment");
 expect(screen.queryByText("private RPC failure")).toBeNull(); expect(accepted).toEqual([]);
 framework.fail = false;
 fireEvent.click(screen.getByRole("button", { name: c.historyPayments }));
 await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
 expect(accepted).toEqual([{ reason: "Investigate payment" }]);
});
it("recovers an order command rejection without losing its reason or automatically replaying it", async () => {
 const c = historyCopy("en");
 render(<HistoryWorkspace conversation={conversation} locale="en" denied={() => {}}/>);
 await screen.findByText(/2026-10-20 \/ /);
 fireEvent.change(screen.getByLabelText(c.reason), { target: { value: "Provider unavailable" } });
 framework.fail = true; fireEvent.click(screen.getByRole("button", { name: c.missed }));
 await screen.findByRole("alert");
 expect((screen.getByRole("button", { name: c.refresh }) as HTMLButtonElement).disabled).toBe(false);
 expect((screen.getByLabelText(c.reason) as HTMLInputElement).value).toBe("Provider unavailable"); expect(accepted).toEqual([]);
 framework.fail = false; fireEvent.click(screen.getByRole("button", { name: c.missed }));
 await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
 expect(accepted[0]).toMatchObject({ kind: "missed", reason: "Provider unavailable" });
});
it("recovers artifact command rejection and preserves the upload draft for explicit retry", async () => {
 const c = reportCopy("en"); let changes = 0;
 render(<HistoryReportsWorkspace id={id} order={order} assignmentVersion={1} locale="en" denied={() => {}} changed={() => { changes++; }}/>);
 await screen.findByRole("button", { name: c.archive });
 fireEvent.change(screen.getByLabelText(c.vin), { target: { value: "1HGCM82633A004352" } });
 framework.fail = true; fireEvent.click(screen.getByRole("button", { name: c.archive }));
 await screen.findByRole("alert");
 expect((screen.getByRole("button", { name: c.refresh }) as HTMLButtonElement).disabled).toBe(false);
 expect((screen.getByLabelText(c.vin) as HTMLInputElement).value).toBe("1HGCM82633A004352"); expect(changes).toBe(0); expect(accepted).toEqual([]);
 framework.fail = false; fireEvent.click(screen.getByRole("button", { name: c.archive }));
 await waitFor(() => expect(changes).toBe(1)); expect(screen.queryByRole("alert")).toBeNull();
 expect(accepted[0]).toMatchObject({ kind: "archive", artifactId: id });
});
it.each(["order", "reports"])("offers refresh after a rejected initial %s read", async kind => {
 framework.fail = true;
 if (kind === "order") render(<HistoryWorkspace conversation={conversation} locale="en" denied={() => {}}/>);
 else render(<HistoryReportsWorkspace id={id} order={order} assignmentVersion={1} locale="en" denied={() => {}} changed={() => {}}/>);
 await screen.findByRole("alert"); framework.fail = false;
 fireEvent.click(screen.getByRole("button", { name: kind === "order" ? historyCopy("en").refresh : reportCopy("en").refresh }));
 await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
});
