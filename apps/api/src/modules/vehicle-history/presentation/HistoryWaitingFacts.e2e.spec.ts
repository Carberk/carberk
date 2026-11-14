import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { historyFixture } from "../../../../test/helpers/historyFixture";
import { HistoryMessageAccess, type HistoryMessageActor } from "../application/HistoryMessageAccess";
import { HISTORY_CLOCK, HistoryWaiting, type HistoryClock } from "../domain/HistoryWaiting";
import { eventually } from "../../../../test/helpers/eventually";
import type { HistoryWaitingStore } from "../domain/HistoryAssignmentRepository";

describe("Current-authority History waiting facts on the held request connection", () => {
  let f: Awaited<ReturnType<typeof historyFixture>>;
  beforeAll(async () => { f = await historyFixture(); });
  afterAll(async () => { await f?.close(); });

  async function assigned() {
    const customer = await f.actor(null), operator = await f.actor();
    const created = (await f.request.post("/api/v1/vehicle-history/requests").auth(customer.token, { type: "bearer" })
      .send({ attemptKey: randomUUID(), sourceListingId: randomUUID() }).expect(201)).body;
    const path = `/api/v1/vehicle-history/operator/requests/${created.id}`;
    const selected = (await f.request.post(path + "/claim").auth(operator.token, { type: "bearer" })
      .send({ expectedAssignmentVersion: 0 }).expect(201)).body;
    const actor: HistoryMessageActor = { claims: { sub: operator.user.id, sid: operator.session.id }, operator: true, expectedAssignmentVersion: 1 };
    return { customer, operator, id: created.id as string, path, selected, actor };
  }

  it("saves and reads on the existing connection, rolls back on failure and preserves the queue/assignment projection", async () => {
    const { id, actor, operator, path, selected } = await assigned();
    const access = f.app.get(HistoryMessageAccess), policy = f.app.get(HistoryWaiting);
    f.app.get<HistoryClock>(HISTORY_CLOCK).now = () => new Date("2026-11-14T23:59:59.123Z");
    const read = () => access.run(actor, id, async (_r, _s, _o, _p, waiting) => waiting.read());
    expect(await read()).toEqual(policy.initial());
    const committed = await access.run(actor, id, async (_r, _s, _o, _p, waiting) => {
      await waiting.save(policy.transition(await waiting.read(), {
        sourceId: "quote-1", sourceVersion: 1, expectedVersion: 0, action: "begin", reason: "quote_choice",
      }));
      return waiting.read();
    });
    expect(committed).toMatchObject({ since: new Date("2026-11-14T23:59:59.123Z"), reason: "quote_choice", version: 1 });
    await expect(access.run(actor, id, async (_r, _s, _o, _p, waiting) => {
      await waiting.save(policy.transition(await waiting.read(), {
        sourceId: "decline", sourceVersion: 2, expectedVersion: 1, action: "decline",
      }));
      expect(await waiting.read()).toMatchObject({ declined: true, since: null, version: 2 });
      throw new Error("test-only rollback");
    })).rejects.toMatchObject({ code: "HISTORY_MESSAGE_UNAVAILABLE" });
    expect(await read()).toEqual(committed);
    expect((await f.request.get(path).auth(operator.token, { type: "bearer" }).expect(200)).body).toEqual(selected);
    const queue = (await f.request.get(`/api/v1/vehicle-history/operator/requests?filter=mine&search=${id}`)
      .auth(operator.token, { type: "bearer" }).expect(200)).body;
    const { sourceListingId: _source, ...item } = selected;
    expect(queue).toEqual({ items: [item], nextCursor: null });
    f.app.get<HistoryClock>(HISTORY_CLOCK).now = () => new Date("2030-11-15T00:00:00.000Z");
    expect(policy.ineligible(committed)).toBeNull();
    expect(await read()).toEqual(committed); // Advancing History time never expires the real Identity session.
  });

  it("persists exact permanent facts and refuses rewinds or replacement of the original outcome", async () => {
    const { id, actor } = await assigned();
    const access = f.app.get(HistoryMessageAccess), policy = f.app.get(HistoryWaiting);
    const original = { messageId: "original", senderId: "first-staff", clientMessageId: "first-attempt",
      text: "  Salam\nDünýä  ", order: 8n, sentAt: new Date("2026-11-15T01:02:03.456Z") };
    let expired!: HistoryWaitingStore;
    const committed = await access.run(actor, id, async (_r, _s, _o, _p, waiting) => {
      expired = waiting;
      let facts = policy.recordOutcome(policy.reduceMessage(await waiting.read(), {
        id: "public-checkpoint", order: 9n, sentAt: new Date("2026-11-15T02:00:00.000Z"), author: "requester", reminder: false,
      }), original);
      facts = policy.transition(facts, { sourceId: "decline", sourceVersion: 1, expectedVersion: 2, action: "decline" });
      facts = policy.transition(facts, { sourceId: "stop", sourceVersion: 2, expectedVersion: 3, action: "stop" });
      facts = policy.transition(facts, { sourceId: "new-wait", sourceVersion: 3, expectedVersion: 4, action: "begin", reason: "quote_choice" });
      await waiting.save(facts);
      return waiting.read();
    });
    expect(committed).toMatchObject({ version: 5, used: true, outcome: original, declined: true, stopped: true,
      publicMessageId: "public-checkpoint", publicMessageOrder: 9n, sourceId: "new-wait", sourceVersion: 3 });
    await expect(expired.read()).rejects.toThrow("History waiting lock has ended");
    for (const invalid of [policy.initial(), { ...committed, version: 6, used: false, outcome: null },
      { ...committed, version: 6, outcome: { ...original, senderId: "replacement" } },
      { ...committed, version: 6, declined: false }, { ...committed, version: 6, stopped: false },
      { ...committed, version: 6, publicMessageId: null, publicMessageOrder: 0n },
      { ...committed, version: 6, sourceId: null, sourceVersion: 0 }]) {
      await expect(access.run(actor, id, async (_r, _s, _o, _p, waiting) => waiting.save(invalid)))
        .rejects.toMatchObject({ code: "HISTORY_MESSAGE_UNAVAILABLE" });
    }
    expect(await access.run(actor, id, async (_r, _s, _o, _p, waiting) => waiting.read())).toEqual(committed);
  });

  async function lockWaiting(table: string) {
    await eventually(async () => {
      const [row] = await f.prisma.$queryRaw<{ waiting: boolean }[]>`SELECT EXISTS (
        SELECT 1 FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'
          AND query LIKE ${`%${table}%`} AND pid <> pg_backend_pid()) AS waiting`;
      return row?.waiting ? true : null;
    }, { timeoutMs: 2500, intervalMs: 20, description: "owned History facet operation waiting on a real row lock" });
  }

  it("serializes a second current-authorized operation until the first same-connection save commits", async () => {
    const { id, actor } = await assigned();
    const access = f.app.get(HistoryMessageAccess), policy = f.app.get(HistoryWaiting);
    let arrived!: () => void, release!: () => void;
    const entered = new Promise<void>((resolve) => { arrived = resolve; });
    const ready = new Promise<void>((resolve) => { release = resolve; });
    const first = access.run(actor, id, async (_r, _s, _o, _p, waiting) => {
      await waiting.save(policy.transition(await waiting.read(), {
        sourceId: "first", sourceVersion: 1, expectedVersion: 0, action: "begin", reason: "customer_answer",
      }));
      arrived(); await ready;
    });
    await entered;
    const second = access.run(actor, id, async (_r, _s, _o, _p, waiting) => {
      expect(await waiting.read()).toMatchObject({ version: 1, sourceId: "first" });
      await waiting.save(policy.transition(await waiting.read(), { sourceId: "second", sourceVersion: 2, expectedVersion: 1, action: "end" }));
      return waiting.read();
    });
    try { await lockWaiting("vehicle_history_requests"); } finally { release(); }
    await first;
    expect(await second).toMatchObject({ version: 2, sourceId: "second", since: null, reason: null });
  });

  it("retains Identity authority through the actual waiting-fact commit", async () => {
    const { id, actor, operator, customer } = await assigned();
    const access = f.app.get(HistoryMessageAccess), policy = f.app.get(HistoryWaiting);
    // Owned test database only: the deferred trigger pauses the real COMMIT.
    await f.prisma.$executeRawUnsafe("CREATE TABLE waiting_commit_gate (id integer PRIMARY KEY)");
    await f.prisma.$executeRawUnsafe("INSERT INTO waiting_commit_gate VALUES (1)");
    await f.prisma.$executeRawUnsafe(`CREATE FUNCTION waiting_commit_barrier() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN PERFORM id FROM waiting_commit_gate WHERE id = 1 FOR UPDATE; RETURN NEW; END $$`);
    await f.prisma.$executeRawUnsafe(`CREATE CONSTRAINT TRIGGER waiting_commit_barrier AFTER UPDATE ON vehicle_history_requests
      DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION waiting_commit_barrier()`);
    let pending: Promise<unknown> | undefined, revoke: Promise<unknown> | undefined, revoked = false;
    try {
      await f.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM waiting_commit_gate WHERE id = 1 FOR UPDATE`;
        pending = access.run(actor, id, async (_r, _s, _o, _p, waiting) => waiting.save(policy.transition(await waiting.read(), {
          sourceId: "commit", sourceVersion: 1, expectedVersion: 0, action: "decline",
        })));
        await lockWaiting("COMMIT");
        revoke = f.prisma.session.delete({ where: { id: operator.session.id } }).then(() => { revoked = true; });
        const state = await eventually(async () => {
          const [row] = await f.prisma.$queryRaw<{ waiting: boolean }[]>`SELECT EXISTS (SELECT 1 FROM pg_stat_activity
            WHERE datname = current_database() AND wait_event_type = 'Lock' AND query LIKE '%DELETE%sessions%') AS waiting`;
          return revoked ? "revoked" : row?.waiting ? "waiting" : null;
        }, { timeoutMs: 2500, intervalMs: 20, description: "session revocation serialized after the facts commit" });
        expect(state).toBe("waiting");
      }, { timeout: 10_000 });
    } finally {
      await Promise.all([pending, revoke]);
      await f.prisma.$executeRawUnsafe("DROP TRIGGER waiting_commit_barrier ON vehicle_history_requests");
      await f.prisma.$executeRawUnsafe("DROP FUNCTION waiting_commit_barrier()");
      await f.prisma.$executeRawUnsafe("DROP TABLE waiting_commit_gate");
    }
    expect(revoked).toBe(true);
    expect(await access.run({ claims: { sub: customer.user.id, sid: customer.session.id }, operator: false }, id,
      async (_r, _s, _o, _p, waiting) => waiting.read())).toMatchObject({ declined: true, version: 1 });
    await expect(access.run(actor, id, async (_r, _s, _o, _p, waiting) => waiting.read()))
      .rejects.toMatchObject({ code: "HISTORY_OPERATOR_DENIED" });
  });

  it.each(["request", "identity"].flatMap((lock) =>
    (lock === "request" ? ["session", "grant", "totp", "lifecycle", "assignment", "version"]
      : ["session", "grant", "totp", "lifecycle"]).map((lost) => [lock, lost])))
    ("rejects a waiting-fact save after the %s wait loses current %s authority", async (lock, lost) => {
    const { id, actor, operator, customer } = await assigned(), other = await f.actor();
    const access = f.app.get(HistoryMessageAccess), policy = f.app.get(HistoryWaiting);
    let pending: Promise<unknown> | undefined;
    await f.prisma.$transaction(async (tx) => {
      if (lock === "request") await tx.$queryRaw`SELECT id FROM vehicle_history_requests WHERE id = ${id} FOR UPDATE`;
      else await tx.$queryRaw`SELECT id FROM users WHERE id = ${operator.user.id} FOR UPDATE`;
      pending = access.run(actor, id, async (_r, _s, _o, _p, waiting) => waiting.save(policy.transition(await waiting.read(), {
        sourceId: "unauthorized", sourceVersion: 1, expectedVersion: 0, action: "decline",
      }))).then(() => null, (error: unknown) => error);
      await lockWaiting(lock === "request" ? "vehicle_history_requests" : "users");
      if (lost === "session") await tx.session.delete({ where: { id: operator.session.id } });
      if (lost === "totp") await tx.session.update({ where: { id: operator.session.id }, data: { adminTotpExpiresAt: null } });
      if (lost === "grant") await tx.staffGrant.update({ where: { userId_purpose: { userId: operator.user.id, purpose: "vehicle_history" } }, data: { revokedAt: new Date() } });
      if (lost === "lifecycle") await tx.user.update({ where: { id: operator.user.id }, data: { suspendedAt: new Date() } });
      if (lost === "assignment" || lost === "version") await tx.vehicleHistoryRequest.update({ where: { id },
        data: { assignedOperatorId: lost === "assignment" ? other.user.id : operator.user.id, assignmentVersion: 2 } });
    }, { timeout: 10_000 });
    expect(await pending).toMatchObject({ code: lost === "version" ? "HISTORY_ASSIGNMENT_CONFLICT" : "HISTORY_OPERATOR_DENIED" });
    expect(await access.run({ claims: { sub: customer.user.id, sid: customer.session.id }, operator: false }, id,
      async (_r, _s, _o, _p, waiting) => waiting.read())).toEqual(policy.initial());
  });
});
