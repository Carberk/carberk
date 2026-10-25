import { JwtService } from "@nestjs/jwt";
import { RefreshSession } from "../application/RefreshSession";
import { InMemoryIdentityCheck } from "../application/testing/InMemoryIdentityCheck";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma, type PrismaService } from "@auto-tm/db";
import { PrismaSessionRepository } from "./PrismaSessionRepository";
import { PrismaTotpEnrollmentRepository } from "./PrismaTotpEnrollmentRepository";
import { PrismaStaffAuthority } from "./PrismaStaffAuthority";
import { PrismaOtpRequestRepository } from "./PrismaOtpRequestRepository";
import { signInCodeDestination } from "../domain/SignInCodeDestination";
import { PrismaUserRepository } from "./PrismaUserRepository";

const now = new Date("2026-10-24T12:00:00Z");
const later = new Date("2027-01-01T00:00:00Z");
// All lifecycle fixtures, including pruning, use an explicit clock restored per test.
beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(now); });
afterEach(() => { vi.useRealTimers(); });
type Row = Record<string, unknown> & {
  id?: unknown; userId?: unknown; role?: unknown; suspendedAt?: unknown; deletionScheduledAt?: unknown;
  refreshTokenHash?: unknown; expiresAt?: unknown; adminTotpExpiresAt?: unknown; createdAt?: unknown;
  verifiedAt?: unknown; usedAt?: unknown; email?: unknown; revokedAt?: unknown; attempts?: unknown;
};
type State = { session: Row[]; user: Row[]; totpEnrollment: Row[]; totpBackupCode: Row[]; staffGrant: Row[]; auditLog: Row[]; otpRequest: Row[] };
type Args = { where?: Row; data?: Row | Row[]; include?: Row };
/** Storage boundary, with transactional rollback and mandatory outer preparation.
 * This does not model PostgreSQL discovery, trigger effects or lock modes. */
