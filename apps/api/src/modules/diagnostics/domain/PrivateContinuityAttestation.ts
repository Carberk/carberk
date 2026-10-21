import { DiagnosticRuleError } from "./InspectionOrder";
export interface AttestationIdentity {
  method: "manual" | "vin";
  identifiers: { kind: string; value: string }[];
  rightsUntil: string[];
}
/** First checkpoint: retained manual evidence only. No corrected mismatch policy. */
export function privateContinuityAttestation(_a: AttestationIdentity, _b: AttestationIdentity, _provenanceRights: string[], _now: Date): Date {
  throw new DiagnosticRuleError("DIAGNOSTIC_NO_ACCESS");
}
