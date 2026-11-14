import { randomUUID } from "node:crypto";
import { Test, type TestingModule } from "@nestjs/testing";
import { PrismaService } from "@auto-tm/db";
import { ServiceMessagesSchemas } from "@auto-tm/contracts";
import { afterAll, beforeAll, expect, it } from "vitest";
import { BusinessMessagingModule } from "./business-messaging.module";
import { BUSINESS_MESSAGING_PORT, ServiceMessageError, type BusinessMessagingPort } from "./business-messaging.public";

let module: TestingModule, prisma: PrismaService, messages: BusinessMessagingPort;
const senders = [randomUUID(), randomUUID()], objects = [randomUUID(), randomUUID()];
const scope = { purpose: "vehicle_history" as const, objectId: objects[0]! };
const intent = { ...scope, senderId: senders[0]!, clientMessageId: randomUUID(), text: "  Salam\nDünýä  " };

beforeAll(async () => {
  module = await Test.createTestingModule({ imports: [BusinessMessagingModule] }).compile();
  prisma = module.get(PrismaService);
  messages = module.get(BUSINESS_MESSAGING_PORT);
  await prisma.user.createMany({ data: senders.map((id) => ({ id })) });
  // Fault injection at the DB boundary pauses an inserted message before commit.
  await prisma.$executeRawUnsafe(`CREATE FUNCTION vh1226_gate() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF NEW.text IN (E'  Salam\\nDünýä  ', 'held first') THEN
      PERFORM pg_advisory_xact_lock(1226); END IF; RETURN NEW; END $$`);
  await prisma.$executeRawUnsafe(`CREATE TRIGGER vh1226_gate AFTER INSERT ON service_messages
    FOR EACH ROW EXECUTE FUNCTION vh1226_gate()`);
});
afterAll(async () => {
  if (!prisma) return;
  try {
    await prisma.$executeRawUnsafe("DROP TRIGGER IF EXISTS vh1226_gate ON service_messages");
    await prisma.$executeRawUnsafe("DROP FUNCTION IF EXISTS vh1226_gate()");
    const conversations = await prisma.serviceConversation.findMany({ where: { objectId: { in: objects } }, select: { id: true } });
    const receiptScope = { conversationId: { in: conversations.map((row) => row.id) } };
    await prisma.serviceMessageOffer.deleteMany({ where: receiptScope });
    await prisma.serviceReceipt.deleteMany({ where: receiptScope });
    await prisma.serviceMessage.deleteMany({ where: { senderId: { in: senders } } });
    await prisma.serviceConversation.deleteMany({ where: { purpose: scope.purpose, objectId: { in: objects } } });
    await prisma.user.deleteMany({ where: { id: { in: senders } } });
  } finally { await module.close(); }
});

async function waitForLocks(count: number) {
  for (let attempt = 0; attempt < 200; attempt++) {
    const [row] = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT count(*) FROM pg_stat_activity
      WHERE datname = current_database() AND wait_event_type = 'Lock'`;
    if (Number(row?.count) >= count) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Expected ${count} actual database lock waiters`);
}

