import "reflect-metadata";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { historyFixture } from "../../../../test/helpers/historyFixture";
import { eventually } from "../../../../test/helpers/eventually";
import { HISTORY_CLOCK, HISTORY_WAITING_LIFECYCLE, type HistoryClock, type HistoryWaitingLifecycle } from "../vehicle-history.public";

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
  it.each(["session", "totp"])("does not append a reminder after its %s expires in the real settled-lookup wait", async (deadline) => {
    const customer = await f.actor(null), operator = await f.actor();
    const id = (await f.request.post("/api/v1/vehicle-history/requests").auth(customer.token, { type: "bearer" })
      .send({ attemptKey: randomUUID() }).expect(201)).body.id as string;
    const path = `/api/v1/vehicle-history/requests/${id}`, staff = `/api/v1/vehicle-history/operator/requests/${id}`;
    await f.request.post(staff + "/claim").auth(operator.token, { type: "bearer" }).send({ expectedAssignmentVersion: 0 }).expect(201);
    f.app.get<HistoryClock>(HISTORY_CLOCK).now = () => new Date("2026-11-14T00:00:00Z");
    await f.app.get<HistoryWaitingLifecycle>(HISTORY_WAITING_LIFECYCLE).change({ operator: true, expectedAssignmentVersion: 1,
      claims: { sub: operator.user.id, sid: operator.session.id } }, id,
      { sourceId: "wait", sourceVersion: 1, expectedVersion: 0, action: "begin", reason: "customer_answer" });
    f.app.get<HistoryClock>(HISTORY_CLOCK).now = () => new Date("2026-11-15T00:00:00Z");
    const expiresAt = new Date(Date.now() + 1500);
    await f.prisma.session.update({ where: { id: operator.session.id }, data: deadline === "totp" ? { adminTotpExpiresAt: expiresAt } : { expiresAt } });
    let pending: Promise<unknown> | undefined;
    await f.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM service_conversations WHERE "objectId" = ${id} FOR UPDATE`;
      pending = f.request.post(staff + "/reminder").auth(operator.token, { type: "bearer" })
        .send({ expectedAssignmentVersion: 1, expectedWaitingVersion: 1, clientMessageId: randomUUID() })
        .expect(403).expect("Cache-Control", "private, no-store").then((response) => response.body);
      await waiting(1);
      await eventually(async () => Date.now() >= expiresAt.getTime() ? true : null,
        { timeoutMs: 2500, intervalMs: 20, description: "real Session/TOTP deadline, with Identity time untouched" });
    }, { timeout: 10_000 });
    await pending;
    expect((await f.request.get(path + "/messages").auth(customer.token, { type: "bearer" }).expect(200)).body).toEqual({ items: [], nextCursor: null });
    expect((await f.request.get(path + "/reminder").auth(customer.token, { type: "bearer" }).expect(200)).body)
      .toMatchObject({ version: 1, used: false, outcome: null });
  });
  it.each(["send", "manual-send", "received", "read", "reminder"].flatMap((operation) => ["grant", "session", "totp", "lifecycle"].map((state) => [operation, state])))
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
    if (operation === "manual-send") {
      f.app.get<HistoryClock>(HISTORY_CLOCK).now = () => new Date("2026-11-14T00:00:00Z");
      await f.app.get<HistoryWaitingLifecycle>(HISTORY_WAITING_LIFECYCLE).change({ operator: true, expectedAssignmentVersion: 1,
        claims: { sub: operator.user.id, sid: operator.session.id } }, id,
        { sourceId: "wait", sourceVersion: 1, expectedVersion: 1, action: "begin", reason: "quote_choice" });
      f.app.get<HistoryClock>(HISTORY_CLOCK).now = () => new Date("2026-11-15T00:00:00Z");
    }
    let pending: Promise<unknown> | undefined, revoke: Promise<unknown> | undefined;
    await f.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM service_conversations WHERE "objectId" = ${id} FOR UPDATE`;
      pending = (operation === "manual-send" ? f.request.post(staffPath + "/reminder").auth(operator.token, { type: "bearer" })
        .send({ clientMessageId: randomUUID(), expectedAssignmentVersion: 1, expectedWaitingVersion: 2 })
        : operation === "reminder" ? f.request.get(staffPath + "/reminder?expectedAssignmentVersion=1").auth(operator.token, { type: "bearer" })
        : f.request.post(staffPath + (operation === "send" ? "/messages" : "/receipts")).auth(operator.token, { type: "bearer" })
          .send(operation === "send" ? { clientMessageId: randomUUID(), text: "authorized before revoke", expectedAssignmentVersion: 1 }
            : { cursor: original.id, kind: operation, expectedAssignmentVersion: 1 })).expect(operation === "reminder" ? 200 : 201).then((response) => response.body);
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
      ? ["existing customer", "authorized before revoke"] : operation === "manual-send"
        ? ["existing customer", "We are waiting for your reply about vehicle history. You can reply here or stop reminders."] : ["existing customer"]);
    const facts = (await f.request.get(`/api/v1/vehicle-history/requests/${id}/receipts`).auth(customer.token, { type: "bearer" }).expect(200)).body;
    expect(facts.items).toEqual([{ participantId: operator.user.id, assignmentVersion: 1, receivedOrder: "1", readOrder: operation === "read" ? "1" : "0" }]);
    await f.request.get(staffPath + "/messages?expectedAssignmentVersion=1").auth(operator.token, { type: "bearer" }).expect(403);
  });
  it.each(["send", "received", "read", "receipts", "reminder"].flatMap((operation) => ["grant", "session", "lifecycle"].map((state) => [operation, state])))
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
      pending = (operation === "send" ? send("UNAUTHORIZED AFTER REVOCATION", randomUUID()) : operation === "receipts" || operation === "reminder"
        ? f.request.get(staffPath + `/${operation}?expectedAssignmentVersion=1`).auth(operator.token, { type: "bearer" })
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

  it.each(["request", "identity"].flatMap((lock) => ["operator-read", "manual-send", "customer-read", "stop"].flatMap((operation) =>
    (operation === "operator-read" || operation === "manual-send" ? ["session", "grant", "totp", "lifecycle", ...(lock === "request" ? ["assignment", "version"] : [])]
      : ["session", "lifecycle", ...(lock === "request" ? ["ownership"] : [])]).map((lost) => [lock, operation, lost]))))
    ("refuses reminder %s-waited %s after committed %s loss", async (lock, operation, lost) => {
    const customer = await f.actor(null), operator = await f.actor(), other = await f.actor(null);
    const id = (await f.request.post("/api/v1/vehicle-history/requests").auth(customer.token, { type: "bearer" })
      .send({ attemptKey: randomUUID() }).expect(201)).body.id as string;
    const customerPath = `/api/v1/vehicle-history/requests/${id}`, staffPath = `/api/v1/vehicle-history/operator/requests/${id}`;
    await f.request.post(staffPath + "/claim").auth(operator.token, { type: "bearer" }).send({ expectedAssignmentVersion: 0 }).expect(201);
    const isOperator = operation === "operator-read" || operation === "manual-send";
    const actor = isOperator ? operator : customer;
    let pending: Promise<unknown> | undefined;
    await f.prisma.$transaction(async (tx) => {
      if (lock === "request") await tx.$queryRaw`SELECT id FROM vehicle_history_requests WHERE id = ${id} FOR UPDATE`;
      else await tx.$queryRaw`SELECT id FROM users WHERE id = ${actor.user.id} FOR UPDATE`;
      pending = (operation === "manual-send" ? f.request.post(staffPath + "/reminder")
        .send({ expectedWaitingVersion: 0, expectedAssignmentVersion: 1, clientMessageId: randomUUID() })
        : operation === "stop" ? f.request.post(customerPath + "/reminder/stop").send({ expectedWaitingVersion: 0 })
        : f.request.get(operation === "operator-read" ? staffPath + "/reminder?expectedAssignmentVersion=1" : customerPath + "/reminder"))
        .auth(actor.token, { type: "bearer" }).expect(lost === "version" ? 409 : 403)
        .expect("Cache-Control", "private, no-store").then((response) => response.body);
      await waiting(1); // The actual HTTP operation is blocked before the authority change commits.
      if (lost === "session") await tx.session.delete({ where: { id: actor.session.id } });
      if (lost === "grant") await tx.staffGrant.update({ where: { userId_purpose: { userId: actor.user.id, purpose: "vehicle_history" } }, data: { revokedAt: new Date() } });
      if (lost === "totp") await tx.session.update({ where: { id: actor.session.id }, data: { adminTotpExpiresAt: null } });
      if (lost === "lifecycle") await tx.user.update({ where: { id: actor.user.id }, data: { suspendedAt: new Date() } });
      if (lost === "assignment" || lost === "version") await tx.vehicleHistoryRequest.update({ where: { id },
        data: { assignedOperatorId: lost === "assignment" ? other.user.id : operator.user.id, assignmentVersion: 2 } });
      if (lost === "ownership") await tx.vehicleHistoryRequest.update({ where: { id }, data: { requesterId: other.user.id } });
    }, { timeout: 10_000 });
    await pending;
    const observer = isOperator ? customer : operator;
    const observerPath = isOperator ? customerPath + "/reminder" : staffPath + "/reminder?expectedAssignmentVersion=1";
    expect((await f.request.get(observerPath).auth(observer.token, { type: "bearer" }).expect(200)).body)
      .toMatchObject({ version: 0, stopped: false, used: false, outcome: null });
  });

  it.each(["session", "lifecycle"])("commits customer Stop before a later %s writer, then refuses retry", async (lost) => {
    const customer = await f.actor(null), operator = await f.actor();
    const id = (await f.request.post("/api/v1/vehicle-history/requests").auth(customer.token, { type: "bearer" })
      .send({ attemptKey: randomUUID() }).expect(201)).body.id as string;
    const path = `/api/v1/vehicle-history/requests/${id}`;
    const staffPath = `/api/v1/vehicle-history/operator/requests/${id}`;
    await f.request.post(staffPath + "/claim").auth(operator.token, { type: "bearer" }).send({ expectedAssignmentVersion: 0 }).expect(201);
    await f.request.get(path + "/reminder").auth(customer.token, { type: "bearer" }).expect(200); // Establish the BM stream.
    let pending: Promise<unknown> | undefined, revoke: Promise<unknown> | undefined;
    await f.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM service_conversations WHERE "objectId" = ${id} FOR UPDATE`;
      pending = f.request.post(path + "/reminder/stop").auth(customer.token, { type: "bearer" })
        .send({ expectedWaitingVersion: 0 }).expect(201).then((response) => {
          expect(response.body).toMatchObject({ version: 1, stopped: true, ineligibleReason: "stopped" });
        });
      await waiting(1);
      revoke = lost === "session" ? f.prisma.session.delete({ where: { id: customer.session.id } }).then((row) => row)
        : f.prisma.user.update({ where: { id: customer.user.id }, data: { suspendedAt: new Date() } }).then((row) => row);
      await waiting(2); // The later Identity writer waits until Stop's request transaction commits.
    }, { timeout: 10_000 });
    await pending; await revoke;
    expect((await f.request.get(staffPath + "/reminder?expectedAssignmentVersion=1").auth(operator.token, { type: "bearer" }).expect(200)).body)
      .toMatchObject({ version: 1, stopped: true, used: false, outcome: null });
    await f.request.post(path + "/reminder/stop").auth(customer.token, { type: "bearer" }).send({ expectedWaitingVersion: 0 }).expect(403);
  });

  it.each([["operator-read", "session"], ["operator-read", "totp"], ["stop", "session"]])
    ("refuses %s when its real %s deadline passes during the messaging lock wait", async (operation, deadline) => {
    const customer = await f.actor(null), operator = await f.actor();
    const id = (await f.request.post("/api/v1/vehicle-history/requests").auth(customer.token, { type: "bearer" })
      .send({ attemptKey: randomUUID() }).expect(201)).body.id as string;
    const path = `/api/v1/vehicle-history/requests/${id}`, staffPath = `/api/v1/vehicle-history/operator/requests/${id}`;
    await f.request.post(staffPath + "/claim").auth(operator.token, { type: "bearer" }).send({ expectedAssignmentVersion: 0 }).expect(201);
    await f.request.get(path + "/reminder").auth(customer.token, { type: "bearer" }).expect(200);
    const actor = operation === "stop" ? customer : operator, expiresAt = new Date(Date.now() + 1500);
    await f.prisma.session.update({ where: { id: actor.session.id }, data: deadline === "totp" ? { adminTotpExpiresAt: expiresAt } : { expiresAt } });
    let pending: Promise<unknown> | undefined;
    await f.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM service_conversations WHERE "objectId" = ${id} FOR UPDATE`;
      pending = (operation === "stop" ? f.request.post(path + "/reminder/stop").send({ expectedWaitingVersion: 0 })
        : f.request.get(staffPath + "/reminder?expectedAssignmentVersion=1"))
        .auth(actor.token, { type: "bearer" }).then((response) => response);
      await waiting(1);
      await eventually(async () => Date.now() >= expiresAt.getTime() ? true : null,
        { timeoutMs: 2500, intervalMs: 20, description: "owned fixture Session expires on real time, without changing Identity's clock" });
    }, { timeout: 10_000 });
    expect(await pending).toMatchObject({ status: 403, headers: { "cache-control": "private, no-store" } });
    const observer = operation === "stop" ? operator : customer;
    expect((await f.request.get(operation === "stop" ? staffPath + "/reminder?expectedAssignmentVersion=1" : path + "/reminder")
      .auth(observer.token, { type: "bearer" }).expect(200)).body).toMatchObject({ stopped: false, version: 0 });
  });
});
