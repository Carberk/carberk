import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

import { proxy } from "./proxy";

describe("admin proxy", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it("keeps the localized History destination through the existing sign-in bridge", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const response = await proxy(new NextRequest("http://admin.auto.tm/vehicle-history/tk"));
    expect(response.headers.get("location")).toBe("http://admin.auto.tm/login?reason=session-expired&returnTo=%2Fvehicle-history%2Ftk");
  });

  it("redirects unauthenticated protected routes to login with pathname and search returnTo", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const request = new NextRequest(
      "http://admin.auto.tm/audit?action=LISTING_BAN&page=2",
    );

    const response = await proxy(request);

    expect(response.headers.get("location")).toBe(
      "http://admin.auto.tm/login?reason=session-expired&returnTo=%2Faudit%3Faction%3DLISTING_BAN%26page%3D2",
    );
  });

  it("forwards a sanitized returnTo request header for protected routes with an access cookie", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const request = new NextRequest("http://admin.auto.tm/reports?page=2", {
      headers: {
        cookie: `auto_tm_admin_access=${jwt(Math.floor(Date.now() / 1000) + 900)}`,
      },
    });

    const response = await proxy(request);

    expect(response.headers.get("x-middleware-request-x-admin-return-to")).toBe(
      "/reports?page=2",
    );
  });
});

const refresh = "a".repeat(64);
const rotatedRefresh = "b".repeat(64);
function jwt(exp: number): string {
  return `e30.${Buffer.from(JSON.stringify({ exp })).toString("base64url")}.signature`;
}
function expiredRequest(method = "GET", token = refresh) {
  return new NextRequest("http://admin.auto.tm/reports?page=2", {
    method, headers: { origin: "http://admin.auto.tm", cookie: `auto_tm_admin_access=${jwt(1)}; auto_tm_admin_refresh=${token}` },
  });
}

