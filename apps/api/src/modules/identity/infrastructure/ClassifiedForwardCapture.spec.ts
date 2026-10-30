import { randomUUID } from "node:crypto";
import { ConfigService } from "@nestjs/config";
import type { FastifyRequest } from "fastify";
import { describe, expect, it } from "vitest";
import { DiagnosticMemoryDatabase, diagnosticTestId as id, diagnosticTestNow as now } from "@auto-tm/db/testing";
import { CheckBusinessAuthority } from "../application/CheckBusinessAuthority";
import { CheckStaffAuthority } from "../application/CheckStaffAuthority";
import { PrismaBusinessAuthority } from "./PrismaBusinessAuthority";
import { PrismaStaffAuthority } from "./PrismaStaffAuthority";
import { PrismaPublisherBindings } from "./PrismaPublisherBindings";
import { DiagnosticIntakeController } from "../../diagnostics/presentation/DiagnosticIntakeController";
import { DiagnosticAuthority } from "../../diagnostics/infrastructure/DiagnosticAuthority";
import { DiagnosticPublicBindings } from "../../diagnostics/infrastructure/DiagnosticPublicBindings";
import { CampaignDiagnosticAdmission } from "../../diagnostics/infrastructure/campaignDiagnosticAdmission";
import { PrismaDiagnosticIntake, diagnosticObservationHash } from "../../diagnostics/infrastructure/PrismaDiagnosticIntake";

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
  const memory = new DiagnosticMemoryDatabase(), base = memory.client;
  const components: Record<string, unknown>[] = [];
  const db = new Proxy(base, { get(target, key) {
    if (key === "diagnosticOwnershipComponent") return { create: async ({ data }: { data: Record<string, unknown> }) => { components.push(structuredClone(data)); return data; } };
    if (key === "$transaction") return async (work: (tx: typeof base) => unknown) => work(db);
    if (key === "diagnosticIdentityRecord") return { ...base.diagnosticIdentityRecord,
      findMany: async (args: Parameters<typeof base.diagnosticIdentityRecord.findMany>[0]) =>
        (await base.diagnosticIdentityRecord.findMany(args)).map(raw => ({ ...raw, ownership: components.find(c => c["identityRecordId"] === raw.id) ?? null })),
    };
    return Reflect.get(target, key);
  } });
  const future = new Date("2026-12-01T00:00:00Z");
  memory.seed("user", { id: id(7), phoneVerifiedAt: now, deletionScheduledAt: null });
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
  return { db, memory, components, observe: (extra: object = {}) => controller.vehicle(req, id(4), { expectedVersion: 6, ...observed, ...extra }) };
}
describe("classified forward ownership capture through the real intake transport", () => {
  it("accepts a separate synthetic classification without adding it to observedVehicle or changing observation hash v1", async () => {
    const f = await fixture();
    const result = await f.observe({ ownershipClassification: { rights: syntheticOwnershipRights } });
    expect(result.observedVehicle).toEqual(observed);
    expect(f.components).toMatchObject([{ state: "available", sourceListingId: id(8), sellerId: id(7), commissionerId: id(7), businessId: null, membershipId: null, rights: syntheticOwnershipRights }]);
    const raw = await f.db.diagnosticIdentityRecord.findFirstOrThrow({ where: { orderId: id(4) } });
    expect(raw.observationHash).toBe(diagnosticObservationHash(id(4), 7, observed as Parameters<typeof diagnosticObservationHash>[2]));
  });
  it("keeps existing observations without a classification working", async () => {
    const f = await fixture();
    expect((await f.observe()).observedVehicle).toEqual(observed);
    expect(f.components).toEqual([{ identityRecordId: expect.any(String), orderId: id(4), orderVersion: 7, state: "unavailable" }]);
  });
  it("refuses an expired classification atomically before ordinary observation writes", async () => {
    const f = await fixture();
    const rights = { ...syntheticOwnershipRights, schedule: { ...syntheticOwnershipRights.schedule, until: now.toISOString() } };
    await expect(f.observe({ ownershipClassification: { rights } })).rejects.toBeDefined();
    expect(await f.db.diagnosticIdentityRecord.count()).toBe(0);
    expect((await f.db.inspectionOrder.findUniqueOrThrow({ where: { id: id(4) } })).version).toBe(6);
  });
  it.each([
    { ownershipClassification: null },
    { ownershipClassification: { rights: syntheticOwnershipRights, sellerId: id(80) } },
    { ownershipClassification: { rights: { ...syntheticOwnershipRights, extra: true } } },
  ])("strictly refuses malformed classification before writes: %j", async extra => {
    const f = await fixture();
    await expect(f.observe(extra)).rejects.toBeDefined();
    expect(await f.db.diagnosticIdentityRecord.count()).toBe(0);
    expect(f.components).toEqual([]);
  });
  it("cannot classify a later raw to repair an earlier missing anchor", async () => {
    const f = await fixture();
    await f.observe();
    await f.observe({ expectedVersion: 7, ownershipClassification: { rights: syntheticOwnershipRights } });
    expect(f.components.map(c => c["state"])).toEqual(["unavailable", "unavailable"]);
  });
  it.each(["active", "suspended", "missing"])("records Business source membership as %s without adding publisher admission to observation", async status => {
    const f = await fixture();
    await f.db.listing.update({ where: { id: id(8) }, data: { businessId: id(50) } });
    if (status !== "missing") f.memory.seed("dealershipMember", { id: id(51), userId: id(7), dealershipId: id(50), status, role: "sales" });
    await f.observe({ ownershipClassification: { rights: syntheticOwnershipRights } });
    expect(f.components[0]).toMatchObject(status === "active" ? { state: "available", businessId: id(50), membershipId: id(51) } : { state: "unavailable" });
    if (status !== "active") expect(f.components[0]).not.toHaveProperty("sellerId");
  });

});
