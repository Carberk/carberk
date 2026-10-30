import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { PrismaPg } from "@prisma/adapter-pg";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

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
    await sourceGuards(true);
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

  async function captureDormantFixture() {
    guardSnapshot = (await pool.query<{ table: string; name: string; mode: string }>(`SELECT c.relname AS table,t.tgname AS name,t.tgenabled AS mode
      FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND NOT t.tgisinternal ORDER BY c.relname,t.tgname`)).rows;
    // Facts are ordinary preactivation setup; behavior runs with every finite guard enabled.
    await sourceGuards(false);
  }
  let guardSnapshot: { table: string; name: string; mode: string }[] = [];
  async function sourceGuards(enabled: boolean) {
    const rows = await pool.query<{ table: string; name: string }>(`SELECT c.relname AS table,t.tgname AS name
      FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND (t.tgname LIKE 'zz_diagnostic_source_%' OR t.tgname LIKE 'zzzz_campaign_preparation%' OR t.tgname='diagnostic_source_no_truncate')
      ORDER BY c.relname,t.tgname`);
    for (const row of rows.rows) await pool.query(`ALTER TABLE public."${row.table}" ${enabled ? "ENABLE" : "DISABLE"} TRIGGER "${row.name}"`);
    if (enabled) expect((await pool.query("SELECT diagnostic_source_guards_ready() ready")).rows).toEqual([{ ready: true }]);
  }
  afterEach(async () => {
    if (!pool) return;
    expect((await pool.query("SELECT count(*)::int count FROM diagnostic_source_commands")).rows).toEqual([{ count: 0 }]);
    for (const row of guardSnapshot) {
      const mode = ({ O: "ENABLE", D: "DISABLE", R: "ENABLE REPLICA", A: "ENABLE ALWAYS" } as Record<string, string>)[row.mode];
      if (!mode) throw new Error("Unknown fixture trigger mode");
      await pool.query(`ALTER TABLE public."${row.table}" ${mode} TRIGGER "${row.name}"`);
    }
    expect((await pool.query(`SELECT c.relname AS table,t.tgname AS name,t.tgenabled AS mode
      FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND NOT t.tgisinternal ORDER BY c.relname,t.tgname`)).rows).toEqual(guardSnapshot);
  });

  beforeAll(async () => {
    const supplied = process.env["R7G_PROMOTION_DATABASE_URL"];
    if (supplied) {
      const address = new URL(supplied);
      if (address.hostname !== "127.0.0.1" || ["5432", "6379", "9000"].includes(address.port) || !address.pathname.startsWith("/candidatea_r7g_")) throw new Error("Isolated R7g database required");
      databaseUrl = supplied;
    } else {
      container = await new PostgreSqlContainer("postgres:16-alpine").withUsername("auto_tm").withPassword("auto_tm_test").withDatabase("promote_admin_test").start();
      databaseUrl = container.getConnectionUri();
    }
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
    await captureDormantFixture();
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

  async function promotionRace(first: "phone" | "email") {
    const user = await db.user.create({ data: {
      phone: PHONE, phoneVerifiedAt: VERIFIED_AT,
      email: COORDINATOR_EMAIL, emailVerifiedAt: VERIFIED_AT,
      role: "buyer", updatedAt: UPDATED_AT,
    } });
    await db.session.create({ data: { userId: user.id, refreshTokenHash: "fixture-hash:race", expiresAt: FUTURE } });
    await db.staffGrant.create({ data: { userId: user.id, capability: "staff.manage" } });
    const before = await snapshot();
    // Full rows also catch credential changes that the shared summary would omit.
    const authState = () => Promise.all([
      "sessions", "otp_requests", "totp_enrollments", "totp_backup_codes", "staff_grants",
    ].map(async (table) => (await pool.query<{ state: unknown }>(
      `SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text), '[]'::jsonb) AS state FROM "${table}" t`,
    )).rows[0]?.state));
    const authBefore = await authState();
    await sourceGuards(true);
    const names = ["promote-race-phone", "promote-race-email"];
    const commands: { child: ReturnType<typeof execFile>; result: Promise<{ code: number | null; output: string }> }[] = [];
    function startCommand(name: string, ...args: string[]) {
      const url = new URL(databaseUrl);
      url.searchParams.set("application_name", name);
      let child: ReturnType<typeof execFile> | undefined;
      const result = new Promise<{ code: number | null; output: string }>((resolve) => {
        // Load the actual command through tsx in one Node process, so failure
        // cleanup owns the process rather than leaving a tsx CLI descendant.
        child = execFile(process.execPath, ["--import", "tsx", "scripts/promote-admin.ts", ...args], {
          cwd: packageDir, env: { ...process.env, DATABASE_URL: url.toString() },
        }, (error, stdout, stderr) => resolve({
          code: error ? (typeof error.code === "number" ? error.code : null) : 0,
          output: `${stdout}${stderr}`,
        }));
      });
      const command = { child: must(child), result };
      commands.push(command);
      return result;
    }

    // These are bounded observations of actual PostgreSQL blockers, not elapsed-time
    // ordering. Three seconds leaves the command's existing transaction limit intact.
    async function blockedBackend(name: string, blocker: number): Promise<number> {
      const deadline = performance.now() + 3000;
      while (performance.now() < deadline) {
        const { rows } = await pool.query<{ pid: number }>(`
          SELECT pid FROM pg_stat_activity
          WHERE datname = current_database() AND application_name = $1
            AND state = 'active' AND wait_event_type = 'Lock'
            AND $2 = ANY(pg_blocking_pids(pid))`, [name, blocker]);
        if (rows[0]) return rows[0].pid;
        // Fresh autocommit queries avoid cached activity snapshots and yield to PostgreSQL.
      }
      throw new Error(`${name} did not wait on backend ${blocker}`);
    }

    const barrier = await pool.connect();
    try {
      await barrier.query("BEGIN");
      const holderPid = must((await barrier.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")).rows[0]).pid;
      await barrier.query("SELECT pg_advisory_xact_lock(901, 904)");
      await pool.query(`CREATE FUNCTION pause_promotion_race() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN PERFORM pg_advisory_xact_lock(901, 904); RETURN NEW; END $$`);
      await pool.query(`CREATE TRIGGER pause_promotion_race BEFORE UPDATE OF "role" ON "users"
        FOR EACH ROW WHEN (OLD."role" = 'buyer' AND NEW."role" = 'admin')
        EXECUTE FUNCTION pause_promotion_race()`);

      const phone = startCommand(must(names[0]), first === "phone" ? "--phone" : "--email", first === "phone" ? PHONE : COORDINATOR_EMAIL, "--reason", REASON);
      // The BEFORE UPDATE trigger is reached with the first command holding the User lock.
      const phonePid = await blockedBackend(must(names[0]), holderPid);
      const email = startCommand(must(names[1]), first === "phone" ? "--email" : "--phone", first === "phone" ? COORDINATOR_EMAIL : PHONE, "--reason", REASON);
      await blockedBackend(must(names[1]), phonePid);
      // Reconfirm the first command is still held at the storage barrier before release.
      expect(await blockedBackend(must(names[0]), holderPid)).toBe(phonePid);
      await barrier.query("ROLLBACK");

      const results = await Promise.all([phone, email]);
      expect(results.map((result) => result.code)).toEqual([0, 0]);
      for (const result of results) expect(result.output).toContain(user.id);
      const after = await snapshot();
      expect(after.users).toEqual([{ ...must(before.users[0]), role: "admin", updatedAt: expect.any(Date) as Date }]);
      expect(after.audits).toHaveLength(1);
      const audit = must(after.audits[0]);
      expect(audit).toMatchObject({ actorId: null, action: "ADMIN_BOOTSTRAP_PROMOTE", targetType: "user", targetId: user.id });
      expect(audit.details).toEqual({ reason: REASON, before: { role: "buyer" }, after: { role: "admin" } });
      expect(await authState()).toEqual(authBefore);
    } finally {
      // Always release the barrier, including failed setup/observation/assertions.
      try { await barrier.query("ROLLBACK"); }
      finally {
        barrier.release(true);
        try {
          // On a failure, terminate only these test command backends and children;
          // this releases their row locks before DDL cleanup and settles both callbacks.
          try {
            await pool.query(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity
              WHERE datname = current_database() AND application_name = ANY($1::text[])`, [names]);
          } finally {
            for (const { child } of commands) {
              if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
            }
            await Promise.allSettled(commands.map((command) => command.result));
          }
        } finally {
          try { await pool.query('DROP TRIGGER IF EXISTS pause_promotion_race ON "users"'); }
          finally { await pool.query("DROP FUNCTION IF EXISTS pause_promotion_race()"); }
        }
      }
    }
  }
  it("serializes real phone and email promotions of the same buyer with one original-role receipt", () => promotionRace("phone"));
  it("serializes the opposite email-first promotion order with one original-role receipt", () => promotionRace("email"));
  it.each(["promotion", "creation"] as const)("canonical email %s first excludes a concurrent ambiguous holder before promotion effects", async first => {
    const user = await emailUser(COORDINATOR_EMAIL);
    const before = await snapshot();
    await sourceGuards(true);
    const barrier = await pool.connect();
    const name = `r7g-canonical-${first}`;
    const url = new URL(databaseUrl); url.searchParams.set("application_name", name);
    let child: ReturnType<typeof execFile> | undefined;
    let result: Promise<{ code: number | null; output: string }> | undefined;
    const start = () => {
      result = new Promise(resolve => {
        child = execFile(process.execPath, ["--import", "tsx", "scripts/promote-admin.ts", "--email", COORDINATOR_EMAIL, "--reason", REASON],
          { cwd: packageDir, env: { ...process.env, DATABASE_URL: url.toString() } },
          (error, stdout, stderr) => resolve({ code: error ? typeof error.code === "number" ? error.code : null : 0, output: stdout + stderr }));
      });
      return result;
    };
    const blocked = async (pid: number) => {
      const deadline = performance.now() + 3000;
      while (performance.now() < deadline) {
        const rows = (await pool.query(`SELECT pid FROM pg_stat_activity WHERE datname=current_database()
          AND application_name=$1 AND state='active' AND $2=ANY(pg_blocking_pids(pid))`, [name, pid])).rows;
        if (rows.length === 1) return;
      }
      throw new Error("Canonical race did not reach its actual PostgreSQL blocker");
    };
    let pauseInstalled = false;
    try {
      await barrier.query("BEGIN");
      const pid = must((await barrier.query<{ pid: number }>("SELECT pg_backend_pid() pid")).rows[0]).pid;
      if (first === "promotion") {
        await barrier.query("SELECT pg_advisory_xact_lock(901,905)");
        await pool.query(`CREATE FUNCTION r7g_canonical_pause() RETURNS trigger LANGUAGE plpgsql AS $$
          BEGIN PERFORM pg_advisory_xact_lock(901,905); RETURN NEW; END $$`);
        await pool.query(`CREATE TRIGGER r7g_canonical_pause BEFORE UPDATE OF role ON users
          FOR EACH ROW EXECUTE FUNCTION r7g_canonical_pause()`);
        pauseInstalled = true;
        const pending = start(); await blocked(pid);
        await expect(pool.query('INSERT INTO users(id,email,"emailVerifiedAt","updatedAt") VALUES($1,$2,$3,$3)',
          [randomUUID(), COORDINATOR_EMAIL.toUpperCase(), VERIFIED_AT]))
          .rejects.toMatchObject({ code: "40001", message: "diagnostic_source_user_insert_busy" });
        await barrier.query("ROLLBACK");
        expect((await pending).code).toBe(0);
        expect(await db.user.count()).toBe(1);
        expect(await db.auditLog.count()).toBe(1);
        expect(await db.user.findUniqueOrThrow({ where: { id: user.id } })).toMatchObject({ role: "admin" });
      } else {
        const inserted = randomUUID();
        await barrier.query('INSERT INTO users(id,email,"emailVerifiedAt","updatedAt") VALUES($1,$2,$3,$3)',
          [inserted, COORDINATOR_EMAIL.toUpperCase(), VERIFIED_AT]);
        const pending = start(); await blocked(pid);
        await barrier.query("COMMIT");
        expect((await pending).code).toBe(1);
        expect(await db.auditLog.findMany()).toEqual(before.audits);
        expect(await db.user.findUniqueOrThrow({ where: { id: user.id } })).toMatchObject({ role: "buyer", updatedAt: UPDATED_AT });
        expect(await db.user.findUniqueOrThrow({ where: { id: inserted } })).toMatchObject({ email: COORDINATOR_EMAIL.toUpperCase(), role: "buyer" });
      }
      expect((await snapshot()).sessions).toEqual(before.sessions);
      expect((await snapshot()).staffGrants).toEqual(before.staffGrants);
    } finally {
      await barrier.query("ROLLBACK"); barrier.release(true);
      try {
        await pool.query("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=current_database() AND application_name=$1", [name]);
      } finally {
        if (child && child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
        if (result) await result;
        if (pauseInstalled) {
          await pool.query("DROP TRIGGER r7g_canonical_pause ON users");
          await pool.query("DROP FUNCTION r7g_canonical_pause()");
        }
      }
    }
  });

});
