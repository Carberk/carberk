import { describe, expect, it } from "vitest";
import { continuityPair } from "./ContinuityPair";

// These are domain inputs, never database or HTTP admission fixtures. Persistence
// must authenticate their contents and supply the complete raw history.
const owner = {
  listingId: "listing", listingIdentityDigest: "a".repeat(64), sellerId: "seller", commissionerId: "seller",
  businessId: null as string | null, membershipId: null as string | null,
};
function visit(orderId: string) {
  return {
    audience: "listing_public", commissionerId: "seller", physicalAuthorized: true,
    ownership: {
      orderId, originalRecordId: `${orderId}-first`, selectedRecordId: `${orderId}-first`, currentRecordId: `${orderId}-first`,
      transition: "unchanged",
      records: [{ id: `${orderId}-first`, orderId, orderVersion: 4, fact: { state: "available", ...owner } }],
    },
  };
}
const method = "automatic_normalized_vin";
const admits = (a = visit("A"), b = visit("B")) => expect(() => continuityPair(a, b, method)).not.toThrow();
const refuses = (a = visit("A"), b = visit("B")) => expect(() => continuityPair(a, b, method)).toThrow("DIAGNOSTIC_NO_ACCESS");

describe("public automatic ownership admission", () => {
  it("admits unchanged original personal ownership on independent visits", () => admits());
  it("admits the same Business publisher membership without comparing visit versions", () => {
    const a = visit("A"); const b = visit("B");
    for (const side of [a, b]) Object.assign(side.ownership.records[0].fact, { businessId: "business", membershipId: "member" });
    b.ownership.records[0].orderVersion = 19;
    admits(a, b);
  });
  it("permits benign repeat observations and a later original report pin without replacing the first anchor", () => {
    const a = visit("A"); const b = visit("B");
    for (const side of [a, b]) {
      side.ownership.records.push({ ...side.ownership.records[0], id: `${side.ownership.orderId}-second`, orderVersion: 9 });
      side.ownership.currentRecordId = `${side.ownership.orderId}-second`;
    }
    a.ownership.selectedRecordId = "A-second";
    // Input order does not establish the original observation.
    a.ownership.records.reverse();
    admits(a, b);
  });
  it.each(["A", "B"])("refuses restored ownership after an irreversible transition on %s even with one raw record", side => {
    const a = visit("A"); const b = visit("B");
    (side === "A" ? a : b).ownership.transition = "changed";
    refuses(a, b);
  });
  it.each(["legacy_unavailable", "erased"])("refuses %s material anywhere in the raw history", state => {
    const a = visit("A"); const b = visit("B");
    a.ownership.records.push({ ...a.ownership.records[0], id: "A-second", orderVersion: 6, fact: { ...owner, state } });
    a.ownership.currentRecordId = "A-second";
    refuses(a, b);
  });
  it.each(["listingId", "listingIdentityDigest", "sellerId", "commissionerId", "businessId", "membershipId"])("refuses a different original %s", key => {
    const a = visit("A"); const b = visit("B");
    Object.assign(b.ownership.records[0].fact, { [key]: key === "listingIdentityDigest" ? "b".repeat(64) : "other" });
    refuses(a, b);
  });
  it("refuses an observed ownership change even when the effective value and selected pin match again", () => {
    const a = visit("A");
    a.ownership.records.push({ ...a.ownership.records[0], id: "A-middle", orderVersion: 6, fact: { ...owner, sellerId: "other" } },
      { ...a.ownership.records[0], id: "A-last", orderVersion: 8 });
    a.ownership.currentRecordId = "A-last";
    refuses(a);
  });
  it.each(["originalRecordId", "selectedRecordId", "currentRecordId"])("refuses a missing %s instead of guessing a pin", key => {
    const a = visit("A"); Object.assign(a.ownership, { [key]: "missing" }); refuses(a);
  });
  it("refuses resetting the original anchor to a later available record", () => {
    const a = visit("A");
    a.ownership.records.push({ ...a.ownership.records[0], id: "A-second", orderVersion: 9 });
    a.ownership.originalRecordId = "A-second"; a.ownership.currentRecordId = "A-second";
    refuses(a);
  });
  it("refuses using an older raw record as the current candidate", () => {
    const b = visit("B");
    b.ownership.records.push({ ...b.ownership.records[0], id: "B-second", orderVersion: 9 });
    refuses(visit("A"), b);
  });
  it("refuses a raw record belonging to another visit", () => {
    const b = visit("B"); b.ownership.records[0].orderId = "A"; refuses(visit("A"), b);
  });
  it("refuses comparing one visit with itself", () => refuses(visit("A"), visit("A")));
  it("refuses a commissioner tuple inconsistent with its visit", () => {
    const b = visit("B"); b.commissionerId = "other"; refuses(visit("A"), b);
  });
  it.each([
    { businessId: "business", membershipId: null }, { businessId: null, membershipId: "member" },
    { businessId: "", membershipId: "member" }, { listingIdentityDigest: "" }, { sellerId: "" },
  ])("refuses an incomplete persisted ownership tuple %j", missing => {
    const a = visit("A"); const b = visit("B");
    for (const side of [a, b]) Object.assign(side.ownership.records[0].fact, missing);
    refuses(a, b);
  });
  it.each(["unavailable", "", null])("refuses an uninitialized transition state %j", transition => {
    const a = visit("A"); Object.assign(a.ownership, { transition }); refuses(a);
  });
  it("refuses duplicated raw identities and versions", () => {
    const a = visit("A"); a.ownership.records.push({ ...a.ownership.records[0] }); refuses(a);
    a.ownership.records[1].id = "different"; refuses(a);
  });
  it("requires ownership material on both visits", () => {
    const a = visit("A"); const b = visit("B");
    for (const side of [a, b]) {
      const { ownership: _ownership, ...without } = side;
      expect(() => continuityPair(side === a ? without : a, side === b ? without : b, method)).toThrow("DIAGNOSTIC_NO_ACCESS");
    }
  });
  it("does not impose public history requirements on private automatic admission", () => {
    const privateVisit = { audience: "buyer_private", commissionerId: "buyer", physicalAuthorized: true };
    expect(() => continuityPair(privateVisit, privateVisit, method)).not.toThrow();
  });
});
