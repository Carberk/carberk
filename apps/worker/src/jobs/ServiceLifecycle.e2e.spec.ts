import { randomUUID } from "node:crypto";

import { CreateBucketCommand, PutObjectCommand, HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { PrismaService } from "@auto-tm/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

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
 const users: string[] = [], conversations: string[] = [], owners: string[] = [], keys: string[] = [];
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