class IdentityDatabase {
  rows: State = { session: [], user: [], totpEnrollment: [], totpBackupCode: [], staffGrant: [], auditLog: [], otpRequest: [] };
  beforePrepare?: () => void | Promise<void>;
  afterSessionLock?: () => void | Promise<void>;
  afterPreparation?: (state: State) => void;
  refuseFinish = false;
  private transactionTail: Promise<void> = Promise.resolve();
  private matches(row: Row, where: Row = {}): boolean {
    return Object.entries(where).every(([key, value]) => {
      if (key === "userId_capability") return this.matches(row, value as Row);
      if (key === "user") {
        const user = this.rows.user.find(u => u.id === row.userId);
        return !!user && !user.suspendedAt && !user.deletionScheduledAt && user.role === "admin";
      }
      if (value && typeof value === "object" && !(value instanceof Date)) {
        const op = value as Row;
        if ("gt" in op) return (row[key] as Date) > (op["gt"] as Date);
        if ("lt" in op) return (row[key] as Date) < (op["lt"] as Date);
        if ("in" in op) return (op["in"] as unknown[]).includes(row[key]);
      }
      return row[key] === value;
    });
  }
  private client(state: State, inTransaction: boolean) {
    let prepared = false;
    let finished = false;
    const query = async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = strings.join("?");
      if (sql.startsWith("SET LOCAL lock_timeout")) return []; // No resource lock.
      if (sql.includes("prepare")) {
        await this.beforePrepare?.();
        prepared = true;
        this.afterPreparation?.(state);
        return [{ receipt: "receipt" }];
      }
      if (!prepared) throw new Error("prelude_required_before_lock");
      if (sql.includes("finish")) {
        if (this.refuseFinish) throw new Error("diagnostic_source_final_effect");
        finished = true;
      }
      if (sql.includes('FROM "users"')) return state.user.filter(row => values.includes(row.id));
      if (sql.includes('FROM "sessions"')) {
        await this.afterSessionLock?.();
        return state.session.filter(row => row.id === values[0]);
      }
      if (sql.includes("current_setting")) return [{ binding: "" }];
      return [];
    };
    const client: Record<string, unknown> = { $queryRaw: query, $executeRaw: query };
    for (const name of Object.keys(state) as (keyof State)[]) {
      const find = (args: Args = {}) => (inTransaction ? state : this.rows)[name]!.filter(row => this.matches(row, args.where));
      const write = () => { if (!inTransaction || !prepared || finished) throw new Error("prelude_required_before_write"); };
      client[name] = {
        findUnique: async (args: Args) => find(args)[0] ?? null,
        findUniqueOrThrow: async (args: Args) => { const row = find(args)[0]; if (!row) throw new Error("P2025"); return row; },
        findFirst: async (args: Args) => find(args).sort((a,b) => +(a.createdAt as Date) - +(b.createdAt as Date))[0] ?? null,
        findMany: async (args: Args) => name === "session" && args.include
          ? find(args).map(row => ({ ...row, user: (inTransaction ? state : this.rows).user.find(user => user.id === row.userId) })) : find(args),
        count: async (args: Args) => find(args).length,
        create: async (args: Args) => { write();
          if (name === "totpEnrollment" && state[name].some(row => row.userId === (args.data as Row).userId)) throw { code: "P2002" };
          const row = { revokedAt: null, attempts: 0, verifiedAt: null, id: `generated-${state[name]!.length}`, createdAt: now, updatedAt: now, ...args.data }; state[name]!.push(row); return row; },
        upsert: async (args: Args & { create: Row; update: Row }) => { write(); const row = find(args)[0];
          if (row && name === "staffGrant") throw new Error("diagnostic_source_uncovered_effect");
          if (row) { Object.assign(row, args.update); return row; }
          const created = { revokedAt: null, ...args.create }; state[name].push(created); return created; },
        createMany: async (args: Args) => { write(); state[name]!.push(...args.data as Row[]); return { count: (args.data as Row[]).length }; },
        updateMany: async (args: Args) => { write(); const rows = find(args); rows.forEach(row => Object.assign(row, args.data)); return { count: rows.length }; },
        update: async (args: Args) => { write(); const row = find(args)[0]; if (!row) throw new Error("P2025"); if (name === "user") {
            for (const field of ["phone", "email"]) {
              const destination = (args.data as Row)[field];
              if (destination && state.user.some(other => other !== row && other[field] === destination)) throw new Prisma.PrismaClientKnownRequestError("Unique destination", { code: "P2002", clientVersion: "offline-boundary" });
            }
          }
          const oldAttempts = Number(row.attempts ?? 0);
          Object.assign(row, args.data);
          if (name === "otpRequest" && typeof (args.data as Row).attempts === "object") row.attempts = oldAttempts + 1;
          return row; },
        deleteMany: async (args: Args) => { write(); const rows = find(args); state[name] = state[name]!.filter(row => !rows.includes(row));
          if (name === "totpEnrollment") state.totpBackupCode = state.totpBackupCode.filter(code => !rows.some(row => row.id === code["totpEnrollmentId"]));
          return { count: rows.length }; },
        delete: async (args: Args) => { write(); const row = find(args)[0]; if (!row) throw new Error("P2025"); state[name] = state[name]!.filter(r => r !== row); return row; },
      };
    }
    return client;
  }
  get service(): PrismaService {
    return { ...this.client(this.rows, false), $transaction: async <T>(work: (tx: unknown) => Promise<T>) => {
      const previous = this.transactionTail;
      let release!: () => void;
      this.transactionTail = new Promise<void>(resolve => { release = resolve; });
      await previous;
      try {
        const draft = structuredClone(this.rows);
        const result = await work(this.client(draft, true));
        this.rows = draft;
        return result;
      } finally { release(); }
    } } as unknown as PrismaService;
  }
}
function fixture() {
  const db = new IdentityDatabase();
  db.rows.user!.push({ id: "u", role: "admin", phone: null, phoneVerifiedAt: null, email: "old@example.test", emailVerifiedAt: now, suspendedAt: null, deletionScheduledAt: null,
      displayName: "Profile", avatarKey: "avatar-key", avatarUploadId: "upload-id", avatarUrl: "https://avatar.invalid/profile" });
  db.rows.session!.push({ id: "s", userId: "u", refreshTokenHash: "old", expiresAt: later, adminTotpExpiresAt: null, createdAt: now });
  db.rows.totpEnrollment!.push({ id: "e", userId: "u", encryptedSecret: "encrypted", verifiedAt: null, createdAt: now, updatedAt: now });
  return db;
}
const hasher = { hash: async (value: string) => value, compare: async (a: string, b: string) => a === b };

