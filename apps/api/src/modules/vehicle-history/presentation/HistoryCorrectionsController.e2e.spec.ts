import sharp from "sharp";
import { eventually } from "../../../../test/helpers/eventually";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { historyFixture } from "../../../../test/helpers/historyFixture";
import { HistoryRecoveryWorker } from "../application/HistoryRecoveryWorker";
import { HISTORY_CLOCK, type HistoryClock } from "../vehicle-history.public";

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
  async function accepted(format: string, assigned?: Awaited<ReturnType<typeof f.actor>>,
    [deliveryFrom, deliveryBy] = ["2026-11-21T06:00:00.000Z", "2026-11-21T07:00:00.000Z"], legacy = false,
    vin = "DEMA0000000000001") {
    const customer = await f.actor(null), operator = assigned ?? await f.actor();
    const id = (await f.request.post(`${root}/requests`).auth(customer.token, { type: "bearer" })
      .send({ attemptKey: randomUUID() }).expect(201)).body.id as string;
    const staff = `${root}/operator/requests/${id}`, path = `${root}/requests/${id}`;
    await f.request.post(`${staff}/claim`).auth(operator.token, { type: "bearer" }).send({ expectedAssignmentVersion: 0 }).expect(201);
    await f.request.post(`${staff}/offer`).auth(operator.token, { type: "bearer" })
      .send({ kind: "check", vin, expectedVersion: 0, expectedAssignmentVersion: 1 }).expect(201);
    const offer = (await f.request.post(`${staff}/offer`).auth(operator.token, { type: "bearer" }).send({ kind: "propose", format,
      expectedVersion: 1, expectedAssignmentVersion: 1, deliveryFrom, deliveryBy }).expect(201)).body;
    if (legacy) {
      const acceptedAt = "2026-11-21T05:00:00.000Z", deliveryDay = "2026-11-21", holdExpiresAt = "2026-11-21T07:00:00.000Z";
      await f.prisma.historyOrder.create({ data: { requestId: id, id, wallet: "SYNTHETIC-VH12-NO-TRANSFER",
        snapshot: { id, acceptedOffer: offer, deliveryDay, acceptedAt, holdExpiresAt },
        deliveryDay, deliveryFrom, deliveryBy, holdExpiresAt } });
    }
    const change = (input: object) => f.request.post(`${path}/correction`).auth(customer.token, { type: "bearer" }).send(input);
    const review = (input: object) => f.request.post(`${staff}/correction`).auth(operator.token, { type: "bearer" }).send(input);
    const read = () => f.request.get(`${path}/order`).auth(customer.token, { type: "bearer" });
    const original = legacy ? (await read().expect(200)).body
      : (await f.request.post(`${path}/order`).auth(customer.token, { type: "bearer" }).send({ offer }).expect(201)).body;
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
      walletChecked: true, outcome: "matched", amountMinor: 10000, reference: `SYNTHETIC-VH12-${e.id}`,
      evidence: "Synthetic independent wallet ledger", evidenceFileId: null, receivedAt: f.app.get<HistoryClock>(HISTORY_CLOCK).now().toISOString(),
    }).expect(201);
  }
  function fulfil(e: Awaited<ReturnType<typeof accepted>>, input: object, token = e.operator.token) {
    return f.request.post(`${e.staff}/fulfilment`).auth(token, { type: "bearer" }).send(input);
  }
  function start(e: Awaited<ReturnType<typeof accepted>>, format: string, source = "archive") {
    return { kind: "start", orderId: e.id, expectedAssignmentVersion: 1, expectedVersion: 0, attemptKey: randomUUID(),
      acceptedRevision: 0, vin: "DEMA0000000000001", provider: "Carfax", format, source };
  }
  function outcome(e: Awaited<ReturnType<typeof accepted>>, expectedVersion: number, value: object, kind = "record") {
    return { kind, orderId: e.id, expectedAssignmentVersion: 1, expectedVersion, attemptKey: randomUUID(), outcome: value };
  }
  it.each(["pdf", "link", "both"])("records an explicit archive intent for the accepted %s promise exactly once", async (format) => {
    const e = await accepted(format);
    await fulfil(e, start(e, format)).expect(409);
    await pay(e);
    const before = (await e.read().expect(200)).body;
    expect(before).toMatchObject({ preparation: "queued", wallet: null });
    const input = start(e, format);
    await fulfil(e, { ...input, format: format === "pdf" ? "link" : "pdf" }).expect(409);
    expect((await e.read().expect(200)).body.agreement?.handoff ?? null).toBeNull();
    const r = (await fulfil(e, input).expect(201)).body;
    expect(r).toMatchObject({ intent: { id: input.attemptKey, version: 1, source: "archive", status: "pending" },
      accepted: { vin: input.vin, provider: input.provider, format, originalReportDate: "2026-10-14" } });
    expect((await fulfil(e, input).expect(201)).body).toEqual(r);
    await fulfil(e, { ...input, attemptKey: randomUUID() }).expect(409);
    const saved = (await fulfil(e, outcome(e, 1, { kind: "obtained", format,
      originalReportDate: "2026-10-14", permittedUse: true })).expect(201)).body;
    expect(saved.intent).toMatchObject({ status: "obtained", attempt: 1 });
    const customer = (await e.read().expect(200)).body;
    expect(customer).toMatchObject({ preparation: "preparing", payment: before.payment, order: before.order, wallet: null,
      agreement: { handoff: { revision: 0 } } });
    expect(customer.fulfilment).toBeUndefined();
  });
  it("keeps an uncertain lookup on its original intent, and routes an incomplete format to recovery", async () => {
    const e = await accepted("both");
    await pay(e);
    const input = start(e, "both", "new_source");
    await fulfil(e, input).expect(201);
    await fulfil(e, outcome(e, 1, { kind: "uncertain" })).expect(201);
    const retry = { kind: "retry", orderId: e.id, expectedAssignmentVersion: 1, expectedVersion: 2, attemptKey: randomUUID() };
    await fulfil(e, retry).expect(409);
    await fulfil(e, outcome(e, 2, { kind: "not_started" }, "reconcile")).expect(201);
    const fresh = { ...retry, expectedVersion: 3 };
    const resumed = (await fulfil(e, fresh).expect(201)).body;
    expect(resumed.intent).toMatchObject({ id: input.attemptKey, version: 4, status: "pending", attempt: 2 });
    expect((await fulfil(e, fresh).expect(201)).body).toEqual(resumed);
    const failed = (await fulfil(e, outcome(e, 4, { kind: "obtained", format: "pdf", originalReportDate: "2026-10-14",
      permittedUse: true })).expect(201)).body;
    expect(failed.intent).toMatchObject({ status: "recovery", reason: "format_unavailable" });
    await fulfil(e, { ...retry, expectedVersion: 5, attemptKey: randomUUID() }).expect(409);
    expect((await e.read().expect(200)).body).toMatchObject({ preparation: "recovery", wallet: null });
  });
  it.each([
    [false, "2026-10-14", "rights_unavailable"],
    [true, "2026-10-15", "original_date_mismatch"],
  ])("routes unusable original report facts to order recovery", async (permittedUse, originalReportDate, reason) => {
    const e = await accepted("link");
    await pay(e);
    const before = (await e.read().expect(200)).body;
    await fulfil(e, start(e, "link")).expect(201);
    const result = await fulfil(e, outcome(e, 1, { kind: "obtained", format: "link", originalReportDate, permittedUse })).expect(201);
    expect(result.body.intent).toMatchObject({ status: "recovery", reason });
    expect((await e.read().expect(200)).body).toMatchObject({ preparation: "recovery", order: before.order, payment: before.payment, wallet: null });
  });
  const reviewInput = (format = "pdf", expectedVersion = 1) => ({ kind: "review", attemptKey: randomUUID(),
    expectedVersion, expectedAssignmentVersion: 1, cause: "customer_correction", format });
  async function agreeRecovery(e: Awaited<ReturnType<typeof accepted>>, format: string) {
    const { body: { recovery } } = await e.read().expect(200);
    return (await f.request.post(`${e.path}/recovery`).auth(e.customer.token, { type: "bearer" }).send({
      kind: "accept", orderId: e.id, expectedVersion: recovery.version, attemptKey: randomUUID(), deadline: recovery.offeredDeadline, format,
    }).expect(201)).body;
  }
  const operatorOrder = (e: Awaited<ReturnType<typeof accepted>>) =>
    f.request.get(`${e.staff}/order?expectedAssignmentVersion=1`).auth(e.operator.token, { type: "bearer" });

  it("resolves an existing VIN correction inside the agreed recovery while preserving the paid promise", async () => {
    const e = await accepted("both");
    await pay(e);
    expect((await e.change({ kind: "request", vin: "DEMA0000000000006", expectedVersion: 0, attemptKey: randomUUID() }).expect(201)).body)
      .toMatchObject({ pending: { vin: "DEMA0000000000006" } });
    const outdated = (await e.review(reviewInput("link")).expect(201)).body.pending.review.offer;
    f.app.get<HistoryClock>(HISTORY_CLOCK).now = () => new Date("2026-11-21T07:00:00.000Z");
    await agreeRecovery(e, "both");
    await e.change({ kind: "accept", offer: outdated, expectedVersion: 2, attemptKey: randomUUID() }).expect(409);
    const reviewed = (await e.review(reviewInput("both", 2)).expect(201)).body;
    await e.change({ kind: "accept", offer: reviewed.pending.review.offer, expectedVersion: 3, attemptKey: randomUUID() }).expect(201);
    const current = (await e.read().expect(200)).body;
    expect(current).toMatchObject({ agreement: { acceptedRevision: 4, pending: null }, recovery: {
      status: "agreed", originalFormat: "both", originalPromiseBy: "2026-11-21T07:00:00.000Z", agreedDeadline: "2026-11-21T08:00:00.000Z",
    }, order: { id: e.id, acceptedOffer: { vin: "DEMA0000000000006", proposal: { format: "both" } } } });
    await fulfil(e, { ...start(e, "both", "new_source"), acceptedRevision: 4, vin: "DEMA0000000000006", provider: "AutoCheck" }).expect(201);
  });

  it("charges overnight recovery lookups to the current provider quota under concurrent admission", async () => {
    f.config.set("VEHICLE_HISTORY_SYNTHETIC_DAILY_STAFF_SLOTS", 3);
    f.config.set("VEHICLE_HISTORY_SYNTHETIC_PROVIDER_BUDGETS", { Carfax: { allowance: 3, resetUtc: "00:00", externalUsage: {} } });
    const first = await accepted("pdf", undefined, ["2026-11-21T14:20:00.000Z", "2026-11-21T14:35:00.000Z"]);
    const second = await accepted("pdf", undefined, ["2026-11-21T14:35:00.000Z", "2026-11-21T14:50:00.000Z"]);
    const clock = f.app.get<HistoryClock>(HISTORY_CLOCK);
    await pay(first);
    await pay(second);
    clock.now = () => new Date("2026-11-21T14:50:00.000Z");
    expect((await agreeRecovery(first, "pdf")).agreedDeadline).toBe("2026-11-22T04:50:00.000Z");
    await agreeRecovery(second, "pdf");
    clock.now = () => new Date("2026-11-22T04:10:00.000Z");
    f.config.set("VEHICLE_HISTORY_SYNTHETIC_PROVIDER_BUDGETS", { Carfax: { allowance: 3, resetUtc: "00:00", externalUsage: { "2026-11-22": 3 } } });
    expect((await operatorOrder(first).expect(200)).body.fulfilment.sources).not.toContain("new_source");
    await fulfil(first, start(first, "pdf", "new_source")).expect(409)
      .expect(({ body }) => expect(body.code).toBe("HISTORY_ORDER_CAPACITY"));
    f.config.set("VEHICLE_HISTORY_SYNTHETIC_PROVIDER_BUDGETS", { Carfax: { allowance: 3, resetUtc: "00:00", externalUsage: { "2026-11-22": 2 } } });
    f.concurrent(2);
    const results = await Promise.all([first, second].map((e) =>
      fulfil(e, start(e, "pdf", "new_source")).set("x-history-concurrency", "1")));
    expect(results.map((response) => response.status).sort()).toEqual([201, 409]);
    const [admitted, waiting] = results[0]?.status === 201 ? [first, second] : [second, first];
    await fulfil(admitted, outcome(admitted, 1, { kind: "uncertain" })).expect(201);
    await fulfil(waiting, start(waiting, "pdf", "new_source")).expect(409);
    await fulfil(admitted, outcome(admitted, 2, { kind: "not_started" }, "reconcile")).expect(201);
    await fulfil(waiting, start(waiting, "pdf", "new_source")).expect(201);
  });

  it("starts a corrected VIN with a provider that has recovery quota and keeps the original reservation", async () => {
    const budget = { allowance: 12, resetUtc: "00:00", externalUsage: {} };
    f.config.set("VEHICLE_HISTORY_SYNTHETIC_PROVIDER_BUDGETS", {
      Carfax: budget, AutoCheck: { ...budget, externalUsage: { "2026-11-22": 12 } },
    });
    const clock = f.app.get<HistoryClock>(HISTORY_CLOCK);
    clock.now = () => new Date("2026-11-21T14:00:00.000Z");
    const e = await accepted("pdf", undefined, ["2026-11-21T14:35:00.000Z", "2026-11-21T14:50:00.000Z"], false, "DEMA0000000000006");
    const vin = "DEMA0000000000001";
    await pay(e);
    await e.change({ kind: "request", vin, expectedVersion: 0, attemptKey: randomUUID() }).expect(201);
    clock.now = () => new Date("2026-11-21T14:50:00.000Z");
    await agreeRecovery(e, "pdf");
    clock.now = () => new Date("2026-11-22T04:10:00.000Z");
    const { body: { pending } } = await e.review(reviewInput()).expect(201);
    await e.change({ kind: "accept", offer: pending.review.offer, expectedVersion: 2, attemptKey: randomUUID() }).expect(201);
    const { body } = await operatorOrder(e).expect(200);
    expect(body.fulfilment).toMatchObject({ gate: "ready", accepted: { vin, provider: "Carfax" },
      sources: expect.arrayContaining(["new_source"]) });
    await fulfil(e, { ...start(e, "pdf", "new_source"), acceptedRevision: 3 }).expect(201);
    const reservation = await f.prisma.historyOrder.findUniqueOrThrow({ where: { requestId: e.id } });
    expect(reservation.reservedProvider).toBe("AutoCheck");
    const intent = await f.prisma.historyFulfilmentEvent.findFirstOrThrow({ where: { requestId: e.id } });
    expect(intent.recoveryQuotaProvider).toBe("Carfax");
  });

  it("keeps a usable reserved archive through recovery when only the alternate has new lookup quota", async () => {
    f.config.set("VEHICLE_HISTORY_SYNTHETIC_PROVIDER_BUDGETS", {
      Carfax: { allowance: 12, resetUtc: "00:00", externalUsage: { "2026-11-22": 12 } },
      AutoCheck: { allowance: 6, resetUtc: "00:00", externalUsage: {} },
    });
    const clock = f.app.get<HistoryClock>(HISTORY_CLOCK);
    clock.now = () => new Date("2026-11-21T14:00:00.000Z");
    const e = await accepted("pdf", undefined, ["2026-11-21T14:35:00.000Z", "2026-11-21T14:50:00.000Z"]);
    await pay(e);
    clock.now = () => new Date("2026-11-21T14:50:00.000Z");
    await agreeRecovery(e, "pdf");
    clock.now = () => new Date("2026-11-22T04:10:00.000Z");
    const { body } = await operatorOrder(e).expect(200);
    expect(body.fulfilment).toMatchObject({ gate: "ready", accepted: { format: "pdf", provider: "Carfax" }, sources: ["archive"] });
    await fulfil(e, start(e, "pdf", "new_source")).expect(409).expect(({ body }) => expect(body.code).toBe("HISTORY_ORDER_CAPACITY"));
    await fulfil(e, start(e, "pdf")).expect(201).expect(({ body }) => expect(body.intent).toMatchObject({
      source: "archive", accepted: { format: "pdf", provider: "Carfax", originalReportDate: "2026-10-14" },
    }));
    const event = await f.prisma.historyFulfilmentEvent.findFirstOrThrow({ where: { requestId: e.id } });
    expect(event.recoveryQuotaProvider).toBeNull();
  });

  it.each(["suspendedAt", "deletionScheduledAt"] as const)("rechecks %s when the lifecycle write wins the deadline worker race", async (field) => {
    const e = await accepted("pdf");
    await pay(e);
    f.app.get<HistoryClock>(HISTORY_CLOCK).now = () => new Date("2026-11-21T07:00:00.000Z");
    const worker = f.app.get(HistoryRecoveryWorker);
    let scan: Promise<void> | undefined, settled = false;
    const race = await f.prisma.$transaction(async (tx) => {
      const [lock] = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
      if (!lock) throw new Error("Missing lifecycle transaction PID");
      await tx.user.update({ where: { id: e.customer.user.id }, data: { [field]: new Date() } });
      scan = worker.execute().finally(() => { settled = true; });
      return eventually(async () => {
        if (settled) return "settled";
        const [row] = await f.prisma.$queryRaw<{ waiting: boolean }[]>`SELECT EXISTS (SELECT 1 FROM pg_stat_activity
          WHERE ${lock.pid} = ANY(pg_blocking_pids(pid)) AND query LIKE 'SELECT id FROM users%') AS waiting`;
        return row?.waiting ? "blocked" : null;
      }, { timeoutMs: 2500, intervalMs: 20, description: "deadline worker reached the requester lifecycle fence" });
    });
    await scan;
    expect(await f.prisma.historyRecoveryEvent.count({ where: { requestId: e.id } })).toBe(0);
    expect(race).toBe("blocked");
    await f.prisma.user.update({ where: { id: e.customer.user.id }, data: { [field]: null } });
    await worker.execute();
    expect(await f.prisma.historyRecoveryEvent.count({ where: { requestId: e.id } })).toBe(1);
  });

  it("prioritizes an older actionable company correction once its recovery is agreed", async () => {
    f.config.set("VEHICLE_HISTORY_SYNTHETIC_DAILY_STAFF_SLOTS", 2);
    const older = await accepted("pdf");
    await pay(older);
    await fulfil(older, start(older, "pdf", "new_source")).expect(201);
    await fulfil(older, outcome(older, 1, { kind: "company_error" })).expect(201);
    const clock = f.app.get<HistoryClock>(HISTORY_CLOCK);
    clock.now = () => new Date("2026-11-21T05:01:00.000Z");
    const newer = await accepted("pdf", older.operator, ["2026-11-21T07:15:00.000Z", "2026-11-21T08:15:00.000Z"]);
    await pay(newer);
    clock.now = () => new Date("2026-11-21T07:00:00.000Z");
    expect((await operatorOrder(newer).expect(200)).body.fulfilment.gate).toBe("ready");
    await agreeRecovery(older, "pdf");
    expect((await operatorOrder(newer).expect(200)).body.fulfilment.gate).toBe("fifo");
    const newerProvider = (await operatorOrder(newer).expect(200)).body.fulfilment.accepted.provider;
    const newerStart = { ...start(newer, "pdf", "new_source"), provider: newerProvider };
    await fulfil(newer, newerStart).expect(409).expect(({ body }) => expect(body.code).toBe("HISTORY_FULFILMENT_FIFO"));
    await fulfil(older, { kind: "company_correction", orderId: older.id, expectedAssignmentVersion: 1,
      expectedVersion: 2, attemptKey: randomUUID() }).expect(201);
    await fulfil(older, outcome(older, 3, { kind: "obtained", format: "pdf", originalReportDate: "2026-10-14", permittedUse: true })).expect(201);
    await fulfil(newer, newerStart).expect(201);
  });

  it("lets a paid pre-reservation order renew its agreement without changing its hold or payment", async () => {
    f.config.set("VEHICLE_HISTORY_SYNTHETIC_DAILY_STAFF_SLOTS", 2);
    const e = await accepted("both", undefined, undefined, true);
    const later = await accepted("both", e.operator, ["2026-11-21T07:00:00.000Z", "2026-11-21T08:00:00.000Z"], true);
    await pay(e);
    f.app.get<HistoryClock>(HISTORY_CLOCK).now = () => new Date("2026-11-21T05:01:00.000Z");
    await pay(later);
    const budget = { allowance: 1, resetUtc: "00:00", externalUsage: {} };
    f.config.set("VEHICLE_HISTORY_SYNTHETIC_PROVIDER_BUDGETS", { Carfax: budget, AutoCheck: budget });
    const before = (await e.read().expect(200)).body;
    const requested = await e.change({ kind: "request", vin: "DEMA0000000000006", expectedVersion: 0, attemptKey: randomUUID() }).expect(201);
    expect(requested.body.accepted[0].offer).toEqual(before.order.acceptedOffer);
    const reviewed = (await e.review(reviewInput("link")).expect(201)).body;
    await e.change({ kind: "accept", offer: reviewed.pending.review.offer, expectedVersion: 2, attemptKey: randomUUID() }).expect(201);
    const current = (await e.read().expect(200)).body;
    expect(current).toMatchObject({ payment: before.payment, order: { id: e.id, holdExpiresAt: before.order.holdExpiresAt,
      acceptedOffer: { vin: "DEMA0000000000006", proposal: { format: "link" } } } });
    const command = { ...start(e, "link", "new_source"), acceptedRevision: 3, vin: "DEMA0000000000006", provider: "AutoCheck" };
    await fulfil(e, command).expect(201);
  });

  it("lets a newer pre-reservation order request review without consuming the paid queue head's slot", async () => {
    f.config.set("VEHICLE_HISTORY_SYNTHETIC_DAILY_STAFF_SLOTS", 2);
    const older = await accepted("both", undefined, undefined, true);
    const newer = await accepted("both", older.operator, ["2026-11-21T07:00:00.000Z", "2026-11-21T08:00:00.000Z"], true);
    await pay(older);
    f.app.get<HistoryClock>(HISTORY_CLOCK).now = () => new Date("2026-11-21T05:01:00.000Z");
    await pay(newer);
    const budget = { allowance: 1, resetUtc: "00:00", externalUsage: {} };
    f.config.set("VEHICLE_HISTORY_SYNTHETIC_PROVIDER_BUDGETS", { Carfax: budget, AutoCheck: budget });
    await newer.change({ kind: "request", vin: "DEMA0000000000006", expectedVersion: 0, attemptKey: randomUUID() }).expect(201);
    const reviewed = (await newer.review(reviewInput("link")).expect(201)).body;
    const accept = { kind: "accept", offer: reviewed.pending.review.offer, expectedVersion: 2, attemptKey: randomUUID() };
    expect((await newer.change(accept).expect(409)).body.code).toBe("HISTORY_FULFILMENT_FIFO");
    await fulfil(older, start(older, "both", "new_source")).expect(201);
    await fulfil(older, outcome(older, 1, { kind: "no_history" })).expect(201);
    await newer.change(accept).expect(201);
    await fulfil(newer, { ...start(newer, "link", "new_source"), acceptedRevision: 3, vin: "DEMA0000000000006", provider: "AutoCheck" }).expect(201);
  });

  it("shows provider capacity for a pre-reservation order and selects an alternate whose period is open", async () => {
    const e = await accepted("both", undefined, undefined, true);
    await pay(e);
    const budget = { allowance: 1, resetUtc: "06:00", externalUsage: {} };
    f.config.set("VEHICLE_HISTORY_SYNTHETIC_PROVIDER_BUDGETS", {});
    const operator = () => f.request.get(`${e.staff}/order?expectedAssignmentVersion=1`)
      .auth(e.operator.token, { type: "bearer" }).expect(200);
    const previous = (await e.read().expect(200)).body;
    expect((await operator()).body).toMatchObject({ fulfilmentUnavailable: "capacity", order: previous.order, payment: previous.payment });
    expect((await e.read().expect(200)).body.fulfilmentUnavailable).toBeUndefined();
    f.config.set("VEHICLE_HISTORY_SYNTHETIC_PROVIDER_BUDGETS", { Carfax: budget, AutoCheck: { ...budget, resetUtc: "00:00" } });
    const offered = (await operator()).body;
    expect(offered.fulfilment).toMatchObject({ gate: "ready", accepted: { provider: "AutoCheck", format: "both" } });
    expect(offered.fulfilmentUnavailable).toBeUndefined();
    await fulfil(e, { ...start(e, "both", "new_source"), provider: "AutoCheck" }).expect(201);
    expect((await e.read().expect(200)).body).toMatchObject({ order: previous.order, payment: previous.payment });
  });

  it.each(["paid with a reservation", "unpaid without a reservation"] as const)(
    "protects an earlier paid pre-reservation order from a correction that is %s", async (kind) => {
      f.config.set("VEHICLE_HISTORY_SYNTHETIC_DAILY_STAFF_SLOTS", 2);
      const budget = { allowance: 1, resetUtc: "00:00", externalUsage: {} };
      f.config.set("VEHICLE_HISTORY_SYNTHETIC_PROVIDER_BUDGETS", { Carfax: { ...budget, allowance: 3 }, AutoCheck: budget });
      const older = await accepted("link", undefined, undefined, true, "DEMA0000000000006");
      const paid = kind === "paid with a reservation";
      const newer = await accepted("both", paid ? older.operator : undefined, ["2026-11-21T07:00:00.000Z", "2026-11-21T08:00:00.000Z"], !paid);
      await pay(older);
      f.app.get<HistoryClock>(HISTORY_CLOCK).now = () => new Date("2026-11-21T05:01:00.000Z");
      if (paid) await pay(newer);
      const prior = (await newer.read().expect(200)).body;
      await newer.change({ kind: "request", vin: "DEMA0000000000006", expectedVersion: 0, attemptKey: randomUUID() }).expect(201);
      const reviewed = (await newer.review(reviewInput("link")).expect(201)).body;
      const refused = await newer.change({ kind: "accept", offer: reviewed.pending.review.offer, expectedVersion: 2,
        attemptKey: randomUUID() }).expect(409);
      expect(refused.body.code).toBe(paid ? "HISTORY_FULFILMENT_FIFO" : "HISTORY_ORDER_CAPACITY");
      expect((await newer.read().expect(200)).body).toMatchObject({ order: prior.order, agreement: { acceptedRevision: 0 } });
      await fulfil(older, { ...start(older, "link", "new_source"), vin: "DEMA0000000000006", provider: "AutoCheck" }).expect(201);
    },
  );

  it("shows the same provider reset gate for a corrected pre-reservation order on read and start", async () => {
    const e = await accepted("both", undefined, undefined, true);
    await pay(e);
    const budget = { allowance: 1, resetUtc: "06:00", externalUsage: {} };
    f.config.set("VEHICLE_HISTORY_SYNTHETIC_PROVIDER_BUDGETS", { AutoCheck: budget });
    await e.change({ kind: "request", vin: "DEMA0000000000006", expectedVersion: 0, attemptKey: randomUUID() }).expect(201);
    const reviewed = (await e.review(reviewInput("link")).expect(201)).body;
    await e.change({ kind: "accept", offer: reviewed.pending.review.offer, expectedVersion: 2, attemptKey: randomUUID() }).expect(201);
    const read = () => f.request.get(`${e.staff}/order?expectedAssignmentVersion=1`)
      .auth(e.operator.token, { type: "bearer" }).expect(200);
    const command = { ...start(e, "link", "new_source"), acceptedRevision: 3, vin: "DEMA0000000000006", provider: "AutoCheck" };
    expect((await read()).body.fulfilment).toMatchObject({ gate: "capacity", sources: [], accepted: { provider: "AutoCheck" } });
    expect((await fulfil(e, command).expect(409)).body.code).toBe("HISTORY_ORDER_CAPACITY");
    f.app.get<HistoryClock>(HISTORY_CLOCK).now = () => new Date("2026-11-21T06:00:00.000Z");
    expect((await read()).body.fulfilment).toMatchObject({ gate: "ready", sources: ["new_source"] });
    await fulfil(e, command).expect(201);
  });

  it("does not count an earlier pre-reservation order whose window crosses the provider reset", async () => {
    f.config.set("VEHICLE_HISTORY_SYNTHETIC_DAILY_STAFF_SLOTS", 2);
    const first = await accepted("link", undefined, ["2026-11-21T05:30:00.000Z", "2026-11-21T06:30:00.000Z"],
      true, "DEMA0000000000006");
    const second = await accepted("both", undefined, ["2026-11-21T07:00:00.000Z", "2026-11-21T08:00:00.000Z"], true);
    await pay(first);
    f.app.get<HistoryClock>(HISTORY_CLOCK).now = () => new Date("2026-11-21T05:01:00.000Z");
    await pay(second);
    f.config.set("VEHICLE_HISTORY_SYNTHETIC_PROVIDER_BUDGETS", { AutoCheck: { allowance: 1, resetUtc: "06:00", externalUsage: {} } });
    const firstOrder = await f.request.get(`${first.staff}/order?expectedAssignmentVersion=1`).auth(first.operator.token, { type: "bearer" }).expect(200);
    expect(firstOrder.body.fulfilmentUnavailable).toBe("capacity");
    const before = (await second.read().expect(200)).body;
    await second.change({ kind: "request", vin: "DEMA0000000000006", expectedVersion: 0, attemptKey: randomUUID() }).expect(201);
    const reviewed = (await second.review(reviewInput("link")).expect(201)).body;
    await second.change({ kind: "accept", offer: reviewed.pending.review.offer, expectedVersion: 2, attemptKey: randomUUID() }).expect(201);
    expect((await second.read().expect(200)).body).toMatchObject({ payment: before.payment, agreement: { acceptedRevision: 3 } });
  });

  it.each([false, true])("offers a qualified archive before reset for a paid order (pre-reservation: %s)", async (legacy) => {
    f.config.set("VEHICLE_HISTORY_SYNTHETIC_PROVIDER_BUDGETS", { Carfax: { allowance: 1, resetUtc: "06:00", externalUsage: {} } });
    const e = await accepted("pdf", undefined, undefined, legacy);
    await pay(e);
    const projected = (await f.request.get(`${e.staff}/order?expectedAssignmentVersion=1`)
      .auth(e.operator.token, { type: "bearer" }).expect(200)).body.fulfilment;
    expect(projected).toMatchObject({ gate: "ready", sources: ["archive"], accepted: { provider: "Carfax" } });
    expect((await fulfil(e, start(e, "pdf", "new_source")).expect(409)).body.code).toBe("HISTORY_ORDER_CAPACITY");
    const command = start(e, "pdf");
    const result = (await fulfil(e, command).expect(201)).body;
    expect(result).toMatchObject({ intent: { source: "archive" }, sources: ["archive"] });
    expect((await fulfil(e, command).expect(201)).body).toEqual(result);
  });

  it("lets two paid pre-reservation orders use distinct available providers in paid queue order", async () => {
    f.config.set("VEHICLE_HISTORY_SYNTHETIC_DAILY_STAFF_SLOTS", 2);
    const older = await accepted("both", undefined, undefined, true);
    const newer = await accepted("both", older.operator, ["2026-11-21T07:00:00.000Z", "2026-11-21T08:00:00.000Z"], true);
    await pay(older);
    f.app.get<HistoryClock>(HISTORY_CLOCK).now = () => new Date("2026-11-21T05:01:00.000Z");
    await pay(newer);
    const budget = { allowance: 1, resetUtc: "00:00", externalUsage: {} };
    f.config.set("VEHICLE_HISTORY_SYNTHETIC_PROVIDER_BUDGETS", { Carfax: budget, AutoCheck: budget });
    const readStaff = (e: typeof older) => f.request.get(`${e.staff}/order?expectedAssignmentVersion=1`)
      .auth(e.operator.token, { type: "bearer" }).expect(200);
    expect((await readStaff(older)).body.fulfilment).toMatchObject({ gate: "ready", accepted: { provider: "Carfax", format: "both" } });
    expect((await readStaff(newer)).body.fulfilment).toMatchObject({ gate: "fifo" });
    expect((await fulfil(newer, start(newer, "both", "new_source")).expect(409)).body.code).toBe("HISTORY_FULFILMENT_FIFO");
    const before = (await older.read().expect(200)).body;
    const command = start(older, "both", "new_source");
    const started = (await fulfil(older, command).expect(201)).body;
    expect((await fulfil(older, command).expect(201)).body).toEqual(started);
    await fulfil(older, outcome(older, 1, { kind: "no_history" })).expect(201);
    expect((await older.read().expect(200)).body).toMatchObject({ order: before.order, payment: before.payment, wallet: null });
    expect((await readStaff(newer)).body.fulfilment).toMatchObject({ gate: "ready", accepted: { provider: "AutoCheck" } });
    await fulfil(newer, { ...start(newer, "both", "new_source"), provider: "AutoCheck" }).expect(201);
  });

  it("does not overbook the last provider slot when pre-reservation orders from separate operators start together", async () => {
    f.config.set("VEHICLE_HISTORY_SYNTHETIC_DAILY_STAFF_SLOTS", 2);
    const first = await accepted("pdf", undefined, undefined, true);
    const second = await accepted("pdf", undefined, ["2026-11-21T07:00:00.000Z", "2026-11-21T08:00:00.000Z"], true);
    await pay(first);
    await pay(second);
    f.config.set("VEHICLE_HISTORY_SYNTHETIC_PROVIDER_BUDGETS", { Carfax: { allowance: 1, resetUtc: "00:00", externalUsage: {} } });
    f.concurrent(2);
    const responses = await Promise.all([first, second].map((e) => fulfil(e, start(e, "pdf", "new_source")).set("x-history-concurrency", "1")));
    expect(responses.map(({ status }) => status).sort()).toEqual([201, 409]);
    expect(responses.find(({ status }) => status === 409)?.body.code).toBe("HISTORY_ORDER_CAPACITY");
    const pending = await Promise.all([first, second].map(async (e) => (await e.read().expect(200)).body.preparation));
    expect(pending.sort()).toEqual(["preparing", "queued"]);
  });

  it("hands off only the immutable currently accepted revision and fences all later correction writes", async () => {
    const e = await accepted("both");
    expect((await fulfil(e, start(e, "both")).expect(409)).body.code).toBe("HISTORY_ORDER_STALE");
    await pay(e);
    const checksBefore = (await e.read().expect(200)).body.payment;
    await e.change({ kind: "request", vin: "DEMA0000000000006", expectedVersion: 0, attemptKey: randomUUID() }).expect(201);
    expect((await fulfil(e, start(e, "both")).expect(409)).body.code).toBe("HISTORY_CORRECTION_CONFLICT");
    const reviewed = (await e.review(reviewInput("link")).expect(201)).body;
    expect((await fulfil(e, start(e, "both")).expect(409)).body.code).toBe("HISTORY_CORRECTION_CONFLICT");
    const offer = reviewed.pending.review.offer;
    await e.change({ kind: "accept", offer, expectedVersion: 2, attemptKey: randomUUID() }).expect(201);
    expect((await fulfil(e, start(e, "both")).expect(409)).body.code).toBe("HISTORY_CORRECTION_CONFLICT");
    const command = { ...start(e, "link", "new_source"), acceptedRevision: 3, vin: offer.vin, provider: "AutoCheck" };
    const result = (await fulfil(e, command).expect(201)).body;
    expect(result).toMatchObject({ accepted: { acceptedRevision: 3, vin: offer.vin, format: "link" } });
    expect((await fulfil(e, command).expect(201)).body).toEqual(result);
    const state = (await e.read().expect(200)).body;
    expect(state.payment).toEqual(checksBefore);
    expect(state.order.holdExpiresAt).toEqual(e.original.order.holdExpiresAt);
    expect(state.agreement).toMatchObject({ version: 4, handoff: { revision: 3, recordedAt: "2026-11-21T05:00:00.000Z" } });
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
    await fulfil(e, start(e, "both")).expect(403);
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
    f.concurrent(2);
    const [handoff, correction] = await Promise.all([
      fulfil(e, start(e, "both")).set("x-history-concurrency", "yes"),
      e.change({ kind: "request", vin: "DEMA0000000000006", expectedVersion: 0, attemptKey: randomUUID() })
        .set("x-history-concurrency", "yes"),
    ]);
    const state = (await e.read().expect(200)).body.agreement;
    const eventCount = await f.prisma.historyFulfilmentEvent.count({ where: { requestId: e.id } });
    expect(Boolean(state.pending)).not.toBe(Boolean(state.handoff));
    if (state.handoff) {
      expect(eventCount).toBe(1);
      expect(correction).toMatchObject({ status: 409, body: { code: "HISTORY_CORRECTION_CLOSED" } });
    } else {
      expect(eventCount).toBe(0);
      expect(handoff).toMatchObject({ status: 409, body: { code: "HISTORY_CORRECTION_CONFLICT" } });
    }
  });

  it("rolls back the handoff if saving the intent fails after the handoff write", async () => {
    const e = await accepted("pdf");
    await pay(e);
    await f.prisma.$executeRawUnsafe(`CREATE FUNCTION reject_history_test_intent() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW."requestId" = '${e.id}' THEN RAISE EXCEPTION 'Injected intent write failure'; END IF; RETURN NEW; END $$`);
    await f.prisma.$executeRawUnsafe(`CREATE TRIGGER reject_history_test_intent BEFORE INSERT ON history_fulfilment_events
      FOR EACH ROW EXECUTE FUNCTION reject_history_test_intent()`);
    const command = start(e, "pdf");
    try {
      await fulfil(e, command).expect(503);
      expect((await e.read().expect(200)).body.agreement).toBeUndefined();
      expect(await f.prisma.historyFulfilmentEvent.count({ where: { requestId: e.id } })).toBe(0);
    } finally {
      await f.prisma.$executeRawUnsafe('DROP TRIGGER reject_history_test_intent ON history_fulfilment_events');
      await f.prisma.$executeRawUnsafe('DROP FUNCTION reject_history_test_intent()');
    }
    await fulfil(e, command).expect(201);
    expect((await e.read().expect(200)).body.agreement.handoff.revision).toBe(0);
  });

  it("denies fulfilment for verified funds without a booking", async () => {
    const e = await accepted("pdf");
    f.app.get<HistoryClock>(HISTORY_CLOCK).now = () => new Date("2026-11-21T07:01:00.000Z");
    await pay(e);
    const order = (await e.read().expect(200)).body;
    expect(order).toMatchObject({ status: "payment_received_no_hold", wallet: null });
    expect(order.preparation).toBeUndefined();
    await fulfil(e, start(e, "pdf")).expect(409);
    expect(await f.prisma.historyVinAgreement.count({ where: { requestId: e.id } })).toBe(0);
  });

  it("gives one racing start the intent and lets only the new assignee resolve it", async () => {
    const e = await accepted("link");
    await pay(e);
    const command = start(e, "link", "new_source");
    f.concurrent(2);
    const results = await Promise.all([command, { ...command, attemptKey: randomUUID() }].map((input) =>
      fulfil(e, input).set("x-history-concurrency", "yes")));
    expect(results.map(({ status }) => status).sort()).toEqual([201, 409]);
    const winner = results.find(({ status }) => status === 201)!.body.intent;
    const recipient = await f.actor();
    await f.request.post(`${e.staff}/handover`).auth(e.operator.token, { type: "bearer" })
      .send({ expectedAssignmentVersion: 1, targetOperatorId: recipient.user.id }).expect(201);
    const mark = outcome(e, 1, { kind: "uncertain" });
    await fulfil(e, mark).expect(403);
    await fulfil(e, mark, recipient.token).expect(409);
    await fulfil(e, { ...mark, expectedAssignmentVersion: 2 }, recipient.token).expect(201);
    expect((await e.read().expect(200)).body).toMatchObject({ preparation: "checking", wallet: null });
    const settle = { ...outcome(e, 2, { kind: "obtained", format: "link", originalReportDate: "2026-10-14",
      permittedUse: true }, "reconcile"), expectedAssignmentVersion: 2 };
    const reconciled = (await fulfil(e, settle, recipient.token).expect(201)).body.intent;
    expect(reconciled).toMatchObject({ id: winner.id, attempt: 1, status: "obtained" });
  });

  it("honours confirmed payment FIFO within the current assignment before recording new intent", async () => {
    f.config.set("VEHICLE_HISTORY_SYNTHETIC_DAILY_STAFF_SLOTS", 2);
    const older = await accepted("pdf"), newer = await accepted("pdf", older.operator, ["2026-11-21T07:00:00.000Z", "2026-11-21T08:00:00.000Z"]);
    await pay(older);
    f.app.get<HistoryClock>(HISTORY_CLOCK).now = () => new Date("2026-11-21T05:01:00.000Z");
    await pay(newer);
    const nextOrder = await f.request.get(`${newer.staff}/order?expectedAssignmentVersion=1`).auth(newer.operator.token, { type: "bearer" }).expect(200);
    const command = { ...start(newer, "pdf", "new_source"), provider: nextOrder.body.fulfilment.accepted.provider };
    expect((await fulfil(newer, command).expect(409)).body.code).toBe("HISTORY_FULFILMENT_FIFO");
    await fulfil(older, start(older, "pdf")).expect(201);
    await fulfil(newer, command).expect(409);
    await fulfil(older, outcome(older, 1, { kind: "no_history" })).expect(201);
    await fulfil(newer, command).expect(201);
  });

  it.each(["start", "retry", "company_correction"] as const)("fences new-source %s before the reserved provider reset", async (kind) => {
    const clock = f.app.get<HistoryClock>(HISTORY_CLOCK);
    const budget = { allowance: 2, resetUtc: "00:00", externalUsage: { "2026-11-21": 2 } };
    f.config.set("VEHICLE_HISTORY_SYNTHETIC_MORNING_SLOTS", 1);
    f.config.set("VEHICLE_HISTORY_SYNTHETIC_PROVIDER_BUDGETS", { Carfax: budget });
    const e = await accepted("pdf", undefined, ["2026-11-22T04:00:00.000Z", "2026-11-22T05:00:00.000Z"]);
    await pay(e);
    const first = start(e, "pdf", "new_source");
    let command: Pick<typeof first, "kind" | "orderId" | "expectedAssignmentVersion" | "expectedVersion" | "attemptKey"> = first;
    let availableAt = "2026-11-22T00:00:00.000Z";
    if (kind !== "start") {
      clock.now = () => new Date("2026-11-22T00:00:00.000Z");
      await fulfil(e, first).expect(201);
      let expectedVersion = 2;
      if (kind === "retry") {
        await fulfil(e, outcome(e, 1, { kind: "uncertain" })).expect(201);
        await fulfil(e, outcome(e, 2, { kind: "not_started" }, "reconcile")).expect(201);
        expectedVersion = 3;
      } else {
        await fulfil(e, outcome(e, 1, { kind: "company_error" })).expect(201);
      }
      f.config.set("VEHICLE_HISTORY_SYNTHETIC_PROVIDER_BUDGETS", { Carfax: { ...budget, resetUtc: "02:00" } });
      availableAt = "2026-11-22T02:00:00.000Z";
      command = { kind, orderId: e.id, expectedAssignmentVersion: 1, expectedVersion, attemptKey: randomUUID() };
    }
    const before = (await e.read().expect(200)).body;
    const refusal = await fulfil(e, command).expect(409);
    expect(refusal.body.code).toBe("HISTORY_ORDER_CAPACITY");
    expect((await e.read().expect(200)).body).toEqual(before);
    expect(await f.prisma.historyFulfilmentEvent.count({ where: { requestId: e.id } })).toBe(command.expectedVersion);
    clock.now = () => new Date(availableAt);
    const allowed = await fulfil(e, command).expect(201);
    expect(allowed.body.intent).toMatchObject({ id: first.attemptKey, status: "pending", attempt: kind === "start" ? 1 : 2 });
  });

  it("makes company correction a distinct, capacity-limited action without a second charge", async () => {
    const e = await accepted("pdf");
    await pay(e);
    const payment = (await e.read().expect(200)).body.payment;
    const command = start(e, "pdf", "new_source");
    await fulfil(e, command).expect(201);
    await fulfil(e, outcome(e, 1, { kind: "company_error" })).expect(201);
    const correction = { kind: "company_correction", orderId: e.id, expectedAssignmentVersion: 1, expectedVersion: 2, attemptKey: randomUUID() };
    await fulfil(e, { ...correction, kind: "retry" }).expect(409);
    const budget = { allowance: 1, resetUtc: "00:00", externalUsage: {} };
    f.config.set("VEHICLE_HISTORY_SYNTHETIC_PROVIDER_BUDGETS", { Carfax: budget });
    expect((await fulfil(e, correction).expect(409)).body.code).toBe("HISTORY_ORDER_CAPACITY");
    f.config.set("VEHICLE_HISTORY_SYNTHETIC_PROVIDER_BUDGETS", { Carfax: { ...budget, allowance: 2 } });
    const corrected = (await fulfil(e, correction).expect(201)).body;
    expect(corrected.intent).toMatchObject({ id: command.attemptKey, funding: "company", attempt: 2 });
    expect((await fulfil(e, correction).expect(201)).body).toEqual(corrected);
    expect((await e.read().expect(200)).body).toMatchObject({ payment, wallet: null, companyFundedCorrection: true });
    expect(await f.prisma.historyPaymentCheck.count({ where: { requestId: e.id } })).toBe(1);
  });
});
