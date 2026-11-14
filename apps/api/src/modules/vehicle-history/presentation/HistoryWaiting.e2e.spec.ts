import { JwtService } from "@nestjs/jwt";
import { Client } from "pg";
import { historyProcess } from "../../../../test/helpers/historyProcess";
import { eventually } from "../../../../test/helpers/eventually";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { historyFixture } from "../../../../test/helpers/historyFixture";
import { HistoryMessageAccess, type HistoryMessageActor } from "../application/HistoryMessageAccess";
import { BUSINESS_MESSAGING_PORT, type BusinessMessagingPort } from "../../business-messaging/business-messaging.public";
import { ChangeHistoryWaiting } from "../application/ChangeHistoryWaiting";
import { HISTORY_WAITING_LIFECYCLE, type HistoryWaitingLifecycle } from "../vehicle-history.public";
import { HISTORY_CLOCK, type HistoryClock } from "../domain/HistoryWaiting";

describe("History waiting recovered from committed public communications", () => {
  let f: Awaited<ReturnType<typeof historyFixture>>;
  beforeAll(async () => { f = await historyFixture(); });
  afterAll(async () => { await f?.close(); });
  async function assigned() {
    const customer = await f.actor(null), operator = await f.actor();
    const id = (await f.request.post("/api/v1/vehicle-history/requests").auth(customer.token, { type: "bearer" })
      .send({ attemptKey: randomUUID() }).expect(201)).body.id as string;
    const path = `/api/v1/vehicle-history/operator/requests/${id}`;
    await f.request.post(path + "/claim").auth(operator.token, { type: "bearer" }).send({ expectedAssignmentVersion: 0 }).expect(201);
    const actor: HistoryMessageActor = { claims: { sub: operator.user.id, sid: operator.session.id }, operator: true, expectedAssignmentVersion: 1 };
    const read = () => f.app.get(HistoryMessageAccess).run(actor, id, async (_r, _s, _o, _p, waiting) => waiting.read());
    return { customer, operator, id, path, actor, read };
  }

  it("uses immutable fresh-message time, never retry/GET/ACK time, and rejects note-shaped public input", async () => {
    const { customer, operator, id, path, read } = await assigned(), key = randomUUID();
    const send = (text: string, clientMessageId = key) => f.request.post(path + "/messages").auth(operator.token, { type: "bearer" })
      .send({ text, clientMessageId, expectedAssignmentVersion: 1 }).expect(201);
    const original = (await send("  Salam\nDünýä  ")).body;
    const first = await read();
    expect(first).toMatchObject({ reason: "customer_answer", since: new Date(original.createdAt),
      publicMessageId: original.id, publicMessageOrder: 1n, version: 1 });
    f.app.get<HistoryClock>(HISTORY_CLOCK).now = () => new Date("2030-01-01T00:00:00Z");
    expect((await send("  Salam\nDünýä  ")).body).toEqual(original);
    await f.request.get(path + "/messages?expectedAssignmentVersion=1").auth(operator.token, { type: "bearer" }).expect(200);
    await f.request.get(`/api/v1/vehicle-history/requests/${id}`).auth(customer.token, { type: "bearer" }).expect(200);
    await f.request.post(path + "/receipts").auth(operator.token, { type: "bearer" })
      .send({ cursor: original.id, kind: "received", expectedAssignmentVersion: 1 }).expect(201);
    await f.request.post(path + "/receipts").auth(operator.token, { type: "bearer" })
      .send({ cursor: original.id, kind: "read", expectedAssignmentVersion: 1 }).expect(201);
    await f.request.get(path + "/receipts?expectedAssignmentVersion=1").auth(operator.token, { type: "bearer" }).expect(200);
    await f.request.post(path + "/messages").auth(operator.token, { type: "bearer" })
      .send({ text: "private note", clientMessageId: randomUUID(), expectedAssignmentVersion: 1, kind: "NOTE" }).expect(400);
    expect(await read()).toEqual(first);
    const renewed = (await send("fresh reply", randomUUID())).body;
    expect(await read()).toMatchObject({ reason: "customer_answer", since: new Date(renewed.createdAt), version: 2 });
    const response = (await f.request.post(`/api/v1/vehicle-history/requests/${id}/messages`).auth(customer.token, { type: "bearer" })
      .send({ text: "customer answer", clientMessageId: randomUUID() }).expect(201)).body;
    expect(await read()).toMatchObject({ reason: null, since: null, publicMessageId: response.id, publicMessageOrder: 3n, version: 3 });
    await send("  Salam\nDünýä  ");
    expect(await read()).toMatchObject({ reason: null, since: null, version: 3 });
  });
  it("replays every page before lifecycle arbitration, preserving the original once outcome and receipt facts", async () => {
    const { customer, operator, id, actor, read } = await assigned();
    const messages = f.app.get<BusinessMessagingPort>(BUSINESS_MESSAGING_PORT), stream = { purpose: "vehicle_history" as const, objectId: id };
    const original = await messages.sendOnceText({ ...stream, senderId: operator.user.id, operationKey: id,
      clientMessageId: randomUUID(), text: "  Original reminder\n  " });
    let last = original;
    for (let i = 0; i < 55; i++) last = await messages.sendText({ ...stream, senderId: i === 54 ? operator.user.id : customer.user.id,
      clientMessageId: randomUUID(), text: `committed-${i}` });
    expect(await read()).toMatchObject({ version: 0, used: false });
    const change = f.app.get<HistoryWaitingLifecycle>(HISTORY_WAITING_LIFECYCLE);
    const input = { sourceId: "quote-ended", sourceVersion: 1, expectedVersion: 57, action: "end" as const };
    const result = await change.change(actor, id, input);
    expect(result).toMatchObject({ ineligible: "used", facts: { reason: null, since: null, version: 58, used: true,
      publicMessageId: last.id, publicMessageOrder: 56n, outcome: { messageId: original.id, senderId: operator.user.id,
        clientMessageId: original.clientMessageId, text: "  Original reminder\n  ", order: 1n, sentAt: new Date(original.createdAt) } } });
    expect(await change.change(actor, id, input)).toEqual(result);
    expect(await messages.readReceipts(stream)).toEqual({ items: [] });
    const conversation = await f.prisma.serviceConversation.findUniqueOrThrow({ where: { purpose_objectId: stream } });
    expect(await f.prisma.serviceMessageOffer.count({ where: { conversationId: conversation.id } })).toBe(0);
    expect(await messages.sendOnceText({ ...stream, senderId: customer.user.id, operationKey: id,
      clientMessageId: randomUUID(), text: original.text })).toEqual(original);
    const renewed = await change.change(actor, id, { sourceId: "next-quote", sourceVersion: 2, expectedVersion: 58,
      action: "begin", reason: "quote_choice" });
    expect(renewed).toMatchObject({ ineligible: "used", facts: { used: true, outcome: result.facts.outcome } });
    const page = await messages.readMessages(stream);
    expect(page.items[0]).toEqual(original);
  });

  it("uses the already-held path, preserves permanent suppression and rejects stale source/version transitions", async () => {
    const { customer, id, actor, read } = await assigned(), change = f.app.get(ChangeHistoryWaiting);
    const access = f.app.get(HistoryMessageAccess);
    const begin = { sourceId: "quote", sourceVersion: 1, expectedVersion: 0, action: "begin" as const, reason: "quote_choice" as const };
    f.app.get<HistoryClock>(HISTORY_CLOCK).now = () => new Date("2026-11-14T01:02:03.456Z");
    const first = await access.run(actor, id, (requesterId, _s, objectId, _p, waiting) =>
      change.whileLocked(actor, requesterId, objectId, waiting, begin));
    expect(first).toMatchObject({ ineligible: "too_early", facts: { version: 1, since: new Date("2026-11-14T01:02:03.456Z") } });
    f.app.get<HistoryClock>(HISTORY_CLOCK).now = () => new Date("2026-11-15T01:02:03.455Z");
    expect((await change.change(actor, id, begin)).ineligible).toBe("too_early");
    f.app.get<HistoryClock>(HISTORY_CLOCK).now = () => new Date("2026-11-15T01:02:03.456Z");
    expect((await change.change(actor, id, begin)).ineligible).toBeNull();
    const decline = await change.change(actor, id, { sourceId: "decline", sourceVersion: 2, expectedVersion: 1, action: "decline" });
    const requester: HistoryMessageActor = { claims: { sub: customer.user.id, sid: customer.session.id }, operator: false };
    await change.change(requester, id, { sourceId: "stop", sourceVersion: 3, expectedVersion: 2, action: "stop" });
    const renewed = await change.change(actor, id, { ...begin, sourceId: "new-quote", sourceVersion: 4, expectedVersion: 3 });
    expect(renewed).toMatchObject({ ineligible: "declined", facts: { declined: true, stopped: true, version: 4 } });
    expect(decline.ineligible).toBe("declined");
    for (const input of [begin, { ...begin, sourceVersion: 5, expectedVersion: 0 }]) {
      await expect(change.change(actor, id, input)).rejects.toMatchObject({ code: "HISTORY_MESSAGE_CONFLICT" });
    }
    await expect(change.change(requester, id, { ...begin, sourceVersion: 5, expectedVersion: 4 }))
      .rejects.toMatchObject({ code: "HISTORY_REQUEST_DENIED" });
    await expect(change.change(actor, id, { sourceId: "bad-stop", sourceVersion: 5, expectedVersion: 4, action: "stop" }))
      .rejects.toMatchObject({ code: "HISTORY_OPERATOR_DENIED" });
    expect(await read()).toEqual(renewed.facts);
  });

  it("recovers after actual SIGKILL between the ordinary message commit and History save under newly current authority", async () => {
    const { customer, operator, id, path, actor, read } = await assigned(), key = randomUUID();
    const messages = f.app.get<BusinessMessagingPort>(BUSINESS_MESSAGING_PORT);
    const stream = { purpose: "vehicle_history" as const, objectId: id };
    const gate = new Client({ connectionString: process.env["DATABASE_URL"] });
    let child: Awaited<ReturnType<typeof historyProcess>> | undefined;
    await gate.connect();
    await gate.query("SELECT pg_advisory_lock(12351235)");
    await f.prisma.$executeRawUnsafe(`CREATE FUNCTION history_save_gap() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN PERFORM pg_advisory_xact_lock(12351235); RETURN NEW; END $$`);
    await f.prisma.$executeRawUnsafe(`CREATE TRIGGER history_save_gap BEFORE UPDATE ON vehicle_history_requests
      FOR EACH ROW WHEN (NEW.id = '${id}') EXECUTE FUNCTION history_save_gap()`);
    try {
      child = await historyProcess([customer.user.id, operator.user.id]);
      const firstPid = child.pid, firstUrl = child.url;
      const pending = fetch(child.url + path + "/messages", { method: "POST",
        headers: { Authorization: "Bearer " + operator.token, "Content-Type": "application/json" },
        body: JSON.stringify({ clientMessageId: key, text: "  Survives death\n  ", expectedAssignmentVersion: 1 }) })
        .catch(() => null);
      await eventually(async () => {
        const [row] = await f.prisma.$queryRaw<{ waiting: boolean }[]>`SELECT EXISTS (SELECT 1 FROM pg_stat_activity
          WHERE datname = current_database() AND wait_event = 'advisory' AND query LIKE '%UPDATE%vehicle_history_requests%') AS waiting`;
        return row?.waiting ? true : null;
      }, { timeoutMs: 10_000, intervalMs: 20, description: "real child at committed-message/uncommitted-History gap" });
      const original = (await messages.readMessages(stream)).items[0]!;
      expect(original).toMatchObject({ senderId: operator.user.id, clientMessageId: key, text: "  Survives death\n  ", order: "1" });
      expect(await child.kill()).toEqual({ code: null, signal: "SIGKILL" });
      expect(await pending).toBeNull();
      expect(await read()).toMatchObject({ version: 0, publicMessageId: null });
      await gate.query("SELECT pg_advisory_unlock(12351235)");
      await f.prisma.$executeRawUnsafe("DROP TRIGGER history_save_gap ON vehicle_history_requests");
      await f.prisma.session.delete({ where: { id: operator.session.id } });
      child = await historyProcess([customer.user.id, operator.user.id]);
      expect(child.pid).not.toBe(firstPid);
      expect(child.url).not.toBe(firstUrl);
      const end = { sourceId: "after-restart", sourceVersion: 1, expectedVersion: 1, action: "end" as const };
      await expect(child.change(actor, id, end)).rejects.toThrow("HISTORY_OPERATOR_DENIED");
      const requester: HistoryMessageActor = { claims: { sub: customer.user.id, sid: customer.session.id }, operator: false };
      const access = f.app.get(HistoryMessageAccess);
      expect(await access.run(requester, id, async (_r, _s, _o, _p, waiting) => waiting.read())).toMatchObject({ version: 0 });
      const session = await f.prisma.session.create({ data: { userId: operator.user.id, refreshTokenHash: randomUUID(),
        expiresAt: new Date(Date.now() + 600_000), adminTotpExpiresAt: new Date(Date.now() + 600_000) } });
      const current = { ...actor, claims: { sub: operator.user.id, sid: session.id } };
      const result = await child.change(current, id, end);
      expect(result).toMatchObject({ ineligible: "not_waiting", facts: { version: 2, publicMessageId: original.id, publicMessageOrder: 1n } });
      expect(await child.change(current, id, end)).toEqual(result);
      const token = f.app.get(JwtService).sign({ sub: operator.user.id, sid: session.id, role: "buyer" });
      const retryResponse = await fetch(child.url + path + "/messages", { method: "POST",
        headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({ clientMessageId: key, text: original.text, expectedAssignmentVersion: 1 }) });
      expect(retryResponse.status).toBe(201);
      const retried = await retryResponse.json();
      expect(retried).toMatchObject({ id: original.id, text: original.text, createdAt: original.createdAt, order: "1" });
      expect(await child.change(current, id, end)).toEqual(result);
      const retry = await messages.sendText({ ...stream, senderId: operator.user.id, clientMessageId: key, text: original.text });
      expect(retry).toEqual(original);
      expect((await messages.readMessages(stream)).items).toEqual([original]);
      expect(await messages.readReceipts(stream)).toEqual({ items: [] });
    } finally {
      await child?.close();
      await gate.end();
      await f.prisma.$executeRawUnsafe("DROP TRIGGER IF EXISTS history_save_gap ON vehicle_history_requests");
      await f.prisma.$executeRawUnsafe("DROP FUNCTION history_save_gap()");
    }
  });

  it("rolls back the pre-send checkpoint when the real append rolls back, then recovers both messages", async () => {
    const { operator, id, path, read } = await assigned(), messages = f.app.get<BusinessMessagingPort>(BUSINESS_MESSAGING_PORT);
    const original = await messages.sendText({ purpose: "vehicle_history", objectId: id, senderId: operator.user.id,
      clientMessageId: randomUUID(), text: "older committed reply" });
    await f.prisma.$executeRawUnsafe(`CREATE FUNCTION history_append_failure() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'test-only rollback'; END $$`);
    await f.prisma.$executeRawUnsafe(`CREATE TRIGGER history_append_failure BEFORE INSERT ON service_messages
      FOR EACH ROW EXECUTE FUNCTION history_append_failure()`);
    const key = randomUUID();
    const send = () => f.request.post(path + "/messages").auth(operator.token, { type: "bearer" })
      .send({ clientMessageId: key, text: "new reply", expectedAssignmentVersion: 1 });
    try {
      await send().expect(503);
      expect(await read()).toMatchObject({ publicMessageId: null, version: 0 });
    } finally {
      await f.prisma.$executeRawUnsafe("DROP TRIGGER history_append_failure ON service_messages");
      await f.prisma.$executeRawUnsafe("DROP FUNCTION history_append_failure()");
    }
    const fresh = (await send().expect(201)).body;
    expect(await read()).toMatchObject({ publicMessageId: fresh.id, publicMessageOrder: 2n, since: new Date(fresh.createdAt), version: 2 });
    expect((await messages.readMessages({ purpose: "vehicle_history", objectId: id })).items[0]).toEqual(original);
  });

  it.each(["purpose", "assignee", "epoch", "session", "grant", "totp", "lifecycle", "disabled", "non-tester", "staging", "production"])
    ("refuses lifecycle recovery under current %s loss without applying any committed text", async (lost) => {
    const { customer, operator, id, actor } = await assigned();
    const messages = f.app.get<BusinessMessagingPort>(BUSINESS_MESSAGING_PORT);
    await messages.sendText({ purpose: "vehicle_history", objectId: id, senderId: operator.user.id, clientMessageId: randomUUID(), text: "unapplied" });
    if (lost === "purpose") await f.prisma.staffGrant.update({ where: { userId_purpose: { userId: operator.user.id, purpose: "vehicle_history" } }, data: { purpose: "vehicle_history_payment_evidence" } });
    if (lost === "assignee") { const other = await f.actor(); actor.claims = { sub: other.user.id, sid: other.session.id }; }
    if (lost === "epoch") actor.expectedAssignmentVersion = 0;
    if (lost === "session") await f.prisma.session.delete({ where: { id: operator.session.id } });
    if (lost === "grant") await f.prisma.staffGrant.update({ where: { userId_purpose: { userId: operator.user.id, purpose: "vehicle_history" } }, data: { revokedAt: new Date() } });
    if (lost === "totp") await f.prisma.session.update({ where: { id: operator.session.id }, data: { adminTotpExpiresAt: null } });
    if (lost === "lifecycle") await f.prisma.user.update({ where: { id: operator.user.id }, data: { suspendedAt: new Date() } });
    if (lost === "disabled") f.config.set("VEHICLE_HISTORY_SYNTHETIC_ENABLED", false);
    if (lost === "non-tester") f.config.set("VEHICLE_HISTORY_SYNTHETIC_USER_IDS", "");
    if (lost === "staging" || lost === "production") f.config.set("APP_ENV", lost);
    await expect(f.app.get<HistoryWaitingLifecycle>(HISTORY_WAITING_LIFECYCLE).change(actor, id,
      { sourceId: "denied", sourceVersion: 1, expectedVersion: 1, action: "end" }))
      .rejects.toMatchObject({ code: lost === "epoch" ? "HISTORY_ASSIGNMENT_CONFLICT" : "HISTORY_OPERATOR_DENIED" });
    f.config.set("APP_ENV", "test"); f.config.set("VEHICLE_HISTORY_SYNTHETIC_ENABLED", true);
    f.config.set("VEHICLE_HISTORY_SYNTHETIC_USER_IDS", customer.user.id);
    expect(await f.app.get(HistoryMessageAccess).run({ claims: { sub: customer.user.id, sid: customer.session.id }, operator: false }, id,
      async (_r, _s, _o, _p, waiting) => waiting.read())).toMatchObject({ version: 0, publicMessageId: null });
  });

  it.each(["request", "identity"].flatMap((lock) =>
    (lock === "request" ? ["session", "grant", "totp", "lifecycle", "assignment", "version"]
      : ["session", "grant", "totp", "lifecycle"]).map((lost) => [lock, lost])))
    ("revalidates lifecycle authority after the %s lock wait loses %s", async (lock, lost) => {
    const { customer, operator, id, actor } = await assigned();
    await f.app.get<BusinessMessagingPort>(BUSINESS_MESSAGING_PORT).sendText({ purpose: "vehicle_history", objectId: id,
      senderId: operator.user.id, clientMessageId: randomUUID(), text: "pending recovery" });
    let pending: Promise<unknown> | undefined;
    await f.prisma.$transaction(async (tx) => {
      if (lock === "request") await tx.$queryRaw`SELECT id FROM vehicle_history_requests WHERE id = ${id} FOR UPDATE`;
      else await tx.$queryRaw`SELECT id FROM users WHERE id = ${operator.user.id} FOR UPDATE`;
      pending = f.app.get<HistoryWaitingLifecycle>(HISTORY_WAITING_LIFECYCLE).change(actor, id,
        { sourceId: "delayed", sourceVersion: 1, expectedVersion: 1, action: "end" }).then(() => null, (error: unknown) => error);
      await eventually(async () => {
        const [row] = await f.prisma.$queryRaw<{ waiting: boolean }[]>`SELECT EXISTS (SELECT 1 FROM pg_stat_activity
          WHERE datname = current_database() AND wait_event_type = 'Lock' AND query LIKE ${lock === "request" ? '%vehicle_history_requests%' : '%users%'}
          AND pid <> pg_backend_pid()) AS waiting`;
        return row?.waiting ? true : null;
      }, { timeoutMs: 2500, intervalMs: 20, description: "lifecycle blocked on the actual authority fence" });
      if (lost === "session") await tx.session.delete({ where: { id: operator.session.id } });
      if (lost === "grant") await tx.staffGrant.update({ where: { userId_purpose: { userId: operator.user.id, purpose: "vehicle_history" } }, data: { revokedAt: new Date() } });
      if (lost === "totp") await tx.session.update({ where: { id: operator.session.id }, data: { adminTotpExpiresAt: null } });
      if (lost === "lifecycle") await tx.user.update({ where: { id: operator.user.id }, data: { suspendedAt: new Date() } });
      if (lost === "assignment" || lost === "version") await tx.vehicleHistoryRequest.update({ where: { id },
        data: { assignedOperatorId: lost === "assignment" ? customer.user.id : operator.user.id, assignmentVersion: 2 } });
    }, { timeout: 10_000 });
    expect(await pending).toMatchObject({ code: lost === "version" ? "HISTORY_ASSIGNMENT_CONFLICT" : "HISTORY_OPERATOR_DENIED" });
    expect(await f.app.get(HistoryMessageAccess).run({ claims: { sub: customer.user.id, sid: customer.session.id }, operator: false }, id,
      async (_r, _s, _o, _p, waiting) => waiting.read())).toMatchObject({ version: 0, publicMessageId: null });
  });

  it.each([false, true])("settles an older once append before arbitration (rollback=%s), without reclocking the wait", async (rollback) => {
    const { customer, operator, id, actor } = await assigned();
    const change = f.app.get<HistoryWaitingLifecycle>(HISTORY_WAITING_LIFECYCLE);
    const begin = { sourceId: "waiting", sourceVersion: 1, expectedVersion: 0, action: "begin" as const, reason: "quote_choice" as const };
    f.app.get<HistoryClock>(HISTORY_CLOCK).now = () => new Date("2020-01-01T00:00:00.123Z");
    const first = await change.change(actor, id, begin);
    f.app.get<HistoryClock>(HISTORY_CLOCK).now = () => new Date("2020-01-02T00:00:00.123Z");
    const messages = f.app.get<BusinessMessagingPort>(BUSINESS_MESSAGING_PORT), stream = { purpose: "vehicle_history" as const, objectId: id };
    const gate = new Client({ connectionString: process.env["DATABASE_URL"] });
    await gate.connect(); await gate.query("SELECT pg_advisory_lock(12351236)");
    await f.prisma.$executeRawUnsafe(`CREATE FUNCTION history_once_gap() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN PERFORM pg_advisory_xact_lock(12351236); ${rollback ? "RAISE EXCEPTION 'owned rollback';" : ""} RETURN NEW; END $$`);
    await f.prisma.$executeRawUnsafe(`CREATE TRIGGER history_once_gap BEFORE INSERT ON service_messages
      FOR EACH ROW EXECUTE FUNCTION history_once_gap()`);
    let append: Promise<unknown> | undefined, pending: Promise<Awaited<ReturnType<typeof change.change>>> | undefined;
    const waitFor = (query: string, event: string) => eventually(async () => {
      const [row] = await f.prisma.$queryRaw<{ waiting: boolean }[]>`SELECT EXISTS (SELECT 1 FROM pg_stat_activity
        WHERE datname = current_database() AND wait_event_type = 'Lock' AND query LIKE ${query} AND wait_event = ${event}) AS waiting`;
      return row?.waiting ? true : null;
    }, { timeoutMs: 2500, intervalMs: 20, description: "settled lookup waits for actual append commit or rollback" });
    try {
      append = messages.sendOnceText({ ...stream, operationKey: id, senderId: operator.user.id,
        clientMessageId: randomUUID(), text: "reminder" }).then((value) => value, () => null);
      await waitFor('%INSERT%service_messages%', 'advisory');
      pending = change.change(actor, id, begin);
      await waitFor('%service_conversations%', 'transactionid');
      await gate.query("SELECT pg_advisory_unlock(12351236)");
      const outcome = await append, result = await pending;
      expect(outcome === null).toBe(rollback);
      expect(result).toMatchObject({ ineligible: rollback ? null : "used", facts: { since: first.facts.since,
        reason: "quote_choice", used: !rollback, version: rollback ? 1 : 3 } });
      expect(await messages.readReceipts(stream)).toEqual({ items: [] });
      if (!rollback) {
        await f.prisma.$executeRawUnsafe("DROP TRIGGER history_once_gap ON service_messages");
        await messages.sendText({ ...stream, senderId: customer.user.id, clientMessageId: randomUUID(), text: "answer" });
        expect(await change.change(actor, id, begin)).toMatchObject({ ineligible: "used", facts: { reason: null, since: null, version: 4 } });
      }
    } finally {
      await gate.end(); await Promise.allSettled([append, pending]);
      await f.prisma.$executeRawUnsafe("DROP TRIGGER IF EXISTS history_once_gap ON service_messages");
      await f.prisma.$executeRawUnsafe("DROP FUNCTION history_once_gap()");
    }
  });

  it("rolls back an uncommitted ordinary append on SIGKILL and restarts without a phantom checkpoint", async () => {
    const { customer, operator, id, path, actor, read } = await assigned();
    const gate = new Client({ connectionString: process.env["DATABASE_URL"] });
    await gate.connect(); await gate.query("SELECT pg_advisory_lock(12351237)");
    await f.prisma.$executeRawUnsafe(`CREATE FUNCTION history_uncommitted_gap() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN PERFORM pg_advisory_xact_lock(12351237); RETURN NEW; END $$`);
    await f.prisma.$executeRawUnsafe(`CREATE TRIGGER history_uncommitted_gap BEFORE INSERT ON service_messages
      FOR EACH ROW EXECUTE FUNCTION history_uncommitted_gap()`);
    let child: Awaited<ReturnType<typeof historyProcess>> | undefined;
    const key = randomUUID();
    try {
      child = await historyProcess([customer.user.id, operator.user.id]);
      const firstPid = child.pid;
      const pending = fetch(child.url + path + "/messages", { method: "POST",
        headers: { Authorization: "Bearer " + operator.token, "Content-Type": "application/json" },
        body: JSON.stringify({ clientMessageId: key, text: "not yet committed", expectedAssignmentVersion: 1 }) }).catch(() => null);
      await eventually(async () => {
        const [row] = await f.prisma.$queryRaw<{ waiting: boolean }[]>`SELECT EXISTS (SELECT 1 FROM pg_stat_activity
          WHERE datname = current_database() AND wait_event = 'advisory' AND query LIKE '%INSERT%service_messages%') AS waiting`;
        return row?.waiting ? true : null;
      }, { timeoutMs: 10_000, intervalMs: 20, description: "actual child before ordinary append commit" });
      expect(await child.kill()).toEqual({ code: null, signal: "SIGKILL" });
      expect(await pending).toBeNull();
      await gate.query("SELECT pg_advisory_unlock(12351237)");
      await f.prisma.$executeRawUnsafe("DROP TRIGGER history_uncommitted_gap ON service_messages");
      expect(await read()).toMatchObject({ version: 0, publicMessageId: null });
      expect(await f.app.get<BusinessMessagingPort>(BUSINESS_MESSAGING_PORT).readMessages({ purpose: "vehicle_history", objectId: id }))
        .toEqual({ items: [], nextCursor: null });
      child = await historyProcess([customer.user.id, operator.user.id]);
      expect(child.pid).not.toBe(firstPid);
      const result = await child.change(actor, id, { sourceId: "no-phantom", sourceVersion: 1, expectedVersion: 0, action: "end" });
      expect(result).toMatchObject({ ineligible: "not_waiting", facts: { version: 1, publicMessageId: null, publicMessageOrder: 0n } });
    } finally {
      await child?.close(); await gate.end();
      await f.prisma.$executeRawUnsafe("DROP TRIGGER IF EXISTS history_uncommitted_gap ON service_messages");
      await f.prisma.$executeRawUnsafe("DROP FUNCTION history_uncommitted_gap()");
    }
  });

});
