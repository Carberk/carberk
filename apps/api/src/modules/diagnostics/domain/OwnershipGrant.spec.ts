import { describe, expect, it } from "vitest";
import { ownershipGrantAuthority, compatibleOwnershipGrant } from "./OwnershipGrant";

const source = { listingId: "listing", identityDigest: "a".repeat(64), sellerId: "seller", commissionerId: "seller", businessId: null, membershipId: null };
const grant = { ...source, orderId: "order", state: "available", grantorId: "seller", grantorMembershipId: null, rightsUntil: new Date("2026-12-01"), erasedAt: null };
const seller = { id: "seller", active: true, membership: null };
describe("authenticated ownership grants", () => {
  it("admits only the personal seller or an active dealership owner", () => {
    expect(ownershipGrantAuthority(seller, source)).toBe(true);
    expect(ownershipGrantAuthority({ ...seller, id: "technician" }, source)).toBe(false);
    const dealer = { ...source, businessId: "business", membershipId: "sales-membership" };
    const owner = { id: "owner", active: true, membership: { id: "owner-membership", businessId: "business", role: "owner", active: true, businessActive: true } };
    expect(ownershipGrantAuthority(owner, dealer)).toBe(true);
    expect(ownershipGrantAuthority({ ...owner, membership: { ...owner.membership, role: "sales" } }, dealer)).toBe(false);
    expect(ownershipGrantAuthority({ ...owner, active: false }, dealer)).toBe(false);
    expect(ownershipGrantAuthority({ ...owner, membership: { ...owner.membership, businessActive: false } }, dealer)).toBe(false);
  });
  it("binds an unexpired grant to this exact order and source", () => {
    expect(compatibleOwnershipGrant(grant, "order", source, seller, new Date("2026-11-01"))).toBe(true);
    for (const change of [{ orderId: "other" }, { sellerId: "other" }, { commissionerId: "other" }, { identityDigest: "b".repeat(64) },
      { listingId: "other" }, { businessId: "business" }, { membershipId: "other" }, { state: "erased" }, { erasedAt: new Date() }]) {
      expect(compatibleOwnershipGrant({ ...grant, ...change }, "order", source, seller, new Date("2026-11-01"))).toBe(false);
    }
    expect(compatibleOwnershipGrant(grant, "order", source, seller, grant.rightsUntil)).toBe(false);
    expect(compatibleOwnershipGrant(grant, "order", source, { ...seller, active: false }, new Date("2026-11-01"))).toBe(false);
  });
});
