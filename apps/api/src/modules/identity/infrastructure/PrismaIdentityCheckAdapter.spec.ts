import { describe, expect, it } from "vitest";
import type { PrismaService } from "@auto-tm/db";
import { PrismaIdentityCheckAdapter } from "./PrismaIdentityCheckAdapter";

// The database is the system boundary; callers consume only the yes/no port.
function fixture() {
  const member = { dealershipId: "business", status: "active", user: { suspendedAt: null as Date | null, deletionScheduledAt: null as Date | null }, dealership: { status: "active" } };
  const database = { dealershipMember: { findUnique: async () => member } };
  return { member, check: new PrismaIdentityCheckAdapter(database as unknown as PrismaService) };
}
describe("current business membership check", () => {
  it("admits a current member only to their own active business", async () => {
    const { check } = fixture();
    expect(await check.isInDealership("person", "business")).toBe(true);
    expect(await check.isInDealership("person", "another-business")).toBe(false);
  });
  it.each(["suspendedAt", "deletionScheduledAt"] as const)("refuses a User with current %s despite an existing membership", async (field) => {
    const { member, check } = fixture(); member.user[field] = new Date();
    expect(await check.isInDealership("person", "business")).toBe(false);
  });
  it("refuses suspended membership and protected recovery business", async () => {
    const { member, check } = fixture(); member.status = "suspended";
    expect(await check.isInDealership("person", "business")).toBe(false);
    member.status = "active"; member.dealership.status = "recovery";
    expect(await check.isInDealership("person", "business")).toBe(false);
  });
});
