import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";

const mockState = vi.hoisted(() => ({
  cookieStore: {
    get: vi.fn(),
    set: vi.fn(),
  },
  redirect: vi.fn((url: string) => {
    const err = new Error(`NEXT_REDIRECT:${url}`);
    (err as Error & { digest?: string }).digest = `NEXT_REDIRECT;replace;${url};307;`;
    throw err;
  }),
  requestHeaders: new Headers(),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(() => Promise.resolve(mockState.cookieStore)),
  headers: vi.fn(() => Promise.resolve(mockState.requestHeaders)),
}));

vi.mock("next/navigation", () => ({
  redirect: mockState.redirect,
}));

import { apiFetch, apiFetchOptional, ApiError } from "./api-client";

const mockCookieStore = mockState.cookieStore;

describe("apiFetch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCookieStore.get.mockReturnValue(undefined);
    mockState.requestHeaders = new Headers();
  });

  it("forwards Authorization: Bearer header from access cookie", async () => {
    mockCookieStore.get.mockImplementation((name: string) => {
      if (name === "auto_tm_admin_access") return { value: "acc_tok" };
      return undefined;
    });

    global.fetch = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      ),
    ) as Mock;

    await apiFetch("/test");

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/test"),
      expect.objectContaining({
        headers: expect.any(Headers),
      }),
    );

    const [, init] = (global.fetch as Mock).mock.calls[0] ?? [null, { headers: new Headers() }];
    expect((init.headers as Headers).get("Authorization")).toBe("Bearer acc_tok");
  });

  it("forwards the sanitized operator IP in the API's trusted header", async () => {
    mockState.requestHeaders = new Headers({ "x-real-ip": "203.0.113.7" });
    global.fetch = vi.fn(() => Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }))) as Mock;

    await apiFetch("/test", { headers: { "x-real-ip": "198.51.100.1" } });

    const [, init] = (global.fetch as Mock).mock.calls[0] ?? [null, { headers: new Headers() }];
    expect((init.headers as Headers).get("x-real-ip")).toBe("203.0.113.7");
  });

  it("removes an API IP header when the incoming value is unusable", async () => {
    mockState.requestHeaders = new Headers({ "x-real-ip": "not-an-ip" });
    global.fetch = vi.fn(() => Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }))) as Mock;

    await apiFetch("/test", { headers: { "x-real-ip": "198.51.100.1" } });

    const [, init] = (global.fetch as Mock).mock.calls[0] ?? [null, { headers: new Headers() }];
    expect((init.headers as Headers).has("x-real-ip")).toBe(false);
  });

  it("returns parsed JSON on success", async () => {
    mockCookieStore.get.mockReturnValue({ value: "acc_tok" });
    global.fetch = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ id: "1" }), { status: 200 }),
      ),
    ) as Mock;

    const result = await apiFetch("/test");
    expect(result).toEqual({ id: "1" });
  });

  it("redirects rejected sessions without rotating from a Server Component", async () => {
    mockCookieStore.get.mockImplementation((name: string) => {
      if (name === "auto_tm_admin_access") return { value: "old_acc" };
      if (name === "auto_tm_admin_refresh") return { value: "ref_tok" };
      return undefined;
    });

    let callCount = 0;
    global.fetch = vi.fn(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve(new Response(null, { status: 401 }));
      }
      if (callCount === 2) {
        // Refresh response
        return Promise.resolve(
          new Response(
            JSON.stringify({ accessToken: "new_acc", refreshToken: "new_ref" }),
            { status: 200 },
          ),
        );
      }
      // Retry response
      return Promise.resolve(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      );
    }) as Mock;

    await expect(apiFetch("/test")).rejects.toThrow("NEXT_REDIRECT:/login?reason=session-expired");
    expect(callCount).toBe(1);
    expect(mockCookieStore.set).not.toHaveBeenCalled();
  });

  it("sends an API-rejected session to cookie-clearing login without render-time writes", async () => {
    mockCookieStore.get.mockImplementation((name: string) => {
      if (name === "auto_tm_admin_access") return { value: "old_acc" };
      if (name === "auto_tm_admin_refresh") return { value: "ref_tok" };
      return undefined;
    });

    global.fetch = vi.fn(() =>
      Promise.resolve(new Response(null, { status: 401 })),
    ) as Mock;

    await expect(apiFetch("/test")).rejects.toThrow("NEXT_REDIRECT:/login?reason=session-expired");
    expect(mockCookieStore.set).not.toHaveBeenCalled();
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("throws ApiError on non-401, non-200 responses", async () => {
    mockCookieStore.get.mockReturnValue({ value: "acc_tok" });
    global.fetch = vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            statusCode: 403,
            code: "FORBIDDEN",
            message: "Forbidden",
            timestamp: new Date().toISOString(),
            requestId: "req-1",
          }),
          { status: 403 },
        ),
      ),
    ) as Mock;

    await expect(apiFetch("/test")).rejects.toThrow(ApiError);
    try {
      await apiFetch("/test");
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).status).toBe(403);
      expect((err as ApiError).code).toBe("FORBIDDEN");
    }
  });

  it("never includes token material in error messages", async () => {
    mockCookieStore.get.mockReturnValue({ value: "secret_token_xyz" });
    global.fetch = vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            statusCode: 500,
            code: "INTERNAL",
            message: "Internal error",
            timestamp: new Date().toISOString(),
            requestId: "req-1",
          }),
          { status: 500 },
        ),
      ),
    ) as Mock;

    try {
      await apiFetch("/test");
    } catch (err) {
      const message = (err as Error).message;
      expect(message).not.toContain("secret_token_xyz");
    }
  });
});

describe("apiFetchOptional", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCookieStore.get.mockReturnValue(undefined);
  });

  it("returns null on optional API401 without a second rotation", async () => {
    mockCookieStore.get.mockImplementation((name: string) => {
      if (name === "auto_tm_admin_access") return { value: "old_acc" };
      if (name === "auto_tm_admin_refresh") return { value: "ref_tok" };
      return undefined;
    });

    global.fetch = vi.fn(() =>
      Promise.resolve(new Response(null, { status: 401 })),
    ) as Mock;

    const result = await apiFetchOptional("/test");
    expect(result).toBeNull();
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(mockCookieStore.set).not.toHaveBeenCalled();
  });

  it.each([403, 429, 500, 503])("surfaces optional API %s as an error without cookie writes", async (status) => {
    global.fetch = vi.fn(async () => Response.json({ code: "UNAVAILABLE", message: "Unavailable" }, { status }));
    await expect(apiFetchOptional("/auth/admin/totp/status")).rejects.toMatchObject({ status });
    expect(mockState.redirect).not.toHaveBeenCalled();
    expect(mockCookieStore.set).not.toHaveBeenCalled();
  });

  it("returns parsed data on success", async () => {
    mockCookieStore.get.mockReturnValue({ value: "acc_tok" });
    global.fetch = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      ),
    ) as Mock;

    const result = await apiFetchOptional("/test");
    expect(result).toEqual({ ok: true });
  });
});
