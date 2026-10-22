import { DiagnosticRuleError } from "./InspectionOrder";
export interface AttestationIdentity {
  method: "manual" | "vin";
  identifiers: { kind: string; value: string }[];
  rightsUntil: string[];
  vin?: string | null;
  history?: { method: "manual" | "vin"; vin: string | null }[];
  corrected?: boolean;
  evidenceRecordCount?: number;
}
/** Private same-vehicle policy. Mixed comparison reconciles observed VIN with retained
 * VIN stamps; automatic comparison additionally requires unchanged raw identity. */
export function privateContinuityAttestation(a: AttestationIdentity, b: AttestationIdentity, provenanceRights: string[], now: Date, method: "comparative_attestation" | "automatic_normalized_vin" = "comparative_attestation"): Date {
  const denied = () => { throw new DiagnosticRuleError("DIAGNOSTIC_NO_ACCESS"); };
  if (!a.identifiers.length || !b.identifiers.length) denied();
  if (method === "automatic_normalized_vin") {
    const vin = a.vin?.trim().toUpperCase();
    if (!vin || b.vin?.trim().toUpperCase() !== vin) denied();
    for (const side of [a, b]) {
      if (side.method !== "vin" || side.corrected !== false || side.evidenceRecordCount !== 1 || !side.history?.length ||
        side.history.some(item => item.method !== "vin" || item.vin?.trim().toUpperCase() !== vin) ||
        !side.identifiers.some(item => item.kind === "vin_stamp") ||
        side.identifiers.some(item => item.kind === "vin_stamp" && item.value.trim().toUpperCase() !== vin)) denied();
    }
  } else if (a.method !== "manual" || b.method !== "manual") {
    // This bounded comparative admission covers one manual and one VIN visit.
    // A common chassis cannot override contradictory raw VIN/stamp evidence.
    if (a.method === b.method) denied();
    const side = a.method === "vin" ? a : b;
    const vin = side.vin?.trim().toUpperCase();
    if (!vin || !side.identifiers.some(item => item.kind === "vin_stamp") ||
      side.identifiers.some(item => item.kind === "vin_stamp" && item.value.trim().toUpperCase() !== vin)) denied();
  }
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
