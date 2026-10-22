import type { DiagnosticSchemas as D } from "@auto-tm/contracts";
import { describe, expect, it } from "vitest";
import { privateContinuityAttestation, type AttestationIdentity } from "./PrivateContinuityAttestation";

const now = new Date("2026-10-21T12:00:00.000Z");
const until = "2026-12-01T00:00:00.000Z";
const rights: D.DiagnosticIdentityRights = { category: "vehicle_observation", purpose: "Synthetic comparison", basis: "Owned fixture",
  provenance: "Synthetic retained physical material", identifiability: "pseudonymous", use: ["service"],
  schedule: { kind: "until", until, reason: "Fixture authorization" }, supplierRestrictions: "No export", hold: null };
function record(id: string, orderId: string, orderVersion: number, value: string, parent: string | null = null): D.DiagnosticIdentityEvidence {
  return { id, orderId, orderVersion, identityRecordId: `${orderId}-raw`, observationHash: "a".repeat(64),
    observation: { method: "manual", vin: null, manualReference: "Physical visit", observedAt: now.toISOString(), mileageKm: 100 },
    identifiers: [{ kind: "chassis_stamp", location: "Physical stamp", value, provenanceIds: [`${id}-support`] }],
    provenance: [{ id: `${id}-support`, sha256: "b".repeat(64), mime: "image/webp", sizeBytes: 72 }], rights,
    correction: parent ? { supersedesId: parent, explanation: "Supported recording error" } : null,
    recordHash: id.padEnd(64, "0"), recordedBy: "technician", recordedAt: now.toISOString() };
}
const ea = record("ea", "a", 7, "SYN-CHASSIS-04I");
const middle = record("em", "a", 8, "SYN-CHASSIS-04L", ea.id);
const ec = record("ec", "a", 9, "SYN-CHASSIS-041", middle.id);
const eb = record("eb", "b", 7, "SYN-CHASSIS-041");
function side(records = [ea, middle, ec], pin = records[0]!) {
  return { method: "manual" as const, vin: null, corrected: records.length > 1, evidenceRecordCount: records.length,
    identifiers: records.flatMap(item => item.identifiers), rightsUntil: records.map(item => item.rights.schedule.until),
    graph: { pin: { id: pin.id, recordHash: pin.recordHash, identityRecordId: pin.identityRecordId, observationHash: pin.observationHash }, records } };
}
const b = side([eb]);
const compare = (a: AttestationIdentity = side(), other: AttestationIdentity = b, provenanceRights = [until]) =>
  privateContinuityAttestation(a, other, provenanceRights, now);
const refused = (a: AttestationIdentity, other: AttestationIdentity = b) =>
  expect(() => compare(a, other)).toThrowError(expect.objectContaining({ code: "DIAGNOSTIC_NO_ACCESS" }));

