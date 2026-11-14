import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import * as SecureStore from "expo-secure-store";

import { server } from "../../test/msw";
import { clearAuthSession, loadAuthSession, storeAuthSession, updateStoredSessionUser } from "../auth/session";

import { apiClient } from "./client";

const base = "http://localhost:3006/api/v1";
const user = { id: "11111111-1111-4111-8111-111111111111", phone: "+99361000001", email: null, displayName: null, role: "buyer" as const };
const token = (sid = "a", life = 900) => `e30.${Buffer.from(JSON.stringify({ sub: user.id, sid, iat: 1000, exp: 1000 + life })).toString("base64url")}.sig`;
const session = () => ({ user, accessToken: token(), refreshToken: "refresh-a" });
const storage = new Map<string, string>();
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

beforeEach(async () => {
  storage.clear();
  vi.mocked(SecureStore.getItemAsync).mockImplementation(async key => storage.get(key) ?? null);
  vi.mocked(SecureStore.setItemAsync).mockImplementation(async (key, value) => { storage.set(key, value); });
  vi.mocked(SecureStore.deleteItemAsync).mockImplementation(async key => { storage.delete(key); });
  await clearAuthSession();
});
afterEach(() => { vi.restoreAllMocks(); });

it.each([false, true])("shares rotation and retries with the rotated bearer (expired=%s)", async expired => {
  await storeAuthSession(session());
  if (expired) vi.spyOn(Date, "now").mockReturnValue(Date.now() + 901_000);
  const entered = deferred(), release = deferred();
  let rotations = 0;
  server.use(
    http.post(`${base}/auth/refresh`, async () => {
      rotations++; entered.resolve(); await release.promise;
      return HttpResponse.json({ accessToken: token("a", 1800), refreshToken: "rotated" });
    }),
    http.get(`${base}/me`, ({ request }) => request.headers.get("authorization") === `Bearer ${token()}`
      ? HttpResponse.json({}, { status: 401 }) : HttpResponse.json({ bearer: request.headers.get("authorization") })),
  );
  const first = apiClient.get("/me"), second = apiClient.get("/me");
  await entered.promise; release.resolve();
  expect(await first).toEqual({ bearer: `Bearer ${token("a", 1800)}` });
  expect(await second).toEqual({ bearer: `Bearer ${token("a", 1800)}` });
  expect(rotations).toBe(1);
  expect((await loadAuthSession())?.refreshToken).toBe("rotated");
});

it.each(["success", "rejected", "contract"].flatMap(response =>
  ["sign-out", "new-user", "new-session"].map(change => ({ response, change })),
))("keeps $change when a $response refresh ownership read returns late", async ({ response, change }) => {
  await storeAuthSession(session());
  const entered = deferred(), release = deferred();
  let holdGuard = false;
  vi.mocked(SecureStore.getItemAsync).mockImplementation(async key => {
    const value = storage.get(key) ?? null;
    if (holdGuard && key === "auto_tm_auth_session") {
      holdGuard = false; entered.resolve(); await release.promise;
    }
    return value;
  });
  server.use(
    http.get(`${base}/me`, ({ request }) => request.headers.get("authorization") === `Bearer ${token()}`
      ? HttpResponse.json({}, { status: 401 }) : HttpResponse.json({ ok: true })),
    http.post(`${base}/auth/refresh`, () => {
      holdGuard = true;
      return HttpResponse.json(response === "success" ? { accessToken: token("a", 1200), refreshToken: "late" } : {},
        { status: response === "rejected" ? 401 : 201 });
    }),
  );
  const pending = apiClient.get("/me").catch((error: unknown) => error);
  await entered.promise;
  const newer = change === "sign-out" ? clearAuthSession() : storeAuthSession({ ...session(),
    user: change === "new-user" ? { ...user, id: "22222222-2222-4222-8222-222222222222" } : user,
    accessToken: token("b"), refreshToken: "replacement" });
  release.resolve(); await newer; await pending;
  const current = await loadAuthSession();
  expect(current?.refreshToken ?? null).toBe(change === "sign-out" ? null : "replacement");
  if (change === "new-user") expect(current?.user.id).toBe("22222222-2222-4222-8222-222222222222");
});

