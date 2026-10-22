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

describe("corrected mixed complete raw bindings", () => {
  for (const [old, leaf, other] of [[manualOld, manualNew, vin], [vinOld, vinNew, manual]] as const) {
    for (const pin of [old, leaf]) {
      it(`resolves ${old.observation.method} ancestor or leaf ${pin.id} independently of ordering`, () => {
        for (const records of [[old, leaf], [leaf, old]]) {
          const input = side(records, pin, leaf.observation);
          expect(privateContinuityAttestation(input, side([other]), [until], now).toISOString()).toBe(until);
          expect(privateContinuityAttestation(side([other]), input, [until], now).toISOString()).toBe(until);
        }
      });
    }
  }
  it("accounts for several supported manual corrections bound to the same raw observation", () => {
    const leaf = { ...manualNew, identityRecordId: manualOld.identityRecordId, observationHash: manualOld.observationHash,
      observation: manualOld.observation };
    const input = side([leaf, manualOld], leaf, leaf.observation);
    input.graph!.rawRecords = [input.graph!.rawRecords![0]!];
    expect(privateContinuityAttestation(input, side([vin]), [until], now).toISOString()).toBe(until);
    const before = structuredClone(input);
    for (const changed of [
      { ...input.graph!.rawRecords[0]!, observation: { ...leaf.observation, manualReference: "Unbound reference" } },
      { ...input.graph!.rawRecords[0]!, observationHash: "changed" },
    ]) {
      expect(() => privateContinuityAttestation({ ...input, graph: { ...input.graph!, rawRecords: [changed] } }, side([vin]), [until], now))
        .toThrowError(expect.objectContaining({ code: "DIAGNOSTIC_NO_ACCESS" }));
    }
    expect(input).toEqual(before);
  });
  it("refuses unrepresented raw bindings even on the independent VIN side", () => {
    const independent = side([vin]);
    independent.graph!.rawRecords!.push({ id: "hidden", observationHash: "f".repeat(64), observation: vinOld.observation });
    expect(() => privateContinuityAttestation(side([manualOld, manualNew]), independent, [until], now))
      .toThrowError(expect.objectContaining({ code: "DIAGNOSTIC_NO_ACCESS" }));
  });
});
