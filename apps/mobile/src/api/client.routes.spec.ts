import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import * as SecureStore from "expo-secure-store";
import { AuthSchemas } from "@auto-tm/contracts";

import { server } from "../../test/msw";
import { clearAuthSession, loadAuthSession, storeAuthSession } from "../auth/session";

import { apiClient } from "./client";
import { provisionGatewayKey, selectTesterRoute } from "./routes";

const globalEntry = "https://api-staging-2861.up.railway.app/api/v1";
const tmEntry = "https://tm-staging.bagtyyar.dev/api/v1";
const key = "synthetic-test-key-never-a-real-secret";
const user = { id: "11111111-1111-4111-8111-111111111111", phone: "+99361000001", email: null, displayName: null, role: "buyer" as const };
const token = (sid = "session-a", life = 900) => `e30.${Buffer.from(JSON.stringify({ sub: user.id, sid, iat: 1000, exp: 1000 + life })).toString("base64url")}.sig`;
const session = () => ({ user, accessToken: token(), refreshToken: "refresh-a" });
const storage = new Map<string, string>();

beforeEach(async () => {
  vi.stubGlobal("__DEV__", true);
  vi.stubEnv("EXPO_PUBLIC_API_URL", globalEntry);
  vi.stubEnv("EXPO_PUBLIC_GATEWAY_TESTER", "true");
  vi.stubEnv("EXPO_PUBLIC_ENV", "staging");
  storage.clear();
  vi.mocked(SecureStore.getItemAsync).mockImplementation(async key => storage.get(key) ?? null);
  vi.mocked(SecureStore.setItemAsync).mockImplementation(async (key, value) => { storage.set(key, value); });
  vi.mocked(SecureStore.deleteItemAsync).mockImplementation(async key => { storage.delete(key); });
  selectTesterRoute("global");
  await clearAuthSession();
  await provisionGatewayKey(key);
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

it.each([["global", globalEntry], ["tm", tmEntry]] as const)("browses and signs in to the same authority through %s without leaking gateway access", async (entry, base) => {
  selectTesterRoute(entry);
  const seen: unknown[] = [];
  server.use(
    http.get(`${base}/listings`, ({ request }) => {
      seen.push([request.headers.get("authorization"), request.headers.get("x-carberk-gateway-key")]);
      return HttpResponse.json({ items: ["same-listing"] });
    }),
    http.post(`${base}/auth/otp/verify`, async ({ request }) => {
      expect(await request.json()).toEqual({ phone: "+99361000001", code: "123456" });
      expect(request.headers.get("authorization")).toBeNull();
      return HttpResponse.json(session());
    }),
    http.get(`${base}/me`, ({ request }) => HttpResponse.json({ id: user.id, bearer: request.headers.get("authorization"), gateway: request.headers.get("x-carberk-gateway-key") })),
  );
  expect(await apiClient.get("/listings", undefined, { auth: false })).toEqual({ items: ["same-listing"] });
  await storeAuthSession(await apiClient.post("/auth/otp/verify", { phone: user.phone, code: "123456" }, AuthSchemas.OtpVerifyResponseSchema, { auth: false }));
  expect(await apiClient.get("/me")).toEqual({ id: user.id, bearer: `Bearer ${token()}`, gateway: entry === "tm" ? key : null });
  expect((await loadAuthSession())?.user.id).toBe(user.id);
  expect(seen).toEqual([[null, entry === "tm" ? key : null]]);
});

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

it.each([["global", globalEntry, "tm"], ["tm", tmEntry, "global"]] as const)("pins %s retry/refresh while override changes and a canceled caller leaves shared rotation alive", async (entry, base, next) => {
  selectTesterRoute(entry);
  await storeAuthSession(session());
  const entered = deferred(), release = deferred();
  const received: string[] = [];
  let refreshes = 0;
  server.use(
    http.get(`${base}/me`, ({ request }) => {
      received.push(request.headers.get("authorization") ?? "anonymous");
      return request.headers.get("authorization") === `Bearer ${token()}`
        ? HttpResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 })
        : HttpResponse.json({ id: user.id });
    }),
    http.post(`${base}/auth/refresh`, async ({ request }) => {
      refreshes++;
      expect(request.headers.get("x-carberk-gateway-key")).toBe(entry === "tm" ? key : null);
      entered.resolve(); await release.promise;
      return HttpResponse.json({ accessToken: token("session-a", 1200), refreshToken: "refresh-b" });
    }),
  );
  const controller = new AbortController();
  const canceled = apiClient.get("/me", undefined, { signal: controller.signal }).catch(error => error);
  const other = apiClient.get("/me");
  await entered.promise;
  selectTesterRoute(next);
  controller.abort();
  expect(await canceled).toMatchObject({ code: "NETWORK_ERROR", status: 0 });
  release.resolve();
  expect(await other).toEqual({ id: user.id });
  expect((await loadAuthSession())?.refreshToken).toBe("refresh-b");
  expect(refreshes).toBe(1);
  expect(received).toEqual([`Bearer ${token()}`, `Bearer ${token()}`, `Bearer ${token("session-a", 1200)}`]);
});

