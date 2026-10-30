import { describe, expect, it } from "vitest";

import { DiagnosticOwnershipGrantSchema, DiagnosticVehicleObservationRequestSchema } from "./diagnostics";
const rights = { category: "vehicle_observation", purpose: "Restricted comparison", basis: "Seller permission", provenance: "Seller authenticated declaration",
  identifiability: "personal", use: ["service"], schedule: { kind: "until", until: "2026-12-01T00:00:00.000Z", reason: "Seller-selected end" }, supplierRestrictions: "Service only", hold: null };
describe("ownership grant transport", () => {
  it("accepts the existing classified rights and refuses caller-selected subject or authority fields", () => {
    expect(DiagnosticOwnershipGrantSchema.parse({ rights })).toEqual({ rights });
    for (const extra of [{ sellerId: "forged" }, { sessionId: "forged" }, { businessId: "forged" }, { grantorId: "forged" }, { identityDigest: "forged" }])
      expect(DiagnosticOwnershipGrantSchema.safeParse({ rights, ...extra }).success).toBe(false);
    for (const r of [{ ...rights, hold: "forever" }, { ...rights, use: ["market_knowledge"] }, { ...rights, schedule: { kind: "indefinite" } }])
      expect(DiagnosticOwnershipGrantSchema.safeParse({ rights: r }).success).toBe(false);
  });
  it("keeps an optional opaque grant reference outside the vehicle observation", () => {
    const observed = { expectedVersion: 1, observedAt: "2026-10-23T00:00:00.000Z", mileageKm: 1, method: "vin", vin: "VIN", manualReference: null };
    expect(DiagnosticVehicleObservationRequestSchema.safeParse(observed).success).toBe(true);
    expect(DiagnosticVehicleObservationRequestSchema.safeParse({ ...observed, ownershipGrantId: "00000000-0000-4000-8000-000000000001" }).success).toBe(true);
    expect(DiagnosticVehicleObservationRequestSchema.safeParse({ ...observed, ownershipGrantId: "forged" }).success).toBe(false);
  });
});
