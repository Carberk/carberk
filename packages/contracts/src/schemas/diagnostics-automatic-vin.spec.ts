import { describe, expect, it } from "vitest";

import { DiagnosticContinuityProofIssuanceSchema, DiagnosticContinuityProofSchema } from "./diagnostics";
const id = "00000000-0000-4000-8000-000000000001";
const issuance = { predecessorId: id, expectedPredecessorVersion: 3, expectedOrderVersion: 7,
  predecessorIdentityRecordId: id, candidateIdentityRecordId: id, linkingTechnicianId: id,
  method: "automatic_normalized_vin", rationale: "Consistent retained VIN evidence", provenanceRecordIds: [id] };
describe("automatic VIN proof contract", () => {
  it("admits the bounded automatic method with the same complete strict issuance shape", () => {
    expect(DiagnosticContinuityProofIssuanceSchema.safeParse(issuance).success).toBe(true);
    expect(DiagnosticContinuityProofIssuanceSchema.safeParse({ ...issuance, method: "comparative_attestation" }).success).toBe(true);
    for (const input of [{ ...issuance, rationale: undefined }, { ...issuance, provenanceRecordIds: [] },
      { ...issuance, provenanceRecordIds: [id, id] }, { ...issuance, bypass: true }, { ...issuance, method: "background" }]) {
      expect(DiagnosticContinuityProofIssuanceSchema.safeParse(input).success).toBe(false);
    }
  });
  it("reads the actual issuer, time and exact pair without relaxing output bindings", () => {
    const proof = { proofId: id, policyVersion: "ADR-0108", predecessor: { reportId: id, reportVersion: 3,
      snapshotHash: "a".repeat(64), identityRecordId: id, identityRecordHash: "b".repeat(64) },
      candidate: { orderId: id, orderVersion: 7, identityRecordId: id, identityRecordHash: "c".repeat(64) },
      linkingTechnicianId: id, method: issuance.method, result: "same_vehicle", rationale: issuance.rationale,
      provenanceRecordIds: [id], issuedBy: id, issuedAt: "2026-10-21T12:00:00.000Z" };
    expect(DiagnosticContinuityProofSchema.safeParse(proof).success).toBe(true);
    expect(DiagnosticContinuityProofSchema.safeParse({ ...proof, issuedBy: undefined }).success).toBe(false);
    expect(DiagnosticContinuityProofSchema.safeParse({ ...proof, candidate: { ...proof.candidate, extra: true } }).success).toBe(false);
  });
});
