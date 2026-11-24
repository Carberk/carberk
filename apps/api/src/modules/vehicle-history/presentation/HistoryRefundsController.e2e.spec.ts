import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eventually } from "../../../../test/helpers/eventually";
import { HistoryRecoveryWorker } from "../application/HistoryRecoveryWorker";
import { historyFixture } from "../../../../test/helpers/historyFixture";
import { HISTORY_CLOCK, type HistoryClock } from "../vehicle-history.public";

const root = "/api/v1/vehicle-history";
const original = { deliveryFrom: "2026-11-21T06:00:00.000Z", deliveryBy: "2026-11-21T07:00:00.000Z" };
const receivedAt = "2026-11-21T05:00:00.000Z";
const paymentReference = "SYNTHETIC-VH18-PAYMENT";

describe("scoped Vehicle History refunds over HTTP and Postgres", () => {
  let f: Awaited<ReturnType<typeof historyFixture>>;
  let now: Date;

  beforeEach(async () => {
    f = await historyFixture();
    now = new Date(receivedAt);
    f.app.get<HistoryClock>(HISTORY_CLOCK).now = () => now;
    f.config.set("VEHICLE_HISTORY_SYNTHETIC_WALLET", "SYNTHETIC-VH18-NO-TRANSFER");
    f.config.set("VEHICLE_HISTORY_SYNTHETIC_DAILY_STAFF_SLOTS", 2);
  });

  afterEach(async () => { await f?.close(); });

  async function paidCase(late = true) {
    const customer = await f.actor(null), operator = await f.actor();
    const id = (await f.request.post(root + "/requests").auth(customer.token, { type: "bearer" })
      .send({ attemptKey: randomUUID() }).expect(201)).body.id as string;
    const staff = root + "/operator/requests/" + id;
    await f.request.post(staff + "/claim").auth(operator.token, { type: "bearer" }).send({ expectedAssignmentVersion: 0 }).expect(201);
    await f.request.post(staff + "/offer").auth(operator.token, { type: "bearer" })
      .send({ kind: "check", vin: "DEMA0000000000001", expectedVersion: 0, expectedAssignmentVersion: 1 }).expect(201);
    const offer = (await f.request.post(staff + "/offer").auth(operator.token, { type: "bearer" }).send({
      kind: "propose", format: "both", expectedVersion: 1, expectedAssignmentVersion: 1, ...original,
    }).expect(201)).body;
    const customerOrder = root + "/requests/" + id + "/order";
    const orderId = (await f.request.post(customerOrder).auth(customer.token, { type: "bearer" })
      .send({ offer }).expect(201)).body.order.id as string;
    if (late) now = new Date(original.deliveryBy);
    await f.request.post(staff + "/payment-verification").auth(operator.token, { type: "bearer" }).send({
      attemptKey: randomUUID(), orderId, expectedAssignmentVersion: 1, expectedPaymentVersion: 0, walletChecked: true,
      outcome: "matched", amountMinor: 12550, reference: paymentReference, evidence: "Synthetic private ledger note",
      evidenceFileId: null, receivedAt,
    }).expect(201);
    if (late) await f.request.post(staff + "/replacement-booking").auth(operator.token, { type: "bearer" }).send({
      kind: "no_window", attemptKey: randomUUID(), expectedAssignmentVersion: 1, expectedVersion: 0, orderId,
    }).expect(201);
    return {
      id, orderId, customer, operator, staff, refund: root + "/refunds/" + id,
      read: () => f.request.get(customerOrder).auth(customer.token, { type: "bearer" }),
    };
  }

  it("shows a non-assigned founder only the verified facts for the exact pending order", async () => {
    const e = await paidCase();
    await f.request.get(e.refund).auth(e.operator.token, { type: "bearer" }).expect(403);
    const founder = await f.actor("vehicle_history_refund_decision");
    const response = await f.request.get(e.refund).auth(founder.token, { type: "bearer" }).expect(200);
    expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(response.body).toEqual({
      order: { id: e.orderId, vin: "DEMA0000000000001", priceMinor: 10000, format: "both", window: original },
      payment: { amountMinor: 12550, receivedAt, confirmedAt: original.deliveryBy, reference: paymentReference },
      refund: { status: "pending", amountMinor: 12550, originalPromiseBy: original.deliveryBy, agreedRecoveryDeadline: null },
      reason: "no_window", failure: null,
    });
    await f.request.get(e.staff + "/order?expectedAssignmentVersion=1").auth(founder.token, { type: "bearer" }).expect(403);
  });

  it("serializes competing approvals and execution records and gives the purchaser three distinct states", async () => {
    const e = await paidCase();
    const founder = await f.actor("vehicle_history_refund_decision");
    const other = await f.actor("vehicle_history_refund_decision");
    const executor = await f.actor("vehicle_history_refund_execution");
    const generic = await f.actor(null, "admin");
    const approve = { kind: "approve", orderId: e.orderId, attemptKey: randomUUID(), reason: "Window unavailable", amountMinor: 12550 };
    const complete = { kind: "execute", orderId: e.orderId, attemptKey: randomUUID(), reason: "Matched external return",
      amountMinor: 12550, externalReference: "SYNTHETIC-VH18-RETURN", returned: true };
    const post = (actor: typeof founder, body: object, execution = false) => f.request
      .post(e.refund + (execution ? "/execution" : "")).auth(actor.token, { type: "bearer" }).send(body);
    const refundFacts = { amountMinor: 12550, originalPromiseBy: original.deliveryBy, agreedRecoveryDeadline: null };
    expect((await e.read().expect(200)).body.refund).toEqual({ ...refundFacts, status: "pending" });
    await post(executor, complete, true).expect(409);
    await post(generic, approve).expect(403);
    await post(executor, approve).expect(403);
    await post(founder, complete, true).expect(403);
    await post(founder, { ...approve, orderId: randomUUID() }).expect(409);
    await post(founder, { ...approve, amountMinor: 10000 }).expect(409);

    f.concurrent(2);
    const founders = [founder, other];
    const approvals = await Promise.all(founders.map((actor) => post(actor, approve).set("x-history-concurrency", "yes")));
    expect(approvals.map(({ status }) => status).sort()).toEqual([201, 409]);
    const approvedBy = approvals[0]?.status === 201 ? founder : other;
    await post(approvedBy, approve).expect(201);
    expect((await e.read().expect(200)).body.refund).toEqual({ ...refundFacts, status: "approved", approvedAt: original.deliveryBy });
    await post(executor, { ...complete, returned: false }, true).expect(400);

    now = new Date("2026-11-21T07:30:00.000Z");
    f.concurrent(2);
    const completions = [complete, { ...complete, attemptKey: randomUUID(), externalReference: "SYNTHETIC-VH18-RETURN-OTHER" }];
    const results = await Promise.all(completions.map((input) => post(executor, input, true).set("x-history-concurrency", "yes")));
    expect(results.map(({ status }) => status).sort()).toEqual([201, 409]);
    const recorded = results[0]?.status === 201 ? completions[0]! : completions[1]!;
    await post(executor, recorded, true).expect(201);
    expect((await e.read().expect(200)).body.refund).toEqual({ ...refundFacts, status: "completed", approvedAt: original.deliveryBy,
      recordedAt: "2026-11-21T07:30:00.000Z", externalReference: recorded.externalReference });
    const events = await f.prisma.historyRefundEvent.findMany({ where: { requestId: e.id }, orderBy: { recordedAt: "asc" } });
    expect(events).toMatchObject([
      { kind: "approve", actorId: approvedBy.user.id, paymentVersion: 1, input: approve, amountMinor: 12550, externalReference: null },
      { kind: "execute", actorId: executor.user.id, paymentVersion: 1, input: recorded, amountMinor: 12550, externalReference: recorded.externalReference },
    ]);
    const purchaser = root + "/requests/" + e.id;
    await f.request.delete(purchaser + "/order").auth(e.customer.token, { type: "bearer" }).expect(404);
    await f.request.post(purchaser + "/correction").auth(e.customer.token, { type: "bearer" })
      .send({ kind: "request", attemptKey: randomUUID(), expectedVersion: 0, vin: "DEMA0000000000002" }).expect(409);
  });

  it("denies stale grant, purchaser lifecycle and elevation after waiting on the real request lock", async () => {
    const e = await paidCase();
    const founder = await f.actor("vehicle_history_refund_decision");
    const approve = { kind: "approve", orderId: e.orderId, attemptKey: randomUUID(), reason: "No window", amountMinor: 12550 };
    let inFlight: Promise<number> | undefined;
    await f.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM vehicle_history_requests WHERE id = ${e.id} FOR UPDATE`;
      const [blocker] = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
      inFlight = f.request.post(e.refund).auth(founder.token, { type: "bearer" }).send(approve).then((response) => response.status);
      await eventually(async () => {
        const [row] = await f.prisma.$queryRaw<{ blocked: boolean }[]>`SELECT EXISTS (SELECT 1 FROM pg_stat_activity
          WHERE datname = current_database() AND query LIKE '%FROM vehicle_history_requests%FOR NO KEY UPDATE%'
          AND ${blocker?.pid} = ANY(pg_blocking_pids(pid))) AS blocked`;
        return row?.blocked ? true : null;
      }, { timeoutMs: 2500, intervalMs: 20, description: "refund waiting on request" });
      await tx.staffGrant.update({ where: { userId_purpose: { userId: founder.user.id, purpose: "vehicle_history_refund_decision" } },
        data: { revokedAt: new Date() } });
    });
    expect(await inFlight).toBe(403);
    expect(await f.prisma.historyRefundEvent.count({ where: { requestId: e.id } })).toBe(0);

    const other = await f.actor("vehicle_history_refund_decision");
    await f.prisma.user.update({ where: { id: e.customer.user.id }, data: { deletionScheduledAt: new Date() } });
    await f.request.get(e.refund).auth(other.token, { type: "bearer" }).expect(404);
    await f.prisma.user.update({ where: { id: e.customer.user.id }, data: { deletionScheduledAt: null } });
    await f.prisma.session.update({ where: { id: other.session.id }, data: { adminTotpExpiresAt: new Date(0) } });
    await f.request.get(e.refund).auth(other.token, { type: "bearer" }).expect(403);
  });

  it("retains the original promise and agreed deadline after the worker escalates the second miss", async () => {
    const e = await paidCase(false);
    const founder = await f.actor("vehicle_history_refund_decision");
    const executor = await f.actor("vehicle_history_refund_execution");
    await f.request.get(e.refund).auth(founder.token, { type: "bearer" }).expect(404);
    const worker = f.app.get(HistoryRecoveryWorker);
    now = new Date(original.deliveryBy);
    await worker.execute();
    const offered = (await e.read().expect(200)).body.recovery;
    const deadline = "2026-11-21T08:00:00.000Z";
    expect(offered).toMatchObject({ status: "offered", offeredDeadline: deadline });
    await f.request.post(root + "/requests/" + e.id + "/recovery").auth(e.customer.token, { type: "bearer" }).send({
      kind: "accept", expectedVersion: offered.version, orderId: e.orderId, attemptKey: randomUUID(), deadline, format: "both",
    }).expect(201);
    now = new Date(deadline);
    await worker.execute();
    const event = await f.prisma.historyRecoveryEvent.findFirst({ where: { requestId: e.id }, orderBy: { version: "desc" } });
    expect(event?.state).toMatchObject({ status: "refund_decision_pending", pendingReason: "recovery_missed" });
    const read = () => f.request.get(e.refund).auth(founder.token, { type: "bearer" });
    const dates = { originalPromiseBy: original.deliveryBy, agreedRecoveryDeadline: deadline };
    expect((await read().expect(200)).body).toMatchObject({ reason: "recovery_missed", refund: { status: "pending", ...dates } });
    const data = { orderId: e.orderId, amountMinor: 12550, reason: "Agreed recovery deadline missed" };
    await f.request.post(e.refund).auth(founder.token, { type: "bearer" }).send({ ...data, kind: "approve", attemptKey: randomUUID() }).expect(201);
    expect((await e.read().expect(200)).body.refund).toMatchObject({ status: "approved", ...dates });
    await f.request.post(e.refund + "/execution").auth(executor.token, { type: "bearer" }).send({
      ...data, kind: "execute", attemptKey: randomUUID(), returned: true, externalReference: "SYNTHETIC-VH18-MISSED-RETURN",
    }).expect(201);
    expect((await e.read().expect(200)).body.refund).toMatchObject({ status: "completed", ...dates });
    expect((await read().expect(200)).body.refund).toMatchObject({ status: "completed", ...dates });
  });
});
