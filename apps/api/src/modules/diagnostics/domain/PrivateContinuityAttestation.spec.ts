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
