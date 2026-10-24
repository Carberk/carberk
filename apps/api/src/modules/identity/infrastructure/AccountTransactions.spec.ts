import { describe, expect, it } from "vitest";
import type { PrismaService } from "@auto-tm/db";
import { PrismaAccountDeletionUnitOfWork } from "./PrismaAccountDeletionUnitOfWork";
import { PrismaAccountRestoreUnitOfWork } from "./PrismaAccountRestoreUnitOfWork";
import { PrismaUserRepository } from "./PrismaUserRepository";
import { PrismaSessionRepository } from "./PrismaSessionRepository";
import { BcryptHasherAdapter } from "./BcryptHasherAdapter";
import { DeleteMe } from "../application/DeleteMe";
import { RecoverAccount } from "../application/RecoverAccount";

const date = new Date("2026-11-24T12:00:00.000Z");
const stamp = new Date("2026-10-24T12:00:00.124Z");

// Stateful adapter boundary, not a SQL/locking/concurrency model. Raw discovery
// supplies server-owned values. CRUD predicates and rollback act on stored rows.
function boundary(role: "owner" | "sales" = "owner", businessStatus = "active") {
  let state = {
    user: { id: "user", phone: "+99361234567", phoneVerifiedAt: stamp, email: null, emailVerifiedAt: null, deletionScheduledAt: null as Date | null },
    sessions: [{ id: "session", userId: "user", expiresAt: date, adminTotpExpiresAt: null }, { id: "foreign-session", userId: "foreign", expiresAt: date, adminTotpExpiresAt: null }],
    member: { id: "member", userId: "user", dealershipId: "business", role } as { id: string; userId: string; dealershipId: string; role: string } | null,
    business: { id: "business", status: businessStatus },
    listings: [
      { sellerId: "user", businessId: null as string | null, status: "active", archivedByDeletion: false, publishedAt: stamp },
      { sellerId: "user", businessId: "business", status: "active", archivedByDeletion: false, publishedAt: stamp },
      { sellerId: "foreign", businessId: null, status: "active", archivedByDeletion: false, publishedAt: stamp },
    ],
    baseline: true, exports: true, principal: true, invitations: true,
    grants: [{ capability: "staff.manage", revokedAt: null as Date | null }, { capability: "diagnostics.reception", revokedAt: null as Date | null }],
    audits: [] as { id: string; createdAt: Date; details: unknown }[],
    receipts: [] as string[],
  };
  let prepared = false;
  let writes = 0;
  let collectorPresent = true;
  const write = () => { if (!prepared) throw new Error("write before prepare"); writes++; };
  const tx = {
    $queryRaw: async (sql: TemplateStringsArray, ...values: unknown[]) => {
      const query = sql.join("?");
      if (query.includes("diagnostic_source_read") && values[0] !== "user") return [{ source: null }];
      if (query.includes("diagnostic_source_read")) return [{ source: { id: "user", deletionScheduledAt: state.user.deletionScheduledAt?.toISOString() ?? null }, next: { id: "user", deletionScheduledAt: (values[1] as Date | null)?.toISOString() ?? null }, membershipAuditId: "membership-xid", staffAuditId: "staff-xid", timestamp: stamp }];
      if (query.includes("diagnostic_prepare_source")) { prepared = true; state.receipts.push("receipt"); return [{ receipt: "receipt" }]; }
      if (query.includes("diagnostic_assert_source")) return [];
      if (query.includes("diagnostic_finish_source")) { state.receipts = []; return []; }
      if (query.includes("measurement_state")) return collectorPresent ? [{ epoch: "epoch" }] : [];
      if (query.includes('UPDATE "staff_grants"')) { write(); const active = state.grants.filter(g => !g.revokedAt); active.forEach(g => { g.revokedAt = values[0] as Date; }); return active; }
      if (query.includes("dealerships")) return [{ id: "business" }];
      throw new Error(`unexpected query: ${query}`);
    },
    user: {
      findUniqueOrThrow: async () => ({ ...state.user }),
      findUnique: async ({ where }: { where: { id: string } }) => where.id === state.user.id ? { ...state.user } : null,
      update: async ({ data }: { data: { deletionScheduledAt: Date | null } }) => { write(); Object.assign(state.user, data); },
    },
    session: {
      findMany: async ({ where }: { where: { userId: string } }) => state.sessions.filter(s => s.userId === where.userId),
      deleteMany: async ({ where }: { where: { userId: string } }) => {
        write(); const count = state.sessions.filter(s => s.userId === where.userId).length;
        state.sessions = state.sessions.filter(s => s.userId !== where.userId); return { count };
      },
    },
    dealershipMember: {
      findUnique: async () => state.member,
      delete: async () => { write(); state.member = null; },
    },
    dealership: { updateMany: async ({ where, data }: { where: { status: { not: string } }; data: object }) => { write(); if (state.business.status !== where.status.not) Object.assign(state.business, data); } },
    auditLog: { create: async ({ data }: { data: typeof state.audits[number] }) => { write(); state.audits.push(data); } },
    measurementState: { deleteMany: async () => { write(); state.baseline = false; } },
    measurementInvestigationExport: { deleteMany: async () => { write(); state.exports = false; } },
    measurementPrincipal: { deleteMany: async () => { write(); state.principal = false; } },
    dealershipInvitation: { deleteMany: async () => { write(); state.invitations = false; } },
    listing: { updateMany: async ({ where, data }: { where: Record<string, unknown>; data: object }) => {
      write(); for (const listing of state.listings) if (Object.entries(where).every(([key, value]) => listing[key as keyof typeof listing] === value)) Object.assign(listing, data);
    } },
  };
  const db = { ...tx, $transaction: async (work: (transaction: typeof tx) => Promise<unknown>) => {
    const before = structuredClone(state); prepared = false;
    try { return await work(tx); } catch (error) { state = before; throw error; }
  } } as unknown as PrismaService;
  return { db, deletion: new PrismaAccountDeletionUnitOfWork(db), restore: new PrismaAccountRestoreUnitOfWork(db), state: () => structuredClone(state), writes: () => writes, withoutCollector: () => { collectorPresent = false; } };
}

