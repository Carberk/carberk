import { describe, expect, it } from "vitest";
import { harness, rights } from "../application/testing/ownershipGrantHarness";
const now = new Date("2026-10-23T12:00:00.000Z");
describe("grant collection and first observation through the intake boundary", () => {
  it("collects actual seller Session authority, server source and supplied end; capture uses that persisted grant", async () => {
    const h = harness();
    expect(await h.intake.grantOwnership(h.subject(), "order", { rights })).toEqual({ id: "grant" });
    expect(h.grants[0]).toMatchObject({ grantorId: "seller", sessionId: "seller-session", sellerId: "seller", commissionerId: "seller", rightsUntil: new Date(rights.schedule.until), rights });
    await h.append("grant");
    expect(h.components[0]).toMatchObject({ state: "available", grantId: "grant", sellerId: "seller", rights });
  });
  it("rejects other actors, invalid Sessions, expired ends and grants after a raw without retaining a grant", async () => {
    for (const kind of ["actor", "session", "expired", "late"]) {
      const h = harness(); if (kind === "late") h.raws.push({ id: "old", orderId: "order", orderVersion: 1 });
      await expect(h.intake.grantOwnership(kind === "actor" ? h.subject("technician") : { ...h.subject(), ...(kind === "session" ? { sessionId: "forged" } : {}) }, "order",
        { rights: kind === "expired" ? { ...rights, schedule: { ...rights.schedule, until: now.toISOString() } } : rights })).rejects.toThrow();
      expect(h.grants).toEqual([]);
    }
  });
  it("does not manufacture ownership from an absent grant and cannot repair an unavailable first anchor", async () => {
    const h = harness(); await h.intake.grantOwnership(h.subject(), "order", { rights });
    await h.append(); expect(h.components[0]).toMatchObject({ state: "unavailable" });
    h.raws.push({ id: "first", orderId: "order", orderVersion: 1 });
    await h.append("grant"); expect(h.components[1]).toMatchObject({ state: "unavailable" });
  });
  it("keeps technician classification subordinate to the actual seller grant and its supplier restrictions", async () => {
    const h = harness();
    await h.append(undefined, { rights });
    expect(h.components[0]).toMatchObject({ state: "unavailable" });
    const granted = harness(); await granted.intake.grantOwnership(granted.subject(), "order", { rights });
    await expect(granted.append("grant", { rights: { ...rights, supplierRestrictions: "Unrestricted" } })).rejects.toThrow("DIAGNOSTIC_NO_ACCESS");
    await expect(granted.append("grant", { rights: { ...rights, schedule: { ...rights.schedule, until: "2027-01-01T00:00:00.000Z" } } })).rejects.toThrow("DIAGNOSTIC_NO_ACCESS");
    expect(granted.components).toEqual([]);
    await granted.append("grant", { rights: { ...rights, schedule: { ...rights.schedule, until: "2026-11-01T00:00:00.000Z" } } });
    expect(granted.components[0]).toMatchObject({ grantId: "grant", state: "available", rightsUntil: new Date("2026-11-01T00:00:00.000Z") });
  });
  it("rejects changed, expired, erased and wrong-order persisted grants before copying ownership", async () => {
    for (const kind of ["source", "expired", "erased", "order", "grantor"]) {
      const h = harness(); await h.intake.grantOwnership(h.subject(), "order", { rights });
      if (kind === "source") h.listing.sellerId = "other";
      if (kind === "expired") h.grants[0]!.rightsUntil = now;
      if (kind === "erased") h.grants[0]!.state = "erased";
      if (kind === "order") h.grants[0]!.orderId = "other";
      if (kind === "grantor") h.users[0]!.suspendedAt = now;
      await expect(h.append("grant")).rejects.toThrow("DIAGNOSTIC_NO_ACCESS"); expect(h.components).toEqual([]);
    }
  });
});

const deadline = new Date("2026-11-23T12:00:00.000Z");
describe("execution deadlines after source preparation through production intake", () => {
  it.each([-1, 0, 1])("checks seller rights at execution offset %s without restamping the planned grant", async offset => {
    const h = harness(); h.executeAt(new Date(deadline.getTime() + offset));
    const result = h.intake.grantOwnership(h.subject(), h.row.id, { rights });
    if (offset < 0) {
      await expect(result).resolves.toEqual({ id: "grant" });
      expect(h.grants[0]).toMatchObject({ declaredAt: now, rightsUntil: deadline, rights });
    } else {
      await expect(result).rejects.toThrow("DIAGNOSTIC_NO_ACCESS");
      expect(h.grants).toEqual([]);
    }
    expect(h.protocol.command()?.rows[0]?.next).toMatchObject({ declaredAt: now.toISOString(), rightsUntil: deadline.toISOString(), rights });
  });
  it.each([-1, 0, 1])("checks classification at execution offset %s with atomic refusal and immutable planned stamps", async offset => {
    const h = harness();
    h.row.audience = "buyer_private"; h.row.listingId = "00000000-0000-4000-8000-000000000004";
    h.executeAt(new Date(deadline.getTime() + offset));
    const result = h.intake.observeVehicle(h.subject("technician"), h.row.id, { expectedVersion: 0,
      method: "vin", vin: "WVWZZZ1JZXW000001", manualReference: null, mileageKm: 120000,
      observedAt: "2026-10-23T11:59:00.000Z", ownershipClassification: { rights } });
    if (offset < 0) {
      await expect(result).resolves.toMatchObject({ version: 1 });
      expect(h.raws[0]).toMatchObject({ recordedAt: now });
      expect(h.row.updatedAt).toEqual(now);
    } else {
      await expect(result).rejects.toThrow("DIAGNOSTIC_INVALID_INPUT");
      expect(h.row.version).toBe(0); expect(h.raws).toEqual([]);
      expect(h.components).toEqual([]); expect(h.audits).toEqual([]);
    }
    expect(h.protocol.command()?.rows.find(row => row.table === "diagnostic_identity_records")?.next).toMatchObject({ recordedAt: now.toISOString() });
    expect(h.protocol.command()?.rows.find(row => row.table === "inspection_orders")?.next).toMatchObject({ updatedAt: now.toISOString() });
  });
});