it.each(["sign-out", "new-user", "new-session"].flatMap(change => [false, true].map(preflight => ({ change, preflight }))))("does not restore or retry the previous identity after $change (preflight=$preflight)", async ({ change, preflight }) => {
  await storeAuthSession({ ...session(), accessToken: preflight ? token("session-a", 1) : token() });
  const entered = deferred(), release = deferred();
  const sent: string[] = [];
  server.use(
    http.get(`${globalEntry}/me`, ({ request }) => { sent.push(request.headers.get("authorization") ?? "anonymous"); return HttpResponse.json({}, { status: 401 }); }),
    http.post(`${globalEntry}/auth/refresh`, async () => { entered.resolve(); await release.promise; return HttpResponse.json({ accessToken: token("session-a", 1200), refreshToken: "late-token" }); }),
  );
  const pending = apiClient.get("/me").catch(error => error);
  await entered.promise;
  if (change === "sign-out") await clearAuthSession();
  else await storeAuthSession({ ...session(), user: change === "new-user" ? { ...user, id: "22222222-2222-4222-8222-222222222222" } : user, accessToken: token("session-b"), refreshToken: "other-session" });
  release.resolve();
  expect(await pending).toMatchObject({ code: "SESSION_CHANGED" });
  expect((await loadAuthSession())?.refreshToken ?? null).toBe(change === "sign-out" ? null : "other-session");
  expect(sent).toEqual(preflight ? [] : [`Bearer ${token()}`]);
});

it.each([["global", globalEntry], ["tm", tmEntry]] as const)("shares expired-token preflight on %s after one caller times out", async (entry, base) => {
  selectTesterRoute(entry);
  await storeAuthSession(session());
  const now = Date.now();
  vi.spyOn(Date, "now").mockReturnValue(now + 901_000);
  const entered = deferred(), release = deferred();
  let refreshes = 0;
  server.use(
    http.post(`${base}/auth/refresh`, async () => { refreshes++; entered.resolve(); await release.promise; return HttpResponse.json({ accessToken: token("session-a", 1800), refreshToken: "refresh-b" }); }),
    http.get(`${base}/me`, ({ request }) => HttpResponse.json({ bearer: request.headers.get("authorization") })),
  );
  const timed = apiClient.get("/me", undefined, { timeout: 40 }).catch(error => error);
  const remaining = apiClient.get("/me");
  await entered.promise;
  expect(await timed).toMatchObject({ code: "NETWORK_ERROR", message: "Request timed out" });
  release.resolve();
  expect(await remaining).toEqual({ bearer: `Bearer ${token("session-a", 1800)}` });
  expect((await loadAuthSession())?.refreshToken).toBe("refresh-b");
  expect(refreshes).toBe(1);
  vi.restoreAllMocks();
});

it.each([["global", globalEntry], ["tm", tmEntry]] as const)("preserves the %s session after every non-authoritative refresh failure", async (entry, base) => {
  selectTesterRoute(entry);
  await storeAuthSession(session());
  for (const failure of [403, 429, 503, "unreadable", "network"] as const) {
    server.use(
      http.get(`${base}/me`, () => HttpResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 })),
      http.post(`${base}/auth/refresh`, () => typeof failure === "number" ? HttpResponse.json({}, { status: failure }) : failure === "network" ? HttpResponse.error() : new HttpResponse("<html>unavailable</html>")),
    );
    await expect(apiClient.get("/me")).rejects.toBeDefined();
    expect((await loadAuthSession())?.refreshToken).toBe("refresh-a");
  }
});

