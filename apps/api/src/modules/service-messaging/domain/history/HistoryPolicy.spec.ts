import { expect, it } from "vitest";

import { normalizeVin, validateHistoryWindow, addStaffedHour, receiptOutcome, recoveryOutcome } from "./HistoryPolicy";
const d = (value: string) => new Date(value);
it("normalizes harmless VIN whitespace/case and keeps malformed/unsupported/no-data/mismatch/temporary outcomes distinct", () => {
 expect(normalizeVin(" 1hg cm82633a004352 ")).toBe("1HGCM82633A004352");
 for (const input of ["1HGCM82633AOO4352", "1HGCM82633AQ04352", "12345"]) expect(() => normalizeVin(input)).toThrow("MALFORMED_VIN");
});
it("admits today/next-day explicit windows without a19:00cutoff and enforces the morning promise", () => {
 expect(() => validateHistoryWindow(d("2026-10-15T14:15:00Z"), d("2026-10-15T14:15:00Z"), d("2026-10-15T14:55:00Z"), true)).not.toThrow();
 expect(() => validateHistoryWindow(d("2026-10-15T14:15:00Z"), d("2026-10-15T14:15:00Z"), d("2026-10-15T15:01:00Z"), true)).toThrow();
 expect(() => validateHistoryWindow(d("2026-10-15T14:15:00Z"), d("2026-10-16T04:00:00Z"), d("2026-10-16T05:00:00Z"), true)).not.toThrow();
 expect(() => validateHistoryWindow(d("2026-10-15T14:15:00Z"), d("2026-10-16T04:00:00Z"), d("2026-10-16T05:01:00Z"), true)).toThrow();
 expect(() => validateHistoryWindow(d("2026-10-15T14:15:00Z"), d("2026-10-17T04:00:00Z"), d("2026-10-17T05:00:00Z"), true)).toThrow();
 expect(() => validateHistoryWindow(d("2026-10-15T14:15:00Z"), d("2026-10-15T14:15:00Z"), d("2026-10-15T14:55:00Z"), false)).toThrow();
});
it("keeps evidence/partial/late/expired/after-hours receipts in reconciliation without silently recreating capacity", () => {
 const hold = { expiresAt: d("2026-10-15T14:00:00Z"), active: true };
 const verified = { receivedAt: d("2026-10-15T13:00:00Z"), verifiedAt: d("2026-10-15T13:30:00Z"), amount: 100, verifiedFunds: true };
 expect(receiptOutcome(hold, verified)).toBe("paid");
 for (const receipt of [{ ...verified, verifiedFunds: false }, { ...verified, amount: 50 }, { ...verified, receivedAt: hold.expiresAt }, { ...verified, verifiedAt: hold.expiresAt }, { ...verified, verifiedAt: d("2026-10-15T16:00:00Z") }]) expect(receiptOutcome(hold, receipt)).toBe("review");
 expect(receiptOutcome({ ...hold, active: false }, verified)).toBe("review");
});
it("permits exactly one explicit further staffed hour and routes refusal or a second miss to founder refund", () => {
 expect(addStaffedHour(d("2026-10-15T14:30:00Z"))).toEqual(d("2026-10-16T04:30:00Z"));
 expect(addStaffedHour(d("2026-10-15T16:00:00Z"))).toEqual(d("2026-10-16T05:00:00Z"));
 expect(recoveryOutcome({ recoveryUsed: false, customerAgreed: true, deadline: d("2026-10-16T04:30:00Z") }, d("2026-10-15T14:30:00Z"))).toBe("agreed");
 expect(recoveryOutcome({ recoveryUsed: false, customerAgreed: false, deadline: null }, d("2026-10-15T14:30:00Z"))).toBe("refund_pending");
 expect(recoveryOutcome({ recoveryUsed: true, customerAgreed: true, deadline: null }, d("2026-10-15T14:30:00Z"))).toBe("refund_pending");
});
