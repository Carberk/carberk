import "reflect-metadata";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { historyFixture } from "../../../../test/helpers/historyFixture";
import { eventually } from "../../../../test/helpers/eventually";
import { HISTORY_CLOCK, type HistoryClock } from "../vehicle-history.public";

const requests = "/api/v1/vehicle-history/requests";
const operatorRequests = "/api/v1/vehicle-history/operator/requests";

describe("Current operator private notes over listening HTTP", () => {
  let f: Awaited<ReturnType<typeof historyFixture>>;
  beforeAll(async () => { f = await historyFixture(); });
  afterAll(async () => { await f?.close(); });

  it("joins public exchange, private-note retries, explicit receipts and one stopped reminder without changing the waiting clock", async () => {
    const customer = await f.actor(null), operator = await f.actor();
    const id = (await f.request.post(requests).auth(customer.token, { type: "bearer" })
      .send({ attemptKey: randomUUID() }).expect(201)).body.id as string;
    const customerPath = `${requests}/${id}`, staffPath = `${operatorRequests}/${id}`;
    await f.request.post(staffPath + "/claim").auth(operator.token, { type: "bearer" })
      .send({ expectedAssignmentVersion: 0 }).expect(201);
    const question = { clientMessageId: randomUUID(), text: "Question without a VIN — Döwlet / Ответ" };
    const sent = (await f.request.post(customerPath + "/messages").auth(customer.token, { type: "bearer" }).send(question).expect(201)).body;
    expect((await f.request.post(customerPath + "/messages").auth(customer.token, { type: "bearer" }).send(question).expect(201)).body).toEqual(sent);
    const reply = (await f.request.post(staffPath + "/messages").auth(operator.token, { type: "bearer" })
      .send({ clientMessageId: randomUUID(), text: "Please send the VIN when available", expectedAssignmentVersion: 1 }).expect(201)).body;
    f.app.get<HistoryClock>(HISTORY_CLOCK).now = () => new Date(new Date(reply.createdAt).getTime() + 86_400_000);
    const readReminder = () => f.request.get(customerPath + "/reminder").auth(customer.token, { type: "bearer" }).expect(200);
    const waiting = (await readReminder()).body;
    expect(waiting).toMatchObject({ eligible: true, reason: "customer_answer", since: reply.createdAt, used: false });
    const note = { clientNoteId: randomUUID(), text: "PRIVATE: staff assessment only", expectedAssignmentVersion: 1 };
    const saved = (await f.request.post(staffPath + "/notes").auth(operator.token, { type: "bearer" }).send(note).expect(201)).body;
    expect((await f.request.post(staffPath + "/notes").auth(operator.token, { type: "bearer" }).send(note).expect(201)).body).toEqual(saved);
    expect((await readReminder()).body).toEqual(waiting);
    expect((await f.request.get(staffPath + "/notes?expectedAssignmentVersion=1").auth(operator.token, { type: "bearer" }).expect(200)).body.items).toEqual([saved]);
    const reminder = { expectedAssignmentVersion: 1, expectedWaitingVersion: waiting.version, clientMessageId: randomUUID() };
    const reminded = (await f.request.post(staffPath + "/reminder").auth(operator.token, { type: "bearer" }).send(reminder).expect(201)).body;
    expect((await f.request.post(staffPath + "/reminder").auth(operator.token, { type: "bearer" }).send(reminder).expect(201)).body).toEqual(reminded);
    const page = (await f.request.get(customerPath + "/messages").auth(customer.token, { type: "bearer" }).expect(200)).body;
    expect(page).toEqual({ items: [sent, reply, reminded.outcome], nextCursor: null });
    expect(JSON.stringify(page)).not.toContain(note.text);
    expect((await f.request.get(customerPath + "/receipts").auth(customer.token, { type: "bearer" }).expect(200)).body).toEqual({ items: [] });
    for (const kind of ["received", "read"]) await f.request.post(customerPath + "/receipts").auth(customer.token, { type: "bearer" })
      .send({ cursor: reminded.outcome.id, kind }).expect(201);
    const receipts = (await f.request.get(staffPath + "/receipts?expectedAssignmentVersion=1").auth(operator.token, { type: "bearer" }).expect(200)).body;
    expect(receipts.items).toContainEqual({ participantId: customer.user.id, assignmentVersion: 0, receivedOrder: "3", readOrder: "3" });
    const stopped = (await f.request.post(customerPath + "/reminder/stop").auth(customer.token, { type: "bearer" })
      .send({ expectedWaitingVersion: reminded.version }).expect(201)).body;
    expect(stopped).toMatchObject({ stopped: true, ineligibleReason: "stopped", outcome: reminded.outcome });
    await f.request.post(staffPath + "/notes").auth(operator.token, { type: "bearer" }).send(note).expect(201);
    expect((await readReminder()).body).toEqual(stopped);
    const retried = (await f.request.post(staffPath + "/reminder").auth(operator.token, { type: "bearer" }).send(reminder).expect(201)).body;
    expect(retried).toEqual(stopped);
  });

  it("keeps an attributed note outside the customer's public conversation", async () => {
    const customer = await f.actor(null);
    const operator = await f.actor();
    const id = (await f.request.post(requests).auth(customer.token, { type: "bearer" })
      .send({ attemptKey: randomUUID() }).expect(201)).body.id as string;
    await f.request.post(`${operatorRequests}/${id}/claim`).auth(operator.token, { type: "bearer" })
      .send({ expectedAssignmentVersion: 0 }).expect(201);

    const clientNoteId = randomUUID();
    const text = "Internal note ·  Önki barlag\nNext step";
    const saved = (await f.request.post(`${operatorRequests}/${id}/notes`).auth(operator.token, { type: "bearer" })
      .send({ clientNoteId, text, expectedAssignmentVersion: 1 }).expect(201)).body;
    expect(saved).toEqual({ id: expect.any(String), clientNoteId, text, createdAt: expect.any(String),
      author: { id: operator.user.id, displayName: "Ayna", nameNumber: 1213 } });

    const notes = await f.request.get(`${operatorRequests}/${id}/notes?expectedAssignmentVersion=1`)
      .auth(operator.token, { type: "bearer" }).expect(200);
    expect(notes.headers["cache-control"]).toBe("private, no-store");
    expect(notes.body).toEqual({ items: [saved], nextCursor: null });

    const messages = await f.request.get(`${requests}/${id}/messages`).auth(customer.token, { type: "bearer" }).expect(200);
    expect(messages.body).toEqual({ items: [], nextCursor: null });
    const customerList = await f.request.get(requests).auth(customer.token, { type: "bearer" }).expect(200);
    const customerDetail = await f.request.get(`${requests}/${id}`).auth(customer.token, { type: "bearer" }).expect(200);
    const operatorQueue = await f.request.get(operatorRequests).auth(operator.token, { type: "bearer" }).expect(200);
    const operatorDetail = await f.request.get(`${operatorRequests}/${id}`).auth(operator.token, { type: "bearer" }).expect(200);
    for (const publicResponse of [messages, customerList, customerDetail, operatorQueue, operatorDetail]) {
      expect(JSON.stringify(publicResponse.body)).not.toContain(text);
      expect(JSON.stringify(publicResponse.body)).not.toContain(saved.id);
    }
    await f.request.get(`${requests}/${id}/notes`).auth(customer.token, { type: "bearer" }).expect(404);
  });

  it("returns one note for simultaneous same-intent retries and refuses changed text", async () => {
    const customer = await f.actor(null);
    const operator = await f.actor();
    const id = (await f.request.post(requests).auth(customer.token, { type: "bearer" })
      .send({ attemptKey: randomUUID() }).expect(201)).body.id as string;
    await f.request.post(`${operatorRequests}/${id}/claim`).auth(operator.token, { type: "bearer" })
      .send({ expectedAssignmentVersion: 0 }).expect(201);
    const clientNoteId = randomUUID();
    const path = `${operatorRequests}/${id}/notes`;
    const write = (text: string) => f.request.post(path).auth(operator.token, { type: "bearer" })
      .send({ clientNoteId, text, expectedAssignmentVersion: 1 });

    f.concurrent(8);
    const attempts = await Promise.all(Array.from({ length: 8 }, () => write("Exact \n bellik").set("x-history-concurrency", "note")));
    expect(attempts.map((result) => result.status)).toEqual(Array(8).fill(201));
    expect(new Set(attempts.map((result) => result.body.id)).size).toBe(1);
    const page = await f.request.get(`${path}?expectedAssignmentVersion=1`).auth(operator.token, { type: "bearer" }).expect(200);
    expect(page.body.items).toEqual([attempts[0]?.body]);

    const conflict = await write("Changed bellik").expect(409);
    expect(conflict.body.code).toBe("HISTORY_NOTE_CONFLICT");
    expect(Object.keys(conflict.body).sort()).toEqual(["code", "message", "statusCode"]);
    expect(JSON.stringify(conflict.body)).not.toContain("Changed bellik");
  });

  it("refuses a former assignee and lets the current assignee page attributed notes", async () => {
    const customer = await f.actor(null);
    const first = await f.actor();
    const next = await f.actor();
    const id = (await f.request.post(requests).auth(customer.token, { type: "bearer" })
      .send({ attemptKey: randomUUID() }).expect(201)).body.id as string;
    const path = `${operatorRequests}/${id}/notes`;
    await f.request.post(`${operatorRequests}/${id}/claim`).auth(first.token, { type: "bearer" })
      .send({ expectedAssignmentVersion: 0 }).expect(201);
    const firstKey = randomUUID();
    const original = (await f.request.post(path).auth(first.token, { type: "bearer" })
      .send({ clientNoteId: firstKey, text: "Only current staff", expectedAssignmentVersion: 1 }).expect(201)).body;
    await f.prisma.vehicleHistoryRequest.update({ where: { id },
      data: { assignedOperatorId: next.user.id, assignmentVersion: 2 } });

    await f.request.get(`${path}?expectedAssignmentVersion=1`).auth(first.token, { type: "bearer" }).expect(403);
    await f.request.post(path).auth(first.token, { type: "bearer" })
      .send({ clientNoteId: firstKey, text: "Only current staff", expectedAssignmentVersion: 1 }).expect(403);
    await f.request.get(`${path}?expectedAssignmentVersion=1`).auth(next.token, { type: "bearer" }).expect(409);
    const nextKey = randomUUID();
    const later = (await f.request.post(path).auth(next.token, { type: "bearer" })
      .send({ clientNoteId: nextKey, text: "Inherited context", expectedAssignmentVersion: 2 }).expect(201)).body;
    expect(later.author.id).toBe(next.user.id);
    expect((await f.request.get(`${path}?expectedAssignmentVersion=2&limit=1`).auth(next.token, { type: "bearer" }).expect(200)).body)
      .toEqual({ items: [original], nextCursor: original.id });
    expect((await f.request.get(`${path}?expectedAssignmentVersion=2&cursor=${original.id}`)
      .auth(next.token, { type: "bearer" }).expect(200)).body)
      .toEqual({ items: [later], nextCursor: null });
  });

  it("keeps known notes private from customers, unassigned staff and unrelated purposes", async () => {
    const customer = await f.actor(null);
    const operator = await f.actor();
    const id = (await f.request.post(requests).auth(customer.token, { type: "bearer" })
      .send({ attemptKey: randomUUID() }).expect(201)).body.id as string;
    const path = `${operatorRequests}/${id}/notes`;
    await f.request.post(`${operatorRequests}/${id}/claim`).auth(operator.token, { type: "bearer" })
      .send({ expectedAssignmentVersion: 0 }).expect(201);
    const clientNoteId = randomUUID();
    const text = "PRIVATE NOTE BODY";
    const original = (await f.request.post(path).auth(operator.token, { type: "bearer" })
      .send({ clientNoteId, text, expectedAssignmentVersion: 1 }).expect(201)).body;
    const intruders = [
      ["customer", customer], ["unassigned staff", await f.actor()],
      ["marketplace Admin", await f.actor(null, "admin")], ["seller", await f.actor(null, "seller")],
      ["evidence grant", await f.actor("vehicle_history_payment_evidence")],
      ["founder-management grant", await f.actor("vehicle_history_staff_management")],
    ] as const;
    for (const [name, actor] of intruders) {
      const attempts = [
        f.request.get(`${path}?expectedAssignmentVersion=1`).auth(actor.token, { type: "bearer" }),
        f.request.get(`${path}?expectedAssignmentVersion=1&cursor=${original.id}`).auth(actor.token, { type: "bearer" }),
        f.request.post(path).auth(actor.token, { type: "bearer" })
          .send({ clientNoteId, text, expectedAssignmentVersion: 1 }),
      ];
      for (const attempt of attempts) {
        const denial = await attempt.expect(403);
        expect(denial.headers["cache-control"], name).toBe("private, no-store");
        expect(Object.keys(denial.body).sort(), name).toEqual(["code", "message", "statusCode"]);
        expect(JSON.stringify(denial.body), name).not.toContain(text);
      }
    }
    expect((await f.request.get(`${path}?expectedAssignmentVersion=1`).auth(operator.token, { type: "bearer" }).expect(200)).body.items)
      .toEqual([original]);
  });

  it.each(["revoked-session", "expired-session", "expired-totp", "revoked-grant", "suspended"])(
    "removes current operator note access after %s", async (state) => {
      const customer = await f.actor(null);
      const operator = await f.actor();
      const id = (await f.request.post(requests).auth(customer.token, { type: "bearer" })
        .send({ attemptKey: randomUUID() }).expect(201)).body.id as string;
      const path = `${operatorRequests}/${id}/notes`;
      await f.request.post(`${operatorRequests}/${id}/claim`).auth(operator.token, { type: "bearer" })
        .send({ expectedAssignmentVersion: 0 }).expect(201);
      const clientNoteId = randomUUID();
      await f.request.post(path).auth(operator.token, { type: "bearer" })
        .send({ clientNoteId, text: "REVOKED PRIVATE NOTE", expectedAssignmentVersion: 1 }).expect(201);
      if (state === "revoked-session") await f.prisma.session.delete({ where: { id: operator.session.id } });
      else if (state === "expired-session" || state === "expired-totp") await f.prisma.session.update({
        where: { id: operator.session.id }, data: state === "expired-session"
          ? { expiresAt: new Date(0) } : { adminTotpExpiresAt: new Date(0) },
      });
      else if (state === "revoked-grant") await f.prisma.staffGrant.update({
        where: { userId_purpose: { userId: operator.user.id, purpose: "vehicle_history" } },
        data: { revokedAt: new Date() },
      });
      else await f.prisma.user.update({ where: { id: operator.user.id }, data: { suspendedAt: new Date() } });

      for (const pending of [
        f.request.get(`${path}?expectedAssignmentVersion=1`).auth(operator.token, { type: "bearer" }),
        f.request.post(path).auth(operator.token, { type: "bearer" })
          .send({ clientNoteId, text: "REVOKED PRIVATE NOTE", expectedAssignmentVersion: 1 }),
      ]) {
        const denial = await pending.expect(403);
        expect(denial.headers["cache-control"]).toBe("private, no-store");
        expect(JSON.stringify(denial.body)).not.toContain("REVOKED PRIVATE NOTE");
      }
    });

  it("rechecks assignment after a real request-lock wait before reading or retrying a note", async () => {
    const customer = await f.actor(null);
    const first = await f.actor();
    const next = await f.actor();
    const id = (await f.request.post(requests).auth(customer.token, { type: "bearer" })
      .send({ attemptKey: randomUUID() }).expect(201)).body.id as string;
    const path = `${operatorRequests}/${id}/notes`;
    await f.request.post(`${operatorRequests}/${id}/claim`).auth(first.token, { type: "bearer" })
      .send({ expectedAssignmentVersion: 0 }).expect(201);
    const clientNoteId = randomUUID();
    const note = (await f.request.post(path).auth(first.token, { type: "bearer" })
      .send({ clientNoteId, text: "Never leak after handover", expectedAssignmentVersion: 1 }).expect(201)).body;
    let pending: Promise<unknown> | undefined;
    await f.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM vehicle_history_requests WHERE id = ${id} FOR UPDATE`;
      pending = Promise.all([
        f.request.get(`${path}?expectedAssignmentVersion=1&cursor=${note.id}`)
          .auth(first.token, { type: "bearer" }).expect(403),
        f.request.post(path).auth(first.token, { type: "bearer" })
          .send({ clientNoteId, text: "Never leak after handover", expectedAssignmentVersion: 1 }).expect(403),
      ]);
      await eventually(async () => {
        const [row] = await f.prisma.$queryRaw<{ waiting: boolean }[]>`SELECT EXISTS (
          SELECT 1 FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'
          AND query LIKE '%vehicle_history_requests%' AND pid <> pg_backend_pid()
        ) AS waiting`;
        return row?.waiting ? true : null;
      }, { timeoutMs: 2500, intervalMs: 20, description: "note operation waiting behind the request writer" });
      await tx.vehicleHistoryRequest.update({ where: { id },
        data: { assignedOperatorId: next.user.id, assignmentVersion: 2 } });
    }, { timeout: 10_000 });
    await pending;
    expect((await f.request.get(`${path}?expectedAssignmentVersion=2`).auth(next.token, { type: "bearer" }).expect(200)).body.items)
      .toEqual([note]);
  });

  it("refuses malformed note intents and foreign page cursors without disclosing note text", async () => {
    const operator = await f.actor();
    const firstCustomer = await f.actor(null);
    const secondCustomer = await f.actor(null);
    async function claimed(customer: typeof firstCustomer) {
      const id = (await f.request.post(requests).auth(customer.token, { type: "bearer" })
        .send({ attemptKey: randomUUID() }).expect(201)).body.id as string;
      await f.request.post(`${operatorRequests}/${id}/claim`).auth(operator.token, { type: "bearer" })
        .send({ expectedAssignmentVersion: 0 }).expect(201);
      return `${operatorRequests}/${id}/notes`;
    }
    const first = await claimed(firstCustomer), second = await claimed(secondCustomer);
    const original = (await f.request.post(second).auth(operator.token, { type: "bearer" })
      .send({ clientNoteId: randomUUID(), text: "FOREIGN PRIVATE NOTE", expectedAssignmentVersion: 1 }).expect(201)).body;
    const invalid = [
      f.request.get(`${first}?expectedAssignmentVersion=1&cursor=${original.id}`).auth(operator.token, { type: "bearer" }),
      f.request.get(`${first}?expectedAssignmentVersion=1&cursor=${randomUUID()}`).auth(operator.token, { type: "bearer" }),
      f.request.get(`${first}?expectedAssignmentVersion=1&limit=51`).auth(operator.token, { type: "bearer" }),
      f.request.post(first).auth(operator.token, { type: "bearer" })
        .send({ clientNoteId: randomUUID(), text: "  ", expectedAssignmentVersion: 1 }),
      f.request.post(first).auth(operator.token, { type: "bearer" })
        .send({ clientNoteId: randomUUID(), text: "valid", expectedAssignmentVersion: 1, kind: "public" }),
    ];
    for (const attempt of invalid) {
      const refusal = await attempt.expect(400);
      expect(refusal.headers["cache-control"]).toBe("private, no-store");
      expect(JSON.stringify(refusal.body)).not.toContain("FOREIGN PRIVATE NOTE");
    }
    expect((await f.request.get(`${first}?expectedAssignmentVersion=1`).auth(operator.token, { type: "bearer" }).expect(200)).body)
      .toEqual({ items: [], nextCursor: null });
  });
});