it.each(["success", "rejected"])("keeps a newer sign-in when the native %s commit finishes late", async response => {
  await storeAuthSession(session());
  const entered = deferred(), release = deferred();
  vi.mocked(SecureStore.setItemAsync).mockImplementation(async (key, value) => {
    if (value.includes('"refreshToken":"late"')) { entered.resolve(); await release.promise; }
    storage.set(key, value);
  });
  vi.mocked(SecureStore.deleteItemAsync).mockImplementation(async key => {
    entered.resolve(); await release.promise; storage.delete(key);
  });
  server.use(http.get(`${base}/me`, () => HttpResponse.json({}, { status: 401 })),
    http.post(`${base}/auth/refresh`, () => HttpResponse.json(response === "success"
      ? { accessToken: token("a", 1200), refreshToken: "late" } : {}, { status: response === "rejected" ? 401 : 201 })));
  const pending = apiClient.get("/me").catch((error: unknown) => error);
  await entered.promise;
  const newer = storeAuthSession({ ...session(), accessToken: token("b"), refreshToken: "replacement" });
  release.resolve(); await newer; await pending;
  expect((await loadAuthSession())?.refreshToken).toBe("replacement");
});

it.each([403, 429, 503, "network", "unreadable"] as const)("preserves the session after a non-authoritative refresh failure: %s", async failure => {
  await storeAuthSession(session());
  server.use(http.get(`${base}/me`, () => HttpResponse.json({}, { status: 401 })),
    http.post(`${base}/auth/refresh`, () => typeof failure === "number" ? HttpResponse.json({}, { status: failure })
      : failure === "network" ? HttpResponse.error() : new HttpResponse("<html>unavailable</html>")));
  await expect(apiClient.get("/me")).rejects.toBeDefined();
  expect((await loadAuthSession())?.refreshToken).toBe("refresh-a");
});

it.each([401, 201])("clears only the current session after rejection or invalid refresh contract: %s", async status => {
  await storeAuthSession(session());
  server.use(http.get(`${base}/me`, () => HttpResponse.json({}, { status: 401 })),
    http.post(`${base}/auth/refresh`, () => HttpResponse.json({}, { status })));
  await expect(apiClient.get("/me")).rejects.toMatchObject({ code: status === 401 ? "UNAUTHENTICATED" : "CONTRACT_VIOLATION" });
  expect(await loadAuthSession()).toBeNull();
});

it("preserves current contact metadata when refresh completes", async () => {
  await storeAuthSession(session());
  const entered = deferred(), release = deferred();
  server.use(http.get(`${base}/me`, ({ request }) => request.headers.get("authorization") === `Bearer ${token()}`
    ? HttpResponse.json({}, { status: 401 }) : HttpResponse.json({ ok: true })),
  http.post(`${base}/auth/refresh`, async () => {
    entered.resolve(); await release.promise;
    return HttpResponse.json({ accessToken: token("a", 1200), refreshToken: "rotated" });
  }));
  const pending = apiClient.get("/me");
  await entered.promise;
  await updateStoredSessionUser({ phone: "+99361000002", email: null });
  release.resolve(); await pending;
  expect((await loadAuthSession())?.user.phone).toBe("+99361000002");
  expect((await loadAuthSession())?.refreshToken).toBe("rotated");
});

it("allows a later sign-in after native credential storage fails", async () => {
  vi.mocked(SecureStore.setItemAsync).mockRejectedValueOnce(new Error("native storage unavailable"));
  await expect(storeAuthSession(session())).rejects.toThrow("native storage unavailable");
  await storeAuthSession({ ...session(), refreshToken: "recovered" });
  expect((await loadAuthSession())?.refreshToken).toBe("recovered");
});
