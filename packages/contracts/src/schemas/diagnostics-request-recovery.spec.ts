import { describe, expect, it } from "vitest";

import { DiagnosticContinuityRequestPrepareSchema, DiagnosticContinuityRequestExecuteSchema, DiagnosticContinuityRequestSchema } from "./diagnostics";
const requestId = "11111111-1111-4111-8111-000000000001";
describe("strict commit-bound continuity request contracts", () => {
  it("prepares opaque identity only and cannot execute pending input by id", () => {
    expect(DiagnosticContinuityRequestPrepareSchema.parse({ kind: "consume" })).toEqual({ kind: "consume" });
    for (const extra of [{ reason: "private" }, { command: {} }, { proofId: requestId }, { actorId: requestId }, { hash: "a".repeat(64) }])
      expect(DiagnosticContinuityRequestPrepareSchema.safeParse({ kind: "consume", ...extra }).success).toBe(false);
    expect(DiagnosticContinuityRequestExecuteSchema.safeParse({ kind: "consume" }).success).toBe(false);
    const input = { kind: "consume", command: { proofId: requestId, reportId: requestId, expectedOrderVersion: 1, reason: "B observation" } };
    expect(DiagnosticContinuityRequestExecuteSchema.parse(input)).toEqual(input);
    expect(DiagnosticContinuityRequestExecuteSchema.safeParse({ ...input, command: { ...input.command, predecessorId: requestId } }).success).toBe(false);
  });
  it("recovery excludes protected content and never certifies an issuance as usable", () => {
    const pending = { requestId, kind: "consume", state: "pending_input" };
    const result = { requestId, kind: "consume", state: "completed", result: { proofId: requestId, reportId: requestId } };
    for (const value of [pending, result]) {
      expect(DiagnosticContinuityRequestSchema.parse(value)).toEqual(value);
      for (const extra of [{ reason: "private" }, { rationale: "private" }, { evidence: [] }, { predecessorId: requestId }, { issuerSessionId: requestId }, { hashes: [] }, { command: {} }])
        expect(DiagnosticContinuityRequestSchema.safeParse({ ...value, ...extra }).success).toBe(false);
    }
    expect(DiagnosticContinuityRequestSchema.safeParse({ requestId, kind: "issue", state: "completed", proofId: requestId, usability: "usable" }).success).toBe(false);
  });
});
