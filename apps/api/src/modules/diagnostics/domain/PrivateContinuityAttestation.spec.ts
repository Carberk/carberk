import { describe, expect, it } from "vitest";
import { privateContinuityAttestation, type AttestationIdentity } from "./PrivateContinuityAttestation";
const now = new Date("2026-10-21T12:00:00.000Z");
const a: AttestationIdentity = { method: "manual", identifiers: [{ kind: "chassis_stamp", value: "SYN-CHASSIS-041" }], rightsUntil: ["2026-11-01T00:00:00.000Z"] };
const b: AttestationIdentity = { ...a, rightsUntil: ["2026-12-01T00:00:00.000Z"] };
const provenanceRights = ["2026-12-15T00:00:00.000Z", "2026-12-20T00:00:00.000Z"];
describe("private manual comparative attestation", () => {
  it("retains a proof only through the earliest evidence authorization, even when provenance lives longer", () => {
    expect(privateContinuityAttestation(a, b, provenanceRights, now).toISOString()).toBe("2026-11-01T00:00:00.000Z");
  });
  it("honors the earlier provenance authorization without adding a blanket proof TTL", () => {
    expect(privateContinuityAttestation(a, b, ["2026-10-22T00:00:00.000Z"], now).toISOString()).toBe("2026-10-22T00:00:00.000Z");
  });
  it.each([
    { ...b, method: "vin" as const },
    { ...b, identifiers: [] },
    { ...b, identifiers: [{ kind: "chassis_stamp", value: "SYN-CHASSIS-999" }] },
    { ...b, identifiers: [...b.identifiers, { kind: "chassis_stamp", value: "SYN-CHASSIS-999" }] },
    { ...b, rightsUntil: ["2026-10-21T12:00:00.000Z"] },
  ])("refuses unsupported, absent, contradictory or expired material", other => {
    expect(() => privateContinuityAttestation(a, other, provenanceRights, now)).toThrowError(expect.objectContaining({ code: "DIAGNOSTIC_NO_ACCESS" }));
  });
});


describe("private automatic normalized VIN comparison", () => {
  const vin: AttestationIdentity & { vin: string; history: { method: "manual" | "vin"; vin: string | null }[]; corrected: boolean } = { method: "vin" as const, vin: "  syn-vin-041  ",
    identifiers: [{ kind: "vin_stamp", value: "SYN-VIN-041" }],
    rightsUntil: ["2026-11-01T00:00:00.000Z"],
    history: [{ method: "vin" as const, vin: "syn-vin-041" }], corrected: false, evidenceRecordCount: 1 };
  const candidate = { ...vin, vin: "SYN-VIN-041" };
  const automatic = (left: AttestationIdentity = vin, right: AttestationIdentity = candidate, rights = provenanceRights) =>
    privateContinuityAttestation(left, right, rights, now, "automatic_normalized_vin");
  it("accepts independently retained consistent VIN evidence through the shortest authorized right", () => {
    expect(automatic().toISOString()).toBe("2026-11-01T00:00:00.000Z");
    expect(automatic(vin, candidate, ["2026-10-22T00:00:00.000Z"]).toISOString()).toBe("2026-10-22T00:00:00.000Z");
  });
  it("requires matching observed VIN and supporting VIN stamps on both visits", () => {
    for (const other of [
      { ...candidate, vin: "SYN-VIN-999" }, { ...candidate, vin: "" }, { ...candidate, vin: null },
      { ...candidate, method: "manual" as const },
      { ...candidate, identifiers: [] },
      { ...candidate, identifiers: [{ kind: "vin_stamp", value: "SYN-VIN-999" }] },
      { ...candidate, identifiers: [{ kind: "chassis_stamp", value: "SYN-VIN-041" }] },
    ]) expect(() => automatic(vin, other)).toThrowError(expect.objectContaining({ code: "DIAGNOSTIC_NO_ACCESS" }));
  });
  it("does not let equal VIN conceal contradictory chassis or manufacturer plates", () => {
    for (const kind of ["chassis_stamp", "manufacturer_plate"]) {
      expect(() => automatic({ ...vin, identifiers: [...vin.identifiers, { kind, value: "SYN-001" }] },
        { ...candidate, identifiers: [...candidate.identifiers, { kind, value: "SYN-002" }] })).toThrowError(expect.objectContaining({ code: "DIAGNOSTIC_NO_ACCESS" }));
    }
  });
  it("refuses changed raw vehicle identity and correction chains even after VIN is restored", () => {
    for (const other of [
      { ...candidate, corrected: true },
      { ...candidate, history: [{ method: "vin" as const, vin: "SYN-VIN-999" }, ...candidate.history] },
      { ...candidate, history: [{ method: "manual" as const, vin: null }, ...candidate.history] },
      { ...candidate, history: [] },
    ]) expect(() => automatic(vin, other)).toThrowError(expect.objectContaining({ code: "DIAGNOSTIC_NO_ACCESS" }));
  });
  it("refuses additional evidence roots rather than ignoring their material", () => {
    expect(() => automatic(vin, { ...candidate, evidenceRecordCount: 2 })).toThrowError(expect.objectContaining({ code: "DIAGNOSTIC_NO_ACCESS" }));
  });
  it("allows unchanged raw VIN recaptures with different visit dates and mileages", () => {
    const history = [
      { method: "vin" as const, vin: "syn-vin-041", observedAt: "2026-10-21T10:00:00.000Z", mileageKm: 123000 },
      { method: "vin" as const, vin: "SYN-VIN-041", observedAt: "2026-10-21T11:00:00.000Z", mileageKm: 123100 },
    ];
    expect(automatic(vin, { ...candidate, history }).toISOString()).toBe("2026-11-01T00:00:00.000Z");
  });
  it("refuses expired retained evidence and provenance", () => {
    expect(() => automatic({ ...vin, rightsUntil: [now.toISOString()] })).toThrowError(expect.objectContaining({ code: "DIAGNOSTIC_NO_ACCESS" }));
    expect(() => automatic(vin, candidate, [now.toISOString()])).toThrowError(expect.objectContaining({ code: "DIAGNOSTIC_NO_ACCESS" }));
  });
});


