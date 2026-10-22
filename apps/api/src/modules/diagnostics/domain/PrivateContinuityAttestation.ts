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
    /** VIN comparison also accounts for all retained raw observations and current intake.
     * Record observations come from their bound immutable raw rows, not the report pin. */
    rawRecords?: { id: string; observationHash: string; observation: D.DiagnosticComparisonIdentity["observation"] }[];
    currentObservation?: D.DiagnosticComparisonIdentity["observation"] | undefined;
  } | undefined;
}
/** Private same-vehicle policy. Mixed comparison reconciles observed VIN with retained
 * VIN stamps; automatic comparison additionally requires unchanged raw identity. */
export function privateContinuityAttestation(a: AttestationIdentity, b: AttestationIdentity, provenanceRights: string[], now: Date, method: "comparative_attestation" | "automatic_normalized_vin" = "comparative_attestation"): Date {
  const denied = () => { throw new DiagnosticRuleError("DIAGNOSTIC_NO_ACCESS"); };
  const vinPair = a.method === "vin" && b.method === "vin";
  // Resolve complete explicit components for same-method comparative identity.
  // Mixed corrections remain outside this bounded admission.
  if (method === "comparative_attestation" && a.method !== b.method && (a.corrected || b.corrected)) denied();
  if (method === "comparative_attestation" && a.method === b.method &&
    (vinPair || a.corrected || b.corrected || a.graph || b.graph)) {
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
        if (record.orderId !== pinned.orderId || record.observation.method !== side.method || !record.identifiers.length ||
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
      if (vinPair) {
        const raw = graph.rawRecords;
        const current = graph.currentObservation;
        const normalized = (vin: string | null | undefined) => vin?.trim().toUpperCase();
        if (!raw?.length || !current || current.method !== "vin" || normalized(current.vin) !== normalized(leaf.observation.vin)) denied();
        for (const record of records) {
          const vin = normalized(record.observation.vin);
          if (!record.identityRecordId || !record.observationHash || !vin ||
            !raw?.some(item => item.id === record.identityRecordId && item.observationHash === record.observationHash &&
              item.observation.method === "vin" && normalized(item.observation.vin) === vin) ||
            !record.identifiers.some(item => item.kind === "vin_stamp") ||
            record.identifiers.some(item => item.kind === "vin_stamp" && normalized(item.value) !== vin)) denied();
        }
        // No unrepresented raw change may be excused by a correction rationale.
        if (raw?.some(item => !records.some(record => record.identityRecordId === item.id && record.observationHash === item.observationHash))) denied();
      }
      return { ...side, vin: leaf.observation.vin, identifiers: leaf.identifiers, rightsUntil: [...side.rightsUntil, ...records.map(record => record.rights.schedule.until)] };
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
    // Every effective VIN must agree with all simultaneous physical VIN claims.
    for (const side of [a, b].filter(item => item.method === "vin")) {
      const vin = side.vin?.trim().toUpperCase();
      if (!vin || !side.identifiers.some(item => item.kind === "vin_stamp") ||
        side.identifiers.some(item => item.kind === "vin_stamp" && item.value.trim().toUpperCase() !== vin)) denied();
    }
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