describe("private supported manual recording correction", () => {
  it("accepts the explicit supported I/1 correction and preserves the original pin", () => {
    const original = side([ea, { ...ec, correction: { supersedesId: ea.id, explanation: "I/1 transcription supported by fresh material" } }]);
    const before = structuredClone(original);
    expect(compare(original).toISOString()).toBe("2026-12-01T00:00:00.000Z");
    expect(original).toEqual(before);
  });
  for (const records of [[ea, middle, ec], [ec, ea, middle], [middle, ec, ea], [ea, ec, middle], [ec, middle, ea], [middle, ea, ec]]) {
    for (const pin of [ea, middle, ec]) {
      it(`resolves ${records.map(item => item.id).join("/")} with immutable ${pin.id} pin by links`, () => {
        expect(compare(side(records, pin)).toISOString()).toBe("2026-12-01T00:00:00.000Z");
        expect(compare(b, side(records, pin)).toISOString()).toBe("2026-12-01T00:00:00.000Z");
      });
    }
  }
  it("retains the shortest original, middle, leaf and other visit evidence rights", () => {
    for (const id of [ea.id, middle.id, ec.id]) {
      const records = [ea, middle, ec].map(item => item.id === id ? { ...item, rights: { ...rights, schedule: { ...rights.schedule, until: "2026-10-22T00:00:00.000Z" } } } : item);
      expect(compare(side(records)).toISOString()).toBe("2026-10-22T00:00:00.000Z");
      const expired = records.map(item => item.id === id ? { ...item, rights: { ...rights, schedule: { ...rights.schedule, until: now.toISOString() } } } : item);
      refused(side(expired));
    }
    expect(compare(side(), { ...b, rightsUntil: ["2026-10-22T00:00:00.000Z"] }).toISOString()).toBe("2026-10-22T00:00:00.000Z");
    refused(side(), { ...b, rightsUntil: [now.toISOString()] });
  });
  it("retains all original and descendant provenance rights", () => {
    expect(compare(side(), b, [until, "2026-10-22T00:00:00.000Z", until]).toISOString()).toBe("2026-10-22T00:00:00.000Z");
    for (let index = 0; index < 3; index++) {
      const ends = [until, until, until]; ends[index] = now.toISOString();
      expect(() => compare(side(), b, ends)).toThrowError(expect.objectContaining({ code: "DIAGNOSTIC_NO_ACCESS" }));
    }
  });
  it("refuses incomplete, disconnected, branched, cyclic and duplicate graphs", () => {
    for (const records of [
      [ec], [ea, ec], [ea, middle], [ea, middle, ec, record("extra", "a", 10, "SYN-CHASSIS-041")],
      [ea, middle, ec, record("branch", "a", 10, "SYN-CHASSIS-041", ea.id)],
      [{ ...ea, correction: { supersedesId: ec.id, explanation: "Cycle" } }, middle, ec], [ea, middle, ec, ec],
    ]) refused(side(records, ec));
    refused({ ...side(), evidenceRecordCount: 4 });
    refused({ ...side(), graph: undefined });
  });
  it("refuses a changed pin, cross-order or nonmonotonic edges and inconsistent raw bindings", () => {
    const input = side();
    for (const pin of [{ ...input.graph.pin, id: "missing" }, { ...input.graph.pin, recordHash: "f".repeat(64) },
      { ...input.graph.pin, identityRecordId: "other-raw" }, { ...input.graph.pin, observationHash: "f".repeat(64) }]) refused({ ...input, graph: { ...input.graph, pin } });
    for (const changed of [{ ...ec, orderId: "b" }, { ...ec, orderVersion: 8 }, { ...ec, observationHash: "f".repeat(64) }]) refused(side([ea, middle, changed]));
  });
  it("requires a complete justified correction with fresh bound support, not a rationale match", () => {
    for (const changed of [
      { ...ec, correction: null }, { ...ec, correction: { supersedesId: middle.id, explanation: " " } },
      { ...ec, provenance: [] }, { ...ec, identifiers: [] },
      { ...ec, provenance: middle.provenance, identifiers: middle.identifiers },
      { ...ec, identifiers: [{ ...ec.identifiers[0]!, provenanceIds: ["missing"] }] },
    ]) refused(side([ea, middle, changed]));
  });
  it("refuses simultaneous conflicting current claims even when one chassis matches B", () => {
    const conflicting = { ...ec, identifiers: [...ec.identifiers, { ...ec.identifiers[0]!, location: "Second stamp", value: "SYN-CHASSIS-999" }] };
    refused(side([ea, middle, conflicting]));
    refused(side(), side([{ ...eb, identifiers: [...eb.identifiers, { ...eb.identifiers[0]!, location: "Second stamp", value: "SYN-CHASSIS-999" }] }]));
    refused(side([ea, middle, { ...ec, identifiers: [{ ...ec.identifiers[0]!, value: "SYN-CHASSIS-999" }] }]));
  });
  it("treats a correction as a complete replacement, without inheriting omitted old identifiers", () => {
    const old = { ...ea, identifiers: [...ea.identifiers, { ...ea.identifiers[0]!, kind: "manufacturer_plate" as const, value: "OLD-PLATE" }] };
    expect(compare(side([old, middle, ec])).toISOString()).toBe("2026-12-01T00:00:00.000Z");
    refused(side([old, middle, { ...ec, identifiers: [{ ...ec.identifiers[0]!, kind: "manufacturer_plate", value: "OLD-PLATE" }] }]));
  });
  it("does not admit VIN corrections, mixed corrections or automatic corrections through the manual graph", () => {
    const vin = { ...side(), method: "vin" as const, vin: "SYN-VIN-041" };
    refused(vin, vin); refused(vin, b);
    const rawVin = { ...ec, observation: { ...ec.observation, method: "vin" as const, vin: "SYN-VIN-041", manualReference: null } };
    refused(side([ea, middle, rawVin]));
    expect(() => privateContinuityAttestation(side(), b, [until], now, "automatic_normalized_vin"))
      .toThrowError(expect.objectContaining({ code: "DIAGNOSTIC_NO_ACCESS" }));
  });
});
