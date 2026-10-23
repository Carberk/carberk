import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ request: undefined as NextRequest | undefined }));
// Only Next's request-local storage boundary is replaced. Actions, guards,
// renewal, contracts and NextRequest/NextResponse run unchanged.
vi.mock("next/headers", () => ({
  headers: async () => state.request!.headers,
  cookies: async () => state.request!.cookies,
}));

const order = "11111111-1111-4111-8111-111111111111";
const file = "22222222-2222-4222-8222-222222222222";
const refresh = "a".repeat(64);
const rotatedRefresh = "b".repeat(64);
const jwt = (exp: number) => `e30.${Buffer.from(JSON.stringify({ exp })).toString("base64url")}.signature`;
const current = () => jwt(Math.floor(Date.now() / 1000) + 900);
const stage = {
  id: file, expectedOrderVersion: 3, contentType: "image/jpeg", sizeBytes: 3,
  rights: {
    category: "vehicle_observation", purpose: "Compare physical identity", basis: "Authorized synthetic fixture",
    provenance: "Synthetic capture", identifiability: "pseudonymous", use: ["service"],
    schedule: { kind: "until", until: "2026-12-01T00:00:00.000Z", reason: "Explicit fixture authorization" },
    supplierRestrictions: "", hold: null,
  },
};

function request(cookie = `auto_tm_admin_access=${current()}`, origin = "http://admin.auto.tm", method = "POST", path = `/diagnostics/orders/${order}`) {
  return new NextRequest(`http://admin.auto.tm${path}`, {
    method, headers: { cookie, origin, host: "admin.auto.tm", "next-action": "existing-action-id" },
  });
}

async function enter(incoming: NextRequest) {
  const { proxy } = await import("./proxy");
  const response = await proxy(incoming);
  // Consume NextResponse's real request overrides at the request-storage seam.
  // This is not an action HTTP encoder or a simulation of Next's final headers.
  const headers = new Headers(incoming.headers);
  const overrides = response.headers.get("x-middleware-override-headers");
  if (overrides !== null) {
    for (const key of [...headers.keys()]) headers.delete(key);
    for (const key of overrides.split(",").map(key => key.trim()).filter(Boolean)) {
      const value = response.headers.get(`x-middleware-request-${key}`);
      if (value !== null) headers.set(key, value);
    }
  }
  state.request = new NextRequest(incoming.url, { method: incoming.method, headers });
  return response;
}

function expectProtected(response: Response) {
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
}

