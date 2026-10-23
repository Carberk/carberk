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

function adapterWith(users: Array<{ id: string; phone: string | null }>) {
  const prisma = {
    user: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        const user = users.find((u) => u.id === where.id);
        return user ? { phone: user.phone } : null;
      },
    },
  };
  return new PrismaIdentityCheckAdapter(
    prisma as unknown as ConstructorParameters<typeof PrismaIdentityCheckAdapter>[0],
  );
}

describe("PrismaIdentityCheckAdapter.holdsSignInPhone", () => {
  const adapter = adapterWith([
    { id: "user-1", phone: "+99361234567" },
    { id: "email-only", phone: null },
  ]);

  it("is true only for the User's own sign-in phone", async () => {
    expect(await adapter.holdsSignInPhone("user-1", "+99361234567")).toBe(true);
    expect(await adapter.holdsSignInPhone("user-1", "+99365123456")).toBe(false);
  });

  it("is false for a User without a phone or an unknown User", async () => {
    expect(await adapter.holdsSignInPhone("email-only", "+99361234567")).toBe(false);
    expect(await adapter.holdsSignInPhone("missing", "+99361234567")).toBe(false);
  });
});

// Query-aware external database fixture: a lookup of another id cannot borrow
// the administrator's role. The production adapter makes the decision.
describe("current administrator check", () => {
  function roles() {
    const users = new Map([
      ["administrator", "admin"], ["buyer", "buyer"],
      ["seller", "seller"], ["moderator", "moderator"],
    ]);
    const database = { user: { findUnique: async ({ where }: { where: { id: string } }) => {
      const role = users.get(where.id);
      return role === undefined ? null : { role };
    } } };
    return { users, check: new PrismaIdentityCheckAdapter(database as unknown as PrismaService) };
  }

  it("admits the administrator", async () => {
    expect(await roles().check.isAdmin("administrator")).toBe(true);
  });
  it.each(["buyer", "seller", "moderator", "missing"])("refuses %s even when another User is an administrator", async (id) => {
    expect(await roles().check.isAdmin(id)).toBe(false);
  });
  it("uses the supplied id on each lookup", async () => {
    const { check } = roles();
    expect(await check.isAdmin("administrator")).toBe(true);
    expect(await check.isAdmin("someone-else")).toBe(false);
    expect(await check.isAdmin("buyer")).toBe(false);
  });
  it("reads the current role again after it changes", async () => {
    const { users, check } = roles();
    expect(await check.isAdmin("administrator")).toBe(true);
    users.set("administrator", "buyer");
    expect(await check.isAdmin("administrator")).toBe(false);
    users.set("administrator", "admin");
    expect(await check.isAdmin("administrator")).toBe(true);
  });
});
