import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { PrismaPg } from "@prisma/adapter-pg";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { PrismaClient } from "../generated/prisma/client/client";
import { trackPoolClientEnds } from "../tests/helpers/track-pool-client-ends";

// The operator command `pnpm --filter @auto-tm/db diagnostics:bootstrap-synthetic` as an operator runs it:
// the checked-in script in a child process against a disposable migrated PostgreSQL. It replaces the
// full-v3 reservation center bootstrap for clean acceptance (#901 Q3,
// docs/evidence/issue-901/prelaunch-reset-first-executable-slice-20261021.md §4). It never creates a
// User, Session, TOTP, elevation, staff grant, operational approval or template publication.

const run = promisify(execFile);
const packageDir = fileURLToPath(new URL("..", import.meta.url));

const COMMAND = "diagnostics:bootstrap-synthetic";
const CODE = "synthetic-acceptance";
const SYNTHETIC_NAMES = { en: "Carberk synthetic diagnostics", ru: "Carberk synthetic diagnostics", tk: "Carberk synthetic diagnostics" };
const TWO_HOURS = 2 * 60 * 60 * 1000;
const VERIFIED_AT = new Date("2026-10-01T00:00:00.000Z");
const UPDATED_AT = new Date("2026-10-02T00:00:00.000Z");
const FUTURE = new Date("2026-12-01T00:00:00.000Z");
const PAST = new Date("2026-10-01T00:00:00.000Z");
const UNREACHABLE_DATABASE = "postgresql://refused:refused@127.0.0.1:1/refused";

type Env = Record<string, string | undefined>;

function must<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error("Expected a value");
  return value;
}