// This seam is the incoming request: cookie storage and dispatch are real
// NextRequest/NextResponse APIs; only the external API network is replaced.
describe("admin session renewal before request dispatch", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("API_BASE_URL", "http://api.example.test");
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals();
  });

  it.each([
    ["tk", "Iş ýeri açylmady"], ["ru", "Не удалось открыть рабочее место"], ["en", "Could not open the desk"],
  ])("keeps History renewal outages actionable in %s without clearing the session", async (locale, title) => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 503 }));
    const { proxy } = await import("./proxy");
    const response = await proxy(new NextRequest(`http://admin.auto.tm/vehicle-history/${locale}`, {
      headers: { cookie: `auto_tm_admin_access=${jwt(1)}; auto_tm_admin_refresh=${refresh}` },
    }));
    expect(response.status).toBe(503);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(await response.text()).toContain(title);
  });

  it.each(["tk", "ru", "en"])("keeps the %s scoped renewal-outage retry URL", async (locale) => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 503 }));
    const { proxy } = await import("./proxy");
    const response = await proxy(new NextRequest(`http://admin.auto.tm/login?reason=session-expired&returnTo=%2Fvehicle-history%2F${locale}`, {
      headers: { cookie: `auto_tm_admin_access=${jwt(1)}; auto_tm_admin_refresh=${refresh}` },
    }));
    expect(response.status).toBe(503);
    expect(await response.text()).toContain(`href="/login?reason=session-expired&amp;returnTo=%2Fvehicle-history%2F${locale}"`);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("preserves a scoped login destination when its action session expires", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 401 }));
    const { proxy } = await import("./proxy");
    const response = await proxy(new NextRequest("http://admin.auto.tm/login?mode=totp&returnTo=%2Fvehicle-history%2Fen", { method: "POST", headers: { origin: "http://admin.auto.tm", "next-action": "synthetic", cookie: `auto_tm_admin_access=${jwt(1)}; auto_tm_admin_refresh=${refresh}` } }));
    expect(response.headers.get("x-middleware-request-x-admin-return-to")).toBe("/vehicle-history/en");
  });

  it("renews the root GET before its redirect to reports", async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json({ accessToken: jwt(Math.floor(Date.now() / 1000) + 900), refreshToken: rotatedRefresh }));
    const { proxy } = await import("./proxy");
    const response = await proxy(new NextRequest("http://admin.auto.tm/", {
      headers: { cookie: `auto_tm_admin_refresh=${refresh}` },
    }));
    expect(response.cookies.get("auto_tm_admin_refresh")?.value).toBe(rotatedRefresh);
    expect(response.headers.get("x-middleware-request-x-admin-return-to")).toBe("/");
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("renews an expired GET and forwards/stores both rotated tokens", async () => {
    const access = jwt(Math.floor(Date.now() / 1000) + 900);
    vi.mocked(fetch).mockResolvedValue(Response.json({ accessToken: access, refreshToken: rotatedRefresh }));
    const { proxy } = await import("./proxy");
    const response = await proxy(expiredRequest());
    expect(response.cookies.get("auto_tm_admin_access")?.value).toBe(access);
    expect(response.cookies.get("auto_tm_admin_refresh")?.value).toBe(rotatedRefresh);
    expect(response.headers.get("x-middleware-request-cookie")).toContain(`auto_tm_admin_access=${access}`);
    expect(response.headers.get("x-middleware-request-cookie")).toContain(`auto_tm_admin_refresh=${rotatedRefresh}`);
    expect(response.headers.get("location")).toBeNull();
    expect(fetch).toHaveBeenCalledWith("http://api.example.test/api/v1/auth/refresh", expect.any(Object));
    const [, init] = vi.mocked(fetch).mock.calls[0] ?? [null, { headers: new Headers() }];
    expect((init?.headers as Headers).get("x-real-ip")).toBeNull();
  });

  it("forwards only the trusted operator address during renewal", async () => {
    const access = jwt(Math.floor(Date.now() / 1000) + 900);
    vi.mocked(fetch).mockResolvedValue(Response.json({ accessToken: access, refreshToken: rotatedRefresh }));
    const { proxy } = await import("./proxy");
    await proxy(new NextRequest("http://admin.auto.tm/reports", {
      headers: {
        cookie: `auto_tm_admin_refresh=${refresh}`,
        "x-real-ip": "203.0.113.7",
        "x-forwarded-for": "198.51.100.1",
      },
    }));
    const [, init] = vi.mocked(fetch).mock.calls[0] ?? [null, { headers: new Headers() }];
    expect((init?.headers as Headers).get("x-real-ip")).toBe("203.0.113.7");
  });

  it("renews before dispatching a Server Action and preserves its POST body", async () => {
    const access = jwt(Math.floor(Date.now() / 1000) + 900);
    vi.mocked(fetch).mockResolvedValue(Response.json({ accessToken: access, refreshToken: rotatedRefresh }));
    const { proxy } = await import("./proxy");
    const request = new NextRequest("http://admin.auto.tm/reports", {
      method: "POST", body: "original-action-payload",
      headers: { origin: "http://admin.auto.tm", "next-action": "action-id", cookie: `auto_tm_admin_refresh=${refresh}` },
    });
    const response = await proxy(request);
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("x-middleware-request-cookie")).toContain(`auto_tm_admin_access=${access}`);
    expect(request.method).toBe("POST");
    expect(await request.text()).toBe("original-action-payload");
  });

  it("shares one single-use rotation across near-simultaneous requests", async () => {
    const access = jwt(Math.floor(Date.now() / 1000) + 900);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    vi.mocked(fetch).mockImplementation(async () => {
      await gate;
      return Response.json({ accessToken: access, refreshToken: rotatedRefresh });
    });
    const { proxy } = await import("./proxy");
    const first = proxy(expiredRequest());
    const second = proxy(expiredRequest("POST"));
    release();
    for (const response of await Promise.all([first, second])) {
      expect(response.cookies.get("auto_tm_admin_refresh")?.value).toBe(rotatedRefresh);
      expect(response.headers.get("location")).toBeNull();
    }
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("clears both cookies and cancels a losing action with a 303 login redirect", async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json({ code: "TOKEN_ALREADY_USED" }, { status: 401 }));
    const { proxy } = await import("./proxy");
    const response = await proxy(expiredRequest("POST"));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://admin.auto.tm/login?reason=session-expired&returnTo=%2Freports%3Fpage%3D2");
    for (const name of ["auto_tm_admin_access", "auto_tm_admin_refresh"]) {
      expect(response.cookies.get(name)).toMatchObject({ value: "", maxAge: 0 });
    }
    expect(response.headers.get("x-middleware-next")).toBeNull();
    const location = response.headers.get("location");
    if (!location) throw new Error("missing login redirect");
    const login = await proxy(new NextRequest(location));
    expect(login.headers.get("location")).toBeNull();
  });

  it("hands off only for five seconds, then lets the API reject the old token", async () => {
    vi.useFakeTimers();
    const access = jwt(Math.floor(Date.now() / 1000) + 900);
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ accessToken: access, refreshToken: rotatedRefresh }))
      .mockResolvedValue(Response.json({ code: "INVALID_REFRESH_TOKEN" }, { status: 401 }));
    const { proxy } = await import("./proxy");
    const first = await proxy(expiredRequest());
    expect(first.cookies.get("auto_tm_admin_refresh")?.value).toBe(rotatedRefresh);
    const handoff = await proxy(expiredRequest());
    expect(handoff.cookies.get("auto_tm_admin_refresh")?.value).toBe(rotatedRefresh);
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(5_001);
    const late = await proxy(expiredRequest());
    expect(late.headers.get("location")).toContain("/login?reason=session-expired");
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("a crafted expiry link or TOTP reload cannot erase a current session", async () => {
    const { proxy } = await import("./proxy");
    const response = await proxy(new NextRequest("http://admin.auto.tm/login?reason=session-expired&mode=totp", {
      headers: { cookie: `auto_tm_admin_access=${jwt(Math.floor(Date.now() / 1000) + 900)}; auto_tm_admin_refresh=${refresh}` },
    }));
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(response.headers.get("location")).toBe("http://admin.auto.tm/login?mode=totp");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("a current access hint at the expiry URL cannot loop back into a rejecting layout", async () => {
    const { proxy } = await import("./proxy");
    const headers = { cookie: `auto_tm_admin_access=${jwt(Math.floor(Date.now() / 1000) + 900)}; auto_tm_admin_refresh=${refresh}` };
    const response = await proxy(new NextRequest("http://admin.auto.tm/login?reason=session-expired", { headers }));
    expect(response.headers.get("location")).toBe("http://admin.auto.tm/login");
    expect(response.headers.get("set-cookie")).toBeNull();
    const cleanLogin = await proxy(new NextRequest("http://admin.auto.tm/login", { headers }));
    expect(cleanLogin.headers.get("location")).toBeNull();
    expect(cleanLogin.headers.get("set-cookie")).toBeNull();
  });

  it("an expiry login link renews a refresh-only session instead of clearing it", async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json({ accessToken: jwt(Math.floor(Date.now() / 1000) + 900), refreshToken: rotatedRefresh }));
    const { proxy } = await import("./proxy");
    const response = await proxy(new NextRequest("http://admin.auto.tm/login?reason=session-expired", {
      headers: { cookie: `auto_tm_admin_refresh=${refresh}` },
    }));
    expect(response.cookies.get("auto_tm_admin_refresh")?.value).toBe(rotatedRefresh);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("login expiry link clears only an API-rejected renewal and stays at login", async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json({}, { status: 401 }));
    const { proxy } = await import("./proxy");
    const response = await proxy(new NextRequest("http://admin.auto.tm/login?reason=session-expired", {
      headers: { cookie: `auto_tm_admin_refresh=${refresh}` },
    }));
    expect(fetch).toHaveBeenCalledOnce();
    expect(response.cookies.get("auto_tm_admin_refresh")).toMatchObject({ value: "", maxAge: 0 });
    expect(response.headers.get("location")).toBeNull();
  });

  it("login expiry link preserves refresh cookies during an outage", async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json({}, { status: 503 }));
    const { proxy } = await import("./proxy");
    const response = await proxy(new NextRequest("http://admin.auto.tm/login?reason=session-expired", {
      headers: { cookie: `auto_tm_admin_refresh=${refresh}` },
    }));
    expect(response.status).toBe(503);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("does not bypass expired POST renewal on the session-expired login URL", async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json({ code: "INVALID_REFRESH_TOKEN" }, { status: 401 }));
    const { proxy } = await import("./proxy");
    const request = new NextRequest("http://admin.auto.tm/login?reason=session-expired", {
      method: "POST", headers: { origin: "http://admin.auto.tm", cookie: `auto_tm_admin_refresh=${refresh}` },
    });
    const response = await proxy(request);
    expect(response.status).toBe(303);
    expect(response.headers.get("x-middleware-next")).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("rejects a cross-origin action before spending its refresh token", async () => {
    const { proxy } = await import("./proxy");
    const request = expiredRequest("POST");
    request.headers.set("origin", "https://evil.example");
    expect((await proxy(request)).status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(["/reports", "/catalog/brands", "/login"])("checks configured public Origin on cookie-bearing POST %s", async (path) => {
    vi.stubEnv("ADMIN_ORIGIN", "https://admin.auto.tm");
    vi.mocked(fetch).mockResolvedValue(Response.json({ accessToken: jwt(Math.floor(Date.now() / 1000) + 900), refreshToken: rotatedRefresh }));
    const { proxy } = await import("./proxy");
    for (const origin of [undefined, "https://other.example"]) {
      const headers = new Headers({ cookie: `auto_tm_admin_refresh=${refresh}` });
      if (origin) headers.set("origin", origin);
      const response = await proxy(new NextRequest(`http://localhost:3001${path}`, { method: "POST", headers }));
      expect(response.status).toBe(403);
      expect(response.headers.get("set-cookie")).toBeNull();
      expect(fetch).not.toHaveBeenCalled();
    }
    const response = await proxy(new NextRequest(`http://localhost:3001${path}`, {
      method: "POST", headers: { origin: "https://admin.auto.tm", cookie: `auto_tm_admin_refresh=${refresh}` },
    }));
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.cookies.get("auto_tm_admin_refresh")?.value).toBe(rotatedRefresh);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("protects catalog GETs and forwards current sessions without renewal", async () => {
    const { proxy } = await import("./proxy");
    const anonymous = await proxy(new NextRequest("http://admin.auto.tm/catalog/brands"));
    expect(anonymous.status).toBe(303);
    expect(anonymous.headers.get("location")).toContain("/login?reason=session-expired");
    const current = await proxy(new NextRequest("http://admin.auto.tm/catalog/brands", {
      headers: { cookie: `auto_tm_admin_access=${jwt(Math.floor(Date.now() / 1000) + 900)}` },
    }));
    expect(current.headers.get("x-middleware-next")).toBe("1");
    expect(current.headers.get("x-middleware-request-x-admin-return-to")).toBe("/catalog/brands");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("never hands one operator's rotated pair to another refresh token", async () => {
    const access = jwt(Math.floor(Date.now() / 1000) + 900);
    const otherRefresh = "c".repeat(64);
    const otherRotated = "d".repeat(64);
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ accessToken: access, refreshToken: rotatedRefresh }))
      .mockResolvedValueOnce(Response.json({ accessToken: access, refreshToken: otherRotated }));
    const { proxy } = await import("./proxy");
    const first = await proxy(expiredRequest());
    const other = await proxy(expiredRequest("GET", otherRefresh));
    const handoff = await proxy(expiredRequest());
    expect(first.cookies.get("auto_tm_admin_refresh")?.value).toBe(rotatedRefresh);
    expect(other.cookies.get("auto_tm_admin_refresh")?.value).toBe(otherRotated);
    expect(handoff.cookies.get("auto_tm_admin_refresh")?.value).toBe(rotatedRefresh);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("bounds proven handoffs at 128 and preserves cookies on capacity failure", async () => {
    vi.useFakeTimers();
    const access = jwt(Math.floor(Date.now() / 1000) + 900);
    vi.mocked(fetch).mockImplementation(async () => Response.json({ accessToken: access, refreshToken: rotatedRefresh }));
    const { proxy } = await import("./proxy");
    const token = (n: number) => n.toString(16).padStart(64, "0");
    for (let i = 1; i <= 128; i++) await proxy(expiredRequest("GET", token(i)));
    const overflow = await proxy(expiredRequest("GET", token(129)));
    expect(overflow.status).toBe(503);
    expect(overflow.headers.get("set-cookie")).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(128);
    expect((await proxy(expiredRequest("GET", token(1)))).cookies.get("auto_tm_admin_refresh")?.value).toBe(rotatedRefresh);
    await vi.advanceTimersByTimeAsync(5_001);
    expect((await proxy(expiredRequest("GET", token(129)))).status).toBe(200);
  });

  it("random unauthenticated refresh cookies cannot occupy the handoff capacity", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const access = jwt(Math.floor(Date.now() / 1000) + 900);
    vi.mocked(fetch).mockImplementation(async (_url, init) => {
      await gate;
      const body = JSON.parse(String(init?.body)) as { refreshToken: string };
      return body.refreshToken === refresh
        ? Response.json({ accessToken: access, refreshToken: rotatedRefresh })
        : Response.json({ code: "INVALID_REFRESH_TOKEN" }, { status: 401 });
    });
    const { proxy } = await import("./proxy");
    const attackers = Array.from({ length: 128 }, (_, i) => proxy(expiredRequest("GET", (i + 1).toString(16).padStart(64, "0"))));
    const operator = proxy(expiredRequest());
    release();
    const response = await operator;
    await Promise.all(attackers);
    expect(response.status).toBe(200);
    expect(response.cookies.get("auto_tm_admin_refresh")?.value).toBe(rotatedRefresh);
  });

  it.each([429, 500, 503])("keeps GET and action cookies on API %s, with a retry page", async (status) => {
    vi.mocked(fetch).mockImplementation(async () => Response.json({}, { status }));
    const { proxy } = await import("./proxy");
    for (const method of ["GET", "POST"]) {
      const request = expiredRequest(method);
      if (method === "POST") request.headers.set("next-action", "action-id");
      const response = await proxy(request);
      expect(response.status).toBe(503);
      expect(response.headers.get("set-cookie")).toBeNull();
      expect(response.headers.get("location")).toBeNull();
      expect(response.headers.get("x-middleware-next")).toBeNull();
      expect(await response.text()).toContain("Временно недоступно. Попробуйте ещё раз.");
      expect(request.cookies.get("auto_tm_admin_refresh")?.value).toBe(refresh);
    }
  });

  it.each(["network", "malformed"])("keeps the session on %s failure and allows a subsequent retry", async (failure) => {
    vi.mocked(fetch).mockImplementationOnce(async () => {
      if (failure === "network") throw new Error("network unavailable");
      return Response.json({ accessToken: "invalid", refreshToken: rotatedRefresh });
    }).mockResolvedValueOnce(Response.json({ accessToken: jwt(Math.floor(Date.now() / 1000) + 900), refreshToken: rotatedRefresh }));
    const { proxy } = await import("./proxy");
    const unavailable = await proxy(expiredRequest());
    expect(unavailable.status).toBe(503);
    expect(unavailable.headers.get("set-cookie")).toBeNull();
    expect((await proxy(expiredRequest())).status).toBe(200);
  });

  it("writes production Host cookies with unchanged lifetimes and restrictions", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const access = jwt(Math.floor(Date.now() / 1000) + 900);
    vi.mocked(fetch).mockResolvedValue(Response.json({ accessToken: access, refreshToken: rotatedRefresh }));
    const { proxy } = await import("./proxy");
    const response = await proxy(new NextRequest("https://admin.auto.tm/reports", {
      headers: { cookie: `__Host-auto_tm_admin_refresh=${refresh}` },
    }));
    expect(response.cookies.get("__Host-auto_tm_admin_access")).toMatchObject({ value: access, maxAge: 900, secure: true, httpOnly: true, sameSite: "lax", path: "/" });
    expect(response.cookies.get("__Host-auto_tm_admin_refresh")).toMatchObject({ value: rotatedRefresh, maxAge: 2592000, secure: true, httpOnly: true, sameSite: "lax", path: "/" });
  });

  it("aborts a stalled rotation after ten seconds without signing out", async () => {
    vi.useFakeTimers();
    vi.mocked(fetch).mockImplementation(async (_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
    }));
    const { proxy } = await import("./proxy");
    const pending = proxy(expiredRequest("POST"));
    await vi.advanceTimersByTimeAsync(10_000);
    const unavailable = await pending;
    expect(unavailable.status).toBe(503);
    expect(unavailable.headers.get("set-cookie")).toBeNull();
  });

  it("delegates a failed JavaScript Server Action to an early native action redirect", async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json({ code: "TOKEN_ALREADY_USED" }, { status: 401 }));
    const { proxy } = await import("./proxy");
    const request = expiredRequest("POST");
    request.headers.set("next-action", "action-id");
    request.headers.set("x-admin-session-expired", "untrusted");
    const response = await proxy(request);
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("x-middleware-request-x-admin-session-expired")).toBe("1");
    expect(response.headers.get("x-middleware-request-cookie") ?? "").not.toContain(refresh);
    expect(response.cookies.get("auto_tm_admin_refresh")).toMatchObject({ value: "", maxAge: 0 });
  });

  it("does not trust a browser-supplied expired-session marker on a valid request", async () => {
    const { proxy } = await import("./proxy");
    const request = new NextRequest("http://admin.auto.tm/login", { headers: { "x-admin-session-expired": "1" } });
    const response = await proxy(request);
    expect(response.headers.get("x-middleware-request-x-admin-session-expired")).toBeNull();
    expect(response.headers.get("x-middleware-override-headers")).not.toContain("x-admin-session-expired");
  });

  it("uses the configured public admin origin for login behind a private Next listener", async () => {
    vi.stubEnv("ADMIN_ORIGIN", "https://admin.auto.tm");
    const { proxy } = await import("./proxy");
    const response = await proxy(new NextRequest("http://localhost:3001/reports"));
    expect(response.headers.get("location")).toBe("https://admin.auto.tm/login?reason=session-expired&returnTo=%2Freports");
  });

});
