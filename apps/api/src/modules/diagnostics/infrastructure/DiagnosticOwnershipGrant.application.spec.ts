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