describe("diagnostics:bootstrap-synthetic command — disposable migrated PostgreSQL", () => {
  let container: StartedPostgreSqlContainer;
  let databaseUrl: string;
  let pool: Pool;
  let waitForClientEnds: (() => Promise<void>) | undefined;
  let db: PrismaClient;

  /** Gate variables are set explicitly per call; `undefined` removes one from the inherited environment. */
  async function bootstrap(overrides: Env, ...args: string[]): Promise<{ code: number; output: string }> {
    const merged: Env = { ...process.env, DATABASE_URL: databaseUrl, APP_ENV: undefined, DIAGNOSTIC_SYNTHETIC_ENABLED: undefined, DIAGNOSTIC_SYNTHETIC_USER_IDS: undefined, ...overrides };
    const env = Object.fromEntries(Object.entries(merged).filter((entry): entry is [string, string] => entry[1] !== undefined));
    try {
      const { stdout, stderr } = await run(`${packageDir}node_modules/.bin/tsx`, ["scripts/bootstrap-synthetic-diagnostic-center.ts", ...args], { cwd: packageDir, env });
      return { code: 0, output: `${stdout}${stderr}` };
    } catch (error) {
      const failed = error as { code?: unknown; stdout?: string; stderr?: string };
      if (typeof failed.code !== "number") throw error;
      return { code: failed.code, output: `${failed.stdout ?? ""}${failed.stderr ?? ""}` };
    }
  }

  const gate = (...allowed: string[]): Env => ({ APP_ENV: "staging", DIAGNOSTIC_SYNTHETIC_ENABLED: "true", DIAGNOSTIC_SYNTHETIC_USER_IDS: JSON.stringify(allowed) });
  const args = (userId: string, capability = "diagnostics.templates", code = CODE) => ["--center-code", code, "--user-id", userId, "--capability", capability];

  function expectRefused(result: { code: number; output: string }, reason: string) {
    expect(result.code, result.output).toBe(1);
    expect(result.output).toContain(`Refused: ${reason}`);
  }

  /** Every table the command may not change, plus the diagnostic tables it owns. */
  async function snapshot() {
    return {
      users: await db.user.findMany({ orderBy: { id: "asc" }, select: { id: true, role: true, phoneVerifiedAt: true, emailVerifiedAt: true, suspendedAt: true, deletionScheduledAt: true, updatedAt: true } }),
      sessions: await db.session.findMany({ orderBy: { id: "asc" }, select: { id: true, userId: true, adminTotpExpiresAt: true } }),
      otpRequests: await db.otpRequest.count(),
      totpEnrollments: await db.totpEnrollment.count(),
      totpBackupCodes: await db.totpBackupCode.count(),
      staffGrants: await db.staffGrant.findMany({ orderBy: [{ userId: "asc" }, { capability: "asc" }] }),
      auditLogs: await db.auditLog.findMany({ orderBy: { id: "asc" } }),
      templates: await db.diagnosticTemplateVersion.count(),
      orders: await db.inspectionOrder.count(),
      centers: await db.diagnosticCenter.findMany({ orderBy: { id: "asc" } }),
      assignments: await db.diagnosticCenterAssignment.findMany({ orderBy: { id: "asc" } }),
      diagnosticAudits: await db.diagnosticAudit.findMany({ orderBy: { id: "asc" } }),
    };
  }

  /** An active verified ordinary User holding the named active staff grants. */
  async function staffUser(capabilities: string[] = ["diagnostics.templates"], data: Partial<{ emailVerifiedAt: Date | null; suspendedAt: Date; deletionScheduledAt: Date }> = {}) {
    const user = await db.user.create({ data: { email: `${randomUUID()}@synthetic.example.test`, emailVerifiedAt: VERIFIED_AT, role: "buyer", updatedAt: UPDATED_AT, ...data } });
    for (const capability of capabilities) await db.staffGrant.create({ data: { userId: user.id, capability } });
    return user.id;
  }

  async function databaseNow(): Promise<Date> {
    const rows = await db.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS now`;
    return must(rows[0]).now;
  }

  async function approvalIsSqlNull(code: string): Promise<boolean> {
    const rows = await db.$queryRaw<{ isNull: boolean }[]>`SELECT "operationalApproval" IS NULL AS "isNull" FROM diagnostic_centers WHERE code = ${code}`;
    return must(rows[0]).isNull;
  }

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").withUsername("auto_tm").withPassword("auto_tm_test").withDatabase("synthetic_center_test").start();
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
    await db.diagnosticAudit.deleteMany();
    await db.diagnosticCenterAssignment.deleteMany();
    await db.diagnosticCenter.deleteMany();
    await db.session.deleteMany();
    await db.staffGrant.deleteMany();
    await db.user.deleteMany();
    // Another real, approved center and its qualified staff member must survive every run untouched.
    const userId = await staffUser(["diagnostics.templates", "diagnostics.reception"]);
    await db.session.create({ data: { userId, refreshTokenHash: "fixture-hash:bystander", expiresAt: FUTURE } });
    const center = await db.diagnosticCenter.create({ data: { code: "ashgabat", names: { en: "Ashgabat", ru: "Ашхабад", tk: "Aşgabat" }, operationalApproval: { approvedAt: "2026-10-01" } } });
    await db.diagnosticCenterAssignment.create({ data: { centerId: center.id, userId, capability: "diagnostics.templates", qualifiedUntil: FUTURE } });
    await db.diagnosticAudit.create({ data: { centerId: center.id, actorId: userId, action: "CENTER_FIXTURE", details: {} } });
  });

  describe("allowlisted staging/test bootstrap", () => {
    it("creates one unapproved synthetic center and the exact capability qualification with a PostgreSQL two-hour deadline and actorless audits", async () => {
      const userId = await staffUser(["diagnostics.templates", "diagnostics.reception"]);
      const before = await snapshot();
      const startedAt = await databaseNow();

      const result = await bootstrap(gate(userId), ...args(userId));

      const finishedAt = await databaseNow();
      expect(result.code, result.output).toBe(0);
      const after = await snapshot();
      const center = await db.diagnosticCenter.findUniqueOrThrow({ where: { code: CODE } });
      expect(center).toMatchObject({ planCode: "standard", names: SYNTHETIC_NAMES });
      expect(await approvalIsSqlNull(CODE)).toBe(true);
      const created = after.assignments.filter((row) => row.centerId === center.id);
      expect(created).toHaveLength(1);
      expect(created[0]).toMatchObject({ userId, capability: "diagnostics.templates", revokedAt: null });
      const qualification = must(created[0]);
      const deadline = must(qualification.qualifiedUntil).getTime();
      expect(deadline).toBeGreaterThanOrEqual(startedAt.getTime() - 1 + TWO_HOURS);
      expect(deadline).toBeLessThanOrEqual(finishedAt.getTime() + 1 + TWO_HOURS);
      expect(deadline - qualification.assignedAt.getTime()).toBeLessThanOrEqual(TWO_HOURS);
      const audits = after.diagnosticAudits.filter((row) => row.centerId === center.id).map(({ actorId, orderId, action, details }) => ({ actorId, orderId, action, details }));
      expect(audits).toHaveLength(2);
      expect(audits).toEqual(expect.arrayContaining([
        { actorId: null, orderId: null, action: "CENTER_SYNTHETIC_BOOTSTRAPPED", details: { command: COMMAND } },
        { actorId: null, orderId: null, action: "CENTER_QUALIFICATION_SYNTHETIC", details: { command: COMMAND, capability: "diagnostics.templates", userId } },
      ]));
      // No identity, credential, grant, approval, template or other-center change.
      const { centers, assignments, diagnosticAudits, ...unchanged } = after;
      const { centers: centersBefore, assignments: assignmentsBefore, diagnosticAudits: auditsBefore, ...unchangedBefore } = before;
      expect(unchanged).toEqual(unchangedBefore);
      expect(centers.filter((row) => row.id !== center.id)).toEqual(centersBefore);
      expect(assignments.filter((row) => row.centerId !== center.id)).toEqual(assignmentsBefore);
      expect(diagnosticAudits.filter((row) => row.centerId !== center.id)).toEqual(auditsBefore);
    });

    it("dry-run reports the planned center and qualification and writes nothing", async () => {
      const userId = await staffUser();
      const before = await snapshot();

      const result = await bootstrap(gate(userId), ...args(userId), "--dry-run");

      expect(result.code, result.output).toBe(0);
      expect(result.output).toContain("Dry run");
      expect(await snapshot()).toEqual(before);
    });

    it("a repeat is a no-op that keeps the issued deadline, and another capability reuses the same center", async () => {
      const userId = await staffUser(["diagnostics.templates", "diagnostics.reception"]);
      expect((await bootstrap(gate(userId), ...args(userId))).code).toBe(0);
      const first = await snapshot();

      const repeat = await bootstrap(gate(userId), ...args(userId));
      expect(repeat.code, repeat.output).toBe(0);
      expect(repeat.output).toContain("no change");
      expect(await snapshot()).toEqual(first);

      const dryRun = await bootstrap(gate(userId), ...args(userId, "diagnostics.reception"), "--dry-run");
      expect(dryRun.code, dryRun.output).toBe(0);
      expect(await snapshot()).toEqual(first);

      const second = await bootstrap(gate(userId), ...args(userId, "diagnostics.reception"));
      expect(second.code, second.output).toBe(0);
      const after = await snapshot();
      expect(after.centers).toEqual(first.centers);
      const center = await db.diagnosticCenter.findUniqueOrThrow({ where: { code: CODE } });
      const templates = after.assignments.find((row) => row.centerId === center.id && row.capability === "diagnostics.templates");
      expect(templates).toEqual(first.assignments.find((row) => row.centerId === center.id && row.capability === "diagnostics.templates"));
      expect(after.assignments.filter((row) => row.centerId === center.id)).toHaveLength(2);
      expect(after.diagnosticAudits.filter((row) => row.centerId === center.id).map((row) => row.action).sort()).toEqual(["CENTER_QUALIFICATION_SYNTHETIC", "CENTER_QUALIFICATION_SYNTHETIC", "CENTER_SYNTHETIC_BOOTSTRAPPED"]);
    });

    it("two concurrent runs leave exactly one center, one qualification and one audit per change", async () => {
      const userId = await staffUser();

      const results = await Promise.all([bootstrap(gate(userId), ...args(userId)), bootstrap(gate(userId), ...args(userId))]);

      expect(results.map((result) => result.code), results.map((result) => result.output).join("\n")).toEqual([0, 0]);
      const center = await db.diagnosticCenter.findUniqueOrThrow({ where: { code: CODE } });
      expect(await db.diagnosticCenterAssignment.count({ where: { centerId: center.id } })).toBe(1);
      expect(await db.diagnosticAudit.count({ where: { centerId: center.id } })).toBe(2);
    });
  });

  describe("refusals write nothing and leave authentication and other centers untouched", () => {
    it("refuses outside staging/test before reading the database", async () => {
      const userId = await staffUser();
      const before = await snapshot();

      for (const appEnv of ["production", "development", undefined]) {
        expectRefused(await bootstrap({ ...gate(userId), APP_ENV: appEnv }, ...args(userId)), "environment");
      }
      expectRefused(await bootstrap({ ...gate(userId), APP_ENV: "production", DATABASE_URL: UNREACHABLE_DATABASE }, ...args(userId)), "environment");
      expect(await snapshot()).toEqual(before);
    });

    it("refuses an absent, false or malformed enablement flag", async () => {
      const userId = await staffUser();
      const before = await snapshot();

      for (const flag of [undefined, "false", "TRUE", "1", ""]) {
        expectRefused(await bootstrap({ ...gate(userId), DIAGNOSTIC_SYNTHETIC_ENABLED: flag }, ...args(userId)), "disabled");
      }
      expect(await snapshot()).toEqual(before);
    });

    it("refuses an absent or malformed allowlist and a User outside it", async () => {
      const userId = await staffUser();
      const other = await staffUser();
      const before = await snapshot();

      const lists = [undefined, "", "not-json", JSON.stringify({ id: userId }), JSON.stringify(["not-a-uuid", userId]), JSON.stringify([...Array.from({ length: 100 }, () => randomUUID()), userId]), JSON.stringify([other]), JSON.stringify([userId.toUpperCase()])];
      for (const list of lists) {
        expectRefused(await bootstrap({ ...gate(userId), DIAGNOSTIC_SYNTHETIC_USER_IDS: list }, ...args(userId)), "allowlist");
      }
      expect(await snapshot()).toEqual(before);
    });

    it("refuses a missing, unverified, suspended or deletion-scheduled allowlisted User", async () => {
      const users = [
        randomUUID(),
        await staffUser(["diagnostics.templates"], { emailVerifiedAt: null }),
        await staffUser(["diagnostics.templates"], { suspendedAt: VERIFIED_AT }),
        await staffUser(["diagnostics.templates"], { deletionScheduledAt: VERIFIED_AT }),
      ];
      const before = await snapshot();

      for (const userId of users) expectRefused(await bootstrap(gate(...users), ...args(userId)), "user");
      expect(await snapshot()).toEqual(before);
    });

    it("refuses without the matching active staff grant and never creates one", async () => {
      const absent = await staffUser(["diagnostics.reception"]);
      const revoked = await staffUser(["diagnostics.templates"]);
      await db.staffGrant.update({ where: { userId_capability: { userId: revoked, capability: "diagnostics.templates" } }, data: { revokedAt: VERIFIED_AT } });
      const before = await snapshot();

      for (const userId of [absent, revoked]) expectRefused(await bootstrap(gate(absent, revoked), ...args(userId)), "grant");
      expect(await snapshot()).toEqual(before);
    });

    it("refuses a capability outside the diagnostics set and a non-synthetic center code", async () => {
      const userId = await staffUser(["diagnostics.templates", "staff.manage"]);
      const before = await snapshot();

      for (const capability of ["staff.manage", "founder.control", "diagnostics.admin"]) {
        expectRefused(await bootstrap(gate(userId), ...args(userId, capability)), "capability");
      }
      for (const code of ["ashgabat", "Synthetic-acceptance", "synthetic-", "synthetic-a b", `synthetic-${"a".repeat(64)}`]) {
        expectRefused(await bootstrap(gate(userId), ...args(userId, "diagnostics.templates", code)), "center-code");
      }
      expect(await snapshot()).toEqual(before);
    });

    it("refuses to adopt an approved or foreign center under the synthetic code", async () => {
      const userId = await staffUser();
      await db.diagnosticCenter.create({ data: { code: CODE, names: SYNTHETIC_NAMES, operationalApproval: { approvedAt: "2026-10-01" } } });
      await db.diagnosticCenter.create({ data: { code: "synthetic-foreign-names", names: { en: "Real", ru: "Real", tk: "Real" } } });
      // Synthetic shape, but not created by this command: no CENTER_SYNTHETIC_BOOTSTRAPPED audit.
      await db.diagnosticCenter.create({ data: { code: "synthetic-unaudited", names: SYNTHETIC_NAMES } });
      const before = await snapshot();

      expectRefused(await bootstrap(gate(userId), ...args(userId)), "center-approved");
      expectRefused(await bootstrap(gate(userId), ...args(userId, "diagnostics.templates", "synthetic-foreign-names")), "center-conflict");
      expectRefused(await bootstrap(gate(userId), ...args(userId, "diagnostics.templates", "synthetic-unaudited")), "center-conflict");
      expect(await snapshot()).toEqual(before);
    });

    it("never revives a revoked or expired qualification, extends a deadline or adopts an unaudited assignment", async () => {
      const revoked = await staffUser();
      const expired = await staffUser();
      const unaudited = await staffUser();
      // As an earlier run of this command would have left them, then revoked or expired.
      const center = await db.diagnosticCenter.create({ data: { code: CODE, names: SYNTHETIC_NAMES } });
      await db.diagnosticAudit.create({ data: { centerId: center.id, action: "CENTER_SYNTHETIC_BOOTSTRAPPED", details: { command: COMMAND } } });
      for (const [userId, row] of [[revoked, { qualifiedUntil: FUTURE, revokedAt: VERIFIED_AT }], [expired, { qualifiedUntil: PAST }]] as const) {
        await db.diagnosticCenterAssignment.create({ data: { centerId: center.id, userId, capability: "diagnostics.templates", ...row } });
        await db.diagnosticAudit.create({ data: { centerId: center.id, action: "CENTER_QUALIFICATION_SYNTHETIC", details: { command: COMMAND, capability: "diagnostics.templates", userId } } });
      }
      await db.diagnosticCenterAssignment.create({ data: { centerId: center.id, userId: unaudited, capability: "diagnostics.templates", qualifiedUntil: new Date(Date.now() + 60_000) } });
      const everyone = gate(revoked, expired, unaudited);
      const before = await snapshot();

      expectRefused(await bootstrap(everyone, ...args(revoked)), "qualification-revoked");
      expectRefused(await bootstrap(everyone, ...args(expired)), "qualification-expired");
      expectRefused(await bootstrap(everyone, ...args(unaudited)), "assignment-conflict");
      expect(await snapshot()).toEqual(before);
    });

    it("refuses a missing or extra argument", async () => {
      const userId = await staffUser();
      const before = await snapshot();

      expectRefused(await bootstrap(gate(userId), "--user-id", userId, "--capability", "diagnostics.templates"), "arguments");
      expectRefused(await bootstrap(gate(userId), ...args(userId), "--reason", "extra"), "arguments");
      expectRefused(await bootstrap(gate(userId), ...args(userId), "positional"), "arguments");
      expect(await snapshot()).toEqual(before);
    });
  });
});