describe("private mixed-method comparative attestation", () => {
  const manual: AttestationIdentity = { ...a };
  const vin: AttestationIdentity = { method: "vin", vin: "  syn-vin-041  ",
    identifiers: [{ kind: "chassis_stamp", value: "SYN-CHASSIS-041" }, { kind: "vin_stamp", value: "SYN-VIN-041" }],
    rightsUntil: ["2026-12-01T00:00:00.000Z"] };
  for (const direction of ["manual to VIN", "VIN to manual"] as const) {
    const compare = (physicalVin: AttestationIdentity = vin, physicalManual: AttestationIdentity = manual, rights = provenanceRights) =>
      direction === "manual to VIN"
        ? privateContinuityAttestation(physicalManual, physicalVin, rights, now)
        : privateContinuityAttestation(physicalVin, physicalManual, rights, now);
    it(`accepts ${direction} with consistent observed VIN, retained VIN stamps and shared physical chassis`, () => {
      expect(compare().toISOString()).toBe("2026-11-01T00:00:00.000Z");
      expect(compare(vin, manual, ["2026-10-22T00:00:00.000Z"]).toISOString()).toBe("2026-10-22T00:00:00.000Z");
    });
    it(`refuses ${direction} when shared chassis conceals an uncorrected raw VIN and retained VIN-stamp conflict`, () => {
      expect(() => compare({ ...vin, identifiers: [
        { kind: "chassis_stamp", value: "SYN-CHASSIS-041" }, { kind: "vin_stamp", value: "SYN-VIN-999" },
      ] })).toThrowError(expect.objectContaining({ code: "DIAGNOSTIC_NO_ACCESS" }));
    });
    it(`refuses ${direction} with missing observed VIN or retained physical VIN support`, () => {
      for (const other of [
        { ...vin, vin: null }, { ...vin, vin: " " }, { ...vin, identifiers: [] },
        { ...vin, identifiers: [{ kind: "chassis_stamp", value: "SYN-CHASSIS-041" }] },
      ]) expect(() => compare(other)).toThrowError(expect.objectContaining({ code: "DIAGNOSTIC_NO_ACCESS" }));
    });
    it(`refuses ${direction} with absent, different or contradictory common physical identity`, () => {
      for (const identifiers of [[], [{ kind: "manufacturer_plate", value: "SYN-PLATE-041" }],
        [{ kind: "chassis_stamp", value: "SYN-CHASSIS-999" }],
        [{ kind: "chassis_stamp", value: "SYN-CHASSIS-041" }, { kind: "chassis_stamp", value: "SYN-CHASSIS-999" }],
      ]) expect(() => compare(vin, { ...manual, identifiers })).toThrowError(expect.objectContaining({ code: "DIAGNOSTIC_NO_ACCESS" }));
    });
    it(`refuses ${direction} once either visit's evidence or comparison provenance expires`, () => {
      expect(() => compare({ ...vin, rightsUntil: ["2026-10-21T12:00:00.000Z"] })).toThrowError(expect.objectContaining({ code: "DIAGNOSTIC_NO_ACCESS" }));
      expect(() => compare(vin, { ...manual, rightsUntil: ["2026-10-21T11:59:59.000Z"] })).toThrowError(expect.objectContaining({ code: "DIAGNOSTIC_NO_ACCESS" }));
      expect(() => compare(vin, manual, ["2026-10-21T12:00:00.000Z"])).toThrowError(expect.objectContaining({ code: "DIAGNOSTIC_NO_ACCESS" }));
    });
  }
  it("keeps VIN/VIN comparative eligibility outside this mixed-method policy", () => {
    expect(() => privateContinuityAttestation(vin, vin, provenanceRights, now)).toThrowError(expect.objectContaining({ code: "DIAGNOSTIC_NO_ACCESS" }));
  });
});
