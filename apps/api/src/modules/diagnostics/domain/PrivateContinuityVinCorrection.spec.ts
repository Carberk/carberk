import type { DiagnosticSchemas as D } from "@auto-tm/contracts";
import { describe, expect, it } from "vitest";
import { privateContinuityAttestation, type AttestationIdentity } from "./PrivateContinuityAttestation";

const now = new Date("2026-10-21T12:00:00.000Z");
const until = "2026-12-01T00:00:00.000Z";
const rights: D.DiagnosticIdentityRights = { category: "vehicle_observation", purpose: "Synthetic comparison", basis: "Owned fixture",
  provenance: "Synthetic retained physical material", identifiability: "pseudonymous", use: ["service"],
  schedule: { kind: "until", until, reason: "Fixture authorization" }, supplierRestrictions: "No export", hold: null };
function record(id: string, orderId: string, version: number, vin: string, parent: string | null = null): D.DiagnosticIdentityEvidence {
  return { id, orderId, orderVersion: version, identityRecordId: `${id}-raw`, observationHash: id.padEnd(64, "a"),
    observation: { method: "vin", vin, manualReference: null, observedAt: now.toISOString(), mileageKm: 100 },
    identifiers: [{ kind: "vin_stamp", location: "Physical VIN", value: vin, provenanceIds: [`${id}-support`] },
      { kind: "chassis_stamp", location: "Physical chassis", value: "SYN-CHASSIS-041", provenanceIds: [`${id}-support`] }],
    provenance: [{ id: `${id}-support`, sha256: "b".repeat(64), mime: "image/webp", sizeBytes: 72 }], rights,
    correction: parent ? { supersedesId: parent, explanation: "I/1 recording error supported by new material" } : null,
    recordHash: id.padEnd(64, "0"), recordedBy: "technician", recordedAt: now.toISOString() };
}
const ea = record("ea", "a", 7, "SYN-VIN-04I");
const em = record("em", "a", 9, "SYN-VIN-04L", ea.id);
const ec = record("ec", "a", 11, "SYN-VIN-041", em.id);
const eb = record("eb", "b", 7, "SYN-VIN-041");
function side(records = [ea, em, ec], pin = records[0]!, current = ec.observation) {
  return { method: "vin" as const, vin: pin.observation.vin, corrected: records.some(item => !!item.correction), evidenceRecordCount: records.length,
    identifiers: records.flatMap(item => item.identifiers), rightsUntil: records.map(item => item.rights.schedule.until),
    graph: { pin: { id: pin.id, recordHash: pin.recordHash, identityRecordId: pin.identityRecordId, observationHash: pin.observationHash }, records,
      rawRecords: records.map(item => ({ id: item.identityRecordId, observationHash: item.observationHash, observation: item.observation })), currentObservation: current } };
}
const b = side([eb], eb, eb.observation);
const compare = (a: AttestationIdentity = side(), other: AttestationIdentity = b, provenanceRights = [until]) =>
  privateContinuityAttestation(a, other, provenanceRights, now);
const refused = (a: AttestationIdentity, other: AttestationIdentity = b) =>
  expect(() => compare(a, other)).toThrowError(expect.objectContaining({ code: "DIAGNOSTIC_NO_ACCESS" }));

