import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { historyFixture } from "../../../../test/helpers/historyFixture";
import { eventually } from "../../../../test/helpers/eventually";
import { HISTORY_CLOCK, HISTORY_WAITING_LIFECYCLE, type HistoryClock, type HistoryWaitingLifecycle } from "../vehicle-history.public";

describe("Manual reminder arbitration through real pending HTTP locks", () => {
  let f: Awaited<ReturnType<typeof historyFixture>>;
  beforeAll(async () => { f = await historyFixture(); });
  afterAll(async () => { await f?.close(); });
  async function assigned() {
    const customer = await f.actor(null), operator = await f.actor();
    const id = (await f.request.post("/api/v1/vehicle-history/requests").auth(customer.token, { type: "bearer" })
      .send({ attemptKey: randomUUID() }).expect(201)).body.id as string;
    const path = `/api/v1/vehicle-history/requests/${id}`, staff = `/api/v1/vehicle-history/operator/requests/${id}`;
    await f.request.post(staff + "/claim").auth(operator.token, { type: "bearer" }).send({ expectedAssignmentVersion: 0 }).expect(201);
    const actor = { claims: { sub: operator.user.id, sid: operator.session.id }, operator: true, expectedAssignmentVersion: 1 };
    f.app.get<HistoryClock>(HISTORY_CLOCK).now = () => new Date("2026-11-14T00:00:00Z");
    await f.app.get<HistoryWaitingLifecycle>(HISTORY_WAITING_LIFECYCLE).change(actor, id,
      { sourceId: "wait", sourceVersion: 1, expectedVersion: 0, action: "begin", reason: "quote_choice" });
    f.app.get<HistoryClock>(HISTORY_CLOCK).now = () => new Date("2026-11-15T00:00:00Z");
    const send = () => f.request.post(staff + "/reminder").auth(operator.token, { type: "bearer" })
      .send({ expectedAssignmentVersion: 1, expectedWaitingVersion: 1, clientMessageId: randomUUID() });
    const read = () => f.request.get(path + "/reminder").auth(customer.token, { type: "bearer" }).expect(200);
    return { customer, operator, id, path, staff, actor, send, read };
  }
  async function waiting(query: string) {
    await eventually(async () => {
      const [row] = await f.prisma.$queryRaw<{ waiting: boolean }[]>`SELECT EXISTS (SELECT 1 FROM pg_stat_activity
        WHERE datname = current_database() AND wait_event_type = 'Lock' AND query LIKE ${query} AND pid <> pg_backend_pid()) AS waiting`;
      return row?.waiting ? true : null;
    }, { timeoutMs: 2500, intervalMs: 20, description: "actual pending reminder competitor at its database fence" });
  }

  it.each(["reply", "stop"].flatMap((action) => [false, true].map((reminderFirst) => [action, reminderFirst] as const)))
    ("orders %s versus reminder with reminder first=%s, preserving the sole original or preventing append", async (action, reminderFirst) => {
    const { customer, id, path, send, read } = await assigned();
    let first: Promise<Awaited<ReturnType<typeof send>>> | undefined, second: typeof first;
    const compete = () => action === "reply" ? f.request.post(path + "/messages").auth(customer.token, { type: "bearer" })
      .send({ clientMessageId: randomUUID(), text: "My answer" }) : f.request.post(path + "/reminder/stop").auth(customer.token, { type: "bearer" })
      .send({ expectedWaitingVersion: reminderFirst ? 3 : 1 });
    await f.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM service_conversations WHERE "objectId" = ${id} FOR UPDATE`;
      first = (reminderFirst ? send() : compete()).then((response) => response);
      await waiting("%service_conversations%");
      second = (reminderFirst ? compete() : send()).then((response) => response);
      await waiting("%vehicle_history_requests%");
    }, { timeout: 10_000 });
    const firstResponse = await first!, secondResponse = await second!;
    expect(firstResponse.status).toBe(201);
    expect(secondResponse.status).toBe(reminderFirst ? 201 : 409);
    const state = (await read()).body;
    expect(state).toMatchObject({ used: reminderFirst, stopped: action === "stop", reason: null, since: null,
      version: reminderFirst ? 4 : 2 });
    if (reminderFirst) {
      expect(state.outcome).toEqual(firstResponse.body.outcome);
      expect((await send().expect(201)).body).toEqual(state);
    } else expect(state.outcome).toBeNull();
    const transcript = (await f.request.get(path + "/messages").auth(customer.token, { type: "bearer" }).expect(200)).body.items;
    expect(transcript).toEqual([...(reminderFirst ? [state.outcome] : []), ...(action === "reply" ? [reminderFirst ? secondResponse.body : firstResponse.body] : [])]);
  });

  it.each(["assignment", "version"])("refuses a pending send after committed %s changes", async (change) => {
    const { customer, operator, id, send, read } = await assigned();
    let pending: Promise<Awaited<ReturnType<typeof send>>> | undefined;
    await f.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM vehicle_history_requests WHERE id = ${id} FOR UPDATE`;
      pending = send().then((response) => response);
      await waiting("%vehicle_history_requests%");
      await tx.vehicleHistoryRequest.update({ where: { id }, data: { assignmentVersion: 2,
        assignedOperatorId: change === "assignment" ? customer.user.id : operator.user.id } });
    }, { timeout: 10_000 });
    expect((await pending!).status).toBe(change === "assignment" ? 403 : 409);
    expect((await read()).body).toMatchObject({ version: 1, used: false, outcome: null });
  });

  it("refuses a pending old waiting version after a real lifecycle renewal commits first", async () => {
    const { id, actor, send, read } = await assigned();
    let renewed: Promise<unknown> | undefined, pending: Promise<Awaited<ReturnType<typeof send>>> | undefined;
    await f.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM service_conversations WHERE "objectId" = ${id} FOR UPDATE`;
      renewed = f.app.get<HistoryWaitingLifecycle>(HISTORY_WAITING_LIFECYCLE).change(actor, id,
        { sourceId: "new-wait", sourceVersion: 2, expectedVersion: 1, action: "begin", reason: "quote_choice" });
      await waiting("%service_conversations%");
      pending = send().then((response) => response);
      await waiting("%vehicle_history_requests%");
    }, { timeout: 10_000 });
    await renewed;
    expect((await pending!).status).toBe(409);
    expect((await read()).body).toMatchObject({ version: 2, since: "2026-11-15T00:00:00.000Z", used: false, outcome: null, ineligibleReason: "too_early" });
  });
});
