import { createServer, type Server } from "node:http";

import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type * as Navigation from "next/navigation";

const state = vi.hoisted(() => ({ headers: new Headers(), cookies: new Map<string, string>() }));
vi.mock("next/headers", () => ({ headers: async () => state.headers,
  cookies: async () => ({ get: (name: string) => state.cookies.has(name) ? { value: state.cookies.get(name) } : undefined }) }));
vi.mock("next/navigation", async (original) => ({ ...await original<typeof Navigation>(),
  redirect: (url: string) => { throw Object.assign(new Error(url), { digest: `NEXT_REDIRECT;replace;${url};307;` }); } }));
import { historyInboxAction } from "./actions";

import { proxy } from "@/proxy";

const actor = { id: "10000000-0000-4000-8000-000000001213", displayName: "Ayna", nameNumber: 1213 };
const requestId = "10000000-0000-4000-8000-000000001231";
const session = "10000000-0000-4000-8000-000000000001";
const jwt = (sid = session, sub = actor.id, exp = Math.floor(Date.now() / 1000) + 900) =>
  `e30.${Buffer.from(JSON.stringify({ sub, sid, exp })).toString("base64url")}.synthetic`;
const row = { id: requestId, createdAt: "2026-11-15T00:00:00.000Z", status: "enquiry", mine: false,
  assignmentVersion: 0, requester: { displayName: "Merdan", nameNumber: 4837, deleted: false }, assignedOperator: null };
const selected = { ...row, mine: true, assignmentVersion: 1, assignedOperator: actor, sourceListingId: null };
const page = { items: [row], nextCursor: null };
const transcript = { items: [{ id: requestId, clientMessageId: requestId, order: "1", kind: "TEXT", text: "Salam",
  createdAt: "2026-11-15T00:00:00.000Z", author: { ...actor, kind: "requester" } }], nextCursor: null };
