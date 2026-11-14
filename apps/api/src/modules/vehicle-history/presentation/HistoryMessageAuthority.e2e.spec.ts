import "reflect-metadata";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { historyFixture } from "../../../../test/helpers/historyFixture";
import { eventually } from "../../../../test/helpers/eventually";

describe("History message identity commit fence over listening HTTP", () => {
  let f: Awaited<ReturnType<typeof historyFixture>>;
  beforeAll(async () => { f = await historyFixture(); });
  afterAll(async () => { await f?.close(); });
  async function waiting(count: number) {
    await eventually(async () => {
      const [row] = await f.prisma.$queryRaw<{ count: bigint }[]>`SELECT COUNT(*) AS count FROM pg_stat_activity
        WHERE datname = current_database() AND wait_event_type = 'Lock' AND pid <> pg_backend_pid()`;
      return row && row.count >= count ? true : null;
    }, { timeoutMs: 2500, intervalMs: 20, description: "HTTP operations waiting on owned identity rows" });
  }
  it.each(["send", "received", "read"].flatMap((operation) => ["grant", "session", "totp", "lifecycle"].map((state) => [operation, state])))
    ("commits a fenced %s before a later %s writer without deadlocking foreign keys", async (operation, state) => {
    const customer = await f.actor(null), operator = await f.actor(), founder = await f.actor("vehicle_history_staff_management");
    const id = (await f.request.post("/api/v1/vehicle-history/requests").auth(customer.token, { type: "bearer" })
      .send({ attemptKey: randomUUID() }).expect(201)).body.id as string;
    const staffPath = `/api/v1/vehicle-history/operator/requests/${id}`;
    await f.request.post(staffPath + "/claim").auth(operator.token, { type: "bearer" }).send({ expectedAssignmentVersion: 0 }).expect(201);
    const original = (await f.request.post(`/api/v1/vehicle-history/requests/${id}/messages`).auth(customer.token, { type: "bearer" })
      .send({ clientMessageId: randomUUID(), text: "existing customer" }).expect(201)).body;
    await f.request.get(staffPath + "/messages?expectedAssignmentVersion=1").auth(operator.token, { type: "bearer" }).expect(200);
    await f.request.post(staffPath + "/receipts").auth(operator.token, { type: "bearer" })
      .send({ cursor: original.id, kind: "received", expectedAssignmentVersion: 1 }).expect(201);
    let pending: Promise<unknown> | undefined, revoke: Promise<unknown> | undefined;
    await f.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM service_conversations WHERE "objectId" = ${id} FOR UPDATE`;
      pending = f.request.post(staffPath + (operation === "send" ? "/messages" : "/receipts")).auth(operator.token, { type: "bearer" })
        .send(operation === "send" ? { clientMessageId: randomUUID(), text: "authorized before revoke", expectedAssignmentVersion: 1 }
          : { cursor: original.id, kind: operation, expectedAssignmentVersion: 1 }).expect(201).then((response) => response.body);
      await waiting(1); // The send owns both fences and waits inside messaging.
      revoke = state === "grant" ? f.request.post("/api/v1/identity/history-staff").auth(founder.token, { type: "bearer" })
        .send({ targetId: operator.user.id, capability: "vehicle-history", active: false, reason: "End synthetic messaging duty" })
        .expect(201).then((response) => response.body) : state === "session"
          ? f.prisma.session.delete({ where: { id: operator.session.id } }).then((result) => result)
          : state === "totp" ? f.prisma.session.update({ where: { id: operator.session.id }, data: { adminTotpExpiresAt: null } }).then((result) => result)
            : f.prisma.user.update({ where: { id: operator.user.id }, data: { suspendedAt: new Date() } }).then((result) => result);
      await waiting(2); // Revocation must wait for the message commit.
    }, { timeout: 10_000 });
    await pending;
    await revoke;
    const transcript = await f.request.get(`/api/v1/vehicle-history/requests/${id}/messages`).auth(customer.token, { type: "bearer" }).expect(200);
    expect(transcript.body.items.map((item: { text: string }) => item.text)).toEqual(operation === "send"
      ? ["existing customer", "authorized before revoke"] : ["existing customer"]);
    const facts = (await f.request.get(`/api/v1/vehicle-history/requests/${id}/receipts`).auth(customer.token, { type: "bearer" }).expect(200)).body;
    expect(facts.items).toEqual([{ participantId: operator.user.id, assignmentVersion: 1, receivedOrder: "1", readOrder: operation === "read" ? "1" : "0" }]);
    await f.request.get(staffPath + "/messages?expectedAssignmentVersion=1").auth(operator.token, { type: "bearer" }).expect(403);
  });
  it.each(["send", "received", "read", "receipts"].flatMap((operation) => ["grant", "session", "lifecycle"].map((state) => [operation, state])))
    ("refuses %s whose identity wait is followed by committed %s revocation", async (operation, state) => {
    const customer = await f.actor(null), operator = await f.actor(), founder = await f.actor("vehicle_history_staff_management");
    const id = (await f.request.post("/api/v1/vehicle-history/requests").auth(customer.token, { type: "bearer" })
      .send({ attemptKey: randomUUID() }).expect(201)).body.id as string;
    const staffPath = `/api/v1/vehicle-history/operator/requests/${id}`;
    await f.request.post(staffPath + "/claim").auth(operator.token, { type: "bearer" }).send({ expectedAssignmentVersion: 0 }).expect(201);
    const key = randomUUID();
    const send = (text: string, clientMessageId = key) => f.request.post(staffPath + "/messages").auth(operator.token, { type: "bearer" })
      .send({ text, clientMessageId, expectedAssignmentVersion: 1 });
    const original = (await send("stored before revocation").expect(201)).body;
    await f.request.get(staffPath + "/messages?expectedAssignmentVersion=1").auth(operator.token, { type: "bearer" }).expect(200);
    const acknowledge = (kind: string) => f.request.post(staffPath + "/receipts").auth(operator.token, { type: "bearer" })
      .send({ cursor: original.id, kind, expectedAssignmentVersion: 1 });
    if (operation === "read") await acknowledge("received").expect(201);
    let pending: Promise<unknown> | undefined, revoke: Promise<unknown> | undefined;
    await f.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${operator.user.id} FOR UPDATE`;
      if (state === "grant") {
        revoke = f.request.post("/api/v1/identity/history-staff").auth(founder.token, { type: "bearer" })
          .send({ targetId: operator.user.id, capability: "vehicle-history", active: false, reason: "End synthetic messaging duty" })
          .expect(201).then((response) => { expect(response.body.target.capabilities["vehicle-history"]).toBe(false); });
        await waiting(1); // The real grant writer queues before the send.
      }
      pending = (operation === "send" ? send("UNAUTHORIZED AFTER REVOCATION", randomUUID()) : operation === "receipts"
        ? f.request.get(staffPath + "/receipts?expectedAssignmentVersion=1").auth(operator.token, { type: "bearer" })
        : acknowledge(operation!)).expect(403).then((response) => {
        expect(response.headers["cache-control"]).toBe("private, no-store");
      });
      await waiting(state === "grant" ? 2 : 1);
      if (state === "session") await tx.session.delete({ where: { id: operator.session.id } });
      if (state === "lifecycle") await tx.user.update({ where: { id: operator.user.id }, data: { suspendedAt: new Date() } });
    }, { timeout: 10_000 });
    await revoke;
    await pending;
    await send("stored before revocation").expect(403);
    await f.request.get(staffPath + `/messages?expectedAssignmentVersion=1&cursor=${original.id}`)
      .auth(operator.token, { type: "bearer" }).expect(403);
    const transcript = await f.request.get(`/api/v1/vehicle-history/requests/${id}/messages`)
      .auth(customer.token, { type: "bearer" }).expect(200);
    expect(transcript.body).toEqual({ items: [original], nextCursor: null });
    const facts = (await f.request.get(`/api/v1/vehicle-history/requests/${id}/receipts`).auth(customer.token, { type: "bearer" }).expect(200)).body;
    expect(facts.items).toEqual(operation === "read" ? [{ participantId: operator.user.id, assignmentVersion: 1, receivedOrder: "1", readOrder: "0" }] : []);
  });
});
