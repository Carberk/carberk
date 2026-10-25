import "reflect-metadata";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { PrismaPg } from "@prisma/adapter-pg";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { PrismaClient, Prisma } from "../generated/prisma/client/client";
import { withDiagnosticSourceCommand, type DiagnosticSourceTuple } from "../src/diagnostic-source-command";
import { trackPoolClientEnds } from "../tests/helpers/track-pool-client-ends";

import { bootstrapStaff, runSyntheticCenterBootstrap, type CenterBootstrapValues } from "./bootstrap-command";

// AUTHORED ONLY. No imports of other E2E files, no CLI main, no role/trigger bypass.
// The unchanged accepted R2 production revoke adapter is dynamically loaded below.
// Worker purge/User-cascade integration remains separately owned and uncovered.
const run = promisify(execFile);
const packageDir = fileURLToPath(new URL("..", import.meta.url));
const names = { en: "Carberk synthetic diagnostics", ru: "Carberk synthetic diagnostics", tk: "Carberk synthetic diagnostics" };
const capability = "diagnostics.templates";
const command = "diagnostics:bootstrap-synthetic";
type Tx = Prisma.TransactionClient;
type Client = Pick<PrismaClient, "$transaction">;
function must<T>(value: T | undefined | null): T { if (value === undefined || value === null) throw new Error("missing PostgreSQL result"); return value; }
function gate() { let release!: () => void; const promise = new Promise<void>(resolve => { release = resolve; }); return { promise, release }; }
function driverCause(error: unknown): { originalCode?: string; originalMessage?: string } {
  expect(error).toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
  const known = error as Prisma.PrismaClientKnownRequestError;
  expect(known.code).toBe("P2010");
  return (known.meta?.["driverAdapterError"] as { cause: { originalCode?: string; originalMessage?: string } }).cause;
}

