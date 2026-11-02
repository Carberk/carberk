import "reflect-metadata";
import type { DiagnosticSourceCommand, PrismaService } from "@auto-tm/db";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MutableClock } from "../application/testing/MutableClock";
import { PrismaStaffAuthority } from "./PrismaStaffAuthority";

const mutationTime = new Date("2026-10-24T12:00:00.000Z");
const deadline = new Date("2026-10-24T12:00:01.000Z");
const later = new Date("2027-01-01T00:00:00.000Z");
const input = { userId: "manager", sessionId: "session", targetUserId: "target",
  capability: "diagnostics.technician", reason: "  Approved training  ", grant: true };
type Grant = { userId: string; capability: string; grantedAt: Date; revokedAt: Date | null };
type State = { grants: Grant[]; audits: unknown[]; declarations: DiagnosticSourceCommand[] };

/** Database boundary only. Real source-command and policy code run unchanged;
 * this fixture does not prove PostgreSQL locks, triggers or receipt validation. */
function storage(grant: boolean, expiry: "session" | "elevation") {
  let state: State = { grants: [
    { userId: "manager", capability: "staff.manage", grantedAt: mutationTime, revokedAt: null },
    ...(!grant ? [{ userId: "target", capability: "diagnostics.technician", grantedAt: mutationTime, revokedAt: null }] : []),
  ], audits: [], declarations: [] };
  let entered!: () => void;
  let release!: () => void;
  const sessionLocked = new Promise<void>(resolve => { entered = resolve; });
  const resumed = new Promise<void>(resolve => { release = resolve; });
  const prisma = { $transaction: async <T>(work: (tx: unknown) => Promise<T>) => {
    const draft = structuredClone(state);
    const tx = {
      $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
        const sql = strings.join("?");
        if (sql.includes("diagnostic_prepare_source")) {
          draft.declarations.push(JSON.parse(values[0] as string) as DiagnosticSourceCommand);
          return [{ receipt: "synthetic-receipt" }];
        }
        if (sql.includes('FROM "users"')) return ["manager", "target"].map(id => ({
          id, role: "buyer", suspendedAt: null, deletionScheduledAt: null,
        }));
        if (sql.includes('FROM "sessions"')) {
          entered();
          await resumed;
          return [{ userId: "manager", expiresAt: expiry === "session" ? deadline : later,
            adminTotpExpiresAt: expiry === "elevation" ? deadline : later }];
        }
        if (sql.includes("diagnostic_finish_source")) return [];
        throw new Error("Unexpected database boundary query");
      },
      staffGrant: {
        findUnique: async ({ where }: { where: { userId_capability: { userId: string; capability: string } } }) =>
          structuredClone(draft.grants.find(row => row.userId === where.userId_capability.userId && row.capability === where.userId_capability.capability) ?? null),
        findMany: async ({ where }: { where: { userId: string; revokedAt: null } }) =>
          draft.grants.filter(row => row.userId === where.userId && row.revokedAt === where.revokedAt),
        create: async ({ data }: { data: Omit<Grant, "revokedAt"> }) => {
          draft.grants.push({ ...data, revokedAt: null });
        },
        updateMany: async ({ where, data }: { where: { userId: string; capability: string; revokedAt: null }; data: { revokedAt: Date } }) => {
          for (const row of draft.grants) if (row.userId === where.userId && row.capability === where.capability && row.revokedAt === null) Object.assign(row, data);
        },
      },
      auditLog: { create: async ({ data }: { data: unknown }) => { draft.audits.push(data); } },
    };
    const result = await work(tx);
    state = draft;
    return result;
  } } as unknown as PrismaService;
  return { prisma, sessionLocked, release, snapshot: () => structuredClone(state) };
}

beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(mutationTime); });
afterEach(() => { vi.useRealTimers(); });

describe.each([false, true])("staff grant=%s uses the injected execution clock after locks", grant => {
  describe.each(["session", "elevation"] as const)("%s deadline", expiry => {
    it.each([
      { label: "just before", execution: "2026-10-24T12:00:00.999Z", allowed: true },
      { label: "exactly at", execution: "2026-10-24T12:00:01.000Z", allowed: false },
      { label: "after", execution: "2026-10-24T12:00:01.001Z", allowed: false },
    ])("$label expiry preserves earlier mutation time or rolls back all effects", async ({ execution, allowed }) => {
      const db = storage(grant, expiry);
      const original = db.snapshot();
      const clock = new MutableClock(mutationTime);
      const repository = new PrismaStaffAuthority(db.prisma, clock);
      const result = repository.change({ ...input, grant }, mutationTime);
      await db.sessionLocked;
      clock.current = new Date(execution);
      db.release();
      if (!allowed) {
        await expect(result).rejects.toThrow(expiry === "session" ? "SESSION_REQUIRED" : "ELEVATION_REQUIRED");
        expect(db.snapshot()).toEqual(original);
        return;
      }
      await result;
      const committed = db.snapshot();
      expect(committed.grants.find(row => row.userId === "target")).toEqual({
        userId: "target", capability: "diagnostics.technician", grantedAt: new Date("2026-10-24T12:00:00.000Z"),
        revokedAt: grant ? null : new Date("2026-10-24T12:00:00.000Z"),
      });
      expect(committed.declarations[0]?.rows[0]?.next).toEqual({ userId: "target", capability: "diagnostics.technician",
        grantedAt: "2026-10-24T12:00:00.000Z", revokedAt: grant ? null : "2026-10-24T12:00:00.000Z" });
      expect(committed.audits).toEqual([{ actorId: "manager", action: grant ? "STAFF_CAPABILITY_GRANTED" : "STAFF_CAPABILITY_REVOKED",
        targetType: "User", targetId: "target", details: { capability: "diagnostics.technician", reason: "Approved training", previouslyActive: !grant } }]);
    });
  });
});

it("permits current injected authority even when ambient time is past expiry", async () => {
  vi.setSystemTime(later);
  const db = storage(true, "session");
  const clock = new MutableClock(new Date("2026-10-24T12:00:00.999Z"));
  const result = new PrismaStaffAuthority(db.prisma, clock).change(input, mutationTime);
  await db.sessionLocked;
  db.release();
  await result;
  expect(db.snapshot().grants.find(row => row.userId === "target")?.grantedAt).toEqual(new Date("2026-10-24T12:00:00.000Z"));
  expect(db.snapshot().audits).toHaveLength(1);
});
