import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { JwtService } from "@nestjs/jwt";
import { VehicleHistorySchemas as V } from "@auto-tm/contracts";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { historyFixture } from "./helpers/historyFixture";

const context = new AsyncLocalStorage<{ headers: Headers; cookies: Map<string, string> }>();
function currentRequest() {
  const request = context.getStore();
  if (!request) throw new Error("Expected a Next request context");
  return request;
}
// Only Next's per-request boundary is substituted. The production actions,
// cookie reader/client, listening HTTP API, identity and persistence are real.
vi.mock("next/headers", () => ({
  headers: async () => currentRequest().headers,
  cookies: async () => ({ get: (name: string) => {
    const value = currentRequest().cookies.get(name);
    return value ? { value } : undefined;
  } }),
}));
// Keep Admin's bundler/DOM types out of API CommonJS emission (AdminApiBridge).
const actionPath = resolve(__dirname, "../../admin/src/app/vehicle-history/[locale]/actions");
type Result = { status: string; scope?: string; kind?: string; data?: unknown };
type Actions = Record<"historyInboxAction" | "historyMessageAction", (locale: "en", value: unknown) => Promise<Result>>;

describe("production operator actions through the authoritative listening History API", () => {
  let f: Awaited<ReturnType<typeof historyFixture>>, actions: Actions;
  beforeAll(async () => {
    f = await historyFixture();
    vi.stubEnv("API_BASE_URL", await f.app.getUrl());
    vi.stubEnv("NODE_ENV", "test");
    actions = await import(actionPath) as Actions;
  });
  afterAll(async () => { await f?.close(); vi.unstubAllEnvs(); });
  function invoke(token: string, action: keyof Actions, value: unknown) {
    return context.run({ headers: new Headers({ origin: "http://admin.test" }),
      cookies: new Map([["auto_tm_admin_access", token]]) }, () => actions[action]("en", value));
  }
  async function scope(token: string) {
    const result = await invoke(token, "historyInboxAction", { kind: "queue", query: {} });
    expect(result.status).toBe("ok");
    if (!result.scope) throw new Error("Expected an admitted session scope");
    return result.scope;
  }

  it("persists exact text once and requires contiguous fetch, explicit Received then Read, and fresh-session refetch", async () => {
    const customer = await f.actor(null), operator = await f.actor();
    const id = (await f.request.post("/api/v1/vehicle-history/requests").auth(customer.token, { type: "bearer" })
      .send({ attemptKey: randomUUID() }).expect(201)).body.id as string;
    const current = await scope(operator.token);
    const select = { id, scope: current, expectedAssignmentVersion: 1 };
    expect(await invoke(operator.token, "historyInboxAction", { ...select, kind: "claim", expectedAssignmentVersion: 0 }))
      .toMatchObject({ status: "ok", kind: "claim", data: { id, mine: true, assignmentVersion: 1 } });
    const key = randomUUID(), text = "  Salam\nDünýä — Привет  ";
    const send = { ...select, kind: "send", body: { clientMessageId: key, text } };
    const saved = await invoke(operator.token, "historyMessageAction", send);
    expect(saved.status).toBe("ok");
    const message = V.HistoryMessageSchema.parse(saved.data);
    expect(message).toMatchObject({ clientMessageId: key, text, order: "1", author: { id: operator.user.id, kind: "operator" } });
    expect(await invoke(operator.token, "historyMessageAction", send)).toEqual(saved);
    expect(await invoke(operator.token, "historyMessageAction", { ...send, body: { ...send.body, text: "changed" } }))
      .toMatchObject({ status: "conflict" });
    const path = `/api/v1/vehicle-history/requests/${id}`;
    expect((await f.request.get(path + "/messages").auth(customer.token, { type: "bearer" }).expect(200)).body)
      .toEqual({ items: [message], nextCursor: null });
    const receipts = () => invoke(operator.token, "historyMessageAction", { ...select, kind: "receipts" });
    const ack = (cursor: string, kind: "received" | "read", token = operator.token, selected = select) =>
      invoke(token, "historyMessageAction", { ...selected, kind: "ack", throughOrder: cursor === message.id ? "1" : "51", body: { cursor, kind } });
    expect(await receipts()).toMatchObject({ status: "ok", data: { items: [] } });
    expect(await ack(message.id, "received")).toMatchObject({ status: "validation" }); // Send is not a fetch offer.
    const incoming: string[] = [];
    for (let index = 0; index < 50; index++) {
      const response = await f.request.post(path + "/messages").auth(customer.token, { type: "bearer" })
        .send({ clientMessageId: randomUUID(), text: `Customer ${index + 1}` }).expect(201);
      incoming.push(response.body.id as string);
    }
    const first = await invoke(operator.token, "historyInboxAction", { ...select, kind: "transcript" });
    expect(first.status).toBe("ok");
    const page = V.HistoryMessagesPageSchema.parse(first.data);
    expect(page.items).toHaveLength(50);
    expect(page.nextCursor).toBe(incoming[48]);
    expect(await receipts()).toMatchObject({ status: "ok", data: { items: [] } });
    const last = incoming[49];
    if (!last) throw new Error("Expected the lookahead message");
    expect(await ack(last, "received")).toMatchObject({ status: "validation" }); // Unfetched lookahead.
    const second = await invoke(operator.token, "historyInboxAction", { ...select, kind: "transcript", cursor: page.nextCursor });
    expect(second.status).toBe("ok");
    expect(V.HistoryMessagesPageSchema.parse(second.data)).toMatchObject({ items: [{ id: incoming[49], order: "51", text: "Customer 50" }], nextCursor: null });
    expect(await ack(last, "read")).toMatchObject({ status: "validation" });
    expect(await ack(last, "received")).toMatchObject({ status: "ok", data: {
      participantId: operator.user.id, assignmentVersion: 1, receivedOrder: "51", readOrder: "0",
    } });
    expect(await ack(last, "read")).toMatchObject({ status: "ok", data: { receivedOrder: "51", readOrder: "51" } });
    expect((await f.request.get(path + "/receipts").auth(customer.token, { type: "bearer" }).expect(200)).body).toEqual({ items: [
      { participantId: operator.user.id, assignmentVersion: 1, receivedOrder: "51", readOrder: "51" },
    ] });
    const session = await f.prisma.session.create({ data: { userId: operator.user.id, refreshTokenHash: randomUUID(),
      expiresAt: new Date(Date.now() + 600_000), adminTotpExpiresAt: new Date(Date.now() + 600_000) } });
    const freshToken = f.app.get(JwtService).sign({ sub: operator.user.id, sid: session.id, role: "buyer" });
    const fresh = { ...select, scope: await scope(freshToken) };
    expect(fresh.scope).not.toBe(current);
    expect(await ack(last, "read", freshToken)).toMatchObject({ status: "stale", scope: fresh.scope });
    expect(await ack(last, "read", freshToken, fresh)).toMatchObject({ status: "validation" });
    for (const cursor of [undefined, page.nextCursor]) {
      expect(await invoke(freshToken, "historyInboxAction", { ...fresh, kind: "transcript", ...(cursor ? { cursor } : {}) }))
        .toMatchObject({ status: "ok" });
    }
    expect(await ack(last, "read", freshToken, fresh)).toMatchObject({ status: "ok", data: { readOrder: "51" } });
    await f.prisma.session.update({ where: { id: operator.session.id }, data: { expiresAt: new Date(0) } });
    expect(await ack(last, "read")).toMatchObject({ status: "denied" });
    await f.prisma.vehicleHistoryRequest.update({ where: { id }, data: { assignmentVersion: 2 } });
    expect(await invoke(freshToken, "historyMessageAction", { ...send, scope: fresh.scope })).toMatchObject({ status: "conflict" });
    expect(await ack(last, "read", freshToken, fresh)).toMatchObject({ status: "conflict" });
    const other = await f.actor();
    await f.prisma.vehicleHistoryRequest.update({ where: { id }, data: { assignedOperatorId: other.user.id, assignmentVersion: 3 } });
    expect(await invoke(freshToken, "historyMessageAction", { ...send, scope: fresh.scope })).toMatchObject({ status: "denied" });
    expect((await f.request.get(path + "/messages?cursor=" + page.nextCursor).auth(customer.token, { type: "bearer" }).expect(200)).body.items)
      .toMatchObject([{ id: incoming[49], text: "Customer 50", order: "51" }]);
  });
});
