import { randomUUID } from "node:crypto";
import { JwtService } from "@nestjs/jwt";
import { VehicleHistorySchemas } from "@auto-tm/contracts";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { historyFixture } from "../../../../test/helpers/historyFixture";
import { historyProcess } from "../../../../test/helpers/historyProcess";
import { eventually } from "../../../../test/helpers/eventually";
import { BUSINESS_MESSAGING_PORT, type BusinessMessagingPort } from "../../business-messaging/business-messaging.public";
import { HISTORY_CLOCK, HISTORY_WAITING_LIFECYCLE, type HistoryClock, type HistoryWaitingLifecycle } from "../vehicle-history.public";

describe("Manual reminder recovery after actual process death", () => {
  let f: Awaited<ReturnType<typeof historyFixture>>;
  beforeAll(async () => { f = await historyFixture(); });
  afterAll(async () => { await f?.close(); });

  it.each(["append", "facts", "response"].flatMap((gap) => ["none", "reply", "stop", "assignment"].map((interleave) => [gap, interleave])))
    ("recovers the %s gap after SIGKILL with %s interleaving and newly current authority", async (gap, interleave) => {
    const customer = await f.actor(null), operator = await f.actor();
    const id = (await f.request.post("/api/v1/vehicle-history/requests").auth(customer.token, { type: "bearer" })
      .send({ attemptKey: randomUUID() }).expect(201)).body.id as string;
    const path = `/api/v1/vehicle-history/requests/${id}`, staff = `/api/v1/vehicle-history/operator/requests/${id}`;
    await f.request.post(staff + "/claim").auth(operator.token, { type: "bearer" }).send({ expectedAssignmentVersion: 0 }).expect(201);
    f.app.get<HistoryClock>(HISTORY_CLOCK).now = () => new Date("2026-11-14T00:00:00Z");
    await f.app.get<HistoryWaitingLifecycle>(HISTORY_WAITING_LIFECYCLE).change({ operator: true, expectedAssignmentVersion: 1,
      claims: { sub: operator.user.id, sid: operator.session.id } }, id,
      { sourceId: "wait", sourceVersion: 1, expectedVersion: 0, action: "begin", reason: "quote_choice" });
    const messages = f.app.get<BusinessMessagingPort>(BUSINESS_MESSAGING_PORT), stream = { purpose: "vehicle_history" as const, objectId: id };
    const key = randomUUID(), input = { clientMessageId: key, expectedAssignmentVersion: 1, expectedWaitingVersion: 1 };
    const gate = new Client({ connectionString: process.env["DATABASE_URL"] });
    let child: Awaited<ReturnType<typeof historyProcess>> | undefined;
    let pending: Promise<Response | null> | undefined;
    await gate.connect();
    if (gap !== "response") {
      await gate.query("SELECT pg_advisory_lock(12181218)");
      await f.prisma.$executeRawUnsafe(`CREATE FUNCTION reminder_death_gap() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN PERFORM pg_advisory_xact_lock(12181218); RETURN NEW; END $$`);
      await f.prisma.$executeRawUnsafe(gap === "append"
        ? "CREATE TRIGGER reminder_death_gap BEFORE INSERT ON service_messages FOR EACH ROW EXECUTE FUNCTION reminder_death_gap()"
        : `CREATE TRIGGER reminder_death_gap BEFORE UPDATE ON vehicle_history_requests FOR EACH ROW
          WHEN (NEW.id = '${id}' AND NEW."reminderUsed") EXECUTE FUNCTION reminder_death_gap()`);
    }
    const dropGate = async () => {
      await gate.query("SELECT pg_advisory_unlock(12181218)");
      await f.prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS reminder_death_gap ON ${gap === "append" ? "service_messages" : "vehicle_history_requests"}`);
      await f.prisma.$executeRawUnsafe("DROP FUNCTION IF EXISTS reminder_death_gap()");
    };
    try {
      child = await historyProcess([customer.user.id, operator.user.id], { historyNow: "2026-11-15T00:00:00Z" });
      const firstPid = child.pid, firstUrl = child.url;
      const responseHeld = gap === "response" ? child.responseHeld() : undefined;
      pending = fetch(child.url + staff + "/reminder", { method: "POST",
        headers: { Authorization: "Bearer " + operator.token, "Content-Type": "application/json", "Accept-Language": "ru",
          ...(gap === "response" ? { "x-history-response": "hold" } : {}) }, body: JSON.stringify(input) }).catch(() => null);
      if (responseHeld) await responseHeld;
      else await eventually(async () => {
        const query = gap === "append" ? "%INSERT%service_messages%" : "%UPDATE%vehicle_history_requests%";
        const [row] = await f.prisma.$queryRaw<{ waiting: boolean }[]>`SELECT EXISTS (SELECT 1 FROM pg_stat_activity
          WHERE datname = current_database() AND wait_event = 'advisory' AND query LIKE ${query}) AS waiting`;
        return row?.waiting ? true : null;
      }, { timeoutMs: 10_000, intervalMs: 20, description: "real child stopped at the exact reminder commit boundary" });
      const before = await f.prisma.vehicleHistoryRequest.findUniqueOrThrow({ where: { id } });
      expect(before).toMatchObject({ waitingVersion: gap === "response" ? 3 : 1, reminderUsed: gap === "response" });
      // At the facts/response gaps the public once message really committed.
      const original = gap === "append" ? null : await messages.findTextOperation({ ...stream, operationKey: id });
      if (gap !== "append") expect(original).toMatchObject({ senderId: operator.user.id, clientMessageId: key, order: "1",
        text: "Мы ждём вашего ответа об истории автомобиля. Вы можете ответить здесь или отключить напоминания." });
      expect(before.publicMessageId).toBe(gap === "response" ? original!.id : null);
      expect(await child.kill()).toEqual({ code: null, signal: "SIGKILL" });
      expect(await pending).toBeNull(); // The actual listener never returned the response.
      await dropGate();
      expect(await messages.findTextOperation({ ...stream, operationKey: id })).toEqual(original);
      expect(await f.prisma.vehicleHistoryRequest.findUniqueOrThrow({ where: { id } })).toMatchObject({
        waitingVersion: gap === "response" ? 3 : 1, reminderUsed: gap === "response" });
      await f.prisma.session.delete({ where: { id: operator.session.id } });
      const session = await f.prisma.session.create({ data: { userId: operator.user.id, refreshTokenHash: randomUUID(),
        expiresAt: new Date(Date.now() + 600_000), adminTotpExpiresAt: new Date(Date.now() + 600_000) } });
      let token = f.app.get(JwtService).sign({ sub: operator.user.id, sid: session.id, role: "buyer" }), assignmentVersion = 1;
      child = await historyProcess([customer.user.id, operator.user.id], { historyNow: "2026-11-15T00:00:00Z" });
      expect(child.pid).not.toBe(firstPid);
      expect(child.url).not.toBe(firstUrl);
      const post = (route: string, auth: string, body: unknown, locale = "tk") => fetch(child!.url + route, { method: "POST",
        headers: { Authorization: "Bearer " + auth, "Content-Type": "application/json", "Accept-Language": locale }, body: JSON.stringify(body) });
      expect((await post(staff + "/reminder", operator.token, input)).status).toBe(403);
      let reply: unknown;
      if (interleave === "reply") {
        const response = await post(path + "/messages", customer.token, { clientMessageId: randomUUID(), text: "Answer after death" });
        expect(response.status).toBe(201); reply = await response.json();
      }
      if (interleave === "stop") {
        const response = await post(path + "/reminder/stop", customer.token, { expectedWaitingVersion: original ? 3 : 1 });
        expect(response.status).toBe(201);
      }
      if (interleave === "assignment") {
        const successor = await f.actor();
        await f.prisma.vehicleHistoryRequest.update({ where: { id }, data: { assignedOperatorId: successor.user.id, assignmentVersion: 2 } });
        expect((await post(staff + "/reminder", token, input)).status).toBe(403);
        token = successor.token; assignmentVersion = 2;
        await child.close();
        child = await historyProcess([customer.user.id, operator.user.id, successor.user.id], { historyNow: "2026-11-15T00:00:00Z" });
      }
      const suppressedRollback = !original && (interleave === "reply" || interleave === "stop");
      const retry = await post(staff + "/reminder", token, { expectedAssignmentVersion: assignmentVersion,
        expectedWaitingVersion: original ? 0 : 1, clientMessageId: randomUUID() });
      expect(retry.status).toBe(suppressedRollback ? 409 : 201);
      const read = async () => {
        const response = await fetch(child!.url + path + "/reminder", { headers: { Authorization: "Bearer " + customer.token } });
        expect(response.status).toBe(200); return VehicleHistorySchemas.HistoryReminderSchema.parse(await response.json());
      };
      const recovered = await read();
      expect(recovered).toMatchObject({ used: !suppressedRollback, stopped: interleave === "stop",
        version: interleave === "reply" || interleave === "stop" ? original ? 4 : 2 : 3 });
      if (original) expect(recovered.outcome).toEqual({ id: original.id, clientMessageId: key, kind: "TEXT", text: original.text,
        order: "1", createdAt: original.createdAt, author: { id: operator.user.id, displayName: "Ayna", nameNumber: 1213, kind: "operator" } });
      if (suppressedRollback) expect(recovered.outcome).toBeNull();
      else {
        expect(await retry.json()).toEqual(recovered);
        const again = await post(staff + "/reminder", token, { ...input, expectedAssignmentVersion: assignmentVersion, expectedWaitingVersion: 0 }, "en");
        expect(again.status).toBe(201); expect(await again.json()).toEqual(recovered);
      }
      expect(await read()).toEqual(recovered); // No replay/version drift after refetch.
      const conversation = await f.prisma.serviceConversation.findUniqueOrThrow({ where: { purpose_objectId: stream } });
      expect(await f.prisma.serviceMessageOffer.count({ where: { conversationId: conversation.id } })).toBe(0);
      expect(await messages.readReceipts(stream)).toEqual({ items: [] });
      const transcript = (await f.request.get(path + "/messages").auth(customer.token, { type: "bearer" }).expect(200)).body;
      expect(transcript).toEqual({ items: [...(recovered.outcome ? [recovered.outcome] : []), ...(reply ? [reply] : [])], nextCursor: null });
    } finally {
      await child?.close();
      await dropGate(); await gate.end(); await pending;
    }
  });
});
