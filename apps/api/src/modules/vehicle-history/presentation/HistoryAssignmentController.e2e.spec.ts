import "reflect-metadata";
import { randomUUID } from "node:crypto";
import { request as httpRequest } from "node:http";
import { JwtService } from "@nestjs/jwt";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
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
  const handover = (actor: Actor, id: string, targetOperatorId: string, version = 1) => f.request.post(`${path}/${id}/handover`)
    .auth(actor.token, { type: "bearer" }).send({ targetOperatorId, expectedAssignmentVersion: version });
  async function enquiry() {
    const customer = await f.actor(null);
    const attemptKey = randomUUID();
    const body = (await f.request.post("/api/v1/vehicle-history/requests").auth(customer.token, { type: "bearer" })
      .send({ attemptKey, sourceListingId: randomUUID() }).expect(201)).body;
    return { customer, body, attemptKey };
  }
  it("hands one enquiry to a named eligible operator while the customer keeps access", async () => {
    const { customer, body } = await enquiry(), first = await f.actor(), next = await f.actor();
    await claim(first, body.id).expect(201);
    await handover(first, body.id, next.user.id, 0).expect(409);
    const response = await handover(first, body.id, next.user.id).expect(201);
    expect(response.body).toEqual({ id: body.id, assignmentVersion: 2,
      assignedOperator: { id: next.user.id, displayName: "Ayna", nameNumber: 1213 } });
    await get(first, `/${body.id}`).expect(403);
    await f.request.get(`${path}/${body.id}/notes?expectedAssignmentVersion=1`).auth(first.token, { type: "bearer" }).expect(403);
    await f.request.get(`${path}/${body.id}/messages?expectedAssignmentVersion=1`).auth(first.token, { type: "bearer" }).expect(403);
    expect((await get(first, `?filter=mine&search=${body.id}`).expect(200)).body.items).toEqual([]);
    expect((await get(next, `/${body.id}`).expect(200)).body).toMatchObject({ id: body.id, assignmentVersion: 2, mine: true });
    await f.request.get(`${path}/${body.id}/notes?expectedAssignmentVersion=2`).auth(next.token, { type: "bearer" }).expect(200);
    expect((await get(next, `?filter=mine&search=${body.id}`).expect(200)).body.items).toHaveLength(1);
    expect((await f.request.get(`/api/v1/vehicle-history/requests/${body.id}`).auth(customer.token, { type: "bearer" })
      .expect(200)).body).toMatchObject({ id: body.id, assignmentVersion: 2,
        assignedOperator: { id: next.user.id, displayName: "Ayna", nameNumber: 1213 } });
  });
  it.each(["unknown", "wrong-purpose", "revoked", "suspended", "non-tester"] as const)(
    "does not hand protected work to a %s target", async (state) => {
      const { body } = await enquiry(), first = await f.actor(), next = await f.actor();
      await claim(first, body.id).expect(201);
      if (state === "wrong-purpose") await f.prisma.staffGrant.update({ where: { userId_purpose: {
        userId: next.user.id, purpose: "vehicle_history" } }, data: { purpose: "vehicle_history_payment_evidence" } });
      if (state === "revoked") await f.prisma.staffGrant.update({ where: { userId_purpose: {
        userId: next.user.id, purpose: "vehicle_history" } }, data: { revokedAt: new Date() } });
      if (state === "suspended") await f.prisma.user.update({ where: { id: next.user.id }, data: { suspendedAt: new Date() } });
      if (state === "non-tester") f.config.set("VEHICLE_HISTORY_SYNTHETIC_USER_IDS", first.user.id);
      await handover(first, body.id, state === "unknown" ? randomUUID() : next.user.id).expect(403);
      expect((await get(first, `/${body.id}`).expect(200)).body.assignmentVersion).toBe(1);
    });
  it("offers only eligible named History operators to a current operator", async () => {
    const current = await f.actor(), eligible = await f.actor(), revoked = await f.actor(), customer = await f.actor(null);
    await f.prisma.staffGrant.update({ where: { userId_purpose: { userId: revoked.user.id, purpose: "vehicle_history" } },
      data: { revokedAt: new Date() } });
    const response = await get(current, "/assignees").expect(200);
    expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(response.body.items).toContainEqual({ id: eligible.user.id, displayName: "Ayna", nameNumber: 1213 });
    expect(response.body.items.map((item: { id: string }) => item.id)).not.toContain(current.user.id);
    expect(response.body.items.map((item: { id: string }) => item.id)).not.toContain(revoked.user.id);
    expect(response.body.items.map((item: { id: string }) => item.id)).not.toContain(customer.user.id);
    expect(response.body.items.every((item: object) => Object.keys(item).sort().join(",") === "displayName,id,nameNumber")).toBe(true);
    await get(customer, "/assignees").expect(403);
  });
  it("allows only one of two simultaneous named handovers and refuses the old version", async () => {
    const { body } = await enquiry(), first = await f.actor(), a = await f.actor(), b = await f.actor();
    await claim(first, body.id).expect(201);
    f.concurrent(2);
    const responses = await Promise.all([a, b].map((target) => handover(first, body.id, target.user.id)));
    expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
    const winner = responses[0]!.status === 201 ? a : b;
    await handover(first, body.id, winner.user.id).expect(409);
    expect((await get(winner, `/${body.id}`).expect(200)).body.assignmentVersion).toBe(2);
    await get(first, `/${body.id}`).expect(403);
  });
  it("keeps an assigned claim from winning against a concurrent handover", async () => {
    const { body } = await enquiry(), first = await f.actor(), next = await f.actor(), claimant = await f.actor();
    await claim(first, body.id).expect(201);
    f.concurrent(2);
    const [moved, contested] = await Promise.all([
      handover(first, body.id, next.user.id).set("x-history-concurrency", "handover"),
      claim(claimant, body.id, 1).set("x-history-concurrency", "claim"),
    ]);
    expect([moved.status, contested.status]).toEqual([201, 409]);
    expect((await get(next, `/${body.id}`).expect(200)).body.assignmentVersion).toBe(2);
    await get(first, `/${body.id}`).expect(403);
  });

  it.each(["source", "target"] as const)("keeps the original assignee when %s authority disappears during a DB wait", async (lost) => {
    const { body } = await enquiry(), first = await f.actor(), next = await f.actor();
    await claim(first, body.id).expect(201);
    let pending: Promise<{ status: number }> | undefined;
    await f.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM vehicle_history_requests WHERE id = ${body.id} FOR UPDATE`;
      pending = handover(first, body.id, next.user.id).then((result) => result);
      await eventually(async () => {
        const [row] = await f.prisma.$queryRaw<{ waiting: boolean }[]>`SELECT EXISTS (
          SELECT 1 FROM pg_stat_activity WHERE wait_event_type = 'Lock'
          AND query LIKE '%vehicle_history_requests%' AND pid <> pg_backend_pid()
        ) AS waiting`;
        return row?.waiting ? true : null;
      }, { timeoutMs: 2500, intervalMs: 20, description: "the handover blocked behind the owned DB lock" });
      await f.prisma.staffGrant.update({ where: { userId_purpose: { userId: (lost === "source" ? first : next).user.id,
        purpose: "vehicle_history" } }, data: { revokedAt: new Date() } });
    });
    expect((await pending)?.status).toBe(403);
    expect((await f.prisma.vehicleHistoryRequest.findUniqueOrThrow({ where: { id: body.id } })).assignedOperatorId).toBe(first.user.id);
    expect((await f.prisma.vehicleHistoryRequest.findUniqueOrThrow({ where: { id: body.id } })).assignmentVersion).toBe(1);
  });
  it.each(["source", "target"] as const)("refuses handover when %s authority is revoked while waiting on the recipient User", async (lost) => {
    const { body } = await enquiry(), first = await f.actor(), next = await f.actor();
    await claim(first, body.id).expect(201);
    let pending: Promise<{ status: number }> | undefined;
    await f.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${next.user.id} FOR UPDATE`;
      pending = handover(first, body.id, next.user.id).then((result) => result);
      await eventually(async () => {
        const [row] = await tx.$queryRaw<{ waiting: boolean }[]>`SELECT EXISTS (
          SELECT 1 FROM pg_stat_activity WHERE wait_event_type = 'Lock'
          AND pg_backend_pid() = ANY(pg_blocking_pids(pid))
        ) AS waiting`;
        return row?.waiting ? true : null;
      }, { timeoutMs: 2500, intervalMs: 20, description: "handover waiting on the recipient User lock" });
      await tx.staffGrant.update({ where: { userId_purpose: { userId: (lost === "source" ? first : next).user.id,
        purpose: "vehicle_history" } }, data: { revokedAt: new Date() } });
    });
    expect((await pending)?.status).toBe(403);
    expect(await f.prisma.vehicleHistoryRequest.findUnique({ where: { id: body.id },
      select: { assignedOperatorId: true, assignmentVersion: true } })).toEqual({ assignedOperatorId: first.user.id, assignmentVersion: 1 });
  });
  it("exposes public enquiry metadata and requires a claim before selected reads", async () => {
    const customer = await f.actor(null), operator = await f.actor();
    const created = (await f.request.post("/api/v1/vehicle-history/requests").auth(customer.token, { type: "bearer" })
      .send({ attemptKey: randomUUID(), sourceListingId: randomUUID() }).expect(201)).body;
    const page = await f.request.get(path).auth(operator.token, { type: "bearer" }).expect(200);
    expect(page.headers["cache-control"]).toBe("private, no-store");
    expect(page.body).toEqual({ items: [{ id: created.id, createdAt: created.createdAt,
      status: "enquiry", assignmentVersion: 0, mine: false, assignedOperator: null,
      requester: { displayName: "Ayna", nameNumber: 1213, deleted: false } }], nextCursor: null });
    await f.request.get(`${path}/${created.id}`).auth(operator.token, { type: "bearer" }).expect(403);
  });

  it("fills sparse name-search pages across all eligible candidates without gaps or private fields", async () => {
    const match = await f.actor(null), noise = await f.actor(null), operator = await f.actor(), other = await f.actor();
    await f.prisma.user.update({ where: { id: match.user.id }, data: { displayName: "Dünýä Sparse", role: "admin" } });
    const rows = Array.from({ length: 230 }, (_, index) => ({ id: randomUUID(), requesterId: index >= 65 && index % 3 === 2
      ? match.user.id : noise.user.id, attemptKey: randomUUID(), creatorSessionId: noise.session.id, createdAt: new Date(Date.UTC(2026, 10, 15, 0, 0, 230 - index)) }));
    await f.prisma.vehicleHistoryRequest.createMany({ data: rows });
    const hidden = await f.prisma.vehicleHistoryRequest.create({ data: { requesterId: match.user.id, creatorSessionId: match.session.id, attemptKey: randomUUID(),
      assignedOperatorId: other.user.id, assignmentVersion: 1 } });
    const first = (await get(operator, "?filter=unassigned&search=SPARSE").expect(200)).body;
    expect(first.items).toHaveLength(50);
    const second = (await get(operator, `?filter=unassigned&search=SPARSE&cursor=${first.nextCursor}`).expect(200)).body;
    expect(second.items).toHaveLength(5);
    expect(second.nextCursor).toBeNull();
    const all = [...first.items, ...second.items];
    expect(all.map((item: { id: string }) => item.id)).toEqual(rows.filter((row) => row.requesterId === match.user.id).map((row) => row.id));
    expect(new Set(all.map((item: { id: string }) => item.id)).size).toBe(55);
    expect(all[0]).toEqual({ id: rows[65]!.id, createdAt: "2026-11-15T00:02:45.000Z", status: "enquiry",
      assignmentVersion: 0, mine: false, assignedOperator: null, requester: { displayName: "Dünýä Sparse", nameNumber: 1213, deleted: false } });
    expect((await get(operator, `?search=${hidden.id}`).expect(200)).body.items).toEqual([]);
    await get(operator, `?search=Ayna&cursor=${first.nextCursor}`).expect(403);
    expect((await get(operator, "?search=no-such-public-name").expect(200)).body).toEqual({ items: [], nextCursor: null });
    await f.prisma.user.update({ where: { id: match.user.id }, data: { displayName: null, nameNumber: 4837 } });
    expect((await get(operator, "?search=Sparse").expect(200)).body.items).toEqual([]);
    for (const name of ["Driver 4837", "Водитель 4837", "Sürüji 4837"]) {
      expect((await get(operator, `?search=${encodeURIComponent(name)}`).expect(200)).body.items).toHaveLength(50);
    }
    const reference = rows[65]!.id;
    expect((await get(operator, `?search=${reference.toUpperCase()}`).expect(200)).body.items).toHaveLength(1);
  });

  it("uses Identity's deleted presentation and immutable untrusted source context only for the current assignee", async () => {
    const { customer, body } = await enquiry(), operator = await f.actor();
    await f.prisma.user.update({ where: { id: customer.user.id }, data: { email: null, emailVerifiedAt: null, displayName: "Old private name" } });
    const queue = (await get(operator, `?search=${body.id}`).expect(200)).body.items[0];
    expect(queue.requester).toEqual({ displayName: null, nameNumber: 1213, deleted: true });
    const selected = (await claim(operator, body.id).expect(201)).body;
    expect(selected).toEqual({ ...queue, mine: true, assignmentVersion: 1, sourceListingId: body.sourceListingId,
      assignedOperator: { id: operator.user.id, displayName: "Ayna", nameNumber: 1213 } });
    expect((await get(operator, `/${body.id}`).expect(200)).body).toEqual(selected);
    expect((await get(operator, "?search=Old%20private%20name").expect(200)).body.items).toEqual([]);
  });

  it.each(["queue", "detail", "claim"])("refuses delayed %s projection after real session, grant or assignment loss", async (kind) => {
    for (const lost of ["session", "grant", "assignment"]) {
      const { body } = await enquiry(), operator = await f.actor(), other = await f.actor();
      if (kind !== "claim") await claim(operator, body.id).expect(201);
      let arrive!: () => void, release!: () => void;
      const arrived = new Promise<void>((resolve) => { arrive = resolve; });
      const ready = new Promise<void>((resolve) => { release = resolve; });
      const original = f.prisma.user.findMany.bind(f.prisma.user);
      // Delay only the database boundary; public identity and all authority reads remain real.
      const delay = vi.spyOn(f.prisma.user, "findMany").mockImplementationOnce(((...args: Parameters<typeof original>) =>
        (async () => { arrive(); await ready; return original(...args); })()) as typeof original);
      const pending = (kind === "queue" ? get(operator, `?filter=mine&search=${body.id}`) : kind === "detail"
        ? get(operator, `/${body.id}`) : claim(operator, body.id)).then((response) => response);
      try {
        await arrived;
        if (lost === "session") await f.prisma.session.delete({ where: { id: operator.session.id } });
        if (lost === "grant") await f.prisma.staffGrant.update({ where: { userId_purpose: { userId: operator.user.id, purpose: "vehicle_history" } }, data: { revokedAt: new Date() } });
        if (lost === "assignment") await f.prisma.vehicleHistoryRequest.update({ where: { id: body.id }, data: { assignedOperatorId: other.user.id, assignmentVersion: 2 } });
      } finally { release(); }
      const response = await pending;
      delay.mockRestore();
      expect(response.status).toBe(lost === "assignment" ? 409 : 403);
      expect(response.headers["cache-control"]).toBe("private, no-store");
      expect(Object.keys(response.body).sort()).toEqual(["code", "message", "statusCode"]);
    }
  });

  it("arbitrates competing operators, safely retries the owner and projects only public identity to the requester", async () => {
    const { customer, body, attemptKey } = await enquiry(), a = await f.actor(), b = await f.actor();
    await claim(a, body.id, 1).expect(409);
    f.concurrent(2);
    const responses = await Promise.all([a, b].map((actor) => claim(actor, body.id).set("x-history-concurrency", "claim")));
    expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
    const winner = responses[0]!.status === 201 ? a : b, loser = winner === a ? b : a;
    const assigned = { ...body, assignmentVersion: 1,
      assignedOperator: { id: winner.user.id, displayName: "Ayna", nameNumber: 1213 } };
    const context = { ...assigned, mine: true, requester: { displayName: "Ayna", nameNumber: 1213, deleted: false } };
    expect(responses.find((response) => response.status === 201)!.body).toEqual(context);
    expect((await claim(winner, body.id).expect(201)).body).toEqual(context);
    expect((await claim(winner, body.id, 1).expect(201)).body).toEqual(context);
    expect((await get(winner, `/${body.id}`).expect(200)).body).toEqual(context);
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
      .toEqual([{ id: body.id, createdAt: body.createdAt, status: "enquiry", assignmentVersion: 1, mine: true, requester: { displayName: "Ayna", nameNumber: 1213, deleted: false },
        assignedOperator: assigned.assignedOperator }]);
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
      { id: body.id, createdAt: body.createdAt, status: "enquiry", assignmentVersion: 0, mine: false, assignedOperator: null,
        requester: { displayName: "Ayna", nameNumber: 1213, deleted: false } },
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
    await get(operator, "/bad").expect(400);
    const malformed = await f.request.post(`${path}/${body.id}/claim`).auth(operator.token, { type: "bearer" })
      .set("Content-Type", "application/json").send('{"expectedAssignmentVersion":').expect(400);
    expect(malformed.headers["cache-control"]).toBe("private, no-store");
    expect(malformed.body.code).toBe("HISTORY_REQUEST_INVALID");
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
