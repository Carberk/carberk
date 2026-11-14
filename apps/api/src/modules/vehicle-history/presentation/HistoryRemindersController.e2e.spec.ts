import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { VehicleHistorySchemas as Schemas } from "@auto-tm/contracts";
import { historyFixture } from "../../../../test/helpers/historyFixture";
import { BUSINESS_MESSAGING_PORT, type BusinessMessagingPort } from "../../business-messaging/business-messaging.public";
import { HISTORY_CLOCK, HISTORY_WAITING_LIFECYCLE, type HistoryClock, type HistoryWaitingLifecycle } from "../vehicle-history.public";

describe("Current History reminder state over listening HTTP", () => {
  let f: Awaited<ReturnType<typeof historyFixture>>;
  beforeAll(async () => { f = await historyFixture(); });
  afterAll(async () => { await f?.close(); });
  async function assigned() {
    const customer = await f.actor(null), operator = await f.actor();
    const id = (await f.request.post("/api/v1/vehicle-history/requests").auth(customer.token, { type: "bearer" })
      .send({ attemptKey: randomUUID() }).expect(201)).body.id as string;
    const customerPath = `/api/v1/vehicle-history/requests/${id}`, staffPath = `/api/v1/vehicle-history/operator/requests/${id}`;
    await f.request.post(staffPath + "/claim").auth(operator.token, { type: "bearer" }).send({ expectedAssignmentVersion: 0 }).expect(201);
    const actor = { claims: { sub: operator.user.id, sid: operator.session.id }, operator: true, expectedAssignmentVersion: 1 };
    const read = () => f.request.get(customerPath + "/reminder").auth(customer.token, { type: "bearer" }).expect(200);
    return { customer, operator, id, customerPath, staffPath, actor, read };
  }

  it("uses literal elapsed UTC boundaries on History time while current sessions remain valid", async () => {
    const { operator, id, staffPath, actor, read } = await assigned();
    const clock = f.app.get<HistoryClock>(HISTORY_CLOCK), lifecycle = f.app.get<HistoryWaitingLifecycle>(HISTORY_WAITING_LIFECYCLE);
    clock.now = () => new Date("2026-11-14T00:00:00.000Z");
    await lifecycle.change(actor, id, { sourceId: "quote", sourceVersion: 1, expectedVersion: 0, action: "begin", reason: "quote_choice" });
    clock.now = () => new Date("2026-11-14T23:59:59.000Z");
    const early = (await read()).body;
    expect(early).toEqual({ reason: "quote_choice", since: "2026-11-14T00:00:00.000Z", version: 1,
      eligibleAt: "2026-11-15T00:00:00.000Z", eligible: false, ineligibleReason: "too_early", declined: false, stopped: false, used: false, outcome: null });
    clock.now = () => new Date("2026-11-14T23:59:59.999Z");
    expect((await read()).body.ineligibleReason).toBe("too_early");
    clock.now = () => new Date("2026-11-15T00:00:00.000Z");
    const eligible = { ...early, eligible: true, ineligibleReason: null };
    expect((await read()).body).toEqual(eligible);
    expect((await f.request.get(staffPath + "/reminder?expectedAssignmentVersion=1").auth(operator.token, { type: "bearer" }).expect(200)).body).toEqual(eligible);
  });

  it("permanently stops once, rejects stale first attempts and keeps retries idempotent after a new wait", async () => {
    const { customer, operator, id, customerPath, staffPath, actor, read } = await assigned();
    const stop = (version: number) => f.request.post(customerPath + "/reminder/stop").auth(customer.token, { type: "bearer" })
      .send({ expectedWaitingVersion: version });
    expect((await read()).body.ineligibleReason).toBe("not_waiting");
    await stop(1).expect(409);
    f.concurrent(2);
    const results = await Promise.all([stop(0), stop(0)].map((request) => request.set("x-history-concurrency", "stop")));
    expect(results.map((response) => response.status)).toEqual([201, 201]);
    const stopped = results[0]!.body;
    expect(results[1]!.body).toEqual(stopped);
    expect(stopped).toMatchObject({ stopped: true, version: 1, eligible: false, ineligibleReason: "stopped", used: false, outcome: null });
    await f.app.get<HistoryWaitingLifecycle>(HISTORY_WAITING_LIFECYCLE).change(actor, id,
      { sourceId: "later-quote", sourceVersion: 2, expectedVersion: 1, action: "begin", reason: "quote_choice" });
    const renewed = (await read()).body;
    expect(renewed).toMatchObject({ reason: "quote_choice", stopped: true, version: 2, ineligibleReason: "stopped" });
    expect((await stop(0).expect(201)).body).toEqual(renewed);
    expect((await f.request.get(staffPath + "/reminder?expectedAssignmentVersion=1").auth(operator.token, { type: "bearer" }).expect(200)).body).toEqual(renewed);
    expect((await f.request.get(customerPath + "/messages").auth(customer.token, { type: "bearer" }).expect(200)).body.items).toEqual([]);
    await f.request.post(staffPath + "/reminder").auth(operator.token, { type: "bearer" }).send({ expectedWaitingVersion: 2 }).expect(404);
  });

  it("repairs every page after a saved checkpoint, identifying the settled original before replay without offering or acknowledging text", async () => {
    const { customer, operator, id, customerPath, staffPath, read } = await assigned();
    await f.request.post(staffPath + "/messages").auth(operator.token, { type: "bearer" })
      .send({ clientMessageId: randomUUID(), text: "answer needed", expectedAssignmentVersion: 1 }).expect(201);
    const messages = f.app.get<BusinessMessagingPort>(BUSINESS_MESSAGING_PORT), stream = { purpose: "vehicle_history" as const, objectId: id };
    for (let i = 0; i < 55; i++) await messages.sendText({ ...stream, senderId: customer.user.id,
      clientMessageId: randomUUID(), text: `answer-${i}` });
    const original = await messages.sendOnceText({ ...stream, operationKey: id, senderId: operator.user.id,
      clientMessageId: randomUUID(), text: "  Original\nÝatlatma / Напоминание  " });
    const state = (await read()).body;
    expect(Schemas.HistoryReminderSchema.parse(state)).toEqual(state);
    expect(state).toEqual({ reason: null, since: null, version: 58, eligibleAt: null, eligible: false, ineligibleReason: "used",
      declined: false, stopped: false, used: true, outcome: { id: original.id, clientMessageId: original.clientMessageId,
        kind: "TEXT", text: "  Original\nÝatlatma / Напоминание  ", order: "57", createdAt: original.createdAt,
        author: { id: operator.user.id, displayName: "Ayna", nameNumber: 1213, kind: "operator" } } });
    expect((await read()).body).toEqual(state);
    expect((await f.request.get(staffPath + "/reminder?expectedAssignmentVersion=1").auth(operator.token, { type: "bearer" }).expect(200)).body).toEqual(state);
    expect((await f.request.get(customerPath + "/receipts").auth(customer.token, { type: "bearer" }).expect(200)).body).toEqual({ items: [] });
    const conversation = await f.prisma.serviceConversation.findUniqueOrThrow({ where: { purpose_objectId: stream } });
    expect(await f.prisma.serviceMessageOffer.count({ where: { conversationId: conversation.id } })).toBe(0);
    await f.request.post(customerPath + "/receipts").auth(customer.token, { type: "bearer" }).send({ cursor: original.id, kind: "received" }).expect(400);
    const stopped = (await f.request.post(customerPath + "/reminder/stop").auth(customer.token, { type: "bearer" })
      .send({ expectedWaitingVersion: 58 }).expect(201)).body;
    expect(stopped).toEqual({ ...state, version: 59, stopped: true, ineligibleReason: "stopped" });
    expect((await read()).body).toEqual(stopped);
    const transcript = (await f.request.get(customerPath + "/messages?cursor=" + original.id).auth(customer.token, { type: "bearer" }).expect(200)).body;
    expect(transcript).toEqual({ items: [], nextCursor: null });
    expect(await messages.findTextOperation({ ...stream, operationKey: id })).toEqual(original);
  });

  it("retains decline and Stop across fresh public messages and a new quote wait", async () => {
    const { customer, operator, id, customerPath, staffPath, actor, read } = await assigned();
    const lifecycle = f.app.get<HistoryWaitingLifecycle>(HISTORY_WAITING_LIFECYCLE);
    await lifecycle.change(actor, id, { sourceId: "decline", sourceVersion: 1, expectedVersion: 0, action: "decline" });
    await f.request.post(customerPath + "/reminder/stop").auth(customer.token, { type: "bearer" }).send({ expectedWaitingVersion: 1 }).expect(201);
    const sent = (await f.request.post(staffPath + "/messages").auth(operator.token, { type: "bearer" })
      .send({ clientMessageId: randomUUID(), text: "fresh answer", expectedAssignmentVersion: 1 }).expect(201)).body;
    expect((await read()).body).toMatchObject({ reason: "customer_answer", since: sent.createdAt, version: 3,
      declined: true, stopped: true, used: false, ineligibleReason: "declined" });
    await lifecycle.change(actor, id, { sourceId: "another-quote", sourceVersion: 3, expectedVersion: 3, action: "begin", reason: "quote_choice" });
    const renewed = (await read()).body;
    expect(renewed).toMatchObject({ reason: "quote_choice", version: 4, declined: true, stopped: true, ineligibleReason: "declined" });
    expect((await f.request.post(customerPath + "/reminder/stop").auth(customer.token, { type: "bearer" })
      .send({ expectedWaitingVersion: 1 }).expect(201)).body).toEqual(renewed);
  });

  it.each([
    ["en", "Check the reminder details and try again.", "Reminder state changed. Refresh the enquiry before trying again."],
    ["ru", "Проверьте параметры напоминания и повторите попытку.", "Состояние напоминания изменилось. Обновите обращение и повторите попытку."],
    ["tk", "Ýatlatmanyň maglumatlaryny barlap, gaýtadan synanyşyň.", "Ýatlatmanyň ýagdaýy üýtgedi. Täzeden synanyşmazdan öň ýüz tutmany täzeläň."],
  ])("keeps %s malformed/version/unknown-key refusals localized, bounded and private", async (locale, invalid, conflict) => {
    const { customer, operator, customerPath, staffPath, read } = await assigned();
    const initial = (await read()).body;
    const failure = (response: { body: unknown; headers: Record<string, unknown> }, statusCode = 400, message = invalid) => {
      expect(response.headers["cache-control"]).toBe("private, no-store");
      expect(response.body).toEqual({ statusCode, code: statusCode === 409 ? "HISTORY_REMINDER_CONFLICT" : "HISTORY_REMINDER_INVALID", message });
    };
    for (const body of [{}, { expectedWaitingVersion: "0" }, { expectedWaitingVersion: -1 }, { expectedWaitingVersion: 0.5 },
      { expectedWaitingVersion: 2147483648 }, { expectedWaitingVersion: 0, now: "2030-01-01" }, { expectedWaitingVersion: 0, actor: customer.user.id },
      { expectedWaitingVersion: 0, outcome: "forged" }, { expectedWaitingVersion: 0, stopped: false }]) {
      failure(await f.request.post(customerPath + "/reminder/stop").auth(customer.token, { type: "bearer" }).set("Accept-Language", locale!).send(body).expect(400));
    }
    for (const query of ["", "?expectedAssignmentVersion=01", "?expectedAssignmentVersion=-1", "?expectedAssignmentVersion=1.5",
      "?expectedAssignmentVersion=2147483648", "?expectedAssignmentVersion=1&grant=vehicle-history", "?expectedAssignmentVersion=1&expectedAssignmentVersion=1"]) {
      failure(await f.request.get(staffPath + "/reminder" + query).auth(operator.token, { type: "bearer" }).set("Accept-Language", locale!).expect(400));
    }
    failure(await f.request.get(customerPath + "/reminder?sourceId=private").auth(customer.token, { type: "bearer" }).set("Accept-Language", locale!).expect(400));
    failure(await f.request.post(customerPath + "/reminder/stop?policy=forged").auth(customer.token, { type: "bearer" })
      .set("Accept-Language", locale!).send({ expectedWaitingVersion: 0 }).expect(400));
    failure(await f.request.post(customerPath + "/reminder/stop").auth(customer.token, { type: "bearer" })
      .set("Accept-Language", locale!).set("Content-Type", "application/json").send('{"expectedWaitingVersion":').expect(400));
    failure(await f.request.post(customerPath + "/reminder/stop").auth(customer.token, { type: "bearer" }).set("Accept-Language", locale!)
      .send({ expectedWaitingVersion: 1 }).expect(409), 409, conflict);
    expect((await read()).body).toEqual(initial);
    expect((await read()).headers["cache-control"]).toBe("private, no-store");
    await f.request.get(customerPath + "/reminder").expect(401).expect("Cache-Control", "private, no-store");
  });

  it.each(["purpose", "management", "admin", "unassigned", "former", "version", "session", "grant", "totp", "expired", "suspended", "deleting", "disabled", "non-tester", "staging", "production"])
    ("denies the operator reminder read after current %s authority loss", async (lost) => {
    const { customer, operator, id, customerPath, staffPath, read } = await assigned();
    let caller = operator;
    if (lost === "purpose") caller = await f.actor("vehicle_history_payment_evidence");
    if (lost === "management") caller = await f.actor("vehicle_history_staff_management");
    if (lost === "admin") caller = await f.actor(null, "admin");
    if (lost === "former" || lost === "unassigned") await f.prisma.vehicleHistoryRequest.update({ where: { id },
      data: { assignedOperatorId: lost === "unassigned" ? null : customer.user.id, assignmentVersion: lost === "unassigned" ? 0 : 2 } });
    if (lost === "session") await f.prisma.session.delete({ where: { id: operator.session.id } });
    if (lost === "grant") await f.prisma.staffGrant.update({ where: { userId_purpose: { userId: operator.user.id, purpose: "vehicle_history" } }, data: { revokedAt: new Date() } });
    if (lost === "totp" || lost === "expired") await f.prisma.session.update({ where: { id: operator.session.id },
      data: lost === "totp" ? { adminTotpExpiresAt: null } : { expiresAt: new Date(0) } });
    if (lost === "suspended" || lost === "deleting") await f.prisma.user.update({ where: { id: operator.user.id },
      data: lost === "suspended" ? { suspendedAt: new Date() } : { deletionScheduledAt: new Date() } });
    if (lost === "disabled") f.config.set("VEHICLE_HISTORY_SYNTHETIC_ENABLED", false);
    if (lost === "non-tester") f.config.set("VEHICLE_HISTORY_SYNTHETIC_USER_IDS", customer.user.id);
    if (lost === "staging" || lost === "production") f.config.set("APP_ENV", lost);
    await f.request.get(staffPath + `/reminder?expectedAssignmentVersion=${lost === "version" ? 0 : 1}`).auth(caller.token, { type: "bearer" })
      .expect(lost === "version" ? 409 : 403).expect("Cache-Control", "private, no-store");
    f.config.set("APP_ENV", "test"); f.config.set("VEHICLE_HISTORY_SYNTHETIC_ENABLED", true);
    f.config.set("VEHICLE_HISTORY_SYNTHETIC_USER_IDS", customer.user.id);
    expect((await read()).body).toMatchObject({ version: 0, stopped: false, used: false, outcome: null });
    await f.request.post(customerPath + "/reminder/stop").auth(operator.token, { type: "bearer" }).send({ expectedWaitingVersion: 0 }).expect(403);
  });

  it.each(["foreign", "admin", "session", "expired", "suspended", "deleting", "disabled", "non-tester", "staging", "production"])
    ("refuses customer read, Stop and already-stopped retry under %s authority", async (lost) => {
    const { customer, customerPath, read } = await assigned();
    const other = await f.actor(null, lost === "admin" ? "admin" : "buyer");
    const before = (await read()).body;
    await f.request.post(customerPath + "/reminder/stop").auth(customer.token, { type: "bearer" }).send({ expectedWaitingVersion: 0 }).expect(201);
    let caller = customer;
    if (lost === "foreign" || lost === "admin") caller = other;
    if (lost === "session") await f.prisma.session.delete({ where: { id: customer.session.id } });
    if (lost === "expired") await f.prisma.session.update({ where: { id: customer.session.id }, data: { expiresAt: new Date(0) } });
    if (lost === "suspended" || lost === "deleting") await f.prisma.user.update({ where: { id: customer.user.id },
      data: lost === "suspended" ? { suspendedAt: new Date() } : { deletionScheduledAt: new Date() } });
    if (lost === "disabled") f.config.set("VEHICLE_HISTORY_SYNTHETIC_ENABLED", false);
    if (lost === "non-tester") f.config.set("VEHICLE_HISTORY_SYNTHETIC_USER_IDS", other.user.id);
    if (lost === "staging" || lost === "production") f.config.set("APP_ENV", lost);
    await f.request.get(customerPath + "/reminder").auth(caller.token, { type: "bearer" }).expect(403).expect("Cache-Control", "private, no-store");
    await f.request.post(customerPath + "/reminder/stop").auth(caller.token, { type: "bearer" }).send({ expectedWaitingVersion: before.version })
      .expect(403).expect("Cache-Control", "private, no-store");
  });

  it.each([
    ["en", "Reminders are temporarily unavailable. Reopen the enquiry and retry.", "This request is unavailable. Sign in again or return to your History requests."],
    ["ru", "Напоминания временно недоступны. Откройте обращение заново и повторите попытку.", "Запрос недоступен. Войдите снова или вернитесь к своим запросам истории."],
    ["tk", "Ýatlatmalar wagtlaýyn elýeterli däl. Ýüz tutmany täzeden açyp synanyşyň.", "Bu ýüz tutma elýeterli däl. Gaýtadan giriň ýa-da taryh ýüz tutmalaryňyza dolanyň."],
  ])("keeps %s unavailable and foreign-object refusals private without leaking a storage error", async (locale, unavailable, denied) => {
    const { customer, id, customerPath, read } = await assigned(), other = await f.actor(null);
    const initial = (await read()).body;
    const refusal = await f.request.get(customerPath + "/reminder").auth(other.token, { type: "bearer" }).set("Accept-Language", locale!).expect(403);
    expect(refusal.body).toEqual({ statusCode: 403, code: "HISTORY_REQUEST_DENIED", message: denied });
    await f.prisma.$executeRawUnsafe(`CREATE FUNCTION reminder_storage_failure() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'private storage diagnostic'; END $$`);
    await f.prisma.$executeRawUnsafe(`CREATE TRIGGER reminder_storage_failure BEFORE INSERT ON service_conversations
      FOR EACH ROW WHEN (NEW."objectId" = '${id}') EXECUTE FUNCTION reminder_storage_failure()`);
    try {
      for (const operation of [f.request.get(customerPath + "/reminder"),
        f.request.post(customerPath + "/reminder/stop").send({ expectedWaitingVersion: 0 })]) {
        const response = await operation.auth(customer.token, { type: "bearer" }).set("Accept-Language", locale!).expect(503);
        expect(response.headers["cache-control"]).toBe("private, no-store");
        expect(response.body).toEqual({ statusCode: 503, code: "HISTORY_REMINDER_UNAVAILABLE", message: unavailable });
      }
    } finally {
      await f.prisma.$executeRawUnsafe("DROP TRIGGER reminder_storage_failure ON service_conversations");
      await f.prisma.$executeRawUnsafe("DROP FUNCTION reminder_storage_failure()");
    }
    expect((await read()).body).toEqual(initial);
  });
});
