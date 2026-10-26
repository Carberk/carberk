import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";

import { CreateBucketCommand, PutObjectCommand, HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { ServiceMessagingSchemas as S } from "@auto-tm/contracts";
import { PrismaService, type Prisma } from "@auto-tm/db";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { ExpireServiceContent } from "./ExpireServiceContent";
import { S3RetiredObjectStore } from "./S3RetiredObjectStore";
import { PurgeExpiredAccounts } from "./PurgeExpiredAccounts";

type Subject = { userId: string; sessionId: string };
interface Caller {
 read(subject: Subject, id: string, after: number, limit: number): Promise<unknown>;
 send(subject: Subject, id: string, message: S.ServiceSend): Promise<unknown>;
 assign(subject: Subject, id: string, version: number, target?: string): Promise<void>;
 supportCommand(subject: Subject, id: string, command: S.SupportCommand): Promise<void>;
 historyCommand(subject: Subject, id: string, command: S.HistoryCommand): Promise<void>;
 historyArtifactCommand(subject: Subject, id: string, command: S.HistoryArtifactCommand): Promise<void>;
}
function present<T>(value: T | undefined): T { if (value === undefined) throw new Error("Missing fixture row"); return value; }
function latch() { let release!: () => void; const promise = new Promise<void>(resolve => { release = resolve; }); return { promise, release }; }
const rights: S.ServiceRights = { category: "history_communication", purpose: "Synthetic expiry fixture", basis: "consent", provenance: "Task-owned disposable", identifiability: "personal", use: ["service"], schedule: { kind: "until", until: "2026-10-24T00:00:00Z", reason: "Synthetic retention" }, supplierRestrictions: "", hold: null };

// Explicit opt-in. This suite creates and destroys ONLY its own disposable server.
// It never consumes a supplied DATABASE_URL or shared/staging database.
describe.skipIf(process.env["R6C_EXPIRY_DISPOSABLE"] !== "1")("ordinary expiry preparation on disposable PostgreSQL", () => {
 const name = `r6c-expiry-${randomUUID()}`;
 const now = new Date("2026-10-25T08:00:00Z");
 let db: PrismaService, control: PrismaService;
 let databaseName = "", baseUrl = "";
 let s3: S3Client, objects: S3RetiredObjectStore;
 let minioStarted = false;
 const minio = `${name}-objects`, bucket = "r6c-expiry";
 const keys: string[] = [], releases: (() => void)[] = [], pending: Promise<unknown>[] = [];
 let construct: (database: PrismaService) => Caller;
 let started = false;
 const priorUrl = process.env["DATABASE_URL"];
 beforeAll(async () => {
  execFileSync("docker", ["run", "--rm", "-d", "--name", name, "-e", "POSTGRES_PASSWORD=expiry", "-e", "POSTGRES_DB=expiry", "-p", "127.0.0.1::5432", "postgres:17-alpine"], { stdio: "pipe" });
  started = true;
  const binding = execFileSync("docker", ["port", name, "5432/tcp"], { encoding: "utf8" }).trim();
  for (let attempt = 0; attempt < 80; attempt++) {
   try { execFileSync("docker", ["exec", name, "pg_isready", "-U", "postgres"], { stdio: "pipe" }); break; }
   catch { await new Promise(resolve => setTimeout(resolve, 100)); }
  }
  const url = `postgresql://postgres:expiry@${binding}/expiry`;
  execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], { cwd: resolve(__dirname, "../../../../packages/db"), env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
  baseUrl = url;
  process.env["DATABASE_URL"] = url;
  const template = new PrismaService();
  // Matched campaign-preparation activation in this owned disposable template.
  // Preserve selective source activation separately; all native constraints stay on.
  const guards = await template.$queryRawUnsafe<{ table: string; name: string }[]>("SELECT c.relname AS table,t.tgname AS name FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE t.tgname LIKE 'zzzz_campaign_preparation%'");
  for (const guard of guards) {
   if (!/^[a-z_]+$/.test(guard.table) || !/^[a-z_]+$/.test(guard.name)) throw new Error("Invalid disposable trigger name");
   await template.$executeRawUnsafe(`ALTER TABLE public."${guard.table}" ENABLE TRIGGER "${guard.name}"`);
  }
  expect(await template.$queryRawUnsafe("SELECT campaign_preparation_ready() AS ready")).toEqual([{ ready: true }]);
  await template.onModuleDestroy();
  process.env["DATABASE_URL"] = url.replace("/expiry", "/postgres");
  control = new PrismaService(); await control.$connect();
  await control.$executeRawUnsafe("CREATE ROLE r6c_expiry NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT");
  execFileSync("docker", ["run", "--rm", "-d", "--name", minio, "-e", "MINIO_ROOT_USER=expiryadmin", "-e", "MINIO_ROOT_PASSWORD=expirysecret", "-p", "127.0.0.1::9000", "cgr.dev/chainguard/minio@sha256:4692462f35d97d7e82c30371d82f057703c5d9489bcae726010594c812f2d285", "server", "/data"], { stdio: "pipe" });
  minioStarted = true;
  const endpoint = `http://${execFileSync("docker", ["port", minio, "9000/tcp"], { encoding: "utf8" }).trim()}`;
  let healthy = false;
  for (let attempt = 0; attempt < 80; attempt++) {
   try { healthy = (await fetch(`${endpoint}/minio/health/live`)).ok; } catch { /* Process may not yet listen. */ }
   if (healthy) break;
   await new Promise(resolve => setTimeout(resolve, 100));
  }
  if (!healthy) throw new Error("Owned MinIO did not become ready");
  s3 = new S3Client({ endpoint, region: "us-east-1", forcePathStyle: true, credentials: { accessKeyId: "expiryadmin", secretAccessKey: "expirysecret" } });
  objects = new S3RetiredObjectStore(s3, bucket);
  await s3.send(new CreateBucketCommand({ Bucket: bucket }));
  const load = async (path: string) => import(/* @vite-ignore */ resolve(__dirname, `../../../api/src/modules/${path}.ts`));
  const { PrismaServiceMessaging } = await load("service-messaging/infrastructure/PrismaServiceMessaging") as { PrismaServiceMessaging: new (...args: unknown[]) => Caller };
  const { PrismaStaffAuthority } = await load("identity/infrastructure/PrismaStaffAuthority") as { PrismaStaffAuthority: new (database: unknown) => unknown };
  const { CheckStaffAuthority } = await load("identity/application/CheckStaffAuthority") as { CheckStaffAuthority: new (...args: unknown[]) => unknown };
  const { CampaignServiceAdmission } = await load("service-messaging/infrastructure/campaignServiceAdmission") as { CampaignServiceAdmission: new (config: unknown) => unknown };
  construct = database => new PrismaServiceMessaging(database, new CheckStaffAuthority(new PrismaStaffAuthority(database), { now: () => now }), { get: async () => { throw new Error("unexpected byte read"); }, putImmutable: async () => { throw new Error("unexpected byte write"); }, remove: async () => { throw new Error("unexpected byte remove"); } }, { now: () => now, id: randomUUID, syntheticEnabled: () => true, syntheticSubjectAllowed: () => true }, new CampaignServiceAdmission({ get: () => undefined }));
  console.info("R6c disposable provenance", { postgres: name, minio, role: "r6c_expiry", schema: await control.$queryRawUnsafe("SELECT version()"), migrations: "all committed through 20261025017500; isolated template expiry" });
 }, 60000);
 afterAll(async () => {
  if (control) await control.onModuleDestroy();
  s3?.destroy();
  if (minioStarted) execFileSync("docker", ["stop", minio], { stdio: "pipe" });
  if (started) execFileSync("docker", ["stop", name], { stdio: "pipe" });
  if (priorUrl === undefined) delete process.env["DATABASE_URL"]; else process.env["DATABASE_URL"] = priorUrl;
 });
 beforeEach(async () => {
  databaseName = `r6c_${randomUUID().replaceAll("-", "")}`;
  await control.$executeRawUnsafe(`CREATE DATABASE "${databaseName}" TEMPLATE expiry`);
  process.env["DATABASE_URL"] = baseUrl.replace("/expiry", `/${databaseName}`);
  db = new PrismaService(); await db.$connect();
  await db.$executeRawUnsafe("GRANT USAGE ON SCHEMA public TO r6c_expiry");
  await db.$executeRawUnsafe("GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO r6c_expiry");
  await db.$executeRawUnsafe("GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO r6c_expiry");
  await db.$executeRawUnsafe("GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO r6c_expiry");
 });
 afterEach(async () => {
  releases.splice(0).forEach(release => release());
  await Promise.allSettled(pending.splice(0));
  if (keys.length) await objects.deleteAndVerify(keys.splice(0));
  await db?.onModuleDestroy();
  if (databaseName) await control.$executeRawUnsafe(`DROP DATABASE "${databaseName}" WITH (FORCE)`);
 });
 /** Transparent transaction/storage instrumentation. No production collaborator
  * is replaced. Real role, preparation, SQL locks and finish remain active. */
 function transaction(options: { hold?: boolean; rollback?: boolean; beforeFinish?: (tx: Prisma.TransactionClient) => Promise<void> } = {}) {
  const ready = latch(), finish = latch(), started = latch(); let backend = 0;
  releases.push(finish.release);
  const database = new Proxy(db, { get(target, property) {
   if (property === "$transaction") return <T>(work: (tx: Prisma.TransactionClient) => Promise<T>, config?: { timeout?: number }) => target.$transaction(async tx => {
    await tx.$executeRawUnsafe("SET LOCAL ROLE r6c_expiry");
    const [identity] = await tx.$queryRaw<{ pid: number; elevated: boolean; trigger: boolean }[]>`SELECT pg_backend_pid() AS pid,rolsuper OR rolcreatedb OR rolcreaterole AS elevated,has_table_privilege(current_user,'users','TRIGGER') AS trigger FROM pg_roles WHERE rolname=current_user`;
    expect(identity).toMatchObject({ elevated: false, trigger: false });
    backend = present(identity).pid; started.release();
    const instrumented = options.beforeFinish ? new Proxy(tx, { get(inner, key) {
     if (key === "$queryRaw") return async (strings: TemplateStringsArray, ...values: unknown[]) => {
      if (strings.join("?").includes("public.campaign_finish")) await options.beforeFinish?.(tx);
      return inner.$queryRaw(strings, ...values);
     };
     return Reflect.get(inner, key);
    } }) : tx;
    const result = await work(instrumented); ready.release();
    if (options.hold) await finish.promise;
    if (options.rollback) throw new Error("Synthetic outer rollback");
    return result;
   }, config);
   return Reflect.get(target, property);
  } });
  return { database, ready: ready.promise, started: started.promise, release: finish.release, pid: () => backend };
 }
 function observe<T>(promise: Promise<T>) { const result = promise.then(value => ({ ok: true as const, value }), (error: unknown) => ({ ok: false as const, error })); pending.push(result); return result; }
 async function blocked(waiter: number, blocker: number) {
  const deadline = performance.now() + 2500;
  while (performance.now() < deadline) {
   const [row] = await db.$queryRaw<{ pids: number[] }[]>`SELECT pg_blocking_pids(${waiter}::int) AS pids`;
   if (row?.pids.includes(blocker)) { console.info("R6c real PostgreSQL barrier", { waiter, blocker, blockingPids: row.pids }); return; }
   await new Promise(resolve => setTimeout(resolve, 5));
  }
  throw new Error(`Missing actual PostgreSQL barrier waiter=${waiter} blocker=${blocker}`);
 }
 async function principal(staff = false) {
  const userId = randomUUID(), sessionId = randomUUID();
  await db.user.create({ data: { id: userId } });
  await db.session.create({ data: { id: sessionId, userId, refreshTokenHash: randomUUID(), expiresAt: new Date("2027-01-01T00:00:00Z"), adminTotpExpiresAt: new Date("2027-01-01T00:00:00Z") } });
  if (staff) for (const capability of ["support.operations", "history.fulfilment"]) await db.staffGrant.create({ data: { userId, capability, grantedAt: now } });
  return { userId, sessionId };
 }
 async function fixture(purpose: "support" | "history" = "support", due = true) {
  const owner = await principal(), staff = await principal(true), peer = await principal(true), resourceId = randomUUID(), id = randomUUID();
  if (purpose === "support") await db.supportCase.create({ data: { id: resourceId, customerId: owner.userId, assigneeId: staff.userId, assignmentVersion: 1, status: "closed", closedAt: due ? new Date("2026-07-01T00:00:00Z") : now } });
  else await db.vehicleHistoryRequest.create({ data: { id: resourceId, customerId: owner.userId, assigneeId: staff.userId, assignmentVersion: 1 } });
  await db.serviceConversation.create({ data: { id, purpose, ...(purpose === "support" ? { supportCaseId: resourceId } : { historyRequestId: resourceId }), lastSequence: 1 } });
  return { id, resourceId, owner, staff, peer };
 }
 async function attachment(f: Awaited<ReturnType<typeof fixture>>, state = "adopted", fileRights: unknown = rights) {
  const id = randomUUID(), key = `service-private/${f.id}/${id}/synthetic`;
  await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: "Synthetic private bytes" })); keys.push(key);
  await db.serviceAttachment.create({ data: { id, conversationId: f.id, uploaderId: f.owner.userId, lifecycleEpoch: 0, category: rights.category, visibility: "customer", state, stagingKey: `stage/${id}`, objectKey: key, contentType: "image/jpeg", expectedBytes: 23, sizeBytes: 23, sha256: "synthetic", filename: "synthetic.jpg", rights: fileRights as Prisma.InputJsonValue, expiresAt: new Date("2026-10-24T00:00:00Z") } });
  return { id, key };
 }
 async function snapshot() {
  const [row] = await db.$queryRaw<{ rows: unknown }[]>`SELECT jsonb_build_object(
   'cases',(SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY id),'[]') FROM support_cases s),
   'conversations',(SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY id),'[]') FROM service_conversations s),
   'attachments',(SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY id),'[]') FROM service_attachments s),
   'messages',(SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY id),'[]') FROM service_messages s),
   'fences',(SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY "conversationId"),'[]') FROM service_erasure_fences s),
   'audits',(SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY id),'[]') FROM service_audits s),
   'outbox',(SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY id),'[]') FROM service_outbox s),
   'reads',(SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY "conversationId","userId"),'[]') FROM service_read_states s),
   'subscriptions',(SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY id),'[]') FROM service_push_subscriptions s),
   'artifacts',(SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY id),'[]') FROM history_artifacts s),
   'cleanup',(SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY "artifactId"),'[]') FROM history_artifact_cleanup s),
   'preparations',(SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY id),'[]') FROM campaign_preparations s)) AS rows`;
  return present(row).rows;
 }
 async function gone(key: string) { await expect(s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }))).rejects.toMatchObject({ $metadata: { httpStatusCode: 404 } }); }
 it("purges due Support atomically, scrubs private linkage and retries only durable exact keys", async () => {
  const f = await fixture(), file = await attachment(f, "adopted", { ...rights, category: "support_communication", schedule: { kind: "support_case" } });
  await db.serviceMessage.create({ data: { conversationId: f.id, sequence: 1, clientMessageId: randomUUID(), senderId: f.owner.userId, senderKind: "customer", visibility: "customer", body: "Synthetic private message", attachmentId: file.id, requestHash: "synthetic" } });
  await db.serviceReadState.create({ data: { conversationId: f.id, userId: f.owner.userId, lastSequence: 1 } });
  await db.serviceOutbox.create({ data: { conversationId: f.id, eventType: "message", sequence: 1, visibility: "customer", lifecycleEpoch: 0 } });
  const device = await db.fcmDevice.create({ data: { userId: f.owner.userId, token: randomUUID(), platform: "android" } });
  await db.servicePushSubscription.create({ data: { conversationId: f.id, sessionId: f.owner.sessionId, deviceId: device.id, lifecycleEpoch: 0 } });
  const audit = await db.serviceAudit.create({ data: { actorId: f.staff.userId, resourceId: f.resourceId, purpose: "support", action: "SERVICE_READ", reason: "Synthetic private reason" } });
  const lane = transaction();
  await expect(new ExpireServiceContent(lane.database, { deleteAndVerify: async () => { throw new Error("Synthetic outage"); } }).execute(now)).rejects.toThrow("Service private cleanup unavailable");
  expect(await db.serviceConversation.findUniqueOrThrow({ where: { id: f.id } })).toMatchObject({ lifecycleEpoch: 1, erasedAt: now });
  expect(await db.supportCase.findUniqueOrThrow({ where: { id: f.resourceId } })).toMatchObject({ customerId: null, assigneeId: null, sourceListingId: null, assignmentVersion: 2 });
  expect(await db.serviceAttachment.findUniqueOrThrow({ where: { id: file.id } })).toMatchObject({ state: "removed", removedAt: now, uploaderId: null });
  expect(await db.serviceAudit.findUniqueOrThrow({ where: { id: audit.id } })).toMatchObject({ reason: null });
  expect(await db.serviceAudit.count({ where: { resourceId: f.resourceId, action: "SERVICE_CONTENT_PURGED" } })).toBe(1);
  expect(await Promise.all([db.serviceMessage.count({ where: { conversationId: f.id } }), db.serviceOutbox.count({ where: { conversationId: f.id } }), db.serviceReadState.count({ where: { conversationId: f.id } }), db.servicePushSubscription.count({ where: { conversationId: f.id } })])).toEqual([0, 0, 0, 0]);
  expect(await db.serviceErasureFence.findUniqueOrThrow({ where: { conversationId: f.id } })).toMatchObject({ epoch: 1, objectKeys: [file.key], cleanupCompletedAt: null });
  await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: file.key }));
  expect(await new ExpireServiceContent(lane.database, objects).execute(now)).toEqual({ supportPurged: 0, attachmentsRetired: 0, cleanupsCompleted: 1 });
  await gone(file.key);
  expect(await new ExpireServiceContent(lane.database, objects).execute(now)).toEqual({ supportPurged: 0, attachmentsRetired: 0, cleanupsCompleted: 0 });
  expect(await db.campaignPreparation.count()).toBe(0);
 });
 it("retires staged and scheduled unheld attachments while keeping held and notdue full snapshots", async () => {
  const f = await fixture("history"), staged = await attachment(f, "staged", { ...rights, schedule: { kind: "permitted_knowledge" } }), scheduled = await attachment(f);
  const held = await attachment(f, "staged", { ...rights, hold: { until: "2026-10-26T00:00:00Z" } }), notdue = await attachment(f, "adopted", { ...rights, schedule: { kind: "until", until: "2027-01-01T00:00:00Z" } });
  const before = await db.serviceAttachment.findMany({ where: { id: { in: [held.id, notdue.id] } }, orderBy: { id: "asc" } });
  expect(await new ExpireServiceContent(transaction().database, objects).execute(now)).toEqual({ supportPurged: 0, attachmentsRetired: 2, cleanupsCompleted: 1 });
  expect(await db.serviceAttachment.findMany({ where: { id: { in: [held.id, notdue.id] } }, orderBy: { id: "asc" } })).toEqual(before);
  for (const file of [staged, scheduled]) { expect(await db.serviceAttachment.findUniqueOrThrow({ where: { id: file.id } })).toMatchObject({ state: "removed", uploaderId: null }); await gone(file.key); }
  expect(await db.campaignPreparation.count()).toBe(0);
 });
 it("holds due Support and keeps a newly closed case unchanged", async () => {
  const held = await fixture(), recent = await fixture("support", false);
  await attachment(held, "adopted", { ...rights, schedule: { kind: "support_case" }, hold: { until: "2026-10-26T00:00:00Z" } });
  const before = await snapshot();
  expect(await new ExpireServiceContent(transaction().database, objects).execute(now)).toEqual({ supportPurged: 0, attachmentsRetired: 0, cleanupsCompleted: 0 });
  expect(await snapshot()).toEqual(before);
  expect(recent.id).not.toBe(held.id);
 });
 it("reaches actual purge writes and finish, then rolls back fence, audit and unlink together on finish refusal", async () => {
  const f = await fixture(); await attachment(f, "adopted", { ...rights, schedule: { kind: "support_case" } });
  const before = await snapshot(); let reached = false;
  const lane = transaction({ beforeFinish: async tx => {
   reached = true;
   expect(await tx.serviceConversation.findUniqueOrThrow({ where: { id: f.id } })).toMatchObject({ erasedAt: now, lifecycleEpoch: 1 });
   expect(await tx.supportCase.findUniqueOrThrow({ where: { id: f.resourceId } })).toMatchObject({ customerId: null });
   expect(await tx.serviceErasureFence.count({ where: { conversationId: f.id } })).toBe(1);
   expect(await tx.serviceAudit.count({ where: { resourceId: f.resourceId, action: "SERVICE_CONTENT_PURGED" } })).toBe(1);
   const [receipt] = await tx.$queryRaw<{ id: string }[]>`SELECT id::text FROM campaign_preparations WHERE backend_pid=pg_backend_pid()`;
   expect(receipt).toBeDefined();
   await tx.$queryRaw`SELECT campaign_finish(${present(receipt).id}::uuid)::text`;
  } });
  await expect(new ExpireServiceContent(lane.database, objects).execute(now)).rejects.toThrow("campaign_preparation_receipt");
  expect(reached).toBe(true); expect(await snapshot()).toEqual(before);
 });
 it("refuses nonprivate durable fence keys without touching bytes or completing work", async () => {
  const f = await fixture("support", false);
  await db.serviceErasureFence.create({ data: { conversationId: f.id, epoch: 0, objectKeys: ["other-tenant/secret"] } });
  const before = await snapshot();
  await expect(new ExpireServiceContent(transaction().database, objects).execute(now)).rejects.toThrow("Service cleanup authority invalid");
  expect(await snapshot()).toEqual(before);
 });
 for (const order of ["caller-first", "expiry-first"] as const) for (const kind of ["send", "read", "assign", "reopen"] as const) it(`${kind} versus expiry has a real barrier and atomic result, ${order}`, async () => {
  const f = await fixture();
  const first = transaction({ hold: true }), second = transaction();
  const action = (database: PrismaService): Promise<unknown> => {
   const caller = construct(database);
   if (kind === "send") return caller.send(f.owner, f.id, { clientMessageId: randomUUID(), body: "Synthetic racing message", visibility: "customer" });
   if (kind === "read") return caller.read(f.staff, f.id, 0, 20);
   if (kind === "assign") return caller.assign(f.staff, f.id, 1, f.peer.userId);
   return caller.supportCommand(f.staff, f.id, { kind: "reopen" });
  };
  const a = observe(order === "caller-first" ? action(first.database) : new ExpireServiceContent(first.database, objects).execute(now));
  await Promise.race([first.ready, a.then(result => { if (!result.ok) throw result.error; })]);
  const b = observe(order === "caller-first" ? new ExpireServiceContent(second.database, objects).execute(now) : action(second.database));
  await second.started; await Promise.race([blocked(second.pid(), first.pid()), b.then(result => { if (!result.ok) throw result.error; })]); first.release();
  expect((await a).ok).toBe(true);
  const result = await b;
  if (order === "expiry-first") { expect(result.ok).toBe(false); expect(await db.serviceConversation.findUniqueOrThrow({ where: { id: f.id } })).toMatchObject({ erasedAt: now }); }
  else { expect(result.ok).toBe(false); expect(String("error" in result ? result.error : "")).toContain("Service expiry preparation changed"); }
  expect(await db.campaignPreparation.count()).toBe(0);
 });
 for (const order of ["adoption-first", "expiry-first"] as const) it(`actual attachment adoption versus expiry keeps exact private bytes and lifecycle authority, ${order}`, async () => {
  const f = await fixture("history");
  const file = await attachment(f, "staged", { ...rights, schedule: { kind: "until", until: "2026-10-25T08:30:00Z", reason: "Synthetic retention" } });
  await db.serviceAttachment.update({ where: { id: file.id }, data: { expiresAt: new Date("2026-10-25T10:00:00Z") } });
  const later = new Date("2026-10-25T09:00:00Z"), first = transaction({ hold: true }), second = transaction();
  const adopt = (database: PrismaService) => construct(database).send(f.owner, f.id, { clientMessageId: randomUUID(), attachmentId: file.id, visibility: "customer" });
  const a = observe(order === "adoption-first" ? adopt(first.database) : new ExpireServiceContent(first.database, objects).execute(later));
  await Promise.race([first.ready, a.then(result => { if (!result.ok) throw result.error; })]);
  const b = observe(order === "adoption-first" ? new ExpireServiceContent(second.database, objects).execute(later) : adopt(second.database));
  await second.started;
  await Promise.race([blocked(second.pid(), first.pid()), b.then(result => { if (!result.ok) throw result.error; })]);
  first.release(); expect((await a).ok).toBe(true);
  const result = await b; expect(result.ok).toBe(false);
  if (order === "adoption-first") {
   expect(String("error" in result ? result.error : "")).toContain("Service expiry preparation changed");
   expect(await db.serviceAttachment.findUniqueOrThrow({ where: { id: file.id } })).toMatchObject({ state: "adopted", removedAt: null, uploaderId: f.owner.userId });
   expect(await db.serviceMessage.count({ where: { conversationId: f.id, attachmentId: file.id } })).toBe(1);
   await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: file.key }));
   expect(await new ExpireServiceContent(transaction().database, objects).execute(later)).toEqual({ supportPurged: 0, attachmentsRetired: 1, cleanupsCompleted: 1 });
  } else {
   expect(await db.serviceMessage.count({ where: { conversationId: f.id } })).toBe(0);
   expect(await db.serviceOutbox.count({ where: { conversationId: f.id } })).toBe(0);
  }
  expect(await db.serviceAttachment.findUniqueOrThrow({ where: { id: file.id } })).toMatchObject({ state: "removed", removedAt: later, uploaderId: null });
  expect(await db.serviceErasureFence.findUniqueOrThrow({ where: { conversationId: f.id } })).toMatchObject({ epoch: 0, objectKeys: [file.key], cleanupCompletedAt: later });
  await gone(file.key); expect(await db.campaignPreparation.count()).toBe(0);
 });
 // Saturate the real production selector with one overflow row. A database
 // boundary sentinel stops immediately AFTER its real result, before domain
 // mutation. This proves exact selection bounds/order and zero overflow effects;
 // it deliberately does not claim a100/200-transaction sweep completed.
 for (const proof of ["selection", "finish"] as const) for (const kind of ["support100", "attachments200", "artifacts100", "fences100"] as const) it.skipIf(proof === "finish" && process.env["R6C_EXPIRY_SATURATION_FINISH"] !== "1")(`saturation ${kind} ${proof} preserves the exact finite oldest page and overflow`, async () => {
  const limit = kind === "attachments200" ? 200 : 100;
  const ids = Array.from({ length: limit + 1 }, () => randomUUID());
  const date = (index: number) => new Date(Date.UTC(2026, 0, 1, 0, 0, index));
  const expected = ids.slice(0, limit);
  if (kind === "support100") {
   await db.supportCase.createMany({ data: ids.map((id, index) => ({ id, status: "closed", closedAt: date(index) })) });
   await db.serviceConversation.createMany({ data: ids.map(id => ({ id: randomUUID(), purpose: "support", supportCaseId: id })) });
  } else if (kind === "attachments200") {
   const f = await fixture("history");
   await db.serviceAttachment.createMany({ data: ids.map((id, index) => ({ id, conversationId: f.id, lifecycleEpoch: 0, category: "history_communication", visibility: "customer", state: "staged", stagingKey: `stage/${id}`, contentType: "image/jpeg", expectedBytes: 1, filename: "synthetic.jpg", rights, expiresAt: date(index), createdAt: date(index) })) });
  } else if (kind === "artifacts100") {
   await db.historyArtifact.createMany({ data: ids.map(id => ({ id, provider: "carfax", originalDate: now, objectKey: `history-artifacts/${id}/${"b".repeat(64)}`, sha256: "b".repeat(64), sizeBytes: 1, expectedPages: 1, state: "restricted", restrictedAt: now, rights: {} })) });
   await db.historyArtifactCleanup.createMany({ data: ids.map((id, index) => ({ artifactId: id, objectKey: `history-artifacts/${id}/${"b".repeat(64)}`, sha256: "b".repeat(64), requestedAt: date(index) })) });
  } else {
   await db.vehicleHistoryRequest.createMany({ data: ids.map(id => ({ id })) });
   await db.serviceConversation.createMany({ data: ids.map(id => ({ id, purpose: "history", historyRequestId: id })) });
   await db.serviceErasureFence.createMany({ data: ids.map((id, index) => ({ conversationId: id, epoch: 0, objectKeys: [], erasedAt: date(index) })) });
  }
  if (proof === "finish") {
   // Full sweep acceptance is separately opt-in and retains the runner's native
   // timeout. No partial pass is substituted for this finish/count assertion.
   const overflowId = present(ids[limit]);
   const overflow = async () => kind === "support100"
    ? { owner: await db.supportCase.findUniqueOrThrow({ where: { id: overflowId } }), conversation: await db.serviceConversation.findUniqueOrThrow({ where: { supportCaseId: overflowId } }) }
    : kind === "attachments200" ? await db.serviceAttachment.findUniqueOrThrow({ where: { id: overflowId } })
    : kind === "artifacts100" ? { artifact: await db.historyArtifact.findUniqueOrThrow({ where: { id: overflowId } }), cleanup: await db.historyArtifactCleanup.findUniqueOrThrow({ where: { artifactId: overflowId } }) }
    : await db.serviceErasureFence.findUniqueOrThrow({ where: { conversationId: overflowId } });
   const beforeOverflow = await overflow();
   const result = await new ExpireServiceContent(transaction().database, objects).execute(now);
   expect(result).toEqual(kind === "support100" ? { supportPurged: 100, attachmentsRetired: 0, cleanupsCompleted: 100 }
    : kind === "attachments200" ? { supportPurged: 0, attachmentsRetired: 200, cleanupsCompleted: 1 }
    : kind === "fences100" ? { supportPurged: 0, attachmentsRetired: 0, cleanupsCompleted: 100 }
    : { supportPurged: 0, attachmentsRetired: 0, cleanupsCompleted: 0 });
   expect(await overflow()).toEqual(beforeOverflow);
   if (kind === "support100") {
    expect(await db.serviceConversation.count({ where: { erasedAt: now } })).toBe(100);
    expect(await db.serviceAudit.count({ where: { action: "SERVICE_CONTENT_PURGED" } })).toBe(100);
    expect(await db.serviceErasureFence.count({ where: { cleanupCompletedAt: now } })).toBe(100);
   } else if (kind === "attachments200") {
    expect(await db.serviceAttachment.count({ where: { state: "removed", removedAt: now, uploaderId: null } })).toBe(200);
    expect(await db.serviceAttachment.count({ where: { removedAt: null } })).toBe(1);
   } else if (kind === "artifacts100") {
    expect(await db.historyArtifact.count({ where: { state: "removed", removedAt: now, vin: null, provenance: null } })).toBe(100);
    expect(await db.historyArtifactCleanup.count({ where: { completedAt: now } })).toBe(100);
    expect(await db.historyArtifactCleanup.count({ where: { completedAt: null } })).toBe(1);
   } else {
    expect(await db.serviceErasureFence.count({ where: { cleanupCompletedAt: now } })).toBe(100);
    expect(await db.serviceErasureFence.count({ where: { cleanupCompletedAt: null } })).toBe(1);
   }
   expect(await db.campaignPreparation.count()).toBe(0);
   return;
  }
  const before = await snapshot(), selected: string[] = [];
  const sentinel = new Error("Observed actual saturated production selector");
  const database = new Proxy(db, { get(target, property) {
   if (kind === "attachments200" && property === "$queryRaw") return async (parts: TemplateStringsArray, ...values: unknown[]) => {
    const rows = await target.$queryRaw<{ id: string }[]>(parts, ...values);
    if (parts.join("?").includes("ORDER BY \"createdAt\", id LIMIT 200")) { selected.push(...rows.map(row => row.id)); throw sentinel; }
    return rows;
   };
   const delegate = kind === "support100" ? "supportCase" : kind === "artifacts100" ? "historyArtifactCleanup" : "serviceErasureFence";
   if (kind !== "attachments200" && property === delegate) return new Proxy(Reflect.get(target, property), { get(inner, key) {
    if (key === "findMany") return async (args: unknown) => {
     const read = inner.findMany as (args: unknown) => Promise<{ id?: string; artifactId?: string; conversationId?: string }[]>;
     const rows = await read.call(inner, args);
     selected.push(...rows.map(row => present(row.id ?? row.artifactId ?? row.conversationId))); throw sentinel;
    };
    return Reflect.get(inner, key);
   } });
   return Reflect.get(target, property);
  } });
  await expect(new ExpireServiceContent(database, { deleteAndVerify: async () => { throw new Error("Saturation selector reached unexpected storage"); } }).execute(now)).rejects.toBe(sentinel);
  // Attachment selection has the explicit createdAt/id order; all fixture dates
  // are distinct. Other selectors retain their production oldest timestamp order.
  expect(selected).toEqual(expected);
  expect(selected).toHaveLength(limit);
  expect(selected).not.toContain(ids[limit]);
  expect(await snapshot()).toEqual(before);
 });
 for (const order of ["mutation-first", "cleanup-first"] as const) it(`storage-fence mutation uses two real expiry callers and exact durable bytes, ${order}`, async () => {
  const f = await fixture("history"), old = await attachment(f, "removed", { ...rights, schedule: { kind: "permitted_knowledge" } });
  await db.serviceAttachment.update({ where: { id: old.id }, data: { removedAt: now, uploaderId: null } });
  const later = new Date("2026-10-25T09:00:00Z");
  const added = await attachment(f, "adopted", { ...rights, schedule: { kind: "until", until: later.toISOString() } });
  await db.serviceErasureFence.create({ data: { conversationId: f.id, epoch: 0, objectKeys: [old.key], erasedAt: now } });
  const first = transaction({ hold: true }), second = transaction();
  const a = observe(new ExpireServiceContent(first.database, objects).execute(order === "mutation-first" ? later : now));
  await Promise.race([first.ready, a.then(result => { if (!result.ok) throw result.error; })]);
  const b = observe(new ExpireServiceContent(second.database, objects).execute(order === "mutation-first" ? now : later));
  await second.started;
  await Promise.race([blocked(second.pid(), first.pid()), b.then(result => { if (!result.ok) throw result.error; })]);
  first.release(); expect((await a).ok).toBe(true);
  const result = await b;
  expect(result.ok).toBe(false);
  expect(String("error" in result ? result.error : "")).toContain("Service expiry preparation changed");
  if (order === "mutation-first") {
   await gone(old.key); await gone(added.key);
   expect(await db.serviceErasureFence.findUniqueOrThrow({ where: { conversationId: f.id } })).toMatchObject({ epoch: 0, objectKeys: [old.key, added.key], cleanupCompletedAt: later });
  } else {
   await gone(old.key);
   await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: added.key }));
   expect(await db.serviceAttachment.findUniqueOrThrow({ where: { id: added.id } })).toMatchObject({ state: "adopted", removedAt: null });
   expect(await new ExpireServiceContent(transaction().database, objects).execute(later)).toEqual({ supportPurged: 0, attachmentsRetired: 1, cleanupsCompleted: 1 });
   await gone(added.key);
  }
  expect(await db.campaignPreparation.count()).toBe(0);
 });
 async function artifact(held = false) {
  const id = randomUUID(), sha256 = "b".repeat(64), objectKey = `history-artifacts/${id}/${sha256}`;
  await s3.send(new PutObjectCommand({ Bucket: bucket, Key: objectKey, Body: "Synthetic original" })); keys.push(objectKey);
  await db.historyArtifact.create({ data: { id, provider: "carfax", originalDate: now, vin: "1HGCM82633A004352", vehicleIdentity: "Synthetic vehicle", mileageValue: 1000, mileageUnit: "km", mileageObservedAt: now, sourceObservations: [{ page: 1, statement: "Synthetic observation" }], provenance: "Synthetic license", objectKey, sha256, sizeBytes: 18, expectedPages: 1, state: "restricted", restrictedAt: now, rights: { ...rights, category: "provider_artifact", hold: held ? { until: "2026-10-26T00:00:00Z" } : null } } });
  await db.historyArtifactCleanup.create({ data: { artifactId: id, objectKey, sha256, epoch: 1 } });
  return { id, sha256, objectKey };
 }
 it("cleans the exact restricted History original and scrubs all personal metadata after a durable external failure", async () => {
  const file = await artifact(), before = await snapshot();
  await expect(new ExpireServiceContent(transaction().database, { deleteAndVerify: async () => { throw new Error("Synthetic History outage"); } }).execute(now)).rejects.toThrow("Synthetic History outage");
  expect(await snapshot()).toEqual(before);
  expect(await new ExpireServiceContent(transaction().database, objects).execute(now)).toEqual({ supportPurged: 0, attachmentsRetired: 0, cleanupsCompleted: 0 });
  expect(await db.historyArtifact.findUniqueOrThrow({ where: { id: file.id } })).toMatchObject({ state: "removed", removedAt: now, vin: null, vehicleIdentity: null, mileageValue: null, mileageUnit: null, mileageObservedAt: null, sourceObservations: [], provenance: null, sourceListingId: null, acquiredForOrderId: null, verifiedById: null });
  expect(await db.historyArtifactCleanup.findUniqueOrThrow({ where: { artifactId: file.id } })).toMatchObject({ epoch: 1, objectKey: file.objectKey, sha256: file.sha256, completedAt: now });
  await gone(file.objectKey);
  expect(await db.campaignPreparation.count()).toBe(0);
 });
 for (const kind of ["hold", "hash", "key", "nonrestricted"] as const) it(`refuses History ${kind} with full rows and bytes unchanged`, async () => {
  console.info("R6c refusal stage", kind, "seed");
  const file = await artifact(kind === "hold");
  if (kind === "hash") await db.historyArtifactCleanup.update({ where: { artifactId: file.id }, data: { sha256: "c".repeat(64) } });
  if (kind === "key") await db.historyArtifactCleanup.update({ where: { artifactId: file.id }, data: { objectKey: "history-artifacts/other/private" } });
  if (kind === "nonrestricted") {
   // Fixture state differs from the cleanup authority while original immutable facts remain unchanged.
   await db.historyArtifact.update({ where: { id: file.id }, data: { state: "verified", restrictedAt: null, verifiedPages: 1, verifiedAt: now } });
  }
  const before = await snapshot();
  console.info("R6c refusal stage", kind, "execute");
  expect(await new ExpireServiceContent(transaction().database, objects).execute(now)).toEqual({ supportPurged: 0, attachmentsRetired: 0, cleanupsCompleted: 0 });
  console.info("R6c refusal stage", kind, "snapshot-and-head");
  expect(await snapshot()).toEqual(before);
  await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: file.objectKey }));
 });
 it("rolls back History scrub and completion after reachable finish refusal while leaving exact byte retry durable", async () => {
  const file = await artifact(), before = await snapshot(); let reached = false;
  const lane = transaction({ beforeFinish: async tx => {
   reached = true;
   expect(await tx.historyArtifact.findUniqueOrThrow({ where: { id: file.id } })).toMatchObject({ state: "removed", vin: null, sourceObservations: [] });
   expect(await tx.historyArtifactCleanup.findUniqueOrThrow({ where: { artifactId: file.id } })).toMatchObject({ completedAt: now });
   const [receipt] = await tx.$queryRaw<{ id: string }[]>`SELECT id::text FROM campaign_preparations WHERE backend_pid=pg_backend_pid()`;
   await tx.$queryRaw`SELECT campaign_finish(${present(receipt).id}::uuid)::text`;
  } });
  await expect(new ExpireServiceContent(lane.database, objects).execute(now)).rejects.toThrow("campaign_preparation_receipt");
  expect(reached).toBe(true); expect(await snapshot()).toEqual(before); await gone(file.objectKey);
  await new ExpireServiceContent(transaction().database, objects).execute(now);
  expect(await db.historyArtifactCleanup.findUniqueOrThrow({ where: { artifactId: file.id } })).toMatchObject({ completedAt: now });
 });
 for (const order of ["purge-first", "expiry-first"] as const) it(`actual account purge and expiry serialize without private revival, ${order}`, async () => {
  const f = await fixture();
  await db.user.update({ where: { id: f.owner.userId }, data: { deletionScheduledAt: new Date("2026-10-24T00:00:00Z") } });
  const gate = latch(), gateReady = latch(), first = transaction({ hold: true }); releases.push(gate.release);
  let gatePid = 0;
  const blocker = observe(db.$transaction(async tx => {
   const [row] = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
   gatePid = present(row).pid;
   await tx.$queryRaw`SELECT pg_advisory_xact_lock(899999, 8976)::text`;
   gateReady.release(); await gate.promise;
  }));
  await gateReady.promise;
  // Keep every actual array-transaction query. Append only a test-owned end
  // barrier, so the complete production purge remains open before COMMIT.
  const purgeDatabase = new Proxy(db, { get(target, key) {
   if (key === "$transaction") return (queries: Prisma.PrismaPromise<unknown>[]) => target.$transaction([
    target.$executeRawUnsafe("SET LOCAL ROLE r6c_expiry"), ...queries,
    target.$queryRaw`SELECT pg_advisory_xact_lock(899999, 8976)::text /* r6c purge end barrier */`,
   ]);
   return Reflect.get(target, key);
  } });
  const purge = () => new PurgeExpiredAccounts(purgeDatabase).execute({ now });
  const waiterFor = async (pid: number) => {
   const deadline = performance.now() + 2500;
   while (performance.now() < deadline) {
    const rows = await db.$queryRaw<{ pid: number }[]>`SELECT pid FROM pg_stat_activity WHERE ${pid}::int=ANY(pg_blocking_pids(pid))`;
    if (rows[0]) return rows[0].pid;
    await new Promise(resolve => setTimeout(resolve, 5));
   }
   throw new Error("Actual purge did not reach expected PostgreSQL wait");
  };
  let a: ReturnType<typeof observe>, b: ReturnType<typeof observe>;
  if (order === "purge-first") {
   a = observe(purge());
   const purgePid = await Promise.race([waiterFor(gatePid), a.then(result => { if (!result.ok) throw result.error; throw new Error("Purge skipped end barrier"); })]);
   b = observe(new ExpireServiceContent(first.database, objects).execute(now));
   await first.started; await blocked(first.pid(), purgePid); gate.release(); first.release();
  } else {
   a = observe(new ExpireServiceContent(first.database, objects).execute(now));
   await Promise.race([first.ready, a.then(result => { if (!result.ok) throw result.error; })]);
   b = observe(purge()); await Promise.race([waiterFor(first.pid()), b.then(result => { if (!result.ok) throw result.error; })]);
   first.release(); gate.release();
  }
  expect((await a).ok).toBe(true);
  const result = await b;
  if (order === "purge-first") { expect(result.ok).toBe(false); expect(String("error" in result ? result.error : "")).toContain("Service expiry preparation changed"); }
  else expect(result.ok).toBe(true);
  expect((await blocker).ok).toBe(true);
  expect(await db.serviceConversation.findUniqueOrThrow({ where: { id: f.id } })).toMatchObject({ erasedAt: now, lifecycleEpoch: 1 });
  expect(await db.supportCase.findUniqueOrThrow({ where: { id: f.resourceId } })).toMatchObject({ customerId: null });
  expect(await db.serviceMessage.count({ where: { conversationId: f.id } })).toBe(0);
  expect(await db.campaignPreparation.count()).toBe(0);
 });
 it("refuses a stale selected History cleanup epoch before deleting bytes or scrubbing metadata", async () => {
  const id = randomUUID(), sha256 = "a".repeat(64), objectKey = `history-artifacts/${id}/${sha256}`;
  await db.historyArtifact.create({ data: { id, provider: "carfax", originalDate: now, vin: "1HGCM82633A004352", objectKey, sha256, sizeBytes: 10, expectedPages: 1, state: "restricted", restrictedAt: now, rights: {} } });
  await db.historyArtifactCleanup.create({ data: { artifactId: id, objectKey, sha256, epoch: 1 } });
  const selected = db.historyArtifactCleanup.findMany.bind(db.historyArtifactCleanup);
  const instrumented = new Proxy(db, { get(target, property) {
   if (property === "historyArtifactCleanup") return new Proxy(target.historyArtifactCleanup, { get(delegate, key) {
    if (key === "findMany") return async (args: Prisma.HistoryArtifactCleanupFindManyArgs) => {
     const rows = await selected(args);
     await db.historyArtifactCleanup.update({ where: { artifactId: id }, data: { epoch: 2 } });
     return rows;
    };
    return Reflect.get(delegate, key);
   } });
   return Reflect.get(target, property);
  } });
  const artifact = await db.historyArtifact.findUniqueOrThrow({ where: { id } });
  const deleted: string[][] = [];
  await new ExpireServiceContent(instrumented, { deleteAndVerify: async keys => { deleted.push(keys); } }).execute(now);
  expect(deleted).toEqual([]);
  expect(await db.historyArtifact.findUniqueOrThrow({ where: { id } })).toEqual(artifact);
  expect(await db.historyArtifactCleanup.findUniqueOrThrow({ where: { artifactId: id } })).toMatchObject({ epoch: 2, completedAt: null });
 });
});
