import { describe, expect, it } from "vitest";
import type { PrismaService } from "@auto-tm/db";
import { PrismaSessionRepository } from "./PrismaSessionRepository";
import { PrismaTotpEnrollmentRepository } from "./PrismaTotpEnrollmentRepository";
import { PrismaUserRepository } from "./PrismaUserRepository";

const now = new Date("2026-10-24T12:00:00Z");
const later = new Date("2027-01-01T00:00:00Z");
type Row = Record<string, unknown>;
type Args = { where?: Row; data?: Row | Row[] };
/** Storage boundary, with transactional rollback and mandatory outer preparation.
 * This does not model PostgreSQL discovery, trigger effects or lock modes. */
class IdentityDatabase {
  rows: Record<string, Row[]> = { session: [], user: [], totpEnrollment: [], totpBackupCode: [] };
  beforePrepare?: () => void;
  refuseFinish = false;
  private matches(row: Row, where: Row = {}): boolean {
    return Object.entries(where).every(([key, value]) => {
      if (key === "user") {
        const user = this.rows.user.find(u => u.id === row.userId);
        return !!user && !user.suspendedAt && !user.deletionScheduledAt && user.role === "admin";
      }
      if (value && typeof value === "object" && !(value instanceof Date)) {
        const op = value as Row;
        if ("gt" in op) return (row[key] as Date) > (op.gt as Date);
        if ("lt" in op) return (row[key] as Date) < (op.lt as Date);
        if ("in" in op) return (op.in as unknown[]).includes(row[key]);
      }
      return row[key] === value;
    });
  }
  private client(state: Record<string, Row[]>, inTransaction: boolean) {
    let prepared = false;
    let finished = false;
    const query = async (strings: TemplateStringsArray) => {
      const sql = strings.join("?");
      if (sql.includes("prepare")) {
        this.beforePrepare?.();
        prepared = true;
        return [{ receipt: "receipt" }];
      }
      if (!prepared) throw new Error("prelude_required_before_lock");
      if (sql.includes("finish")) {
        if (this.refuseFinish) throw new Error("diagnostic_source_final_effect");
        finished = true;
      }
      return [];
    };
    const client: Record<string, unknown> = { $queryRaw: query, $executeRaw: query };
    for (const name of Object.keys(state)) {
      const find = (args: Args = {}) => state[name]!.filter(row => this.matches(row, args.where));
      const write = () => { if (!inTransaction || !prepared || finished) throw new Error("prelude_required_before_write"); };
      client[name] = {
        findUnique: async (args: Args) => find(args)[0] ?? null,
        findFirst: async (args: Args) => find(args).sort((a,b) => +(a.createdAt as Date) - +(b.createdAt as Date))[0] ?? null,
        findMany: async (args: Args) => find(args),
        count: async (args: Args) => find(args).length,
        create: async (args: Args) => { write(); const row = { id: `generated-${state[name]!.length}`, createdAt: now, updatedAt: now, ...args.data }; state[name]!.push(row); return row; },
        createMany: async (args: Args) => { write(); state[name]!.push(...args.data as Row[]); return { count: (args.data as Row[]).length }; },
        updateMany: async (args: Args) => { write(); const rows = find(args); rows.forEach(row => Object.assign(row, args.data)); return { count: rows.length }; },
        update: async (args: Args) => { write(); const row = find(args)[0]; if (!row) throw new Error("P2025"); Object.assign(row, args.data); return row; },
        deleteMany: async (args: Args) => { write(); const rows = find(args); state[name] = state[name]!.filter(row => !rows.includes(row)); return { count: rows.length }; },
        delete: async (args: Args) => { write(); const row = find(args)[0]; if (!row) throw new Error("P2025"); state[name] = state[name]!.filter(r => r !== row); return row; },
      };
    }
    return client;
  }
  get service(): PrismaService {
    return { ...this.client(this.rows, false), $transaction: async <T>(work: (tx: unknown) => Promise<T>) => {
      const draft = structuredClone(this.rows);
      const result = await work(this.client(draft, true));
      this.rows = draft;
      return result;
    } } as unknown as PrismaService;
  }
}
function fixture() {
  const db = new IdentityDatabase();
  db.rows.user!.push({ id: "u", role: "admin", phone: null, phoneVerifiedAt: null, email: "old@example.test", emailVerifiedAt: now, suspendedAt: null, deletionScheduledAt: null });
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
    expect(db.rows.session![0]!.adminTotpExpiresAt).toBeNull(); expect(user.role).toBe("admin");
  });
  it("fails closed on the unused raw User erasure methods", async () => {
    const db = fixture(); const repo = new PrismaUserRepository(db.service);
    await expect(repo.delete("u")).rejects.toThrow("ACCOUNT_ERASURE_UNIT_OF_WORK_REQUIRED");
    await expect(repo.purgePersonalData("u")).rejects.toThrow("ACCOUNT_ERASURE_UNIT_OF_WORK_REQUIRED");
    expect(db.rows.user).toHaveLength(1); expect(db.rows.user![0]!.email).toBe("old@example.test");
  });
});
