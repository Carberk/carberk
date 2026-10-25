import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

import type { ServiceMessagingSchemas as S } from "@auto-tm/contracts";
import { PrismaPg } from "@prisma/adapter-pg";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool, type PoolClient } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { PrismaClient } from "../generated/prisma/client/client";
import type { Prisma } from "../src/index";

// Authored only in R6a. Parent must review and run on its disposable lane.
// This file never accepts a DATABASE_URL: it migrates only its own container.
// Strict source guards remain dormant. Ordinary FK/check triggers stay enabled.
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
 queue(subject: Subject, purpose: "support" | "history", sourceListingId?: string): Promise<{ id: string }[]>;
 historyCommand(subject: Subject, id: string, command: S.HistoryCommand): Promise<void>;
 historyArtifactCommand(subject: Subject, id: string, command: S.HistoryArtifactCommand): Promise<void>;
 historyPrevious(subject: Subject, vin: string): Promise<{ conversationId: string; vin: string }[]>;
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
const rights: S.ServiceRights = { category: "payment_evidence", purpose: "History order", basis: "consent", provenance: "disposable fixture", identifiability: "personal", use: ["service"], schedule: { kind: "until", until: "2027-01-01T00:00:00Z", reason: "fixture retention" }, supplierRestrictions: "", hold: null };

