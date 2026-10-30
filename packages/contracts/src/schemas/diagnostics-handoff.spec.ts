import { describe, expect, it } from "vitest";

import { DiagnosticContinuityCommandSchema, DiagnosticContinuityHandoffsSchema } from "./diagnostics";
const proofId = "11111111-1111-4111-8111-111111111111";
const reportId = "22222222-2222-4222-8222-222222222222";
describe("B-owned continuity transport", () => {
  it("accepts only minimal current handles and existing B results", () => {
    expect(DiagnosticContinuityHandoffsSchema.parse({ handoffs: [{ proofId, status: "usable", expectedOrderVersion: 7 }], result: null, nextCursor: null, scope: "current_b_owned_handoffs" }).handoffs).toEqual([{ proofId, status: "usable", expectedOrderVersion: 7 }]);
    expect(DiagnosticContinuityHandoffsSchema.parse({ handoffs: [], result: { proofId, reportId }, nextCursor: null, scope: "current_b_owned_handoffs" }).result).toEqual({ proofId, reportId });
    for (const extra of [{ predecessorId: reportId }, { rationale: "Private rationale" }, { issuedBy: reportId }, { provenanceRecordIds: [reportId] }]) {
      expect(DiagnosticContinuityHandoffsSchema.safeParse({ handoffs: [{ proofId, status: "usable", expectedOrderVersion: 7, ...extra }], result: null, nextCursor: null, scope: "current_b_owned_handoffs" }).success).toBe(false);
    }
    for (const status of ["historical", "invalidated", "expired", "consumed"]) expect(DiagnosticContinuityHandoffsSchema.safeParse({ handoffs: [{ proofId, status, expectedOrderVersion: 7 }], result: null, nextCursor: null, scope: "current_b_owned_handoffs" }).success).toBe(false);
  });
  it("accepts B's command without caller-supplied A binding or request identity", () => {
    const command = { reportId, expectedOrderVersion: 7, reason: " New visit " };
    expect(DiagnosticContinuityCommandSchema.parse(command)).toEqual({ reportId, expectedOrderVersion: 7, reason: "New visit" });
    for (const extra of [{ predecessorId: proofId }, { rationale: "Private" }, { requestId: proofId }, { proofId }]) expect(DiagnosticContinuityCommandSchema.safeParse({ ...command, ...extra }).success).toBe(false);
  });
});
