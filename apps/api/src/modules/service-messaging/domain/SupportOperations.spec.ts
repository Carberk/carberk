import { expect, it } from "vitest";

import { staffedMilliseconds, transitionSupport, type SupportState } from "./SupportOperations";
const date = (value: string) => new Date(value);
const open: SupportState = { status: "open", closedAt: null, unansweredSince: null, awaitingCustomerSince: null, investigation: false, category: "ordinary", escalatedAt: null };
it("counts only daily Ashgabat 09:00–20:00 across overnight and day boundaries", () => {
 expect(staffedMilliseconds(date("2026-10-15T14:00:00Z"), date("2026-10-16T07:00:00Z"))).toBe(4 * 3600000);
 expect(staffedMilliseconds(date("2026-10-15T15:00:00Z"), date("2026-10-16T04:00:00Z"))).toBe(0);
 expect(staffedMilliseconds(date("2026-10-15T03:00:00Z"), date("2026-10-17T16:00:00Z"))).toBe(33 * 3600000);
});
it("preserves oldest unanswered time through extra customer messages, notes and operational notices", () => {
 const first = date("2026-10-15T12:00:00Z"), later = date("2026-10-15T13:00:00Z");
 const started = transitionSupport(open, { kind: "customer_message" }, first);
 for (const action of [{ kind: "customer_message" }, { kind: "private_note" }, { kind: "notice", reason: "Service problem" }] as const) expect(transitionSupport(started, action, later).unansweredSince).toEqual(first);
 expect(transitionSupport(started, { kind: "reply" }, later).unansweredSince).toBeNull();
});
it("refuses closing while staff owe response/investigation and allows manual awaiting-information closure only after14days with notice", () => {
 const now = date("2026-10-15T12:00:00Z");
 expect(() => transitionSupport({ ...open, unansweredSince: now }, { kind: "close_resolved" }, now)).toThrow();
 expect(() => transitionSupport({ ...open, investigation: true }, { kind: "close_resolved" }, now)).toThrow();
 const waiting = transitionSupport(open, { kind: "request_information" }, now);
 expect(() => transitionSupport(waiting, { kind: "close_awaiting", reason: "No answer" }, date("2026-10-29T11:59:59Z"))).toThrow();
 expect(transitionSupport(waiting, { kind: "close_awaiting", reason: "No answer" }, date("2026-10-29T12:00:00Z")).status).toBe("closed");
 expect(() => transitionSupport(waiting, { kind: "close_awaiting", reason: "" }, date("2026-10-30T12:00:00Z"))).toThrow();
});
it("reopens retained history without manufacturing a user-response debt and immediately escalates exposure", () => {
 const now = date("2026-10-15T12:00:00Z"), closed = { ...open, status: "closed" as const, closedAt: date("2026-10-01T12:00:00Z") };
 for (const action of [{ kind: "reply" }, { kind: "reopen" }, { kind: "notice", reason: "Account decision" }] as const) { const state = transitionSupport(closed, action, now); expect(state.status).toBe("open"); expect(state.closedAt).toBeNull(); expect(state.unansweredSince).toBeNull(); }
 expect(transitionSupport(closed, { kind: "customer_message" }, now).unansweredSince).toEqual(now);
 const incident = transitionSupport(open, { kind: "category", category: "exposure" }, now); expect(incident.escalatedAt).toEqual(now);
});
