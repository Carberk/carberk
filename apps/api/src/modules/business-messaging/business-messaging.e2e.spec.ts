import { randomUUID } from "node:crypto";
import { Test, type TestingModule } from "@nestjs/testing";
import { PrismaService } from "@auto-tm/db";
import { ServiceMessagesSchemas } from "@auto-tm/contracts";
import { afterAll, beforeAll, expect, it } from "vitest";
import { BusinessMessagingModule } from "./business-messaging.module";
import { BUSINESS_MESSAGING_PORT, ServiceMessageError, type BusinessMessagingPort } from "./business-messaging.public";

let module: TestingModule, prisma: PrismaService, messages: BusinessMessagingPort;
const senders = Array.from({ length: 8 }, () => randomUUID()), objects = [randomUUID(), randomUUID()];
const scope = { purpose: "vehicle_history" as const, objectId: objects[0]! };
const intent = { ...scope, senderId: senders[0]!, clientMessageId: randomUUID(), text: "  Salam\nDünýä  " };

beforeAll(async () => {
  module = await Test.createTestingModule({ imports: [BusinessMessagingModule] }).compile();
  prisma = module.get(PrismaService);
  messages = module.get(BUSINESS_MESSAGING_PORT);
  await prisma.user.createMany({ data: senders.map((id) => ({ id })) });
  // Fault injection at the DB boundary pauses an inserted message before commit.
  await prisma.$executeRawUnsafe(`CREATE FUNCTION vh1226_gate() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF NEW.text IN (E'  Salam\\nDünýä  ', 'held first', E'  Once\\nDünýä  ', 'once rollback') THEN
      PERFORM pg_advisory_xact_lock(1226); END IF;
      IF NEW.text = 'once rollback' THEN RAISE EXCEPTION 'owned rollback'; END IF; RETURN NEW; END $$`);
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


it.each(["same", "different"])("recovers eight overlapping senders with %s client keys as one original", async (attempts) => {
  const objectId = randomUUID(), operationKey = randomUUID();
  objects.push(objectId);
  const input = { ...intent, objectId, operationKey, text: "  Once\nDünýä  " };
  await gated(async (release) => {
    const first = messages.sendOnceText(input);
    await waitForLocks(1);
    const pending = senders.slice(1).map((senderId) => messages.sendOnceText({
      ...input, senderId, clientMessageId: attempts === "same" ? input.clientMessageId : randomUUID(),
    }));
    await waitForLocks(8);
    expect(await messages.readMessages({ ...scope, objectId })).toEqual({ items: [], nextCursor: null });
    release();
    const [original, ...retries] = await Promise.all([first, ...pending]);
    expect(retries).toEqual(senders.slice(1).map(() => original));
    expect(original).toMatchObject({ senderId: intent.senderId, clientMessageId: intent.clientMessageId,
      text: "  Once\nDünýä  ", order: "1" });
    expect(await messages.findTextOperation({ ...scope, objectId, operationKey })).toEqual(original);
    expect(await messages.readMessages({ ...scope, objectId })).toEqual({ items: [original], nextCursor: null });
    expect(ServiceMessagesSchemas.ServiceMessageSchema.parse(original)).toEqual(original);
    expect(original).not.toHaveProperty("operationKey");
    expect(await messages.findTextOperation({ ...scope, objectId: objectId.toUpperCase(), operationKey: operationKey.toUpperCase() }))
      .toEqual(original);
  });
});

it("rolls back a refused caller confirmation and preserves the original on a refused retry", async () => {
  const objectId = randomUUID(); objects.push(objectId);
  const input = { ...intent, objectId, operationKey: randomUUID(), text: "commit-confirmed notice" };
  const operation = { ...scope, objectId, operationKey: input.operationKey };
  expect(await messages.findTextOperation(operation)).toBeNull();
  const refusal = new Error("caller authority expired");
  const refuse = async () => { throw refusal; };
  await expect(messages.sendOnceText(input, refuse)).rejects.toBe(refusal);
  expect(await messages.findTextOperation(operation)).toBeNull();
  expect(await messages.readMessages({ ...scope, objectId })).toEqual({ items: [], nextCursor: null });
  const original = await messages.sendOnceText(input, async () => {});
  expect(original.order).toBe("1");
  await expect(messages.sendOnceText({ ...input, senderId: senders[1]!, clientMessageId: randomUUID() }, refuse)).rejects.toBe(refusal);
  expect(await messages.findTextOperation(operation)).toEqual(original);
  expect(await messages.readMessages({ ...scope, objectId })).toEqual({ items: [original], nextCursor: null });
  expect(await messages.readReceipts({ ...scope, objectId })).toEqual({ items: [] });
});

it("keeps concurrent different operation keys independent within one stream", async () => {
  const objectId = randomUUID(); objects.push(objectId);
  const inputs = senders.map((senderId) => ({ ...intent, objectId, senderId,
    operationKey: randomUUID(), clientMessageId: randomUUID(), text: "independent operations" }));
  const results = await Promise.all(inputs.map((input) => messages.sendOnceText(input)));
  expect(new Set(results.map((message) => message.id)).size).toBe(8);
  const page = await messages.readMessages({ ...scope, objectId });
  expect(page.items.map((message) => message.order)).toEqual(["1", "2", "3", "4", "5", "6", "7", "8"]);
  for (const [index, input] of inputs.entries()) {
    expect(await messages.findTextOperation({ ...scope, objectId, operationKey: input.operationKey })).toEqual(results[index]);
  }
  expect(await messages.readReceipts({ ...scope, objectId })).toEqual({ items: [] });
});

it("refuses changed exact text and adoption of ordinary or differently keyed intents", async () => {
  const objectId = randomUUID(), operationKey = randomUUID();
  objects.push(objectId);
  const input = { ...intent, objectId, operationKey };
  const original = await messages.sendOnceText(input);
  for (const text of ["Salam\nDünýä", "  Salam\r\nDünýä  "]) {
    await expect(messages.sendOnceText({ ...input, senderId: senders[1]!, clientMessageId: randomUUID(), text }))
      .rejects.toMatchObject({ code: "SERVICE_MESSAGE_INTENT_CONFLICT" });
  }
  const ordinary = await messages.sendText({ ...intent, objectId, clientMessageId: randomUUID() });
  const adopt = { ...intent, objectId, clientMessageId: ordinary.clientMessageId, operationKey: randomUUID() };
  await expect(messages.sendOnceText(adopt)).rejects.toMatchObject({ code: "SERVICE_MESSAGE_INTENT_CONFLICT" });
  await expect(messages.sendOnceText({ ...input, operationKey: randomUUID() }))
    .rejects.toMatchObject({ code: "SERVICE_MESSAGE_INTENT_CONFLICT" });
  expect(await messages.findTextOperation({ ...scope, objectId, operationKey: adopt.operationKey })).toBeNull();
  expect(await messages.sendText({ ...intent, objectId, clientMessageId: ordinary.clientMessageId })).toEqual(ordinary);
  const otherKey = await messages.sendOnceText({ ...input, operationKey: randomUUID(), clientMessageId: randomUUID() });
  const otherObject = randomUUID(); objects.push(otherObject);
  const otherStream = await messages.sendOnceText({ ...input, objectId: otherObject });
  expect([original.order, ordinary.order, otherKey.order, otherStream.order]).toEqual(["1", "2", "3", "1"]);
  expect(new Set([original.id, otherKey.id, otherStream.id]).size).toBe(3);
  const page = await messages.readMessages({ ...scope, objectId, limit: 1 });
  expect(page).toEqual({ items: [original], nextCursor: original.id });
  expect(await messages.readMessages({ ...scope, objectId, cursor: original.id, limit: 1 }))
    .toEqual({ items: [ordinary], nextCursor: ordinary.id });
});

it.each([
  [false, false], [false, true], [true, false], [true, true],
])("settles an in-flight append before lookup (existing stream %s, rollback %s)", async (existing, rollback) => {
  const objectId = randomUUID(), operationKey = randomUUID();
  objects.push(objectId);
  const stream = { ...scope, objectId };
  if (existing) await messages.sendText({ ...intent, objectId, text: "before operation" });
  const input = { ...intent, objectId, operationKey, clientMessageId: randomUUID(), text: rollback ? "once rollback" : "held first" };
  await gated(async (release) => {
    const append = messages.sendOnceText(input);
    const outcome = append.then((message) => ({ message }), (error: unknown) => ({ error }));
    await waitForLocks(1);
    let settled = false;
    const lookup = messages.findTextOperation({ ...stream, operationKey }).then((value) => { settled = true; return value; });
    await waitForLocks(2);
    expect(settled).toBe(false);
    // Nonparticipant transcript reads must remain nonblocking during this wait.
    expect((await messages.readMessages(stream)).items.map((item) => item.text)).toEqual(existing ? ["before operation"] : []);
    release();
    const [result, found] = await Promise.all([outcome, lookup]);
    if (rollback) {
      expect(result).toMatchObject({ error: { code: "SERVICE_MESSAGE_UNAVAILABLE" } });
      expect(found).toBeNull();
    } else {
      expect(result).toEqual({ message: found });
      expect(found?.order).toBe(existing ? "2" : "1");
    }
    if (rollback) {
      const retry = await messages.sendOnceText({ ...input, text: "after rollback" });
      expect(retry.order).toBe(existing ? "2" : "1");
    }
  });
});

it.each([false, true])("settles first-stream creation before absence (rollback %s)", async (rollback) => {
  const objectId = randomUUID(), operationKey = randomUUID();
  objects.push(objectId);
  let created!: () => void, release!: () => void;
  const ready = new Promise<void>((resolve) => { created = resolve; });
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const creator = prisma.$transaction(async (tx) => {
    await tx.serviceConversation.create({ data: { ...scope, objectId } });
    created(); await gate;
    if (rollback) throw new Error("owned creation rollback");
  }, { timeout: 15_000 });
  const outcome = rollback ? expect(creator).rejects.toThrow("owned creation rollback") : creator;
  try {
    await ready;
    let settled = false;
    const lookup = messages.findTextOperation({ ...scope, objectId, operationKey }).then((value) => { settled = true; return value; });
    await waitForLocks(1);
    expect(settled).toBe(false);
    release();
    expect(await lookup).toBeNull();
  } finally { release(); await outcome; }
});

it("keeps lookup and nonparticipant pages from offering or acknowledging messages, including after restart", async () => {
  const objectId = randomUUID(), operationKey = randomUUID();
  objects.push(objectId);
  const stream = { ...scope, objectId };
  const input = { ...intent, objectId, operationKey };
  const first = await messages.sendOnceText(input);
  const session = await prisma.session.create({ data: { userId: senders[0]!, refreshTokenHash: randomUUID(), expiresAt: new Date(Date.now() + 600_000) } });
  const participant = { participantId: senders[0]!, sessionId: session.id, assignmentVersion: 0 };
  await messages.findTextOperation({ ...stream, operationKey });
  await messages.readMessages(stream);
  await expect(messages.acknowledge({ ...stream, participant, cursor: first.id, kind: "received" }))
    .rejects.toMatchObject({ code: "SERVICE_MESSAGE_INVALID_CURSOR" });
  await messages.readMessages({ ...stream, participant });
  await messages.acknowledge({ ...stream, participant, cursor: first.id, kind: "received" });
  await messages.acknowledge({ ...stream, participant, cursor: first.id, kind: "read" });
  const secondKey = randomUUID();
  const second = await messages.sendOnceText({ ...input, operationKey: secondKey, clientMessageId: randomUUID() });
  await module.close();
  module = await Test.createTestingModule({ imports: [BusinessMessagingModule] }).compile();
  prisma = module.get(PrismaService); messages = module.get(BUSINESS_MESSAGING_PORT);
  expect(await messages.findTextOperation({ ...stream, operationKey })).toEqual(first);
  expect(await messages.sendOnceText({ ...input, senderId: senders[1]!, clientMessageId: randomUUID() })).toEqual(first);
  expect(await messages.findTextOperation({ ...stream, operationKey: secondKey })).toEqual(second);
  expect(await messages.readReceipts(stream)).toEqual({ items: [
    { participantId: senders[0], assignmentVersion: 0, receivedOrder: "1", readOrder: "1" },
  ] });
  await expect(messages.acknowledge({ ...stream, participant, cursor: second.id, kind: "received" }))
    .rejects.toMatchObject({ code: "SERVICE_MESSAGE_INVALID_CURSOR" });
  expect(await messages.readMessages(stream)).toEqual({ items: [first, second], nextCursor: null });
});

it("keeps normal validation strict and validates the trusted UUID key without leaking storage errors", async () => {
  const operationKey = randomUUID(), objectId = randomUUID(); objects.push(objectId);
  const input = { ...intent, objectId, operationKey };
  await expect(messages.sendText(input)).rejects.toMatchObject({ code: "SERVICE_MESSAGE_INVALID_INPUT" });
  for (const key of ["", "forged", " ", "a".repeat(500)]) {
    await expect(messages.sendOnceText({ ...input, operationKey: key })).rejects.toMatchObject({ code: "SERVICE_MESSAGE_INVALID_INPUT" });
    await expect(messages.findTextOperation({ ...scope, operationKey: key })).rejects.toMatchObject({ code: "SERVICE_MESSAGE_INVALID_INPUT" });
  }
  for (const text of ["", " \n\t", "a".repeat(4001)]) {
    await expect(messages.sendOnceText({ ...input, text })).rejects.toMatchObject({ code: "SERVICE_MESSAGE_INVALID_INPUT" });
  }
  await expect(messages.findTextOperation({ ...input })).rejects.toMatchObject({ code: "SERVICE_MESSAGE_INVALID_INPUT" });
  await expect(messages.sendOnceText({ ...input, senderId: randomUUID() })).rejects.toMatchObject({ code: "SERVICE_MESSAGE_UNAVAILABLE" });
  expect(await messages.findTextOperation({ ...scope, objectId, operationKey })).toBeNull();
});
