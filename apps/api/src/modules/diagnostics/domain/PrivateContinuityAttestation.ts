import type { DiagnosticSchemas as D } from "@auto-tm/contracts";
import { DiagnosticRuleError } from "./InspectionOrder";
export interface AttestationIdentity {
  method: "manual" | "vin";
  identifiers: { kind: string; value: string }[];
  rightsUntil: string[];
  vin?: string | null;
  history?: { method: "manual" | "vin"; vin: string | null }[];
  corrected?: boolean;
  evidenceRecordCount?: number;
  /** Retained, schema-validated records, with the immutable report/candidate pin.
   * The adapter counts all order evidence so a disconnected component cannot disappear. */
  graph?: {
    pin: Pick<D.DiagnosticIdentityEvidence, "id" | "recordHash" | "identityRecordId" | "observationHash">;
    records: D.DiagnosticIdentityEvidence[];
  } | undefined;
}
/** Private same-vehicle policy. Mixed comparison reconciles observed VIN with retained
 * VIN stamps; automatic comparison additionally requires unchanged raw identity. */
export function privateContinuityAttestation(a: AttestationIdentity, b: AttestationIdentity, provenanceRights: string[], now: Date, method: "comparative_attestation" | "automatic_normalized_vin" = "comparative_attestation"): Date {
  const denied = () => { throw new DiagnosticRuleError("DIAGNOSTIC_NO_ACCESS"); };
  // Only supported manual/manual comparative corrections gain graph interpretation.
  // Other methods keep their existing flattened-evidence admission rules.
  if (method === "comparative_attestation" && a.method === "manual" && b.method === "manual" &&
    (a.corrected || b.corrected || a.graph || b.graph)) {
    const current = (side: AttestationIdentity): AttestationIdentity => {
      const graph = side.graph;
      if (!graph || !graph.records.length) throw new DiagnosticRuleError("DIAGNOSTIC_NO_ACCESS");
      const { records, pin } = graph;
      const byId = new Map(records.map(record => [record.id, record]));
      const pinned = byId.get(pin.id);
      if (byId.size !== records.length || side.evidenceRecordCount !== records.length || !pinned ||
        pinned.recordHash !== pin.recordHash || pinned.identityRecordId !== pin.identityRecordId || pinned.observationHash !== pin.observationHash) throw new DiagnosticRuleError("DIAGNOSTIC_NO_ACCESS");
      const children = new Map<string, D.DiagnosticIdentityEvidence>();
      const rawHashes = new Map<string, string>();
      for (const record of records) {
        if (record.orderId !== pinned.orderId || record.observation.method !== "manual" || !record.identifiers.length ||
          !record.provenance.length || record.identifiers.some(item => !item.provenanceIds.length || item.provenanceIds.some(id => !record.provenance.some(ref => ref.id === id))) ||
          (rawHashes.has(record.identityRecordId) && rawHashes.get(record.identityRecordId) !== record.observationHash)) denied();
        rawHashes.set(record.identityRecordId, record.observationHash);
        if (!record.correction) continue;
        const parent = byId.get(record.correction.supersedesId);
        if (!parent || parent.orderVersion >= record.orderVersion || children.has(parent.id) || !record.correction.explanation.trim()) denied();
        children.set(record.correction.supersedesId, record);
      }
      const roots = records.filter(record => !record.correction);
      if (roots.length !== 1) denied();
      const visited = new Set<string>();
      const support = new Set<string>();
      let leaf: D.DiagnosticIdentityEvidence | undefined;
      for (let record: D.DiagnosticIdentityEvidence | undefined = roots[0]; record; record = children.get(record.id)) {
        if (visited.has(record.id)) denied();
        visited.add(record.id);
        // Capture already enforces fresh support. Retain that justification here,
        // rather than allowing explanation text or array position to select a claim.
        const ids = record.identifiers.flatMap(item => item.provenanceIds);
        if (record.correction && ids.every(id => support.has(id))) denied();
        for (const ref of record.provenance) support.add(ref.id);
        leaf = record;
      }
      if (visited.size !== records.length || !leaf) throw new DiagnosticRuleError("DIAGNOSTIC_NO_ACCESS");
      return { ...side, identifiers: leaf.identifiers, rightsUntil: [...side.rightsUntil, ...records.map(record => record.rights.schedule.until)] };
    };
    a = current(a); b = current(b);
  }
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
