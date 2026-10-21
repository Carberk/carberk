import { DiagnosticRuleError } from "./InspectionOrder";
export interface AttestationIdentity {
  method: "manual" | "vin";
  identifiers: { kind: string; value: string }[];
  rightsUntil: string[];
}
/** First checkpoint: retained manual evidence only. No corrected mismatch policy. */
export function privateContinuityAttestation(a: AttestationIdentity, b: AttestationIdentity, provenanceRights: string[], now: Date): Date {
  const denied = () => { throw new DiagnosticRuleError("DIAGNOSTIC_NO_ACCESS"); };
  if (a.method !== "manual" || b.method !== "manual" || !a.identifiers.length || !b.identifiers.length) denied();
  const values = new Map<string, string>();
  for (const item of [...a.identifiers, ...b.identifiers]) {
    const value = item.value.trim().toUpperCase();
    if (!value || (values.has(item.kind) && values.get(item.kind) !== value)) denied();
    values.set(item.kind, value);
  }
  if (!a.identifiers.some(left => b.identifiers.some(right => left.kind === right.kind && left.value.trim().toUpperCase() === right.value.trim().toUpperCase()))) denied();
  const ends = [...a.rightsUntil, ...b.rightsUntil, ...provenanceRights].map(value => new Date(value));
  if (!ends.length || ends.some(value => Number.isNaN(value.valueOf()) || value <= now)) denied();
  return new Date(Math.min(...ends.map(value => value.valueOf())));
}
