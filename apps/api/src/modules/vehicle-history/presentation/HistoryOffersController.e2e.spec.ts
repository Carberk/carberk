import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { historyFixture } from "../../../../test/helpers/historyFixture";
import { eventually } from "../../../../test/helpers/eventually";
import { HISTORY_CLOCK, type HistoryClock } from "../vehicle-history.public";

const requests = "/api/v1/vehicle-history/requests";
const staff = "/api/v1/vehicle-history/operator/requests";
const vin = "DEMA0000000000001";
const proposal = { kind: "propose", expectedAssignmentVersion: 1, expectedVersion: 1, format: "pdf",
  deliveryFrom: "2026-11-21T06:00:00.000Z", deliveryBy: "2026-11-21T07:00:00.000Z" };
describe("VIN preflight and quote preview over current-authorized HTTP/Postgres", () => {
  let f: Awaited<ReturnType<typeof historyFixture>>;
  beforeAll(async () => {
    f = await historyFixture();
    f.config.set("VEHICLE_HISTORY_SYNTHETIC_DAILY_STAFF_SLOTS", 4);
    f.app.get<HistoryClock>(HISTORY_CLOCK).now = () => new Date("2026-11-21T05:00:00.000Z");
  });
  afterAll(async () => { await f?.close(); });
  async function enquiry() {
    const customer = await f.actor(null), operator = await f.actor();
    const id = (await f.request.post(requests).auth(customer.token, { type: "bearer" }).send({ attemptKey: randomUUID(), sourceListingId: randomUUID() }).expect(201)).body.id as string;
    await f.request.post(`${staff}/${id}/claim`).auth(operator.token, { type: "bearer" }).send({ expectedAssignmentVersion: 0 }).expect(201);
    const write = (body: object) => f.request.post(`${staff}/${id}/offer`).auth(operator.token, { type: "bearer" }).send(body);
    const read = () => f.request.get(`${requests}/${id}/offer`).auth(customer.token, { type: "bearer" });
    return { customer, operator, id, write, read };
  }
  it("normalizes harmless characters, persists both providers/dates and previews each explicit format without an order", async () => {
    const e = await enquiry();
    expect((await e.read().expect(200)).body).toEqual({ version: 0, vin: null, preflight: null, proposal: null, synthetic: true });
    const check = await e.write({ kind: "check", vin: " dema 0000000000001\n", expectedVersion: 0, expectedAssignmentVersion: 1 }).expect(201);
    expect(check.headers["cache-control"]).toBe("private, no-store");
    expect(check.body).toEqual({ version: 1, vin, synthetic: true, proposal: null, preflight: { status: "available", providers: [
      { name: "Carfax", originalReportDate: "2026-10-14" }, { name: "AutoCheck", originalReportDate: "2026-10-15" },
    ] } });
    for (const [index, format] of ["pdf", "link", "both"].entries()) {
      const result = (await e.write({ ...proposal, expectedVersion: index + 1, format }).expect(201)).body;
      expect(result.proposal).toEqual({ format, deliveryFrom: proposal.deliveryFrom, deliveryBy: proposal.deliveryBy, priceTmt: 100,
        providerRule: "either_available_both_when_obtainable", terms: "service_failure_review" });
      expect((await e.read().expect(200)).body).toEqual(result);
    }
    const detail = (await f.request.get(`${requests}/${e.id}`).auth(e.customer.token, { type: "bearer" }).expect(200)).body;
    expect(detail).toMatchObject({ status: "enquiry", sourceListingId: expect.any(String) });
    expect((await f.request.get(`${requests}/${e.id}/messages`).auth(e.customer.token, { type: "bearer" }).expect(200)).body.items).toEqual([]);
    await e.write(proposal).expect(409);
    const changed = await f.request.post(`${requests}/${e.id}/offer`).auth(e.customer.token, { type: "bearer" })
      .send({ kind: "vin", vin: "DEMA0000000000006", expectedVersion: 4 }).expect(201);
    expect(changed.body).toMatchObject({ vin: "DEMA0000000000006", preflight: null, proposal: null });
    const single = await e.write({ kind: "check", vin: "DEMA0000000000006", expectedVersion: 5, expectedAssignmentVersion: 1 }).expect(201);
    expect(single.body.preflight).toEqual({ status: "available", providers: [{ name: "AutoCheck", originalReportDate: null }] });
  });
  it.each([["INVALID-O", "malformed"], ["DEMA0000000000002", "unsupported"], ["DEMA0000000000003", "no_history"],
    ["DEMA0000000000004", "mismatch"], ["DEMA0000000000005", "outage"], ["1HGCM82633A004352", "unsupported"]])(
    "keeps %s distinct as %s and refuses a proposal", async (input, status) => {
      const e = await enquiry();
      const result = await e.write({ kind: "check", vin: input, expectedVersion: 0, expectedAssignmentVersion: 1 }).expect(201);
      expect(result.body).toMatchObject({ vin: input, preflight: { status }, proposal: null });
      await e.write(proposal).expect(400);
      expect((await e.read().expect(200)).body).toEqual(result.body);
    });
  it("refuses unselected formats, invalid windows, provider spoofing and concurrent stale updates", async () => {
    const e = await enquiry();
    await e.write({ kind: "check", vin, expectedVersion: 0, expectedAssignmentVersion: 1 }).expect(201);
    for (const input of [{ ...proposal, format: undefined }, { ...proposal, deliveryFrom: "2026-11-21T03:00:00.000Z" },
      { ...proposal, deliveryBy: "2026-11-21T16:00:00.000Z" }, { ...proposal, providers: ["Carfax"] }, { ...proposal, payment: true }]) await e.write(input).expect(400);
    const results = await Promise.all([e.write(proposal), e.write({ ...proposal, format: "link" })]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
  });
  it("retains the requester while refusing unrelated customers, former staff, stale versions and revoked sessions", async () => {
    const e = await enquiry(), next = await f.actor(), stranger = await f.actor(null);
    await e.write({ kind: "check", vin, expectedVersion: 0, expectedAssignmentVersion: 1 }).expect(201);
    await e.write(proposal).expect(201);
    await f.request.get(`${requests}/${e.id}/offer`).auth(stranger.token, { type: "bearer" }).expect(403);
    await f.request.get(`${staff}/${e.id}/offer?expectedAssignmentVersion=1`).auth(next.token, { type: "bearer" }).expect(403);
    await f.prisma.vehicleHistoryRequest.update({ where: { id: e.id }, data: { assignedOperatorId: next.user.id, assignmentVersion: 2 } });
    await e.write({ ...proposal, expectedVersion: 2 }).expect(403);
    await f.request.get(`${staff}/${e.id}/offer?expectedAssignmentVersion=1`).auth(next.token, { type: "bearer" }).expect(409);
    expect((await e.read().expect(200)).body.proposal.format).toBe("pdf");
    await f.prisma.session.delete({ where: { id: next.session.id } });
    const denial = await f.request.get(`${staff}/${e.id}/offer?expectedAssignmentVersion=2`).auth(next.token, { type: "bearer" }).expect(403);
    expect(denial.headers["cache-control"]).toBe("private, no-store"); expect(JSON.stringify(denial.body)).not.toContain(vin);
    f.config.set("APP_ENV", "staging");
    await e.read().expect(403);
  });
  it.each(["grant", "suspended", "totp", "session"])("refuses the offer after current operator %s authority ends", async (loss) => {
    const e = await enquiry();
    await e.write({ kind: "check", vin, expectedVersion: 0, expectedAssignmentVersion: 1 }).expect(201);
    if (loss === "grant") await f.prisma.staffGrant.update({ where: { userId_purpose: { userId: e.operator.user.id, purpose: "vehicle_history" } }, data: { revokedAt: new Date() } });
    else if (loss === "suspended") await f.prisma.user.update({ where: { id: e.operator.user.id }, data: { suspendedAt: new Date() } });
    else await f.prisma.session.update({ where: { id: e.operator.session.id }, data: loss === "totp" ? { adminTotpExpiresAt: new Date(0) } : { expiresAt: new Date(0) } });
    const refusal = await e.write(proposal).expect(403);
    expect(refusal.headers["cache-control"]).toBe("private, no-store");
    expect(JSON.stringify(refusal.body)).not.toContain(vin);
    expect((await e.read().expect(200)).body.proposal).toBeNull();
  });
  it("keeps malformed HTTP private and localizes offer recovery without reflecting VIN inputs", async () => {
    const e = await enquiry();
    for (const locale of ["en", "ru", "tk"]) {
      const refusal = await f.request.post(`${staff}/${e.id}/offer`).auth(e.operator.token, { type: "bearer" })
        .set("Accept-Language", locale).set("Content-Type", "application/json").send('{"vin":').expect(400);
      expect(refusal.headers["cache-control"]).toBe("private, no-store");
      expect(refusal.body.code).toBe("HISTORY_OFFER_INVALID");
      expect(refusal.body.message).toContain("09:00–20:00");
    }
  });
  it("rechecks assignment after a real DB lock wait before proposing", async () => {
    const e = await enquiry(), next = await f.actor();
    await e.write({ kind: "check", vin, expectedVersion: 0, expectedAssignmentVersion: 1 }).expect(201);
    let pending: Promise<unknown> | undefined;
    await f.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM vehicle_history_requests WHERE id = ${e.id} FOR UPDATE`;
      pending = e.write(proposal).expect(403).then((response) => response);
      await eventually(async () => {
        const [row] = await f.prisma.$queryRaw<{ waiting: boolean }[]>`SELECT EXISTS (
          SELECT 1 FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'
          AND query LIKE '%vehicle_history_requests%' AND pid <> pg_backend_pid()) AS waiting`;
        return row?.waiting ? true : null;
      }, { timeoutMs: 2500, intervalMs: 20, description: "proposal waiting on request writer" });
      await tx.vehicleHistoryRequest.update({ where: { id: e.id }, data: { assignedOperatorId: next.user.id, assignmentVersion: 2 } });
    }, { timeout: 10_000 });
    await pending;
    expect((await e.read().expect(200)).body.proposal).toBeNull();
  });
});
