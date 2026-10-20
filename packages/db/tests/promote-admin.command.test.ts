import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { PrismaPg } from "@prisma/adapter-pg";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { PrismaClient } from "../generated/prisma/client/client";

import { trackPoolClientEnds } from "./helpers/track-pool-client-ends";

// The operator command `pnpm --filter @auto-tm/db admin:promote` as an operator runs it:
// the checked-in script in a child process against a disposable migrated PostgreSQL.
// Runbook 86 owns the contract; the full-v3 moderation actor decision
// (docs/evidence/issue-901/full-v3-moderation-actor-decision-20261020.md) adds the
// verified-email selector and role/audit atomicity.

const run = promisify(execFile);
const packageDir = fileURLToPath(new URL("..", import.meta.url));

const VERIFIED_AT = new Date("2026-10-01T00:00:00.000Z");
const UPDATED_AT = new Date("2026-10-02T00:00:00.000Z");
const FUTURE = new Date("2026-12-01T00:00:00.000Z");
const REASON = "full-v3 marketplace moderation acceptance";

const COORDINATOR_EMAIL = "coordinator@campaign.example.test";
const PHONE = "+99361234567";

function must<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error("Expected a value");
  return value;
}

describe("admin:promote command — disposable migrated PostgreSQL", () => {
  let container: StartedPostgreSqlContainer;
  let databaseUrl: string;
  let pool: Pool;
  let waitForClientEnds: (() => Promise<void>) | undefined;
  let db: PrismaClient;

  async function promote(...args: string[]): Promise<{ code: number; output: string }> {
    const env = { ...process.env, DATABASE_URL: databaseUrl };
    try {
      const { stdout, stderr } = await run(`${packageDir}node_modules/.bin/tsx`, ["scripts/promote-admin.ts", ...args], { cwd: packageDir, env });
      return { code: 0, output: `${stdout}${stderr}` };
    } catch (error) {
      const failed = error as { code?: unknown; stdout?: string; stderr?: string };
      if (typeof failed.code !== "number") throw error;
      return { code: failed.code, output: `${failed.stdout ?? ""}${failed.stderr ?? ""}` };
    }
  }

  /** Everything the command may not change unless it promotes: Users, audit and every credential table. */
  async function snapshot() {
    return {
      users: await db.user.findMany({ orderBy: { id: "asc" }, select: { id: true, role: true, phone: true, email: true, updatedAt: true } }),
      audits: await db.auditLog.findMany({ orderBy: { id: "asc" } }),
      sessions: await db.session.findMany({ orderBy: { id: "asc" }, select: { id: true, userId: true, adminTotpExpiresAt: true } }),
      otpRequests: await db.otpRequest.count(),
      totpEnrollments: await db.totpEnrollment.count(),
      totpBackupCodes: await db.totpBackupCode.count(),
      staffGrants: await db.staffGrant.findMany({ orderBy: [{ userId: "asc" }, { capability: "asc" }] }),
    };
  }

  function emailUser(email: string, role: "buyer" | "seller" | "moderator" | "admin" = "buyer") {
    return db.user.create({ data: { email, emailVerifiedAt: VERIFIED_AT, role, updatedAt: UPDATED_AT } });
  }

  /** Makes the database refuse the promotion audit, as a failing audit write would. */
  async function withFailingPromotionAudit(action: () => Promise<void>): Promise<void> {
    await db.$executeRawUnsafe(`CREATE FUNCTION refuse_promotion_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'promotion audit refused by test'; END $$`);
    await db.$executeRawUnsafe(`CREATE TRIGGER refuse_promotion_audit BEFORE INSERT ON "audit_logs" FOR EACH ROW WHEN (NEW."action" = 'ADMIN_BOOTSTRAP_PROMOTE') EXECUTE FUNCTION refuse_promotion_audit()`);
    try {
      await action();
    } finally {
      await db.$executeRawUnsafe(`DROP TRIGGER refuse_promotion_audit ON "audit_logs"`);
      await db.$executeRawUnsafe(`DROP FUNCTION refuse_promotion_audit()`);
    }
  }

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").withUsername("auto_tm").withPassword("auto_tm_test").withDatabase("promote_admin_test").start();
    databaseUrl = container.getConnectionUri();
    await run(`${packageDir}node_modules/.bin/prisma`, ["migrate", "deploy"], { cwd: packageDir, env: { ...process.env, DATABASE_URL: databaseUrl } });
    pool = new Pool({ connectionString: databaseUrl });
    waitForClientEnds = trackPoolClientEnds(pool);
    db = new PrismaClient({ adapter: new PrismaPg(pool) });
  });

  afterAll(async () => {
    await db?.$disconnect();
    await pool?.end();
    await waitForClientEnds?.();
    await container?.stop();
  });

  beforeEach(async () => {
    await db.auditLog.deleteMany();
    await db.otpRequest.deleteMany();
    await db.session.deleteMany();
    await db.staffGrant.deleteMany();
    await db.user.deleteMany();
  });

  describe("existing phone selection", () => {
    it("promotes the verified phone holder and records the exact contact-free audit", async () => {
      const user = await db.user.create({ data: { phone: PHONE, phoneVerifiedAt: VERIFIED_AT, role: "buyer" } });
      const bystander = await emailUser("bystander@example.test");

      const result = await promote("--phone", PHONE, "--reason", `  ${REASON}  `);

      expect(result.code).toBe(0);
      expect(result.output).toContain(user.id);
      expect(await db.user.findUniqueOrThrow({ where: { id: user.id } })).toMatchObject({ role: "admin" });
      expect(await db.user.findUniqueOrThrow({ where: { id: bystander.id } })).toMatchObject({ role: "buyer" });
      const audits = await db.auditLog.findMany();
      expect(audits).toHaveLength(1);
      expect(must(audits[0])).toMatchObject({ actorId: null, action: "ADMIN_BOOTSTRAP_PROMOTE", targetType: "user", targetId: user.id });
      expect(must(audits[0]).details).toEqual({ reason: REASON, before: { role: "buyer" }, after: { role: "admin" } });
      expect(JSON.stringify(must(audits[0]).details)).not.toContain(PHONE);
    });

    it("refuses a missing or malformed phone, and keeps dry-run and already-admin write-free", async () => {
      const admin = await db.user.create({ data: { phone: "+99371234567", phoneVerifiedAt: VERIFIED_AT, role: "admin", updatedAt: UPDATED_AT } });
      const buyer = await db.user.create({ data: { phone: PHONE, phoneVerifiedAt: VERIFIED_AT, role: "buyer", updatedAt: UPDATED_AT } });
      const before = await snapshot();

      expect((await promote("--phone", "+99365000000", "--reason", REASON)).code).toBe(1);
      expect((await promote("--phone", "61234567", "--reason", REASON)).code).toBe(1);
      const noOp = await promote("--phone", "+99371234567", "--reason", REASON);
      expect(noOp.code).toBe(0);
      expect(noOp.output).toContain(admin.id);
      const dryRun = await promote("--phone", PHONE, "--reason", REASON, "--dry-run");
      expect(dryRun.code).toBe(0);
      expect(dryRun.output).toContain(buyer.id);

      expect(await snapshot()).toEqual(before);
    });
  });

  describe("selector contract", () => {
    it("requires exactly one of --phone and --email and writes nothing otherwise", async () => {
      await db.user.create({ data: { phone: PHONE, phoneVerifiedAt: VERIFIED_AT, role: "buyer", updatedAt: UPDATED_AT } });
      await emailUser(COORDINATOR_EMAIL);
      const before = await snapshot();

      expect((await promote("--phone", PHONE, "--email", COORDINATOR_EMAIL, "--reason", REASON)).code).not.toBe(0);
      expect((await promote("--email", COORDINATOR_EMAIL, "--phone", PHONE, "--reason", REASON)).code).not.toBe(0);
      expect((await promote("--reason", REASON)).code).not.toBe(0);

      expect(await snapshot()).toEqual(before);
    });
  });

  describe("verified email selection", () => {
    it("promotes the existing holder of the canonical address without creating Users, Sessions, TOTP or tokens", async () => {
      const coordinator = await emailUser(COORDINATOR_EMAIL);
      const bystander = await emailUser("bystander@example.test", "seller");
      await db.user.create({ data: { phone: PHONE, phoneVerifiedAt: VERIFIED_AT, role: "buyer", updatedAt: UPDATED_AT } });
      await db.staffGrant.create({ data: { userId: coordinator.id, capability: "staff.manage" } });
      await db.session.create({ data: { userId: coordinator.id, refreshTokenHash: "fixture-hash:coordinator", expiresAt: FUTURE } });
      const before = await snapshot();

      const result = await promote("--email", "  Coordinator@Campaign.Example.TEST ", "--reason", REASON);

      expect(result.code).toBe(0);
      expect(result.output).toContain(coordinator.id);
      const after = await snapshot();
      expect(after.users).toEqual(before.users.map((user) => (user.id === coordinator.id ? { ...user, role: "admin", updatedAt: expect.any(Date) as Date } : user)));
      expect(after.users.find((user) => user.id === bystander.id)).toMatchObject({ role: "seller" });
      // Ordinary sign-in and TOTP remain the only path to a Session and elevation.
      expect(after.sessions).toEqual(before.sessions);
      expect(after.sessions.every((session) => session.adminTotpExpiresAt === null)).toBe(true);
      expect(after).toMatchObject({ otpRequests: before.otpRequests, totpEnrollments: 0, totpBackupCodes: 0, staffGrants: before.staffGrants });
      expect(after.audits).toHaveLength(1);
      const audit = must(after.audits[0]);
      expect(audit).toMatchObject({ actorId: null, action: "ADMIN_BOOTSTRAP_PROMOTE", targetType: "user", targetId: coordinator.id });
      expect(audit.details).toEqual({ reason: REASON, before: { role: "buyer" }, after: { role: "admin" } });
      expect(JSON.stringify(audit.details).toLowerCase()).not.toContain("coordinator@");
    });

    it("dry-run identifies the verified holder and writes nothing", async () => {
      const coordinator = await emailUser(COORDINATOR_EMAIL);
      const before = await snapshot();

      const result = await promote("--email", COORDINATOR_EMAIL, "--reason", REASON, "--dry-run");

      expect(result.code).toBe(0);
      expect(result.output).toContain(coordinator.id);
      expect(await snapshot()).toEqual(before);
    });

    it("an already-admin holder is a successful no-op without audit", async () => {
      const admin = await emailUser(COORDINATOR_EMAIL, "admin");
      const before = await snapshot();

      const result = await promote("--email", COORDINATOR_EMAIL, "--reason", REASON);

      expect(result.code).toBe(0);
      expect(result.output).toContain(admin.id);
      expect(await snapshot()).toEqual(before);
    });

    it("refuses an address held by no User, including one only awaiting a sign-in code, and creates no User", async () => {
      await emailUser("bystander@example.test");
      await db.otpRequest.create({ data: { purpose: "sign_in", channel: "email", destination: "pending@example.test", codeHash: "fixture-code-hash", expiresAt: FUTURE, ip: "127.0.0.1" } });
      const before = await snapshot();

      expect((await promote("--email", "pending@example.test", "--reason", REASON)).code).toBe(1);
      expect((await promote("--email", "absent@example.test", "--reason", REASON)).code).toBe(1);
      expect((await promote("--email", "not-an-address", "--reason", REASON)).code).toBe(1);

      expect(await snapshot()).toEqual(before);
    });

    it("refuses an address whose canonical form is held by more than one User", async () => {
      // The unique index is case-sensitive, so a legacy non-canonical row can collide canonically.
      await emailUser("shared@example.test");
      await emailUser("Shared@Example.Test");
      const before = await snapshot();

      expect((await promote("--email", "shared@example.test", "--reason", REASON)).code).toBe(1);
      expect((await promote("--email", "Shared@Example.Test", "--reason", REASON)).code).toBe(1);

      expect(await snapshot()).toEqual(before);
    });
  });

  describe("role and audit atomicity", () => {
    it("a refused audit leaves the phone-selected User's role unchanged", async () => {
      await db.user.create({ data: { phone: PHONE, phoneVerifiedAt: VERIFIED_AT, role: "buyer", updatedAt: UPDATED_AT } });
      const before = await snapshot();

      await withFailingPromotionAudit(async () => {
        expect((await promote("--phone", PHONE, "--reason", REASON)).code).toBe(1);
      });

      expect(await snapshot()).toEqual(before);
    });

    it("a refused audit leaves the email-selected User's role unchanged", async () => {
      await emailUser(COORDINATOR_EMAIL);
      const before = await snapshot();

      await withFailingPromotionAudit(async () => {
        expect((await promote("--email", COORDINATOR_EMAIL, "--reason", REASON)).code).toBe(1);
      });

      expect(await snapshot()).toEqual(before);
    });
  });
});