it("preserves the session when private provisioning is missing or storage refuses access", async () => {
  await storeAuthSession(session());
  selectTesterRoute("tm");
  await SecureStore.deleteItemAsync("carberk_staging_gateway_key");
  await expect(apiClient.get("/me")).rejects.toMatchObject({ code: "ROUTE_UNAVAILABLE", status: 503 });
  expect((await loadAuthSession())?.refreshToken).toBe("refresh-a");
  vi.mocked(SecureStore.getItemAsync).mockRejectedValueOnce(new Error("native storage refused"));
  await expect(apiClient.get("/me")).rejects.toMatchObject({ code: "ROUTE_UNAVAILABLE", status: 503 });
  expect((await loadAuthSession())?.refreshToken).toBe("refresh-a");
});

it("sends an ambiguous write once even when the route changes before its response is lost", async () => {
  await storeAuthSession(session());
  let writes = 0;
  server.use(http.post(`${globalEntry}/write`, () => { writes++; selectTesterRoute("tm"); return HttpResponse.error(); }));
  await expect(apiClient.post("/write", { value: 1 })).rejects.toBeDefined();
  expect(writes).toBe(1);
  expect((await loadAuthSession())?.refreshToken).toBe("refresh-a");
});

it("recovers the next real request after a transient preflight failure", async () => {
  await storeAuthSession(session());
  const now = Date.now();
  vi.spyOn(Date, "now").mockReturnValue(now + 901_000);
  server.use(http.post(`${globalEntry}/auth/refresh`, () => HttpResponse.json({}, { status: 503 })),
    http.get(`${globalEntry}/me`, ({ request }) => HttpResponse.json({ bearer: request.headers.get("authorization") })));
  expect(await apiClient.get("/me")).toEqual({ bearer: `Bearer ${token()}` });
  server.use(http.post(`${globalEntry}/auth/refresh`, () => HttpResponse.json({ accessToken: token("session-a", 1800), refreshToken: "refresh-b" })));
  expect(await apiClient.get("/me")).toEqual({ bearer: `Bearer ${token("session-a", 1800)}` });
  expect((await loadAuthSession())?.refreshToken).toBe("refresh-b");
  vi.restoreAllMocks();
});

it.each([["global", globalEntry], ["tm", tmEntry]] as const)("ends only the authoritatively rejected %s session", async (entry, base) => {
  selectTesterRoute(entry);
  for (const failure of ["rejected", "contract"] as const) {
    await storeAuthSession(session());
    server.use(http.get(`${base}/me`, () => HttpResponse.json({}, { status: 401 })),
      http.post(`${base}/auth/refresh`, () => HttpResponse.json({}, { status: failure === "rejected" ? 401 : 200 })));
    await expect(apiClient.get("/me")).rejects.toMatchObject({ code: failure === "rejected" ? "UNAUTHENTICATED" : "CONTRACT_VIOLATION" });
    expect(await loadAuthSession()).toBeNull();
  }
});

it("never refreshes a pending separate session or attaches supplied gateway access to Global", async () => {
  await storeAuthSession(session());
  const seen: unknown[] = [];
  server.use(http.post(`${globalEntry}/me/restore`, ({ request }) => {
    seen.push([request.headers.get("authorization"), request.headers.get("x-carberk-gateway-key")]);
    return HttpResponse.json({ code: "UNAUTHORIZED" }, { status: 401 });
  }));
  await expect(apiClient.post("/me/restore", {}, undefined, { accessToken: "pending-token", headers: { "x-carberk-gateway-key": key } })).rejects.toMatchObject({ code: "UNAUTHORIZED", status: 401 });
  expect(seen).toEqual([["Bearer pending-token", null]]);
  expect((await loadAuthSession())?.refreshToken).toBe("refresh-a");
});

it("lets a new session rotate independently while the previous session's refresh is pending", async () => {
  await storeAuthSession(session());
  const entered = deferred(), release = deferred();
  server.use(
    http.get(`${globalEntry}/me`, ({ request }) => request.headers.get("authorization") === `Bearer ${token("session-b", 1800)}`
      ? HttpResponse.json({ session: "b" }) : HttpResponse.json({}, { status: 401 })),
    http.post(`${globalEntry}/auth/refresh`, async ({ request }) => {
      const body = await request.json() as { refreshToken: string };
      if (body.refreshToken === "refresh-a") {
        entered.resolve(); await release.promise;
        return HttpResponse.json({ accessToken: token("session-a", 1800), refreshToken: "stale-rotation" });
      }
      return HttpResponse.json({ accessToken: token("session-b", 1800), refreshToken: "refresh-c" });
    }),
  );
  const old = apiClient.get("/me").catch(error => error);
  await entered.promise;
  await storeAuthSession({ ...session(), accessToken: token("session-b", 1), refreshToken: "refresh-b" });
  expect(await apiClient.get("/me")).toEqual({ session: "b" });
  release.resolve();
  expect(await old).toMatchObject({ code: "SESSION_CHANGED" });
  expect((await loadAuthSession())?.refreshToken).toBe("refresh-c");
});