describe("real Service and History callers on disposable restricted PostgreSQL", () => {
 let container: StartedPostgreSqlContainer;
 let pool: Pool;
 let db: PrismaClient;
 let construct: (database: unknown, enabled: boolean) => Caller;
 const clients: PoolClient[] = [];
 const pending: Promise<unknown>[] = [];
 const releases: (() => void)[] = [];
 const role = "r6a_service_caller";

 beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:17-alpine").start();
  const url = container.getConnectionUri();
  execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], { cwd: fileURLToPath(new URL("..", import.meta.url)), env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
  pool = new Pool({ connectionString: url });
  db = new PrismaClient({ adapter: new PrismaPg(pool) });
  await pool.query(`CREATE ROLE ${role} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT`);
  await pool.query(`GRANT USAGE ON SCHEMA public TO ${role}`);
  await pool.query(`GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO ${role}`);
  await pool.query(`GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO ${role}`);
  await pool.query(`GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO ${role}`);
  // Runtime imports follow the existing DB caller suite pattern. Do not import
  // API source into the DB compiler's rootDir or replace production authority.
  const load = async (path: string) => import(/* @vite-ignore */ fileURLToPath(new URL(`../../../apps/api/src/modules/${path}.ts`, import.meta.url)));
  const { PrismaServiceMessaging } = await load("service-messaging/infrastructure/PrismaServiceMessaging") as { PrismaServiceMessaging: new (database: unknown, staff: unknown, store: unknown, runtime: unknown, campaign: unknown) => Caller };
  const { PrismaStaffAuthority } = await load("identity/infrastructure/PrismaStaffAuthority") as { PrismaStaffAuthority: new (database: unknown) => unknown };
  const { CheckStaffAuthority } = await load("identity/application/CheckStaffAuthority") as { CheckStaffAuthority: new (repository: unknown, clock: unknown) => unknown };
  const { CampaignServiceAdmission } = await load("service-messaging/infrastructure/campaignServiceAdmission") as { CampaignServiceAdmission: new (config: unknown) => unknown };
  construct = (database, enabled) => new PrismaServiceMessaging(database,
   new CheckStaffAuthority(new PrismaStaffAuthority(database), { now: () => now }),
   { get: async () => { throw new Error("unexpected external byte read"); }, putImmutable: async () => { throw new Error("unexpected external byte write"); }, remove: async () => { throw new Error("unexpected external byte removal"); } },
   { now: () => now, id: randomUUID, syntheticEnabled: () => enabled, syntheticSubjectAllowed: () => enabled },
   new CampaignServiceAdmission({ get: () => undefined }));
 });
 beforeEach(() => { vin = String(10000000000000000n + BigInt(++scenario)); });
 afterEach(async () => {
  for (const release of releases.splice(0)) release();
  for (const client of clients) await client.query("ROLLBACK");
  await Promise.allSettled(pending.splice(0));
  for (const client of clients.splice(0)) client.release();
 });
 afterAll(async () => { await db?.$disconnect(); await pool?.end(); await container?.stop(); });
 async function connection() {
  const client = await pool.connect(); clients.push(client);
  await client.query("SET statement_timeout='8s'");
  return client;
 }
 async function pid(client: PoolClient) { return present((await client.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")).rows[0]).pid; }
 async function blocked(waiter: number, blocker: number) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
   const row = present((await pool.query<{ pids: number[] }>("SELECT pg_blocking_pids($1::int) AS pids", [waiter])).rows[0]);
   if (row.pids.includes(blocker)) {
    console.info("service-history PostgreSQL barrier", { waiter, blocker, blockingPids: row.pids });
    return;
   }
   await new Promise(resolve => setTimeout(resolve, 5));
  }
  throw new Error(`no PostgreSQL barrier: waiter=${waiter} blocker=${blocker}`);
 }
 // The facade owns only transaction instrumentation. Every query and public
 // caller, retained-selection query, authority check and receipt is production.
 function caller(options: { hold?: boolean; rollback?: boolean; enabled?: boolean } = {}) {
  const ready = latch(), finish = latch(), started = latch();
  releases.push(finish.release);
  let backend = 0;
  const database = { $transaction: <T>(work: (tx: Prisma.TransactionClient) => Promise<T>) => db.$transaction(async tx => {
   await tx.$executeRawUnsafe(`SET LOCAL ROLE ${role}`);
   const [identity] = await tx.$queryRaw<{ pid: number; elevated: boolean; trigger: boolean }[]>`SELECT pg_backend_pid() AS pid,rolsuper OR rolcreatedb OR rolcreaterole AS elevated,has_table_privilege(current_user,'users','TRIGGER') AS trigger FROM pg_roles WHERE rolname=current_user`;
   expect(identity).toMatchObject({ elevated: false, trigger: false });
   backend = present(identity).pid; started.release();
   const result = await work(tx); ready.release();
   if (options.hold) await finish.promise;
   if (options.rollback) throw new Error("caller outer rollback");
   return result;
  }, { timeout: 20000 }) };
  return { service: construct(database, options.enabled ?? true), started: started.promise, ready: ready.promise, release: finish.release, pid: () => backend };
 }
 function observe<T>(promise: Promise<T>) {
  const result = promise.then(value => ({ ok: true as const, value }), (error: unknown) => ({ ok: false as const, error }));
  pending.push(result); return result;
 }
 async function principal(staff = false) {
  const user = await db.user.create({ data: {} });
  const session = await db.session.create({ data: { userId: user.id, refreshTokenHash: randomUUID(), expiresAt: future, adminTotpExpiresAt: future } });
  if (staff) for (const capability of ["support.operations", "history.fulfilment"]) await db.staffGrant.create({ data: { userId: user.id, capability } });
  return { userId: user.id, sessionId: session.id };
 }
 async function fixture(purpose: "support" | "history" = "support", customer?: Subject) {
  const owner = customer ?? await principal(), staff = await principal(true), peer = await principal(true);
  const data = { customerId: owner.userId, assigneeId: staff.userId, assignmentVersion: 1 };
  const resource = purpose === "support" ? await db.supportCase.create({ data }) : await db.vehicleHistoryRequest.create({ data });
  const conversation = await db.serviceConversation.create({ data: { purpose, lastSequence: 8, ...(purpose === "support" ? { supportCaseId: resource.id } : { historyRequestId: resource.id }) } });
  return { owner, staff, peer, resource: resource.id, id: conversation.id };
 }
 async function effects(id: string) {
  return { messages: await db.serviceMessage.count({ where: { conversationId: id } }), outbox: await db.serviceOutbox.count({ where: { conversationId: id } }), reads: await db.serviceReadState.count({ where: { conversationId: id } }), subscriptions: await db.servicePushSubscription.count({ where: { conversationId: id } }) };
 }
 async function audit(resourceId: string) { return db.serviceAudit.findMany({ where: { resourceId }, select: { action: true, actorId: true, assignmentVersion: true }, orderBy: { createdAt: "asc" } }); }
 async function actorBarrier(subject: Subject) {
  const b = await connection(); await b.query("BEGIN");
  await b.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [subject.userId]);
  return b;
 }
 async function refusalAfter(subject: Subject, mutate: (b: PoolClient) => Promise<unknown>, work: (service: Caller) => Promise<unknown>) {
  const b = await actorBarrier(subject), a = caller();
  const result = observe(work(a.service)); await a.started;
  try { await blocked(a.pid(), await pid(b)); await mutate(b); await b.query("COMMIT"); }
  finally { await b.query("ROLLBACK"); }
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
  const send = observe(a.service.send(f.owner, f.id, { clientMessageId: randomUUID(), body: "customer text", visibility: "customer" })); await a.ready;
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
  const f = await fixture();
  await refusalAfter(f.staff, b => b.query('UPDATE staff_grants SET "revokedAt"=$1 WHERE "userId"=$2', [now, f.peer.userId]), service => service.assign(f.staff, f.id, 1, f.peer.userId));
  expect(await audit(f.resource)).toEqual([]); expect((await db.supportCase.findUniqueOrThrow({ where: { id: f.resource } })).assignmentVersion).toBe(1);
 });
 it("rolls back support command and all audits at the outer transaction boundary", async () => {
  const f = await fixture(), a = caller({ rollback: true });
  await expect(a.service.supportCommand(f.staff, f.id, { kind: "close_resolved" })).rejects.toThrow("caller outer rollback");
  expect((await db.supportCase.findUniqueOrThrow({ where: { id: f.resource } })).status).toBe("open"); expect(await audit(f.resource)).toEqual([]);
 });
 it.each(["new", "existing"] as const)("binds %s push subscription to exact Session/device/epoch", async existing => {
  const f = await fixture(), device = await db.fcmDevice.create({ data: { userId: f.owner.userId, token: randomUUID(), platform: "android" } });
  if (existing === "existing") await db.servicePushSubscription.create({ data: { sessionId: f.owner.sessionId, deviceId: device.id, conversationId: f.id, lifecycleEpoch: 0 } });
  const b = await actorBarrier(f.owner), a = caller(), result = observe(a.service.subscribePush(f.owner, f.id, device.token)); await a.started;
  await blocked(a.pid(), await pid(b)); await b.query("COMMIT"); expect((await result).ok).toBe(true);
  expect(await db.servicePushSubscription.findMany({ where: { conversationId: f.id }, select: { sessionId: true, deviceId: true, conversationId: true, lifecycleEpoch: true } })).toEqual([{ sessionId: f.owner.sessionId, deviceId: device.id, conversationId: f.id, lifecycleEpoch: 0 }]);
 });
 it.each(["owner", "invalidated", "session"] as const)("refuses push after post-wait device/Session %s change", async change => {
  const f = await fixture(), device = await db.fcmDevice.create({ data: { userId: f.owner.userId, token: randomUUID(), platform: "android" } });
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
  await db.historyCapacityDay.upsert({ where: { day }, create: { day, slotLimit: 1000, morningLimit: 1000, evidence: "disposable capacity" }, update: { slotLimit: 1000, morningLimit: 1000 } });
  await db.historyProviderAllowance.upsert({ where: { provider_day: { provider: "carfax", day } }, create: { provider: "carfax", day, allowance: 10000, resetAt: now, evidence: "fixture" }, update: { allowance: 10000, consumed: 0 } });
  const quote = await db.historyQuote.create({ data: { requestId: f.resource, vin, providers: ["carfax"], preflightOutcome: "available", preflightEvidence: "fixture available", refundRule: "full refund", windowStart: new Date("2026-10-25T09:00:00Z"), windowEnd: new Date("2026-10-25T10:00:00Z"), feasible: true, offeredById: f.staff.userId } });
  const accept: S.HistoryCommand = { kind: "accept", quoteId: quote.id, vin, providers: ["carfax"], amount: 100, refundRule: "full refund", windowStart: "2026-10-25T09:00:00.000Z", windowEnd: "2026-10-25T10:00:00.000Z", rights };
  return { ...f, day, quote, accept };
 }
 it("accepts a new order after a capacity barrier and expires another request's elapsed hold", async () => {
  const f = await history(), other = await history();
  const elapsed = await db.historyOrder.create({ data: { requestId: other.resource, quoteId: other.quote.id, day: f.day, morning: false, holdExpiresAt: now, promiseAt: future, rights } });
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
 it("serializes two new accepts through the same provider and day", async () => {
  const f = await history(), other = await history(), a = caller({ hold: true }), b = caller();
  const first = observe(a.service.historyCommand(f.owner, f.id, f.accept)); await a.ready;
  const second = observe(b.service.historyCommand(other.owner, other.id, other.accept)); await b.started;
  await blocked(b.pid(), a.pid()); a.release(); expect((await first).ok).toBe(true);
  // New day-order discovery after the first commit changes the retained union.
  expect((await second).ok).toBe(false);
  expect((await db.historyOrder.findUniqueOrThrow({ where: { requestId: f.resource } })).state).toBe("held");
  expect(await db.historyOrder.findUnique({ where: { requestId: other.resource } })).toBeNull(); expect(await audit(other.resource)).toEqual([]);
 });
 async function pair() {
  const f = await history(), donor = await history();
  const makeOrder = (requestId: string, quoteId: string) => db.historyOrder.create({ data: { requestId, quoteId, day: f.day, morning: false, state: "paid", paidAt: now, receivedAt: now, holdExpiresAt: future, promiseAt: future, rights } });
  const order = await makeOrder(f.resource, f.quote.id), donorOrder = await makeOrder(donor.resource, donor.quote.id);
  const listingId = await listing(donor.owner);
  await db.vehicleHistoryRequest.update({ where: { id: donor.resource }, data: { sourceListingId: listingId } });
  const artifactId = randomUUID();
  const artifact = await db.historyArtifact.create({ data: { id: artifactId, sourceListingId: listingId, provider: "carfax", vin, originalDate: now, objectKey: `history-artifacts/${artifactId}/${"a".repeat(64)}`, sha256: "a".repeat(64), sizeBytes: 100, expectedPages: 1, verifiedPages: 1, state: "verified", acquiredForOrderId: donorOrder.id, verifiedById: donor.staff.userId, verifiedAt: now, rights: { ...rights, category: "provider_artifact", identifiability: "anonymous", use: ["service", "archive", "redistribute"], supplierRestrictions: "fixture permits reuse" } } });
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
  const work = kind === "push" ? a.service.subscribePush(f.owner, f.id, randomUUID()) : a.service.open(f.owner, kind);
  await expect(work).rejects.toMatchObject({ code: "COLLECTION_DISABLED" });
  expect(await audit(f.resource)).toEqual([]); expect(await effects(f.id)).toEqual({ messages: 0, outbox: 0, reads: 0, subscriptions: 0 });
 });
 it("refuses the real kernel graph limit before watermark or staff audit effects", async () => {
  const f = await fixture();
  await db.serviceMessage.createMany({ data: Array.from({ length: 1001 }, (_, index) => ({ conversationId: f.id, sequence: index + 1, clientMessageId: randomUUID(), senderId: f.owner.userId, senderKind: "customer", visibility: "customer", body: "retained source", requestHash: "fixture" })) });
  await expect(caller().service.markRead(f.staff, f.id, 5)).rejects.toThrow("diagnostic_source_scope_limit");
  expect(await effects(f.id)).toEqual({ messages: 1001, outbox: 0, reads: 0, subscriptions: 0 }); expect(await audit(f.resource)).toEqual([]);
 });
 it("keeps staff notes out of customer reads after a real wait", async () => {
  const f = await fixture();
  await db.serviceMessage.createMany({ data: [
   { conversationId: f.id, sequence: 1, clientMessageId: randomUUID(), senderId: f.staff.userId, senderKind: "staff", visibility: "staff", body: "private note", requestHash: "private" },
   { conversationId: f.id, sequence: 2, clientMessageId: randomUUID(), senderId: f.staff.userId, senderKind: "staff", visibility: "customer", body: "public reply", requestHash: "public" },
  ] });
  const b = await actorBarrier(f.owner), a = caller(), result = observe(a.service.read(f.owner, f.id, 0, 20)); await a.started;
  await blocked(a.pid(), await pid(b)); await b.query("COMMIT");
  const outcome = await result; expect(outcome.ok).toBe(true); if (!outcome.ok) throw outcome.error;
  expect(outcome.value.messages.map(message => message.body)).toEqual(["public reply"]); expect(await audit(f.resource)).toEqual([]);
 });
 it("adopts a real uploaded attachment with the message and rolls adoption back on outer refusal", async () => {
  const f = await fixture("history");
  const attachment = await db.serviceAttachment.create({ data: { conversationId: f.id, uploaderId: f.owner.userId, lifecycleEpoch: 0, category: "history_communication", visibility: "customer", stagingKey: randomUUID(), objectKey: randomUUID(), contentType: "image/webp", expectedBytes: 3, sizeBytes: 3, sha256: "a".repeat(64), filename: "fixture.webp", rights: { ...rights, category: "history_communication" }, expiresAt: future } });
  const message = { clientMessageId: randomUUID(), attachmentId: attachment.id, visibility: "customer" as const };
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
  const old = await db.historyQuote.create({ data: { requestId: f.resource, vin, providers: ["carfax"], preflightOutcome: "available", preflightEvidence: "old quote", refundRule: "full refund", windowStart: new Date("2026-10-25T07:00:00Z"), windowEnd: now, feasible: true, acceptedAt: new Date("2026-10-25T06:00:00Z") } });
  const order = await db.historyOrder.create({ data: { requestId: f.resource, quoteId: old.id, day: f.day, morning: false, state: "review", holdExpiresAt: new Date("2026-10-25T07:00:00Z"), promiseAt: now, rights } });
  const payment = await db.historyPayment.create({ data: { orderId: order.id, clientPaymentId: randomUUID(), amount: 100, verifiedFunds: true, receivedAt: new Date("2026-10-25T07:00:00Z"), confirmedAt: new Date("2026-10-25T07:30:00Z"), state: "review", confirmedById: f.staff.userId } });
  const b = await actorBarrier(f.owner), a = caller(), result = observe(a.service.historyCommand(f.owner, f.id, f.accept)); await a.started;
  await blocked(a.pid(), await pid(b)); await b.query("COMMIT"); expect((await result).ok).toBe(true);
  expect(await db.historyOrder.findUnique({ where: { id: order.id } })).toMatchObject({ state: "paid", version: 1, paidAt: new Date("2026-10-25T07:30:00Z") });
  expect(await db.historyBooking.findMany({ where: { orderId: order.id } })).toMatchObject([{ clientBookingId: f.quote.id, amount: 100 }]);
  expect((await db.historyPayment.findUniqueOrThrow({ where: { id: payment.id } })).state).toBe("confirmed");
 });
 it("refuses all previous-history rows when a nonfirst request changes during a wait", async () => {
  const p = await pair(), second = await history(p.f.owner);
  const order = await db.historyOrder.create({ data: { requestId: second.resource, quoteId: second.quote.id, day: second.day, morning: false, state: "delivered", paidAt: now, receivedAt: now, holdExpiresAt: future, promiseAt: future, rights } });
  for (const target of [p.order, order]) {
   await db.historyOrder.update({ where: { id: target.id }, data: { state: "delivered" } });
   const purchase = await db.historyPurchaseIntent.create({ data: { orderId: target.id, sourceArtifactId: p.artifact.id, vin, providers: ["carfax"], state: "completed" } });
   await db.historyDelivery.create({ data: { orderId: target.id, artifactId: p.artifact.id, purchaseIntentId: purchase.id, sharedLink: "https://example.invalid/report", linkApprovedAt: now, deliveredAt: now, deliveredById: p.f.staff.userId } });
  }
  await db.historyOrder.update({ where: { id: p.order.id }, data: { createdAt: new Date("2026-10-25T07:00:00Z") } });
  await db.historyOrder.update({ where: { id: order.id }, data: { createdAt: new Date("2026-10-25T06:00:00Z") } });
  await refusalAfter(p.f.owner, b => b.query('UPDATE vehicle_history_requests SET "assignmentVersion"=2 WHERE id=$1', [second.resource]), service => service.historyPrevious(p.f.owner, vin));
  expect(await audit(p.f.resource)).toEqual([]); expect(await audit(second.resource)).toEqual([]);
 });

 async function listing(owner: Subject) {
  const brand = randomUUID(), model = randomUUID(), region = randomUUID(), city = randomUUID(), id = randomUUID();
  for (const [table, key] of [["brands", brand], ["regions", region]]) await pool.query(`INSERT INTO ${table}(id,slug,"nameRu","nameTk","nameEn","updatedAt") VALUES($1,$1,'fixture','fixture','fixture',clock_timestamp())`, [key]);
  await pool.query(`INSERT INTO models(id,"brandId",slug,"nameRu","nameTk","nameEn","updatedAt") VALUES($1,$2,$1,'fixture','fixture','fixture',clock_timestamp())`, [model, brand]);
  await pool.query(`INSERT INTO cities(id,"regionId",slug,"nameRu","nameTk","nameEn","updatedAt") VALUES($1,$2,$1,'fixture','fixture','fixture',clock_timestamp())`, [city, region]);
  await pool.query(`INSERT INTO listings(id,"sellerId","brandId","modelId","cityId","priceAmount","updatedAt") VALUES($1,$2,$3,$4,$5,1,clock_timestamp())`, [id, owner.userId, brand, model, city]);
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
  const f = await fixture(), a = caller({ hold: true }), b = caller();
  const assign = observe(a.service.assign(f.staff, f.id, 1, f.peer.userId)); await a.ready;
  const send = observe(b.service.send(f.owner, f.id, { clientMessageId: randomUUID(), body: "after handover", visibility: "customer" })); await b.started;
  await blocked(b.pid(), a.pid()); a.release(); expect((await assign).ok).toBe(true); expect((await send).ok).toBe(false);
  expect(await db.supportCase.findUnique({ where: { id: f.resource } })).toMatchObject({ assigneeId: f.peer.userId, assignmentVersion: 2 });
  expect(await effects(f.id)).toEqual({ messages: 0, outbox: 1, reads: 0, subscriptions: 0 });
 });
 it.each(["accept", "purchase"] as const)("%s first releases a shared provider before the opposing real caller completes", async first => {
  const f = await history(), other = await history();
  const paidAt = new Date("2000-01-01T08:00:00Z");
  const order = await db.historyOrder.create({ data: { requestId: other.resource, quoteId: other.quote.id, day: other.day, morning: false, state: "paid", paidAt, receivedAt: paidAt, holdExpiresAt: future, promiseAt: future, rights } });
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

});
