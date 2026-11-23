import sharp from "sharp";
import { eventually } from "../../../../test/helpers/eventually";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { historyFixture } from "../../../../test/helpers/historyFixture";
import { HISTORY_FULFILMENT_AUTHORITY, type HistoryFulfilmentAuthority, HISTORY_CLOCK, type HistoryClock } from "../vehicle-history.public";

const root = "/api/v1/vehicle-history";
describe("renewed VIN agreement on the existing private order", () => {
  let f: Awaited<ReturnType<typeof historyFixture>>;
  beforeEach(async () => {
    f = await historyFixture();
    f.app.get<HistoryClock>(HISTORY_CLOCK).now = () => new Date("2026-11-21T05:00:00.000Z");
    f.config.set("VEHICLE_HISTORY_SYNTHETIC_WALLET", "SYNTHETIC-VH12-NO-TRANSFER");
    f.config.set("VEHICLE_HISTORY_SYNTHETIC_DAILY_STAFF_SLOTS", 1);
  });
  afterEach(async () => { await f?.close(); });
  async function accepted(format: string) {
    const customer = await f.actor(null), operator = await f.actor();
    const id = (await f.request.post(`${root}/requests`).auth(customer.token, { type: "bearer" })
      .send({ attemptKey: randomUUID() }).expect(201)).body.id as string;
    const staff = `${root}/operator/requests/${id}`, path = `${root}/requests/${id}`;
    await f.request.post(`${staff}/claim`).auth(operator.token, { type: "bearer" }).send({ expectedAssignmentVersion: 0 }).expect(201);
    await f.request.post(`${staff}/offer`).auth(operator.token, { type: "bearer" })
      .send({ kind: "check", vin: "DEMA0000000000001", expectedVersion: 0, expectedAssignmentVersion: 1 }).expect(201);
    const offer = (await f.request.post(`${staff}/offer`).auth(operator.token, { type: "bearer" }).send({ kind: "propose", format,
      expectedVersion: 1, expectedAssignmentVersion: 1, deliveryFrom: "2026-11-21T06:00:00.000Z", deliveryBy: "2026-11-21T07:00:00.000Z" }).expect(201)).body;
    const original = (await f.request.post(`${path}/order`).auth(customer.token, { type: "bearer" }).send({ offer }).expect(201)).body;
    const change = (input: object) => f.request.post(`${path}/correction`).auth(customer.token, { type: "bearer" }).send(input);
    const review = (input: object) => f.request.post(`${staff}/correction`).auth(operator.token, { type: "bearer" }).send(input);
    const read = () => f.request.get(`${path}/order`).auth(customer.token, { type: "bearer" });
    return { id, staff, path, original, customer, operator, change, review, read };
  }
  it.each(["pdf", "link", "both"])("retains the %s promise until exact acceptance without another payment or hold", async (format) => {
    const e = await accepted(format);
    const bytes = await sharp({ create: { width: 32, height: 32, channels: 3, background: "white" } }).png().toBuffer();
    const proofs = `${e.path}/payment-proofs`;
    const staged = (await f.request.post(proofs).auth(e.customer.token, { type: "bearer" }).send({
      orderId: e.id, attemptKey: randomUUID(), contentType: "image/png", sizeBytes: bytes.length,
    }).expect(201)).body;
    await f.request.put(`${proofs}/${staged.id}/content`).auth(e.customer.token, { type: "bearer" }).set("Content-Type", "image/png").send(bytes).expect(200);
    await f.request.post(`${proofs}/${staged.id}/submit`).auth(e.customer.token, { type: "bearer" }).send({ orderId: e.id }).expect(201);
    await pay(e);
    const payment = (await e.read().expect(200)).body.payment;
    const request = { kind: "request", vin: " dema0000000000006 ", expectedVersion: 0, attemptKey: randomUUID() };
    const pending = (await e.change(request).expect(201)).body;
    expect(pending).toMatchObject({ version: 1, acceptedRevision: 0, pending: { vin: "DEMA0000000000006", review: null } });
    expect((await e.change(request).expect(201)).body).toEqual(pending);
    expect((await e.read().expect(200)).body.order).toEqual(e.original.order);
    const reviewed = (await e.review({ kind: "review", expectedVersion: 1, expectedAssignmentVersion: 1,
      cause: "company_error", format, attemptKey: randomUUID() }).expect(201)).body;
    expect(reviewed.pending.review.offer.preflight).toEqual({ status: "available", providers: [{ name: "AutoCheck", originalReportDate: null }] });
    expect((await e.read().expect(200)).body.order).toEqual(e.original.order);
    const input = { kind: "accept", expectedVersion: 2, attemptKey: randomUUID(), offer: reviewed.pending.review.offer };
    await e.change({ ...input, offer: { ...input.offer, proposal: { ...input.offer.proposal, format: format === "pdf" ? "link" : "pdf" } } }).expect(409);
    const agreed = (await e.change(input).expect(201)).body;
    expect(agreed.accepted).toEqual([
      { revision: 0, offer: e.original.order.acceptedOffer, acceptedAt: "2026-11-21T05:00:00.000Z", cause: null },
      { revision: 3, offer: input.offer, acceptedAt: "2026-11-21T05:00:00.000Z", cause: "company_error" },
    ]);
    expect((await e.change(input).expect(201)).body).toEqual(agreed);
    const state = (await e.read().expect(200)).body;
    expect(state.order).toEqual({ ...e.original.order, acceptedOffer: input.offer });
    expect(state.payment).toEqual(payment);
    expect(state.wallet).toBeNull();
    expect(Buffer.from((await f.request.get(`${proofs}/${staged.id}/content`).auth(e.customer.token, { type: "bearer" }).expect(200)).body.dataBase64, "base64")).toEqual(bytes);
    expect(state).toMatchObject({ agreement: { acceptedRevision: 3, pending: null }, collectionEnabled: false });
    expect(await f.prisma.historyOrder.count({ where: { requestId: e.id } })).toBe(1);
    expect((await f.prisma.historyOrder.findUniqueOrThrow({ where: { requestId: e.id } })).snapshot).toEqual(e.original.order);
  });
  async function pay(e: Awaited<ReturnType<typeof accepted>>) {
    await f.request.post(`${e.staff}/payment-verification`).auth(e.operator.token, { type: "bearer" }).send({
      attemptKey: randomUUID(), orderId: e.id, expectedAssignmentVersion: 1, expectedPaymentVersion: 0,
      walletChecked: true, outcome: "matched", amountMinor: 10000, reference: "SYNTHETIC-VH12-REFERENCE",
      evidence: "Synthetic independent wallet ledger", evidenceFileId: null, receivedAt: "2026-11-21T05:00:00.000Z",
    }).expect(201);
  }
  const reviewInput = (format = "pdf", expectedVersion = 1) => ({ kind: "review", attemptKey: randomUUID(),
    expectedVersion, expectedAssignmentVersion: 1, cause: "customer_correction", format });
  function gate(e: Awaited<ReturnType<typeof accepted>>, revision: number) {
    return f.app.get<HistoryFulfilmentAuthority>(HISTORY_FULFILMENT_AUTHORITY).handoff({ operator: true,
      claims: { sub: e.operator.user.id, sid: e.operator.session.id }, expectedAssignmentVersion: 1 }, e.id, revision);
  }
  it("hands off only the immutable currently accepted revision and fences all later correction writes", async () => {
    const e = await accepted("both");
    await expect(gate(e, 0)).rejects.toMatchObject({ code: "HISTORY_ORDER_STALE" });
    await pay(e);
    const checksBefore = (await e.read().expect(200)).body.payment;
    await e.change({ kind: "request", vin: "DEMA0000000000006", expectedVersion: 0, attemptKey: randomUUID() }).expect(201);
    await expect(gate(e, 0)).rejects.toMatchObject({ code: "HISTORY_CORRECTION_CONFLICT" });
    const reviewed = (await e.review(reviewInput("link")).expect(201)).body;
    await expect(gate(e, 0)).rejects.toMatchObject({ code: "HISTORY_CORRECTION_CONFLICT" });
    const offer = reviewed.pending.review.offer;
    await e.change({ kind: "accept", offer, expectedVersion: 2, attemptKey: randomUUID() }).expect(201);
    await expect(gate(e, 0)).rejects.toMatchObject({ code: "HISTORY_CORRECTION_CONFLICT" });
    const handed = await gate(e, 3);
    expect(handed).toMatchObject({ accepted: { revision: 3, offer, cause: "customer_correction" },
      handoff: { revision: 3, recordedAt: "2026-11-21T05:00:00.000Z" } });
    expect(await gate(e, 3)).toEqual(handed);
    const state = (await e.read().expect(200)).body;
    expect(state.payment).toEqual(checksBefore);
    expect(state.order.holdExpiresAt).toEqual(e.original.order.holdExpiresAt);
    expect(state.agreement).toMatchObject({ version: 4, handoff: handed.handoff });
    const closed = await e.change({ kind: "request", vin: "DEMA0000000000001", expectedVersion: 4, attemptKey: randomUUID() }).expect(409);
    expect(closed.body.code).toBe("HISTORY_CORRECTION_CLOSED");
    await e.review(reviewInput("both", 4)).expect(409);
    await expect(f.prisma.historyVinAgreement.update({ where: { requestId_version: { requestId: e.id, version: 3 } },
      data: { state: {} } })).rejects.toThrow();
    expect((await e.read().expect(200)).body).toEqual(state);
  });
  it("retains the old reservation until acceptance and fails closed when the replacement provider fills", async () => {
    const e = await accepted("pdf");
    await e.change({ kind: "request", vin: "DEMA0000000000006", expectedVersion: 0, attemptKey: randomUUID() }).expect(201);
    const reviewed = (await e.review(reviewInput()).expect(201)).body;
    const budget = { allowance: 1, resetUtc: "00:00", externalUsage: { "2026-11-21": 1 } };
    f.config.set("VEHICLE_HISTORY_SYNTHETIC_PROVIDER_BUDGETS", { AutoCheck: budget });
    const input = { kind: "accept", offer: reviewed.pending.review.offer, expectedVersion: 2, attemptKey: randomUUID() };
    expect((await e.change(input).expect(409)).body.code).toBe("HISTORY_ORDER_CAPACITY");
    expect((await e.read().expect(200)).body.order).toEqual(e.original.order);
    f.config.set("VEHICLE_HISTORY_SYNTHETIC_PROVIDER_BUDGETS", { AutoCheck: { ...budget, externalUsage: {} } });
    await e.change(input).expect(201);
    await pay(e);
    expect((await f.request.get(`${e.staff}/order?expectedAssignmentVersion=1`).auth(e.operator.token, { type: "bearer" }).expect(200)).body.reportPlan)
      .toEqual({ primary: "AutoCheck", second: null });
  });
  it("never converts unavailable history to a reviewed quote and preserves the original payment evidence", async () => {
    const e = await accepted("link");
    for (const [vin, status, version] of [["DEMA0000000000002", "unsupported", 0], ["DEMA0000000000003", "no_history", 2],
      ["DEMA0000000000004", "mismatch", 4], ["DEMA0000000000005", "outage", 6]] as const) {
      await e.change({ kind: "request", vin, expectedVersion: version, attemptKey: randomUUID() }).expect(201);
      const reviewed = (await e.review(reviewInput("both", version + 1)).expect(201)).body;
      expect(reviewed.pending.review.offer).toMatchObject({ preflight: { status }, proposal: null });
      await e.change({ kind: "accept", offer: reviewed.pending.review.offer, expectedVersion: version + 2, attemptKey: randomUUID() }).expect(400);
      expect((await e.read().expect(200)).body.order).toEqual(e.original.order);
    }
    await e.change({ kind: "request", vin: "INVALID-O", expectedVersion: 8, attemptKey: randomUUID() }).expect(400);
  });
  it("arbitrates duplicate and stale revisions without overwriting the winning correction", async () => {
    const e = await accepted("pdf");
    const input = { kind: "request", vin: "DEMA0000000000006", expectedVersion: 0, attemptKey: randomUUID() };
    f.concurrent(2);
    const results = await Promise.all([input, input]
      .map((body) => e.change(body).set("x-history-concurrency", "yes")));
    expect(results.map(({ status }) => status)).toEqual([201, 201]);
    await e.change({ ...input, attemptKey: randomUUID(), vin: "DEMA0000000000002" }).expect(409);
    await e.change({ ...input, vin: "DEMA0000000000003" }).expect(409);
    const reviewed = (await e.review(reviewInput()).expect(201)).body;
    const accept = { kind: "accept", offer: reviewed.pending.review.offer, expectedVersion: 2, attemptKey: randomUUID() };
    f.concurrent(2);
    const acceptedResponses = await Promise.all([accept, accept].map((body) => e.change(body).set("x-history-concurrency", "yes")));
    expect(acceptedResponses.map(({ status }) => status)).toEqual([201, 201]);
    expect(acceptedResponses[0]!.body.accepted).toHaveLength(2);
  });
  it("rechecks assignment, exact purpose and requester access before reads, retries and fulfilment", async () => {
    const e = await accepted("both"), stranger = await f.actor(null), wrong = await f.actor("vehicle_history_payment_evidence");
    const input = { kind: "request", vin: "DEMA0000000000006", expectedVersion: 0, attemptKey: randomUUID() };
    await e.change(input).expect(201);
    for (const actor of [stranger, wrong]) {
      await f.request.get(`${e.path}/correction`).auth(actor.token, { type: "bearer" }).expect(403);
      await f.request.post(`${e.staff}/correction`).auth(actor.token, { type: "bearer" }).send(reviewInput()).expect(403);
    }
    const next = await f.actor();
    await f.request.post(`${e.staff}/handover`).auth(e.operator.token, { type: "bearer" })
      .send({ expectedAssignmentVersion: 1, targetOperatorId: next.user.id }).expect(201);
    await e.review(reviewInput()).expect(403);
    await expect(gate(e, 0)).rejects.toMatchObject({ code: "HISTORY_OPERATOR_DENIED" });
    await f.request.get(`${e.staff}/correction?expectedAssignmentVersion=1`).auth(next.token, { type: "bearer" }).expect(409);
    await f.request.get(`${e.staff}/correction?expectedAssignmentVersion=2`).auth(next.token, { type: "bearer" }).expect(200);
    await f.prisma.session.delete({ where: { id: e.customer.session.id } });
    await e.change(input).expect(403);
  });

  it("refuses a correction whose customer session ended during the request row wait", async () => {
    const e = await accepted("pdf");
    let pending: Promise<unknown> | undefined;
    await f.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM vehicle_history_requests WHERE id = ${e.id} FOR UPDATE`;
      pending = e.change({ kind: "request", vin: "DEMA0000000000006", expectedVersion: 0, attemptKey: randomUUID() }).expect(403).then(r => r);
      await eventually(async () => {
        const [row] = await f.prisma.$queryRaw<{ waiting: boolean }[]>`SELECT EXISTS (SELECT 1 FROM pg_stat_activity
          WHERE datname = current_database() AND wait_event_type = 'Lock' AND query LIKE '%vehicle_history_requests%'
          AND pid <> pg_backend_pid()) AS waiting`;
        return row?.waiting ? true : null;
      }, { timeoutMs: 2500, intervalMs: 20, description: "correction waiting on request lock" });
      await tx.session.delete({ where: { id: e.customer.session.id } });
    }, { timeout: 10000 });
    await pending;
    const state = (await f.request.get(`${e.staff}/order?expectedAssignmentVersion=1`).auth(e.operator.token, { type: "bearer" }).expect(200)).body;
    expect(state).not.toHaveProperty("agreement");
  });
  it("arbitrates a paid handoff against a simultaneous customer correction under the same fence", async () => {
    const e = await accepted("both");
    await pay(e);
    const results = await Promise.allSettled([gate(e, 0), e.change({ kind: "request", vin: "DEMA0000000000006", expectedVersion: 0,
      attemptKey: randomUUID() }).then(response => response)]);
    const state = (await e.read().expect(200)).body.agreement;
    expect(Boolean(state.pending)).not.toBe(Boolean(state.handoff));
    if (state.handoff) expect(results[1]).toMatchObject({ status: "fulfilled", value: { status: 409, body: { code: "HISTORY_CORRECTION_CLOSED" } } });
    else expect(results[0]).toMatchObject({ status: "rejected", reason: { code: "HISTORY_CORRECTION_CONFLICT" } });
  });

});