describe("private supported VIN recording correction", () => {
  it("admits C2 with immutable original 04I pin and explicit fresh supported raw 041 correction", () => {
    const original = side([ea, { ...ec, correction: { supersedesId: ea.id, explanation: "Supported I/1 correction" } }]);
    const before = structuredClone(original);
    expect(compare(original).toISOString()).toBe("2026-12-01T00:00:00.000Z");
    expect(original).toEqual(before);
    expect(original.vin).toBe("SYN-VIN-04I");
  });
  for (const records of [[ea, em, ec], [ec, ea, em], [em, ec, ea], [ea, ec, em], [ec, em, ea], [em, ea, ec]]) {
    for (const pin of [ea, em, ec]) {
      it(`resolves VIN graph ${records.map(item => item.id).join("/")} from ${pin.id} pin in either visit`, () => {
        expect(compare(side(records, pin)).toISOString()).toBe("2026-12-01T00:00:00.000Z");
        expect(compare(b, side(records, pin)).toISOString()).toBe("2026-12-01T00:00:00.000Z");
      });
    }
  }
  it("admits uncorrected VIN/VIN only with complete consistent retained graphs", () => {
    const unchanged = record("unchanged", "a", 7, "  syn-vin-041  ");
    expect(compare(side([unchanged], unchanged, unchanged.observation)).toISOString()).toBe("2026-12-01T00:00:00.000Z");
    refused({ ...b, graph: undefined });
  });
  it("retains original, intermediate, corrected, opposite visit and provenance rights", () => {
    for (const id of [ea.id, em.id, ec.id]) {
      const shortened = [ea, em, ec].map(item => item.id === id ? { ...item, rights: { ...rights, schedule: { ...rights.schedule, until: "2026-10-22T00:00:00.000Z" } } } : item);
      expect(compare(side(shortened)).toISOString()).toBe("2026-10-22T00:00:00.000Z");
      refused(side(shortened.map(item => item.id === id ? { ...item, rights: { ...rights, schedule: { ...rights.schedule, until: now.toISOString() } } } : item)));
    }
    refused(side(), { ...b, rightsUntil: [now.toISOString()] });
    for (let index = 0; index < 4; index++) {
      const ends = [until, until, until, until]; ends[index] = now.toISOString();
      expect(() => compare(side(), b, ends)).toThrowError(expect.objectContaining({ code: "DIAGNOSTIC_NO_ACCESS" }));
    }
  });
  it("refuses corrected VIN999 even when raw041, chassis041 and the opposite visit agree", () => {
    refused(side([ea, em, { ...ec, identifiers: ec.identifiers.map(item => item.kind === "vin_stamp" ? { ...item, value: "SYN-VIN-999" } : item) }]));
    refused(side([ea, em, { ...ec, identifiers: [...ec.identifiers, { ...ec.identifiers[0]!, value: "SYN-VIN-999" }] }]));
    refused(side([ea, em, { ...ec, observation: { ...ec.observation, vin: "SYN-VIN-999" } }]));
    refused(side([ea, em, { ...ec, identifiers: ec.identifiers.filter(item => item.kind !== "vin_stamp") }]));
  });
  it("refuses missing bindings, altered pins, method changes and unexplained current or historical raw identity", () => {
    const input = side();
    refused({ ...input, graph: { ...input.graph, pin: { ...input.graph.pin, observationHash: "changed" } } });
    for (const changed of [{ ...ec, identityRecordId: "" }, { ...ec, observationHash: "" },
      { ...ec, observation: { ...ec.observation, method: "manual" as const, vin: null, manualReference: "Manual" } }]) refused(side([ea, em, changed]));
    refused({ ...input, graph: { ...input.graph, rawRecords: [] } });
    refused({ ...input, graph: { ...input.graph, rawRecords: [...input.graph.rawRecords, { id: "unjustified", observationHash: "f".repeat(64), observation: { ...ec.observation, vin: "SYN-VIN-999" } }] } });
    refused({ ...input, graph: { ...input.graph, currentObservation: { ...ec.observation, vin: "SYN-VIN-999" } } });
    refused({ ...input, graph: { ...input.graph, rawRecords: input.graph.rawRecords.map(item => item.id === ec.identityRecordId ? { ...item, observationHash: "changed" } : item) } });
  });
  it("refuses missing components, branches, cycles, duplicate and nonmonotonic evidence", () => {
    for (const records of [[ec], [ea, ec], [ea, em], [ea, em, ec, record("extra", "a", 12, "SYN-VIN-041")],
      [ea, em, ec, record("branch", "a", 12, "SYN-VIN-041", ea.id)], [ea, em, ec, ec],
      [{ ...ea, correction: { supersedesId: ec.id, explanation: "Cycle" } }, em, ec],
      [ea, em, { ...ec, orderVersion: 8 }], [ea, em, { ...ec, orderId: "b" }]]) refused(side(records, ec));
    refused({ ...side(), evidenceRecordCount: 4 });
  });
  it("requires explanation and fresh bound correction support", () => {
    for (const changed of [{ ...ec, correction: null }, { ...ec, correction: { supersedesId: em.id, explanation: " " } },
      { ...ec, provenance: [] }, { ...ec, identifiers: [] },
      { ...ec, provenance: em.provenance, identifiers: ec.identifiers.map(item => ({ ...item, provenanceIds: [em.provenance[0]!.id] })) },
      { ...ec, identifiers: ec.identifiers.map(item => ({ ...item, provenanceIds: ["missing"] })) }]) refused(side([ea, em, changed]));
  });
  it("retains original and descendant rights when both visits have explicit corrections", () => {
    const oldB = record("old-b", "b", 5, "SYN-VIN-04I");
    const newB = { ...eb, correction: { supersedesId: oldB.id, explanation: "New independent physical support" } };
    expect(compare(side(), side([newB, oldB], oldB, eb.observation)).toISOString()).toBe("2026-12-01T00:00:00.000Z");
    for (const expired of [oldB.id, newB.id]) {
      const records = [oldB, newB].map(item => item.id === expired ? { ...item, rights: { ...rights, schedule: { ...rights.schedule, until: now.toISOString() } } } : item);
      refused(side(), side(records, records[0]!, eb.observation));
    }
  });
  it("keeps corrected data outside automatic and mixed comparative admission", () => {
    const correctedPin = { ...side([ea, em, ec], ec), history: [{ method: "vin" as const, vin: "SYN-VIN-041" }] };
    expect(() => privateContinuityAttestation(correctedPin, { ...b, history: correctedPin.history }, [until], now, "automatic_normalized_vin"))
      .toThrowError(expect.objectContaining({ code: "DIAGNOSTIC_NO_ACCESS" }));
    expect(() => privateContinuityAttestation(side(), b, [until], now, "automatic_normalized_vin"))
      .toThrowError(expect.objectContaining({ code: "DIAGNOSTIC_NO_ACCESS" }));
    refused(side(), { ...b, method: "manual", vin: null });
    refused({ ...b, method: "manual", vin: null }, side());
  });
});