describe("bootstrap callers with actual prepared PostgreSQL transactions", () => {
  let container: StartedPostgreSqlContainer, control: Pool, owner: PrismaClient, observer: Pool, appPool: Pool, db: PrismaClient;
  let drainOwner: () => Promise<void>, drainApp: () => Promise<void>;
  let databaseName: string, role: string, password: string, userId: string;
  let values: CenterBootstrapValues;
  let managerId: string, sessionId: string;
  let Staff: new (client: Client) => { change(input: { userId: string; sessionId: string; targetUserId: string; capability: string; reason: string; grant: boolean }, at: Date): Promise<void> };
  const staff = () => ({ targetUserId: userId, capability, reason: "explicit disposable operator fixture" });
  beforeAll(async () => {
    const path = fileURLToPath(new URL("../../../apps/api/src/modules/identity/infrastructure/PrismaStaffAuthority.ts", import.meta.url));
    Staff = (await import(/* @vite-ignore */ path) as { PrismaStaffAuthority: typeof Staff }).PrismaStaffAuthority;
    container = await new PostgreSqlContainer("postgres:17-alpine").start();
    control = new Pool({ connectionString: container.getConnectionUri() });
    role = `r7f_${randomUUID().replaceAll("-", "")}`; password = randomUUID();
    await control.query(`CREATE ROLE "${role}" LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT`);
  });
  beforeEach(async () => {
    databaseName = `r7f_${randomUUID().replaceAll("-", "")}`;
    await control.query(`CREATE DATABASE "${databaseName}"`);
    const url = new URL(container.getConnectionUri()); url.pathname = `/${databaseName}`;
    await run(`${packageDir}node_modules/.bin/prisma`, ["migrate", "deploy"], { cwd: packageDir, env: { ...process.env, DATABASE_URL: url.toString() } });
    observer = new Pool({ connectionString: url.toString() }); drainOwner = trackPoolClientEnds(observer);
    owner = new PrismaClient({ adapter: new PrismaPg(observer) });
    await observer.query(`GRANT USAGE ON SCHEMA public TO "${role}"`);
    await observer.query(`GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO "${role}"`);
    await observer.query(`GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO "${role}"`);
    await observer.query(`GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO "${role}"`);
    url.username = role; url.password = password;
    appPool = new Pool({ connectionString: url.toString() }); drainApp = trackPoolClientEnds(appPool);
    db = new PrismaClient({ adapter: new PrismaPg(appPool) });
    userId = randomUUID(); values = { "user-id": userId, "center-code": `synthetic-${randomUUID()}`, capability };
    // Fixture authority is limited to preactivation ordinary rows. Existing User
    // eligibility and all other integrity triggers remain active during setup.
    await owner.user.create({ data: { id: userId, email: `${userId}@r7f.invalid`, emailVerifiedAt: new Date() } });
  });
  afterEach(async () => {
    await db?.$disconnect(); await appPool?.end(); await drainApp?.();
    await owner?.$disconnect(); await observer?.end(); await drainOwner?.();
    if (databaseName) await control.query(`DROP DATABASE "${databaseName}"`);
  });
  afterAll(async () => { if (role) await control.query(`DROP ROLE "${role}"`); await control?.end(); await container?.stop(); });

  async function activate() {
    const triggers = await observer.query<{ table: string; name: string }>(`SELECT c.relname AS table,t.tgname AS name FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND (t.tgname LIKE 'zz_diagnostic_source_%' OR t.tgname LIKE 'zzzz_campaign_preparation%' OR t.tgname='diagnostic_source_no_truncate')`);
    for (const row of triggers.rows) await observer.query(`ALTER TABLE public."${row.table}" ENABLE TRIGGER "${row.name}"`);
    expect((await observer.query("SELECT diagnostic_source_guards_ready() AS ready")).rows).toEqual([{ ready: true }]);
    expect((await appPool.query("SELECT rolsuper,rolcreaterole,rolcreatedb FROM pg_roles WHERE rolname=current_user")).rows).toEqual([{ rolsuper: false, rolcreaterole: false, rolcreatedb: false }]);
  }
  async function manager() {
    managerId = randomUUID(); sessionId = randomUUID();
    await owner.user.create({ data: { id: managerId, email: `${managerId}@r7f.invalid`, emailVerifiedAt: new Date() } });
    await owner.staffGrant.create({ data: { userId: managerId, capability: "staff.manage" } });
    const until = new Date(Date.now() + 3600_000);
    await owner.session.create({ data: { id: sessionId, userId: managerId, refreshTokenHash: sessionId, expiresAt: until, adminTotpExpiresAt: until } });
  }
  async function grant(revokedAt: Date | null = null) { await owner.staffGrant.create({ data: { userId, capability, revokedAt } }); }
  async function seedCenter(options: { audit?: boolean; qualification?: boolean; qualificationAudit?: boolean; qualifiedUntil?: Date | null; revokedAt?: Date | null; approved?: boolean; jsonNull?: boolean; badNames?: boolean; badPlan?: boolean } = {}) {
    const center = await owner.diagnosticCenter.create({ data: { code: must(values["center-code"]), names: options.badNames ? { en: "foreign" } : names, planCode: options.badPlan ? "foreign" : "standard", operationalApproval: options.approved ? { approved: true } : options.jsonNull ? Prisma.JsonNull : Prisma.DbNull } });
    if (options.audit !== false) await owner.diagnosticAudit.create({ data: { centerId: center.id, action: "CENTER_SYNTHETIC_BOOTSTRAPPED", details: { command } } });
    if (options.qualification) {
      await owner.diagnosticCenterAssignment.create({ data: { centerId: center.id, userId, capability, qualifiedUntil: options.qualifiedUntil === undefined ? new Date(Date.now() + 3600_000) : options.qualifiedUntil, revokedAt: options.revokedAt ?? null } });
    }
    if (options.qualificationAudit) await owner.diagnosticAudit.create({ data: { centerId: center.id, action: "CENTER_QUALIFICATION_SYNTHETIC", details: { command, userId, capability } } });
    return center;
  }
  async function snapshot() {
    return {
      users: await owner.user.findMany({ orderBy: { id: "asc" } }), grants: await owner.staffGrant.findMany({ orderBy: [{ userId: "asc" }, { capability: "asc" }] }),
      centers: await owner.diagnosticCenter.findMany({ orderBy: { id: "asc" } }), assignments: await owner.diagnosticCenterAssignment.findMany({ orderBy: { id: "asc" } }),
      audits: await owner.diagnosticAudit.findMany({ orderBy: { id: "asc" } }), staffAudits: await owner.auditLog.findMany({ orderBy: { id: "asc" } }),
      receipts: await owner.$queryRaw`SELECT id FROM diagnostic_source_commands`, campaigns: await owner.$queryRaw`SELECT id FROM campaign_preparations`,
    };
  }
  async function pidReady(pids: number[]): Promise<number> {
    const deadline = Date.now() + 2000;
    while (pids.length === 0 && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 5));
    return must(pids[0]);
  }
  async function blocked(waiter: number, blocker: number) {
    const deadline = Date.now() + 2000;
    while (Date.now() < deadline) {
      if ((await observer.query<{ blocked: boolean }>("SELECT $2::int=ANY(pg_blocking_pids($1::int)) blocked", [waiter, blocker])).rows[0]?.blocked) return;
      await new Promise(resolve => setTimeout(resolve, 5));
    }
    throw new Error(`expected actual PID ${waiter} blocked by ${blocker}`);
  }
  async function drained(pids: number[]) {
    expect((await observer.query("SELECT pid FROM pg_stat_activity WHERE pid=ANY($1::int[]) AND state<>'idle'", [pids])).rows).toEqual([]);
    expect((await observer.query("SELECT pid FROM pg_locks WHERE pid=ANY($1::int[]) AND locktype='advisory'", [pids])).rows).toEqual([]);
  }

  // Scheduling/fault hooks at the DB boundary preserve every real SQL result.
  // Only the explicitly named missing-audit test suppresses one write to prove
  // the real finish function detects that missing effect and rolls back.
  function observed(hooks: { ready?: ReturnType<typeof gate>; hold?: ReturnType<typeof gate>; beforePrepare?: () => Promise<void>; afterSnapshotUser?: (tx: Tx) => Promise<void>; omitQualificationAudit?: boolean; omitStaffAudit?: boolean; afterRollback?: () => Promise<void>; assertionLookalike?: boolean } = {}) {
    const pids: number[] = [], errors: unknown[] = [], sqlErrors: unknown[] = [], modes: { readOnly: string; isolation: string }[] = [];
    let transactions = 0;
    const client = { $transaction: async (work: (tx: Tx) => Promise<string>, options?: { isolationLevel?: Prisma.TransactionIsolationLevel }) => {
      transactions++;
      try {
        return await db.$transaction(async tx => {
          if (options?.isolationLevel !== "RepeatableRead") pids.push(must((await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`)[0]).pid);
          // Reconciliation collects its PID only after the real SET READ ONLY.
          let userRead = false;
          const proxied = new Proxy(tx, { get(target, prop) {
            if (prop === "$queryRaw") return async (strings: TemplateStringsArray, ...params: unknown[]) => {
              const sql = strings.join("?");
              if (sql.includes("diagnostic_prepare_source")) await hooks.beforePrepare?.();
              const result = await target.$queryRaw(strings, ...params).catch(error => { sqlErrors.push(error); throw error; });
              if (hooks.assertionLookalike && sql.includes("diagnostic_assert_source")) await target.$queryRaw`SELECT r7f_preparation_lookalike()`;
              if (options?.isolationLevel === "RepeatableRead" && !userRead && sql.includes('FROM "users"')) { userRead = true; await hooks.afterSnapshotUser?.(target); }
              return result;
            };
            if (prop === "$executeRaw") return async (strings: TemplateStringsArray, ...params: unknown[]) => {
              const result = await target.$executeRaw(strings, ...params);
              if (strings.join("") === "SET TRANSACTION READ ONLY") {
                const mode = must((await target.$queryRaw<{ pid: number; readOnly: string; isolation: string }[]>`SELECT pg_backend_pid() AS pid,current_setting('transaction_read_only') AS "readOnly",current_setting('transaction_isolation') AS isolation`)[0]);
                pids.push(mode.pid); modes.push({ readOnly: mode.readOnly, isolation: mode.isolation });
              }
              return result;
            };
            if (prop === "auditLog" && hooks.omitStaffAudit) return new Proxy(target.auditLog, { get(model, method) {
              if (method === "create") return async (args: Prisma.AuditLogCreateArgs) => args.data.action === "STAFF_CAPABILITY_BOOTSTRAP" ? args.data : model.create(args);
              return Reflect.get(model, method);
            } });
            if (prop === "diagnosticAudit" && hooks.omitQualificationAudit) return new Proxy(target.diagnosticAudit, { get(model, method) {
              if (method === "create") return async (args: Prisma.DiagnosticAuditCreateArgs) => args.data.action === "CENTER_QUALIFICATION_SYNTHETIC" ? args.data : model.create(args);
              return Reflect.get(model, method);
            } });
            return Reflect.get(target, prop);
          } });
          const result = await work(proxied);
          hooks.ready?.release(); await hooks.hold?.promise;
          return result;
        }, options);
      } catch (error) { errors.push(error); if (transactions === 1) await hooks.afterRollback?.(); throw error; }
    } } as unknown as Client;
    return { client, pids, errors, sqlErrors, modes, transactions: () => transactions };
  }

  it.each(["absent", "revoked"])("staff bootstrap grants the exact %s slot with one actorless audit, then never renews it", async state => {
    if (state === "revoked") await grant(new Date("2026-01-01T00:00:00Z"));
    await activate();
    expect(await db.$transaction(tx => bootstrapStaff(tx, staff()))).toBe("Named capability granted with bootstrap audit");
    const first = await snapshot();
    expect(first.grants).toEqual([{ userId, capability, revokedAt: null, grantedAt: expect.any(Date) }]);
    expect(first.staffAudits).toEqual([expect.objectContaining({ actorId: null, action: "STAFF_CAPABILITY_BOOTSTRAP", targetId: userId, details: { capability, reason: staff().reason } })]);
    expect(first.receipts).toEqual([]); expect(first.campaigns).toEqual([]);
    expect(await db.$transaction(tx => bootstrapStaff(tx, staff()))).toBe("Already granted; no change");
    expect(await snapshot()).toEqual(first);
  });
  it("dry runs of both callers write no grant, qualification, audit or receipt", async () => {
    await activate(); const before = await snapshot();
    expect(await db.$transaction(tx => bootstrapStaff(tx, staff(), true))).toContain("Dry run");
    expect(await snapshot()).toEqual(before);
    // Give authority through the owned production staff bootstrap, not a naked fixture after activation.
    await db.$transaction(tx => bootstrapStaff(tx, staff())); const granted = await snapshot();
    expect(await runSyntheticCenterBootstrap(db, { ...values, "dry-run": true })).toBe("Dry run; would create the synthetic center and qualification");
    expect(await snapshot()).toEqual(granted);
  });
  it.each(["first", "known"])("center bootstrap handles %s center and preserves exact first/repeat/two-hour effects", async state => {
    await grant(); if (state === "known") await seedCenter(); await activate();
    expect(await runSyntheticCenterBootstrap(db, values)).toBe("Synthetic center and qualification created");
    const first = await snapshot();
    const center = must(first.centers[0]), assignment = must(first.assignments[0]);
    expect(center).toMatchObject({ code: values["center-code"], planCode: "standard", names, operationalApproval: null });
    expect(assignment).toMatchObject({ centerId: center.id, userId, capability, revokedAt: null });
    expect(must(assignment.qualifiedUntil).getTime() - assignment.assignedAt.getTime()).toBe(7200_000);
    expect(first.audits.map(row => row.action).sort()).toEqual(["CENTER_QUALIFICATION_SYNTHETIC", "CENTER_SYNTHETIC_BOOTSTRAPPED"]);
    expect(first.receipts).toEqual([]); expect(first.campaigns).toEqual([]);
    expect(await runSyntheticCenterBootstrap(db, values)).toBe("Already bootstrapped; no change");
    expect(await snapshot()).toEqual(first);
  });

  it.each(["write", "dry-run", "no-op"])("refuses Prisma.JsonNull approval for %s while leaving the exact fixture unchanged", async mode => {
    await grant();
    const center = await seedCenter({ jsonNull: true, qualification: mode === "no-op", qualificationAudit: mode === "no-op" });
    await activate();
    expect((await db.diagnosticCenter.findUniqueOrThrow({ where: { id: center.id } })).operationalApproval).toBeNull();
    expect(await db.$queryRaw`SELECT "operationalApproval" IS NULL AS unapproved FROM diagnostic_centers WHERE id=${center.id}`).toEqual([{ unapproved: false }]);
    const before = await snapshot(); const h = observed();
    await expect(runSyntheticCenterBootstrap(h.client, { ...values, "dry-run": mode === "dry-run" })).rejects.toThrow("Refused: center-approved");
    expect(h.transactions()).toBe(1); expect(h.modes).toEqual([]);
    expect(await snapshot()).toEqual(before);
    expect(await db.$queryRaw`SELECT "operationalApproval" IS NULL AS unapproved FROM diagnostic_centers WHERE id=${center.id}`).toEqual([{ unapproved: false }]);
    await drained(h.pids);
  });
  it.each(["missing", "unverified", "suspended", "deleting"])("both callers reject %s User without writes", async state => {
    if (state === "missing") { await owner.user.delete({ where: { id: userId } }); }
    if (state === "unverified") await owner.user.update({ where: { id: userId }, data: { email: null, emailVerifiedAt: null } });
    if (state === "suspended") await owner.user.update({ where: { id: userId }, data: { suspendedAt: new Date() } });
    if (state === "deleting") await owner.user.update({ where: { id: userId }, data: { deletionScheduledAt: new Date() } });
    await activate(); const before = await snapshot();
    await expect(db.$transaction(tx => bootstrapStaff(tx, staff()))).rejects.toThrow("An active verified exact User is required");
    await expect(runSyntheticCenterBootstrap(db, values)).rejects.toThrow("Refused: user");
    expect(await snapshot()).toEqual(before);
  });
  it.each(["missing", "revoked"])("center bootstrap rejects %s exact capability authority", async state => {
    if (state === "revoked") await grant(new Date()); await activate(); const before = await snapshot();
    await expect(runSyntheticCenterBootstrap(db, values)).rejects.toThrow("Refused: grant"); expect(await snapshot()).toEqual(before);
  });
  it.each([
    [{ approved: true }, "center-approved"], [{ badNames: true }, "center-conflict"], [{ badPlan: true }, "center-conflict"], [{ audit: false }, "center-conflict"],
    [{ qualification: true }, "assignment-conflict"], [{ qualificationAudit: true }, "assignment-conflict"],
    [{ qualification: true, qualificationAudit: true, qualifiedUntil: new Date("2020-01-01") }, "qualification-expired"],
    [{ qualification: true, qualificationAudit: true, qualifiedUntil: null }, "qualification-expired"],
    [{ qualification: true, qualificationAudit: true, revokedAt: new Date() }, "qualification-revoked"],
  ] as const)("refuses incomplete or conflicting center/qualification provenance: %s", async (options, reason) => {
    await grant(); await seedCenter(options); await activate(); const before = await snapshot();
    await expect(runSyntheticCenterBootstrap(db, values)).rejects.toThrow(`Refused: ${reason}`); expect(await snapshot()).toEqual(before);
  });

  it("rolls back the actual caller's center/assignment/audit writes when the named qualification audit is missing at SQL finish", async () => {
    await grant(); await activate(); const before = await snapshot(); const h = observed({ omitQualificationAudit: true });
    const result = await runSyntheticCenterBootstrap(h.client, values).catch(error => error);
    expect(driverCause(result)).toMatchObject({ originalCode: "P0001", originalMessage: "diagnostic_source_final_effect" });
    expect(h.transactions()).toBe(1); expect(h.modes).toEqual([]);
    expect(await snapshot()).toEqual(before); await drained(h.pids);
  });
  it("rolls back staff grant and audit on the actual named write sentinel", async () => {
    // Early test-only rejection trigger retains every integrity/source guard and
    // rejects a specific actual grant write; no grant is operationally created.
    await observer.query(`CREATE FUNCTION r7f_staff_write_sentinel() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'r7f_staff_write_sentinel'; END $$`);
    await observer.query(`CREATE TRIGGER a_r7f_staff_write_sentinel BEFORE INSERT ON staff_grants FOR EACH ROW EXECUTE FUNCTION r7f_staff_write_sentinel()`);
    await activate(); const before = await snapshot();
    await expect(db.$transaction(tx => bootstrapStaff(tx, staff()))).rejects.toThrow("r7f_staff_write_sentinel");
    expect(await snapshot()).toEqual(before);
  });

  it("rolls back the actual staff grant at SQL finish if its exact bootstrap audit is missing", async () => {
    await activate(); const before = await snapshot(); const h = observed({ omitStaffAudit: true });
    const error = await h.client.$transaction(tx => bootstrapStaff(tx, staff())).catch(error => error);
    expect(driverCause(error)).toMatchObject({ originalCode: "P0001", originalMessage: "diagnostic_source_final_effect" });
    expect(h.transactions()).toBe(1); expect(await snapshot()).toEqual(before); await drained(h.pids);
  });
  it("rolls back center and assignment work at the actual named assignment write sentinel", async () => {
    await grant();
    await observer.query(`CREATE FUNCTION r7f_assignment_write_sentinel() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'r7f_assignment_write_sentinel'; END $$`);
    await observer.query(`CREATE TRIGGER a_r7f_assignment_write_sentinel BEFORE INSERT ON diagnostic_center_assignments FOR EACH ROW EXECUTE FUNCTION r7f_assignment_write_sentinel()`);
    await activate(); const before = await snapshot(); const h = observed();
    await expect(runSyntheticCenterBootstrap(h.client, values)).rejects.toThrow("r7f_assignment_write_sentinel");
    expect(h.transactions()).toBe(1); expect(h.modes).toEqual([]); expect(await snapshot()).toEqual(before); await drained(h.pids);
  });
  it.each(["left", "right"])("serializes exact absent staff slots when %s owns the first write without replay", async winner => {
    await activate(); const ready = gate(), hold = gate();
    const left = observed(winner === "left" ? { ready, hold } : {}), right = observed(winner === "right" ? { ready, hold } : {});
    const first = winner === "left" ? left : right, second = winner === "left" ? right : left;
    const started: Promise<unknown>[] = [];
    let cleanupFailure: { error: unknown } | undefined;
    try {
      const firstRun = first.client.$transaction(tx => bootstrapStaff(tx, staff()));
      started.push(Promise.allSettled([firstRun]));
      await Promise.race([ready.promise, firstRun.then(() => { throw new Error("missing held owner"); })]);
      const secondRun = second.client.$transaction(tx => bootstrapStaff(tx, staff()));
      started.push(Promise.allSettled([secondRun]));
      const outcomes = Promise.allSettled([firstRun, secondRun]);
      await blocked(await pidReady(second.pids), must(first.pids[0]));
      hold.release();
      const results = await outcomes;
      expect(results[0]).toEqual({ status: "fulfilled", value: "Named capability granted with bootstrap audit" });
      expect(results[1]?.status).toBe("rejected");
      if (results[1]?.status === "rejected") expect(driverCause(results[1].reason).originalMessage).toMatch(/^diagnostic_source_(graph_changed|expected_absent)$/);
      expect(second.transactions()).toBe(1); expect(second.modes).toEqual([]);
      const after = await snapshot(); expect(after.grants).toHaveLength(1);
      expect(after.staffAudits.map(row => row.action)).toEqual(["STAFF_CAPABILITY_BOOTSTRAP"]);
      expect(after.receipts).toEqual([]); expect(after.campaigns).toEqual([]);
    } finally {
      hold.release();
      await Promise.all(started);
      try { await drained([...first.pids, ...second.pids]); }
      catch (error) { cleanupFailure = { error }; }
    }
    // Reached only when the protected stage/assertions succeeded.
    if (cleanupFailure) throw cleanupFailure.error;
  });
  async function revoke(client: Client) {
    await new Staff(client).change({ userId: managerId, sessionId, targetUserId: userId, capability, grant: false, reason: "explicit disposable revoke opposition" }, new Date());
    return "revoked";
  }
  it.each(["left", "right"])("both production callers succeed when %s wins the concurrent absent center slot", async winner => {
    await grant(); await activate();
    const ready = gate(), hold = gate();
    const left = observed(winner === "left" ? { ready, hold } : {}), right = observed(winner === "right" ? { ready, hold } : {});
    const first = winner === "left" ? left : right, second = winner === "left" ? right : left;
    const started: Promise<unknown>[] = [];
    let cleanupFailure: { error: unknown } | undefined;
    try {
      const firstRun = runSyntheticCenterBootstrap(first.client, values);
      started.push(Promise.allSettled([firstRun]));
      await Promise.race([ready.promise, firstRun.then(() => { throw new Error("missing held owner"); })]);
      const secondRun = runSyntheticCenterBootstrap(second.client, values);
      started.push(Promise.allSettled([secondRun]));
      const outcomes = Promise.allSettled([firstRun, secondRun]);
      await blocked(await pidReady(second.pids), must(first.pids[0]));
      hold.release();
      expect(await outcomes).toEqual([{ status: "fulfilled", value: "Synthetic center and qualification created" }, { status: "fulfilled", value: "Already bootstrapped; no change" }]);
      expect(second.transactions()).toBe(2);
      expect(driverCause(second.sqlErrors[0])).toMatchObject({ originalCode: "P0001" });
      expect(driverCause(second.sqlErrors[0]).originalMessage).toMatch(/^diagnostic_(source_graph_changed|intake_operator_center|intake_operator_qualification)$/);
      expect(second.modes).toEqual([{ readOnly: "on", isolation: "repeatable read" }]);
      const result = await snapshot(); expect(result.centers).toHaveLength(1); expect(result.assignments).toHaveLength(1);
      expect(result.audits.map(a => a.action).sort()).toEqual(["CENTER_QUALIFICATION_SYNTHETIC", "CENTER_SYNTHETIC_BOOTSTRAPPED"]);
      expect(result.receipts).toEqual([]); expect(result.campaigns).toEqual([]);
    } finally {
      hold.release();
      await Promise.all(started);
      try { await drained([...first.pids, ...second.pids]); }
      catch (error) { cleanupFailure = { error }; }
    }
    // Reached only when the protected stage/assertions succeeded.
    if (cleanupFailure) throw cleanupFailure.error;
  });
  it.each(["center", "revoke"])("serializes %s first against the accepted production revoke caller with real PID blockers and complete drain", async firstOperation => {
    await grant(); await manager(); await activate(); const ready = gate(), hold = gate(); const first = observed({ ready, hold }), second = observed();
    const started: Promise<unknown>[] = [];
    let cleanupFailure: { error: unknown } | undefined;
    try {
      const firstRun = firstOperation === "center" ? runSyntheticCenterBootstrap(first.client, values) : revoke(first.client);
      started.push(Promise.allSettled([firstRun]));
      await Promise.race([ready.promise, firstRun.then(() => { throw new Error("missing held owner"); })]);
      const secondRun = firstOperation === "center" ? revoke(second.client) : runSyntheticCenterBootstrap(second.client, values);
      started.push(Promise.allSettled([secondRun]));
      const outcomes = Promise.allSettled([firstRun, secondRun]);
      await blocked(await pidReady(second.pids), must(first.pids[0]));
      hold.release();
      const results = await outcomes;
      expect(results[0]).toMatchObject({ status: "fulfilled" });
      expect(results[1]).toMatchObject({ status: "rejected" });
      if (results[1]?.status === "rejected") {
        const reason = results[1].reason;
        expect(String(reason)).toMatch(firstOperation === "center" ? /diagnostic_source_graph_changed/ : /diagnostic_(source_graph_changed|intake_operator_authority)/);
      }
      const current = await snapshot();
      expect(current.centers).toHaveLength(firstOperation === "center" ? 1 : 0);
      expect(current.assignments).toHaveLength(firstOperation === "center" ? 1 : 0);
      expect(current.grants.find(row => row.userId === userId)?.revokedAt === null).toBe(firstOperation === "center");
      expect(current.receipts).toEqual([]); expect(current.campaigns).toEqual([]);
    } finally {
      hold.release();
      await Promise.all(started);
      try { await drained([...first.pids, ...second.pids]); }
      catch (error) { cleanupFailure = { error }; }
    }
    // Reached only when the protected stage/assertions succeeded.
    if (cleanupFailure) throw cleanupFailure.error;
  });

  it("recognition keeps one READ ONLY snapshot across a concurrent revoke and uses PostgreSQL read-only enforcement", async () => {
    await grant(); await manager(); await activate();
    const prepared = gate(), continuePrepare = gate(), snapshotRead = gate(), continueSnapshot = gate();
    let pause = true;
    const h = observed({ beforePrepare: async () => { if (pause) { pause = false; prepared.release(); await continuePrepare.promise; } }, afterSnapshotUser: async () => { snapshotRead.release(); await continueSnapshot.promise; } });
    const waiting = runSyntheticCenterBootstrap(h.client, values); const result = Promise.allSettled([waiting]);
    let cleanupFailure: { error: unknown } | undefined;
    try {
      await Promise.race([prepared.promise, result.then(() => { throw new Error("caller completed before preparation pause"); })]);
      await runSyntheticCenterBootstrap(db, values); continuePrepare.release();
      await Promise.race([snapshotRead.promise, result.then(() => { throw new Error("caller completed before snapshot pause"); })]);
      await revoke(db); continueSnapshot.release();
      expect(await result).toEqual([{ status: "fulfilled", value: "Already bootstrapped; no change" }]);
      expect(h.modes).toEqual([{ readOnly: "on", isolation: "repeatable read" }]);
      expect((await snapshot()).grants.find(row => row.userId === userId)?.revokedAt).toBeInstanceOf(Date);
      await expect(runSyntheticCenterBootstrap(db, values)).rejects.toThrow("Refused: grant");
      expect(h.transactions()).toBe(2);
    } finally {
      continuePrepare.release(); continueSnapshot.release();
      await result;
      try { await drained(h.pids); }
      catch (error) { cleanupFailure = { error }; }
    }
    // Reached only when the protected stage/assertions succeeded.
    if (cleanupFailure) throw cleanupFailure.error;
  });
  it("a write attempted in recognition is refused by PostgreSQL 25006 and preserves the original preparation error", async () => {
    await grant(); await activate(); const prepared = gate(), continuePrepare = gate(); let pause = true;
    let readOnlyFailure: unknown;
    const h = observed({ beforePrepare: async () => { if (pause) { pause = false; prepared.release(); await continuePrepare.promise; } }, afterSnapshotUser: async tx => {
      try { await tx.$executeRaw`INSERT INTO audit_logs(id,action,"targetType","targetId","createdAt") VALUES(${randomUUID()},'R7F_FORBIDDEN','User',${userId},now())`; }
      catch (error) { readOnlyFailure = error; throw error; }
    } });
    const waiting = runSyntheticCenterBootstrap(h.client, values); const result = Promise.allSettled([waiting]);
    let cleanupFailure: { error: unknown } | undefined;
    try {
      await Promise.race([prepared.promise, result.then(() => { throw new Error("caller completed before preparation pause"); })]); await runSyntheticCenterBootstrap(db, values); const before = await snapshot(); continuePrepare.release();
      const [outcome] = await result;
      expect(outcome?.status).toBe("rejected");
      if (outcome?.status === "rejected") expect(outcome.reason).toBe(h.sqlErrors[0]);
      expect(driverCause(readOnlyFailure)).toMatchObject({ originalCode: "25006" });
      expect(await snapshot()).toEqual(before); expect(h.transactions()).toBe(2);
    } finally {
      continuePrepare.release();
      await result;
      try { await drained(h.pids); }
      catch (error) { cleanupFailure = { error }; }
    }
    // Reached only when the protected stage/assertions succeeded.
    if (cleanupFailure) throw cleanupFailure.error;
  });
  it.each(["grant-revoked", "qualification-revoked", "qualification-expired", "missing-center-audit", "missing-qualification-audit"])("preserves the original preparation cause when recognition observes %s", async invalid => {
    await grant(); await manager(); await activate();
    const prepared = gate(), continuePrepare = gate(); let pause = true; let beforeRecognition: Awaited<ReturnType<typeof snapshot>> | undefined;
    const h = observed({
      beforePrepare: async () => { if (pause) { pause = false; prepared.release(); await continuePrepare.promise; } },
      afterRollback: async () => {
        // The original transaction has rejected before any fixture transition.
        if (invalid === "grant-revoked") await revoke(db);
        else await db.$transaction(async tx => {
          const assignment = await tx.diagnosticCenterAssignment.findFirstOrThrow({ where: { userId, capability } });
          if (invalid === "qualification-revoked" || invalid === "qualification-expired") {
            const patch = invalid === "qualification-revoked" ? { revokedAt: new Date() } : { qualifiedUntil: new Date("2020-01-01T00:00:00Z") };
            const key = { id: assignment.id };
            const plan = must((await tx.$queryRaw<{ source: DiagnosticSourceTuple; next: DiagnosticSourceTuple }[]>`SELECT diagnostic_source_project(diagnostic_source_read('diagnostic_center_assignments',${JSON.stringify(key)}::jsonb),diagnostic_source_meta('diagnostic_center_assignments')->'fields') AS source,diagnostic_source_normalize('diagnostic_center_assignments',diagnostic_source_read('diagnostic_center_assignments',${JSON.stringify(key)}::jsonb)||${JSON.stringify(patch)}::jsonb) AS next`)[0]);
            await withDiagnosticSourceCommand(tx, { operation: "staff_eligibility", roots: [{ table: "users", key: { id: userId } }], rows: [{ table: "diagnostic_center_assignments", key, verb: "update", expected: { source: plan.source }, next: plan.next }], actorUserId: null, sessionId: null, cutoff: null, campaign: null }, () => tx.diagnosticCenterAssignment.update({ where: key, data: patch }));
          } else {
            const action = invalid === "missing-center-audit" ? "CENTER_SYNTHETIC_BOOTSTRAPPED" : "CENTER_QUALIFICATION_SYNTHETIC";
            const audit = await tx.diagnosticAudit.findFirstOrThrow({ where: { centerId: assignment.centerId, action } }); const key = { id: audit.id };
            const plan = must((await tx.$queryRaw<{ source: DiagnosticSourceTuple }[]>`SELECT diagnostic_source_project(diagnostic_source_read('diagnostic_audits',${JSON.stringify(key)}::jsonb),diagnostic_source_meta('diagnostic_audits')->'fields') AS source`)[0]);
            await withDiagnosticSourceCommand(tx, { operation: "order_change", roots: [{ table: "diagnostic_centers", key: { id: assignment.centerId } }], rows: [{ table: "diagnostic_audits", key, verb: "delete", expected: { source: plan.source }, next: null }], actorUserId: null, sessionId: null, cutoff: null, campaign: null }, () => tx.diagnosticAudit.delete({ where: key }));
          }
        });
        // Qualification/audit changes above are declared SQL fixture transitions,
        // not coverage for an unowned production qualification/provenance writer.
        beforeRecognition = await snapshot();
      },
    });
    const waiting = runSyntheticCenterBootstrap(h.client, values); const outcome = Promise.allSettled([waiting]);
    let cleanupFailure: { error: unknown } | undefined;
    try {
      await Promise.race([prepared.promise, outcome.then(() => { throw new Error("caller completed before preparation pause"); })]); await runSyntheticCenterBootstrap(db, values); continuePrepare.release();
      const [result] = await outcome; expect(result?.status).toBe("rejected");
      if (result?.status === "rejected") expect(result.reason).toBe(h.sqlErrors[0]);
      expect(driverCause(h.sqlErrors[0]).originalMessage).toMatch(/^diagnostic_(source_graph_changed|intake_operator_center|intake_operator_qualification)$/);
      expect(h.transactions()).toBe(2); expect(h.modes).toEqual([{ readOnly: "on", isolation: "repeatable read" }]);
      expect(await snapshot()).toEqual(must(beforeRecognition));
    } finally {
      continuePrepare.release();
      await outcome;
      try { await drained(h.pids); }
      catch (error) { cleanupFailure = { error }; }
    }
    // Reached only when the protected stage/assertions succeeded.
    if (cleanupFailure) throw cleanupFailure.error;
  });
  it("preserves the exact preparation cause when READ ONLY recognition finds a Prisma.JsonNull fixture", async () => {
    await grant();
    const prepared = gate(), continuePrepare = gate();
    const h = observed({ beforePrepare: async () => { prepared.release(); await continuePrepare.promise; } });
    const waiting = runSyntheticCenterBootstrap(h.client, values);
    const outcomes = Promise.allSettled([waiting]);
    let cleanupFailure: { error: unknown } | undefined;
    try {
      await Promise.race([prepared.promise, outcomes.then(() => { throw new Error("caller completed before preparation pause"); })]);
      // Only unlocked discovery has run. Construct ordinary fixture rows before
      // activation, then require every current guard before the REAL prepare.
      // This fixture transition is not production opposing-writer coverage.
      const center = await seedCenter({ jsonNull: true, qualification: true, qualificationAudit: true });
      await activate();
      expect(await db.$queryRaw`SELECT "operationalApproval" IS NULL AS unapproved FROM diagnostic_centers WHERE id=${center.id}`).toEqual([{ unapproved: false }]);
      const before = await snapshot();
      continuePrepare.release();
      const [outcome] = await outcomes;
      expect(outcome?.status).toBe("rejected");
      if (outcome?.status === "rejected") expect(outcome.reason).toBe(h.sqlErrors[0]);
      expect(driverCause(h.sqlErrors[0])).toMatchObject({ originalCode: "P0001", originalMessage: "diagnostic_intake_operator_center" });
      expect(h.transactions()).toBe(2); expect(h.modes).toEqual([{ readOnly: "on", isolation: "repeatable read" }]);
      expect(await snapshot()).toEqual(before);
      expect(await db.$queryRaw`SELECT "operationalApproval" IS NULL AS unapproved FROM diagnostic_centers WHERE id=${center.id}`).toEqual([{ unapproved: false }]);
    } finally {
      continuePrepare.release();
      await outcomes;
      try { await drained(h.pids); }
      catch (error) { cleanupFailure = { error }; }
    }
    // Reached only when the protected stage/assertions succeeded.
    if (cleanupFailure) throw cleanupFailure.error;
  });
  it("never recognizes a preparation-lookalike SQL error from the receipt callback's assertion stage", async () => {
    await grant();
    await observer.query(`CREATE FUNCTION r7f_preparation_lookalike() RETURNS boolean LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'diagnostic_source_graph_changed'; END $$`);
    await activate(); const before = await snapshot(); const h = observed({ assertionLookalike: true });
    const failure = await runSyntheticCenterBootstrap(h.client, values).catch(error => error);
    expect(driverCause(failure)).toMatchObject({ originalCode: "P0001", originalMessage: "diagnostic_source_graph_changed" });
    expect(h.transactions()).toBe(1); expect(h.modes).toEqual([]); expect(await snapshot()).toEqual(before); await drained(h.pids);
  });
  it("never recognizes a preparation-lookalike deferred commit error after complete writes and finish", async () => {
    await grant();
    await observer.query(`CREATE FUNCTION r7f_commit_lookalike() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'diagnostic_source_graph_changed'; END $$`);
    await observer.query(`CREATE CONSTRAINT TRIGGER r7f_commit_lookalike AFTER INSERT ON diagnostic_audits DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION r7f_commit_lookalike()`);
    await activate(); const before = await snapshot(); const h = observed();
    await expect(runSyntheticCenterBootstrap(h.client, values)).rejects.toThrow("diagnostic_source_graph_changed");
    expect(h.transactions()).toBe(1); expect(h.modes).toEqual([]); expect(await snapshot()).toEqual(before); await drained(h.pids);
  });

});
