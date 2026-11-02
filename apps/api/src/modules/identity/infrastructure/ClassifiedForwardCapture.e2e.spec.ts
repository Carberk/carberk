import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { diagnosticObservationHash } from "../../diagnostics/infrastructure/PrismaDiagnosticIntake";
import {
  openPreparedReaderFixture,
  preparedNow,
  preparedObservation,
  preparedRights,
  type PreparedReaderFixture,
} from "../../../../test/helpers/diagnosticPreparedReaderFixture";

const malformedSellerId = "00000000-0000-4000-8000-000000000000";

describe("classified forward ownership capture through production HTTP and prepared PostgreSQL", { concurrent: false }, () => {
  let f: PreparedReaderFixture;

  beforeAll(async () => {
    f = await openPreparedReaderFixture("classified-forward-capture");
  });

  afterAll(async () => {
    try {
      await f?.cleanup();
    } finally {
      await f?.close();
    }
  });

  it("accepts a separate synthetic classification without adding it to observedVehicle or changing observation hash v1", async () => {
    const order = await f.visit({ name: "classified", audience: "listing_public" });
    const grantId = await f.grant(order);
    const result = await f.observe(order, { ownershipGrantId: grantId, ownershipClassification: { rights: preparedRights } }).expect(201);
    expect(result.body.observedVehicle).toEqual(preparedObservation);
    const component = await f.ownershipComponent(order);
    const raw = await f.raw(order);
    expect(component).toMatchObject({ state: "available", sourceListingId: null, sellerId: f.id("commissioner"), commissionerId: f.id("commissioner"), businessId: null, membershipId: null, rights: preparedRights });
    expect(raw["observationHash"]).toBe(diagnosticObservationHash(order.id, result.body.version, preparedObservation));
    expect(JSON.stringify(result.body)).not.toContain("ownershipClassification");
  });

  it("keeps existing observations without a classification working", async () => {
    const order = await f.visit({ name: "unclassified", audience: "listing_public" });
    const response = await f.observe(order).expect(201);
    expect(response.body.observedVehicle).toEqual(preparedObservation);
    expect(await f.ownershipComponent(order)).toMatchObject({ state: "unavailable", sellerId: null, rights: null });
  });

  it("refuses an expired classification atomically before ordinary observation writes", async () => {
    const order = await f.visit({ name: "expired", audience: "listing_public" });
    const grantId = await f.grant(order);
    const before = await f.db.inspectionOrder.findUniqueOrThrow({ where: { id: order.id } });
    await f.observe(order, {
      ownershipGrantId: grantId,
      ownershipClassification: { rights: { ...preparedRights, schedule: { ...preparedRights.schedule, until: preparedNow.toISOString() } } },
    }).expect(400);
    expect(await f.db.inspectionOrder.findUniqueOrThrow({ where: { id: order.id } })).toEqual(before);
    expect(await f.db.diagnosticIdentityRecord.count({ where: { orderId: order.id } })).toBe(0);
  });

  it.each([
    { ownershipClassification: null },
    { ownershipClassification: { rights: preparedRights, sellerId: malformedSellerId } },
    { ownershipClassification: { rights: { ...preparedRights, extra: true } } },
  ])("strictly refuses malformed classification before writes: %j", async extra => {
    const order = await f.visit({ name: "malformed", audience: "listing_public" });
    const before = await f.db.inspectionOrder.findUniqueOrThrow({ where: { id: order.id } });
    await f.observe(order, extra).expect(400);
    expect(await f.db.inspectionOrder.findUniqueOrThrow({ where: { id: order.id } })).toEqual(before);
    expect(await f.db.diagnosticIdentityRecord.count({ where: { orderId: order.id } })).toBe(0);
  });

  it("cannot classify a later raw to repair an earlier missing anchor", async () => {
    const order = await f.visit({ name: "no-backfill", audience: "listing_public" });
    const grantId = await f.grant(order);
    const first = await f.observe(order).expect(201);
    await f.observe(first.body, { ownershipGrantId: grantId, ownershipClassification: { rights: preparedRights } }).expect(201);
    const components = await f.db.diagnosticOwnershipComponent.findMany({ where: { orderId: order.id }, orderBy: { orderVersion: "asc" } });
    expect(components.map(row => row.state)).toEqual(["unavailable", "unavailable"]);
  });

  it.each(["active", "suspended", "missing"] as const)("records Business source membership as %s without adding publisher admission to observation", async status => {
    const order = await f.visit({ name: `business-${status}`, audience: "listing_public", business: true });
    const grantId = await f.grant(order, "seller");
    const membership = await f.db.dealershipMember.findFirstOrThrow({ where: { userId: f.id("seller") } });
    if (status === "suspended") await f.db.dealershipMember.update({ where: { id: membership.id }, data: { status: "suspended" } });
    if (status === "missing") await f.db.dealershipMember.delete({ where: { id: membership.id } });
    const response = await f.observe(order, { ownershipGrantId: grantId, ownershipClassification: { rights: preparedRights } }).expect(201);
    const component = await f.ownershipComponent(order);
    if (status === "active") expect(component).toMatchObject({ state: "available", businessId: order.businessId, membershipId: membership.id });
    else expect(component).toMatchObject({ state: "unavailable" });
    expect(response.body.observedVehicle).toEqual(preparedObservation);
    if (status !== "active") expect(component).not.toHaveProperty("sellerId");
  });
});
