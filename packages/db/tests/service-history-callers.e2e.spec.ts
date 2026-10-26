import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

import type { ServiceMessagingSchemas as S } from "@auto-tm/contracts";
import { PrismaPg } from "@prisma/adapter-pg";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool, type PoolClient } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { PrismaClient } from "../generated/prisma/client/client";
import type { Prisma } from "../src/index";

// R6a original matrix continuation, attempt 2. Authored source only.
// Parent owns source disposition and separately authorized disposable execution.
// This file never accepts a DATABASE_URL: it migrates only its own container.
// Task-owned fixture facts precede complete local source/campaign activation.
// Exact inherited trigger modes are restored before each case database is dropped.
// Automatic admission remains closed; ordinary FK/check triggers stay enabled.
type Subject = { userId: string; sessionId: string };
interface Caller {
 open(subject: Subject, purpose: "support" | "history", sourceListingId?: string): Promise<{ id: string; resourceId: string }>;
 read(subject: Subject, id: string, after: number, limit: number): Promise<S.ServiceConversation>;
 markRead(subject: Subject, id: string, through: number): Promise<void>;
 send(subject: Subject, id: string, message: S.ServiceSend): Promise<S.ServiceMessage>;
 assign(subject: Subject, id: string, version: number, target?: string): Promise<void>;
 supportCommand(subject: Subject, id: string, command: S.SupportCommand): Promise<void>;
 subscribePush(subject: Subject, id: string, token: string): Promise<void>;
 mine(subject: Subject): Promise<{ id: string }[]>;
 queue(subject: Subject, purpose: "support" | "history"): Promise<{ id: string }[]>;
 historyCommand(subject: Subject, id: string, command: S.HistoryCommand): Promise<void>;
 historyArtifactCommand(subject: Subject, id: string, command: S.HistoryArtifactCommand): Promise<void>;
 historyPrevious(subject: Subject, vin: string): Promise<{ conversationId: string; vin: string }[]>;
 stage(subject: Subject, id: string, upload: S.ServiceStageAttachment): Promise<{ id: string }>;
 upload(subject: Subject, id: string, attachmentId: string, bytes: Uint8Array): Promise<void>;
 file(subject: Subject, id: string, attachmentId: string): Promise<{ bytes: Uint8Array }>;
 historyArtifactUpload(subject: Subject, id: string, artifactId: string, bytes: Uint8Array): Promise<void>;
 historyReportFile(subject: Subject, id: string, artifactId: string): Promise<{ bytes: Uint8Array }>;
 historySnapshot(subject: Subject, id: string): Promise<S.HistorySnapshot>;
 historyReports(subject: Subject, id: string): Promise<S.HistoryReports>;
}
function present<T>(value: T | undefined): T {
 if (value === undefined) throw new Error("missing fixture result");
 return value;
}
function latch() {
 let release!: () => void;
 const promise = new Promise<void>(resolve => { release = resolve; });
 return { promise, release };
}
const now = new Date("2026-10-25T08:00:00Z");
const future = new Date("2026-10-26T08:00:00Z");
let vin = "10000000000000000";
let scenario = 0;
let identity = 0;
function fixtureId() { return `89760000-0000-4000-8000-${String(++identity).padStart(12, "0")}`; }
interface PrivateStore {
 get(key: string, maxBytes: number): Promise<Uint8Array>;
 putImmutable(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
 remove(key: string): Promise<void>;
}
const closedStore: PrivateStore = {
 get: async () => { throw new Error("unexpected external byte read"); },
 putImmutable: async () => { throw new Error("unexpected external byte write"); },
 remove: async () => { throw new Error("unexpected external byte removal"); },
};
type SessionWriter = {
 delete(id: string): Promise<void>;
 rotateRefreshToken(id: string, oldHash: string, newHash: string, lastSeen: Date, expires: Date): Promise<boolean>;
 updateAdminTotpExpiresAt(id: string, until: Date | null): Promise<void>;
};
type SuspensionWriter = { execute(input: { userId: string; adminUserId: string; reason: string }): Promise<{ targetId: string; targetState: { suspendedAt: Date; suspendedById: string; suspensionReason: string }; auditLogId: string }> };
type GrantWriter = { change(input: Subject & { targetUserId: string; capability: string; grant: boolean; reason: string }, at: Date): Promise<void> };
type DeletionWriter = { run(input: { userId: string; deletionScheduledAt: Date }, work: (writes: { scheduleDeletion(id: string, at: Date): Promise<void>; archiveActiveListings(id: string): Promise<void> }) => Promise<void>): Promise<void> };
const rights: S.ServiceRights = { category: "payment_evidence", purpose: "History order", basis: "consent", provenance: "disposable fixture", identifiability: "personal", use: ["service"], schedule: { kind: "until", until: "2027-01-01T00:00:00Z", reason: "fixture retention" }, supplierRestrictions: "", hold: null };

describe("real Service and History callers on disposable restricted PostgreSQL", () => {
 let container: StartedPostgreSqlContainer;
 let pool: Pool;
 let adminPool: Pool;
 let template: string;
 let scenarioDatabase: string;
 let db: PrismaClient;
 let construct: (database: unknown, enabled: boolean, store?: PrivateStore, campaign?: boolean, clock?: () => Date) => Caller;
 let sessionWriter: (database: unknown) => SessionWriter;
 let grantWriter: (database: unknown) => GrantWriter;
 let suspensionWriter: (database: unknown) => SuspensionWriter;
 let deletionWriter: (database: unknown) => DeletionWriter;
 let pdf: () => Promise<Uint8Array>;
 let image: () => Promise<Uint8Array>;
 let saveDevice: (tx: Prisma.TransactionClient, input: { id: string; userId: string; token: string; invalidatedAt: Date | null }) => Promise<void>;
 const clients: PoolClient[] = [];
 const pending: Promise<unknown>[] = [];
 const releases: (() => void)[] = [];
 const role = "r6a_service_caller";
 type TriggerMode = "D" | "O" | "A" | "R";
 type TriggerState = { table: string; name: string; enabled: TriggerMode; guard: boolean };
 let triggerState: TriggerState[] = [];
 let activation: Promise<void> | undefined;
 const quoted = (value: string) => `"${value.replaceAll('"', '""')}"`;
 async function snapshotTriggers() {
  return (await pool.query<TriggerState>(`SELECT c.relname AS table,t.tgname AS name,t.tgenabled::text AS enabled,
   (t.tgname LIKE 'zz_diagnostic_source_%' OR t.tgname LIKE 'zzzz_campaign_preparation%' OR t.tgname='diagnostic_source_no_truncate') AS guard
   FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' ORDER BY c.relname,t.tgname`)).rows;
 }
 async function activate() {
  for (const row of triggerState.filter(row => row.guard)) await pool.query(`ALTER TABLE public.${quoted(row.table)} ENABLE TRIGGER ${quoted(row.name)}`);
  const state = await snapshotTriggers();
  expect(state.filter(row => !row.guard), "ordinary integrity trigger modes unchanged").toEqual(triggerState.filter(row => !row.guard));
  const ready = present((await pool.query<{ source: boolean; campaign: boolean }>("SELECT diagnostic_source_guards_ready() AS source,campaign_preparation_ready() AS campaign")).rows[0]);
  expect(ready).toEqual({ source: true, campaign: true });
  console.info("R6a disposable guards active", JSON.stringify({ database: scenarioDatabase, guards: state.filter(row => row.guard), ready }));
 }
 async function restoreTriggers() {
  for (const row of triggerState) {
   const mode = { D: "DISABLE", O: "ENABLE", A: "ENABLE ALWAYS", R: "ENABLE REPLICA" }[row.enabled];
   await pool.query(`ALTER TABLE public.${quoted(row.table)} ${mode} TRIGGER ${quoted(row.name)}`);
  }
  expect(await snapshotTriggers(), "exact inherited guard and integrity modes restored").toEqual(triggerState);
  console.info("R6a disposable triggers restored", { database: scenarioDatabase, count: triggerState.length });
 }

 beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:17-alpine").start();
  console.info("R6a disposable PostgreSQL", { id: container.getId(), host: container.getHost(), port: container.getPort(), image: "postgres:17-alpine" });
  const url = container.getConnectionUri();
  console.info("R6a exact migration deploy", execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], { cwd: fileURLToPath(new URL("..", import.meta.url)), env: { ...process.env, DATABASE_URL: url }, encoding: "utf8", stdio: "pipe" }));
  pool = new Pool({ connectionString: url });
  db = new PrismaClient({ adapter: new PrismaPg(pool) });
  await pool.query(`CREATE ROLE ${role} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT`);
  await pool.query(`GRANT USAGE ON SCHEMA public TO ${role}`);
  await pool.query(`GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO ${role}`);
  await pool.query(`GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO ${role}`);
  await pool.query(`GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO ${role}`);
  template = container.getDatabase();
  await db.$disconnect(); await pool.end();
  const adminUrl = new URL(url); adminUrl.pathname = "/postgres";
  adminPool = new Pool({ connectionString: adminUrl.href });
  // Runtime imports follow the existing DB caller suite pattern. Do not import
  // API source into the DB compiler's rootDir or replace production authority.
  const load = async (path: string) => import(/* @vite-ignore */ fileURLToPath(new URL(`../../../apps/api/src/modules/${path}.ts`, import.meta.url)));
  const { PrismaServiceMessaging } = await load("service-messaging/infrastructure/PrismaServiceMessaging") as { PrismaServiceMessaging: new (database: unknown, staff: unknown, store: unknown, runtime: unknown, campaign: unknown) => Caller };
  const { PrismaStaffAuthority } = await load("identity/infrastructure/PrismaStaffAuthority") as { PrismaStaffAuthority: new (database: unknown) => unknown };
  const { CheckStaffAuthority } = await load("identity/application/CheckStaffAuthority") as { CheckStaffAuthority: new (repository: unknown, clock: unknown) => unknown };
  const { CampaignServiceAdmission } = await load("service-messaging/infrastructure/campaignServiceAdmission") as { CampaignServiceAdmission: new (config: unknown) => unknown };
  const { PrismaSessionRepository } = await load("identity/infrastructure/PrismaSessionRepository") as { PrismaSessionRepository: new (database: unknown, hasher: unknown) => SessionWriter };
  const { PrismaAccountDeletionUnitOfWork } = await load("identity/infrastructure/PrismaAccountDeletionUnitOfWork") as { PrismaAccountDeletionUnitOfWork: new (database: unknown) => DeletionWriter };
  const { SuspendUser } = await load("admin/application/SuspendUser") as { SuspendUser: new (database: unknown, identityRead: unknown, identityAdmin: unknown, reports: unknown, audits: unknown, messages: unknown) => SuspensionWriter };
  const { PrismaIdentityReadAdapter } = await load("identity/infrastructure/PrismaIdentityReadAdapter") as { PrismaIdentityReadAdapter: new (database: unknown) => unknown };
  const { PrismaIdentityAdminRepository } = await load("identity/infrastructure/PrismaIdentityAdminRepository") as { PrismaIdentityAdminRepository: new (database: unknown) => unknown };
  const { PrismaContentReportRepository } = await load("admin/infrastructure/PrismaContentReportRepository") as { PrismaContentReportRepository: new (database: unknown) => unknown };
  const { PrismaAuditLogRepository } = await load("admin/infrastructure/PrismaAuditLogRepository") as { PrismaAuditLogRepository: new (database: unknown) => unknown };
  const { PrismaConversationRepository } = await load("conversations/infrastructure/PrismaConversationRepository") as { PrismaConversationRepository: new (database: unknown) => unknown };
  // The outer owner receives the instrumented transaction boundary. Its real
  // read adapters use this case's database; mutation/audit use the owner's tx.
  suspensionWriter = database => new SuspendUser(database, new PrismaIdentityReadAdapter(db), new PrismaIdentityAdminRepository(db), new PrismaContentReportRepository(db), new PrismaAuditLogRepository(db), new PrismaConversationRepository(db));
  sessionWriter = database => new PrismaSessionRepository(database, { compare: async () => { throw new Error("unexpected password comparison"); } });
  grantWriter = database => new PrismaStaffAuthority(database) as GrantWriter;
  deletionWriter = database => new PrismaAccountDeletionUnitOfWork(database);
  const { PrismaPushTokenRepository } = await load("notifications/infrastructure/PrismaPushTokenRepository") as { PrismaPushTokenRepository: new (database: unknown) => { save(token: unknown): Promise<void> } };
  const { PushToken } = await load("notifications/domain/PushToken") as { PushToken: { create(data: unknown): unknown } };
  saveDevice = (tx, input) => new PrismaPushTokenRepository(tx).save(PushToken.create({ ...input, platform: "android", deviceId: null, createdAt: now, updatedAt: now, lastSeenAt: now }));
  const sharp = createRequire(fileURLToPath(new URL("../../../apps/api/package.json", import.meta.url)))("sharp") as (input: unknown) => { webp(): { toBuffer(): Promise<Buffer> } };
  image = () => sharp({ create: { width: 1, height: 1, channels: 3, background: { r: 255, g: 255, b: 255 } } }).webp().toBuffer();
  const pdfModule = createRequire(fileURLToPath(new URL("../../../apps/api/package.json", import.meta.url)))("pdf-lib") as { PDFDocument: { create(): Promise<{ addPage(): void; setCreationDate(at: Date): void; setModificationDate(at: Date): void; save(): Promise<Uint8Array> }> } };
  pdf = async () => { const document = await pdfModule.PDFDocument.create(); document.addPage(); document.setCreationDate(now); document.setModificationDate(now); return document.save(); };
  construct = (database, enabled, store = closedStore, campaign = false, clock = () => now) => new PrismaServiceMessaging(database,
   new CheckStaffAuthority(new PrismaStaffAuthority(database), { now: clock }),
   store,
   { now: clock, id: fixtureId, syntheticEnabled: () => enabled, syntheticSubjectAllowed: () => enabled },
   new CampaignServiceAdmission({ get: (key: string) => campaign ? ({ AUTOTM_COMMIT_SHA: "c".repeat(40), APP_ENV: "test" } as Record<string, string>)[key] : undefined }));
 });
 beforeEach(async () => {
  vin = String(10000000000000000n + BigInt(++scenario));
  scenarioDatabase = `r6a_attempt2_${scenario}`;
  // A database per case keeps global production queues, FIFO and day accounting
  // exact, without adding test filters to production or deleting other cases.
  await adminPool.query(`CREATE DATABASE "${scenarioDatabase}" TEMPLATE "${template}"`);
  const url = new URL(container.getConnectionUri()); url.pathname = `/${scenarioDatabase}`;
  pool = new Pool({ connectionString: url.href });
  db = new PrismaClient({ adapter: new PrismaPg(pool) });
  triggerState = []; activation = undefined;
  triggerState = await snapshotTriggers();
  expect(triggerState.filter(row => row.guard).length).toBeGreaterThan(0);
  console.info("R6a inherited triggers", JSON.stringify({ database: scenarioDatabase, triggers: triggerState }));
  for (const row of triggerState.filter(row => row.guard)) await pool.query(`ALTER TABLE public.${quoted(row.table)} DISABLE TRIGGER ${quoted(row.name)}`);
  // Production Prisma defaults use the real wall clock. Service/authority
  // decisions retain their explicitly injected deterministic clock.
 });
 afterEach(async context => {
  for (const release of releases.splice(0)) release();
  const cleanup: PromiseSettledResult<unknown>[] = await Promise.allSettled(clients.map(client => client.query("ROLLBACK")));
  // Drain even if a barrier, assertion or rollback failed. Preserve the test's
  // original error; cleanup failures are additional evidence, never its replacement.
  await Promise.allSettled(pending.splice(0));
  for (const client of clients.splice(0)) {
   try { client.release(); } catch (error) { cleanup.push({ status: "rejected", reason: error }); }
  }
  cleanup.push(...await Promise.allSettled([restoreTriggers()]));
  cleanup.push(...await Promise.allSettled([db.$disconnect(), pool.end()]));
  cleanup.push(...await Promise.allSettled([adminPool.query(`DROP DATABASE "${scenarioDatabase}"`)]));
  const failures = cleanup.flatMap(result => result.status === "rejected" ? [result.reason as unknown] : []);
  if (failures.length) {
   if (context.task.result?.errors?.length) console.error("R6a cleanup failures after original test error", failures);
   else throw new AggregateError(failures, "R6a fixture cleanup failed");
  }
 });
 afterAll(async () => { await adminPool?.end(); await container?.stop(); console.info("R6a disposable container removed", { id: container?.getId() }); });
 async function connection() {
  const client = await pool.connect(); clients.push(client);
  await client.query("SET statement_timeout='8s'");
  return client;
 }
 async function pid(client: PoolClient) { return present((await client.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")).rows[0]).pid; }
 async function blocked(waiter: number, blocker: number, observer: Pool | PoolClient = pool) {
  const deadline = performance.now() + 5000;
  while (performance.now() < deadline) {
   const row = present((await observer.query<{ pids: number[] }>("SELECT pg_blocking_pids($1::int) AS pids", [waiter])).rows[0]);
   if (row.pids.includes(blocker)) {
    console.info("service-history PostgreSQL barrier", { waiter, blocker, blockingPids: row.pids });
    return;
   }
   await new Promise(resolve => setTimeout(resolve, 5));
  }
  console.error("R6a absent barrier backend state", (await observer.query("SELECT pid,state,wait_event_type,wait_event,query,pg_blocking_pids(pid) AS blockers FROM pg_stat_activity WHERE pid=ANY($1::int[])", [[waiter, blocker]])).rows);
  throw new Error(`no PostgreSQL barrier: waiter=${waiter} blocker=${blocker}`);
 }
 // The facade owns only transaction instrumentation. Every query and public
 // caller, retained-selection query, authority check and receipt is production.
 function caller(options: { hold?: boolean; rollback?: boolean; enabled?: boolean; store?: PrivateStore; campaign?: boolean; clock?: () => Date; holdFailure?: boolean; queryObserved?: (query: string, result: unknown) => void; finishRefusal?: (tx: Prisma.TransactionClient) => Promise<void>; inspect?: (tx: Prisma.TransactionClient, result: unknown) => Promise<void> } = {}) {
  const ready = latch(), finish = latch(), started = latch();
  releases.push(finish.release);
  let backend = 0;
  const database = { $transaction: async <T>(work: (tx: Prisma.TransactionClient) => Promise<T>, nativeOptions?: { maxWait?: number; timeout?: number; isolationLevel?: Prisma.TransactionIsolationLevel }) => {
   activation ??= activate(); await activation;
   return db.$transaction(async tx => {
   await tx.$executeRawUnsafe(`SET LOCAL ROLE ${role}`);
   const [identity] = await tx.$queryRaw<{ pid: number; name: string; elevated: boolean; login: boolean; inherit: boolean; owns: boolean; trigger: boolean }[]>`SELECT pg_backend_pid() AS pid,current_user AS name,rolsuper OR rolcreatedb OR rolcreaterole AS elevated,rolcanlogin AS login,rolinherit AS inherit,pg_has_role(current_user,c.relowner,'USAGE') AS owns,has_table_privilege(current_user,'users','TRIGGER') AS trigger FROM pg_roles JOIN pg_class c ON c.oid='public.users'::regclass WHERE rolname=current_user`;
   expect(identity).toMatchObject({ name: role, elevated: false, login: false, inherit: false, owns: false, trigger: false });
   backend = present(identity).pid; started.release();
   const instrumented = options.finishRefusal || options.queryObserved ? new Proxy(tx, { get(target, key) {
    if (key === "$queryRaw") return async (strings: TemplateStringsArray, ...values: unknown[]) => {
     if (options.finishRefusal && strings.join("?").includes("public.campaign_finish")) {
      await options.finishRefusal?.(tx);
      // Database-boundary fault: consume the real receipt, then submit the
      // original finish statement. The second real campaign_finish must raise
      // campaign_preparation_receipt after the observed production writes.
      await target.$queryRaw(strings, ...values);
     }
     const result = await target.$queryRaw(strings, ...values);
     options.queryObserved?.(strings.join("?"), result);
     return result;
    };
    const value: unknown = Reflect.get(target, key);
    return typeof value === "function" ? value.bind(target) : value;
   } }) : tx;
   let result: T;
   try { result = await work(instrumented); }
   catch (error) { console.error("R6a actual caller transaction failure", { database: scenarioDatabase, backend, error }); ready.release(); if (options.holdFailure) await finish.promise; throw error; }
   await options.inspect?.(tx, result);
   ready.release();
   if (options.hold) await finish.promise;
   if (options.rollback) throw new Error("caller outer rollback");
   return result;
  }, nativeOptions); } };
  return { database, run: database.$transaction, service: construct(database, options.enabled ?? true, options.store, options.campaign, options.clock), started: started.promise, ready: ready.promise, release: finish.release, pid: () => backend };
 }
 function observe<T>(promise: Promise<T>) {
  const result = promise.then(value => ({ ok: true as const, value }), (error: unknown) => ({ ok: false as const, error }));
  pending.push(result); return result;
 }
 async function principal(staff = false) {
  const user = await db.user.create({ data: { id: fixtureId(), email: `${fixtureId()}@example.invalid`, emailVerifiedAt: now, nameNumber: 1234, avatarIndex: 0, createdAt: now } });
  // Native Session rotation samples wall time; injected service authority uses
  // now. Start valid for both, while expiry-opponent commands still write now.
  const sessionValidUntil = new Date(Math.max(future.getTime(), Date.now() + 24 * 60 * 60 * 1000));
  const session = await db.session.create({ data: { id: fixtureId(), createdAt: now, userId: user.id, refreshTokenHash: fixtureId(), expiresAt: sessionValidUntil, adminTotpExpiresAt: sessionValidUntil } });
  if (staff) for (const capability of ["support.operations", "history.fulfilment"]) await db.staffGrant.create({ data: { userId: user.id, capability, grantedAt: now } });
  return { userId: user.id, sessionId: session.id };
 }
 async function fixture(purpose: "support" | "history" = "support", customer?: Subject) {
  const owner = customer ?? await principal(), staff = await principal(true), peer = await principal(true);
  const data = { id: fixtureId(), createdAt: now, customerId: owner.userId, assigneeId: staff.userId, assignmentVersion: 1 };
  const resource = purpose === "support" ? await db.supportCase.create({ data }) : await db.vehicleHistoryRequest.create({ data });
  const conversation = await db.serviceConversation.create({ data: { id: fixtureId(), createdAt: now, purpose, lastSequence: 8, ...(purpose === "support" ? { supportCaseId: resource.id } : { historyRequestId: resource.id }) } });
  return { owner, staff, peer, resource: resource.id, id: conversation.id };
 }
 async function effects(id: string) {
  return { messages: await db.serviceMessage.count({ where: { conversationId: id } }), outbox: await db.serviceOutbox.count({ where: { conversationId: id } }), reads: await db.serviceReadState.count({ where: { conversationId: id } }), subscriptions: await db.servicePushSubscription.count({ where: { conversationId: id } }) };
 }
 async function audit(resourceId: string) { return db.serviceAudit.findMany({ where: { resourceId }, select: { action: true, actorId: true, assignmentVersion: true }, orderBy: [{ action: "asc" }, { assignmentVersion: "asc" }] }); }
 async function actorBarrier(subject: Subject) {
  const b = await connection(); await b.query("BEGIN");
  await b.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [subject.userId]);
  return b;
 }
 async function refusalAfter(subject: Subject, mutate: (b: PoolClient) => Promise<unknown>, work: (service: Caller) => Promise<unknown>) {
  const b = await actorBarrier(subject), a = caller();
  const result = observe(work(a.service)); await a.started;
  let failure: { error: unknown } | undefined;
  try { await blocked(a.pid(), await pid(b)); await mutate(b); await b.query("COMMIT"); }
  catch (error) { failure = { error }; }
  try { await b.query("ROLLBACK"); }
  catch (error) {
   if (failure) console.error("R6a rollback failed after original barrier error", error);
   else failure = { error };
  }
  await result;
  if (failure) throw failure.error;
  const outcome = await result; expect(outcome.ok).toBe(false);
  if (!outcome.ok) expect(outcome.error).toMatchObject({ code: "NO_ACCESS" });
 }

 it.each(["support", "history"] as const)("opens the first %s scope after a real actor barrier", async purpose => {
  const owner = await principal(), b = await actorBarrier(owner), a = caller();
  const result = observe(a.service.open(owner, purpose)); await a.started;
  await blocked(a.pid(), await pid(b)); await b.query("COMMIT");
  const outcome = await result; expect(outcome.ok).toBe(true);
  if (!outcome.ok) throw outcome.error;
  expect(await db.serviceConversation.findUnique({ where: { id: outcome.value.id } })).toMatchObject({ purpose, lastSequence: 0, lifecycleEpoch: 0 });
 });
 it("returns a stable empty mine page after an actor barrier", async () => {
  const owner = await principal(), b = await actorBarrier(owner), a = caller();
  const result = observe(a.service.mine(owner)); await a.started;
  await blocked(a.pid(), await pid(b)); await b.query("COMMIT");
  expect(await result).toEqual({ ok: true, value: [] });
 });
 // Historical raw authority faults below are not production-opposition proof.
 // Actual obligations map to the four SuspendUser and 24 real lifecycle cases;
 // preserve these old titles/failures separately, never count replacements as passes.
 it.each(["suspend", "delete", "expire", "revoke", "elevation", "grant"] as const)("refuses staff read after current %s changes during a wait", async change => {
  const f = await fixture();
  await refusalAfter(f.staff, b => {
   if (change === "suspend") return b.query('UPDATE users SET "suspendedAt"=$1 WHERE id=$2', [now, f.staff.userId]);
   if (change === "delete") return b.query('UPDATE users SET "deletionScheduledAt"=$1 WHERE id=$2', [now, f.staff.userId]);
   if (change === "revoke") return b.query('DELETE FROM sessions WHERE id=$1', [f.staff.sessionId]);
   if (change === "grant") return b.query('UPDATE staff_grants SET "revokedAt"=$1 WHERE "userId"=$2', [now, f.staff.userId]);
   return b.query(`UPDATE sessions SET "${change === "expire" ? "expiresAt" : "adminTotpExpiresAt"}"=$1 WHERE id=$2`, [now, f.staff.sessionId]);
  }, service => service.read(f.staff, f.id, 0, 20));
  expect(await audit(f.resource)).toEqual([]); expect(await effects(f.id)).toEqual({ messages: 0, outbox: 0, reads: 0, subscriptions: 0 });
 });
 it("refuses stale discovery after insertion of a previously absent capability", async () => {
  const f = await fixture(); await db.staffGrant.deleteMany({ where: { userId: f.staff.userId } });
  const b = await actorBarrier(f.staff), a = caller(), result = observe(a.service.read(f.staff, f.id, 0, 20)); await a.started;
  await blocked(a.pid(), await pid(b));
  await b.query('INSERT INTO staff_grants ("userId",capability,"grantedAt") VALUES ($1,$2,$3)', [f.staff.userId, "support.operations", now]);
  await b.query("COMMIT");
  const outcome = await result; expect(outcome.ok).toBe(false);
  if (!outcome.ok) expect(outcome.error).toMatchObject({ code: "NO_ACCESS" });
  expect(await audit(f.resource)).toEqual([]);
  // A new independent request sees current authority; the failed call did not retry.
  await caller().service.read(f.staff, f.id, 0, 20);
  expect(await audit(f.resource)).toEqual([{ action: "SERVICE_READ", actorId: f.staff.userId, assignmentVersion: 1 }]);
 });
 it.each(["customer", "staff"] as const)("service-first %s read holds the actor until its result commits", async audience => {
  const f = await fixture(), subject = audience === "customer" ? f.owner : f.staff, a = caller({ hold: true }), b = await connection();
  const result = observe(a.service.read(subject, f.id, 0, 20)); await a.ready;
  await b.query("BEGIN"); const waitingPid = await pid(b); const update = observe(b.query('UPDATE users SET "suspendedAt"=$1 WHERE id=$2', [now, subject.userId]));
  await blocked(waitingPid, a.pid()); a.release();
  expect((await result).ok).toBe(true); expect((await update).ok).toBe(true); await b.query("COMMIT");
  expect(await audit(f.resource)).toEqual(audience === "customer" ? [] : [{ action: "SERVICE_READ", actorId: f.staff.userId, assignmentVersion: 1 }]);
 });
 it.each(["assignment", "epoch"] as const)("refuses markRead on post-wait %s changes without incidental writes", async change => {
  const f = await fixture();
  await refusalAfter(f.owner, b => change === "assignment" ? b.query('UPDATE support_cases SET "assignmentVersion"=2 WHERE id=$1', [f.resource]) : b.query('UPDATE service_conversations SET "lifecycleEpoch"=1 WHERE id=$1', [f.id]), service => service.markRead(f.owner, f.id, 5));
  expect(await effects(f.id)).toEqual({ messages: 0, outbox: 0, reads: 0, subscriptions: 0 }); expect(await audit(f.resource)).toEqual([]);
 });
 it("commits text sequence and outbox before a blocked handover proceeds", async () => {
  const f = await fixture(), a = caller({ hold: true }), b = caller();
  const send = observe(a.service.send(f.owner, f.id, { clientMessageId: fixtureId(), body: "customer text", visibility: "customer" })); await a.ready;
  const assign = observe(b.service.assign(f.staff, f.id, 1, f.peer.userId)); await b.started;
  await blocked(b.pid(), a.pid()); a.release(); expect((await send).ok).toBe(true);
  // The waiting handover discovered the old message inventory, so it refuses atomically.
  expect((await assign).ok).toBe(false);
  expect(await db.serviceConversation.findUnique({ where: { id: f.id } })).toMatchObject({ lastSequence: 9 });
  expect(await db.supportCase.findUnique({ where: { id: f.resource } })).toMatchObject({ assigneeId: f.staff.userId, assignmentVersion: 1 });
  expect(await effects(f.id)).toEqual({ messages: 1, outbox: 1, reads: 0, subscriptions: 0 });
 });
 it("commits self assignment and explicit peer handover with exact assignment versions", async () => {
  const f = await fixture(), a = caller();
  await a.service.assign(f.staff, f.id, 1); await a.service.assign(f.staff, f.id, 2, f.peer.userId);
  expect(await db.supportCase.findUnique({ where: { id: f.resource } })).toMatchObject({ assigneeId: f.peer.userId, assignmentVersion: 3 });
  expect(await db.serviceOutbox.findMany({ where: { conversationId: f.id }, orderBy: { sequence: "asc" }, select: { eventType: true, sequence: true } })).toEqual([{ eventType: "handover", sequence: 9 }, { eventType: "handover", sequence: 10 }]);
 });
 it("refuses handover when the new peer loses its grant during the actor wait", async () => {
  const f = await fixture(), manager = await principal(true);
  await db.staffGrant.create({ data: { userId: manager.userId, capability: "staff.manage", grantedAt: now } });
  const grantsBefore = await db.staffGrant.findMany({ orderBy: [{ userId: "asc" }, { capability: "asc" }] });
  const sessionsBefore = await db.session.findMany({ orderBy: { id: "asc" } });
  const usersBefore = await db.user.findMany({ orderBy: { id: "asc" } });
  const resourceBefore = await db.supportCase.findUniqueOrThrow({ where: { id: f.resource } });
  const conversationBefore = await db.serviceConversation.findUniqueOrThrow({ where: { id: f.id } });
  const revoker = caller({ hold: true }), handover = caller();
  const started = new Date();
  const revoke = observe(grantWriter(revoker.database).change({ ...manager, targetUserId: f.peer.userId,
   capability: "support.operations", grant: false, reason: "R6a peer authority opposition" }, now));
  let assign: ReturnType<typeof observe> | undefined;
  try {
   await Promise.race([revoker.ready, revoke.then(result => { if (!result.ok) throw result.error; })]);
   assign = observe(handover.service.assign(f.staff, f.id, 1, f.peer.userId));
   await handover.started;
   await blocked(handover.pid(), revoker.pid());
  } finally {
   revoker.release(); handover.release();
   await Promise.allSettled([revoke, ...(assign ? [assign] : [])]);
  }
  const completed = new Date(), revoked = await revoke, assigned = await present(assign);
  expect(revoked.ok, "actual staff authority revoker commits").toBe(true);
  if (!revoked.ok) throw revoked.error;
  expect(assigned.ok).toBe(false);
  if (!assigned.ok) expect(assigned.error).toMatchObject({ code: "NO_ACCESS" });
  expect(await db.staffGrant.findMany({ orderBy: [{ userId: "asc" }, { capability: "asc" }] })).toEqual(
   grantsBefore.map(row => row.userId === f.peer.userId && row.capability === "support.operations" ? { ...row, revokedAt: now } : row));
  expect(await db.session.findMany({ orderBy: { id: "asc" } })).toEqual(sessionsBefore);
  expect(await db.user.findMany({ orderBy: { id: "asc" } })).toEqual(usersBefore);
  const moderation = await db.auditLog.findMany();
  expect(moderation).toHaveLength(1);
  const auditRow = present(moderation[0]);
  expect(auditRow.createdAt.getTime()).toBeGreaterThanOrEqual(started.getTime());
  expect(auditRow.createdAt.getTime()).toBeLessThanOrEqual(completed.getTime());
  expect(auditRow).toEqual({ id: auditRow.id, createdAt: auditRow.createdAt, actorId: manager.userId,
   action: "STAFF_CAPABILITY_REVOKED", targetType: "User", targetId: f.peer.userId,
   details: { capability: "support.operations", reason: "R6a peer authority opposition", previouslyActive: true } });
  expect(await audit(f.resource)).toEqual([]);
  expect(await db.supportCase.findUniqueOrThrow({ where: { id: f.resource } })).toEqual(resourceBefore);
  expect(await db.serviceConversation.findUniqueOrThrow({ where: { id: f.id } })).toEqual(conversationBefore);
  expect(await effects(f.id)).toEqual({ messages: 0, outbox: 0, reads: 0, subscriptions: 0 });
 });
 it("rolls back support command and all audits at the outer transaction boundary", async () => {
  const f = await fixture(), a = caller({ rollback: true });
  await expect(a.service.supportCommand(f.staff, f.id, { kind: "close_resolved" })).rejects.toThrow("caller outer rollback");
  expect((await db.supportCase.findUniqueOrThrow({ where: { id: f.resource } })).status).toBe("open"); expect(await audit(f.resource)).toEqual([]);
 });
 it.each(["new", "existing"] as const)("binds %s push subscription to exact Session/device/epoch", async existing => {
  const f = await fixture(), device = await db.fcmDevice.create({ data: { createdAt: now, id: fixtureId(), userId: f.owner.userId, token: fixtureId(), platform: "android" } });
  if (existing === "existing") await db.servicePushSubscription.create({ data: { id: fixtureId(), createdAt: now, updatedAt: now, sessionId: f.owner.sessionId, deviceId: device.id, conversationId: f.id, lifecycleEpoch: 0 } });
  const b = await actorBarrier(f.owner), a = caller(), result = observe(a.service.subscribePush(f.owner, f.id, device.token)); await a.started;
  await blocked(a.pid(), await pid(b)); await b.query("COMMIT"); expect((await result).ok).toBe(true);
  expect(await db.servicePushSubscription.findMany({ where: { conversationId: f.id }, select: { sessionId: true, deviceId: true, conversationId: true, lifecycleEpoch: true } })).toEqual([{ sessionId: f.owner.sessionId, deviceId: device.id, conversationId: f.id, lifecycleEpoch: 0 }]);
 });
 it.each(["owner", "invalidated", "session"] as const)("refuses push after post-wait device/Session %s change", async change => {
  const f = await fixture(), device = await db.fcmDevice.create({ data: { createdAt: now, id: fixtureId(), userId: f.owner.userId, token: fixtureId(), platform: "android" } });
  await refusalAfter(f.owner, b => change === "session" ? b.query('DELETE FROM sessions WHERE id=$1', [f.owner.sessionId]) : change === "owner" ? b.query('UPDATE fcm_devices SET "userId"=$1 WHERE id=$2', [f.peer.userId, device.id]) : b.query('UPDATE fcm_devices SET "invalidatedAt"=$1 WHERE id=$2', [now, device.id]), service => service.subscribePush(f.owner, f.id, device.token));
  expect(await effects(f.id)).toEqual({ messages: 0, outbox: 0, reads: 0, subscriptions: 0 }); expect(await audit(f.resource)).toEqual([]);
 });
 it.each(["mine", "queue"] as const)("refuses the whole %s page when a nonfirst retained row changes", async page => {
  const owner = await principal(), first = await fixture("history", owner), second = await fixture("history", owner);
  await db.serviceConversation.update({ where: { id: first.id }, data: { createdAt: new Date("2026-10-25T07:00:00Z") } });
  await db.serviceConversation.update({ where: { id: second.id }, data: { createdAt: new Date("2026-10-25T06:00:00Z") } });
  const actor = page === "mine" ? owner : first.staff;
  await refusalAfter(actor, b => b.query('UPDATE vehicle_history_requests SET "assignmentVersion"=2 WHERE id=$1', [second.resource]), service => page === "mine" ? service.mine(owner) : service.queue(first.staff, "history"));
  expect(await audit(first.resource)).toEqual([]); expect(await audit(second.resource)).toEqual([]);
 });
 async function history(customer?: Subject) {
  const f = await fixture("history", customer), day = "2026-10-25";
  await db.historyCapacityDay.upsert({ where: { day }, create: { day, createdAt: now, slotLimit: 1000, morningLimit: 1000, evidence: "disposable capacity" }, update: { slotLimit: 1000, morningLimit: 1000 } });
  await db.historyProviderAllowance.upsert({ where: { provider_day: { provider: "carfax", day } }, create: { provider: "carfax", day, allowance: 10000, resetAt: now, evidence: "fixture" }, update: { allowance: 10000, consumed: 0 } });
  const quote = await db.historyQuote.create({ data: { createdAt: now, id: fixtureId(), requestId: f.resource, vin, providers: ["carfax"], preflightOutcome: "available", preflightEvidence: "fixture available", refundRule: "full refund", windowStart: new Date("2026-10-25T09:00:00Z"), windowEnd: new Date("2026-10-25T10:00:00Z"), feasible: true, offeredById: f.staff.userId } });
  const accept: S.HistoryCommand = { kind: "accept", quoteId: quote.id, vin, providers: ["carfax"], amount: 100, refundRule: "full refund", windowStart: "2026-10-25T09:00:00.000Z", windowEnd: "2026-10-25T10:00:00.000Z", rights };
  return { ...f, day, quote, accept };
 }
 it("accepts a new order after a capacity barrier and expires another request's elapsed hold", async () => {
  const f = await history(), other = await history();
  const elapsed = await db.historyOrder.create({ data: { createdAt: now, id: fixtureId(), requestId: other.resource, quoteId: other.quote.id, day: f.day, morning: false, holdExpiresAt: now, promiseAt: future, rights } });
  const b = await connection(); await b.query("BEGIN"); await b.query('SELECT day FROM history_capacity_days WHERE day=$1 FOR UPDATE', [f.day]);
  const a = caller(), result = observe(a.service.historyCommand(f.owner, f.id, f.accept)); await a.started;
  await blocked(a.pid(), await pid(b)); await b.query("COMMIT"); expect((await result).ok).toBe(true);
  expect(await db.historyOrder.findUnique({ where: { requestId: f.resource } })).toMatchObject({ state: "held", version: 0, day: f.day, quoteId: f.quote.id });
  expect(await db.historyOrder.findUnique({ where: { id: elapsed.id } })).toMatchObject({ state: "expired", version: 1 });
  expect(await audit(f.resource)).toEqual([{ action: "HISTORY_ACCEPT", actorId: f.owner.userId, assignmentVersion: 1 }]);
 });
 it("capacity edit committed first refuses acceptance with no partial quote/order/audit writes", async () => {
  const f = await history(), b = await connection(); await b.query("BEGIN");
  await b.query('SELECT day FROM history_capacity_days WHERE day=$1 FOR UPDATE', [f.day]);
  const a = caller(), result = observe(a.service.historyCommand(f.owner, f.id, f.accept)); await a.started;
  await blocked(a.pid(), await pid(b)); await b.query('UPDATE history_capacity_days SET "slotLimit"=0,"morningLimit"=0 WHERE day=$1', [f.day]); await b.query("COMMIT");
  const outcome = await result; expect(outcome.ok).toBe(false);
  if (!outcome.ok) expect(outcome.error).toMatchObject({ code: "INVALID_MESSAGE" });
  expect(await db.historyOrder.findUnique({ where: { requestId: f.resource } })).toBeNull();
  expect((await db.historyQuote.findUniqueOrThrow({ where: { id: f.quote.id } })).acceptedAt).toBeNull(); expect(await audit(f.resource)).toEqual([]);
 });
 it("acceptance committed first releases the day before the real capacity caller completes", async () => {
  const f = await history(), other = await fixture("history"), a = caller({ hold: true }), b = caller();
  const accept = observe(a.service.historyCommand(f.owner, f.id, f.accept)); await a.ready;
  const capacity = observe(b.service.historyCommand(other.staff, other.id, { kind: "capacity", expectedAssignmentVersion: 1, day: f.day, slotLimit: 900, morningLimit: 900, evidence: "edited", providers: [{ provider: "carfax", allowance: 9000, consumed: 0, resetAt: now.toISOString(), evidence: "edited" }] })); await b.started;
  await blocked(b.pid(), a.pid()); a.release(); expect((await accept).ok).toBe(true); expect((await capacity).ok).toBe(true);
  expect((await db.historyCapacityDay.findUniqueOrThrow({ where: { day: f.day } })).slotLimit).toBe(900);
  expect((await db.historyOrder.findUniqueOrThrow({ where: { requestId: f.resource } })).state).toBe("held");
 });
 // Historical5df expected second refusal after an unspecified wait. Parent
 // disposition requires observing the exact production phase before both-success.
 it("serializes two new accepts through the same provider and day", async () => {
  const f = await history(), other = await history();
  const before = await transactionalState();
  const selections: { table: string; row: Record<string, unknown> }[][] = [];
  const observedOrders: Awaited<ReturnType<typeof db.historyOrder.findMany>> = [];
  const a = caller({ hold: true, inspect: async tx => { observedOrders.push(await tx.historyOrder.findUniqueOrThrow({ where: { requestId: f.resource } })); } });
  const b = caller({ queryObserved: (query, result) => {
   if (query.includes("/* service retained selection */")) selections.push(present((result as { fingerprint: typeof selections[number] }[])[0]).fingerprint);
  }, inspect: async tx => { observedOrders.push(await tx.historyOrder.findUniqueOrThrow({ where: { requestId: other.resource } })); } });
  const started = new Date();
  const first = observe(a.service.historyCommand(f.owner, f.id, f.accept));
  let second: typeof first | undefined;
  try {
   await Promise.race([a.ready, first.then(result => { if (!result.ok) throw result.error; })]);
   second = observe(b.service.historyCommand(other.owner, other.id, other.accept)); await b.started;
   await blocked(b.pid(), a.pid());
   const phase = present((await pool.query<{ query: string; wait_event_type: string; wait_event: string; blockers: number[] }>("SELECT query,wait_event_type,wait_event,pg_blocking_pids(pid) AS blockers FROM pg_stat_activity WHERE pid=$1", [b.pid()])).rows[0]);
   // Both discovery statements finished before this later capacity-day wait.
   expect(phase.query).toMatch(/SELECT day FROM history_capacity_days WHERE day=.*FOR UPDATE/);
   expect(phase.wait_event_type).toBe("Lock"); expect(phase.blockers).toContain(a.pid());
   const waitingLocks = (await pool.query("SELECT locktype,mode,granted,transactionid::text,relation::regclass::text AS relation FROM pg_locks WHERE pid=$1 AND NOT granted ORDER BY locktype,mode", [b.pid()])).rows;
   expect(waitingLocks).toHaveLength(1); expect(waitingLocks[0]).toMatchObject({ locktype: "transactionid", mode: "ShareLock", granted: false, relation: null });
   expect(selections).toHaveLength(2);
   for (const selected of selections) {
    expect(selected.filter(row => row.table === "history_orders")).toEqual([]);
    expect(selected.filter(row => row.table === "history_quotes").map(row => row.row.id)).toEqual([other.quote.id]);
   }
   expect(selections[1]).toEqual(selections[0]);
   expect(await db.historyOrder.findMany()).toEqual([]); // first order still uncommitted
   console.info("R6a M6 exact business wait and persisted retained selection", { waiter: b.pid(), blocker: a.pid(), phase, waitingLocks, selections });
  } finally { a.release(); b.release(); await Promise.allSettled([first, ...(second ? [second] : [])]); }
  expect(await first).toEqual({ ok: true, value: undefined }); expect(await present(second)).toEqual({ ok: true, value: undefined });
  const orders = await db.historyOrder.findMany({ orderBy: { requestId: "asc" } }), completed = new Date();
  expect(orders).toHaveLength(2);
  expect(orders).toEqual(observedOrders.sort((x,y) => x.requestId.localeCompare(y.requestId)));
  for (const target of [f, other]) {
   const order = present(orders.find(row => row.requestId === target.resource));
   expect(order.createdAt.getTime()).toBeGreaterThanOrEqual(started.getTime());
   expect(order.createdAt.getTime()).toBeLessThanOrEqual(completed.getTime());
   expect(order.updatedAt.getTime()).toBeGreaterThanOrEqual(started.getTime()); expect(order.updatedAt.getTime()).toBeLessThanOrEqual(completed.getTime());
   expect(order).toEqual({ id: order.id, requestId: target.resource, quoteId: target.quote.id, day: "2026-10-25", morning: false, state: "held", version: 0, holdExpiresAt: new Date("2026-10-25T10:00:00Z"), paidAt: null, receivedAt: null, promiseAt: new Date("2026-10-25T10:00:00Z"), recoveryUsed: false, recoveryAgreedAt: null, recoveryDeadline: null, recoveryOfferedAt: null, recoveryOfferedDeadline: null, recoveryOfferExpiresAt: null, escalatedAt: null, rights, erasedAt: null, createdAt: order.createdAt, updatedAt: order.updatedAt });
   expect(await db.historyQuote.findUniqueOrThrow({ where: { id: target.quote.id } })).toEqual({ ...target.quote, acceptedAt: now });
   expect(await audit(target.resource)).toEqual([{ action: "HISTORY_ACCEPT", actorId: target.owner.userId, assignmentVersion: 1 }]);
  }
  expect(await db.historyOrder.count({ where: { day: f.day, state: "held", quote: { providers: { array_contains: "carfax" } }, purchase: { is: null } } })).toBe(2);
  const after = await transactionalState();
  expect(after.filter(entry => !["history_orders", "history_quotes", "service_audits"].includes(entry.table))).toEqual(before.filter(entry => !["history_orders", "history_quotes", "service_audits"].includes(entry.table)));
  expect(await db.historyQuote.count()).toBe(2); expect(await db.serviceAudit.count()).toBe(2);
  expect((await db.historyProviderAllowance.findUniqueOrThrow({ where: { provider_day: { provider: "carfax", day: f.day } } })).consumed).toBe(0);
  expect(await db.historyPayment.count()).toBe(0); expect(await db.historyPurchaseIntent.count()).toBe(0); expect(await db.historyRefund.count()).toBe(0); expect(await db.historyBooking.count()).toBe(0); expect(await db.historyDelivery.count()).toBe(0);
 });
 it("shared customer prefix refuses the second real accept when day-order membership changes", async () => {
  const f = await history(), other = await history(f.owner);
  const before = await transactionalState();
  let firstState: Awaited<ReturnType<typeof transactionalState>> | undefined;
  const selectedOrders: unknown[][] = [];
  const a = caller({ hold: true, inspect: async tx => { firstState = await transactionalState(tx); } });
  const b = caller({ queryObserved: (query, result) => {
   if (query.includes("/* service retained selection */")) selectedOrders.push(present((result as { fingerprint: { table: string; row: unknown }[] }[])[0]).fingerprint.filter(row => row.table === "history_orders").map(row => row.row));
  } });
  const first = observe(a.service.historyCommand(f.owner, f.id, f.accept)); let second: typeof first | undefined;
  try {
   await Promise.race([a.ready, first.then(result => { if (!result.ok) throw result.error; })]);
   second = observe(b.service.historyCommand(other.owner, other.id, other.accept)); await b.started;
   await blocked(b.pid(), a.pid()); expect(selectedOrders).toEqual([[]]);
  } finally { a.release(); b.release(); await Promise.allSettled([first, ...(second ? [second] : [])]); }
  expect(await first).toEqual({ ok: true, value: undefined });
  const refusal = await present(second); expect(refusal.ok).toBe(false); if (!refusal.ok) expect(refusal.error).toMatchObject({ code: "NO_ACCESS" });
  expect(selectedOrders).toHaveLength(2); expect(present(selectedOrders[1])).toHaveLength(1);
  const order = await db.historyOrder.findUniqueOrThrow({ where: { requestId: f.resource } });
  expect(present(selectedOrders[1])[0]).toMatchObject({ id: order.id, requestId: f.resource, state: "held", day: "2026-10-25" });
  expect(await transactionalState(), "second accept rolls back full quote/order/audit/foreign/receipt state").toEqual(present(firstState));
  expect(await db.historyQuote.findUniqueOrThrow({ where: { id: other.quote.id } })).toEqual(other.quote);
  expect(await db.historyOrder.findUnique({ where: { requestId: other.resource } })).toBeNull(); expect(await audit(other.resource)).toEqual([]);
  expect(await audit(f.resource)).toEqual([{ action: "HISTORY_ACCEPT", actorId: f.owner.userId, assignmentVersion: 1 }]);
  expect((await transactionalState()).filter(entry => !["history_orders", "history_quotes", "service_audits"].includes(entry.table))).toEqual(before.filter(entry => !["history_orders", "history_quotes", "service_audits"].includes(entry.table)));
  console.info("R6a M6 actual retained-set refusal", { selectedOrders, firstOrder: order.id });
 });
 async function pair(bytes?: Uint8Array) {
  const f = await history(), donor = await history();
  const makeOrder = (requestId: string, quoteId: string) => db.historyOrder.create({ data: { createdAt: now, id: fixtureId(), requestId, quoteId, day: f.day, morning: false, state: "paid", paidAt: now, receivedAt: now, holdExpiresAt: future, promiseAt: future, rights } });
  const order = await makeOrder(f.resource, f.quote.id), donorOrder = await makeOrder(donor.resource, donor.quote.id);
  const listingId = await listing(donor.owner);
  await db.vehicleHistoryRequest.update({ where: { id: donor.resource }, data: { sourceListingId: listingId } });
  const artifactId = fixtureId(), sha256 = bytes ? createHash("sha256").update(bytes).digest("hex") : "a".repeat(64);
  const artifact = await db.historyArtifact.create({ data: { createdAt: now, id: artifactId, sourceListingId: listingId, provider: "carfax", vin, originalDate: now, objectKey: `history-artifacts/${artifactId}/${sha256}`, sha256, sizeBytes: bytes?.length ?? 100, expectedPages: 1, verifiedPages: 1, state: "verified", acquiredForOrderId: donorOrder.id, verifiedById: donor.staff.userId, verifiedAt: now, rights: { ...rights, category: "provider_artifact", identifiability: "anonymous", use: ["service", "archive", "redistribute"], supplierRestrictions: "fixture permits reuse" } } });
  const archive: S.HistoryArtifactCommand = { kind: "archive", expectedAssignmentVersion: 1, expectedVersion: 0, orderId: order.id, artifactId: artifact.id };
  return { f, donor, order, donorOrder, artifact, archive };
 }
 it("refuses archive pair after donor artifact rights change during a wait", async () => {
  const p = await pair();
  await refusalAfter(p.f.staff, b => b.query('UPDATE history_artifacts SET "restrictedAt"=$1 WHERE id=$2', [now, p.artifact.id]), service => service.historyArtifactCommand(p.f.staff, p.f.id, p.archive));
  expect(await db.historyPurchaseIntent.findUnique({ where: { orderId: p.order.id } })).toBeNull(); expect(await audit(p.f.resource)).toEqual([]);
  expect((await db.historyOrder.findUniqueOrThrow({ where: { id: p.order.id } })).state).toBe("paid");
 });
 it("commits archive reuse and delivery for a distinct donor without changing donor ownership", async () => {
  const p = await pair(), a = caller({ hold: true }), b = await connection();
  const archive = observe(a.service.historyArtifactCommand(p.f.staff, p.f.id, p.archive)); await a.ready;
  await b.query("BEGIN"); const waitingPid = await pid(b); const update = observe(b.query('UPDATE history_artifacts SET "restrictedAt"=$1 WHERE id=$2', [now, p.artifact.id]));
  await blocked(waitingPid, a.pid()); a.release(); expect((await archive).ok).toBe(true); expect((await update).ok).toBe(true); await b.query("ROLLBACK");
  const c = caller(); await c.service.historyArtifactCommand(p.f.staff, p.f.id, { kind: "deliver", expectedAssignmentVersion: 1, expectedVersion: 1, orderId: p.order.id, artifactId: p.artifact.id, sharedLink: "https://example.invalid/report", linkMatches: true, linkChecked: true });
  expect(await db.historyPurchaseIntent.findUnique({ where: { orderId: p.order.id } })).toMatchObject({ sourceArtifactId: p.artifact.id, state: "completed", createdById: p.f.staff.userId });
  expect(await db.historyDelivery.findMany({ where: { orderId: p.order.id } })).toMatchObject([{ artifactId: p.artifact.id, deliveredById: p.f.staff.userId }]);
  expect(await db.historyArtifact.findUnique({ where: { id: p.artifact.id } })).toMatchObject({ acquiredForOrderId: p.donorOrder.id, verifiedById: p.donor.staff.userId, restrictedAt: null });
  expect((await c.service.historyReports(p.f.owner, p.f.id)).archive).toEqual([]);
  expect((await c.service.historyReports(p.f.owner, p.f.id)).delivered).toMatchObject([{ id: p.artifact.id }]);
 });
 it("outer rollback removes archive purchase, order transition and all staff audits", async () => {
  const p = await pair(), a = caller({ rollback: true });
  await expect(a.service.historyArtifactCommand(p.f.staff, p.f.id, p.archive)).rejects.toThrow("caller outer rollback");
  expect(await db.historyPurchaseIntent.findUnique({ where: { orderId: p.order.id } })).toBeNull(); expect(await audit(p.f.resource)).toEqual([]);
  expect((await db.historyOrder.findUniqueOrThrow({ where: { id: p.order.id } })).state).toBe("paid");
 });
 it.each(["support", "history", "push"] as const)("ordinary closed admission refuses %s without transactional effects", async kind => {
  const f = await fixture(kind === "history" ? "history" : "support"), a = caller({ enabled: false });
  const before = await transactionalState();
  const work = kind === "push" ? a.service.subscribePush(f.owner, f.id, fixtureId()) : a.service.open(f.owner, kind);
  await expect(work).rejects.toMatchObject({ code: "COLLECTION_DISABLED" });
  expect(await transactionalState(), "closed admission leaves all source/service/accounting/receipt facts unchanged").toEqual(before);
  expect(await audit(f.resource)).toEqual([]); expect(await effects(f.id)).toEqual({ messages: 0, outbox: 0, reads: 0, subscriptions: 0 });
 });
 it("refuses the real kernel graph limit before watermark or staff audit effects", async () => {
  const f = await fixture();
  await db.serviceMessage.createMany({ data: Array.from({ length: 1001 }, (_, index) => ({ id: fixtureId(), createdAt: now, conversationId: f.id, sequence: index + 1, clientMessageId: fixtureId(), senderId: f.owner.userId, senderKind: "customer", visibility: "customer", body: "retained source", requestHash: "fixture" })) });
  await expect(caller().service.markRead(f.staff, f.id, 5)).rejects.toThrow("diagnostic_source_scope_limit");
  expect(await effects(f.id)).toEqual({ messages: 1001, outbox: 0, reads: 0, subscriptions: 0 }); expect(await audit(f.resource)).toEqual([]);
 });
 it("keeps staff notes out of customer reads after a real wait", async () => {
  const f = await fixture();
  await db.serviceMessage.createMany({ data: [
   { conversationId: f.id, sequence: 1, clientMessageId: fixtureId(), senderId: f.staff.userId, senderKind: "staff", visibility: "staff", body: "private note", requestHash: "private" },
   { conversationId: f.id, sequence: 2, clientMessageId: fixtureId(), senderId: f.staff.userId, senderKind: "staff", visibility: "customer", body: "public reply", requestHash: "public" },
  ] });
  const b = await actorBarrier(f.owner), a = caller(), result = observe(a.service.read(f.owner, f.id, 0, 20)); await a.started;
  await blocked(a.pid(), await pid(b)); await b.query("COMMIT");
  const outcome = await result; expect(outcome.ok).toBe(true); if (!outcome.ok) throw outcome.error;
  expect(outcome.value.messages.map(message => message.body)).toEqual(["public reply"]); expect(await audit(f.resource)).toEqual([]);
 });
 it("adopts a real uploaded attachment with the message and rolls adoption back on outer refusal", async () => {
  const f = await fixture("history");
  const attachment = await uploadedAttachment(f, f.owner);
  const message = { clientMessageId: fixtureId(), attachmentId: attachment.id, visibility: "customer" as const };
  await expect(caller({ rollback: true }).service.send(f.owner, f.id, message)).rejects.toThrow("caller outer rollback");
  expect((await db.serviceAttachment.findUniqueOrThrow({ where: { id: attachment.id } })).state).toBe("staged");
  expect(await effects(f.id)).toEqual({ messages: 0, outbox: 0, reads: 0, subscriptions: 0 });
  const b = await actorBarrier(f.owner), a = caller(), result = observe(a.service.send(f.owner, f.id, message)); await a.started;
  await blocked(a.pid(), await pid(b)); await b.query("COMMIT"); expect((await result).ok).toBe(true);
  expect(await db.serviceAttachment.findUnique({ where: { id: attachment.id } })).toMatchObject({ state: "adopted", adoptedAt: now });
  expect(await effects(f.id)).toEqual({ messages: 1, outbox: 1, reads: 0, subscriptions: 0 });
 });
 it("rebooks a reviewed order using its verified payment and creates one booking", async () => {
  const f = await history();
  const old = await db.historyQuote.create({ data: { createdAt: now, id: fixtureId(), requestId: f.resource, vin, providers: ["carfax"], preflightOutcome: "available", preflightEvidence: "old quote", refundRule: "full refund", windowStart: new Date("2026-10-25T07:00:00Z"), windowEnd: now, feasible: true, acceptedAt: new Date("2026-10-25T06:00:00Z") } });
  const order = await db.historyOrder.create({ data: { createdAt: now, id: fixtureId(), requestId: f.resource, quoteId: old.id, day: f.day, morning: false, state: "review", holdExpiresAt: new Date("2026-10-25T07:00:00Z"), promiseAt: now, rights } });
  const payment = await db.historyPayment.create({ data: { createdAt: now, id: fixtureId(), orderId: order.id, clientPaymentId: fixtureId(), amount: 100, verifiedFunds: true, receivedAt: new Date("2026-10-25T07:00:00Z"), confirmedAt: new Date("2026-10-25T07:30:00Z"), state: "review", confirmedById: f.staff.userId } });
  const b = await actorBarrier(f.owner), a = caller(), result = observe(a.service.historyCommand(f.owner, f.id, f.accept)); await a.started;
  await blocked(a.pid(), await pid(b)); await b.query("COMMIT"); expect((await result).ok).toBe(true);
  expect(await db.historyOrder.findUnique({ where: { id: order.id } })).toMatchObject({ state: "paid", version: 1, paidAt: new Date("2026-10-25T07:30:00Z") });
  expect(await db.historyBooking.findMany({ where: { orderId: order.id } })).toMatchObject([{ clientBookingId: f.quote.id, amount: 100 }]);
  expect((await db.historyPayment.findUniqueOrThrow({ where: { id: payment.id } })).state).toBe("confirmed");
 });
 it("refuses all previous-history rows when a nonfirst request changes during a wait", async () => {
  const p = await pair(), second = await history(p.f.owner);
  const order = await db.historyOrder.create({ data: { createdAt: now, id: fixtureId(), requestId: second.resource, quoteId: second.quote.id, day: second.day, morning: false, state: "delivered", paidAt: now, receivedAt: now, holdExpiresAt: future, promiseAt: future, rights } });
  for (const target of [p.order, order]) {
   await db.historyOrder.update({ where: { id: target.id }, data: { state: "delivered" } });
   const purchase = await db.historyPurchaseIntent.create({ data: { createdAt: now, id: fixtureId(), orderId: target.id, sourceArtifactId: p.artifact.id, vin, providers: ["carfax"], state: "completed" } });
   await db.historyDelivery.create({ data: { id: fixtureId(), orderId: target.id, artifactId: p.artifact.id, purchaseIntentId: purchase.id, sharedLink: "https://example.invalid/report", linkApprovedAt: now, deliveredAt: now, deliveredById: p.f.staff.userId } });
  }
  await db.historyOrder.update({ where: { id: p.order.id }, data: { createdAt: new Date("2026-10-25T07:00:00Z") } });
  await db.historyOrder.update({ where: { id: order.id }, data: { createdAt: new Date("2026-10-25T06:00:00Z") } });
  await refusalAfter(p.f.owner, b => b.query('UPDATE vehicle_history_requests SET "assignmentVersion"=2 WHERE id=$1', [second.resource]), service => service.historyPrevious(p.f.owner, vin));
  expect(await audit(p.f.resource)).toEqual([]); expect(await audit(second.resource)).toEqual([]);
 });

 async function listing(owner: Subject) {
  const brand = fixtureId(), model = fixtureId(), region = fixtureId(), city = fixtureId(), id = fixtureId();
  for (const [table, key] of [["brands", brand], ["regions", region]]) await pool.query(`INSERT INTO ${table}(id,slug,"nameRu","nameTk","nameEn","createdAt","updatedAt") VALUES($1,$1,'fixture','fixture','fixture','2026-10-25T08:00:00Z'::timestamp(3),'2026-10-25T08:00:00Z'::timestamp(3))`, [key]);
  await pool.query(`INSERT INTO models(id,"brandId",slug,"nameRu","nameTk","nameEn","createdAt","updatedAt") VALUES($1,$2,$1,'fixture','fixture','fixture','2026-10-25T08:00:00Z'::timestamp(3),'2026-10-25T08:00:00Z'::timestamp(3))`, [model, brand]);
  await pool.query(`INSERT INTO cities(id,"regionId",slug,"nameRu","nameTk","nameEn","createdAt","updatedAt") VALUES($1,$2,$1,'fixture','fixture','fixture','2026-10-25T08:00:00Z'::timestamp(3),'2026-10-25T08:00:00Z'::timestamp(3))`, [city, region]);
  await pool.query(`INSERT INTO listings(id,"sellerId","brandId","modelId","cityId","priceAmount",damaged,"createdAt","updatedAt") VALUES($1,$2,$3,$4,$5,1,false,'2026-10-25T08:00:00Z'::timestamp(3),'2026-10-25T08:00:00Z'::timestamp(3))`, [id, owner.userId, brand, model, city]);
  return id;
 }
 it.each(["support", "history"] as const)("prepares a supplied Listing before first %s open", async purpose => {
  const owner = await principal(), listingId = await listing(owner), b = await connection(), a = caller();
  await b.query("BEGIN"); await b.query('SELECT id FROM listings WHERE id=$1 FOR UPDATE', [listingId]);
  const result = observe(a.service.open(owner, purpose, listingId)); await a.started;
  await blocked(a.pid(), await pid(b)); await b.query("COMMIT");
  const outcome = await result; expect(outcome.ok).toBe(true); if (!outcome.ok) throw outcome.error;
  const resource = purpose === "support" ? await db.supportCase.findUnique({ where: { id: outcome.value.resourceId } }) : await db.vehicleHistoryRequest.findUnique({ where: { id: outcome.value.resourceId } });
  expect(resource).toMatchObject({ sourceListingId: listingId, customerId: owner.userId });
  expect(await audit(outcome.value.resourceId)).toEqual([]);
 });
 it("handover committed first refuses a stale customer send with no message or extra outbox", async () => {
  const f = await fixture();
  let assignedState: Awaited<ReturnType<typeof transactionalState>> | undefined;
  const a = caller({ hold: true, inspect: async tx => { assignedState = await transactionalState(tx); } }), b = caller();
  const assign = observe(a.service.assign(f.staff, f.id, 1, f.peer.userId)); await a.ready;
  const send = observe(b.service.send(f.owner, f.id, { clientMessageId: fixtureId(), body: "after handover", visibility: "customer" })); await b.started;
  await blocked(b.pid(), a.pid()); a.release(); expect((await assign).ok).toBe(true); const refused = await send; expect(refused.ok).toBe(false); if (!refused.ok) expect(refused.error).toMatchObject({ code: "NO_ACCESS" });
  expect(await transactionalState(), "stale send adds nothing to the exact committed handover").toEqual(present(assignedState));
  expect(await db.supportCase.findUnique({ where: { id: f.resource } })).toMatchObject({ assigneeId: f.peer.userId, assignmentVersion: 2 });
  expect(await effects(f.id)).toEqual({ messages: 0, outbox: 1, reads: 0, subscriptions: 0 });
 });
 it.each(["accept", "purchase"] as const)("%s first releases a shared provider before the opposing real caller completes", async first => {
  const f = await history(), other = await history();
  const paidAt = new Date("2000-01-01T08:00:00Z");
  const order = await db.historyOrder.create({ data: { createdAt: now, id: fixtureId(), requestId: other.resource, quoteId: other.quote.id, day: other.day, morning: false, state: "paid", paidAt, receivedAt: paidAt, holdExpiresAt: future, promiseAt: future, rights } });
  const purchase: S.HistoryCommand = { kind: "purchase", orderId: order.id, expectedAssignmentVersion: 1, expectedVersion: 0, reason: "fixture FIFO purchase" };
  const a = caller({ hold: true }), b = caller();
  const leading = observe(first === "accept" ? a.service.historyCommand(f.owner, f.id, f.accept) : a.service.historyCommand(other.staff, other.id, purchase)); await a.ready;
  const trailing = observe(first === "accept" ? b.service.historyCommand(other.staff, other.id, purchase) : b.service.historyCommand(f.owner, f.id, f.accept)); await b.started;
  await blocked(b.pid(), a.pid()); a.release(); expect((await leading).ok).toBe(true); expect((await trailing).ok).toBe(true);
  expect((await db.historyOrder.findUniqueOrThrow({ where: { requestId: f.resource } })).state).toBe("held");
  expect(await db.historyOrder.findUnique({ where: { id: order.id } })).toMatchObject({ state: "purchasing", version: 1 });
  expect(await db.historyPurchaseIntent.findUnique({ where: { orderId: order.id } })).toMatchObject({ state: "prepared", createdById: other.staff.userId });
  expect((await db.historyProviderAllowance.findUniqueOrThrow({ where: { provider_day: { provider: "carfax", day: f.day } } })).consumed).toBe(1);
 });

 // Snapshot only this case's isolated database. Receipts must be empty after
 // each committed/refused entry; external bytes are asserted separately.
 async function transactionalState(tx?: Prisma.TransactionClient) {
  const tables = ["users", "sessions", "staff_grants", "fcm_devices", "audit_logs", "history_capacity_days", "history_provider_allowances", "support_cases", "vehicle_history_requests", "service_conversations", "service_messages", "service_attachments", "service_audits", "service_outbox", "service_read_states", "service_push_subscriptions", "history_quotes", "history_orders", "history_payments", "history_purchase_intents", "history_refunds", "history_bookings", "history_artifacts", "history_deliveries", "campaign_preparations", "diagnostic_source_commands"];
  return Promise.all(tables.map(async table => {
   const query = `SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY to_jsonb(r)::text),'[]') AS rows FROM public.${table} r`;
   const rows = tx ? await tx.$queryRawUnsafe<{ rows: unknown }[]>(query) : (await pool.query<{ rows: unknown }>(query)).rows;
   return { table, rows: present(rows[0]).rows };
  }));
 }
 const publicEntries = ["openSupport", "openHistory", "read", "send", "assign", "supportCommand", "markRead", "subscribePush", "mine", "queue", "stage", "upload", "file", "historyCommand", "historyArtifactCommand", "historyArtifactUpload", "historyReportFile", "historyReports", "historyPrevious", "historySnapshot"] as const;
 it.each(publicEntries)("%s reaches its lawful live outcome, then refuses the same actor's revoked Session without residue", async entry => {
  // Every refusal reuses the actor, target and command that reached production
  // work with a live Session. Staff-only entries never borrow a customer actor.
  const archive = entry === "historyArtifactCommand" ? await pair() : undefined;
  const artifact = (["historyArtifactUpload", "historyReportFile", "historyReports", "historyPrevious"] as readonly string[]).includes(entry) ? await stagedArtifact() : undefined;
  const f = archive?.f ?? artifact?.f ?? await history();
  const support = entry === "supportCommand" ? await fixture("support", f.owner) : undefined;
  const subject = support?.staff ?? (["assign", "queue", "historyArtifactCommand", "historyArtifactUpload"].includes(entry) ? f.staff : f.owner);
  const storage = artifact?.storage ?? byteStore(), bytes = artifact?.bytes ?? await image();
  const messageId = fixtureId(), deviceId = fixtureId(), token = `r6a-m1-${fixtureId()}`;
  const upload: S.ServiceStageAttachment = { category: "history_communication", visibility: "customer", contentType: "image/webp", sizeBytes: bytes.length, filename: "fixture.webp", rights: { ...rights, category: "history_communication" } };
  let attachmentId: string | undefined, fileBytes: Uint8Array | undefined;
  if (entry === "upload" || entry === "file") {
   const setup = caller({ store: storage.store }).service;
   attachmentId = (await setup.stage(subject, f.id, upload)).id;
   if (entry === "file") {
    await setup.upload(subject, f.id, attachmentId, bytes);
    await setup.send(subject, f.id, { clientMessageId: fixtureId(), attachmentId, visibility: "customer" });
    const attachment = await db.serviceAttachment.findUniqueOrThrow({ where: { id: attachmentId } });
    expect(attachment).toMatchObject({ state: "adopted", uploaderId: subject.userId, conversationId: f.id, lifecycleEpoch: 0 });
    fileBytes = present(storage.objects.get(present(attachment.objectKey ?? undefined)));
   }
  }
  if (entry === "subscribePush") await caller().run(tx => saveDevice(tx, { id: deviceId, token, userId: subject.userId, invalidatedAt: null }));
  if (artifact && entry !== "historyArtifactUpload") {
   const setup = caller({ store: storage.store }).service;
   await setup.historyArtifactUpload(f.staff, f.id, artifact.artifactId, bytes);
   await setup.historyArtifactCommand(f.staff, f.id, { kind: "verify", orderId: artifact.order.id, artifactId: artifact.artifactId, expectedAssignmentVersion: 1, vin, originalDate: now.toISOString(), readablePages: 1, readable: true });
   await setup.historyArtifactCommand(f.staff, f.id, { kind: "deliver", orderId: artifact.order.id, artifactId: artifact.artifactId, expectedAssignmentVersion: 1, expectedVersion: 0, sharedLink: "https://example.invalid/m1-report", linkMatches: true, linkChecked: true });
   expect(await db.historyDelivery.findMany({ where: { orderId: artifact.order.id }, select: { artifactId: true } })).toEqual([{ artifactId: artifact.artifactId }]);
  }
  const work = (service: Caller): Promise<unknown> => {
   switch (entry) {
    case "openSupport": return service.open(subject, "support");
    case "openHistory": return service.open(subject, "history");
    case "read": return service.read(subject, f.id, 0, 20);
    case "send": return service.send(subject, f.id, { clientMessageId: messageId, body: "M1 lawful message", visibility: "customer" });
    case "assign": return service.assign(subject, f.id, 1, f.peer.userId);
    case "supportCommand": return service.supportCommand(subject, present(support).id, { kind: "close_resolved" });
    case "markRead": return service.markRead(subject, f.id, 5);
    case "subscribePush": return service.subscribePush(subject, f.id, token);
    case "mine": return service.mine(subject);
    case "queue": return service.queue(subject, "history");
    case "stage": return service.stage(subject, f.id, upload);
    case "upload": return service.upload(subject, f.id, present(attachmentId), bytes);
    case "file": return service.file(subject, f.id, present(attachmentId));
    case "historyCommand": return service.historyCommand(subject, f.id, f.accept);
    case "historyArtifactCommand": return service.historyArtifactCommand(subject, f.id, present(archive).archive);
    case "historyArtifactUpload": return service.historyArtifactUpload(subject, f.id, present(artifact).artifactId, bytes);
    case "historyReportFile": return service.historyReportFile(subject, f.id, present(artifact).artifactId);
    case "historyReports": return service.historyReports(subject, f.id);
    case "historyPrevious": return service.historyPrevious(subject, vin);
    case "historySnapshot": return service.historySnapshot(subject, f.id);
   }
  };
  let reached = 0;
  const inspect = async (tx: Prisma.TransactionClient, result: unknown) => {
   // This observes the real completed callback before optional outer rollback.
   // A generic rejected promise cannot satisfy these entry-specific controls.
   switch (entry) {
    case "openSupport": case "openHistory": {
     const opened = result as { id: string; resourceId: string }, purpose = entry === "openSupport" ? "support" : "history";
     expect(opened).toEqual({ id: expect.any(String), resourceId: expect.any(String) });
     expect(await tx.serviceConversation.findUnique({ where: { id: opened.id } })).toMatchObject({ purpose, lastSequence: 0, lifecycleEpoch: 0, ...(purpose === "support" ? { supportCaseId: opened.resourceId } : { historyRequestId: opened.resourceId }) });
     const owner = purpose === "support" ? await tx.supportCase.findUnique({ where: { id: opened.resourceId } }) : await tx.vehicleHistoryRequest.findUnique({ where: { id: opened.resourceId } });
     expect(owner).toMatchObject({ customerId: subject.userId, assignmentVersion: 0, mode: "synthetic" }); break;
    }
    case "read": expect(result).toMatchObject({ id: f.id, resourceId: f.resource, messages: [], assignmentVersion: 1, lastSequence: 8, readThrough: 0, unread: 0 }); break;
    case "send":
     expect(result).toMatchObject({ clientMessageId: messageId, sequence: 9, body: "M1 lawful message", visibility: "customer", sender: "customer" });
     expect(await tx.serviceMessage.findMany({ where: { conversationId: f.id }, select: { sequence: true, senderId: true, clientMessageId: true } })).toEqual([{ sequence: 9, senderId: subject.userId, clientMessageId: messageId }]);
     expect(await tx.serviceOutbox.findMany({ where: { conversationId: f.id }, select: { sequence: true, eventType: true } })).toEqual([{ sequence: 9, eventType: "message" }]); break;
    case "assign":
     expect(result).toBeUndefined();
     expect(await tx.vehicleHistoryRequest.findUnique({ where: { id: f.resource } })).toMatchObject({ assigneeId: f.peer.userId, assignmentVersion: 2 });
     expect(await tx.serviceAudit.findMany({ where: { resourceId: f.resource }, select: { action: true, actorId: true, targetStaffId: true, assignmentVersion: true }, orderBy: { action: "asc" } })).toEqual([{ action: "SERVICE_ASSIGN", actorId: subject.userId, targetStaffId: null, assignmentVersion: 1 }, { action: "SERVICE_HANDOVER", actorId: subject.userId, targetStaffId: f.peer.userId, assignmentVersion: 2 }]);
     expect(await tx.serviceOutbox.findMany({ where: { conversationId: f.id }, select: { eventType: true, sequence: true } })).toEqual([{ eventType: "handover", sequence: 9 }]); break;
    case "supportCommand":
     expect(result).toBeUndefined();
     expect(await tx.supportCase.findUnique({ where: { id: present(support).resource } })).toMatchObject({ status: "closed", closedAt: now, assignmentVersion: 1 });
     expect(await tx.serviceAudit.findMany({ where: { resourceId: present(support).resource }, select: { action: true, actorId: true }, orderBy: { action: "asc" } })).toEqual([{ action: "SERVICE_NOTE", actorId: subject.userId }, { action: "SUPPORT_CLOSE_RESOLVED", actorId: subject.userId }]); break;
    case "markRead":
     expect(result).toBeUndefined();
     expect(await tx.serviceReadState.findMany({ where: { conversationId: f.id }, select: { userId: true, lastSequence: true } })).toEqual([{ userId: subject.userId, lastSequence: 5 }]); break;
    case "subscribePush":
     expect(result).toBeUndefined();
     expect(await tx.servicePushSubscription.findMany({ where: { conversationId: f.id }, select: { sessionId: true, deviceId: true, conversationId: true, lifecycleEpoch: true } })).toEqual([{ sessionId: subject.sessionId, deviceId, conversationId: f.id, lifecycleEpoch: 0 }]); break;
    case "mine": expect(result).toEqual([{ id: f.id, purpose: "history", createdAt: now.toISOString() }]); break;
    case "queue": expect(result).toEqual([{ id: f.id, resourceId: f.resource, assigned: true, assignmentVersion: 1, createdAt: now.toISOString() }]); break;
    case "stage": {
     const staged = result as { id: string }; expect(staged).toEqual({ id: expect.any(String) });
     expect(await tx.serviceAttachment.findUnique({ where: { id: staged.id } })).toMatchObject({ conversationId: f.id, uploaderId: subject.userId, lifecycleEpoch: 0, state: "staged", expectedBytes: bytes.length, contentType: "image/webp", filename: "fixture.webp", objectKey: null, sizeBytes: null }); break;
    }
    case "upload": {
     const row = await tx.serviceAttachment.findUniqueOrThrow({ where: { id: present(attachmentId) } });
     expect(row).toMatchObject({ conversationId: f.id, uploaderId: subject.userId, state: "staged", sha256: expect.stringMatching(/^[a-f0-9]{64}$/), objectKey: `service-private/${f.id}/${present(attachmentId)}/${row.sha256}` });
     if (reached === 0) {
      expect(result).toMatchObject({ key: row.objectKey, sha256: row.sha256, contentType: "image/webp", epoch: 0 });
      expect(row.sizeBytes).toBeNull(); expect(storage.objects.size).toBe(0);
     } else {
      expect(result).toBeUndefined(); const stored = present(storage.objects.get(present(row.objectKey ?? undefined)));
      expect(row.sizeBytes).toBe(stored.length); expect(row.sha256).toBe(createHash("sha256").update(stored).digest("hex"));
     }
     break;
    }
    case "file": expect(result).toEqual({ bytes: present(fileBytes), contentType: "image/webp", filename: "fixture.webp" }); break;
    case "historyCommand":
     expect(result).toBeUndefined();
     expect(await tx.historyOrder.findUnique({ where: { requestId: f.resource } })).toMatchObject({ quoteId: f.quote.id, state: "held", day: f.day, version: 0 });
     expect(await tx.historyQuote.findUnique({ where: { id: f.quote.id } })).toMatchObject({ acceptedAt: now });
     expect(await tx.serviceAudit.findMany({ where: { resourceId: f.resource }, select: { action: true, actorId: true } })).toEqual([{ action: "HISTORY_ACCEPT", actorId: subject.userId }]); break;
    case "historyArtifactCommand":
     expect(result).toBeUndefined();
     expect(await tx.historyPurchaseIntent.findUnique({ where: { orderId: present(archive).order.id } })).toMatchObject({ sourceArtifactId: present(archive).artifact.id, createdById: subject.userId, state: "completed" });
     expect(await tx.historyOrder.findUnique({ where: { id: present(archive).order.id } })).toMatchObject({ state: "fulfilling", version: 1 }); break;
    case "historyArtifactUpload":
     expect(result).toBeUndefined(); expect(storage.objects.get(present(artifact).key)).toEqual(bytes);
     expect(await tx.historyArtifact.findUnique({ where: { id: present(artifact).artifactId } })).toMatchObject({ state: "staged", acquiredForOrderId: present(artifact).order.id, objectKey: present(artifact).key }); break;
    case "historyReportFile": expect(result).toEqual({ bytes, contentType: "application/pdf", filename: `carfax-${vin}.pdf` }); break;
    case "historyReports": expect(result).toMatchObject({ delivered: [{ id: present(artifact).artifactId, state: "verified", sharedLink: "https://example.invalid/m1-report" }], archive: [], staged: [] }); break;
    case "historyPrevious": expect(result).toEqual([{ conversationId: f.id, vin }]); break;
    case "historySnapshot": expect(result).toMatchObject({ synthetic: true, quotes: [{ id: f.quote.id, vin, providers: ["carfax"], feasible: true, acceptedAt: null }], order: null, payments: [] }); break;
   }
   reached++;
  };
  const beforeControl = await transactionalState();
  // upload owns two transactions, so it must finish both. Its now-uploaded
  // target lawfully supports an idempotent repeat with the same bytes/command.
  const commitsControl = entry === "upload";
  const control = caller({ store: storage.store, rollback: !commitsControl, inspect });
  if (commitsControl) await expect(work(control.service)).resolves.toBeUndefined();
  else await expect(work(control.service)).rejects.toThrow("caller outer rollback");
  expect(reached, `${entry} reached its named lawful production outcome`).toBe(commitsControl ? 2 : 1);
  if (!commitsControl) expect(await transactionalState(), "positive control outer rollback is complete").toEqual(beforeControl);
  const sessionsBefore = await db.session.findMany({ where: { userId: subject.userId } });
  expect(sessionsBefore.map(row => row.id)).toEqual([subject.sessionId]);
  await sessionWriter(caller().database).delete(subject.sessionId);
  expect(await db.session.findUnique({ where: { id: subject.sessionId } })).toBeNull();
  const before = await transactionalState();
  const bytesBefore = [...storage.objects].map(([key, value]) => [key, Buffer.from(value).toString("hex")]);
  const ioBefore = { reads: [...storage.released], writes: [...storage.written], removals: [...storage.removed] };
  await expect(work(caller({ store: storage.store }).service)).rejects.toMatchObject({ code: "NO_ACCESS" });
  expect(await transactionalState(), "revoked Session refuses without transactional residue").toEqual(before);
  expect([...storage.objects].map(([key, value]) => [key, Buffer.from(value).toString("hex")])).toEqual(bytesBefore);
  expect({ reads: storage.released, writes: storage.written, removals: storage.removed }, "revoked Session causes no external byte I/O").toEqual(ioBefore);
 });

 it.each((["customer", "staff"] as const).flatMap(audience => (["writer", "service"] as const).map(first => ({ audience, first }))))(
  "$first first: $audience read opposes actual SuspendUser outer transaction", async ({ audience, first }) => {
  const f = await fixture(), subject = audience === "customer" ? f.owner : f.staff;
  const admin = await principal();
  await db.user.update({ where: { id: admin.userId }, data: { role: "admin" } });
  const secondSession = await db.session.create({ data: { id: fixtureId(), userId: subject.userId, refreshTokenHash: fixtureId(), createdAt: now, expiresAt: future } });
  const beforeUser = await db.user.findUniqueOrThrow({ where: { id: subject.userId } });
  expect(beforeUser).toMatchObject({ suspendedAt: null, suspendedById: null, suspensionReason: null });
  expect(await db.session.findMany({ where: { userId: subject.userId }, select: { id: true }, orderBy: { id: "asc" } })).toEqual([{ id: subject.sessionId }, { id: secondSession.id }]);
  const reportsBefore = await db.contentReport.findMany({ orderBy: { id: "asc" } });
  const reason = "R6a original M2 actual suspension";
  const a = caller({ hold: first === "service" }), b = caller({ hold: first === "writer" });
  let suspensionInterval: { started: Date; completed: Date } | undefined;
  const suspend = async () => {
   const started = new Date();
   try { return await suspensionWriter(b.database).execute({ userId: subject.userId, adminUserId: admin.userId, reason }); }
   finally { suspensionInterval = { started, completed: new Date() }; }
  };
  const read = () => a.service.read(subject, f.id, 0, 20);
  // Register both outcomes immediately. afterEach releases every latch and
  // drains both even when ready/barrier/assertions fail, preserving that error.
  const lead = observe<unknown>(first === "writer" ? suspend() : read());
  let trail: typeof lead | undefined;
  try {
   // A pre-transaction owner refusal must retain its original error rather
   // than wait for a readiness latch that the transaction never reached.
   await Promise.race([(first === "writer" ? b.ready : a.ready), lead.then(outcome => { if (!outcome.ok) throw outcome.error; })]);
   trail = observe<unknown>(first === "writer" ? read() : suspend());
   await Promise.race([(first === "writer" ? a.started : b.started), trail.then(outcome => { if (!outcome.ok) throw outcome.error; })]);
   await blocked(first === "writer" ? a.pid() : b.pid(), first === "writer" ? b.pid() : a.pid());
  } finally {
   a.release(); b.release();
   await Promise.allSettled([lead, ...(trail ? [trail] : [])]);
  }
  const leading = await lead, trailing = await present(trail);
  const write = first === "writer" ? leading : trailing, readResult = first === "writer" ? trailing : leading;
  expect(write.ok, "actual SuspendUser outer transaction commits").toBe(true);
  if (!write.ok) throw write.error;
  const suspendedAt = (write.value as Awaited<ReturnType<SuspensionWriter["execute"]>>).targetState.suspendedAt;
  const interval = present(suspensionInterval);
  expect(suspendedAt).toBeInstanceOf(Date);
  expect(suspendedAt.getTime(), "reviewedAt is inside independently observed real execution").toBeGreaterThanOrEqual(interval.started.getTime());
  expect(suspendedAt.getTime()).toBeLessThanOrEqual(interval.completed.getTime());
  expect(write.value).toEqual({ targetId: subject.userId, targetState: { suspendedAt, suspendedById: admin.userId, suspensionReason: reason }, reportId: undefined, reportStatus: undefined, auditLogId: expect.any(String) });
  expect(readResult.ok, "one read decision at the real suspension barrier").toBe(first === "service");
  if (!readResult.ok) expect(readResult.error).toMatchObject({ code: "NO_ACCESS" });
  else expect(readResult.value).toMatchObject({ id: f.id, resourceId: f.resource, assignmentVersion: 1, messages: [], lastSequence: 8, readThrough: 0, unread: 0, hasMore: false });
  const suspendedUser = await db.user.findUniqueOrThrow({ where: { id: subject.userId } });
  expect(suspendedUser.updatedAt.getTime(), "native User updatedAt belongs to the same real execution").toBeGreaterThanOrEqual(suspendedAt.getTime());
  expect(suspendedUser.updatedAt.getTime()).toBeLessThanOrEqual(interval.completed.getTime());
  expect(suspendedUser).toEqual({ ...beforeUser, updatedAt: suspendedUser.updatedAt, suspendedAt, suspendedById: admin.userId, suspensionReason: reason });
  expect(await db.session.findMany({ where: { userId: subject.userId } }), "all target Sessions revoked").toEqual([]);
  expect(await db.session.findUnique({ where: { id: admin.sessionId } }), "admin Session survives target suspension").not.toBeNull();
  const moderation = await db.auditLog.findMany({ orderBy: { id: "asc" }, select: { id: true, actorId: true, action: true, targetType: true, targetId: true, details: true } });
  expect(moderation, "exact owner-written moderation audit").toEqual([{ id: (write.value as { auditLogId: string }).auditLogId, actorId: admin.userId, action: "USER_SUSPEND", targetType: "user", targetId: subject.userId, details: { reason, before: { suspendedAt: null, suspendedById: null, suspensionReason: null }, after: { suspendedAt: suspendedAt.toISOString(), suspendedById: admin.userId, suspensionReason: reason } } }]);
  expect(await db.contentReport.findMany({ orderBy: { id: "asc" } }), "direct suspension leaves reports unchanged").toEqual(reportsBefore);
  expect(await audit(f.resource), "only successful staff read emits SERVICE_READ").toEqual(first === "service" && audience === "staff" ? [{ action: "SERVICE_READ", actorId: subject.userId, assignmentVersion: 1 }] : []);
  expect(await effects(f.id), "refused read leaves no service residue").toEqual({ messages: 0, outbox: 0, reads: 0, subscriptions: 0 });
  expect(await db.serviceConversation.findUnique({ where: { id: f.id } })).toMatchObject({ lastSequence: 8, lifecycleEpoch: 0 });
 });

 const lifecycleChanges = ["schedule", "expire", "revoke", "elevation", "grantRevoke", "grantInsert"] as const;
 it.each(lifecycleChanges.flatMap(change => (["customer", "staff"] as const).flatMap(audience => (["writer", "service"] as const).map(first => ({ change, audience, first })))))(
  "$first first: $audience read opposes real $change lifecycle entry", async ({ change, audience, first }) => {
  const f = await fixture(), subject = audience === "customer" ? f.owner : f.staff;
  const manager = await principal(true);
  await db.staffGrant.create({ data: { userId: manager.userId, capability: "staff.manage", grantedAt: now } });
  const targetCapability = "support.operations";
  if (audience === "customer" && change === "grantRevoke") await db.staffGrant.create({ data: { userId: subject.userId, capability: targetCapability, grantedAt: now } });
  if (change === "grantInsert") await db.staffGrant.deleteMany({ where: { userId: subject.userId, capability: targetCapability } });
  const a = caller({ hold: first === "service", holdFailure: first === "service" }), b = caller({ hold: first === "writer" });
  const old = await db.session.findUniqueOrThrow({ where: { id: subject.sessionId } });
  const mutate = async () => {
   if (change === "revoke") return sessionWriter(b.database).delete(subject.sessionId);
   if (change === "expire") { expect(await sessionWriter(b.database).rotateRefreshToken(subject.sessionId, old.refreshTokenHash, fixtureId(), now, now)).toBe(true); return; }
   if (change === "elevation") return sessionWriter(b.database).updateAdminTotpExpiresAt(subject.sessionId, now);
   if (change === "grantRevoke" || change === "grantInsert") return grantWriter(b.database).change({ ...manager, targetUserId: subject.userId, capability: targetCapability, grant: change === "grantInsert", reason: "R6a real lifecycle opposition" }, now);
   return deletionWriter(b.database).run({ userId: subject.userId, deletionScheduledAt: now }, async writes => {
    await writes.scheduleDeletion(subject.userId, now); await writes.archiveActiveListings(subject.userId);
   });
  };
  const lead = observe<unknown>(first === "writer" ? mutate() : a.service.read(subject, f.id, 0, 20));
  await (first === "writer" ? b.ready : a.ready);
  const trail = observe<unknown>(first === "writer" ? a.service.read(subject, f.id, 0, 20) : mutate());
  await (first === "writer" ? a.started : b.started);
  await blocked(first === "writer" ? a.pid() : b.pid(), first === "writer" ? b.pid() : a.pid());
  (first === "writer" ? b : a).release();
  const leading = await lead, trailing = await trail;
  const write = first === "writer" ? leading : trailing, read = first === "writer" ? trailing : leading;
  expect(write.ok).toBe(true); if (!write.ok) throw write.error;
  const initiallyDenied = audience === "staff" && change === "grantInsert";
  // Writer-first graph changes refuse once before actor work, even when the
  // newly granted capability would authorize an independent subsequent call.
  expect(read.ok).toBe(first === "service" && !initiallyDenied);
  if (!read.ok) expect(read.error).toMatchObject({ code: "NO_ACCESS" });
  expect(await audit(f.resource)).toEqual(first === "service" && audience === "staff" && !initiallyDenied ? [{ action: "SERVICE_READ", actorId: subject.userId, assignmentVersion: 1 }] : []);
  expect(await effects(f.id)).toEqual({ messages: 0, outbox: 0, reads: 0, subscriptions: 0 });
  if (change === "revoke") expect(await db.session.findUnique({ where: { id: subject.sessionId } })).toBeNull();
  if (change === "expire") expect((await db.session.findUniqueOrThrow({ where: { id: subject.sessionId } })).expiresAt).toEqual(now);
  if (change === "elevation") expect((await db.session.findUniqueOrThrow({ where: { id: subject.sessionId } })).adminTotpExpiresAt).toEqual(now);
  if (change === "schedule") expect((await db.user.findUniqueOrThrow({ where: { id: subject.userId } })).deletionScheduledAt).toEqual(now);
 });

 it("commits the exact monotonic watermark after a real wait without a customer audit", async () => {
  const f = await fixture(), b = await actorBarrier(f.owner), a = caller();
  const result = observe(a.service.markRead(f.owner, f.id, 5)); await a.started;
  await blocked(a.pid(), await pid(b)); await b.query("COMMIT"); expect((await result).ok).toBe(true);
  await a.service.markRead(f.owner, f.id, 3); await a.service.markRead(f.owner, f.id, 99);
  expect(await db.serviceReadState.findMany({ where: { conversationId: f.id }, select: { userId: true, lastSequence: true } })).toEqual([{ userId: f.owner.userId, lastSequence: 8 }]);
  expect(await audit(f.resource)).toEqual([]); expect(await effects(f.id)).toEqual({ messages: 0, outbox: 0, reads: 1, subscriptions: 0 });
 });

 it.each(["writer", "service"] as const)("%s first Support close opposes real peer handover", async first => {
  const f = await fixture(), a = caller({ hold: true }), b = caller();
  const close = (service: Caller) => service.supportCommand(f.staff, f.id, { kind: "close_resolved" });
  const handover = (service: Caller) => service.assign(f.staff, f.id, 1, f.peer.userId);
  const lead = observe(first === "writer" ? handover(a.service) : close(a.service)); await a.ready;
  const trail = observe(first === "writer" ? close(b.service) : handover(b.service)); await b.started;
  await blocked(b.pid(), a.pid()); a.release(); expect((await lead).ok).toBe(true);
  const refused = await trail; expect(refused.ok).toBe(false); if (!refused.ok) expect(refused.error).toMatchObject({ code: "NO_ACCESS" });
  expect(await db.supportCase.findUnique({ where: { id: f.resource } })).toMatchObject(first === "writer" ? { status: "open", assigneeId: f.peer.userId, assignmentVersion: 2 } : { status: "closed", closedAt: now, assigneeId: f.staff.userId, assignmentVersion: 1 });
  expect(await effects(f.id)).toEqual({ messages: 0, outbox: first === "writer" ? 1 : 0, reads: 0, subscriptions: 0 });
 });

 it.each((["mine", "queue"] as const).flatMap(page => (["listing", "order"] as const).map(change => ({ page, change }))))("stable whole $page page holds distinct retained Listings before $change mutation", async ({ page, change }) => {
  const owner = await principal(), first = await fixture("history", owner), second = await fixture("history", page === "mine" ? owner : undefined);
  const one = await listing(owner), two = await listing(second.owner);
  await db.vehicleHistoryRequest.update({ where: { id: first.resource }, data: { sourceListingId: one, createdAt: new Date("2026-10-25T06:00:00Z") } });
  await db.vehicleHistoryRequest.update({ where: { id: second.resource }, data: { sourceListingId: two, createdAt: new Date("2026-10-25T07:00:00Z") } });
  await db.serviceConversation.update({ where: { id: first.id }, data: { createdAt: new Date("2026-10-25T07:00:00Z") } });
  await db.serviceConversation.update({ where: { id: second.id }, data: { createdAt: new Date("2026-10-25T06:00:00Z") } });
  const subject = page === "mine" ? owner : first.staff, a = caller({ hold: true }), b = await connection();
  const read = observe(page === "mine" ? a.service.mine(subject) : a.service.queue(subject, "history")); await a.ready;
  await b.query("BEGIN"); const waiter = await pid(b);
  // Controlled retained-Listing mutation, explicitly fault injection, not a
  // claimed production Listing opponent. Both page references are locked.
  const update = observe(change === "listing" ? b.query('UPDATE listings SET "priceAmount"=2 WHERE id=$1', [two]) : page === "mine" ? b.query('UPDATE service_conversations SET "createdAt"=$1 WHERE id=$2', [now, second.id]) : b.query('UPDATE vehicle_history_requests SET "createdAt"=$1 WHERE id=$2', [new Date("2026-10-25T05:00:00Z"), second.resource]));
  await blocked(waiter, a.pid()); a.release();
  expect(await read).toMatchObject({ ok: true, value: [{ id: first.id }, { id: second.id }] });
  expect((await update).ok).toBe(true); await b.query("COMMIT");
  expect(await audit(first.resource)).toEqual([]); expect(await audit(second.resource)).toEqual([]);
 });

 it.each(["mine", "queue" ] as const)("refuses the entire %s membership when real first-open commits during discovery wait", async page => {
  const owner = await principal(), first = await fixture("history", owner), staff = first.staff;
  const a = caller({ hold: true }), b = caller();
  // open has already inserted the new member but it is invisible to the page's
  // unlocked selection. Page then waits on the same actor, and must rediscover.
  const opened = observe(a.service.open(owner, "history")); await a.ready;
  const read = observe(page === "mine" ? b.service.mine(owner) : b.service.queue(staff, "history")); await b.started;
  await blocked(b.pid(), a.pid()); a.release(); expect((await opened).ok).toBe(true);
  const result = await read; expect(result.ok).toBe(false); if (!result.ok) expect(result.error).toMatchObject({ code: "NO_ACCESS" });
  expect(await audit(first.resource)).toEqual([]);
  expect((page === "mine" ? await caller().service.mine(owner) : await caller().service.queue(staff, "history"))).toHaveLength(2);
 });

 it.each(([false, true] as const).flatMap(existing => (["owner", "invalidated", "session"] as const).flatMap(change => (["writer", "service"] as const).map(first => ({ existing, change, first })))))(
  "$first first: existing=$existing push opposes actual $change writer", async ({ existing, change, first }) => {
  const f = await fixture(), device = await db.fcmDevice.create({ data: { id: fixtureId(), userId: f.owner.userId, token: fixtureId(), platform: "android", createdAt: now, updatedAt: now, lastUsedAt: now } });
  if (existing) await db.servicePushSubscription.create({ data: { id: fixtureId(), sessionId: f.owner.sessionId, deviceId: device.id, conversationId: f.id, lifecycleEpoch: 0, createdAt: now, updatedAt: now } });
  const before = await transactionalState();
  const subscriptionsBefore = await db.servicePushSubscription.findMany({ orderBy: { id: "asc" } });
  let serviceState: Awaited<ReturnType<typeof transactionalState>> | undefined;
  let serviceSubscriptions: Awaited<ReturnType<typeof db.servicePushSubscription.findMany>> | undefined;
  const started = new Date();
  const a = caller({ hold: first === "service", inspect: async tx => {
   if (first === "service" && change === "session") {
    serviceSubscriptions = await tx.servicePushSubscription.findMany({ orderBy: { id: "asc" } });
    serviceState = await transactionalState(tx);
   }
  } }), b = caller({ hold: first === "writer" });
  const mutate = () => change === "session" ? sessionWriter(b.database).delete(f.owner.sessionId) : b.run(tx => saveDevice(tx, { id: device.id, token: device.token, userId: change === "owner" ? f.peer.userId : f.owner.userId, invalidatedAt: change === "invalidated" ? now : null }));
  const lead = observe(first === "writer" ? mutate() : a.service.subscribePush(f.owner, f.id, device.token)); await (first === "writer" ? b.ready : a.ready);
  const trail = observe(first === "writer" ? a.service.subscribePush(f.owner, f.id, device.token) : mutate()); await (first === "writer" ? a.started : b.started);
  await blocked(first === "writer" ? a.pid() : b.pid(), first === "writer" ? b.pid() : a.pid()); (first === "writer" ? b : a).release();
  const leading = await lead, trailing = await trail, subscribed = first === "writer" ? trailing : leading, written = first === "writer" ? leading : trailing;
  if (first === "service" && change === "session") {
   expect(subscribed).toEqual({ ok: true, value: undefined });
   expect(written.ok).toBe(false);
   if (!written.ok) expect(written.error).toMatchObject({ meta: { driverAdapterError: { cause: { originalCode: "P0001", originalMessage: "diagnostic_source_graph_changed" } } } });
   const after = await transactionalState(), rows = present(serviceSubscriptions), completed = new Date();
   expect(rows).toHaveLength(1);
   const row = present(rows[0]);
   expect(row).toEqual({ id: row.id, sessionId: f.owner.sessionId, deviceId: device.id, conversationId: f.id, lifecycleEpoch: 0, createdAt: existing ? now : row.createdAt, updatedAt: row.updatedAt });
   expect(row.updatedAt.getTime()).toBeGreaterThanOrEqual(started.getTime()); expect(row.updatedAt.getTime()).toBeLessThanOrEqual(completed.getTime());
   if (!existing) { expect(row.createdAt.getTime()).toBeGreaterThanOrEqual(started.getTime()); expect(row.createdAt.getTime()).toBeLessThanOrEqual(completed.getTime()); }
   else expect(row.id).toBe(present(subscriptionsBefore[0]).id);
   expect(await db.servicePushSubscription.findMany({ orderBy: { id: "asc" } })).toEqual(rows);
   expect(after, "failed actual Session deletion adds no source/audit/receipt or foreign effects").toEqual(present(serviceState));
   expect(after.filter(entry => entry.table !== "service_push_subscriptions")).toEqual(before.filter(entry => entry.table !== "service_push_subscriptions"));
   console.info("R6a M4 exact subscription transition", { existing, before: subscriptionsBefore, after: rows });
   return;
  }
  expect(written.ok).toBe(true); if (!written.ok) throw written.error;
  expect(subscribed.ok).toBe(first === "service"); if (!subscribed.ok) expect(subscribed.error).toMatchObject({ code: "NO_ACCESS" });
  // Device reassignment/invalidation does not itself erase subscriptions. A
  // refused existing upsert preserves its exact prior row; Session DELETE cascades.
  const expected = change === "session" ? [] : existing || first === "service" ? [{ sessionId: f.owner.sessionId, deviceId: device.id, conversationId: f.id, lifecycleEpoch: 0 }] : [];
  expect(await db.servicePushSubscription.findMany({ where: { conversationId: f.id }, select: { sessionId: true, deviceId: true, conversationId: true, lifecycleEpoch: true } })).toEqual(expected);
  expect(await audit(f.resource)).toEqual([]);
 });

 it.each(["rights", "adoption"] as const)("refuses attachment send after post-wait %s change, without message/outbox effects", async change => {
  const f = await fixture("history");
  const attachment = await uploadedAttachment(f, f.owner);
  const message: S.ServiceSend = { clientMessageId: fixtureId(), attachmentId: attachment.id, visibility: "customer" };
  if (change === "adoption") {
   // Production send owns the first adoption. The second request selected the
   // old attachment inventory and must fail rather than adopt twice.
   const a = caller({ hold: true }), b = caller();
   const first = observe(a.service.send(f.owner, f.id, message)); await a.ready;
   const second = observe(b.service.send(f.owner, f.id, { ...message, clientMessageId: fixtureId() })); await b.started;
   await blocked(b.pid(), a.pid()); a.release(); expect((await first).ok).toBe(true);
   const outcome = await second; expect(outcome.ok).toBe(false); if (!outcome.ok) expect(outcome.error).toMatchObject({ code: "NO_ACCESS" });
   expect(await effects(f.id)).toEqual({ messages: 1, outbox: 1, reads: 0, subscriptions: 0 });
  } else {
   // There is no public service rights editor. This is a controlled persisted
   // rights fault, not a production opposing command.
   await refusalAfter(f.owner, b => b.query('UPDATE service_attachments SET rights=$1::jsonb WHERE id=$2', [JSON.stringify({ ...rights, category: "history_communication", schedule: { kind: "until", until: now.toISOString(), reason: "expired" } }), attachment.id]), service => service.send(f.owner, f.id, message));
   expect(await effects(f.id)).toEqual({ messages: 0, outbox: 0, reads: 0, subscriptions: 0 });
   expect((await db.serviceAttachment.findUniqueOrThrow({ where: { id: attachment.id } })).state).toBe("staged");
  }
  expect(await audit(f.resource)).toEqual([]);
 });

 it.each(["writer", "service"] as const)("%s first serializes the real capacity edit against acceptance", async first => {
  const f = await history(), other = await fixture("history"), a = caller({ hold: true }), b = caller();
  const capacity = (service: Caller) => service.historyCommand(other.staff, other.id, { kind: "capacity", expectedAssignmentVersion: 1, day: f.day, slotLimit: 0, morningLimit: 0, evidence: "no remaining slots", providers: [{ provider: "carfax", allowance: 10000, consumed: 0, resetAt: now.toISOString(), evidence: "unchanged allowance" }] });
  const lead = observe(first === "writer" ? capacity(a.service) : a.service.historyCommand(f.owner, f.id, f.accept)); await a.ready;
  const trail = observe(first === "writer" ? b.service.historyCommand(f.owner, f.id, f.accept) : capacity(b.service)); await b.started;
  await blocked(b.pid(), a.pid()); a.release(); expect((await lead).ok).toBe(true);
  const result = await trail; expect(result.ok).toBe(first === "service"); if (!result.ok) expect(result.error).toMatchObject({ code: "INVALID_MESSAGE" });
  expect(await db.historyOrder.count({ where: { requestId: f.resource, state: "held" } })).toBe(first === "service" ? 1 : 0);
  expect((await db.historyQuote.findUniqueOrThrow({ where: { id: f.quote.id } })).acceptedAt).toEqual(first === "service" ? now : null);
  expect(await db.historyPayment.count()).toBe(0); expect(await db.historyRefund.count()).toBe(0); expect(await db.historyBooking.count()).toBe(0);
  expect((await db.historyProviderAllowance.findUniqueOrThrow({ where: { provider_day: { day: f.day, provider: "carfax" } } })).consumed).toBe(0);
 });

 it.each((["carfax", "autocheck"] as const).flatMap(provider => (["accept", "purchase"] as const).map(first => ({ provider, first }))))("$first first preserves accounting with $provider opposing provider", async ({ provider, first }) => {
  const f = await history(), other = await history();
  if (provider === "autocheck") {
   // Immutable quote facts require a distinct quote, never an UPDATE bypass.
   const quote = await db.historyQuote.create({ data: { id: fixtureId(), requestId: other.resource, vin, providers: [provider], preflightOutcome: "available", preflightEvidence: "disjoint provider", refundRule: "full refund", windowStart: new Date("2026-10-25T09:00:00Z"), windowEnd: new Date("2026-10-25T10:00:00Z"), feasible: true, createdAt: now } });
   other.quote = quote;
   await db.historyProviderAllowance.create({ data: { provider, day: f.day, allowance: 10, consumed: 0, resetAt: now, evidence: "disjoint" } });
  }
  const order = await db.historyOrder.create({ data: { id: fixtureId(), requestId: other.resource, quoteId: other.quote.id, day: f.day, morning: false, state: "paid", paidAt: now, receivedAt: now, holdExpiresAt: future, promiseAt: future, rights, createdAt: now } });
  const a = caller({ hold: true }), b = caller();
  const purchase = (service: Caller) => service.historyCommand(other.staff, other.id, { kind: "purchase", orderId: order.id, expectedAssignmentVersion: 1, expectedVersion: 0, reason: "real provider opposition" });
  const lead = observe(first === "purchase" ? purchase(a.service) : a.service.historyCommand(f.owner, f.id, f.accept)); await a.ready;
  const trail = observe(first === "purchase" ? b.service.historyCommand(f.owner, f.id, f.accept) : purchase(b.service)); await b.started;
  if (provider === "carfax") { await blocked(b.pid(), a.pid()); a.release(); }
  else {
   await b.ready;
   expect(present((await pool.query<{ pids: number[] }>("SELECT pg_blocking_pids($1) AS pids", [b.pid()])).rows[0]).pids).toEqual([]);
   expect((await trail).ok).toBe(true); a.release();
  }
  expect((await lead).ok).toBe(true); expect((await trail).ok).toBe(true);
  expect(await db.historyOrder.count({ where: { day: f.day, state: { in: ["held", "purchasing"] } } })).toBe(2);
  expect(await db.historyPurchaseIntent.findMany({ select: { orderId: true, state: true, providers: true } })).toEqual([{ orderId: order.id, state: "prepared", providers: [provider] }]);
  expect((await db.historyProviderAllowance.findUniqueOrThrow({ where: { provider_day: { day: f.day, provider } } })).consumed).toBe(1);
  if (provider === "autocheck") expect((await db.historyProviderAllowance.findUniqueOrThrow({ where: { provider_day: { day: f.day, provider: "carfax" } } })).consumed).toBe(0);
  expect(await db.historyPayment.count()).toBe(0); expect(await db.historyRefund.count()).toBe(0); expect(await db.historyBooking.count()).toBe(0);
 });

 it("accounts for real payment, verification, purchase no-data and approved executed refund exactly once", async () => {
  const f = await history(), service = caller().service;
  for (const capability of ["history.payment.verify", "founder.refund.approve"]) await db.staffGrant.create({ data: { userId: f.staff.userId, capability, grantedAt: now } });
  await service.historyCommand(f.owner, f.id, f.accept);
  const order = await db.historyOrder.findUniqueOrThrow({ where: { requestId: f.resource } });
  const clientPaymentId = fixtureId();
  await service.historyCommand(f.owner, f.id, { kind: "payment", orderId: order.id, clientPaymentId, claim: "synthetic receipt" });
  const payment = await db.historyPayment.findUniqueOrThrow({ where: { orderId_clientPaymentId: { orderId: order.id, clientPaymentId } } });
  await service.historyCommand(f.staff, f.id, { kind: "verify", orderId: order.id, paymentId: payment.id, expectedAssignmentVersion: 1, expectedVersion: 0, amount: 100, receivedAt: now.toISOString(), verifiedFunds: true, evidence: "synthetic confirmed funds" });
  await service.historyCommand(f.staff, f.id, { kind: "purchase", orderId: order.id, expectedAssignmentVersion: 1, expectedVersion: 1, reason: "synthetic purchase" });
  await service.historyCommand(f.staff, f.id, { kind: "purchase_no_data", orderId: order.id, expectedAssignmentVersion: 1, expectedVersion: 2, reason: "provider returned no data" });
  await service.historyCommand(f.staff, f.id, { kind: "refund_approve", orderId: order.id, expectedAssignmentVersion: 1, expectedVersion: 3, reason: "no data refund" });
  await service.historyCommand(f.staff, f.id, { kind: "refund_execute", orderId: order.id, expectedAssignmentVersion: 1, expectedVersion: 4, reason: "synthetic returned funds", reference: "fixture-refund-897" });
  expect(await db.historyOrder.findUnique({ where: { id: order.id } })).toMatchObject({ state: "refunded", version: 5, paidAt: now, receivedAt: now });
  expect(await db.historyPayment.findMany({ select: { amount: true, state: true, verifiedFunds: true } })).toEqual([{ amount: 100, state: "confirmed", verifiedFunds: true }]);
  expect(await db.historyRefund.findMany({ select: { state: true, executionReference: true, approvedById: true, executedById: true } })).toEqual([{ state: "executed", executionReference: "fixture-refund-897", approvedById: f.staff.userId, executedById: f.staff.userId }]);
  expect(await db.historyPurchaseIntent.findMany({ select: { state: true } })).toEqual([{ state: "no_data" }]);
  expect((await db.historyProviderAllowance.findUniqueOrThrow({ where: { provider_day: { day: f.day, provider: "carfax" } } })).consumed).toBe(1);
  expect(await db.historyBooking.count()).toBe(0); expect(await db.historyDelivery.count()).toBe(0);
  expect((await audit(f.resource)).filter(row => row.action.startsWith("HISTORY_")).map(row => row.action).sort()).toEqual(["HISTORY_ACCEPT", "HISTORY_PAYMENT", "HISTORY_PURCHASE", "HISTORY_PURCHASE_NO_DATA", "HISTORY_REFUND_APPROVE", "HISTORY_REFUND_EXECUTE", "HISTORY_VERIFY"]);
 });

 function byteStore() {
  const objects = new Map<string, Uint8Array>(), released: string[] = [], written: string[] = [], removed: string[] = [];
  const store: PrivateStore = {
   async putImmutable(key, bytes) {
    written.push(key);
    const prior = objects.get(key); if (prior && !Buffer.from(prior).equals(Buffer.from(bytes))) throw new Error("immutable fixture object conflict");
    objects.set(key, Uint8Array.from(bytes));
   },
   async get(key, maxBytes) {
    released.push(key);
    const bytes = objects.get(key); if (!bytes || bytes.length > maxBytes) throw new Error("missing or oversized fixture object");
    return Uint8Array.from(bytes);
   },
   async remove(key) { removed.push(key); objects.delete(key); },
  };
  return { store, objects, released, written, removed };
 }
 async function stagedArtifact() {
  const f = await history(), bytes = await pdf(), storage = byteStore();
  const order = await db.historyOrder.create({ data: { id: fixtureId(), requestId: f.resource, quoteId: f.quote.id, day: f.day, morning: false, state: "fulfilling", paidAt: now, receivedAt: now, holdExpiresAt: future, promiseAt: future, rights, createdAt: now } });
  await db.historyPurchaseIntent.create({ data: { id: fixtureId(), orderId: order.id, vin, providers: ["carfax"], state: "completed", createdById: f.staff.userId, reconciledAt: now, createdAt: now } });
  const artifactId = fixtureId(), sha256 = createHash("sha256").update(bytes).digest("hex");
  const command: S.HistoryArtifactCommand = { kind: "stage", orderId: order.id, artifactId, expectedAssignmentVersion: 1, provider: "carfax", vin, originalDate: now.toISOString(), expectedPages: 1, sizeBytes: bytes.length, sha256, rights: { ...rights, category: "provider_artifact", supplierRestrictions: "synthetic private original" }, provenance: "synthetic original", vehicleIdentity: null, mileage: null, sourceObservations: [] };
  await caller({ store: storage.store }).service.historyArtifactCommand(f.staff, f.id, command);
  return { f, order, artifactId, command, bytes, storage, key: `history-artifacts/${artifactId}/${sha256}` };
 }
 it("stages, uploads, verifies and delivers original PDF bytes with exact private audience", async () => {
  const p = await stagedArtifact(), a = caller({ store: p.storage.store });
  expect(p.storage.objects.size).toBe(0);
  expect(await db.historyArtifact.findUnique({ where: { id: p.artifactId } })).toMatchObject({ state: "staged", acquiredForOrderId: p.order.id, objectKey: p.key, verifiedAt: null });
  await a.service.historyArtifactUpload(p.f.staff, p.f.id, p.artifactId, p.bytes);
  expect(p.storage.objects.get(p.key)).toEqual(p.bytes);
  await expect(a.service.historyReportFile(p.f.owner, p.f.id, p.artifactId)).rejects.toMatchObject({ code: "NO_ACCESS" });
  expect(p.storage.released).toEqual([]);
  await a.service.historyArtifactCommand(p.f.staff, p.f.id, { kind: "verify", orderId: p.order.id, artifactId: p.artifactId, expectedAssignmentVersion: 1, vin, originalDate: now.toISOString(), readablePages: 1, readable: true });
  expect(await db.historyArtifact.findUnique({ where: { id: p.artifactId } })).toMatchObject({ state: "verified", verifiedAt: now, verifiedById: p.f.staff.userId, verifiedPages: 1 });
  expect((await a.service.historyReportFile(p.f.staff, p.f.id, p.artifactId)).bytes).toEqual(p.bytes);
  await a.service.historyArtifactCommand(p.f.staff, p.f.id, { kind: "deliver", orderId: p.order.id, artifactId: p.artifactId, expectedAssignmentVersion: 1, expectedVersion: 0, sharedLink: "https://example.invalid/report", linkMatches: true, linkChecked: true });
  expect((await a.service.historyReportFile(p.f.owner, p.f.id, p.artifactId)).bytes).toEqual(p.bytes);
  expect((await a.service.historyReports(p.f.owner, p.f.id)).delivered).toMatchObject([{ id: p.artifactId, state: "verified" }]);
  expect(await db.historyDelivery.count({ where: { orderId: p.order.id, artifactId: p.artifactId } })).toBe(1);
  expect((await db.historyOrder.findUniqueOrThrow({ where: { id: p.order.id } })).state).toBe("delivered");
 });

 it.each(["expiredHold", "privateHold", "restricted"] as const)("%s never releases private artifact bytes to an unentitled customer", async change => {
  const p = await stagedArtifact(), a = caller({ store: p.storage.store });
  await a.service.historyArtifactUpload(p.f.staff, p.f.id, p.artifactId, p.bytes);
  const held = { ...rights, category: "provider_artifact", supplierRestrictions: "synthetic private", hold: { reason: "retain for dispute only", until: future.toISOString() }, ...(change === "expiredHold" ? { schedule: { kind: "until", until: now.toISOString(), reason: "reader rights expired" } } : {}) };
  // Controlled rights fault. Retention is not a reader grant and no rights
  // editor is claimed as a production opponent.
  await db.historyArtifact.update({ where: { id: p.artifactId }, data: { rights: held, ...(change === "restricted" ? { restrictedAt: now } : {}) } });
  await expect(a.service.historyReportFile(change === "privateHold" ? p.f.owner : p.f.staff, p.f.id, p.artifactId)).rejects.toMatchObject({ code: change === "expiredHold" ? "INVALID_ATTACHMENT" : "NO_ACCESS" });
  expect(p.storage.released).toEqual([]); expect(p.storage.objects.get(p.key)).toEqual(p.bytes);
 });

 it.each(["writer", "service"] as const)("%s first private-file restriction has one current byte audience and drains", async first => {
  const p = await stagedArtifact(), a = caller({ store: p.storage.store, hold: first === "service" });
  await caller({ store: p.storage.store }).service.historyArtifactUpload(p.f.staff, p.f.id, p.artifactId, p.bytes);
  const b = await connection(); await b.query("BEGIN");
  // pg serializes queries on one PoolClient. Capture PID while it is idle,
  // before enqueueing any opposing UPDATE that can wait for the service.
  const backend = await pid(b), observer = await connection();
  const outcomes: Promise<unknown>[] = [];
  let failure: { error: unknown } | undefined;
  try {
   if (first === "writer") {
    await b.query('UPDATE history_artifacts SET "restrictedAt"=$1 WHERE id=$2', [now, p.artifactId]);
    const result = observe(a.service.historyReportFile(p.f.staff, p.f.id, p.artifactId)); outcomes.push(result); await a.started;
    await blocked(a.pid(), backend, observer); await b.query("COMMIT");
    const outcome = await result; expect(outcome.ok).toBe(false); if (!outcome.ok) expect(outcome.error).toMatchObject({ code: "NO_ACCESS" });
    expect(p.storage.released).toEqual([]);
   } else {
    const result = observe(a.service.historyReportFile(p.f.staff, p.f.id, p.artifactId)); outcomes.push(result); await a.ready;
    const update = observe(b.query('UPDATE history_artifacts SET "restrictedAt"=$1 WHERE id=$2', [now, p.artifactId])); outcomes.push(update);
    // The reserved observer is separate from the waiting client b.
    await blocked(backend, a.pid(), observer); a.release();
    expect(await result).toMatchObject({ ok: true, value: { bytes: p.bytes } });
    expect((await update).ok).toBe(true); await b.query("COMMIT"); expect(p.storage.released).toEqual([p.key]);
   }
  } catch (error) { failure = { error }; }
  finally {
   a.release();
   // Release the raw writer too before draining a writer-first blocked read.
   try { await b.query("ROLLBACK"); }
   catch (error) {
    if (failure) console.error("R6a private-file rollback failed after original error", error);
    else failure = { error };
   }
   await Promise.allSettled(outcomes);
  }
  if (failure) throw failure.error;
 });

 it.each(["payment", "refund", "delivery"] as const)("a real newly appearing %s edge refuses the whole waiting artifact view", async edge => {
  const p = await pair();
  await caller().service.historyArtifactCommand(p.f.staff, p.f.id, p.archive);
  const a = caller({ hold: true }), b = caller();
  const writer = edge === "payment" ? a.service.historyCommand(p.f.owner, p.f.id, { kind: "payment", orderId: p.order.id, clientPaymentId: fixtureId(), claim: "new receipt" }) : edge === "refund" ? a.service.historyCommand(p.f.staff, p.f.id, { kind: "refund_request", cause: "company_error", expectedAssignmentVersion: 1, expectedVersion: 1, orderId: p.order.id, reason: "new refund edge" }) : a.service.historyArtifactCommand(p.f.staff, p.f.id, { kind: "deliver", expectedAssignmentVersion: 1, expectedVersion: 1, orderId: p.order.id, artifactId: p.artifact.id, sharedLink: "https://example.invalid/new-edge", linkMatches: true, linkChecked: true });
  const written = observe(writer); await a.ready;
  const read = observe(b.service.historyReports(p.f.staff, p.f.id)); await b.started;
  await blocked(b.pid(), a.pid()); a.release(); expect((await written).ok).toBe(true);
  const outcome = await read; expect(outcome.ok).toBe(false); if (!outcome.ok) expect(outcome.error).toMatchObject({ code: "NO_ACCESS" });
  expect(await db.historyPayment.count({ where: { orderId: p.order.id } })).toBe(edge === "payment" ? 1 : 0);
  expect(await db.historyRefund.count({ where: { orderId: p.order.id } })).toBe(edge === "refund" ? 1 : 0);
  expect(await db.historyDelivery.count({ where: { orderId: p.order.id } })).toBe(edge === "delivery" ? 1 : 0);
  expect((await audit(p.f.resource)).filter(row => row.action === "SERVICE_READ")).toEqual([]);
 });

 it.each(["archive", "deliver"] as const)("real campaign_finish refusal rolls back complete pair %s effects", async kind => {
  const p = await pair();
  if (kind === "deliver") await caller().service.historyArtifactCommand(p.f.staff, p.f.id, p.archive);
  const before = await transactionalState(); let reached = false;
  const a = caller({ finishRefusal: async tx => {
   reached = true;
   expect(await tx.historyOrder.findUnique({ where: { id: p.order.id } })).toMatchObject({ state: kind === "archive" ? "fulfilling" : "delivered", version: kind === "archive" ? 1 : 2 });
   expect(await tx.historyPurchaseIntent.count({ where: { orderId: p.order.id } })).toBe(1);
   expect(await tx.historyDelivery.count({ where: { orderId: p.order.id } })).toBe(kind === "deliver" ? 1 : 0);
   expect(await tx.serviceAudit.count({ where: { resourceId: p.f.resource, action: `HISTORY_ARTIFACT_${kind.toUpperCase()}` } })).toBe(1);
  } });
  const command: S.HistoryArtifactCommand = kind === "archive" ? p.archive : { kind: "deliver", orderId: p.order.id, artifactId: p.artifact.id, expectedAssignmentVersion: 1, expectedVersion: 1, sharedLink: "https://example.invalid/finish-refused", linkMatches: true, linkChecked: true };
  await expect(a.service.historyArtifactCommand(p.f.staff, p.f.id, command)).rejects.toThrow("campaign_preparation_receipt");
  expect(reached).toBe(true); expect(await transactionalState()).toEqual(before);
  expect(await db.historyArtifact.findUnique({ where: { id: p.artifact.id } })).toMatchObject({ acquiredForOrderId: p.donorOrder.id, verifiedById: p.donor.staff.userId });
 });

 it("upload finish refusal leaves the immutable external PDF while rolling back its staff audit", async () => {
  const p = await stagedArtifact(), before = await transactionalState(); let reached = false;
  const a = caller({ store: p.storage.store, finishRefusal: async tx => {
   reached = true; expect(p.storage.objects.get(p.key)).toEqual(p.bytes);
   expect(await tx.serviceAudit.count({ where: { resourceId: p.f.resource, action: "SERVICE_SEND" } })).toBe(2);
  } });
  await expect(a.service.historyArtifactUpload(p.f.staff, p.f.id, p.artifactId, p.bytes)).rejects.toThrow("campaign_preparation_receipt");
  expect(reached).toBe(true); expect(await transactionalState()).toEqual(before);
  expect(p.storage.objects.get(p.key)).toEqual(p.bytes); expect(p.storage.released).toEqual([]);
 });

 async function campaignFixture() {
  const reservation = "e".repeat(32), namespace = `cf_${reservation}`, candidate = "c".repeat(40);
  // Existing generator produces the real hashed roster, authority and journal.
  // This executes only inside a separately authorized disposable E2E run.
  const setup = execFileSync(process.execPath, ["scripts/testing/campaign-preparation-fixture.mjs", "campaign897-full-v3", reservation, candidate], { cwd: fileURLToPath(new URL("../../..", import.meta.url)), encoding: "utf8" });
  await pool.query(setup);
  // The accepted generator installs reservation-specific public triggers. Keep
  // every inherited mode exact and include those new triggers in restoration.
  const generatedTriggers = await snapshotTriggers();
  expect(generatedTriggers.filter(row => triggerState.some(before => before.table === row.table && before.name === row.name))).toEqual(triggerState);
  const addedTriggers = generatedTriggers.filter(row => !triggerState.some(before => before.table === row.table && before.name === row.name));
  expect(addedTriggers.length).toBeGreaterThan(0);
  expect(addedTriggers.every(row => row.name.startsWith(`${namespace}_`) && !row.guard)).toBe(true);
  triggerState = generatedTriggers;
  console.info("R6a campaign fixture trigger baseline", JSON.stringify({ database: scenarioDatabase, triggers: triggerState }));
  await pool.query(`GRANT USAGE ON SCHEMA "${namespace}" TO ${role}`);
  await pool.query(`GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA "${namespace}" TO ${role}`);
  await pool.query(`GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA "${namespace}" TO ${role}`);
  const user = await db.user.findUniqueOrThrow({ where: { email: `buyer-a.${reservation}.${candidate.slice(0, 12)}@campaign897.invalid` } });
  const sessionId = fixtureId();
  // Ordinary task-owned Session fixture precedes complete matched activation.
  const sessionValidUntil = new Date(Math.max(future.getTime(), Date.now() + 24 * 60 * 60 * 1000));
  await db.session.create({ data: { id: sessionId, userId: user.id, refreshTokenHash: fixtureId(), createdAt: now, expiresAt: sessionValidUntil } });
  const hash = await pool.query<{ matched: boolean }>(`SELECT service_contract_hash=md5(pg_get_functiondef('"${namespace}".campaign_service_authority(text,text,text,text,text)'::regprocedure)) AS matched FROM "${namespace}".campaign_manifest WHERE candidate=$1 AND state='identities' AND profile='campaign897-full-v3'`, [candidate]);
  expect(hash.rows).toEqual([{ matched: true }]);
  return { namespace, subject: { userId: user.id, sessionId } };
 }
 it("admits exact persisted hashed Support text while History, attachments and push remain closed", async () => {
  const f = await campaignFixture(), a = caller({ enabled: false, campaign: true });
  const opened = await a.service.open(f.subject, "support");
  await a.service.send(f.subject, opened.id, { clientMessageId: fixtureId(), body: "journal-owned Support text", visibility: "customer" });
  await a.service.markRead(f.subject, opened.id, 1);
  expect((await a.service.read(f.subject, opened.id, 0, 20)).messages).toMatchObject([{ body: "journal-owned Support text", sequence: 1 }]);
  const before = await transactionalState();
  await expect(a.service.open(f.subject, "history")).rejects.toMatchObject({ code: "COLLECTION_DISABLED" });
  await expect(a.service.stage(f.subject, opened.id, { category: "support_communication", visibility: "customer", contentType: "image/webp", sizeBytes: 3, filename: "fixture.webp", rights: { ...rights, category: "support_communication", schedule: { kind: "support_case", closedDays: 90, eraseOnAccountDeletion: true } } })).rejects.toMatchObject({ code: "COLLECTION_DISABLED" });
  await expect(a.service.send(f.subject, opened.id, { clientMessageId: fixtureId(), attachmentId: fixtureId(), visibility: "customer" })).rejects.toMatchObject({ code: "COLLECTION_DISABLED" });
  await expect(a.service.subscribePush(f.subject, opened.id, fixtureId())).rejects.toMatchObject({ code: "COLLECTION_DISABLED" });
  expect(await transactionalState()).toEqual(before);
  const records = await pool.query<{ table_name: string }>(`SELECT table_name FROM "${f.namespace}".campaign_records WHERE NOT deleted AND table_name IN ('support_cases','service_conversations','service_messages','service_outbox','service_read_states') ORDER BY table_name`);
  expect(records.rows.map(row => row.table_name)).toEqual(["service_conversations", "service_messages", "service_outbox", "service_read_states", "support_cases"]);
 });

 it.each(["send", "watermark"] as const)("real campaign_finish %s refusal occurs after writes and restores exact transactional state", async kind => {
  const f = await fixture("history");
  const attachment = await uploadedAttachment(f, f.staff);
  const before = await transactionalState(); let reached = false;
  expect(await db.serviceAudit.count({ where: { resourceId: f.resource } })).toBe(3);
  const a = caller({ finishRefusal: async tx => {
   reached = true;
   expect(await tx.serviceAudit.count({ where: { resourceId: f.resource } })).toBe(4);
   if (kind === "send") {
    expect(await tx.serviceAttachment.findUnique({ where: { id: attachment.id } })).toMatchObject({ state: "adopted", adoptedAt: now });
    expect(await tx.serviceMessage.count({ where: { conversationId: f.id } })).toBe(1);
    expect(await tx.serviceOutbox.count({ where: { conversationId: f.id } })).toBe(1);
    expect(await tx.serviceConversation.findUnique({ where: { id: f.id } })).toMatchObject({ lastSequence: 9 });
   } else expect(await tx.serviceReadState.findUnique({ where: { conversationId_userId: { conversationId: f.id, userId: f.staff.userId } } })).toMatchObject({ lastSequence: 5 });
  } });
  await expect(kind === "send" ? a.service.send(f.staff, f.id, { clientMessageId: fixtureId(), attachmentId: attachment.id, visibility: "customer" }) : a.service.markRead(f.staff, f.id, 5)).rejects.toThrow("campaign_preparation_receipt");
  expect(reached).toBe(true); expect(await transactionalState()).toEqual(before);
 });

 async function previousPage(deliverSecond = true) {
  const p = await pair(), second = await history(p.f.owner), secondListing = await listing(p.f.owner), firstListing = await listing(p.f.owner);
  await db.vehicleHistoryRequest.update({ where: { id: p.f.resource }, data: { sourceListingId: firstListing } });
  await db.vehicleHistoryRequest.update({ where: { id: second.resource }, data: { sourceListingId: secondListing } });
  const secondOrder = await db.historyOrder.create({ data: { id: fixtureId(), requestId: second.resource, quoteId: second.quote.id, day: second.day, morning: false, state: "paid", paidAt: now, receivedAt: now, holdExpiresAt: future, promiseAt: future, rights, createdAt: new Date("2026-10-25T06:00:00Z") } });
  await db.historyOrder.update({ where: { id: p.order.id }, data: { createdAt: new Date("2026-10-25T07:00:00Z") } });
  const service = caller().service;
  await service.historyArtifactCommand(p.f.staff, p.f.id, p.archive);
  await service.historyArtifactCommand(p.f.staff, p.f.id, { kind: "deliver", artifactId: p.artifact.id, orderId: p.order.id, expectedAssignmentVersion: 1, expectedVersion: 1, sharedLink: "https://example.invalid/first", linkMatches: true, linkChecked: true });
  await service.historyArtifactCommand(second.staff, second.id, { kind: "archive", artifactId: p.artifact.id, orderId: secondOrder.id, expectedAssignmentVersion: 1, expectedVersion: 0 });
  const deliver: S.HistoryArtifactCommand = { kind: "deliver", artifactId: p.artifact.id, orderId: secondOrder.id, expectedAssignmentVersion: 1, expectedVersion: 1, sharedLink: "https://example.invalid/second", linkMatches: true, linkChecked: true };
  if (deliverSecond) await service.historyArtifactCommand(second.staff, second.id, deliver);
  return { p, second, secondOrder, deliver, firstListing, secondListing };
 }
 it("returns a stable whole previous-history page including distinct retained Listings", async () => {
  const f = await previousPage(), a = caller({ hold: true }), b = await connection();
  const beforeFirst = await audit(f.p.f.resource), beforeSecond = await audit(f.second.resource);
  const read = observe(a.service.historyPrevious(f.p.f.owner, vin)); await a.ready;
  await b.query("BEGIN"); const waiter = await pid(b);
  const update = observe(b.query('UPDATE listings SET "priceAmount"=2 WHERE id=$1', [f.secondListing]));
  await blocked(waiter, a.pid()); a.release();
  expect(await read).toEqual({ ok: true, value: [{ conversationId: f.p.f.id, vin }, { conversationId: f.second.id, vin }] });
  expect((await update).ok).toBe(true); await b.query("COMMIT");
  expect(await audit(f.p.f.resource)).toEqual(beforeFirst); expect(await audit(f.second.resource)).toEqual(beforeSecond);
 });
 it.each(["writer", "service"] as const)("%s first previous-history membership uses a real new delivery", async first => {
  const f = await previousPage(false), a = caller({ hold: true }), b = caller();
  const read = (service: Caller) => service.historyPrevious(f.p.f.owner, vin);
  const deliver = (service: Caller) => service.historyArtifactCommand(f.second.staff, f.second.id, f.deliver);
  const lead = observe<unknown>(first === "writer" ? deliver(a.service) : read(a.service)); await a.ready;
  const trail = observe<unknown>(first === "writer" ? read(b.service) : deliver(b.service)); await b.started;
  await blocked(b.pid(), a.pid()); a.release();
  const leading = await lead, trailing = await trail; expect(leading.ok).toBe(true);
  if (first === "writer") { expect(trailing.ok).toBe(false); if (!trailing.ok) expect(trailing.error).toMatchObject({ code: "NO_ACCESS" }); }
  else { expect(leading).toEqual({ ok: true, value: [{ conversationId: f.p.f.id, vin }] }); expect(trailing.ok).toBe(true); }
  expect(await caller().service.historyPrevious(f.p.f.owner, vin)).toEqual([{ conversationId: f.p.f.id, vin }, { conversationId: f.second.id, vin }]);
 });
 it.each(["mine", "queue"] as const)("stable %s page commits before a real first-open adds a member", async page => {
  const owner = await principal(), f = await fixture("history", owner), a = caller({ hold: true }), b = caller();
  const read = observe(page === "mine" ? a.service.mine(owner) : a.service.queue(f.staff, "history")); await a.ready;
  const open = observe(b.service.open(owner, "history")); await b.started;
  await blocked(b.pid(), a.pid()); a.release();
  expect(await read).toMatchObject({ ok: true, value: [{ id: f.id }] }); expect((await open).ok).toBe(true);
  expect((page === "mine" ? await caller().service.mine(owner) : await caller().service.queue(f.staff, "history"))).toHaveLength(2);
  expect(await audit(f.resource)).toEqual([]);
 });
 it.each(["mine", "queue", "previous"] as const)("%s refuses whole-page reordered membership after a nonfirst ordering fault", async page => {
  if (page === "previous") {
   const f = await previousPage(), baseline = await audit(f.second.resource);
   await refusalAfter(f.p.f.owner, b => b.query('UPDATE history_orders SET "createdAt"=$1 WHERE id=$2', [now, f.secondOrder.id]), service => service.historyPrevious(f.p.f.owner, vin));
   expect(await audit(f.second.resource)).toEqual(baseline);
  } else {
   const owner = await principal(), one = await fixture("history", owner), two = await fixture("history", owner);
   await db.vehicleHistoryRequest.update({ where: { id: one.resource }, data: { createdAt: new Date("2026-10-25T06:00:00Z") } });
   await db.vehicleHistoryRequest.update({ where: { id: two.resource }, data: { createdAt: new Date("2026-10-25T07:00:00Z") } });
   await db.serviceConversation.update({ where: { id: one.id }, data: { createdAt: new Date("2026-10-25T07:00:00Z") } });
   await db.serviceConversation.update({ where: { id: two.id }, data: { createdAt: new Date("2026-10-25T06:00:00Z") } });
   const subject = page === "mine" ? owner : one.staff;
   await refusalAfter(subject, b => page === "mine" ? b.query('UPDATE service_conversations SET "createdAt"=$1 WHERE id=$2', [now, two.id]) : b.query('UPDATE vehicle_history_requests SET "createdAt"=$1 WHERE id=$2', [new Date("2026-10-25T05:00:00Z"), two.resource]), service => page === "mine" ? service.mine(owner) : service.queue(one.staff, "history"));
   expect(await audit(one.resource)).toEqual([]); expect(await audit(two.resource)).toEqual([]);
  }
 });

 it.each(["writer", "service"] as const)("%s first handover opposes the real peer grant revoker", async first => {
  const f = await fixture(), manager = await principal(true);
  await db.staffGrant.create({ data: { userId: manager.userId, capability: "staff.manage", grantedAt: now } });
  const a = caller({ hold: true }), b = caller();
  const revoke = (database: unknown) => grantWriter(database).change({ ...manager, targetUserId: f.peer.userId, capability: "support.operations", grant: false, reason: "peer authority revoked" }, now);
  const lead = observe(first === "writer" ? revoke(a.database) : a.service.assign(f.staff, f.id, 1, f.peer.userId)); await a.ready;
  const trail = observe(first === "writer" ? b.service.assign(f.staff, f.id, 1, f.peer.userId) : revoke(b.database)); await b.started;
  await blocked(b.pid(), a.pid()); a.release(); expect((await lead).ok).toBe(true);
  const result = await trail; expect(result.ok).toBe(first === "service"); if (!result.ok) expect(result.error).toMatchObject({ code: "NO_ACCESS" });
  expect(await db.supportCase.findUnique({ where: { id: f.resource } })).toMatchObject({ assigneeId: first === "writer" ? f.staff.userId : f.peer.userId, assignmentVersion: first === "writer" ? 1 : 2 });
  expect(await effects(f.id)).toEqual({ messages: 0, outbox: first === "writer" ? 0 : 1, reads: 0, subscriptions: 0 });
  expect(await audit(f.resource)).toEqual(first === "writer" ? [] : [{ action: "SERVICE_ASSIGN", actorId: f.staff.userId, assignmentVersion: 1 }, { action: "SERVICE_HANDOVER", actorId: f.staff.userId, assignmentVersion: 2 }]);
  expect((await db.staffGrant.findUniqueOrThrow({ where: { userId_capability: { userId: f.peer.userId, capability: "support.operations" } } })).revokedAt).toEqual(now);
 });

 it("attachment adoption commits before a waiting rights fault without releasing bytes", async () => {
  const f = await fixture("history"), a = caller({ hold: true }), b = await connection();
  const attachment = await uploadedAttachment(f, f.owner);
  const result = observe(a.service.send(f.owner, f.id, { clientMessageId: fixtureId(), attachmentId: attachment.id, visibility: "customer" })); await a.ready;
  await b.query("BEGIN"); const waiter = await pid(b);
  const update = observe(b.query('UPDATE service_attachments SET rights=$1::jsonb WHERE id=$2', [JSON.stringify({ ...rights, category: "history_communication", schedule: { kind: "until", until: now.toISOString(), reason: "expired" } }), attachment.id]));
  await blocked(waiter, a.pid()); a.release(); expect((await result).ok).toBe(true); expect((await update).ok).toBe(true); await b.query("COMMIT");
  expect((await db.serviceAttachment.findUniqueOrThrow({ where: { id: attachment.id } })).state).toBe("adopted");
  expect(await effects(f.id)).toEqual({ messages: 1, outbox: 1, reads: 0, subscriptions: 0 });
  await expect(caller().service.file(f.owner, f.id, attachment.id)).rejects.toMatchObject({ code: "NO_ACCESS" });
 });

 it("exact hashed Support journal and text effects roll back at real campaign_finish refusal", async () => {
  const f = await campaignFixture(), opened = await caller({ enabled: false, campaign: true }).service.open(f.subject, "support");
  const journal = async () => (await pool.query<{ records: unknown; events: unknown; manifest: unknown }>(`SELECT
   (SELECT jsonb_agg(to_jsonb(r) ORDER BY table_name,row_key::text) FROM "${f.namespace}".campaign_records r) AS records,
   (SELECT jsonb_agg(to_jsonb(e) ORDER BY sequence) FROM "${f.namespace}".campaign_events e) AS events,
   (SELECT to_jsonb(m) FROM "${f.namespace}".campaign_manifest m) AS manifest`)).rows;
  const before = await transactionalState(), beforeJournal = await journal(); let reached = false;
  const a = caller({ enabled: false, campaign: true, finishRefusal: async tx => {
   reached = true;
   expect(await tx.serviceMessage.count({ where: { conversationId: opened.id } })).toBe(1);
   expect(await tx.serviceOutbox.count({ where: { conversationId: opened.id } })).toBe(1);
   expect(await tx.serviceAudit.count({ where: { resourceId: opened.resourceId, action: "SUPPORT_CUSTOMER_MESSAGE" } })).toBe(1);
  } });
  await expect(a.service.send(f.subject, opened.id, { clientMessageId: fixtureId(), body: "must roll back with journal", visibility: "customer" })).rejects.toThrow("campaign_preparation_receipt");
  expect(reached).toBe(true); expect(await transactionalState()).toEqual(before); expect(await journal()).toEqual(beforeJournal);
 });

 it.each((["purchase", "refund"] as const).flatMap(opponent => (["payment", "opponent"] as const).map(first => ({ opponent, first }))))("same-order $first first payment opposes real $opponent with exact accounting", async ({ opponent, first }) => {
  const f = await history();
  const order = await db.historyOrder.create({ data: { id: fixtureId(), requestId: f.resource, quoteId: f.quote.id, day: f.day, morning: false, state: "paid", paidAt: now, receivedAt: now, holdExpiresAt: future, promiseAt: future, rights, createdAt: now } });
  const a = caller({ hold: true }), b = caller();
  const payment = (service: Caller) => service.historyCommand(f.owner, f.id, { kind: "payment", orderId: order.id, clientPaymentId: fixtureId(), claim: "same-order new payment" });
  const opposing = (service: Caller) => service.historyCommand(f.staff, f.id, opponent === "purchase" ? { kind: "purchase", orderId: order.id, expectedAssignmentVersion: 1, expectedVersion: 0, reason: "same-order purchase" } : { kind: "refund_request", cause: "company_error", orderId: order.id, expectedAssignmentVersion: 1, expectedVersion: 0, reason: "same-order refund" });
  const lead = observe(first === "payment" ? payment(a.service) : opposing(a.service)); await a.ready;
  const trail = observe(first === "payment" ? opposing(b.service) : payment(b.service)); await b.started;
  await blocked(b.pid(), a.pid()); a.release(); expect((await lead).ok).toBe(true);
  const outcome = await trail; expect(outcome.ok).toBe(false); if (!outcome.ok) expect(outcome.error).toMatchObject({ code: "NO_ACCESS" });
  expect(await db.historyPayment.count({ where: { orderId: order.id } })).toBe(first === "payment" ? 1 : 0);
  expect(await db.historyPurchaseIntent.count({ where: { orderId: order.id } })).toBe(first === "opponent" && opponent === "purchase" ? 1 : 0);
  expect(await db.historyRefund.count({ where: { orderId: order.id } })).toBe(first === "opponent" && opponent === "refund" ? 1 : 0);
  expect(await db.historyOrder.findUnique({ where: { id: order.id } })).toMatchObject({ state: first === "payment" ? "paid" : opponent === "purchase" ? "purchasing" : "refund_pending", version: first === "payment" ? 0 : 1 });
  expect((await db.historyProviderAllowance.findUniqueOrThrow({ where: { provider_day: { day: f.day, provider: "carfax" } } })).consumed).toBe(first === "opponent" && opponent === "purchase" ? 1 : 0);
  expect(await db.historyBooking.count()).toBe(0); expect(await db.historyDelivery.count()).toBe(0);
 });

 it.each(["payment", "refund", "delivery"] as const)("stable artifact view commits before a real new %s edge without widening its result", async edge => {
  const originalBytes = await pdf(), p = await pair(originalBytes); await caller().service.historyArtifactCommand(p.f.staff, p.f.id, p.archive);
  const storage = byteStore();
  storage.objects.set(p.artifact.objectKey, originalBytes);
  const digestBefore = createHash("sha256").update(originalBytes).digest("hex");
  const expectedArtifact = { id: p.artifact.id, provider: "carfax", vin, originalDate: "2026-10-25T08:00:00.000Z", sizeBytes: originalBytes.length, expectedPages: 1, sharedLink: null, deliveredAt: null, state: "verified", vehicleIdentity: null, mileage: null, sourceObservations: [], canShare: true };
  const before = await transactionalState();
  let readState: Awaited<ReturnType<typeof transactionalState>> | undefined;
  const a = caller({ hold: true, store: storage.store, inspect: async tx => { readState = await transactionalState(tx); } }), b = caller();
  const read = observe(a.service.historyReports(p.f.staff, p.f.id)); await a.ready;
  const write = observe(edge === "payment" ? b.service.historyCommand(p.f.owner, p.f.id, { kind: "payment", orderId: p.order.id, clientPaymentId: fixtureId(), claim: "new receipt after view" }) : edge === "refund" ? b.service.historyCommand(p.f.staff, p.f.id, { kind: "refund_request", cause: "company_error", expectedAssignmentVersion: 1, expectedVersion: 1, orderId: p.order.id, reason: "new refund after view" }) : b.service.historyArtifactCommand(p.f.staff, p.f.id, { kind: "deliver", expectedAssignmentVersion: 1, expectedVersion: 1, orderId: p.order.id, artifactId: p.artifact.id, sharedLink: "https://example.invalid/new-edge", linkMatches: true, linkChecked: true })); await b.started;
  await blocked(b.pid(), a.pid()); a.release();
  expect(await read).toEqual({ ok: true, value: { delivered: [], archive: [expectedArtifact], staged: [expectedArtifact] } });
  const outcome = await write; expect(outcome.ok).toBe(false); if (!outcome.ok) expect(outcome.error).toMatchObject({ code: "NO_ACCESS" });
  expect(await db.historyPayment.count({ where: { orderId: p.order.id } })).toBe(0);
  expect(await db.historyRefund.count({ where: { orderId: p.order.id } })).toBe(0);
  expect(await db.historyDelivery.count({ where: { orderId: p.order.id } })).toBe(0);
  expect((await db.historyOrder.findUniqueOrThrow({ where: { id: p.order.id } })).state).toBe("fulfilling");
  expect((await audit(p.f.resource)).filter(row => row.action === "SERVICE_READ")).toEqual([{ action: "SERVICE_READ", actorId: p.f.staff.userId, assignmentVersion: 1 }]);
  expect(await transactionalState(), "opponent adds no effects beyond the committed staff read").toEqual(present(readState));
  expect((await transactionalState()).filter(entry => entry.table !== "service_audits")).toEqual(before.filter(entry => entry.table !== "service_audits"));
  expect(await caller({ store: storage.store }).service.historyReports(p.f.owner, p.f.id)).toEqual({ delivered: [], archive: [], staged: [] });
  await expect(caller({ store: storage.store }).service.historyReportFile(p.f.owner, p.f.id, p.artifact.id)).rejects.toMatchObject({ code: "NO_ACCESS" });
  await expect(caller({ store: storage.store }).service.historyReportFile(p.donor.owner, p.f.id, p.artifact.id)).rejects.toMatchObject({ code: "NO_ACCESS" });
  expect(await transactionalState()).toEqual(present(readState));
  expect(storage.objects.get(p.artifact.objectKey)).toEqual(originalBytes);
  expect(createHash("sha256").update(present(storage.objects.get(p.artifact.objectKey))).digest("hex")).toBe(digestBefore);
  expect({ released: storage.released, written: storage.written, removed: storage.removed }).toEqual({ released: [], written: [], removed: [] });
 });

 it.each(["upload", "verify", "file"] as const)("post-wait rights expiry refuses actual artifact %s with exact byte boundary effects", async phase => {
  const p = await stagedArtifact();
  if (phase !== "upload") await caller({ store: p.storage.store }).service.historyArtifactUpload(p.f.staff, p.f.id, p.artifactId, p.bytes);
  const expires = new Date("2026-10-25T08:01:00Z");
  await db.historyArtifact.update({ where: { id: p.artifactId }, data: { rights: { ...rights, category: "provider_artifact", supplierRestrictions: "bounded original rights", schedule: { kind: "until", until: expires.toISOString(), reason: "fixture rights end" }, hold: { until: future.toISOString(), reason: "retain without widening readership" } } } });
  const before = await transactionalState(); let at = now;
  const b = await actorBarrier(p.f.staff), a = caller({ store: p.storage.store, clock: () => at });
  const work = phase === "upload" ? a.service.historyArtifactUpload(p.f.staff, p.f.id, p.artifactId, p.bytes) : phase === "verify" ? a.service.historyArtifactCommand(p.f.staff, p.f.id, { kind: "verify", orderId: p.order.id, artifactId: p.artifactId, expectedAssignmentVersion: 1, vin, originalDate: now.toISOString(), readablePages: 1, readable: true }) : a.service.historyReportFile(p.f.staff, p.f.id, p.artifactId);
  const result = observe<unknown>(work); await a.started;
  await blocked(a.pid(), await pid(b)); at = expires; await b.query("COMMIT");
  const outcome = await result; expect(outcome.ok).toBe(false); if (!outcome.ok) expect(outcome.error).toMatchObject({ code: "INVALID_ATTACHMENT" });
  expect(await transactionalState()).toEqual(before);
  // Verification fetches the original before its helper's rights check. That
  // internal fetch is observable storage I/O despite transactional rollback;
  // upload/file refuse before a store effect. No bytes are returned to caller.
  expect(p.storage.released).toEqual(phase === "verify" ? [p.key] : []);
  expect(p.storage.objects.size).toBe(phase === "upload" ? 0 : 1);
 });

 async function uploadedAttachment(f: { id: string; owner: Subject }, uploader: Subject) {
  const storage = byteStore(), bytes = await image(), service = caller({ store: storage.store }).service;
  const attachment = await service.stage(uploader, f.id, { category: "history_communication", visibility: "customer", contentType: "image/webp", sizeBytes: bytes.length, filename: "fixture.webp", rights: { ...rights, category: "history_communication" } });
  await service.upload(uploader, f.id, attachment.id, bytes);
  expect(storage.objects.size).toBe(1);
  expect(await db.serviceAttachment.findUnique({ where: { id: attachment.id } })).toMatchObject({ state: "staged", uploaderId: uploader.userId, lifecycleEpoch: 0 });
  return { ...attachment, storage };
 }

});