async function schedule(b: ReturnType<typeof boundary>) {
  await b.deletion.run({ userId: "user", deletionScheduledAt: date }, async writes => {
    await writes.scheduleDeletion("user", date);
    await writes.archiveActiveListings("user");
  });
}

describe("actual account adapters", () => {
  it("keeps actual Session revocation committed when later deletion fails, then retries through DeleteMe and restores through RecoverAccount", async () => {
    const b = boundary();
    const users = new PrismaUserRepository(b.db);
    const sessions = new PrismaSessionRepository(b.db, new BcryptHasherAdapter());
    const clock = { now: () => new Date("2026-10-25T12:00:00.000Z") };
    const failing = new DeleteMe(users, sessions, {
      run: (command, work) => b.deletion.run(command, writes => work({
        ...writes, archiveActiveListings: async id => { await writes.archiveActiveListings(id); throw new Error("after archive"); },
      })),
    }, clock);
    await expect(failing.execute({ userId: "user" })).rejects.toThrow("after archive");
    expect(b.state().sessions.map(s => s.id)).toEqual(["foreign-session"]);
    expect(b.state().user.deletionScheduledAt).toBeNull();
    expect(b.state().listings[0]?.status).toBe("active");
    expect(b.state().audits).toEqual([]);
    await new DeleteMe(users, sessions, b.deletion, clock).execute({ userId: "user" });
    expect(b.state().user.deletionScheduledAt).toEqual(date);
    await new RecoverAccount(users, b.restore).execute({ userId: "user" });
    expect(b.state().user.deletionScheduledAt).toBeNull();
    expect(b.state().sessions.map(s => s.id)).toEqual(["foreign-session"]);
  });

  it.each([["owner", "active", "recovery"], ["owner", "suspended", "suspended"], ["sales", "active", "active"]] as const)("schedules %s in %s atomically", async (role, status, expected) => {
    const b = boundary(role, status);
    await schedule(b);
    const state = b.state();
    expect(state.user.deletionScheduledAt).toEqual(date);
    expect(state.member).toBeNull();
    expect(state.business.status).toBe(expected);
    expect(state.listings.map(l => l.status)).toEqual(["archived", "active", "active"]);
    expect(state.listings.every(l => l.publishedAt.getTime() === stamp.getTime())).toBe(true);
    expect([state.baseline, state.exports, state.principal, state.invitations]).toEqual([false, false, false, false]);
    expect(state.grants.map(g => g.revokedAt)).toEqual([stamp, stamp]);
    expect(state.audits).toMatchObject([
      { id: "membership-xid", createdAt: stamp, details: { role, recoveryRequired: role === "owner" } },
      { id: "staff-xid", createdAt: stamp, details: { capabilities: ["diagnostics.reception", "staff.manage"] } },
    ]);
    expect(state.receipts).toEqual([]);
  });

  it.each(["schedule", "archive"])("rolls back failure after %s and supports retry", async failure => {
    const b = boundary(); const before = b.state();
    await expect(b.deletion.run({ userId: "user", deletionScheduledAt: date }, async writes => {
      await writes.scheduleDeletion("user", date);
      if (failure === "archive") await writes.archiveActiveListings("user");
      throw new Error("later failure");
    })).rejects.toThrow("later failure");
    expect(b.state()).toEqual(before);
    await schedule(b);
    expect(b.state().user.deletionScheduledAt).toEqual(date);
  });

  it.each(["target", "date"])("refuses callback %s mismatch before writes", async mismatch => {
    const b = boundary();
    await expect(b.deletion.run({ userId: "user", deletionScheduledAt: date }, writes => writes.scheduleDeletion(mismatch === "target" ? "foreign" : "user", mismatch === "date" ? stamp : date))).rejects.toThrow("account_deletion_target");
    expect(b.writes()).toBe(0);
  });

  it("refuses incomplete mandatory operations", async () => {
    const b = boundary(); const before = b.state();
    await expect(b.deletion.run({ userId: "user", deletionScheduledAt: date }, writes => writes.scheduleDeletion("user", date))).rejects.toThrow("account_deletion_incomplete");
    expect(b.state()).toEqual(before);
  });

  it("restores personal marked Listings without reviving erased authority, then skips the callback under the prepared fence", async () => {
    const b = boundary(); await schedule(b);
    await b.restore.run({ userId: "user" }, async writes => {
      await writes.republishListingsArchivedByDeletion("user"); await writes.clearDeletionSchedule("user");
    });
    const restored = b.state();
    expect(restored.user.deletionScheduledAt).toBeNull();
    expect(restored.listings.map(l => l.status)).toEqual(["active", "active", "active"]);
    expect(restored.member).toBeNull(); expect(restored.principal).toBe(false);
    expect(restored.grants.every(g => g.revokedAt !== null)).toBe(true);
    await b.restore.run({ userId: "user" }, async () => { throw new Error("no-op callback ran"); });
    expect(b.state()).toEqual(restored);
  });

  it("refuses unknown Users and restore target mismatches without writes", async () => {
    const b = boundary();
    await expect(b.restore.run({ userId: "missing" }, async () => undefined)).rejects.toThrow("User not found");
    expect(b.writes()).toBe(0);
    await schedule(b); const before = b.state();
    await expect(b.restore.run({ userId: "user" }, writes => writes.republishListingsArchivedByDeletion("foreign"))).rejects.toThrow("account_restore_target");
    expect(b.state()).toEqual(before);
  });

  it("rolls back partial restore and restores with an absent collector/baseline", async () => {
    const b = boundary(); await schedule(b); const before = b.state();
    await expect(b.restore.run({ userId: "user" }, writes => writes.republishListingsArchivedByDeletion("user"))).rejects.toThrow("account_restore_incomplete");
    expect(b.state()).toEqual(before);
    b.withoutCollector();
    await b.restore.run({ userId: "user" }, async writes => { await writes.republishListingsArchivedByDeletion("user"); await writes.clearDeletionSchedule("user"); });
    expect(b.state().user.deletionScheduledAt).toBeNull();
  });
});
