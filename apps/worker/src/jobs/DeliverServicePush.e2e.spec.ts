import { randomUUID } from "node:crypto";

import { PrismaService } from "@auto-tm/db";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { TestPushTransport } from "../push/adapters/TestPushTransport";
import { PUSH_RESULT_REASON } from "../push/domain/types";

import { DeliverServicePush } from "./DeliverServicePush";

const hosted = process.env["GITHUB_ACTIONS"] === "true" && !!process.env["DATABASE_URL"];
describe.skipIf(!hosted)("service push with current PostgreSQL authority and test transport", () => {
 const db = new PrismaService(), push = new TestPushTransport();
 let customer: string, operator: string, next: string, resource: string, conversation: string;
 const now = new Date(), later = new Date(now.getTime() + 3600000);
 const sessions: string[] = [], devices: string[] = [];
 function required(values: string[], index: number): string { const value = values[index]; if (!value) throw new Error("Missing synthetic fixture"); return value; }
 beforeAll(async () => { await db.$connect(); });
 afterAll(async () => { await db.$disconnect(); });
 beforeEach(async () => {
  customer=randomUUID(); operator=randomUUID(); next=randomUUID(); resource=randomUUID(); conversation=randomUUID();
  sessions.length=0; devices.length=0; push.clear(); push.setDefaultResult({ ok: true });
  for (const userId of [customer, operator, next]) {
   await db.user.create({ data: { id: userId, locale: "ru" } });
   const session = await db.session.create({ data: { userId, refreshTokenHash: randomUUID(), expiresAt: later, adminTotpExpiresAt: later } }); sessions.push(session.id);
   const device = await db.fcmDevice.create({ data: { userId, token: `synthetic-${randomUUID()}`, platform: "android" } }); devices.push(device.id);
  }
  await db.staffGrant.createMany({ data: [operator, next].map(userId => ({ userId, capability: "support.operations" })) });
  await db.supportCase.create({ data: { id: resource, customerId: customer, assigneeId: operator } });
  await db.serviceConversation.create({ data: { id: conversation, purpose: "support", supportCaseId: resource } });
  for (let n = 0; n < sessions.length; n++) await db.servicePushSubscription.create({ data: { sessionId: required(sessions, n), deviceId: required(devices, n), conversationId: conversation, lifecycleEpoch: 0, createdAt: new Date(now.getTime() - 10000) } });
 });
 afterEach(async () => {
  await db.servicePushSubscription.deleteMany({ where: { conversationId: conversation } });
  await db.serviceOutbox.deleteMany({ where: { conversationId: conversation } });
  await db.serviceConversation.deleteMany({ where: { id: conversation } });
  await db.supportCase.deleteMany({ where: { id: resource } });
  await db.user.deleteMany({ where: { id: { in: [customer, operator, next] } } });
 });
 const delivery = () => new DeliverServicePush(db, push, { enabled: () => true, allowed: id => ([customer, operator, next] as string[]).includes(id) });
 async function event(sequence: number, visibility = "customer") { return db.serviceOutbox.create({ data: { conversationId: conversation, sequence, eventType: "message", visibility, lifecycleEpoch: 0, createdAt: now, nextAttemptAt: now } }); }
 it("delivers generic invalidations only to current assignment and excludes private notes from the customer", async () => {
  await event(1, "staff"); await delivery().execute(now);
  expect(push.deliveries).toHaveLength(1); expect(push.deliveries[0]?.payload.deviceToken).toBe((await db.fcmDevice.findUniqueOrThrow({ where: { id: required(devices, 1) } })).token);
  expect(push.deliveries[0]?.payload.data).toEqual(expect.objectContaining({ kind: "service_update", conversationId: conversation }));
  expect(JSON.stringify(push.deliveries)).not.toContain("private note contents"); push.clear();
  await db.supportCase.update({ where: { id: resource }, data: { assigneeId: next, assignmentVersion: 1 } });
  await event(2); await delivery().execute(now);
  expect(push.deliveries).toHaveLength(2); expect(push.deliveries.map(row => row.payload.deviceToken)).not.toContain((await db.fcmDevice.findUniqueOrThrow({ where: { id: required(devices, 1) } })).token); push.clear();
 });
 it("rechecks revoked grants, expired sessions, wrong device ownership and erasure epoch at delivery", async () => {
  await db.supportCase.update({ where: { id: resource }, data: { assigneeId: next, assignmentVersion: 1 } });
  await db.staffGrant.update({ where: { userId_capability: { userId: next, capability: "support.operations" } }, data: { revokedAt: now } });
  await db.session.update({ where: { id: required(sessions, 0) }, data: { expiresAt: now } });
  await event(3); await delivery().execute(now); expect(push.deliveries).toHaveLength(0);
  await db.session.update({ where: { id: required(sessions, 0) }, data: { expiresAt: later } });
  await db.fcmDevice.update({ where: { id: required(devices, 0) }, data: { userId: next } });
  await event(4); await delivery().execute(now); expect(push.deliveries).toHaveLength(0);
  await db.fcmDevice.update({ where: { id: required(devices, 0) }, data: { userId: customer } });
  await event(5); await db.serviceConversation.update({ where: { id: conversation }, data: { lifecycleEpoch: 1, erasedAt: now } });
  await delivery().execute(now); expect(push.deliveries).toHaveLength(0);
 });
 it("keeps retryable work durable and invalidates a bad device token", async () => {
  const work = await event(6); push.setDefaultResult({ ok: false, reason: PUSH_RESULT_REASON.Retryable });
  await delivery().execute(now); expect((await db.serviceOutbox.findUniqueOrThrow({ where: { id: work.id } })).deliveredAt).toBeNull();
  push.setDefaultResult({ ok: false, reason: PUSH_RESULT_REASON.InvalidToken });
  await delivery().execute(new Date(now.getTime() + 60000)); expect((await db.fcmDevice.findUniqueOrThrow({ where: { id: required(devices, 0) } })).invalidatedAt).not.toBeNull();
  expect((await db.serviceOutbox.findUniqueOrThrow({ where: { id: work.id } })).deliveredAt).not.toBeNull();
 });
});
