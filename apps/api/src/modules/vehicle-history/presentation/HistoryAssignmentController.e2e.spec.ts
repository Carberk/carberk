import "reflect-metadata";
import { randomUUID } from "node:crypto";
import { request as httpRequest } from "node:http";
import { JwtService } from "@nestjs/jwt";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { historyFixture } from "../../../../test/helpers/historyFixture";
import { eventually } from "../../../../test/helpers/eventually";

const path = "/api/v1/vehicle-history/operator/requests";
describe("Current History assignment over listening HTTP", () => {
  let f: Awaited<ReturnType<typeof historyFixture>>;
  beforeAll(async () => { f = await historyFixture(); });
  afterAll(async () => { await f?.close(); });
  type Actor = Awaited<ReturnType<typeof f.actor>>;
  const get = (actor: Actor, suffix = "") => f.request.get(path + suffix).auth(actor.token, { type: "bearer" });
  const claim = (actor: Actor, id: string, version = 0) => f.request.post(`${path}/${id}/claim`)
    .auth(actor.token, { type: "bearer" }).send({ expectedAssignmentVersion: version });
  async function enquiry() {
    const customer = await f.actor(null);
    const attemptKey = randomUUID();
    const body = (await f.request.post("/api/v1/vehicle-history/requests").auth(customer.token, { type: "bearer" })
      .send({ attemptKey, sourceListingId: randomUUID() }).expect(201)).body;
    return { customer, body, attemptKey };
  }
  it("exposes only minimal unassigned metadata and requires a claim before selected reads", async () => {
    const customer = await f.actor(null), operator = await f.actor();
    const created = (await f.request.post("/api/v1/vehicle-history/requests").auth(customer.token, { type: "bearer" })
      .send({ attemptKey: randomUUID(), sourceListingId: randomUUID() }).expect(201)).body;
    const page = await f.request.get(path).auth(operator.token, { type: "bearer" }).expect(200);
    expect(page.headers["cache-control"]).toBe("private, no-store");
    expect(page.body).toEqual({ items: [{ id: created.id, createdAt: created.createdAt,
      status: "enquiry", assignmentVersion: 0, mine: false }], nextCursor: null });
    await f.request.get(`${path}/${created.id}`).auth(operator.token, { type: "bearer" }).expect(403);
  });

  it("arbitrates competing operators, safely retries the owner and projects only public identity to the requester", async () => {
    const { customer, body, attemptKey } = await enquiry(), a = await f.actor(), b = await f.actor();
    await claim(a, body.id, 1).expect(409);
    f.concurrent(2);
    const responses = await Promise.all([a, b].map((actor) => claim(actor, body.id).set("x-history-concurrency", "claim")));
    expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
    const winner = responses[0]!.status === 201 ? a : b, loser = winner === a ? b : a;
    const assigned = responses.find((response) => response.status === 201)!.body;
    expect(assigned).toEqual({ ...body, assignmentVersion: 1,
      assignedOperator: { id: winner.user.id, displayName: "Ayna", nameNumber: 1213 } });
    expect((await claim(winner, body.id).expect(201)).body).toEqual(assigned);
    expect((await claim(winner, body.id, 1).expect(201)).body).toEqual(assigned);
    expect((await get(winner, `/${body.id}`).expect(200)).body).toEqual(assigned);
    const stale = await claim(winner, body.id, 2).expect(409);
    expect(stale.body).toEqual({ statusCode: 409, code: "HISTORY_ASSIGNMENT_CONFLICT",
      message: "Assignment changed. Refresh the History inbox before trying again." });
    const customerPath = `/api/v1/vehicle-history/requests/${body.id}`;
    expect((await f.request.get(customerPath).auth(customer.token, { type: "bearer" }).expect(200)).body).toEqual(assigned);
    const customerList = await f.request.get("/api/v1/vehicle-history/requests").auth(customer.token, { type: "bearer" }).expect(200);
    expect(customerList.body.items).toEqual([assigned]);
    expect((await f.request.post("/api/v1/vehicle-history/requests").auth(customer.token, { type: "bearer" })
      .send({ attemptKey, sourceListingId: body.sourceListingId }).expect(201)).body).toEqual(assigned);
    const denied = await get(loser, `/${body.id}`).expect(403);
    expect(denied.body).toEqual((await get(loser, `/${randomUUID()}`).expect(403)).body);
    expect((await get(loser, `?cursor=${body.id}`).expect(403)).body)
      .toEqual((await get(loser, `?cursor=${randomUUID()}`).expect(403)).body);
    expect((await get(loser, `?search=${body.id}`).expect(200)).body.items).toEqual([]);
    expect((await get(winner, `?filter=mine&search=${body.id}`).expect(200)).body.items)
      .toEqual([{ id: body.id, createdAt: body.createdAt, status: "enquiry", assignmentVersion: 1, mine: true }]);
    expect((await get(winner, `?filter=unassigned&search=${body.id}`).expect(200)).body.items).toEqual([]);
    // Handover has no action in A. Seed its future durable state to prove old-owner fences.
    await f.prisma.vehicleHistoryRequest.update({ where: { id: body.id },
      data: { assignedOperatorId: loser.user.id, assignmentVersion: 2 } });
    await get(winner, `/${body.id}`).expect(403);
    await claim(winner, body.id).expect(409);
    await get(winner, `?cursor=${body.id}`).expect(403);
    expect((await get(loser, `/${body.id}`).expect(200)).body.assignmentVersion).toBe(2);
    await claim(loser, body.id, 1).expect(409);
    await claim(loser, body.id, 0).expect(409);
  });

  it("recovers a claim whose committed HTTP response bytes were lost, but rechecks authority before retry", async () => {
    const { body } = await enquiry(), operator = await f.actor();
    const origin = await f.app.getUrl();
    await new Promise<void>((resolve, reject) => {
      const outgoing = httpRequest(`${origin}${path}/${body.id}/claim`, { method: "POST", headers: {
        authorization: `Bearer ${operator.token}`, "content-type": "application/json",
      } }, (response) => {
        const status = response.statusCode;
        response.destroy(); // Discard actual response bytes after the DB commit.
        if (status === 201) resolve(); else reject(new Error("Claim was not committed"));
      });
      outgoing.on("error", reject);
      outgoing.end(JSON.stringify({ expectedAssignmentVersion: 0 }));
    });
    const original = (await claim(operator, body.id).expect(201)).body;
    expect(original.assignmentVersion).toBe(1);
    expect((await get(operator, `/${body.id}`).expect(200)).body).toEqual(original);
    await f.prisma.staffGrant.update({ where: { userId_purpose: { userId: operator.user.id, purpose: "vehicle_history" } },
      data: { revokedAt: new Date() } });
    await claim(operator, body.id).expect(403);
  });

  it("leaves an enquiry unassigned when operator authority is revoked while its claim waits for a DB writer", async () => {
    const { body } = await enquiry(), operator = await f.actor();
    let response: Promise<{ status: number }> | undefined;
    await f.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM vehicle_history_requests WHERE id = ${body.id} FOR UPDATE`;
      response = claim(operator, body.id).then((result) => result);
      await eventually(async () => {
        const [row] = await f.prisma.$queryRaw<{ waiting: boolean }[]>`SELECT EXISTS (
          SELECT 1 FROM pg_stat_activity WHERE wait_event_type = 'Lock'
          AND query LIKE '%vehicle_history_requests%' AND pid <> pg_backend_pid()
        ) AS waiting`;
        return row?.waiting ? true : null;
      }, { timeoutMs: 2500, intervalMs: 20, description: "the claim blocked behind the owned DB lock" });
      await f.prisma.staffGrant.update({ where: { userId_purpose: { userId: operator.user.id, purpose: "vehicle_history" } },
        data: { revokedAt: new Date() } });
    });
    expect((await response)?.status).toBe(403);
    const other = await f.actor();
    expect((await get(other, `?search=${body.id}`).expect(200)).body.items).toEqual([
      { id: body.id, createdAt: body.createdAt, status: "enquiry", assignmentVersion: 0, mine: false },
    ]);
  });

  it.each(["buyer", "seller", "dealer", "admin", "evidence", "management", "revoked-grant", "future-grant",
    "revoked-session", "expired-session", "expired-totp", "no-totp", "suspended", "deleting", "purged",
    "borrowed-session", "missing-session", "disabled", "unset", "non-tester", "staging", "production"])(
    "rechecks list, known cursors, claim retries and selected reads for current refusal: %s", async (state) => {
      const { body } = await enquiry(), operator = await f.actor();
      await claim(operator, body.id).expect(201);
      if (["buyer", "seller", "dealer", "admin"].includes(state)) {
        await f.prisma.staffGrant.deleteMany({ where: { userId: operator.user.id } });
        await f.prisma.user.update({ where: { id: operator.user.id }, data: { role: state === "dealer" ? "seller" : state as "buyer" | "seller" | "admin" } });
        if (state === "dealer") {
          await f.prisma.dealership.create({ data: { slug: operator.user.id, name: "Synthetic History Dealer",
            members: { create: { userId: operator.user.id, role: "owner" } } } });
        }
      }
      if (["evidence", "management", "revoked-grant", "future-grant"].includes(state)) {
        await f.prisma.staffGrant.update({ where: { userId_purpose: { userId: operator.user.id, purpose: "vehicle_history" } }, data:
          state === "evidence" ? { purpose: "vehicle_history_payment_evidence" } : state === "management" ? { purpose: "vehicle_history_staff_management" }
            : state === "revoked-grant" ? { revokedAt: new Date() } : { grantedAt: new Date(Date.now() + 60_000) } });
      }
      if (["revoked-session", "expired-session", "expired-totp", "no-totp"].includes(state)) {
        if (state === "revoked-session") await f.prisma.session.delete({ where: { id: operator.session.id } });
        else await f.prisma.session.update({ where: { id: operator.session.id }, data: state === "expired-session"
          ? { expiresAt: new Date(0) } : { adminTotpExpiresAt: state === "no-totp" ? null : new Date(0) } });
      }
      if (["suspended", "deleting", "purged"].includes(state)) await f.prisma.user.update({ where: { id: operator.user.id }, data:
        state === "suspended" ? { suspendedAt: new Date() } : state === "deleting" ? { deletionScheduledAt: new Date() }
          : { email: null, emailVerifiedAt: null } });
      if (state === "borrowed-session" || state === "missing-session") {
        const other = await f.actor();
        operator.token = f.app.get(JwtService).sign({ sub: operator.user.id, role: "admin", purpose: "vehicle-history",
          ...(state === "borrowed-session" ? { sid: other.session.id } : {}) });
      }
      if (state === "disabled" || state === "unset") f.config.set("VEHICLE_HISTORY_SYNTHETIC_ENABLED", state === "disabled" ? false : undefined);
      if (state === "non-tester") f.config.set("VEHICLE_HISTORY_SYNTHETIC_USER_IDS", "");
      if (state === "staging" || state === "production") f.config.set("APP_ENV", state);
      for (const pending of [get(operator), get(operator, `?cursor=${body.id}`), claim(operator, body.id), get(operator, `/${body.id}`)]) {
        const response = await pending.expect(403);
        expect(response.headers["cache-control"]).toBe("private, no-store");
        expect(response.body).toEqual({ statusCode: 403, code: expect.stringMatching(/^HISTORY_(OPERATOR|REQUEST)_DENIED$/), message: expect.any(String) });
      }
    });

  it("pages only mine, binds cursors to current filters and rejects unbounded or forged input", async () => {
    const { customer, body } = await enquiry(), operator = await f.actor();
    const ids = [body.id];
    for (let i = 0; i < 50; i++) ids.push((await f.request.post("/api/v1/vehicle-history/requests")
      .auth(customer.token, { type: "bearer" }).send({ attemptKey: randomUUID() }).expect(201)).body.id);
    for (const id of ids) await claim(operator, id).expect(201);
    const first = (await get(operator, "?filter=mine").expect(200)).body;
    expect(first.items).toHaveLength(50);
    const last = (await get(operator, `?filter=mine&cursor=${first.nextCursor}`).expect(200)).body;
    expect(last.items).toHaveLength(1);
    expect(last.nextCursor).toBeNull();
    expect(new Set([...first.items, ...last.items].map((item: { id: string }) => item.id))).toEqual(new Set(ids));
    await get(operator, `?filter=unassigned&cursor=${first.nextCursor}`).expect(403);
    for (const query of ["?cursor=bad", "?filter=paid", `?search=${"a".repeat(65)}`, "?search=", "?requesterId=forged"]) await get(operator, query).expect(400);
    for (const input of [{}, { expectedAssignmentVersion: -1 }, { expectedAssignmentVersion: 0.5 },
      { expectedAssignmentVersion: 2147483648 }, { expectedAssignmentVersion: 0, assignedOperatorId: operator.user.id }]) {
      await f.request.post(`${path}/${body.id}/claim`).auth(operator.token, { type: "bearer" }).send(input).expect(400);
    }
  });

  it.each(["tk", "ru", "en"])("provides no-store %s conflicts and signed-out refusals without private metadata", async (locale) => {
    const operator = await f.actor();
    const response = await claim(operator, randomUUID()).set("Accept-Language", locale).expect(409);
    expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(response.body.code).toBe("HISTORY_ASSIGNMENT_CONFLICT");
    expect(response.body.message).toContain({ tk: "täzeläň", ru: "Обновите", en: "Refresh" }[locale]!);
    for (const token of [null, "malformed", f.app.get(JwtService).sign({ sub: operator.user.id, sid: operator.session.id }, { expiresIn: -1 })]) {
      for (const [method, suffix] of [["get", ""], ["post", `/${randomUUID()}/claim`], ["get", `/${randomUUID()}`]] as const) {
        const pending = f.request[method](path + suffix).set("Accept-Language", locale);
        if (token) pending.auth(token, { type: "bearer" });
        const denied = await pending.send({ expectedAssignmentVersion: 0 }).expect(401);
        expect(denied.headers["cache-control"]).toBe("private, no-store");
        expect(Object.keys(denied.body).sort()).toEqual(["code", "message", "statusCode"]);
      }
    }
  });
});