it("does no network work after cancellation during private gateway preparation", async () => {
  selectTesterRoute("tm");
  await storeAuthSession({ ...session(), accessToken: token("session-a", 1) });
  const entered = deferred(), release = deferred();
  vi.mocked(SecureStore.getItemAsync).mockImplementation(async name => {
    if (name === "carberk_staging_gateway_key") { entered.resolve(); await release.promise; }
    return storage.get(name) ?? null;
  });
  const received: string[] = [];
  server.use(http.post(`${tmEntry}/auth/refresh`, () => { received.push("refresh"); return HttpResponse.json({ accessToken: token(), refreshToken: "unexpected-rotation" }); }),
    http.get(`${tmEntry}/me`, () => { received.push("read"); return HttpResponse.json({ ok: true }); }));
  const controller = new AbortController();
  const pending = apiClient.get("/me", undefined, { signal: controller.signal }).catch(error => error);
  await entered.promise;
  controller.abort();
  expect(await pending).toMatchObject({ code: "NETWORK_ERROR" });
  release.resolve();
  await new Promise(resolve => setImmediate(resolve));
  expect(received).toEqual([]);
  expect((await loadAuthSession())?.refreshToken).toBe("refresh-a");
});

it("treats gateway access denial as unavailable while preserving API permission errors", async () => {
  selectTesterRoute("tm");
  await storeAuthSession(session());
  server.use(http.get(`${tmEntry}/me`, () => HttpResponse.json({ error: "gateway_access_denied" }, { status: 403 })));
  await expect(apiClient.get("/me")).rejects.toMatchObject({ code: "ROUTE_UNAVAILABLE", status: 503 });
  expect((await loadAuthSession())?.refreshToken).toBe("refresh-a");
  server.use(http.get(`${tmEntry}/me`, () => HttpResponse.json({ code: "FORBIDDEN" }, { status: 403 })));
  await expect(apiClient.get("/me")).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
  expect((await loadAuthSession())?.refreshToken).toBe("refresh-a");
});

it.each(["success", "rejected", "contract"].flatMap(response =>
  ["sign-out", "new-user", "new-session"].map(change => ({ response, change })),
))("keeps $change when a $response refresh's native ownership read returns late", async ({ response, change }) => {
  await storeAuthSession(session());
  const entered = deferred(), release = deferred();
  let holdGuard = false;
  vi.mocked(SecureStore.getItemAsync).mockImplementation(async name => {
    const value = storage.get(name) ?? null;
    if (holdGuard && name === "auto_tm_auth_session") {
      holdGuard = false; entered.resolve(); await release.promise;
    }
    return value;
  });
  server.use(
    http.get(`${globalEntry}/me`, ({ request }) => request.headers.get("authorization") === `Bearer ${token()}`
      ? HttpResponse.json({}, { status: 401 }) : HttpResponse.json({ id: user.id })),
    http.post(`${globalEntry}/auth/refresh`, () => {
      holdGuard = true;
      return HttpResponse.json(response === "success"
        ? { accessToken: token("session-a", 1200), refreshToken: "late-rotation" } : {},
      { status: response === "rejected" ? 401 : 201 });
    }),
  );
  const pending = apiClient.get("/me").catch((error: unknown) => error);
  await entered.promise;
  const replacement = { ...session(), user: change === "new-user"
    ? { ...user, id: "22222222-2222-4222-8222-222222222222" } : user,
    accessToken: token("session-b"), refreshToken: "replacement-session" };
  const newerIntent = change === "sign-out" ? clearAuthSession() : storeAuthSession(replacement);
  release.resolve();
  await newerIntent;
  expect(await pending).toMatchObject({ code: "SESSION_CHANGED" });
  expect((await loadAuthSession())?.refreshToken ?? null).toBe(change === "sign-out" ? null : "replacement-session");
});
