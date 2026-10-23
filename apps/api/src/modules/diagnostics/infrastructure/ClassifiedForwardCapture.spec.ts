import { randomUUID } from "node:crypto";
import { ConfigService } from "@nestjs/config";
import type { FastifyRequest } from "fastify";
import { describe, expect, it } from "vitest";
import { DiagnosticMemoryDatabase, diagnosticTestId as id, diagnosticTestNow as now } from "@auto-tm/db/testing";
import { CheckBusinessAuthority } from "../../identity/application/CheckBusinessAuthority";
import { CheckStaffAuthority } from "../../identity/application/CheckStaffAuthority";
import { PrismaBusinessAuthority } from "../../identity/infrastructure/PrismaBusinessAuthority";
import { PrismaStaffAuthority } from "../../identity/infrastructure/PrismaStaffAuthority";
import { PrismaPublisherBindings } from "../../identity/infrastructure/PrismaPublisherBindings";
import { DiagnosticIntakeController } from "../presentation/DiagnosticIntakeController";
import { DiagnosticAuthority } from "./DiagnosticAuthority";
import { DiagnosticPublicBindings } from "./DiagnosticPublicBindings";
import { CampaignDiagnosticAdmission } from "./campaignDiagnosticAdmission";
import { PrismaDiagnosticIntake, diagnosticObservationHash } from "./PrismaDiagnosticIntake";

// Explicit synthetic source permission. This is software evidence, never a real-source basis.
export const syntheticOwnershipRights = {
  category: "vehicle_observation", purpose: "SYNTHETIC restricted ownership continuity comparison",
  basis: "SYNTHETIC fixture owner permits retaining seller, commissioner and Business membership linkage until the stated end",
  provenance: "SYNTHETIC source Listing 8 and its server-resolved seller/commissioner/member subjects at observation",
  identifiability: "personal", use: ["service"],
  schedule: { kind: "until", until: "2026-11-23T00:00:00.000Z", reason: "SYNTHETIC source authorization ends; erase component and derived proof payloads" },
  supplierRestrictions: "SYNTHETIC service-only; subject erasure ends authorization earlier", hold: null,
};
const observed = { observedAt: "2026-10-22T12:00:00.000Z", mileageKm: 123000, method: "vin", vin: "SYN-123", manualReference: null };
async function fixture() {
  const memory = new DiagnosticMemoryDatabase(), db = memory.client;
  const future = new Date("2026-12-01T00:00:00Z");
  memory.seed("user", { id: id(30), suspendedAt: null, deletionScheduledAt: null, dealershipMemberships: [] });
  memory.seed("session", { id: id(31), userId: id(30), expiresAt: future, adminTotpExpiresAt: future });
  memory.seed("staffGrant", { userId: id(30), capability: "diagnostics.technician", revokedAt: null });
  memory.seed("diagnosticCenterAssignment", { centerId: id(12), userId: id(30), capability: "diagnostics.technician", revokedAt: null, qualifiedUntil: future });
  memory.seed("diagnosticOrderAssignment", { orderId: id(4), userId: id(30), capability: "diagnostics.technician", revokedAt: null });
  memory.seed("inspectionOrder", { id: id(4), commissionerId: id(7), centerId: id(12), templateVersionId: id(5), erasedAt: null, synthetic: true, audience: "listing_public", listingId: id(8), status: "arrived", version: 6, physicalAuthorization: { authorityReference: "SYNTHETIC physical access", recordedBy: id(30), recordedAt: now.toISOString() }, publicationAuthorization: { authorityReference: "SYNTHETIC publication", recordedBy: id(30), recordedAt: now.toISOString() }, observedVehicle: null, createdAt: now });
  memory.seed("listing", { id: id(8), sellerId: id(7), businessId: null, vin: "SYN-123", brandId: id(9), modelId: id(10), year: 2020, deletedAt: null });
  const runtime = { now: () => now, id: randomUUID, syntheticAllowed: () => true };
  const business = new CheckBusinessAuthority(new PrismaBusinessAuthority(db), runtime);
  const staff = new CheckStaffAuthority(new PrismaStaffAuthority(db), runtime);
  const authority = new DiagnosticAuthority(staff, business, runtime, new CampaignDiagnosticAdmission(new ConfigService()));
  const intake = new PrismaDiagnosticIntake(db, authority, business, new DiagnosticPublicBindings(new PrismaPublisherBindings()), runtime);
  const controller = new DiagnosticIntakeController(intake);
  const req = { user: { sub: id(30), sid: id(31) } } as unknown as FastifyRequest;
  return { db, observe: (extra: object = {}) => controller.vehicle(req, id(4), { expectedVersion: 6, ...observed, ...extra }) };
}
describe("classified forward ownership capture through the real intake transport", () => {
  it("accepts a separate synthetic classification without adding it to observedVehicle or changing observation hash v1", async () => {
    const f = await fixture();
    const result = await f.observe({ ownershipClassification: { rights: syntheticOwnershipRights } });
    expect(result.observedVehicle).toEqual(observed);
    const raw = await f.db.diagnosticIdentityRecord.findFirstOrThrow({ where: { orderId: id(4) } });
    expect(raw.observationHash).toBe(diagnosticObservationHash(id(4), 7, observed as Parameters<typeof diagnosticObservationHash>[2]));
  });
  it("keeps existing observations without a classification working", async () => {
    const f = await fixture();
    expect((await f.observe()).observedVehicle).toEqual(observed);
  });
  it("refuses an expired classification atomically before ordinary observation writes", async () => {
    const f = await fixture();
    const rights = { ...syntheticOwnershipRights, schedule: { ...syntheticOwnershipRights.schedule, until: now.toISOString() } };
    await expect(f.observe({ ownershipClassification: { rights } })).rejects.toBeDefined();
    expect(await f.db.diagnosticIdentityRecord.count()).toBe(0);
    expect((await f.db.inspectionOrder.findUniqueOrThrow({ where: { id: id(4) } })).version).toBe(6);
  });
});
