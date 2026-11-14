import "reflect-metadata";
import { randomUUID } from "node:crypto";
import { JwtService } from "@nestjs/jwt";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { historyFixture } from "../../../../test/helpers/historyFixture";
import { eventually } from "../../../../test/helpers/eventually";

describe("Explicit History receipts over listening HTTP", () => {
  let f: Awaited<ReturnType<typeof historyFixture>>;
  beforeAll(async () => { f = await historyFixture(); });
  afterAll(async () => { await f?.close(); });
  type Actor = Awaited<ReturnType<typeof f.actor>>;
  const path = (id: string, staff = false) => `/api/v1/vehicle-history/${staff ? "operator/" : ""}requests/${id}`;
  const receipts = (actor: Actor, id: string, staff = false, version = 1) => f.request.get(path(id, staff)
    + `/receipts${staff ? `?expectedAssignmentVersion=${version}` : ""}`).auth(actor.token, { type: "bearer" });
  const ack = (actor: Actor, id: string, cursor: string, kind = "received", staff = false, version = 1) =>
    f.request.post(path(id, staff) + "/receipts").auth(actor.token, { type: "bearer" })
      .send({ cursor, kind, ...(staff ? { expectedAssignmentVersion: version } : {}) });
  const page = (actor: Actor, id: string, staff = false, query = "") => f.request.get(path(id, staff)
    + `/messages?${staff ? "expectedAssignmentVersion=1&" : ""}${query}`).auth(actor.token, { type: "bearer" });
  async function enquiry() {
    const customer = await f.actor(null), operator = await f.actor();
    const id = (await f.request.post("/api/v1/vehicle-history/requests").auth(customer.token, { type: "bearer" })
      .send({ attemptKey: randomUUID() }).expect(201)).body.id as string;
    await f.request.post(path(id, true) + "/claim").auth(operator.token, { type: "bearer" })
      .send({ expectedAssignmentVersion: 0 }).expect(201);
    return { customer, operator, id };
  }
  const send = async (actor: Actor, id: string) => (await f.request.post(path(id) + "/messages")
    .auth(actor.token, { type: "bearer" }).send({ clientMessageId: randomUUID(), text: "Salam" }).expect(201)).body;

  it("keeps saved and fetched text Sent until explicit other-participant received and visible-thread read acknowledgements", async () => {
    const { customer, operator, id } = await enquiry();
    const first = await send(customer, id), second = await send(customer, id);
    expect((await receipts(customer, id).expect(200)).body).toEqual({ items: [] });
    await ack(operator, id, second.id, "received", true).expect(400);
    await page(operator, id, true).expect(200);
    expect((await receipts(customer, id).expect(200)).body).toEqual({ items: [] });
    await ack(operator, id, second.id, "read", true).expect(400);
    const received = await ack(operator, id, second.id, "received", true).expect(201);
    expect(received.body).toEqual({ participantId: operator.user.id, assignmentVersion: 1, receivedOrder: "2", readOrder: "0" });
    await ack(operator, id, second.id, "read", true).expect(201);
    await ack(operator, id, first.id, "received", true).expect(201);
    await ack(operator, id, first.id, "read", true).expect(201);
    expect((await receipts(customer, id).expect(200)).body).toEqual({ items: [
      { participantId: operator.user.id, assignmentVersion: 1, receivedOrder: "2", readOrder: "2" },
    ] });
  });

  it("serializes more concurrent acknowledgements than the operation pool and never regresses reversed progress", async () => {
    const { customer, operator, id } = await enquiry();
    const first = await send(customer, id), second = await send(customer, id), third = await send(customer, id);
    await page(operator, id, true).expect(200);
    f.concurrent(2);
    const mixed = await Promise.all([ack(operator, id, third.id, "read", true), ack(operator, id, second.id, "received", true)]
      .map((request) => request.set("x-history-concurrency", "mixed")));
    expect(mixed.map((response) => response.status)).toEqual([400, 201]);
    f.concurrent(12);
    const results = await Promise.all(Array.from({ length: 12 }, (_, i) => ack(operator, id,
      [third.id, first.id, second.id][i % 3], "received", true).set("x-history-concurrency", "ack")));
    expect(results.map((result) => result.status)).toEqual(Array(12).fill(201));
    f.concurrent(12);
    const reads = await Promise.all(Array.from({ length: 12 }, (_, i) => ack(operator, id,
      [second.id, third.id, first.id][i % 3], "read", true).set("x-history-concurrency", "read")));
    expect(reads.map((result) => result.status)).toEqual(Array(12).fill(201));
    expect((await receipts(customer, id).expect(200)).body.items).toEqual([
      { participantId: operator.user.id, assignmentVersion: 1, receivedOrder: "3", readOrder: "3" },
    ]);
    const future = await send(customer, id);
    await ack(operator, id, future.id, "received", true).expect(400);
    await ack(operator, id, future.id, "read", true).expect(400);
  });

  it("requires contiguous fetched pages in the actual session and excludes the lookahead and foreign cursors", async () => {
    const { customer, operator, id } = await enquiry();
    const first = await send(customer, id), second = await send(customer, id), third = await send(customer, id);
    await page(operator, id, true, "limit=1").expect(200);
    await ack(operator, id, second.id, "received", true).expect(400);
    await page(operator, id, true, `cursor=${second.id}`).expect(200); // Skips message 2.
    await ack(operator, id, third.id, "received", true).expect(400);
    await page(operator, id, true, `cursor=${first.id}&limit=1`).expect(200);
    await ack(operator, id, second.id, "received", true).expect(201);
    await ack(operator, id, third.id, "received", true).expect(400);
    await page(operator, id, true, `cursor=${second.id}`).expect(200);
    await ack(operator, id, third.id, "received", true).expect(201);
    const other = await enquiry(), foreign = await send(other.customer, other.id);
    const missing = (await ack(operator, id, randomUUID(), "received", true).expect(400)).body;
    expect((await ack(operator, id, foreign.id, "received", true).expect(400)).body).toEqual(missing);
    await ack(other.customer, id, first.id).expect(403);
    const session = await f.prisma.session.create({ data: { userId: operator.user.id, refreshTokenHash: randomUUID(),
      expiresAt: new Date(Date.now() + 600_000), adminTotpExpiresAt: new Date(Date.now() + 600_000) } });
    const renewed = { ...operator, token: f.app.get(JwtService).sign({ sub: operator.user.id, sid: session.id }) };
    await ack(renewed, id, third.id, "read", true).expect(400);
    await page(renewed, id, true).expect(200);
    await ack(renewed, id, third.id, "read", true).expect(201);
    await f.prisma.session.delete({ where: { id: operator.session.id } });
    await ack(operator, id, third.id, "read", true).expect(403);
    expect((await receipts(customer, id).expect(200)).body.items[0].readOrder).toBe("3");
  });

  it("keeps requester receipts without staff authority and attributes past staff facts to their exact participant/version", async () => {
    const { customer, operator, id } = await enquiry(), next = await f.actor();
    const original = await send(customer, id);
    await page(operator, id, true).expect(200);
    await ack(operator, id, original.id, "received", true).expect(201);
    await ack(operator, id, original.id, "read", true).expect(201);
    await f.prisma.session.update({ where: { id: customer.session.id }, data: { adminTotpExpiresAt: null } });
    await page(customer, id).expect(200);
    expect((await ack(customer, id, original.id).expect(201)).body).toEqual({
      participantId: customer.user.id, assignmentVersion: 0, receivedOrder: "1", readOrder: "0",
    });
    // Synthetic assignment mutation proves future handover attribution, not a new handover operation.
    await f.prisma.vehicleHistoryRequest.update({ where: { id }, data: { assignedOperatorId: next.user.id, assignmentVersion: 2 } });
    await ack(operator, id, original.id, "read", true).expect(403);
    await receipts(operator, id, true).expect(403);
    await ack(next, id, original.id, "received", true, 1).expect(409);
    await ack(next, id, original.id, "received", true, 2).expect(400);
    const facts = (await receipts(next, id, true, 2).expect(200)).body.items;
    expect(facts).toHaveLength(2);
    expect(facts).toContainEqual({ participantId: operator.user.id, assignmentVersion: 1, receivedOrder: "1", readOrder: "1" });
    expect(facts.some((fact: { participantId: string }) => fact.participantId === next.user.id)).toBe(false);
    await f.request.get(path(id, true) + "/messages?expectedAssignmentVersion=2").auth(next.token, { type: "bearer" }).expect(200);
    await ack(next, id, original.id, "received", true, 2).expect(201);
    expect((await receipts(customer, id).expect(200)).body.items).toContainEqual({
      participantId: next.user.id, assignmentVersion: 2, receivedOrder: "1", readOrder: "0",
    });
  });

  it.each(["assignment", "version", "grant", "session", "requester-session"])("rechecks %s after waiting for the real request lock", async (state) => {
    const { customer, operator, id } = await enquiry(), next = await f.actor();
    const actor = state === "requester-session" ? customer : operator, staff = state !== "requester-session";
    const original = await send(customer, id);
    await page(actor, id, staff).expect(200);
    let pending: Promise<unknown> | undefined;
    await f.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM vehicle_history_requests WHERE id = ${id} FOR UPDATE`;
      pending = Promise.all([ack(actor, id, original.id, "received", staff).expect(state === "version" ? 409 : 403),
        receipts(actor, id, staff).expect(state === "version" ? 409 : 403)]);
      await eventually(async () => {
        const [row] = await f.prisma.$queryRaw<{ waiting: boolean }[]>`SELECT EXISTS (SELECT 1 FROM pg_stat_activity
          WHERE datname = current_database() AND wait_event_type = 'Lock' AND query LIKE '%vehicle_history_requests%') AS waiting`;
        return row?.waiting ? true : null;
      }, { timeoutMs: 2500, intervalMs: 20, description: "receipt authority blocked behind request writer" });
      if (state === "assignment" || state === "version") await tx.vehicleHistoryRequest.update({ where: { id }, data: {
        assignedOperatorId: state === "assignment" ? next.user.id : operator.user.id, assignmentVersion: 2,
      } });
      else if (state === "grant") await tx.staffGrant.update({ where: { userId_purpose: { userId: operator.user.id, purpose: "vehicle_history" } }, data: { revokedAt: new Date() } });
      else await tx.session.delete({ where: { id: actor.session.id } });
    });
    await pending;
    expect((await receipts(staff ? customer : operator, id, !staff).expect(200)).body).toEqual({ items: [] });
  });

  it.each(["tk", "ru", "en"])("bounds malformed/forged acknowledgements with private localized %s failures", async (locale) => {
    const { customer, operator, id } = await enquiry(), message = await send(customer, id);
    for (const staff of [false, true]) {
      const actor = staff ? operator : customer, url = path(id, staff) + "/receipts";
      await f.request.get(url).expect(401);
      await f.request.post(url).expect(401);
      const valid = { cursor: message.id, kind: "received", ...(staff ? { expectedAssignmentVersion: 1 } : {}) };
      for (const input of [{ ...valid, participantId: actor.user.id }, { ...valid, sessionId: actor.session.id },
        { ...valid, purpose: "support" }, { ...valid, objectId: id }, { ...valid, receivedOrder: "999" },
        { ...valid, cursor: "999" }, { ...valid, kind: "delivered" }]) {
        const invalid = await f.request.post(url).auth(actor.token, { type: "bearer" }).set("Accept-Language", locale).send(input).expect(400);
        expect(invalid.headers["cache-control"]).toBe("private, no-store");
        expect(invalid.body.message).toContain({ tk: "barlaň", ru: "Проверьте", en: "Check" }[locale]!);
      }
      const malformed = await f.request.post(url).auth(actor.token, { type: "bearer" })
        .set("Content-Type", "application/json").send("{").expect(400);
      expect(malformed.headers["cache-control"]).toBe("private, no-store");
      expect(malformed.body.code).toBe("HISTORY_MESSAGE_INVALID");
      await f.request.get(url + "?participantId=forged").auth(actor.token, { type: "bearer" }).expect(400);
      await f.request.post(url + "?purpose=forged").auth(actor.token, { type: "bearer" }).send(valid).expect(400);
    }
  });

  it("rolls back failed receipt persistence and safely retries without leaking database details", async () => {
    const { customer, operator, id } = await enquiry(), message = await send(customer, id);
    await page(operator, id, true).expect(200);
    await f.prisma.$executeRawUnsafe(`CREATE FUNCTION vh1219_fault() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'private receipt sentinel'; END $$`);
    await f.prisma.$executeRawUnsafe(`CREATE TRIGGER vh1219_fault BEFORE INSERT ON service_receipts
      FOR EACH ROW EXECUTE FUNCTION vh1219_fault()`);
    try {
      const failed = await ack(operator, id, message.id, "received", true).expect(503);
      expect(failed.headers["cache-control"]).toBe("private, no-store");
      expect(failed.body.code).toBe("HISTORY_MESSAGE_UNAVAILABLE");
      expect(JSON.stringify(failed.body)).not.toContain("sentinel");
      expect((await receipts(customer, id).expect(200)).body).toEqual({ items: [] });
    } finally {
      await f.prisma.$executeRawUnsafe("DROP TRIGGER vh1219_fault ON service_receipts");
      await f.prisma.$executeRawUnsafe("DROP FUNCTION vh1219_fault()");
    }
    await ack(operator, id, message.id, "received", true).expect(201);
    expect((await receipts(customer, id).expect(200)).body.items[0].receivedOrder).toBe("1");
  });
});
