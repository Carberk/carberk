import { randomUUID } from "node:crypto";

import { CreateBucketCommand, PutObjectCommand, HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { PrismaService, type Prisma } from "@auto-tm/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AdvanceHistoryOrders } from "./AdvanceHistoryOrders";
import { ExpireServiceContent } from "./ExpireServiceContent";
import { PurgeExpiredAccounts } from "./PurgeExpiredAccounts";
import { S3RetiredObjectStore } from "./S3RetiredObjectStore";

const endpoint = process.env["MINIO_ENDPOINT"] ?? "";
const hosted = process.env["GITHUB_ACTIONS"] === "true" && !!process.env["DATABASE_URL"] && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(endpoint);
const now = new Date("2000-06-01T12:00:00Z");
describe.skipIf(!hosted)("private service lifecycle on disposable PostgreSQL and storage", () => {
 const db = new PrismaService();
 const s3 = new S3Client({ endpoint, region: "us-east-1", forcePathStyle: true, credentials: { accessKeyId: process.env["MINIO_ACCESS_KEY"] ?? "minioadmin", secretAccessKey: process.env["MINIO_SECRET_KEY"] ?? "minioadmin" } });
 const objects = new S3RetiredObjectStore(s3, "service-private");
 const users: string[] = [], conversations: string[] = [], owners: string[] = [], keys: string[] = [], artifactIds: string[] = [];
 beforeAll(async () => {
  await db.$connect();
  try { await s3.send(new CreateBucketCommand({ Bucket: "service-private" })); } catch (error) { if (!(error instanceof Error) || !["BucketAlreadyExists", "BucketAlreadyOwnedByYou"].includes(error.name)) throw error; }
 });
 afterAll(async () => {
  for (const key of keys) await objects.deleteAndVerify([key]);
  await db.serviceOutbox.deleteMany({ where: { conversationId: { in: conversations } } });
  await db.serviceReadState.deleteMany({ where: { conversationId: { in: conversations } } });
  await db.serviceMessage.deleteMany({ where: { conversationId: { in: conversations } } });
  await db.serviceAttachment.deleteMany({ where: { conversationId: { in: conversations } } });
  await db.serviceErasureFence.deleteMany({ where: { conversationId: { in: conversations } } });
  await db.serviceConversation.deleteMany({ where: { id: { in: conversations } } });
  await db.serviceAudit.deleteMany({ where: { resourceId: { in: owners } } });
  await db.supportCase.deleteMany({ where: { id: { in: owners } } });
  const orderIds = (await db.historyOrder.findMany({ where: { requestId: { in: owners } }, select: { id: true } })).map(order => order.id);
  await db.historyPayment.deleteMany({ where: { orderId: { in: orderIds } } });
  await db.historyRefund.deleteMany({ where: { orderId: { in: orderIds } } });
  await db.historyArtifactCleanup.deleteMany({ where: { artifactId: { in: artifactIds } } });
  await db.historyArtifact.deleteMany({ where: { id: { in: artifactIds } } });
  await db.historyPurchaseIntent.deleteMany({ where: { orderId: { in: orderIds } } });
  await db.historyOrder.deleteMany({ where: { id: { in: orderIds } } });
  await db.historyQuote.deleteMany({ where: { requestId: { in: owners } } });
  await db.vehicleHistoryRequest.deleteMany({ where: { id: { in: owners } } });
  await db.user.deleteMany({ where: { id: { in: users } } });
  await db.$disconnect(); s3.destroy();
 });
 async function fixture(purpose: "support" | "history", status: string, closedAt?: Date) {
  const customerId = randomUUID(), resourceId = randomUUID(), id = randomUUID(), attachmentId = randomUUID();
  users.push(customerId); owners.push(resourceId); conversations.push(id);
  await db.user.create({ data: { id: customerId } });
  if (purpose === "support") await db.supportCase.create({ data: { id: resourceId, customerId, status, closedAt: closedAt ?? null } });
  else await db.vehicleHistoryRequest.create({ data: { id: resourceId, customerId, status } });
  await db.serviceConversation.create({ data: { id, purpose, ...(purpose === "support" ? { supportCaseId: resourceId } : { historyRequestId: resourceId }), lastSequence: 1 } });
  const key = `service-private/${id}/${attachmentId}/synthetic-digest`; keys.push(key);
  await s3.send(new PutObjectCommand({ Bucket: "service-private", Key: key, Body: "synthetic bytes" }));
  await db.serviceAttachment.create({ data: { id: attachmentId, conversationId: id, uploaderId: customerId, lifecycleEpoch: 0, category: purpose === "support" ? "support_communication" : "history_communication", visibility: "customer", state: "adopted", stagingKey: `stage/${attachmentId}`, objectKey: key, contentType: "image/jpeg", expectedBytes: 15, sizeBytes: 15, sha256: "synthetic", filename: "synthetic.jpg", rights: { schedule: purpose === "support" ? { kind: "support_case" } : { kind: "until", until: "2001-01-01T00:00:00Z" }, hold: null }, expiresAt: new Date("2001-01-01T00:00:00Z") } });
  await db.serviceMessage.create({ data: { conversationId: id, sequence: 1, clientMessageId: randomUUID(), senderId: customerId, senderKind: "customer", visibility: "customer", body: "Synthetic private body", attachmentId, requestHash: "synthetic" } });
  return { id, customerId, resourceId, attachmentId, key };
 }
 it("rechecks reopened cases, isolates History and retries failed private-byte cleanup without reviving content", async () => {
  const closed = await fixture("support", "closed", new Date("2000-01-01T00:00:00Z"));
  const reopened = await fixture("support", "open", new Date("2000-01-01T00:00:00Z"));
  const history = await fixture("history", "completed");
  let failed = false;
  const flakyObjects = { deleteAndVerify: async (manifest: string[]) => { if (!failed && manifest.includes(closed.key)) { failed = true; throw new Error("Synthetic storage outage"); } await objects.deleteAndVerify(manifest); } };
  await expect(new ExpireServiceContent(db, flakyObjects).execute(now)).rejects.toThrow("Service private cleanup unavailable");
  expect((await db.serviceConversation.findUniqueOrThrow({ where: { id: closed.id } })).erasedAt).not.toBeNull();
  expect(await db.serviceMessage.count({ where: { conversationId: closed.id } })).toBe(0);
  expect((await db.serviceErasureFence.findUniqueOrThrow({ where: { conversationId: closed.id } })).cleanupCompletedAt).toBeNull();
  await new ExpireServiceContent(db, objects).execute(now);
  await expect(s3.send(new HeadObjectCommand({ Bucket: "service-private", Key: closed.key }))).rejects.toMatchObject({ $metadata: { httpStatusCode: 404 } });
  expect(await db.serviceMessage.count({ where: { conversationId: { in: [reopened.id, history.id] } } })).toBe(2);
  expect((await db.supportCase.findUniqueOrThrow({ where: { id: closed.resourceId } })).customerId).toBeNull();
 });
 /** Transparent scheduling boundary: the worker's own selection returns unchanged rows,
  * then pauses after it selected `caseId` and before any per-case transaction begins. */
 function pauseAfterSelecting(caseId: string) {
  let selected!: () => void, resume!: () => void;
  const reached = new Promise<void>(resolve => { selected = resolve; }), released = new Promise<void>(resolve => { resume = resolve; });
  const findMany = async (args: Prisma.SupportCaseFindManyArgs) => {
   const rows = await db.supportCase.findMany(args);
   if (rows.some(row => row.id === caseId)) { selected(); await released; }
   return rows;
  };
  const supportCase = new Proxy(db.supportCase, { get: (target, key) => key === "findMany" ? findMany : Reflect.get(target, key) });
  const gated = new Proxy(db, { get: (target, key) => { if (key === "supportCase") return supportCase; const value: unknown = Reflect.get(target, key); return typeof value === "function" ? value.bind(target) : value; } });
  return { db: gated, reached, resume };
 }
 async function within<T>(work: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try { return await Promise.race([work, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} exceeded ${ms} ms`)), ms); })]); } finally { clearTimeout(timer); }
 }
 async function waitBlockedOnSupportCase(holder: number) {
  const deadline = Date.now() + 10000;
  for (;;) {
   const [row] = await db.$queryRaw<{ waiting: number }[]>`SELECT count(*)::int AS waiting FROM pg_stat_activity WHERE ${holder}::int = ANY(pg_blocking_pids(pid)) AND query LIKE '%support_cases%FOR UPDATE%'`;
   if (row?.waiting) return;
   if (Date.now() > deadline) throw new Error("Worker never waited on the reopened Support case lock");
   await new Promise(resolve => setTimeout(resolve, 25));
  }
 }
 it("keeps a selected due Support case when a reopen commits before the worker obtains its row lock", async () => {
  const target = await fixture("support", "closed", new Date("2000-01-01T00:00:00Z"));
  const pause = pauseAfterSelecting(target.resourceId);
  let commit!: () => void;
  const commitGate = new Promise<void>(resolve => { commit = resolve; });
  let holderReady!: (pid: number) => void;
  const holder = new Promise<number>(resolve => { holderReady = resolve; });
  const running = new ExpireServiceContent(pause.db, objects).execute(now);
  running.catch(() => undefined);
  let reopen: Promise<void> | undefined;
  try {
   await within(pause.reached, 10000, "Worker selection of the due Support case");
   // Mirrors the API reopen: principal, Support case and conversation locks, then the open transition.
   reopen = db.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM users WHERE id=${target.customerId} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM support_cases WHERE id=${target.resourceId} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM service_conversations WHERE id=${target.id} FOR UPDATE`;
    await tx.supportCase.update({ where: { id: target.resourceId }, data: { status: "open", closedAt: null } });
    await tx.serviceAudit.create({ data: { actorId: target.customerId, purpose: "support", resourceId: target.resourceId, action: "SUPPORT_REOPEN", assignmentVersion: 0 } });
    const [{ pid }] = await tx.$queryRaw<[{ pid: number }]>`SELECT pg_backend_pid() AS pid`;
    holderReady(pid);
    await commitGate;
   }, { timeout: 20000 });
   reopen.catch(() => undefined);
   const pid = await within(holder, 10000, "Reopen lock acquisition");
   pause.resume();
   await waitBlockedOnSupportCase(pid);
   commit();
   await within(reopen, 10000, "Reopen commit");
   await within(running, 20000, "Worker completion after reopen");
  } finally {
   pause.resume(); commit();
   await Promise.allSettled([running, ...(reopen ? [reopen] : [])]);
  }
  expect(await db.supportCase.findUniqueOrThrow({ where: { id: target.resourceId } })).toMatchObject({ status: "open", closedAt: null, customerId: target.customerId, assignmentVersion: 0 });
  expect(await db.serviceConversation.findUniqueOrThrow({ where: { id: target.id } })).toMatchObject({ erasedAt: null, lifecycleEpoch: 0 });
  expect(await db.serviceMessage.count({ where: { conversationId: target.id } })).toBe(1);
  expect(await db.serviceAttachment.findUniqueOrThrow({ where: { id: target.attachmentId } })).toMatchObject({ state: "adopted", removedAt: null, uploaderId: target.customerId });
  expect(await db.serviceErasureFence.count({ where: { conversationId: target.id } })).toBe(0);
  expect(await db.serviceAudit.count({ where: { resourceId: target.resourceId, action: "SERVICE_CONTENT_PURGED" } })).toBe(0);
  await s3.send(new HeadObjectCommand({ Bucket: "service-private", Key: target.key }));
 }, 60000);
 it("lets completed account erasure win over a stale selected Support purge without resurrection or foreign loss", async () => {
  const target = await fixture("support", "closed", new Date("2000-01-01T00:00:00Z"));
  const foreignHistory = await fixture("history", "completed");
  const foreignSupport = await fixture("support", "open");
  await db.user.update({ where: { id: target.customerId }, data: { deletionScheduledAt: new Date("2000-01-01T00:00:00Z") } });
  const pause = pauseAfterSelecting(target.resourceId);
  const running = new ExpireServiceContent(pause.db, objects).execute(now);
  running.catch(() => undefined);
  try {
   await within(pause.reached, 10000, "Worker selection of the due Support case");
   await within(new PurgeExpiredAccounts(db).execute({ now }), 20000, "Account erasure");
   expect(await db.serviceConversation.findUniqueOrThrow({ where: { id: target.id } })).toMatchObject({ erasedAt: expect.any(Date), lifecycleEpoch: 1 });
   expect(await db.serviceErasureFence.findUniqueOrThrow({ where: { conversationId: target.id } })).toMatchObject({ epoch: 1, objectKeys: [target.key], cleanupCompletedAt: null });
   pause.resume();
   await within(running, 20000, "Stale worker completion after erasure");
  } finally {
   pause.resume();
   await Promise.allSettled([running]);
  }
  // The stale run's cleanup phase completed the erasure fence; a late sweep must not touch the target's storage again.
  expect(await db.serviceErasureFence.findUniqueOrThrow({ where: { conversationId: target.id } })).toMatchObject({ epoch: 1, objectKeys: [target.key], cleanupCompletedAt: now });
  await expect(s3.send(new HeadObjectCommand({ Bucket: "service-private", Key: target.key }))).rejects.toMatchObject({ $metadata: { httpStatusCode: 404 } });
  let targetRequests = 0;
  const counted = { deleteAndVerify: async (manifest: string[]) => { if (manifest.includes(target.key)) targetRequests++; await objects.deleteAndVerify(manifest); } };
  await new ExpireServiceContent(db, counted).execute(now);
  expect(targetRequests).toBe(0);
  expect(await db.serviceConversation.findUniqueOrThrow({ where: { id: target.id } })).toMatchObject({ erasedAt: expect.any(Date), lifecycleEpoch: 1 });
  expect(await db.serviceErasureFence.findUniqueOrThrow({ where: { conversationId: target.id } })).toMatchObject({ epoch: 1, objectKeys: [target.key], cleanupCompletedAt: now });
  expect(await db.supportCase.findUniqueOrThrow({ where: { id: target.resourceId } })).toMatchObject({ status: "closed", customerId: null, assignmentVersion: 0 });
  expect(await db.serviceAudit.count({ where: { resourceId: target.resourceId, action: "SERVICE_CONTENT_PURGED" } })).toBe(0);
  expect(await db.serviceMessage.count({ where: { conversationId: target.id } })).toBe(0);
  expect(await db.serviceAttachment.findUniqueOrThrow({ where: { id: target.attachmentId } })).toMatchObject({ state: "removed", uploaderId: null });
  await expect(s3.send(new HeadObjectCommand({ Bucket: "service-private", Key: target.key }))).rejects.toMatchObject({ $metadata: { httpStatusCode: 404 } });
  for (const foreign of [foreignHistory, foreignSupport]) {
   expect(await db.serviceConversation.findUniqueOrThrow({ where: { id: foreign.id } })).toMatchObject({ erasedAt: null, lifecycleEpoch: 0 });
   expect(await db.serviceMessage.count({ where: { conversationId: foreign.id } })).toBe(1);
   expect(await db.serviceErasureFence.count({ where: { conversationId: foreign.id } })).toBe(0);
   await s3.send(new HeadObjectCommand({ Bucket: "service-private", Key: foreign.key }));
  }
  expect((await db.vehicleHistoryRequest.findUniqueOrThrow({ where: { id: foreignHistory.resourceId } })).customerId).toBe(foreignHistory.customerId);
  expect((await db.supportCase.findUniqueOrThrow({ where: { id: foreignSupport.resourceId } })).customerId).toBe(foreignSupport.customerId);
 }, 60000);
 it("expires unpaid holds, escalates missed promises once and erases only due unheld payment claims", async () => {
  const fixtureRow = await fixture("history", "enquiry");
  const day = "2000-06-01";
  await db.historyCapacityDay.upsert({ where: { day }, create: { day, slotLimit: 2, morningLimit: 1, evidence: "Synthetic one-slot measurement" }, update: {} });
  const quote = await db.historyQuote.create({ data: { requestId: fixtureRow.resourceId, vin: "1HGCM82633A004352", providers: ["carfax"], preflightOutcome: "available", preflightEvidence: "Synthetic licensed preflight", refundRule: "Founder decision", windowStart: new Date("2000-06-01T04:00:00Z"), windowEnd: new Date("2000-06-01T05:00:00Z"), feasible: true, acceptedAt: new Date("2000-06-01T03:00:00Z") } });
  const order = await db.historyOrder.create({ data: { requestId: fixtureRow.resourceId, quoteId: quote.id, day, morning: false, holdExpiresAt: new Date("2000-06-01T05:00:00Z"), promiseAt: new Date("2000-06-01T05:00:00Z"), rights: { category: "payment_evidence", schedule: { kind: "until", until: "2000-05-31T00:00:00Z" }, hold: { until: "2000-06-02T00:00:00Z" } } } });
  const payment = await db.historyPayment.create({ data: { orderId: order.id, clientPaymentId: randomUUID(), claim: "Synthetic held receipt" } });
  const advance = new AdvanceHistoryOrders(db);
  await advance.execute(now);
  expect((await db.historyOrder.findUniqueOrThrow({ where: { id: order.id } })).state).toBe("expired");
  expect((await db.historyPayment.findUniqueOrThrow({ where: { id: payment.id } })).claim).toBe("Synthetic held receipt");
  await db.historyOrder.update({ where: { id: order.id }, data: { state: "paid", paidAt: new Date("2000-06-01T04:00:00Z"), receivedAt: new Date("2000-06-01T04:00:00Z") } });
  await advance.execute(now); await advance.execute(now);
  expect(await db.serviceAudit.count({ where: { resourceId: fixtureRow.resourceId, action: "HISTORY_PROMISE_MISSED" } })).toBe(1);
  await db.historyOrder.update({ where: { id: order.id }, data: { recoveryUsed: true, recoveryAgreedAt: now, recoveryDeadline: new Date("2000-06-01T12:30:00Z"), state: "recovery" } });
  await advance.execute(new Date("2000-06-03T12:00:00Z"));
  expect((await db.historyOrder.findUniqueOrThrow({ where: { id: order.id } })).state).toBe("refund_pending");
  expect((await db.historyRefund.findUniqueOrThrow({ where: { orderId: order.id } })).state).toBe("pending");
  expect((await db.historyPayment.findUniqueOrThrow({ where: { id: payment.id } })).claim).toBeNull();
 });
 it("rejects a mileage value with a missing unit instead of accepting SQL UNKNOWN", async () => {
  const id = randomUUID(), sha256 = "b".repeat(64); artifactIds.push(id);
  await expect(db.historyArtifact.create({ data: { id, provider: "carfax", vin: "1HGCM82633A004352", originalDate: now, objectKey: `history-artifacts/${id}/${sha256}`, sha256, sizeBytes: 10, expectedPages: 1, mileageValue: 64000, mileageUnit: null, mileageObservedAt: now, rights: {} } })).rejects.toThrow("history_artifact_source_facts_bounded");
  expect(await db.historyArtifact.count({ where: { id } })).toBe(0);
 });
 it("restricts due originals before deletion, honors a specific hold and retries exact bytes without revival", async () => {
  const create = async (held: boolean) => {
   const id = randomUUID(), sha256 = "a".repeat(64), key = `history-artifacts/${id}/${sha256}`;
   artifactIds.push(id); keys.push(key);
   await s3.send(new PutObjectCommand({ Bucket: "service-private", Key: key, Body: "synthetic original PDF" }));
   await db.historyArtifact.create({ data: { id, provider: "carfax", vin: "1HGCM82633A004352", originalDate: new Date("1999-01-01T00:00:00Z"), objectKey: key, sha256, sizeBytes: 22, expectedPages: 1, provenance: "Synthetic source license", state: "verified", verifiedPages: 1, verifiedAt: now, rights: { category: "provider_artifact", identifiability: "anonymous", use: ["service", "archive"], schedule: { kind: "until", until: "2000-05-31T00:00:00Z" }, hold: held ? { until: "2000-06-02T00:00:00Z" } : null } } });
   return { id, key };
  };
  const due = await create(false), held = await create(true);
  await new AdvanceHistoryOrders(db).execute(now);
  expect((await db.historyArtifact.findUniqueOrThrow({ where: { id: due.id } })).state).toBe("restricted");
  expect((await db.historyArtifact.findUniqueOrThrow({ where: { id: held.id } })).state).toBe("verified");
  expect(await db.historyArtifactCleanup.count({ where: { artifactId: held.id } })).toBe(0);
  let failed = false;
  const flaky = { deleteAndVerify: async (manifest: string[]) => { if (!failed && manifest.includes(due.key)) { failed = true; throw new Error("Synthetic original storage outage"); } await objects.deleteAndVerify(manifest); } };
  await expect(new ExpireServiceContent(db, flaky).execute(now)).rejects.toThrow("Synthetic original storage outage");
  expect((await db.historyArtifact.findUniqueOrThrow({ where: { id: due.id } })).state).toBe("restricted");
  expect((await db.historyArtifactCleanup.findUniqueOrThrow({ where: { artifactId: due.id } })).completedAt).toBeNull();
  await new ExpireServiceContent(db, objects).execute(now);
  expect((await db.historyArtifact.findUniqueOrThrow({ where: { id: due.id } })).state).toBe("removed");
  expect((await db.historyArtifactCleanup.findUniqueOrThrow({ where: { artifactId: due.id } })).completedAt).not.toBeNull();
  await expect(s3.send(new HeadObjectCommand({ Bucket: "service-private", Key: due.key }))).rejects.toMatchObject({ $metadata: { httpStatusCode: 404 } });
  await s3.send(new HeadObjectCommand({ Bucket: "service-private", Key: held.key }));
  const later = new Date("2000-06-03T12:00:00Z"); await new AdvanceHistoryOrders(db).execute(later); await new ExpireServiceContent(db, objects).execute(later);
  expect((await db.historyArtifact.findUniqueOrThrow({ where: { id: held.id } })).state).toBe("removed");
  await expect(s3.send(new HeadObjectCommand({ Bucket: "service-private", Key: held.key }))).rejects.toMatchObject({ $metadata: { httpStatusCode: 404 } });
 });
 it("fences private service content with completed account deletion and keeps restoration unable to resurrect it", async () => {
  const support = await fixture("support", "open");
  const history = await fixture("history", "enquiry");
  // Move this History request to the same purchaser to prove category-independent personal erasure.
  await db.vehicleHistoryRequest.update({ where: { id: history.resourceId }, data: { customerId: support.customerId } });
  await db.user.update({ where: { id: support.customerId }, data: { deletionScheduledAt: new Date("2000-01-01T00:00:00Z") } });
  await new PurgeExpiredAccounts(db).execute({ now });
  expect(await db.serviceMessage.count({ where: { conversationId: { in: [support.id, history.id] } } })).toBe(0);
  expect(await db.serviceErasureFence.count({ where: { conversationId: { in: [support.id, history.id] } } })).toBe(2);
  expect((await db.supportCase.findUniqueOrThrow({ where: { id: support.resourceId } })).customerId).toBeNull();
  expect((await db.vehicleHistoryRequest.findUniqueOrThrow({ where: { id: history.resourceId } })).customerId).toBeNull();
  await db.user.update({ where: { id: support.customerId }, data: { deletionScheduledAt: null, displayName: "Restored synthetic identity" } });
  await new ExpireServiceContent(db, objects).execute(now);
  for (const key of [support.key, history.key]) await expect(s3.send(new HeadObjectCommand({ Bucket: "service-private", Key: key }))).rejects.toMatchObject({ $metadata: { httpStatusCode: 404 } });
 });
});
