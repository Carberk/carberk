import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { historyFixture } from "../../../../test/helpers/historyFixture";
import { eventually } from "../../../../test/helpers/eventually";
import { HISTORY_CLOCK, type HistoryClock } from "../vehicle-history.public";

const requests = "/api/v1/vehicle-history/requests";
const staff = "/api/v1/vehicle-history/operator/requests";
const window = { deliveryFrom: "2026-11-21T06:00:00.000Z", deliveryBy: "2026-11-21T07:00:00.000Z" };

describe("explicit customer acceptance and capacity over HTTP/Postgres", () => {
  let f: Awaited<ReturnType<typeof historyFixture>>;
  let now: Date;
  beforeEach(async () => {
    f = await historyFixture();
    now = new Date("2026-11-21T05:00:00.000Z");
    f.app.get<HistoryClock>(HISTORY_CLOCK).now = () => now;
    f.config.set("VEHICLE_HISTORY_SYNTHETIC_WALLET", "SYNTHETIC-VH07-NO-TRANSFER");
    f.config.set("VEHICLE_HISTORY_SYNTHETIC_DAILY_STAFF_SLOTS", 1);
    f.config.set("VEHICLE_HISTORY_SYNTHETIC_MORNING_SLOTS", 1);
  });
  afterEach(async () => { await f?.close(); });
  async function enquiry(format = "pdf", times = window) {
    const customer = await f.actor(null), operator = await f.actor();
    const id = (await f.request.post(requests).auth(customer.token, { type: "bearer" })
      .send({ attemptKey: randomUUID(), sourceListingId: randomUUID() }).expect(201)).body.id as string;
    await f.request.post(`${staff}/${id}/claim`).auth(operator.token, { type: "bearer" }).send({ expectedAssignmentVersion: 0 }).expect(201);
    const write = (body: object) => f.request.post(`${staff}/${id}/offer`).auth(operator.token, { type: "bearer" }).send(body);
    await write({ kind: "check", vin: "DEMA0000000000001", expectedVersion: 0, expectedAssignmentVersion: 1 }).expect(201);
    const offer = (await write({ kind: "propose", expectedVersion: 1, expectedAssignmentVersion: 1, format, ...times }).expect(201)).body;
    const accept = (body: object = { offer }) => f.request.post(`${requests}/${id}/order`).auth(customer.token, { type: "bearer" }).send(body);
    const read = () => f.request.get(`${requests}/${id}/order`).auth(customer.token, { type: "bearer" });
    return { id, customer, operator, offer, accept, read, write };
  }
  it("requires exact explicit acceptance, creates one immutable snapshot and releases the expired slot", async () => {
    const e = await enquiry("both");
    expect((await e.read().expect(200)).body.order).toBeNull();
    await e.accept({ offer: { ...e.offer, proposal: { ...e.offer.proposal, format: "link" } } }).expect(409);
    const accepted = await e.accept().expect(201);
    expect(accepted.headers["cache-control"]).toBe("private, no-store");
    expect(accepted.body).toMatchObject({ status: "awaiting_synthetic_payment", wallet: "SYNTHETIC-VH07-NO-TRANSFER", collectionEnabled: false,
      order: { acceptedOffer: e.offer, acceptedAt: "2026-11-21T05:00:00.000Z", holdExpiresAt: "2026-11-21T07:00:00.000Z", deliveryDay: "2026-11-21" } });
    expect((await e.accept().expect(201)).body).toEqual(accepted.body);
    await e.write({ kind: "check", vin: "DEMA0000000000006", expectedVersion: 2, expectedAssignmentVersion: 1 }).expect(409);
    const other = await enquiry("pdf", { deliveryFrom: "2026-11-21T08:00:00.000Z", deliveryBy: "2026-11-21T09:00:00.000Z" });
    await other.accept().expect(409);
    now = new Date("2026-11-21T07:00:00.000Z");
    const expired = (await e.read().expect(200)).body;
    expect(expired).toMatchObject({ status: "hold_expired", wallet: null, order: accepted.body.order });
    expect((await other.accept().expect(201)).body.status).toBe("awaiting_synthetic_payment");
  });
  it.each(["pdf", "link", "both"])("preserves the exact %s promise, provider dates, terms and wallet across reconnect and configuration changes", async (format) => {
    const e = await enquiry(format);
    const result = (await e.accept().expect(201)).body;
    f.config.set("VEHICLE_HISTORY_SYNTHETIC_WALLET", "SYNTHETIC-CHANGED-NO-TRANSFER");
    expect((await e.read().expect(200)).body).toEqual(result);
    const reconnect = await f.prisma.session.create({ data: { userId: e.customer.user.id, refreshTokenHash: randomUUID(), expiresAt: new Date(Date.now() + 600000) } });
    const jwt = f.app.get((await import("@nestjs/jwt")).JwtService).sign({ sub: e.customer.user.id, sid: reconnect.id });
    expect((await f.request.get(`${requests}/${e.id}/order`).auth(jwt, { type: "bearer" }).expect(200)).body.order).toEqual(result.order);
    await expect(f.prisma.historyOrder.update({ where: { requestId: e.id }, data: { wallet: "SYNTHETIC-TAMPER" } })).rejects.toThrow();
    expect((await e.read().expect(200)).body.order).toEqual(result.order);
  });
  it("arbitrates competing requests and duplicate acceptance atomically", async () => {
    const a = await enquiry(), b = await enquiry();
    f.concurrent(3);
    const results = await Promise.all([a.accept().set("x-history-concurrency", "yes"), a.accept().set("x-history-concurrency", "yes"), b.accept().set("x-history-concurrency", "yes")]);
    const states = [(await a.read().expect(200)).body, (await b.read().expect(200)).body];
    expect(states.filter((state) => state.order !== null)).toHaveLength(1);
    const winner = states[0].order ? a : b;
    const replay = (await winner.accept().expect(201)).body;
    expect(results.filter((result) => result.status === 201).every((result) => result.body.order.id === replay.order.id)).toBe(true);
    expect(results.some((result) => result.status === 409)).toBe(true);
  });
  it("requires renewed acceptance for missing, stale or mutated offer facts", async () => {
    const e = await enquiry();
    for (const proposal of [{ ...e.offer.proposal, format: undefined }, { ...e.offer.proposal, priceTmt: 99 }]) {
      await e.accept({ offer: { ...e.offer, proposal } }).expect(400);
    }
    await e.accept({ offer: { ...e.offer, version: 1 } }).expect(409);
    await e.accept({ offer: { ...e.offer, preflight: { status: "available", providers: [{ name: "Carfax", originalReportDate: null }] } } }).expect(409);
    await e.write({ kind: "propose", expectedVersion: 2, expectedAssignmentVersion: 1, format: "link", ...window }).expect(201);
    await e.accept().expect(409);
    expect((await e.read().expect(200)).body.order).toBeNull();
    now = new Date("2026-11-21T06:00:00.000Z");
    await e.accept({ offer: { ...e.offer, version: 3, proposal: { ...e.offer.proposal, format: "link" } } }).expect(409);
  });
  it("bounds tomorrow to demonstrated 09:00–10:00 capacity and refuses farther days", async () => {
    const late = await enquiry("pdf", { deliveryFrom: "2026-11-22T05:00:00.000Z", deliveryBy: "2026-11-22T06:00:00.000Z" });
    await late.accept().expect(409);
    const first = await enquiry("pdf", { deliveryFrom: "2026-11-22T04:00:00.000Z", deliveryBy: "2026-11-22T05:00:00.000Z" });
    const second = await enquiry("both", { deliveryFrom: "2026-11-22T04:00:00.000Z", deliveryBy: "2026-11-22T05:00:00.000Z" });
    f.config.set("VEHICLE_HISTORY_SYNTHETIC_DAILY_STAFF_SLOTS", 11);
    expect((await first.accept().expect(201)).body.order.deliveryDay).toBe("2026-11-22");
    await second.accept().expect(409);
    now = new Date("2026-11-24T05:00:00.000Z");
    await second.accept().expect(409);
  });
  it("allows feasible near-close work without a universal 19:00 cutoff and refuses overlapping staff windows", async () => {
    now = new Date("2026-11-21T14:15:00.000Z");
    f.config.set("VEHICLE_HISTORY_SYNTHETIC_DAILY_STAFF_SLOTS", 11);
    const a = await enquiry("pdf", { deliveryFrom: "2026-11-21T14:30:00.000Z", deliveryBy: "2026-11-21T15:00:00.000Z" });
    const b = await enquiry("link", { deliveryFrom: "2026-11-21T14:40:00.000Z", deliveryBy: "2026-11-21T15:00:00.000Z" });
    await a.accept().expect(201);
    await b.accept().expect(409);
  });
  it("fails closed without configured test capacity or a synthetic wallet and never collects on staging or production", async () => {
    const e = await enquiry();
    f.config.set("VEHICLE_HISTORY_SYNTHETIC_DAILY_STAFF_SLOTS", 0);
    await e.accept().expect(409);
    f.config.set("VEHICLE_HISTORY_SYNTHETIC_DAILY_STAFF_SLOTS", 1);
    f.config.set("VEHICLE_HISTORY_SYNTHETIC_WALLET", "+99365000000");
    await e.accept().expect(503);
    expect((await e.read().expect(200)).body.order).toBeNull();
    for (const environment of ["staging", "production"]) {
      f.config.set("APP_ENV", environment);
      await e.accept().expect(403); await e.read().expect(403);
    }
  });
  it("retains customer authority while refusing unrelated buyers, marketplace admins, wrong purposes and previous assignees", async () => {
    const e = await enquiry(), stranger = await f.actor(null), admin = await f.actor(null, "admin"), wrong = await f.actor("vehicle_history_payment_evidence");
    for (const actor of [stranger, admin, wrong]) {
      await f.request.get(`${requests}/${e.id}/order`).auth(actor.token, { type: "bearer" }).expect(403);
      await f.request.get(`${staff}/${e.id}/order?expectedAssignmentVersion=1`).auth(actor.token, { type: "bearer" }).expect(403);
    }
    const order = (await e.accept().expect(201)).body;
    const next = await f.actor();
    await f.request.post(`${staff}/${e.id}/handover`).auth(e.operator.token, { type: "bearer" })
      .send({ expectedAssignmentVersion: 1, targetOperatorId: next.user.id }).expect(201);
    await f.request.get(`${staff}/${e.id}/order?expectedAssignmentVersion=1`).auth(e.operator.token, { type: "bearer" }).expect(403);
    await f.request.get(`${staff}/${e.id}/order?expectedAssignmentVersion=1`).auth(next.token, { type: "bearer" }).expect(409);
    expect((await f.request.get(`${staff}/${e.id}/order?expectedAssignmentVersion=2`).auth(next.token, { type: "bearer" }).expect(200)).body).toEqual(order);
    expect((await e.read().expect(200)).body).toEqual(order);
    await f.prisma.session.delete({ where: { id: e.customer.session.id } });
    await e.read().expect(403); await e.accept().expect(403);
  });
  it("rechecks feasibility after the global capacity lock wait", async () => {
    const e = await enquiry();
    let pending: Promise<unknown> | undefined;
    await f.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(1181, 7)::text`;
      pending = e.accept().expect(409).then((response) => response);
      await eventually(async () => {
        const [row] = await f.prisma.$queryRaw<{ waiting: boolean }[]>`SELECT EXISTS (
          SELECT 1 FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'
          AND query LIKE '%pg_advisory_xact_lock%' AND pid <> pg_backend_pid()) AS waiting`;
        return row?.waiting ? true : null;
      }, { timeoutMs: 2500, intervalMs: 20, description: "acceptance waiting on capacity" });
      now = new Date("2026-11-21T06:00:00.000Z");
    }, { timeout: 10000 });
    await pending;
    expect((await e.read().expect(200)).body.order).toBeNull();
  });
  it.each([
    ["en", "Check the complete quote before confirming."],
    ["ru", "Проверьте полное предложение перед подтверждением."],
    ["tk", "Tassyklamazdan öň doly teklibi barlaň."],
  ])("keeps malformed acceptance private and actionable in %s", async (locale, message) => {
    const e = await enquiry();
    const response = await f.request.post(`${requests}/${e.id}/order`).auth(e.customer.token, { type: "bearer" })
      .set("Accept-Language", locale).set("Content-Type", "application/json").send('{"offer":').expect(400);
    expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(response.body.code).toBe("HISTORY_ORDER_INVALID");
    expect(response.body.message).toBe(message);
    expect(JSON.stringify(response.body)).not.toContain("DEMA");
  });

  it("rechecks current customer session after the request row wait and leaves no hold", async () => {
    const e = await enquiry();
    let pending: Promise<unknown> | undefined;
    await f.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM vehicle_history_requests WHERE id = ${e.id} FOR UPDATE`;
      pending = e.accept().expect(403).then((response) => response);
      await eventually(async () => {
        const [row] = await f.prisma.$queryRaw<{ waiting: boolean }[]>`SELECT EXISTS (
          SELECT 1 FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'
          AND query LIKE '%vehicle_history_requests%' AND pid <> pg_backend_pid()) AS waiting`;
        return row?.waiting ? true : null;
      }, { timeoutMs: 2500, intervalMs: 20, description: "customer acceptance waiting on request" });
      await tx.session.delete({ where: { id: e.customer.session.id } });
    }, { timeout: 10000 });
    await pending;
    expect((await f.request.get(`${staff}/${e.id}/order?expectedAssignmentVersion=1`).auth(e.operator.token, { type: "bearer" }).expect(200)).body.order).toBeNull();
  });
  it("ends quote-choice waiting atomically without replaying an earlier operator message into another reminder", async () => {
    const e = await enquiry();
    await f.request.post(`${staff}/${e.id}/messages`).auth(e.operator.token, { type: "bearer" })
      .send({ clientMessageId: randomUUID(), text: "Please review the quote.", expectedAssignmentVersion: 1 }).expect(201);
    await e.accept().expect(201);
    const reminder = (await f.request.get(`${requests}/${e.id}/reminder`).auth(e.customer.token, { type: "bearer" }).expect(200)).body;
    expect(reminder).toMatchObject({ reason: null, eligible: false, used: false });
  });

});
