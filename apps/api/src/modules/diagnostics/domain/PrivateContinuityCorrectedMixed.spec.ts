import type { DiagnosticSchemas as D } from "@auto-tm/contracts";
import { describe, expect, it } from "vitest";
import { privateContinuityAttestation, type AttestationIdentity } from "./PrivateContinuityAttestation";

const now = new Date("2026-10-21T12:00:00.000Z");
const until = "2026-12-01T00:00:00.000Z";
const rights: D.DiagnosticIdentityRights = { category: "vehicle_observation", purpose: "Synthetic comparison", basis: "Owned fixture",
  provenance: "Independently retained physical observation", identifiability: "pseudonymous", use: ["service"],
  schedule: { kind: "until", until, reason: "Fixture authorization" }, supplierRestrictions: "No export", hold: null };

function record(id: string, orderId: string, orderVersion: number, method: "manual" | "vin", value: string, parent: string | null = null): D.DiagnosticIdentityEvidence {
  const provenanceIds = [`${id}-support`];
  return { id, orderId, orderVersion, identityRecordId: `${id}-raw`, observationHash: id.padEnd(64, "a"),
    observation: { method, vin: method === "vin" ? value : null, manualReference: method === "manual" ? "Physical observation" : null,
      observedAt: now.toISOString(), mileageKm: 100 },
    identifiers: method === "manual"
      ? [{ kind: "chassis_stamp", location: "Physical chassis", value, provenanceIds }]
      : [{ kind: "chassis_stamp", location: "Physical chassis", value: "SYN-CHASSIS-041", provenanceIds },
        { kind: "vin_stamp", location: "Physical VIN", value, provenanceIds }],
    provenance: [{ id: provenanceIds[0]!, sha256: "b".repeat(64), mime: "image/webp", sizeBytes: 72 }], rights,
    correction: parent ? { supersedesId: parent, explanation: "Recording error supported by fresh physical material" } : null,
    recordHash: id.padEnd(64, "0"), recordedBy: "technician", recordedAt: now.toISOString() };
}
function side(records: D.DiagnosticIdentityEvidence[], pin = records[0]!, current = records.at(-1)!.observation): AttestationIdentity {
  return { method: pin.observation.method, vin: pin.observation.vin, corrected: records.some(item => !!item.correction),
    evidenceRecordCount: records.length, identifiers: records.flatMap(item => item.identifiers), rightsUntil: records.map(item => item.rights.schedule.until),
    history: records.map(item => item.observation),
    graph: { pin: { id: pin.id, recordHash: pin.recordHash, identityRecordId: pin.identityRecordId, observationHash: pin.observationHash }, records,
      rawRecords: records.map(item => ({ id: item.identityRecordId, observationHash: item.observationHash, observation: item.observation })),
      currentObservation: current } };
}
const manualOld = record("manual-old", "manual", 7, "manual", "SYN-CHASSIS-04I");
const manualNew = record("manual-new", "manual", 9, "manual", "SYN-CHASSIS-041", manualOld.id);
const vinOld = record("vin-old", "vin", 7, "vin", "SYN-VIN-04I");
const vinNew = record("vin-new", "vin", 9, "vin", "SYN-VIN-041", vinOld.id);
const manual = record("manual-independent", "other-manual", 7, "manual", "SYN-CHASSIS-041");
const vin = record("vin-independent", "other-vin", 7, "vin", "SYN-VIN-041");

describe("private corrected mixed identity with independently retained physical support", () => {
  for (const [kind, records, other] of [
    ["manual physical identifier", [manualOld, manualNew], vin],
    ["VIN recording", [vinOld, vinNew], manual],
  ] as const) {
    for (const direction of ["corrected predecessor", "corrected candidate"] as const) {
      const compare = (left: AttestationIdentity = side([...records]), right: AttestationIdentity = side([other]), provenanceRights = [until]) =>
        direction === "corrected predecessor"
          ? privateContinuityAttestation(left, right, provenanceRights, now)
          : privateContinuityAttestation(right, left, provenanceRights, now);
      const refused = (left: AttestationIdentity, right = side([other])) =>
        expect(() => compare(left, right)).toThrowError(expect.objectContaining({ code: "DIAGNOSTIC_NO_ACCESS" }));

      it(`admits supported ${kind} correction as ${direction} without changing the original pin or observations`, () => {
        const left = side([...records]); const right = side([other]);
        const before = structuredClone({ left, right });
        expect(compare(left, right).toISOString()).toBe("2026-12-01T00:00:00.000Z");
        expect({ left, right }).toEqual(before);
        expect(compare(side([records[1], records[0]], records[0], records[1].observation), right).toISOString()).toBe("2026-12-01T00:00:00.000Z");
      });
      it(`retains every evidence and provenance right for ${kind} as ${direction}`, () => {
        for (const id of records.map(item => item.id)) {
          const shorter = records.map(item => item.id === id ? { ...item, rights: { ...rights, schedule: { ...rights.schedule, until: "2026-10-22T00:00:00.000Z" } } } : item);
          expect(compare(side(shorter)).toISOString()).toBe("2026-10-22T00:00:00.000Z");
          refused(side(records.map(item => item.id === id ? { ...item, rights: { ...rights, schedule: { ...rights.schedule, until: now.toISOString() } } } : item)));
        }
        expect(compare(side([...records]), side([other]), [until, "2026-10-22T00:00:00.000Z", until]).toISOString()).toBe("2026-10-22T00:00:00.000Z");
      });
      it(`refuses incomplete graphs and unsupported correction edges for ${kind} as ${direction}`, () => {
        for (const changed of [
          { ...records[1], correction: null },
          { ...records[1], correction: { supersedesId: records[0].id, explanation: " " } },
          { ...records[1], provenance: records[0].provenance, identifiers: records[1].identifiers.map(item => ({ ...item, provenanceIds: [records[0].provenance[0]!.id] })) },
          { ...records[1], identifiers: records[1].identifiers.map(item => ({ ...item, provenanceIds: ["unbound"] })) },
        ]) refused(side([records[0], changed]));
        refused(side([records[1]]));
        refused(side([...records, { ...other, orderId: records[0].orderId }]));
        refused({ ...side([...records]), evidenceRecordCount: 3 });
        refused({ ...side([...records]), graph: undefined });
      });
      it(`refuses hidden raw changes and current contradictions for ${kind} as ${direction}`, () => {
        const input = side([...records]); const graph = input.graph!;
        refused({ ...input, graph: { ...graph, pin: { ...graph.pin, recordHash: "changed" } } });
        refused({ ...input, graph: { ...graph, rawRecords: [...graph.rawRecords!, { id: "unexplained", observationHash: "f".repeat(64), observation: other.observation }] } });
        refused({ ...input, graph: { ...graph, currentObservation: { ...records[1].observation, vin: "SYN-VIN-999" } } });
        const conflicting = { ...records[1], identifiers: [...records[1].identifiers,
          { ...records[1].identifiers[0]!, value: "SYN-CHASSIS-999" }] };
        refused(side([records[0], conflicting]));
        refused(input, side([{ ...other, identifiers: [...other.identifiers, { kind: "vin_stamp", location: "Conflicting stamp", value: "SYN-VIN-999", provenanceIds: [other.provenance[0]!.id] }] }]));
      });
      it(`keeps ${kind} as ${direction} outside automatic matching`, () => {
        expect(() => privateContinuityAttestation(side([...records]), side([other]), [until], now, "automatic_normalized_vin"))
          .toThrowError(expect.objectContaining({ code: "DIAGNOSTIC_NO_ACCESS" }));
      });
    }
  }
});