async function gated(work: (release: () => void) => Promise<void>) {
  let release!: () => void, locked!: () => void;
  const ready = new Promise<void>((resolve) => { locked = resolve; });
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const holder = prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(1226)::text`;
    locked();
    await gate;
  }, { timeout: 15_000 });
  try { await ready; await work(release); }
  finally { release(); await holder; }
}

it("concurrent identical intents and a lost-result retry return one original across sessions", async () => {
  await gated(async (release) => {
    const first = messages.sendText(intent);
    await waitForLocks(1);
    const retry = messages.sendText(intent);
    await waitForLocks(2);
    expect(await messages.readMessages(scope)).toEqual({ items: [], nextCursor: null });
    release();
    const [original, duplicate] = await Promise.all([first, retry]);
    expect(duplicate).toEqual(original);
    // No Session input: genuine same-User reauthentication keeps this same intent.
    expect(await messages.sendText(intent)).toEqual(original);
    expect(original).toMatchObject({ ...intent, kind: "TEXT", order: "1" });
    expect(ServiceMessagesSchemas.ServiceMessageSchema.parse(original)).toEqual(original);
    expect(await messages.readMessages(scope)).toEqual({ items: [original], nextCursor: null });
  });
});

it("conflicts on any changed original characters and scopes sender/object intents independently", async () => {
  for (const text of ["Salam\nDünýä", "  Salam\r\nDünýä  "]) {
    await expect(messages.sendText({ ...intent, text })).rejects.toMatchObject({ code: "SERVICE_MESSAGE_INTENT_CONFLICT" });
  }
  const otherSender = await messages.sendText({ ...intent, senderId: senders[1]!, text: "other sender" });
  const otherObject = await messages.sendText({ ...intent, objectId: objects[1]!, text: "foreign private text" });
  expect(otherSender.order).toBe("2");
  expect(otherObject.order).toBe("1");
  expect(otherSender.id).not.toBe(otherObject.id);
  const result = await messages.readMessages(scope);
  expect(result.items.map((item) => item.text)).toEqual(["  Salam\nDünýä  ", "other sender"]);
});

it("serializes actual commits and keeps bounded pages complete across intervening commits", async () => {
  const cursor = (await messages.readMessages(scope)).items[1]!.id;
  await gated(async (release) => {
    const first = messages.sendText({ ...intent, clientMessageId: randomUUID(), text: "held first" });
    await waitForLocks(1);
    const second = messages.sendText({ ...intent, clientMessageId: randomUUID(), text: "second writer" });
    await waitForLocks(2);
    // The second writer must not commit ahead of the paused first insert.
    expect(await messages.readMessages({ ...scope, cursor })).toEqual({ items: [], nextCursor: null });
    release();
    const [a, b] = await Promise.all([first, second]);
    expect([a.order, b.order]).toEqual(["3", "4"]);
    const page = await messages.readMessages({ ...scope, cursor, limit: 1 });
    expect(page).toEqual({ items: [a], nextCursor: a.id });
    const c = await messages.sendText({ ...intent, clientMessageId: randomUUID(), text: "intervening commit" });
    expect(c.order).toBe("5");
    const next = await messages.readMessages({ ...scope, cursor: page.nextCursor!, limit: 1 });
    expect(next).toEqual({ items: [b], nextCursor: b.id });
    expect(await messages.readMessages({ ...scope, cursor: next.nextCursor!, limit: 1 }))
      .toEqual({ items: [c], nextCursor: null });
  });
});

it("refuses foreign, missing and forged cursors without foreign communication facts", async () => {
  const foreign = (await messages.readMessages({ ...scope, objectId: objects[1]! })).items[0]!;
  for (const cursor of [foreign.id, randomUUID()]) {
    await expect(messages.readMessages({ ...scope, cursor })).rejects.toEqual(new ServiceMessageError("SERVICE_MESSAGE_INVALID_CURSOR"));
    await expect(messages.readMessages({ ...scope, objectId: randomUUID(), cursor }))
      .rejects.toEqual(new ServiceMessageError("SERVICE_MESSAGE_INVALID_CURSOR"));
  }
  await expect(messages.readMessages({ ...scope, cursor: "forged" }))
    .rejects.toEqual(new ServiceMessageError("SERVICE_MESSAGE_INVALID_INPUT"));
  expect(await messages.readMessages({ ...scope, objectId: randomUUID() })).toEqual({ items: [], nextCursor: null });
});

it("validates inputs at the exported operation boundary", async () => {
  for (const text of ["", " \n\t", "a".repeat(4001)]) {
    await expect(messages.sendText({ ...intent, text })).rejects.toEqual(new ServiceMessageError("SERVICE_MESSAGE_INVALID_INPUT"));
  }
  await expect(messages.readMessages({ ...scope, limit: 51 })).rejects.toEqual(new ServiceMessageError("SERVICE_MESSAGE_INVALID_INPUT"));
  expect((await messages.readMessages({ ...scope, limit: 1 })).items).toHaveLength(1);
});

it("returns bounded persistence errors and rolls back a refused append", async () => {
  await expect(messages.sendText({ ...intent, senderId: randomUUID(), text: "unavailable author" }))
    .rejects.toEqual(new ServiceMessageError("SERVICE_MESSAGE_UNAVAILABLE"));
  expect((await messages.readMessages(scope)).items.map((item) => item.order)).toEqual(["1", "2", "3", "4", "5"]);
});

it("bounds full default pages at fifty communication facts", async () => {
  const stream = { ...scope, objectId: objects[1]! };
  for (let index = 0; index < 50; index++) {
    await messages.sendText({ ...intent, ...stream, clientMessageId: randomUUID(), text: "bounded page" });
  }
  const first = await messages.readMessages(stream);
  expect(first.items).toHaveLength(50);
  expect(first.items[49]!.order).toBe("50");
  expect(first.nextCursor).toBe(first.items[49]!.id);
  const last = await messages.readMessages({ ...stream, cursor: first.nextCursor! });
  expect(last.items.map((item) => item.order)).toEqual(["51"]);
  expect(last.nextCursor).toBeNull();
});

it("retains participant receipts across a messaging module restart without inventing another participant's Read", async () => {
  const session = await prisma.session.create({ data: { userId: senders[1]!, refreshTokenHash: randomUUID(), expiresAt: new Date(Date.now() + 600_000) } });
  const participant = { participantId: senders[1]!, sessionId: session.id, assignmentVersion: 1 };
  const page = await messages.readMessages({ ...scope, participant });
  const cursor = page.items.at(-1)!.id;
  expect(await messages.readReceipts(scope)).toEqual({ items: [] });
  await expect(messages.acknowledge({ ...scope, participant, cursor, kind: "read" })).rejects.toMatchObject({ code: "SERVICE_MESSAGE_INVALID_CURSOR" });
  await messages.acknowledge({ ...scope, participant, cursor, kind: "received" });
  await messages.acknowledge({ ...scope, participant, cursor, kind: "read" });
  await module.close();
  module = await Test.createTestingModule({ imports: [BusinessMessagingModule] }).compile();
  prisma = module.get(PrismaService); messages = module.get(BUSINESS_MESSAGING_PORT);
  expect(await messages.readMessages(scope)).toEqual(page);
  expect(await messages.readReceipts(scope)).toEqual({ items: [
    { participantId: senders[1], assignmentVersion: 1, receivedOrder: "5", readOrder: "5" },
  ] });
  await expect(messages.acknowledge({ ...scope, participant: { ...participant, assignmentVersion: 2 }, cursor, kind: "received" }))
    .rejects.toMatchObject({ code: "SERVICE_MESSAGE_INVALID_CURSOR" });
});