describe("Identity authority callers prepare their own transactions", () => {
  it("rotates once and returns false on reuse without a second token", async () => {
    const db = fixture(); const repo = new PrismaSessionRepository(db.service, hasher);
    expect(await repo.rotateRefreshToken("s", "old", "new", now, later)).toBe(true);
    expect(await repo.rotateRefreshToken("s", "old", "other", now, later)).toBe(false);
    expect(db.rows.session![0]!.refreshTokenHash).toBe("new");
  });
  it("the actual refresh application returns one token pair and Token already used to the CAS loser", async () => {
    const db = fixture(); const repo = new PrismaSessionRepository(db.service, hasher);
    const refresh = new RefreshSession(repo, hasher, { now: () => now }, new JwtService({ secret: "synthetic-test-secret" }), new InMemoryIdentityCheck());
    const results = await Promise.allSettled([refresh.execute({ refreshToken: "old" }), refresh.execute({ refreshToken: "old" })]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    const failure = results.find(result => result.status === "rejected");
    expect(failure?.status === "rejected" ? String(failure.reason) : "missing loser").toContain("Token already used");
    const success = results.find(result => result.status === "fulfilled");
    expect(success?.status === "fulfilled" ? success.value : null).toEqual({ accessToken: expect.any(String), refreshToken: db.rows.session[0]!.refreshTokenHash });
  });
  it("creates an ordinary Session through its own campaign prelude", async () => {
    const db = fixture(); const repo = new PrismaSessionRepository(db.service, hasher);
    const session = await repo.create({ userId: "u", refreshTokenHash: "new", expiresAt: later, deviceLabel: null, userAgent: null });
    expect(session.userId).toBe("u"); expect(db.rows.session).toHaveLength(2);
  });
  it("rolls back a rotation if final graph effects refuse", async () => {
    const db = fixture(); db.refuseFinish = true;
    await expect(new PrismaSessionRepository(db.service, hasher).rotateRefreshToken("s", "old", "new", now, later)).rejects.toThrow("diagnostic_source_final_effect");
    expect(db.rows.session![0]!.refreshTokenHash).toBe("old");
  });
  it("verifies once, creates backup codes and elevates atomically", async () => {
    const db = fixture(); const repo = new PrismaTotpEnrollmentRepository(db.service);
    const input = { userId: "u", enrollmentId: "e", sessionId: "s", verifiedAt: now, adminTotpExpiresAt: later, codeHashes: ["one", "two"] };
    await repo.completeFirstVerification(input);
    await expect(repo.completeFirstVerification(input)).rejects.toThrow("TOTP_ENROLLMENT_NOT_PENDING");
    expect(db.rows.totpBackupCode).toHaveLength(2); expect(db.rows.session![0]!.adminTotpExpiresAt).toEqual(later);
  });
  it.each(["missing", "foreign", "expired", "inactive"])("does not burn first verification for a %s Session", async kind => {
    const db = fixture();
    if (kind === "missing") db.rows.session = [];
    if (kind === "foreign") db.rows.session![0]!.userId = "other";
    if (kind === "expired") db.rows.session![0]!.expiresAt = now;
    if (kind === "inactive") db.rows.user![0]!.suspendedAt = now;
    await expect(new PrismaTotpEnrollmentRepository(db.service).completeFirstVerification({ userId: "u", enrollmentId: "e", sessionId: "s", verifiedAt: now, adminTotpExpiresAt: later, codeHashes: ["one"] })).rejects.toThrow("SESSION_NOT_FOUND");
    expect(db.rows.totpEnrollment![0]!.verifiedAt).toBeNull(); expect(db.rows.totpBackupCode).toEqual([]);
    expect(db.rows.session![0]?.adminTotpExpiresAt ?? null).toBeNull();
  });
  it("a backup code is one-use and a refused elevation does not burn it", async () => {
    const db = fixture(); db.rows.totpEnrollment![0]!.verifiedAt = now;
    db.rows.totpBackupCode!.push({ id: "b", totpEnrollmentId: "e", codeHash: "one", usedAt: null });
    const repo = new PrismaTotpEnrollmentRepository(db.service);
    const input = { userId: "u", enrollmentId: "e", sessionId: "missing", usedAt: now, adminTotpExpiresAt: later, codeHash: "one" };
    await expect(repo.consumeBackupCodeAndElevate(input)).rejects.toThrow("SESSION_NOT_FOUND");
    expect(db.rows.totpBackupCode![0]!.usedAt).toBeNull();
    expect(await repo.consumeBackupCodeAndElevate({ ...input, sessionId: "s" })).toBe(true);
    expect(await repo.consumeBackupCodeAndElevate({ ...input, sessionId: "s" })).toBe(false);
    expect(db.rows.session![0]!.adminTotpExpiresAt).toEqual(later);
  });
  it("changes only the selected verified Sign-in Method", async () => {
    const db = fixture(); const repo = new PrismaUserRepository(db.service);
    const user = await repo.replaceSignInMethod({ userId: "u", channel: "phone", destination: "+99361111111", verifiedAt: now });
    expect(user.phone).toBe("+99361111111"); expect(user.email).toBe("old@example.test");
    expect(db.rows.user[0]).toMatchObject({ displayName: "Profile", avatarKey: "avatar-key", avatarUploadId: "upload-id", avatarUrl: "https://avatar.invalid/profile" });
    expect(db.rows.session![0]!.adminTotpExpiresAt).toBeNull(); expect(user.role).toBe("admin");
  });
  it("fails closed on the unused raw User erasure methods", async () => {
    const db = fixture(); const repo = new PrismaUserRepository(db.service);
    await expect(repo.delete("u")).rejects.toThrow("ACCOUNT_ERASURE_UNIT_OF_WORK_REQUIRED");
    await expect(repo.purgePersonalData("u")).rejects.toThrow("ACCOUNT_ERASURE_UNIT_OF_WORK_REQUIRED");
    expect(db.rows.user).toHaveLength(1); expect(db.rows.user![0]!.email).toBe("old@example.test");
  });
});


describe("Session pruning and elevation preserve exact selected ownership", () => {
  it("removes expired Sessions and leaves live and foreign Sessions", async () => {
    const db = fixture(); const repo = new PrismaSessionRepository(db.service, hasher);
    db.rows.session.push({ ...db.rows.session[0], id: "expired", expiresAt: new Date("2000-01-01") });
    db.rows.session.push({ ...db.rows.session[0], id: "foreign", userId: "foreign", expiresAt: new Date("2000-01-01") });
    expect(await repo.deleteExpiredByUserId("u")).toBe(1);
    expect(db.rows.session.map(row => row.id).sort()).toEqual(["foreign", "s"]);
  });
  it("refuses a newly discovered expired Session before deleting the selected set", async () => {
    const db = fixture(); db.rows.session[0]!.expiresAt = new Date("2000-01-01");
    db.afterPreparation = state => state.session.push({ ...state.session[0], id: "new-expired" });
    await expect(new PrismaSessionRepository(db.service, hasher).deleteExpiredByUserId("u")).rejects.toThrow("diagnostic_source_graph_changed");
    expect(db.rows.session.map(row => row.id)).toEqual(["s"]);
  });
  it("refuses a changed oldest selection without deleting either Session", async () => {
    const db = fixture();
    db.afterPreparation = state => state.session.push({ ...state.session[0], id: "earlier", createdAt: new Date("2000-01-01") });
    await expect(new PrismaSessionRepository(db.service, hasher).deleteOldestByUserId("u")).rejects.toThrow("diagnostic_source_graph_changed");
    expect(db.rows.session.map(row => row.id)).toEqual(["s"]);
  });
  it("deletes the oldest only, then a single logout only", async () => {
    const db = fixture(); db.rows.session.push({ ...db.rows.session[0], id: "new", createdAt: later });
    const repo = new PrismaSessionRepository(db.service, hasher);
    await repo.deleteOldestByUserId("u"); expect(db.rows.session.map(row => row.id)).toEqual(["new"]);
    await repo.delete("new"); expect(db.rows.session).toEqual([]);
  });
  it("checks live staff ownership before elevation and rolls back a refused elevation", async () => {
    const db = fixture(); const repo = new PrismaSessionRepository(db.service, hasher);
    await expect(repo.updateAdminTotpExpiresAt("s", later, { userId: "foreign", now })).rejects.toThrow("SESSION_NOT_FOUND");
    expect(db.rows.session[0]!.adminTotpExpiresAt).toBeNull();
    await repo.updateAdminTotpExpiresAt("s", later, { userId: "u", now });
    expect(db.rows.session[0]!.adminTotpExpiresAt).toEqual(later);
  });
  it("enrollment deletion cascades only its backup codes", async () => {
    const db = fixture(); db.rows.totpBackupCode.push({ id: "own", totpEnrollmentId: "e", codeHash: "one", usedAt: null }, { id: "foreign", totpEnrollmentId: "other", codeHash: "two", usedAt: null });
    await new PrismaTotpEnrollmentRepository(db.service).deleteByUserId("u");
    expect(db.rows.totpEnrollment).toEqual([]); expect(db.rows.totpBackupCode.map(row => row.id)).toEqual(["foreign"]);
  });
});

describe("staff changes preserve live authority, no-op and audit", () => {
  function staffFixture() {
    const db = fixture();
    db.rows.user.push({ id: "target", role: "user", suspendedAt: null, deletionScheduledAt: null });
    db.rows.session[0]!.adminTotpExpiresAt = later;
    db.rows.staffGrant.push({ userId: "u", capability: "staff.manage", grantedAt: now, revokedAt: null });
    return db;
  }
  const input = { userId: "u", sessionId: "s", targetUserId: "target", capability: "diagnostics.technician", reason: "  Approved training  ", grant: true };
  it("grants and revokes with exactly one durable audit per real change", async () => {
    const db = staffFixture(); const repo = new PrismaStaffAuthority(db.service);
    await repo.change(input, now);
    await repo.change(input, now);
    expect(db.rows.auditLog).toHaveLength(1);
    expect(db.rows.auditLog[0]).toMatchObject({ action: "STAFF_CAPABILITY_GRANTED", details: { reason: "Approved training", previouslyActive: false } });
    await repo.change({ ...input, grant: false }, now);
    await repo.change({ ...input, grant: false }, now);
    expect(db.rows.auditLog).toHaveLength(2);
    expect(db.rows.staffGrant.find(row => row.userId === "target")!.revokedAt).toEqual(now);
  });
  it("absent revoke writes no grant or audit", async () => {
    const db = staffFixture(); await new PrismaStaffAuthority(db.service).change({ ...input, grant: false }, now);
    expect(db.rows.staffGrant).toHaveLength(1); expect(db.rows.auditLog).toEqual([]);
  });
  it.each(["actor revoked", "expired elevation", "wrong Session", "inactive actor", "inactive target", "founder capability"])("refuses %s without a grant or audit", async kind => {
    const db = staffFixture();
    if (kind === "actor revoked") db.rows.staffGrant[0]!.revokedAt = now;
    if (kind === "expired elevation") db.rows.session[0]!.adminTotpExpiresAt = now;
    if (kind === "wrong Session") db.rows.session[0]!.userId = "target";
    if (kind === "inactive actor") db.rows.user[0]!.suspendedAt = now;
    if (kind === "inactive target") db.rows.user[1]!.deletionScheduledAt = now;
    await expect(new PrismaStaffAuthority(db.service).change({ ...input, ...(kind === "founder capability" ? { capability: "staff.manage" } : {}) }, now)).rejects.toThrow();
    expect(db.rows.staffGrant).toHaveLength(1); expect(db.rows.auditLog).toEqual([]);
  });
  it("rolls back both grant and audit when completion refuses", async () => {
    const db = staffFixture(); db.refuseFinish = true;
    await expect(new PrismaStaffAuthority(db.service).change(input, now)).rejects.toThrow("diagnostic_source_final_effect");
    expect(db.rows.staffGrant).toHaveLength(1); expect(db.rows.auditLog).toEqual([]);
  });
});

describe("ordinary Identity writes prepare before database locks", () => {
  it("returns the existing pending enrollment after the ordinary insert race", async () => {
    const db = fixture();
    expect((await new PrismaTotpEnrollmentRepository(db.service).createPending("u", "other")).id).toBe("e");
    expect(db.rows.totpEnrollment).toHaveLength(1); expect(db.rows.totpEnrollment[0]).toMatchObject({ encryptedSecret: "encrypted", verifiedAt: null });
  });
  it("reserves and consumes an ordinary OTP once", async () => {
    const db = fixture(); const repo = new PrismaOtpRequestRepository(db.service);
    const result = await repo.reserve({ purpose: "sign-in", destination: signInCodeDestination({ phone: "+99361111111" }), codeHash: "hash", userId: "u", ip: "127.0.0.1" }, { now: () => now });
    expect(result.smsDelivery).toEqual({ kind: "ordinary" });
    expect(await repo.consumeIfUnused(result.record.id)).toBe(true);
    expect(await repo.consumeIfUnused(result.record.id)).toBe(false);
    expect(db.rows.otpRequest).toHaveLength(1);
  });
  it("creates a User and updates their name through ordinary preparation", async () => {
    const db = fixture(); const repo = new PrismaUserRepository(db.service);
    const user = await repo.create({ phone: "+99361111112", phoneVerifiedAt: now, email: null, emailVerifiedAt: null }, { nameNumber: 1234, avatarIndex: 1 });
    await repo.updateDisplayName(user.id, "Owner");
    expect(db.rows.user.find(row => row.id === user.id)).toMatchObject({ displayName: "Owner", phone: "+99361111112" });
  });
});


describe("remaining Identity lifecycle outcomes", () => {
  it("ordinary pending insert, standalone verification and backup consumption preserve one-use semantics", async () => {
    const db = fixture(); db.rows.totpEnrollment = [];
    const repo = new PrismaTotpEnrollmentRepository(db.service);
    const pending = await repo.createPending("u", "new-encrypted");
    expect(pending.verifiedAt).toBeNull();
    await repo.markVerified("u");
    await repo.addBackupCodes(pending.id, ["one", "two"]);
    expect((await repo.findBackupCodes(pending.id)).map(code => code.codeHash)).toEqual(["one", "two"]);
    expect(await repo.consumeBackupCode(pending.id, "one")).toBe(true);
    expect(await repo.consumeBackupCode(pending.id, "one")).toBe(false);
    expect(db.rows.session[0]!.adminTotpExpiresAt).toBeNull();
  });
  it("a real uniqueness conflict keeps the original Sign-in Method and error", async () => {
    const db = fixture(); db.rows.user.push({ ...db.rows.user[0], id: "holder", email: "held@example.test" });
    await expect(new PrismaUserRepository(db.service).replaceSignInMethod({ userId: "u", channel: "email", destination: "held@example.test", verifiedAt: now })).rejects.toMatchObject({ code: "SIGN_IN_METHOD_TAKEN" });
    expect(db.rows.user[0]!.email).toBe("old@example.test"); expect(db.rows.session[0]!.adminTotpExpiresAt).toBeNull();
  });
  it("ordinary OTP attempts and verification leave the stored destination intact", async () => {
    const db = fixture(); const repo = new PrismaOtpRequestRepository(db.service);
    const request = await repo.create({ purpose: "sign-in", channel: "phone", destination: "+99361111111", codeHash: "hash", expiresAt: later, userId: "u", ip: "127.0.0.1" });
    expect((await repo.incrementAttempts(request.id)).attempts).toBe(1);
    expect((await repo.incrementAttempts(request.id)).attempts).toBe(2);
    const verified = await repo.markVerified(request.id, "other");
    expect(verified.userId).toBe("other"); expect(verified.destination).toBe("+99361111111");
    expect(await repo.consumeIfUnused(request.id)).toBe(false);
    expect((await repo.findById(request.id))?.attempts).toBe(2);
  });
  it("a duplicated stored backup hash cannot be reused for a second elevation", async () => {
    const db = fixture(); db.rows.totpEnrollment[0]!.verifiedAt = now;
    db.rows.totpBackupCode.push({ id: "a", totpEnrollmentId: "e", codeHash: "same", usedAt: null }, { id: "b", totpEnrollmentId: "e", codeHash: "same", usedAt: null });
    const repo = new PrismaTotpEnrollmentRepository(db.service);
    expect(await repo.consumeBackupCodeAndElevate({ userId: "u", enrollmentId: "e", sessionId: "s", codeHash: "same", usedAt: now, adminTotpExpiresAt: later })).toBe(false);
    expect(db.rows.totpBackupCode.every(code => code.usedAt === null)).toBe(true); expect(db.rows.session[0]!.adminTotpExpiresAt).toBeNull();
  });
});


// Boundary substitution pauses a real repository at its database preparation or
// resource-lock await. It proves clock orchestration/rollback, not SQL locking.
async function afterWait<T>(db: IdentityDatabase, executionTime: Date, work: () => Promise<T>, atLock = false): Promise<T> {
  let entered!: () => void;
  let release!: () => void;
  const waiting = new Promise<void>(resolve => { entered = resolve; });
  const resumed = new Promise<void>(resolve => { release = resolve; });
  const gate = async () => { entered(); await resumed; };
  if (atLock) db.afterSessionLock = gate;
  else db.beforePrepare = gate;
  const result = work();
  await waiting;
  vi.setSystemTime(executionTime);
  release();
  return result;
}

const deadline = new Date("2026-10-24T12:00:01.000Z");
const boundaries = [
  { label: "just before", at: new Date("2026-10-24T12:00:00.999Z"), allowed: true },
  { label: "exactly at", at: deadline, allowed: false },
  { label: "after", at: new Date("2026-10-24T12:00:01.001Z"), allowed: false },
];
describe.each(boundaries)("execution $label expiry after preparation waits", ({ at, allowed }) => {
  it("refresh preserves the original token and expiry on refusal", async () => {
    const db = fixture(); db.rows.session[0]!.expiresAt = deadline;
    const result = afterWait(db, at, () => new PrismaSessionRepository(db.service, hasher).rotateRefreshToken("s", "old", "new", now, later));
    if (allowed) await expect(result).resolves.toBe(true);
    else await expect(result).rejects.toThrow("Session expired");
    expect(db.rows.session[0]).toMatchObject(allowed
      ? { refreshTokenHash: "new", expiresAt: later, lastSeenAt: now }
      : { refreshTokenHash: "old", expiresAt: deadline });
    if (!allowed) expect(db.rows.session[0]!["lastSeenAt"]).toBeUndefined();
  });
  it.each(["elevate", "first verification", "backup code"])("%s preserves all state on refusal", async kind => {
    const db = fixture(); db.rows.session[0]!.expiresAt = deadline;
    if (kind === "backup code") {
      db.rows.totpEnrollment[0]!.verifiedAt = now;
      db.rows.totpBackupCode.push({ id: "b", totpEnrollmentId: "e", codeHash: "one", usedAt: null });
    }
    const original = structuredClone(db.rows);
    const totp = new PrismaTotpEnrollmentRepository(db.service);
    const result = afterWait(db, at, () => kind === "elevate"
      ? new PrismaSessionRepository(db.service, hasher).updateAdminTotpExpiresAt("s", later, { userId: "u", now })
      : kind === "first verification"
        ? totp.completeFirstVerification({ userId: "u", enrollmentId: "e", sessionId: "s", verifiedAt: now, adminTotpExpiresAt: later, codeHashes: ["one", "two"] })
        : totp.consumeBackupCodeAndElevate({ userId: "u", enrollmentId: "e", sessionId: "s", usedAt: now, adminTotpExpiresAt: later, codeHash: "one" }).then(value => { expect(value).toBe(true); }));
    if (!allowed) {
      await expect(result).rejects.toThrow("SESSION_NOT_FOUND");
      expect(db.rows).toEqual(original);
    } else {
      await result;
      expect(db.rows.session[0]!.adminTotpExpiresAt).toEqual(later);
      if (kind === "first verification") {
        expect(db.rows.totpEnrollment[0]!.verifiedAt).toEqual(now);
        expect(db.rows.totpBackupCode.map(code => code["codeHash"])).toEqual(["one", "two"]);
      }
      if (kind === "backup code") expect(db.rows.totpBackupCode[0]!.usedAt).toEqual(now);
    }
  });
  describe.each([false, true])("staff grant=%s", grant => {
    it.each(["Session", "elevation", "elevation after resource lock"])("checks %s and preserves grants/audit on refusal", async expiry => {
      const db = fixture();
      db.rows.user.push({ id: "target", role: "user", suspendedAt: null, deletionScheduledAt: null });
      db.rows.staffGrant.push({ userId: "u", capability: "staff.manage", grantedAt: now, revokedAt: null });
      if (!grant) db.rows.staffGrant.push({ userId: "target", capability: "diagnostics.technician", grantedAt: now, revokedAt: null });
      db.rows.session[0]!.expiresAt = expiry === "Session" ? deadline : later;
      db.rows.session[0]!.adminTotpExpiresAt = expiry === "Session" ? later : deadline;
      const original = structuredClone(db.rows);
      const result = afterWait(db, at, () => new PrismaStaffAuthority(db.service).change({ userId: "u", sessionId: "s", targetUserId: "target", capability: "diagnostics.technician", reason: "Approved", grant }, now), expiry.includes("resource lock"));
      if (!allowed) {
        await expect(result).rejects.toThrow(expiry === "Session" ? "SESSION_REQUIRED" : "ELEVATION_REQUIRED");
        expect(db.rows).toEqual(original);
      } else {
        await result;
        expect(db.rows.auditLog).toHaveLength(1);
        expect(db.rows.staffGrant.find(row => row.userId === "target")).toMatchObject({ grantedAt: now, revokedAt: grant ? null : now });
      }
    });
  });
});
