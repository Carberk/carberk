import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { historyFixture } from "../../../../test/helpers/historyFixture";
import { eventually } from "../../../../test/helpers/eventually";
import { HISTORY_CLOCK, type HistoryClock } from "../vehicle-history.public";
import sharp from "sharp";

const root = "/api/v1/vehicle-history";
describe("independent manual wallet verification over HTTP/Postgres", () => {
  let f: Awaited<ReturnType<typeof historyFixture>>;
  let now: Date;
  beforeEach(async () => {
    f = await historyFixture();
    now = new Date("2026-11-21T05:00:00.000Z");
    f.app.get<HistoryClock>(HISTORY_CLOCK).now = () => now;
    f.config.set("VEHICLE_HISTORY_SYNTHETIC_WALLET", "SYNTHETIC-VH09-NO-TRANSFER");
    f.config.set("VEHICLE_HISTORY_SYNTHETIC_DAILY_STAFF_SLOTS", 1);
  });
  afterEach(async () => { await f?.close(); });
  async function accepted(
    times = { deliveryFrom: "2026-11-21T06:00:00.000Z", deliveryBy: "2026-11-21T07:00:00.000Z" },
    assignee?: Awaited<ReturnType<typeof f.actor>>,
  ) {
    const customer = await f.actor(null), operator = assignee ?? await f.actor();
    const id = (await f.request.post(`${root}/requests`).auth(customer.token, { type: "bearer" })
      .send({ attemptKey: randomUUID() }).expect(201)).body.id as string;
    const staff = `${root}/operator/requests/${id}`;
    await f.request.post(`${staff}/claim`).auth(operator.token, { type: "bearer" }).send({ expectedAssignmentVersion: 0 }).expect(201);
    await f.request.post(`${staff}/offer`).auth(operator.token, { type: "bearer" })
      .send({ kind: "check", vin: "DEMA0000000000001", expectedVersion: 0, expectedAssignmentVersion: 1 }).expect(201);
    const offer = (await f.request.post(`${staff}/offer`).auth(operator.token, { type: "bearer" }).send({ kind: "propose", format: "both",
      expectedVersion: 1, expectedAssignmentVersion: 1, ...times }).expect(201)).body;
    const order = (await f.request.post(`${root}/requests/${id}/order`).auth(customer.token, { type: "bearer" }).send({ offer }).expect(201)).body.order;
    const input = { attemptKey: randomUUID(), orderId: order.id, expectedAssignmentVersion: 1, expectedPaymentVersion: 0,
      walletChecked: true, outcome: "matched", amountMinor: 10000, reference: "SYNTHETIC-VH09-REFERENCE", evidence: "Synthetic receiving-wallet ledger checked independently",
      evidenceFileId: null, receivedAt: "2026-11-21T05:00:00.000Z" };
    const verify = (body: object = input, token = operator.token) => f.request.post(`${staff}/payment-verification`).auth(token, { type: "bearer" }).send(body);
    const read = () => f.request.get(`${root}/requests/${id}/order`).auth(customer.token, { type: "bearer" });
    const checks = () => f.request.get(`${staff}/payment-verification?expectedAssignmentVersion=1`).auth(operator.token, { type: "bearer" });
    return { id, staff, customer, operator, input, order, verify, read, checks };
  }
  it("shows only the operator's committed paid work in confirmation order", async () => {
    f.config.set("VEHICLE_HISTORY_SYNTHETIC_DAILY_STAFF_SLOTS", 4);
    const operator = await f.actor();
    const createdFirst = await accepted(undefined, operator);
    const confirmedFirst = await accepted({ deliveryFrom: "2026-11-21T07:00:00.000Z", deliveryBy: "2026-11-21T08:00:00.000Z" }, operator);
    const late = await accepted({ deliveryFrom: "2026-11-21T08:00:00.000Z", deliveryBy: "2026-11-21T09:00:00.000Z" }, operator);
    const other = await accepted({ deliveryFrom: "2026-11-21T09:00:00.000Z", deliveryBy: "2026-11-21T10:00:00.000Z" });
    await other.verify().expect(201);
    await confirmedFirst.verify().expect(201);
    now = new Date("2026-11-21T05:10:00.000Z");
    await createdFirst.verify().expect(201);
    now = new Date(late.order.holdExpiresAt);
    await late.verify().expect(201);

    const response = await f.request.get(`${root}/operator/requests?filter=mine&queue=paid`)
      .auth(operator.token, { type: "bearer" }).expect(200);
    expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(response.body.items.map(({ id, status }: { id: string; status: string }) => ({ id, status }))).toEqual([
      { id: confirmedFirst.id, status: "paid" }, { id: createdFirst.id, status: "paid" },
    ]);
    expect(response.body.queueCounts).toEqual({ unassigned: 0, mine: 1, paid: 2 });
    const enquiries = await f.request.get(`${root}/operator/requests?filter=mine&queue=enquiry`)
      .auth(operator.token, { type: "bearer" }).expect(200);
    expect(enquiries.body.items.map((item: { id: string }) => item.id)).toEqual([late.id]);
  });
  it("offers a spare second report to the oldest confirmed order first", async () => {
    f.config.set("VEHICLE_HISTORY_SYNTHETIC_DAILY_STAFF_SLOTS", 4);
    f.config.set("VEHICLE_HISTORY_SYNTHETIC_PROVIDER_BUDGETS", {
      Carfax: { allowance: 4, resetUtc: "00:00", externalUsage: {} },
      AutoCheck: { allowance: 1, resetUtc: "00:00", externalUsage: {} },
    });
    const newerPayment = await accepted({ deliveryFrom: "2026-11-21T07:00:00.000Z", deliveryBy: "2026-11-21T08:00:00.000Z" });
    const olderPayment = await accepted();
    await olderPayment.verify().expect(201);
    now = new Date("2026-11-21T05:10:00.000Z");
    await newerPayment.verify().expect(201);
    const plan = async (entry: typeof olderPayment) => (await f.request.get(`${entry.staff}/order?expectedAssignmentVersion=1`)
      .auth(entry.operator.token, { type: "bearer" }).expect(200)).body.reportPlan;
    expect(await plan(olderPayment)).toEqual({ primary: "Carfax", second: "AutoCheck" });
    expect(await plan(newerPayment)).toEqual({ primary: "Carfax", second: null });
    expect((await olderPayment.read().expect(200)).body).not.toHaveProperty("reportPlan");
    now = new Date("2026-11-21T07:00:00.000Z");
    expect(await plan(olderPayment)).toEqual({ primary: "Carfax", second: null });
    expect(await plan(newerPayment)).toEqual({ primary: "Carfax", second: "AutoCheck" });
  });
  it("records one independent check, confirms full funds once and preserves the accepted snapshot", async () => {
    const e = await accepted();
    await e.verify({ ...e.input, walletChecked: false }).expect(400);
    const first = (await e.verify().expect(201)).body;
    expect(first.checks).toMatchObject([{ input: e.input, actorId: e.operator.user.id, checkedAt: "2026-11-21T05:00:00.000Z",
      confirmedAt: "2026-11-21T05:00:00.000Z", bookingCommitted: true, version: 1 }]);
    now = new Date("2026-11-21T08:00:00.000Z");
    expect((await e.verify().expect(201)).body).toEqual(first);
    const state = (await e.read().expect(200)).body;
    expect(state).toMatchObject({ order: e.order, status: "payment_confirmed", wallet: null, payment: {
      outcome: "matched", amountMinor: 10000, receivedAt: "2026-11-21T05:00:00.000Z", confirmedAt: "2026-11-21T05:00:00.000Z", bookingCommitted: true } });
    expect(JSON.stringify(state)).not.toMatch(/SYNTHETIC-VH09-REFERENCE|ledger|actorId|evidence/);
    await e.verify({ ...e.input, attemptKey: randomUUID(), expectedPaymentVersion: 1 }).expect(409);
    expect((await e.checks().expect(200)).body.checks).toHaveLength(1);
  });
  it.each(["partial", "unmatched", "uncertain"])("keeps %s checks under review and requires a fresh independent full match", async (outcome) => {
    const e = await accepted();
    const review = { ...e.input, outcome, amountMinor: outcome === "partial" ? 6000 : 0 };
    const recorded = (await e.verify(review).expect(201)).body;
    expect(recorded).toMatchObject({ version: 1, checks: [{ input: review, confirmedAt: null, bookingCommitted: false }] });
    expect((await e.read().expect(200)).body).toMatchObject({ status: "payment_review", wallet: null,
      payment: { outcome, amountMinor: review.amountMinor, confirmedAt: null, bookingCommitted: false } });
    await e.verify({ ...e.input, attemptKey: randomUUID() }).expect(409);
    await e.verify({ ...e.input, attemptKey: randomUUID(), expectedPaymentVersion: 1 }).expect(201);
    expect((await e.checks().expect(200)).body.checks).toHaveLength(2);
    expect((await e.read().expect(200)).body.status).toBe("payment_confirmed");
  });
  it("arbitrates simultaneous independent confirmations and refuses changed retry facts", async () => {
    const e = await accepted();
    f.concurrent(2);
    const result = await Promise.all([e.verify().set("x-history-concurrency", "yes"),
      e.verify({ ...e.input, attemptKey: randomUUID() }).set("x-history-concurrency", "yes")]);
    expect(result.map((r) => r.status).sort()).toEqual([201, 409]);
    const saved = (await e.checks().expect(200)).body.checks[0];
    await e.verify(saved.input).expect(201);
    await e.verify({ ...saved.input, reference: "SYNTHETIC-CHANGED" }).expect(409);
    expect((await e.checks().expect(200)).body.checks).toHaveLength(1);
  });
  it("records full late funds without restoring the expired hold", async () => {
    const e = await accepted();
    now = new Date(e.order.holdExpiresAt);
    const result = (await e.verify().expect(201)).body;
    expect(result.checks[0]).toMatchObject({ confirmedAt: now.toISOString(), bookingCommitted: false });
    expect((await e.read().expect(200)).body).toMatchObject({ status: "payment_received_no_hold", order: e.order, wallet: null });
    const other = await accepted({ deliveryFrom: "2026-11-21T08:00:00.000Z", deliveryBy: "2026-11-21T09:00:00.000Z" });
    expect((await other.read().expect(200)).body.status).toBe("awaiting_synthetic_payment");
  });
  it("uses the post-wait clock for verification versus expiry", async () => {
    const e = await accepted();
    let pending: Promise<unknown> | undefined;
    await f.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(1181, 7)::text`;
      pending = e.verify().expect(201).then((r) => r);
      await eventually(async () => {
        const [row] = await f.prisma.$queryRaw<{ waiting: boolean }[]>`SELECT EXISTS (
          SELECT 1 FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'
          AND query LIKE '%pg_advisory_xact_lock%' AND pid <> pg_backend_pid()) AS waiting`;
        return row?.waiting ? true : null;
      }, { timeoutMs: 2500, intervalMs: 20, description: "verification waiting on capacity" });
      now = new Date(e.order.holdExpiresAt);
    }, { timeout: 10000 });
    await pending;
    expect((await e.read().expect(200)).body).toMatchObject({ status: "payment_received_no_hold", payment: { bookingCommitted: false } });
  });
  it("keeps one outcome across handover and refuses previous assignees including known retries", async () => {
    const e = await accepted(), next = await f.actor();
    f.concurrent(2);
    const [verification, handover] = await Promise.all([e.verify().set("x-history-concurrency", "yes"),
      f.request.post(`${e.staff}/handover`).auth(e.operator.token, { type: "bearer" }).set("x-history-concurrency", "yes")
        .send({ expectedAssignmentVersion: 1, targetOperatorId: next.user.id })]);
    expect(handover.status).toBe(201);
    expect([201, 403]).toContain(verification.status);
    await e.verify().expect(403);
    const path = `${e.staff}/payment-verification`;
    const state = (await f.request.get(`${path}?expectedAssignmentVersion=2`).auth(next.token, { type: "bearer" }).expect(200)).body;
    expect(state.checks).toHaveLength(verification.status === 201 ? 1 : 0);
    if (!state.checks.length) await e.verify({ ...e.input, expectedAssignmentVersion: 2 }, next.token).expect(201);
    expect((await e.read().expect(200)).body.status).toBe("payment_confirmed");
  });
  it.each(["session", "grant", "suspension", "totp"])("refuses %s authority lost during the request wait without recording funds", async (kind) => {
    const e = await accepted();
    let pending: Promise<unknown> | undefined;
    await f.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM vehicle_history_requests WHERE id = ${e.id} FOR UPDATE`;
      pending = e.verify().expect(403).then((r) => r);
      await eventually(async () => {
        const [row] = await f.prisma.$queryRaw<{ waiting: boolean }[]>`SELECT EXISTS (
          SELECT 1 FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'
          AND query LIKE '%vehicle_history_requests%' AND pid <> pg_backend_pid()) AS waiting`;
        return row?.waiting ? true : null;
      }, { timeoutMs: 2500, intervalMs: 20, description: "verification waiting on request" });
      if (kind === "session") await tx.session.delete({ where: { id: e.operator.session.id } });
      if (kind === "grant") await tx.staffGrant.updateMany({ where: { userId: e.operator.user.id }, data: { revokedAt: new Date() } });
      if (kind === "suspension") await tx.user.update({ where: { id: e.operator.user.id }, data: { suspendedAt: new Date() } });
      if (kind === "totp") await tx.session.update({ where: { id: e.operator.session.id }, data: { adminTotpExpiresAt: new Date(0) } });
    }, { timeout: 10000 });
    await pending;
    expect((await e.read().expect(200)).body.status).toBe("awaiting_synthetic_payment");
  });
  it("refuses ordinary customers, unrelated admins, wrong-purpose grants, wrong objects and future receipt times", async () => {
    const e = await accepted();
    for (const actor of [e.customer, await f.actor(null, "admin"), await f.actor("vehicle_history_payment_evidence")]) await e.verify(e.input, actor.token).expect(403);
    await e.verify({ ...e.input, orderId: randomUUID() }).expect(409);
    await e.verify({ ...e.input, evidenceFileId: randomUUID() }).expect(400);
    await e.verify({ ...e.input, receivedAt: "2026-11-21T05:01:00.000Z" }).expect(400);
    await e.verify({ ...e.input, outcome: "partial", amountMinor: 10000 }).expect(400);
    for (const environment of ["staging", "production"]) {
      f.config.set("APP_ENV", environment);
      await e.verify().expect(403);
    }
  });
  it("keeps a submitted screenshot unverified and binds optional evidence to this exact submitted order", async () => {
    const e = await accepted();
    const bytes = await sharp({ create: { width: 64, height: 64, channels: 3, background: "white" } }).png().toBuffer();
    const path = `${root}/requests/${e.id}/payment-proofs`;
    const file = (await f.request.post(path).auth(e.customer.token, { type: "bearer" })
      .send({ orderId: e.id, attemptKey: randomUUID(), contentType: "image/png", sizeBytes: bytes.length }).expect(201)).body;
    await e.verify({ ...e.input, evidenceFileId: file.id }).expect(400);
    await f.request.put(`${path}/${file.id}/content`).auth(e.customer.token, { type: "bearer" }).set("Content-Type", "image/png").send(bytes).expect(200);
    await f.request.post(`${path}/${file.id}/submit`).auth(e.customer.token, { type: "bearer" }).send({ orderId: e.id }).expect(201);
    expect((await e.read().expect(200)).body).toMatchObject({ status: "receipt_submitted", order: e.order, wallet: null,
      payment: { outcome: "receipt_submitted", confirmedAt: null, bookingCommitted: false } });
    expect((await e.checks().expect(200)).body.checks).toEqual([]);
    await e.verify({ ...e.input, evidenceFileId: file.id }).expect(201);
    expect((await e.checks().expect(200)).body.checks[0].input.evidenceFileId).toBe(file.id);
    const read = await f.request.get(`${e.staff}/payment-proofs/${file.id}/content?expectedAssignmentVersion=1`).auth(e.operator.token, { type: "bearer" }).expect(200);
    expect(Buffer.from(read.body.dataBase64, "base64")).toEqual(bytes);
  });
  it("keeps confirmed paid capacity after the original two-hour hold expires", async () => {
    const e = await accepted();
    await e.verify().expect(201);
    now = new Date(e.order.holdExpiresAt);
    const other = await f.actor(null), operator = await f.actor();
    const id = (await f.request.post(`${root}/requests`).auth(other.token, { type: "bearer" }).send({ attemptKey: randomUUID() }).expect(201)).body.id;
    const path = `${root}/operator/requests/${id}`;
    await f.request.post(`${path}/claim`).auth(operator.token, { type: "bearer" }).send({ expectedAssignmentVersion: 0 }).expect(201);
    await f.request.post(`${path}/offer`).auth(operator.token, { type: "bearer" }).send({ kind: "check", vin: "DEMA0000000000001", expectedVersion: 0, expectedAssignmentVersion: 1 }).expect(201);
    const blocked = await f.request.post(`${path}/offer`).auth(operator.token, { type: "bearer" }).send({ kind: "propose", expectedVersion: 1, expectedAssignmentVersion: 1,
      format: "pdf", deliveryFrom: "2026-11-21T08:00:00.000Z", deliveryBy: "2026-11-21T09:00:00.000Z" }).expect(409);
    expect(blocked.body.code).toBe("HISTORY_ORDER_CAPACITY");
    expect((await e.read().expect(200)).body.status).toBe("payment_confirmed");
  });
  it("refuses deleted requester authority after a row wait and refuses after-hours confirmation", async () => {
    const e = await accepted();
    now = new Date("2026-11-21T15:00:00.000Z");
    const closed = await e.verify().expect(409);
    expect(closed.body.code).toBe("HISTORY_PAYMENT_CLOSED");
    now = new Date("2026-11-21T05:00:00.000Z");
    let pending: Promise<unknown> | undefined;
    await f.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM vehicle_history_requests WHERE id = ${e.id} FOR UPDATE`;
      pending = e.verify().expect(403).then((r) => r);
      await eventually(async () => {
        const [row] = await f.prisma.$queryRaw<{ waiting: boolean }[]>`SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE datname = current_database()
          AND wait_event_type = 'Lock' AND query LIKE '%vehicle_history_requests%' AND pid <> pg_backend_pid()) AS waiting`;
        return row?.waiting ? true : null;
      }, { timeoutMs: 2500, intervalMs: 20, description: "check waiting before requester deletion" });
      await tx.user.update({ where: { id: e.customer.user.id }, data: { deletionScheduledAt: new Date() } });
    }, { timeout: 10000 });
    await pending;
    await e.checks().expect(403);
    await f.prisma.user.update({ where: { id: e.customer.user.id }, data: { deletionScheduledAt: null } });
    expect((await e.checks().expect(200)).body.checks).toEqual([]);
  });
  it.each(["tk", "ru", "en"])("keeps malformed %s verification private and actionable", async (locale) => {
    const e = await accepted();
    const response = await f.request.post(`${e.staff}/payment-verification`).auth(e.operator.token, { type: "bearer" })
      .set("Accept-Language", locale).set("Content-Type", "application/json").send('{"amountMinor":').expect(400);
    expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(response.body.code).toBe("HISTORY_PAYMENT_INVALID");
    expect(response.body.message.length).toBeGreaterThan(40);
    expect(JSON.stringify(response.body)).not.toMatch(/SYNTHETIC|DEMA/);
  });
});