let server: Server, origin: string, queueBody: unknown, detailBody: unknown, status: number;
let delay: (() => Promise<void>) | undefined;
let seen: { path: string; method: string; body: string; auth: string | undefined }[];
beforeAll(async () => {
  server = createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += String(chunk);
    const path = req.url ?? "";
    seen.push({ path, method: req.method ?? "", body, auth: req.headers.authorization });
    let response: unknown;
    if (path.endsWith("/auth/refresh")) response = { accessToken: jwt(), refreshToken: "b".repeat(64) };
    else if (path.endsWith("/desk")) {
      const claims = JSON.parse(Buffer.from((req.headers.authorization ?? "").split(".")[1] ?? "", "base64url").toString());
      response = { purpose: "vehicle-history", mode: "synthetic", actor: { ...actor, id: claims.sub }, requests: [] };
    } else {
      if (delay) { const work = delay; delay = undefined; await work(); }
      response = path.includes("/messages") ? transcript : path.endsWith("/claim") ? selected
        : path.includes(requestId) ? detailBody : queueBody;
    }
    res.writeHead(path.endsWith("/desk") || path.endsWith("/auth/refresh") ? 200 : status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(response));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterAll(async () => { await new Promise<void>((resolve) => server.close(() => resolve())); vi.unstubAllEnvs(); });
beforeEach(() => {
  vi.stubEnv("NODE_ENV", "test"); vi.stubEnv("API_BASE_URL", origin); vi.stubEnv("ADMIN_ORIGIN", "http://admin.test");
  state.headers = new Headers({ origin: "http://admin.test", "x-real-ip": "203.0.113.7" });
  state.cookies = new Map([["auto_tm_admin_access", jwt()]]);
  queueBody = page; detailBody = selected; status = 200; seen = []; delay = undefined;
});
async function scope() {
  const result = await historyInboxAction("en", { kind: "queue", query: {} });
  if (result.status !== "ok") throw new Error("Expected an admitted queue");
  return result.scope;
}

describe("History actions through the real HTTP-only network bridge", () => {
  it("returns a safe opaque stable-session scope and only permitted read/claim outcomes", async () => {
    const access = state.cookies.get("auto_tm_admin_access");
    const current = await scope();
    expect(current).toMatch(/^[a-f0-9]{64}$/);
    const queue = await historyInboxAction("tk", { kind: "queue", query: { search: "Merdan", filter: "unassigned" }, scope: current });
    expect(queue).toEqual({ status: "ok", kind: "queue", data: page, actor, scope: current });
    for (const kind of ["claim", "detail", "transcript"] as const) {
      const result = await historyInboxAction("ru", { kind, id: requestId, expectedAssignmentVersion: kind === "claim" ? 0 : 1, scope: current });
      expect(result).toEqual({ status: "ok", kind, actor, scope: current, data: kind === "transcript" ? transcript : selected });
      expect(JSON.stringify(result)).not.toContain(jwt());
      expect(JSON.stringify(result)).not.toContain(session);
    }
    expect(seen.filter((request) => request.method === "POST").map(({ path, body }) => ({ path, body })))
      .toEqual([{ path: `/api/v1/vehicle-history/operator/requests/${requestId}/claim`, body: '{"expectedAssignmentVersion":0}' }]);
    expect(seen.every((request) => request.auth === `Bearer ${access}`)).toBe(true);
    expect(seen.some((request) => request.path.includes("/receipts"))).toBe(false);
  });

  it.each(["actor", "session"])("rejects a former %s scope before a claim reaches the network", async (change) => {
    const old = await scope(); seen = [];
    state.cookies.set("auto_tm_admin_access", change === "actor" ? jwt(session, requestId) : jwt(requestId));
    expect(await historyInboxAction("en", { kind: "claim", id: requestId, expectedAssignmentVersion: 0, scope: old }))
      .toEqual({ status: "stale", scope: expect.stringMatching(/^[a-f0-9]{64}$/) });
    expect(seen.map((request) => request.path)).toEqual(["/api/v1/vehicle-history/desk"]);
  });

  it.each(["actor", "session", "assignment"])("discards a delayed transcript after %s changes", async (change) => {
    const current = await scope();
    delay = async () => {
      if (change === "assignment") detailBody = { ...selected, assignmentVersion: 2 };
      else state.cookies.set("auto_tm_admin_access", change === "actor" ? jwt(session, requestId) : jwt(requestId));
    };
    const result = await historyInboxAction("en", { kind: "transcript", id: requestId, expectedAssignmentVersion: 1, scope: current });
    expect(result).toEqual({ status: change === "assignment" ? "conflict" : "stale", scope: expect.any(String) });
  });

  it("rejects expired markers before validation, and invalid query/scope/version before network", async () => {
    state.headers.set("x-admin-session-expired", "1");
    await expect(historyInboxAction("en", null)).rejects.toThrow("/login?reason=session-expired");
    state.headers.delete("x-admin-session-expired");
    for (const input of [{ kind: "queue", query: { filter: "paid" } }, { kind: "queue", query: {}, scope: "token" },
      { kind: "claim", id: requestId, expectedAssignmentVersion: -1, scope: "a".repeat(64) },
      { kind: "transcript", id: "bad", scope: "a".repeat(64), expectedAssignmentVersion: 1 }]) {
      expect(await historyInboxAction("en", input)).toEqual({ status: "validation" });
    }
    expect(seen).toEqual([]);
  });

  it("keeps proxy origin checks and ordinary renewal before dispatch with stable scope", async () => {
    const current = await scope(); seen = [];
    const rejected = await proxy(new NextRequest("http://admin.test/vehicle-history/en", { method: "POST", headers: { origin: "https://foreign.test" } }));
    expect(rejected.status).toBe(403); expect(seen).toEqual([]);
    state.cookies.set("auto_tm_admin_access", jwt(session, actor.id, 1));
    const renewed = await proxy(new NextRequest("http://admin.test/vehicle-history/en", { method: "POST", headers: {
      origin: "http://admin.test", "next-action": "synthetic-action", cookie: `auto_tm_admin_access=${jwt(session, actor.id, 1)}; auto_tm_admin_refresh=${"a".repeat(64)}` } }));
    const forwarded = renewed.headers.get("x-middleware-request-cookie") ?? "";
    expect(forwarded).toContain("auto_tm_admin_access=");
    for (const entry of forwarded.split(";")) {
      const [key, value] = entry.trim().split("=");
      if (key && value) state.cookies.set(key, value);
    }
    expect(await scope()).toBe(current);
    expect(seen.filter((request) => request.method === "POST").map((request) => request.path)).toEqual(["/api/v1/auth/refresh"]);
    state.cookies.clear();
    expect(await historyInboxAction("en", { kind: "queue", query: {} })).toEqual({ status: "expired" });
  });

  it("returns typed safe network failures and rejects malformed or private response fields", async () => {
    for (const [code, expected] of [[400, "validation"], [403, "denied"], [409, "conflict"], [503, "unavailable"]] as const) {
      status = code; queueBody = { token: "must-not-leak", message: "must-not-leak" };
      const result = await historyInboxAction("en", { kind: "queue", query: {} });
      expect(result).toEqual({ status: expected, scope: expect.any(String) });
    }
    status = 200;
    for (const malformed of [{ ...page, accessToken: "must-not-leak" }, { items: [{ ...row, requester: { ...row.requester, phone: "private" } }], nextCursor: null }]) {
      queueBody = malformed;
      expect(await historyInboxAction("en", { kind: "queue", query: {} })).toEqual({ status: "unavailable", scope: expect.any(String) });
    }
  });
});