describe("diagnostics proxy response headers", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("API_BASE_URL", "http://api.example.test");
    vi.stubEnv("ADMIN_ORIGIN", "http://admin.auto.tm");
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

  it("protects a fresh-session action read without renewal or cookie changes", async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json([]));
    const response = await enter(request());
    const { diagnosticIdentityRecords } = await import("./app/diagnostics/actions");
    expect(await diagnosticIdentityRecords(order)).toEqual({ ok: true, data: [] });
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledWith(`http://api.example.test/api/v1/diagnostics/orders/${order}/identity-records`, expect.objectContaining({ cache: "no-store", redirect: "manual" }));
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("set-cookie")).toBeNull();
    expectProtected(response);
  });

  it.each(["https://attacker.invalid", "invalid-origin", ""])("protects origin denial %s before renewal or mutation", async origin => {
    const response = await enter(request(`auto_tm_admin_refresh=${refresh}`, origin));
    expect(response.status).toBe(403);
    expect(await response.text()).toBe("");
    expect(fetch).not.toHaveBeenCalled();
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(response.headers.get("x-middleware-next")).toBeNull();
    expectProtected(response);
  });

  it.each([401, 403, 409, 500])("protects a mutation's sanitized upstream %s failure without replay", async status => {
    vi.mocked(fetch).mockResolvedValue(Response.json({ accessToken: "secret-token", url: "https://storage.invalid/private" }, { status }));
    const response = await enter(request());
    const { diagnosticStageIdentityProvenance } = await import("./app/diagnostics/actions");
    const result = await diagnosticStageIdentityProvenance(order, stage);
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toMatch(/secret-token|storage.invalid/);
    expect(fetch).toHaveBeenCalledOnce();
    expect(response.headers.get("set-cookie")).toBeNull();
    expectProtected(response);
  });

  it("protects invalid action input without sending a mutation", async () => {
    const response = await enter(request());
    const { diagnosticStageIdentityProvenance } = await import("./app/diagnostics/actions");
    expect(await diagnosticStageIdentityProvenance(order, { ...stage, storageKey: "private" })).toEqual({ ok: false, error: "error", code: "DIAGNOSTIC_INVALID_INPUT" });
    expect(fetch).not.toHaveBeenCalled();
    expectProtected(response);
  });

  it("protects a rotated action mutation and shares exactly one renewal", async () => {
    const access = current();
    vi.mocked(fetch).mockImplementation(async url => String(url).endsWith("/auth/refresh")
      ? Response.json({ accessToken: access, refreshToken: rotatedRefresh })
      : Response.json({ id: file, state: "staged" }));
    const oldCookie = `auto_tm_admin_access=${jwt(1)}; auto_tm_admin_refresh=${refresh}`;
    const [response, concurrent] = await Promise.all([enter(request(oldCookie)), enter(request(oldCookie))]);
    const { diagnosticStageIdentityProvenance } = await import("./app/diagnostics/actions");
    expect(await diagnosticStageIdentityProvenance(order, stage)).toEqual({ ok: true, data: { id: file, state: "staged" } });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenLastCalledWith(`http://api.example.test/api/v1/diagnostics/orders/${order}/identity-provenance`, expect.objectContaining({ method: "POST", body: JSON.stringify(stage), headers: { Authorization: `Bearer ${access}`, "Content-Type": "application/json" } }));
    for (const result of [response, concurrent]) {
      expect(result.cookies.get("auto_tm_admin_refresh")?.value).toBe(rotatedRefresh);
      expect(result.cookies.get("auto_tm_admin_access")?.value).toBe(access);
      expectProtected(result);
    }
  });

  it.each(["missing", "rejected"])("protects %s expiry and preserves the first native action redirect guard", async mode => {
    vi.mocked(fetch).mockResolvedValue(Response.json({ code: "TOKEN_ALREADY_USED" }, { status: 401 }));
    const response = await enter(request(mode === "missing" ? "" : `auto_tm_admin_refresh=${refresh}`));
    const { diagnosticStageIdentityProvenance } = await import("./app/diagnostics/actions");
    await expect(diagnosticStageIdentityProvenance("invalid", {})).rejects.toMatchObject({
      digest: `NEXT_REDIRECT;replace;/login?reason=session-expired&returnTo=%2Fdiagnostics%2Forders%2F${order};307;`,
    });
    expect(fetch).toHaveBeenCalledTimes(mode === "missing" ? 0 : 1);
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("location")).toBeNull();
    expect(state.request!.cookies.get("auto_tm_admin_refresh")).toBeUndefined();
    expect(response.cookies.get("auto_tm_admin_access")).toMatchObject({ value: "", maxAge: 0 });
    expect(response.cookies.get("auto_tm_admin_refresh")).toMatchObject({ value: "", maxAge: 0 });
    expectProtected(response);
  });

  it.each([429, 500, 503])("protects renewal-unavailable %s without dispatch, cookie clearing or retry", async status => {
    vi.mocked(fetch).mockResolvedValue(Response.json({ secret: "protected-data" }, { status }));
    const incoming = request(`auto_tm_admin_refresh=${refresh}`);
    const response = await enter(incoming);
    expect(response.status).toBe(503);
    expect(response.headers.get("x-middleware-next")).toBeNull();
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(response.headers.get("retry-after")).toBe("5");
    expect(await response.text()).not.toContain("protected-data");
    expect(incoming.cookies.get("auto_tm_admin_refresh")?.value).toBe(refresh);
    expect(fetch).toHaveBeenCalledOnce();
    expectProtected(response);
  });

  it("protects an ordinary failed mutation redirect without replaying POST", async () => {
    const incoming = request(""); incoming.headers.delete("next-action");
    const response = await enter(incoming);
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(`http://admin.auto.tm/login?reason=session-expired&returnTo=%2Fdiagnostics%2Forders%2F${order}`);
    expect(fetch).not.toHaveBeenCalled();
    expectProtected(response);
  });

  it.each(["/diagnostics", `/diagnostics/orders/${order}/identity-provenance/${file}`])("protects GET at the diagnostics boundary %s", async path => {
    const response = await enter(request(undefined, undefined, "GET", path));
    expect(response.headers.get("set-cookie")).toBeNull();
    expectProtected(response);
  });

  it.each(["/login", "/diagnostics-public", "/diagnostics-other/orders", "/reports"])("leaves existing headers outside diagnostics unchanged at %s", async path => {
    const response = await enter(request(undefined, undefined, "GET", path));
    expect(response.headers.get("cache-control")).toBeNull();
    expect(response.headers.get("x-content-type-options")).toBeNull();
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
});
