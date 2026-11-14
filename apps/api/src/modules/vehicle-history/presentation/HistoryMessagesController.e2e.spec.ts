import "reflect-metadata";
import { randomUUID } from "node:crypto";
import { request as httpRequest } from "node:http";
import type { Prisma } from "@auto-tm/db";
import { JwtService } from "@nestjs/jwt";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { IDENTITY_CLOCK_PORT, type ClockPort } from "../../identity/identity.public";
import { historyFixture } from "../../../../test/helpers/historyFixture";
import { eventually } from "../../../../test/helpers/eventually";

const customerPath = "/api/v1/vehicle-history/requests", operatorPath = "/api/v1/vehicle-history/operator/requests";
describe("Current History text over listening HTTP", () => {
  let f: Awaited<ReturnType<typeof historyFixture>>;
  beforeAll(async () => { f = await historyFixture(); });
  afterAll(async () => { await f?.close(); });
  type Actor = Awaited<ReturnType<typeof f.actor>>;
  const path = (id: string, staff: boolean) => `${staff ? operatorPath : customerPath}/${id}/messages`;
  const send = (actor: Actor, id: string, text = "  Salam\nDünýä  ", key = randomUUID(), staff = false, version = 1) =>
    f.request.post(path(id, staff)).auth(actor.token, { type: "bearer" }).send({ clientMessageId: key, text,
      ...(staff ? { expectedAssignmentVersion: version } : {}) });
  const page = (actor: Actor, id: string, staff = false, query = "", version = 1) => f.request.get(path(id, staff)
    + (staff ? `?expectedAssignmentVersion=${version}${query ? "&" + query : ""}` : query ? "?" + query : ""))
    .auth(actor.token, { type: "bearer" });
  async function enquiry() {
    const customer = await f.actor(null), operator = await f.actor();
    const id = (await f.request.post(customerPath).auth(customer.token, { type: "bearer" })
      .send({ attemptKey: randomUUID() }).expect(201)).body.id as string;
    return { customer, operator, id };
  }
  const claim = (actor: Actor, id: string) => f.request.post(`${operatorPath}/${id}/claim`)
    .auth(actor.token, { type: "bearer" }).send({ expectedAssignmentVersion: 0 }).expect(201);
  async function lockWait(id: string, start: () => PromiseLike<unknown>, change: (tx: Prisma.TransactionClient) => Promise<unknown>) {
    let response: Promise<unknown> | undefined;
    await f.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM vehicle_history_requests WHERE id = ${id} FOR UPDATE`;
      response = Promise.resolve(start());
      await eventually(async () => {
        const [row] = await f.prisma.$queryRaw<{ waiting: boolean }[]>`SELECT EXISTS (
          SELECT 1 FROM pg_stat_activity WHERE wait_event_type = 'Lock'
          AND query LIKE '%vehicle_history_requests%' AND pid <> pg_backend_pid()
        ) AS waiting`;
        return row?.waiting ? true : null;
      }, { timeoutMs: 2500, intervalMs: 20, description: "HTTP messages waiting behind the owned request row writer" });
      await change(tx);
    }, { timeout: 10_000 });
    await response;
  }
  async function refuse(state: string, actor: Actor) {
    if (["buyer", "seller", "dealer", "admin"].includes(state)) {
      await f.prisma.staffGrant.deleteMany({ where: { userId: actor.user.id } });
      await f.prisma.user.update({ where: { id: actor.user.id }, data: { role: state === "dealer" ? "seller" : state as "buyer" | "seller" | "admin" } });
      if (state === "dealer") await f.prisma.dealership.create({ data: { slug: actor.user.id, name: "Synthetic History Dealer",
        members: { create: { userId: actor.user.id, role: "owner" } } } });
    }
    if (["evidence", "management", "revoked-grant", "future-grant"].includes(state)) {
      await f.prisma.staffGrant.update({ where: { userId_purpose: { userId: actor.user.id, purpose: "vehicle_history" } }, data:
        state === "evidence" ? { purpose: "vehicle_history_payment_evidence" } : state === "management" ? { purpose: "vehicle_history_staff_management" }
          : state === "revoked-grant" ? { revokedAt: new Date() } : { grantedAt: new Date("2099-01-01") } });
    }
    if (["revoked-session", "expired-session", "expired-totp", "no-totp"].includes(state)) {
      if (state === "revoked-session") await f.prisma.session.delete({ where: { id: actor.session.id } });
      else await f.prisma.session.update({ where: { id: actor.session.id }, data: state === "expired-session"
        ? { expiresAt: new Date(0) } : { adminTotpExpiresAt: state === "no-totp" ? null : new Date(0) } });
    }
    if (["suspended", "deleting", "purged"].includes(state)) await f.prisma.user.update({ where: { id: actor.user.id }, data:
      state === "suspended" ? { suspendedAt: new Date() } : state === "deleting" ? { deletionScheduledAt: new Date() }
        : { email: null, emailVerifiedAt: null } });
    if (state === "borrowed-session" || state === "missing-session") {
      const other = await f.actor();
      actor.token = f.app.get(JwtService).sign({ sub: actor.user.id, role: "admin", purpose: "vehicle-history",
        ...(state === "borrowed-session" ? { sid: other.session.id } : {}) });
    }
    if (state === "disabled" || state === "unset") f.config.set("VEHICLE_HISTORY_SYNTHETIC_ENABLED", state === "disabled" ? false : undefined);
    if (state === "non-tester") f.config.set("VEHICLE_HISTORY_SYNTHETIC_USER_IDS", "");
    if (state === "staging" || state === "production") f.config.set("APP_ENV", state);
  }
  it("preserves bidirectional original text/time and explicit public authors before any VIN/order", async () => {
    const { customer, operator, id } = await enquiry(), key = randomUUID();
    expect((await page(customer, id).expect(200)).body).toEqual({ items: [], nextCursor: null });
    await page(operator, id, true).expect(403);
    await f.prisma.session.update({ where: { id: customer.session.id }, data: { adminTotpExpiresAt: null } });
    const sent = (await send(customer, id, "  Salam\nDünýä  ", key).expect(201)).body;
    expect(sent).toEqual({ id: expect.any(String), clientMessageId: key, kind: "TEXT", text: "  Salam\nDünýä  ", order: "1",
      createdAt: expect.stringMatching(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/),
      author: { id: customer.user.id, displayName: "Ayna", nameNumber: 1213, kind: "requester" } });
    await page(operator, id, true).expect(403);
    await send(operator, id, "not assigned", key, true).expect(403);
    await claim(operator, id);
    const reply = (await send(operator, id, "  Здравствуйте\nSorag?  ", key, true).expect(201)).body;
    expect(reply).toEqual({ id: expect.any(String), clientMessageId: key, kind: "TEXT", text: "  Здравствуйте\nSorag?  ", order: "2",
      createdAt: expect.any(String), author: { id: operator.user.id, displayName: "Ayna", nameNumber: 1213, kind: "operator" } });
    for (const [actor, staff] of [[customer, false], [operator, true]] as const) {
      const result = await page(actor, id, staff).expect(200);
      expect(result.headers["cache-control"]).toBe("private, no-store");
      expect(result.body).toEqual({ items: [sent, reply], nextCursor: null });
    }
    expect((await send(customer, id, "  Salam\nDünýä  ", key).expect(201)).body).toEqual(sent);
  });
  it("serializes more concurrent HTTP retries than the operation pool size without starving commits", async () => {
    const { customer, operator, id } = await enquiry(), key = randomUUID();
    await claim(operator, id);
    f.concurrent(12);
    const responses = await Promise.all(Array.from({ length: 12 }, () => send(customer, id, "original", key).set("x-history-concurrency", "send")));
    expect(responses.map((response) => response.status)).toEqual(Array(12).fill(201));
    const original = responses[0]!.body;
    expect(responses.every((response) => JSON.stringify(response.body) === JSON.stringify(original))).toBe(true);
    await send(customer, id, "original ", key).expect(409);
    const independent = await enquiry();
    const other = (await send(independent.customer, independent.id, "another object", key).expect(201)).body;
    // Same requester, another request: the intent key is scoped to the object.
    const otherId = (await f.request.post(customerPath).auth(customer.token, { type: "bearer" })
      .send({ attemptKey: randomUUID() }).expect(201)).body.id;
    await send(customer, otherId, "same user new object", key).expect(201);
    await send(operator, id, "independent operator", key, true).expect(201);
    expect(other.id).not.toBe(original.id);
    expect((await page(customer, id).expect(200)).body.items.map((message: { text: string }) => message.text))
      .toEqual(["original", "independent operator"]);
  });
  it("recovers discarded committed response bytes using the same User in a new active Session", async () => {
    const { customer, id } = await enquiry(), key = randomUUID(), origin = await f.app.getUrl();
    await new Promise<void>((resolve, reject) => {
      const outgoing = httpRequest(`${origin}${path(id, false)}`, { method: "POST", headers: {
        authorization: `Bearer ${customer.token}`, "content-type": "application/json",
      } }, (response) => {
        response.destroy(); // No response body bytes reach the caller, after commit.
        if (response.statusCode === 201) resolve(); else reject(new Error("Send did not commit"));
      });
      outgoing.on("error", reject);
      outgoing.end(JSON.stringify({ clientMessageId: key, text: "lost response\n  original  " }));
    });
    const original = (await page(customer, id).expect(200)).body.items[0];
    const session = await f.prisma.session.create({ data: { userId: customer.user.id,
      refreshTokenHash: randomUUID(), expiresAt: new Date(Date.now() + 600_000) } });
    const renewed = { ...customer, token: f.app.get(JwtService).sign({ sub: customer.user.id, sid: session.id }) };
    await refuse("revoked-session", customer);
    expect((await send(renewed, id, "lost response\n  original  ", key).expect(201)).body).toEqual(original);
    expect((await page(renewed, id).expect(200)).body).toEqual({ items: [original], nextCursor: null });
    await send(customer, id, "lost response\n  original  ", key).expect(403);
    await page(customer, id, false, `cursor=${original.id}`).expect(403);
  });
  it("returns complete ascending bounded pages under intervening concurrent sends and scopes every cursor", async () => {
    const { customer, operator, id } = await enquiry(), originals: { id: string; text: string }[] = [];
    for (let i = 0; i < 51; i++) originals.push((await send(customer, id, `page-${i}`).expect(201)).body);
    const first = (await page(customer, id, false, "limit=2").expect(200)).body;
    expect(first.items.map((item: { order: string }) => item.order)).toEqual(["1", "2"]);
    expect(first.nextCursor).toBe(originals[1]!.id);
    f.concurrent(2);
    originals.push(...(await Promise.all(["during-a", "during-b"].map((text) => send(customer, id, text).set("x-history-concurrency", "page"))))
      .map((response) => response.body).sort((a, b) => Number(a.order) - Number(b.order)));
    const rest = (await page(customer, id, false, `cursor=${first.nextCursor}`).expect(200)).body;
    expect(rest.items).toHaveLength(50);
    const last = (await page(customer, id, false, `cursor=${rest.nextCursor}`).expect(200)).body;
    expect(last.items.map((item: { order: string }) => item.order)).toEqual(["53"]);
    expect(last.nextCursor).toBeNull();
    expect([...first.items, ...rest.items, ...last.items].map((item: { id: string }) => item.id)).toEqual(originals.map((item) => item.id));
    expect((await page(customer, id).expect(200)).body.items).toHaveLength(50);
    const foreign = await enquiry(), foreignMessage = (await send(foreign.customer, foreign.id, "PRIVATE FOREIGN").expect(201)).body;
    await claim(operator, id);
    await page(operator, id, true, `cursor=${foreignMessage.id}`).expect(400);
    const missing = await page(customer, id, false, `cursor=${randomUUID()}`).expect(400);
    expect((await page(customer, id, false, `cursor=${foreignMessage.id}`).expect(400)).body).toEqual(missing.body);
    expect(missing.headers["cache-control"]).toBe("private, no-store");
    expect(JSON.stringify(missing.body)).not.toContain("PRIVATE FOREIGN");
    await page(foreign.customer, id, false, `cursor=${originals[0]!.id}`).expect(403);
    expect((await page(customer, id, false, `cursor=${originals[52]!.id}`).expect(200)).body).toEqual({ items: [], nextCursor: null });
  });
  it("holds the real request row through a blocked messaging commit, then permits assignment writers", async () => {
    const { customer, operator, id } = await enquiry(), next = await f.actor();
    await claim(operator, id);
    await send(customer, id, "existing").expect(201);
    let pending: PromiseLike<unknown> | undefined, handover: Promise<unknown> | undefined;
    await f.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM service_conversations WHERE "objectId" = ${id} FOR UPDATE`;
      pending = send(operator, id, "authorized before handover", randomUUID(), true).expect(201).then((result) => result);
      await eventually(async () => {
        const [row] = await f.prisma.$queryRaw<{ waiting: boolean }[]>`SELECT EXISTS (SELECT 1 FROM pg_stat_activity
          WHERE wait_event_type = 'Lock' AND query LIKE '%service_conversations%' AND pid <> pg_backend_pid()) AS waiting`;
        return row?.waiting ? true : null;
      }, { timeoutMs: 2500, intervalMs: 20, description: "messaging commit blocked inside the History fence" });
      // NOWAIT proves the separate messaging transaction still retains History's row fence.
      await expect(f.prisma.$transaction((probe) => probe.$queryRaw`SELECT id FROM vehicle_history_requests WHERE id = ${id} FOR UPDATE NOWAIT`)).rejects.toThrow();
      handover = f.prisma.vehicleHistoryRequest.update({ where: { id }, data: { assignedOperatorId: next.user.id, assignmentVersion: 2 } }).then((result) => result);
      await eventually(async () => {
        const [row] = await f.prisma.$queryRaw<{ waiting: boolean }[]>`SELECT EXISTS (SELECT 1 FROM pg_stat_activity
          WHERE wait_event_type = 'Lock' AND query LIKE '%UPDATE%vehicle_history_requests%') AS waiting`;
        return row?.waiting ? true : null;
      }, { timeoutMs: 2500, intervalMs: 20, description: "handover writer blocked until the message commits" });
    });
    await pending;
    await handover;
    expect((await page(customer, id).expect(200)).body.items.map((item: { text: string }) => item.text)).toEqual(["existing", "authorized before handover"]);
  });
  it.each(["handover", "version", "revoked-grant", "revoked-session"])("rechecks %s after a real request lock wait before append or recovery", async (state) => {
    const { customer, operator, id } = await enquiry(), next = await f.actor(), key = randomUUID();
    await claim(operator, id);
    await send(operator, id, "stored original", key, true).expect(201);
    await lockWait(id, () => Promise.all([
      send(operator, id, "stored original", key, true).expect(state === "version" ? 409 : 403),
      send(operator, id, "UNAUTHORIZED APPEND", randomUUID(), true).expect(state === "version" ? 409 : 403),
      page(operator, id, true).expect(state === "version" ? 409 : 403),
    ]), async (tx) => {
      if (state === "handover" || state === "version") {
        return tx.vehicleHistoryRequest.update({ where: { id }, data: {
          assignedOperatorId: state === "handover" ? next.user.id : operator.user.id, assignmentVersion: 2,
        } });
      }
      return refuse(state, operator);
    });
    expect((await page(customer, id).expect(200)).body.items.map((item: { text: string }) => item.text)).toEqual(["stored original"]);
  });
  it("revokes requester authority during a real lock wait without appending or recovering private text", async () => {
    const { customer, operator, id } = await enquiry(), key = randomUUID();
    await claim(operator, id);
    await send(customer, id, "stored customer", key).expect(201);
    await lockWait(id, () => Promise.all([send(customer, id, "stored customer", key).expect(403),
      send(customer, id, "UNAUTHORIZED CUSTOMER").expect(403), page(customer, id).expect(403)]), () => refuse("revoked-session", customer));
    expect((await page(operator, id, true).expect(200)).body.items.map((item: { text: string }) => item.text)).toEqual(["stored customer"]);
  });
  it.each(["buyer", "seller", "dealer", "admin", "evidence", "management", "revoked-grant", "future-grant",
    "revoked-session", "expired-session", "expired-totp", "no-totp", "suspended", "deleting", "purged",
    "borrowed-session", "missing-session", "disabled", "unset", "non-tester", "staging", "production"])(
    "refuses staff sends, retries and pages after stored text exists: %s", async (state) => {
      const { operator, id } = await enquiry(), key = randomUUID();
      await claim(operator, id);
      const original = (await send(operator, id, "PRIVATE STORED", key, true).expect(201)).body;
      await refuse(state, operator);
      for (const [index, pending] of [send(operator, id, "PRIVATE STORED", key, true), send(operator, id, "new", randomUUID(), true),
        page(operator, id, true), page(operator, id, true, `cursor=${original.id}`)].entries()) {
        const denied = await pending.expect(403);
        expect(denied.headers["cache-control"]).toBe("private, no-store");
        expect(Object.keys(denied.body).sort()).toEqual(["code", "message", "statusCode"]);
        expect(denied.body.code).toBe(state === "deleting" && index < 2 ? "HISTORY_REQUEST_DENIED" : "HISTORY_OPERATOR_DENIED");
        expect(JSON.stringify(denied.body)).not.toContain("PRIVATE STORED");
      }
    });
  it.each(["revoked-session", "expired-session", "suspended", "deleting", "purged", "borrowed-session", "missing-session",
    "disabled", "unset", "non-tester", "staging", "production"])("refuses requester recovery and paging under current %s", async (state) => {
      const { customer, id } = await enquiry(), key = randomUUID();
      const original = (await send(customer, id, "PRIVATE CUSTOMER", key).expect(201)).body;
      await refuse(state, customer);
      for (const pending of [send(customer, id, "PRIVATE CUSTOMER", key), send(customer, id, "new"), page(customer, id), page(customer, id, false, `cursor=${original.id}`)]) {
        const denied = await pending.expect(403);
        expect(denied.headers["cache-control"]).toBe("private, no-store");
        expect(Object.keys(denied.body).sort()).toEqual(["code", "message", "statusCode"]);
        expect(denied.body.code).toBe("HISTORY_REQUEST_DENIED");
        expect(JSON.stringify(denied.body)).not.toContain("PRIVATE CUSTOMER");
      }
    });
  it.each(["buyer", "seller", "dealer", "admin", "assigned-staff"])("never gives an unrelated %s customer-route access through a known key", async (state) => {
    const { customer, operator, id } = await enquiry(), key = randomUUID();
    await claim(operator, id);
    const original = (await send(customer, id, "private original", key).expect(201)).body;
    const intruder = state === "assigned-staff" ? operator : await f.actor();
    if (state !== "assigned-staff") await refuse(state, intruder);
    for (const pending of [send(intruder, id, "private original", key), page(intruder, id), page(intruder, id, false, `cursor=${original.id}`)]) {
      const denied = await pending.expect(403);
      expect(denied.body.code).toBe("HISTORY_REQUEST_DENIED");
      expect(denied.headers["cache-control"]).toBe("private, no-store");
    }
  });
  it("expires current requester and elevated staff sessions using injected boundary time", async () => {
    const { customer, operator, id } = await enquiry(), key = randomUUID();
    await claim(operator, id);
    await send(customer, id, "time fence", key).expect(201);
    const clock = vi.spyOn(f.app.get<ClockPort>(IDENTITY_CLOCK_PORT), "now").mockReturnValue(new Date("2099-01-01"));
    try {
      await send(customer, id, "time fence", key).expect(403);
      await page(customer, id).expect(403);
      await send(operator, id, "time fence", key, true).expect(403);
      await page(operator, id, true).expect(403);
    } finally { clock.mockRestore(); }
  });
  it("maps a real persistence failure to bounded no-store 503 without database details, then safely retries", async () => {
    const { customer, id } = await enquiry(), key = randomUUID();
    await f.prisma.$executeRawUnsafe(`CREATE FUNCTION vh1214_fault() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'private SQL credential sentinel'; END $$`);
    await f.prisma.$executeRawUnsafe(`CREATE TRIGGER vh1214_fault BEFORE INSERT ON service_messages
      FOR EACH ROW EXECUTE FUNCTION vh1214_fault()`);
    try {
      for (const locale of ["tk", "ru", "en"]) {
        const failed = await send(customer, id, "retryable original", key).set("Accept-Language", locale).expect(503);
        expect(failed.headers["cache-control"]).toBe("private, no-store");
        expect(failed.body).toEqual({ statusCode: 503, code: "HISTORY_MESSAGE_UNAVAILABLE", message: expect.any(String) });
        expect(failed.body.message).toContain({ tk: "wagtlaýyn", ru: "временно", en: "temporarily" }[locale]!);
        expect(JSON.stringify(failed.body)).not.toContain("sentinel");
      }
    } finally {
      await f.prisma.$executeRawUnsafe("DROP TRIGGER vh1214_fault ON service_messages");
      await f.prisma.$executeRawUnsafe("DROP FUNCTION vh1214_fault()");
    }
    expect((await page(customer, id).expect(200)).body).toEqual({ items: [], nextCursor: null });
    await send(customer, id, "retryable original", key).expect(201);
    expect((await page(customer, id).expect(200)).body.items.map((item: { text: string }) => item.text)).toEqual(["retryable original"]);
  });
  it.each(["tk", "ru", "en"])("bounds inputs and returns safe localized no-store %s validation/conflict/unavailable/401 errors", async (locale) => {
    const { customer, operator, id } = await enquiry(), key = randomUUID();
    await claim(operator, id);
    await send(customer, id, "a".repeat(4000), key).expect(201);
    for (const text of ["", " \n\t", "a".repeat(4001)]) await send(customer, id, text).expect(400);
    for (const extra of [{ senderId: operator.user.id }, { objectId: randomUUID() }, { purpose: "support" }, { kind: "NOTE" }, { expectedAssignmentVersion: 1 }]) {
      await f.request.post(path(id, false)).auth(customer.token, { type: "bearer" }).send({ clientMessageId: key, text: "forged", ...extra }).expect(400);
    }
    await f.request.post(path(id, false) + "?senderId=forged").auth(customer.token, { type: "bearer" })
      .send({ clientMessageId: key, text: "forged query" }).expect(400);
    await page(operator, id, true, "", 0).expect(409);
    await f.request.get(path(id, true)).auth(operator.token, { type: "bearer" }).expect(400);
    await f.request.post(path(id, true)).auth(operator.token, { type: "bearer" }).send({ clientMessageId: key, text: "no version" }).expect(400);
    for (const query of ["cursor=bad", "limit=0", "limit=51", "limit=1.5", "senderId=forged"]) await page(customer, id, false, query).expect(400);
    const malformed = await f.request.post(path(id, false)).auth(customer.token, { type: "bearer" })
      .set("Content-Type", "application/json").set("Accept-Language", locale).send("{").expect(400);
    expect(malformed.headers["cache-control"]).toBe("private, no-store");
    expect(malformed.body.code).toBe("HISTORY_MESSAGE_INVALID");
    const invalid = await send(customer, id, "").set("Accept-Language", locale).expect(400);
    const conflict = await send(customer, id, "changed", key).set("Accept-Language", locale).expect(409);
    const cursor = await page(customer, id, false, `cursor=${randomUUID()}`).set("Accept-Language", locale).expect(400);
    expect(malformed.body.message).toBe(invalid.body.message);
    expect(invalid.body.message).toContain({ tk: "barlaň", ru: "Проверьте", en: "Check" }[locale]!);
    expect(conflict.body.message).toContain({ tk: "saklady", ru: "сохранила", en: "saved" }[locale]!);
    expect(cursor.body.code).toBe("HISTORY_MESSAGE_CURSOR");
    for (const response of [invalid, conflict, cursor]) expect(response.headers["cache-control"]).toBe("private, no-store");
    for (const staff of [false, true]) for (const method of ["get", "post"] as const) {
      const denied = await f.request[method](path(id, staff)).set("Accept-Language", locale).expect(401);
      expect(denied.headers["cache-control"]).toBe("private, no-store");
      expect(Object.keys(denied.body).sort()).toEqual(["code", "message", "statusCode"]);
    }
  });
});
