import { describe, expect, it } from "vitest";
import { withPreparedReaderFixture } from "../../../../test/helpers/diagnosticPreparedReaderFixture";
import { diagnosticObservationHash } from "../../diagnostics/infrastructure/PrismaDiagnosticIntake";

// Preserve the original synthetic declaration verbatim; these are no real-source rights.
export const syntheticOwnershipRights = {
  category: "vehicle_observation", purpose: "SYNTHETIC restricted ownership continuity comparison",
  basis: "SYNTHETIC fixture owner permits retaining seller, commissioner and Business membership linkage until the stated end",
  provenance: "SYNTHETIC source Listing 8 and its server-resolved seller/commissioner/member subjects at observation",
  identifiability: "personal", use: ["service"],
  schedule: { kind: "until", until: "2026-11-23T00:00:00.000Z", reason: "SYNTHETIC source authorization ends; erase component and derived proof payloads" },
  supplierRestrictions: "SYNTHETIC service-only; subject erasure ends authorization earlier", hold: null,
};
const observed = { observedAt: "2026-10-22T12:00:00.000Z", mileageKm: 123000, method: "vin" as const, vin: "SYN-123", manualReference: null };

describe("issue938 recovery stage1", () => {
  it("accepts a separate synthetic classification without adding it to observedVehicle or changing observation hash v1", async () => {
    await withPreparedReaderFixture("capture", "classified-forward", async f => {
      const visit = await f.arrived("B", true);
      expect(visit.order.version).toBe(6);
      const result = await f.observe(visit, observed, syntheticOwnershipRights);
      expect(result.observedVehicle).toEqual(observed);
      const components = await f.db.diagnosticOwnershipComponent.findMany({ where: { orderId: visit.order.id } });
      expect(components).toMatchObject([{ state: "available", sourceListingId: f.id("listing-B"), sellerId: f.actors.commissionerB.userId,
        commissionerId: f.actors.commissionerB.userId, businessId: null, membershipId: null, rights: syntheticOwnershipRights }]);
      const raw = await f.db.diagnosticIdentityRecord.findFirstOrThrow({ where: { orderId: visit.order.id } });
      expect(raw.orderVersion).toBe(7);
      expect(raw.observationHash).toBe(diagnosticObservationHash(visit.order.id, 7, observed));
      expect(await f.db.diagnosticOwnershipGrant.count({ where: { orderId: visit.order.id, state: "available" } })).toBe(1);
    });
  });
});
