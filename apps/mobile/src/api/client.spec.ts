import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ZodSchema } from "zod";

import {
  loadAuthSession,
  storeAuthSession,
  clearAuthSession,
} from "../auth/session";
import { publishFailureOf } from "../listings/wizard/publishFailure";

import { apiClient, ApiError } from "./client";

vi.mock("../auth/session", () => ({
  loadAuthSession: vi.fn(),
  storeAuthSession: vi.fn(),
  clearAuthSession: vi.fn(),
}));

vi.mock("../locale/localeStore", () => ({
  localeStore: {
    getState: vi.fn(() => ({ locale: "ru" })),
    subscribe: vi.fn(),
  },
}));

const mockedLoadAuthSession = vi.mocked(loadAuthSession);
const mockedStoreAuthSession = vi.mocked(storeAuthSession);
const mockedClearAuthSession = vi.mocked(clearAuthSession);

function jsonResponse(
  body: unknown,
  status = 200,
  headers?: Record<string, string>,
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

describe("apiClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    ["/listings/fixture/republish", { code: "PHOTO_MINIMUM_REQUIRED", details: { minimum: 3 } }],
    ["/listings/drafts/fixture/publish", { code: "INVALID_DRAFT_PAYLOAD", details: { formErrors: ["AT_LEAST_THREE_PHOTOS_REQUIRED"] } }],
    ["/listings/drafts/fixture/publish", { code: "INVALID_DRAFT_PAYLOAD", details: { formErrors: ["AT_LEAST_ONE_PHOTO_REQUIRED"] } }],
  ])("preserves the photo refusal through the real HTTP parser for %s", async (path, body) => {
    mockedLoadAuthSession.mockResolvedValue(null);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({ ...body, message: "Photo minimum required" }, 400));
    const error = await apiClient.post(path, {}).catch((failure: unknown) => failure);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ code: body.code, status: 400, details: body.details });
    expect(publishFailureOf(error)).toBe("photos");
  });

  describe("auth header attachment", () => {
    it("attaches Authorization header when session exists", async () => {
      mockedLoadAuthSession.mockResolvedValue({
        accessToken: "token-123",
        refreshToken: "refresh-123",
        user: {
          id: "u1",
          phone: "+99361000000",
          email: null,
          displayName: null,
          role: "buyer" as const,
        },
        storedAt: new Date().toISOString(),
      });

      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockImplementation(() => Promise.resolve(jsonResponse({ ok: true })));

      await apiClient.get("/test");

      const call = fetchSpy.mock.calls[0];
      const reqInit = call?.[1] as RequestInit | undefined;
      const reqHeaders = reqInit?.headers as Record<string, string>;
      expect(reqHeaders?.Authorization).toBe("Bearer token-123");
    });

    it("attaches Accept-Language header from locale store", async () => {
      mockedLoadAuthSession.mockResolvedValue(null);

      const { localeStore } = await import("../locale/localeStore");
      vi.mocked(localeStore.getState).mockReturnValue({
        locale: "tk",
        setLocale: vi.fn(),
        hydrate: vi.fn(),
      });

      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockImplementation(() => Promise.resolve(jsonResponse({ ok: true })));

      await apiClient.get("/test");

      const call = fetchSpy.mock.calls[0];
      const reqInit = call?.[1] as RequestInit | undefined;
      const reqHeaders = reqInit?.headers as Record<string, string>;
      expect(reqHeaders?.["Accept-Language"]).toBe("tk");
    });

    it("skips Authorization header when auth: false", async () => {
      mockedLoadAuthSession.mockResolvedValue({
        accessToken: "token-123",
        refreshToken: "refresh-123",
        user: {
          id: "u1",
          phone: "+99361000000",
          email: null,
          displayName: null,
          role: "buyer" as const,
        },
        storedAt: new Date().toISOString(),
      });

      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockImplementation(() => Promise.resolve(jsonResponse({ ok: true })));

      await apiClient.get("/test", undefined, { auth: false });

      const call = fetchSpy.mock.calls[0];
      const reqInit = call?.[1] as RequestInit | undefined;
      const reqHeaders = reqInit?.headers as Record<string, string>;
      expect(reqHeaders?.Authorization).toBeUndefined();
    });
  });

  describe("expired access token", () => {
    function jwt(): string {
      const encode = (value: unknown) =>
        Buffer.from(JSON.stringify(value)).toString("base64url");
      return `${encode({ alg: "HS256" })}.${encode({ sub: "u1", iat: 1_000, exp: 1_900 })}.sig`;
    }
    const user = {
      id: "u1",
      phone: "+99361000000",
      email: null,
      displayName: null,
      role: "buyer" as const,
    };
    // The 15-minute token was stored an hour ago, so it has expired.
    const expired = () => ({
      accessToken: jwt(),
      refreshToken: "r1",
      user,
      storedAt: new Date(Date.now() - 60 * 60_000).toISOString(),
    });

    it("refreshes before sending, so a public route still sees the viewer", async () => {
      mockedLoadAuthSession
        .mockResolvedValueOnce(expired())
        .mockResolvedValueOnce(expired())
        .mockResolvedValueOnce(expired())
        .mockResolvedValue({ accessToken: "fresh-token", refreshToken: "r2", user, storedAt: new Date().toISOString() });

      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValueOnce(jsonResponse({ accessToken: "fresh-token", refreshToken: "r2" }))
        .mockResolvedValueOnce(jsonResponse({ items: [] }));

      await apiClient.get("/listings?limit=20");

      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(String(fetchSpy.mock.calls[0]?.[0])).toContain("/auth/refresh");
      const headers = (fetchSpy.mock.calls[1]?.[1] as RequestInit).headers as Record<string, string>;
      expect(headers.Authorization).toBe("Bearer fresh-token");
    });

    it("does not refresh a stored token that is still valid", async () => {
      mockedLoadAuthSession.mockResolvedValue({ ...expired(), storedAt: new Date().toISOString() });

      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValueOnce(jsonResponse({ items: [] }));

      await apiClient.get("/listings?limit=20");

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(String(fetchSpy.mock.calls[0]?.[0])).not.toContain("/auth/refresh");
      const headers = (fetchSpy.mock.calls[0]?.[1] as RequestInit).headers as Record<string, string>;
      expect(headers.Authorization).toBe(`Bearer ${jwt()}`);
    });

    it("sends the request anonymously when the refresh is rejected", async () => {
      mockedLoadAuthSession
        .mockResolvedValueOnce(expired())
        .mockResolvedValueOnce(expired())
        .mockResolvedValueOnce(expired())
        .mockResolvedValue(null);

      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValueOnce(jsonResponse({ code: "UNAUTHENTICATED" }, 401))
        .mockResolvedValueOnce(jsonResponse({ items: [] }));

      await expect(apiClient.get("/listings?limit=20")).resolves.toEqual({ items: [] });

      expect(mockedClearAuthSession).toHaveBeenCalled();
      const headers = (fetchSpy.mock.calls[1]?.[1] as RequestInit).headers as Record<string, string>;
      expect(headers.Authorization).toBeUndefined();
    });

    it("keeps the session and sends the old bearer when the refresh fails on the network", async () => {
      mockedLoadAuthSession.mockResolvedValue(expired());

      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockRejectedValueOnce(new TypeError("Network request failed"))
        .mockResolvedValueOnce(jsonResponse({ items: [] }));

      await expect(apiClient.get("/listings?limit=20")).resolves.toEqual({ items: [] });

      expect(mockedClearAuthSession).not.toHaveBeenCalled();
      expect(String(fetchSpy.mock.calls[0]?.[0])).toContain("/auth/refresh");
      const headers = (fetchSpy.mock.calls[1]?.[1] as RequestInit).headers as Record<string, string>;
      expect(headers.Authorization).toBe(`Bearer ${jwt()}`);
    });

    it("keeps the session and sends the old bearer when the refresh answers 5xx", async () => {
      mockedLoadAuthSession.mockResolvedValue(expired());

      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValueOnce(jsonResponse({ code: "INTERNAL_ERROR" }, 503))
        .mockResolvedValueOnce(jsonResponse({ items: [] }));

      await expect(apiClient.get("/listings?limit=20")).resolves.toEqual({ items: [] });

      expect(mockedClearAuthSession).not.toHaveBeenCalled();
      expect(String(fetchSpy.mock.calls[0]?.[0])).toContain("/auth/refresh");
      const headers = (fetchSpy.mock.calls[1]?.[1] as RequestInit).headers as Record<string, string>;
      expect(headers.Authorization).toBe(`Bearer ${jwt()}`);
    });

    it("keeps the session and sends the old bearer when the refresh answers a non-401 4xx", async () => {
      // Characterization: the guard already clears only on 401 (ADR-0077).
      mockedLoadAuthSession.mockResolvedValue(expired());

      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValueOnce(jsonResponse({ code: "RATE_LIMITED" }, 429))
        .mockResolvedValueOnce(jsonResponse({ items: [] }));

      await expect(apiClient.get("/listings?limit=20")).resolves.toEqual({ items: [] });

      expect(mockedClearAuthSession).not.toHaveBeenCalled();
      const headers = (fetchSpy.mock.calls[1]?.[1] as RequestInit).headers as Record<string, string>;
      expect(headers.Authorization).toBe(`Bearer ${jwt()}`);
    });

    it("keeps the session when a 2xx refresh answer is not JSON", async () => {
      mockedLoadAuthSession.mockResolvedValue(expired());

      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValueOnce(new Response("<html>bad gateway</html>", { status: 200 }))
        .mockResolvedValueOnce(jsonResponse({ items: [] }));

      await expect(apiClient.get("/listings?limit=20")).resolves.toEqual({ items: [] });

      expect(mockedClearAuthSession).not.toHaveBeenCalled();
      expect(mockedStoreAuthSession).not.toHaveBeenCalled();
      const headers = (fetchSpy.mock.calls[1]?.[1] as RequestInit).headers as Record<string, string>;
      expect(headers.Authorization).toBe(`Bearer ${jwt()}`);
    });

    it("clears the session when a 2xx JSON refresh answer fails the contract", async () => {
      mockedLoadAuthSession
        .mockResolvedValueOnce(expired())
        .mockResolvedValueOnce(expired())
        .mockResolvedValueOnce(expired())
        .mockResolvedValue(null);

      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValueOnce(jsonResponse({ unexpected: true }))
        .mockResolvedValueOnce(jsonResponse({ items: [] }));

      await expect(apiClient.get("/listings?limit=20")).resolves.toEqual({ items: [] });

      expect(mockedClearAuthSession).toHaveBeenCalled();
      const headers = (fetchSpy.mock.calls[1]?.[1] as RequestInit).headers as Record<string, string>;
      expect(headers.Authorization).toBeUndefined();
    });

    it("retries the refresh on the next request after a 5xx", async () => {
      mockedLoadAuthSession
        .mockResolvedValueOnce(expired())
        .mockResolvedValueOnce(expired())
        .mockResolvedValueOnce(expired())
        .mockResolvedValueOnce(expired())
        .mockResolvedValueOnce(expired())
        .mockResolvedValueOnce(expired())
        .mockResolvedValue({ accessToken: "fresh-token", refreshToken: "r2", user, storedAt: new Date().toISOString() });

      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValueOnce(jsonResponse({ code: "INTERNAL_ERROR" }, 500))
        .mockResolvedValueOnce(jsonResponse({ items: [] }))
        .mockResolvedValueOnce(jsonResponse({ accessToken: "fresh-token", refreshToken: "r2" }))
        .mockResolvedValueOnce(jsonResponse({ items: [] }));

      await apiClient.get("/listings?limit=20");
      await apiClient.get("/listings?limit=20");

      expect(mockedClearAuthSession).not.toHaveBeenCalled();
      expect(String(fetchSpy.mock.calls[2]?.[0])).toContain("/auth/refresh");
      expect(mockedStoreAuthSession).toHaveBeenCalledWith(
        expect.objectContaining({ accessToken: "fresh-token", refreshToken: "r2" }),
      );
      const headers = (fetchSpy.mock.calls[3]?.[1] as RequestInit).headers as Record<string, string>;
      expect(headers.Authorization).toBe("Bearer fresh-token");
    });

    it("shares one refresh between concurrent requests with an expired token", async () => {
      let refreshed = false;
      mockedLoadAuthSession.mockImplementation(async () =>
        refreshed
          ? { accessToken: "fresh-token", refreshToken: "r2", user, storedAt: new Date().toISOString() }
          : expired(),
      );
      mockedStoreAuthSession.mockImplementation(async () => {
        refreshed = true;
      });

      const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (url) =>
        String(url).includes("/auth/refresh")
          ? jsonResponse({ accessToken: "fresh-token", refreshToken: "r2" })
          : jsonResponse({ ok: true }),
      );

      await Promise.all([apiClient.get("/a"), apiClient.get("/b")]);

      const refreshCalls = fetchSpy.mock.calls.filter((call) =>
        String(call[0]).includes("/auth/refresh"),
      );
      expect(refreshCalls).toHaveLength(1);
      for (const call of fetchSpy.mock.calls.filter((c) => !String(c[0]).includes("/auth/refresh"))) {
        expect(((call[1] as RequestInit).headers as Record<string, string>).Authorization).toBe(
          "Bearer fresh-token",
        );
      }
    });
  });

  describe("401 refresh-retry", () => {
    it("refreshes token on 401 and retries the request", async () => {
      mockedLoadAuthSession.mockResolvedValue({
        accessToken: "old-token",
        refreshToken: "refresh-123",
        user: {
          id: "u1",
          phone: "+99361000000",
          email: null,
          displayName: null,
          role: "buyer" as const,
        },
        storedAt: new Date().toISOString(),
      });

      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValueOnce(jsonResponse({ code: "UNAUTHENTICATED" }, 401))
        .mockResolvedValueOnce(
          jsonResponse({ accessToken: "new-token", refreshToken: "new-refresh" }),
        )
        .mockResolvedValueOnce(jsonResponse({ data: "success" }));

      const result = await apiClient.get<{ data: string }>("/test");

      expect(fetchSpy).toHaveBeenCalledTimes(3);
      expect(String(fetchSpy.mock.calls[0]?.[0])).toContain("/test");
      expect(String(fetchSpy.mock.calls[1]?.[0])).toContain("/auth/refresh");
      expect(String(fetchSpy.mock.calls[2]?.[0])).toContain("/test");
      expect(result).toEqual({ data: "success" });
      expect(mockedStoreAuthSession).toHaveBeenCalledWith(
        expect.objectContaining({
          accessToken: "new-token",
          refreshToken: "new-refresh",
        }),
      );
    });

    it("shares one refresh when concurrent requests hit 401", async () => {
      mockedLoadAuthSession.mockResolvedValue({
        accessToken: "old-token",
        refreshToken: "refresh-123",
        user: {
          id: "u1",
          phone: "+99361000000",
          email: null,
          displayName: null,
          role: "buyer" as const,
        },
        storedAt: new Date().toISOString(),
      });

      let refreshResolve: (() => void) | undefined;
      const refreshPromise = new Promise<void>((resolve) => {
        refreshResolve = resolve as () => void;
      });

      let callCount = 0;
      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockImplementation(async (url) => {
          callCount++;
          if (String(url).includes("/auth/refresh")) {
            await refreshPromise;
            return jsonResponse({
              accessToken: "new-token",
              refreshToken: "new-refresh",
            });
          }
          // First two calls (the initial requests) return 401
          if (callCount <= 2) {
            return jsonResponse({ code: "UNAUTHENTICATED" }, 401);
          }
          // Retry calls return success
          return jsonResponse({ ok: true });
        });

      const p1 = apiClient.get("/a");
      const p2 = apiClient.get("/b");

      // Give both initial requests time to hit 401 and queue on refresh
      await new Promise((r) => setTimeout(r, 10));

      // At this point both initial requests should have fired
      expect(callCount).toBeGreaterThanOrEqual(2);

      if (refreshResolve) refreshResolve();

      const [r1, r2] = await Promise.all([p1, p2]);

      const refreshCalls = fetchSpy.mock.calls.filter((call) =>
        String(call[0]).includes("/auth/refresh"),
      );
      expect(refreshCalls).toHaveLength(1);
      expect(r1).toEqual({ ok: true });
      expect(r2).toEqual({ ok: true });
    });

    it("throws UNAUTHENTICATED when refresh itself returns 401", async () => {
      mockedLoadAuthSession.mockResolvedValue({
        accessToken: "old-token",
        refreshToken: "refresh-123",
        user: {
          id: "u1",
          phone: "+99361000000",
          email: null,
          displayName: null,
          role: "buyer" as const,
        },
        storedAt: new Date().toISOString(),
      });

      vi.spyOn(globalThis, "fetch")
        .mockResolvedValueOnce(jsonResponse({ code: "UNAUTHENTICATED" }, 401))
        .mockResolvedValueOnce(jsonResponse({ code: "UNAUTHENTICATED" }, 401));

      const error = await apiClient.get("/test").catch((e: ApiError) => e);

      expect(error).toBeInstanceOf(ApiError);
      expect(error).toMatchObject({
        code: "UNAUTHENTICATED",
        status: 401,
      });
      expect(mockedClearAuthSession).toHaveBeenCalled();
    });
  });

  describe("refresh failure on the 401 path", () => {
    const session = () => ({
      accessToken: "old-token",
      refreshToken: "refresh-123",
      user: {
        id: "u1",
        phone: "+99361000000",
        email: null,
        displayName: null,
        role: "buyer" as const,
      },
      storedAt: new Date().toISOString(),
    });

    it("keeps the session and does not report UNAUTHENTICATED when the refresh answers 5xx", async () => {
      mockedLoadAuthSession.mockResolvedValue(session());

      vi.spyOn(globalThis, "fetch")
        .mockResolvedValueOnce(jsonResponse({ code: "UNAUTHENTICATED" }, 401))
        .mockResolvedValueOnce(jsonResponse({ code: "INTERNAL_ERROR" }, 503));

      const error = await apiClient.get("/test").catch((e: ApiError) => e);

      expect(error).toBeInstanceOf(ApiError);
      expect(error).toMatchObject({ code: "REFRESH_UNAVAILABLE", status: 503 });
      expect((error as ApiError).code).not.toBe("UNAUTHENTICATED");
      expect(mockedClearAuthSession).not.toHaveBeenCalled();
    });

    it.each([400, 403, 404, 429])(
      "reports a fixed 503 and keeps the session when the refresh answers %i",
      async (refreshStatus) => {
        mockedLoadAuthSession.mockResolvedValue(session());

        vi.spyOn(globalThis, "fetch")
          .mockResolvedValueOnce(jsonResponse({ code: "UNAUTHENTICATED" }, 401))
          .mockResolvedValueOnce(jsonResponse({ code: "NOT_FOUND" }, refreshStatus));

        const error = await apiClient.get("/test").catch((e: ApiError) => e);

        expect(error).toMatchObject({ code: "REFRESH_UNAVAILABLE", status: 503 });
        expect(mockedClearAuthSession).not.toHaveBeenCalled();
      },
    );

    it("keeps the session when the refresh fails on the network", async () => {
      mockedLoadAuthSession.mockResolvedValue(session());

      vi.spyOn(globalThis, "fetch")
        .mockResolvedValueOnce(jsonResponse({ code: "UNAUTHENTICATED" }, 401))
        .mockRejectedValueOnce(new TypeError("Network request failed"));

      await expect(apiClient.get("/test")).rejects.toThrow("Network request failed");

      expect(mockedClearAuthSession).not.toHaveBeenCalled();
    });

    it("keeps the session when a 2xx refresh answer is not JSON", async () => {
      mockedLoadAuthSession.mockResolvedValue(session());

      vi.spyOn(globalThis, "fetch")
        .mockResolvedValueOnce(jsonResponse({ code: "UNAUTHENTICATED" }, 401))
        .mockResolvedValueOnce(new Response("<html>bad gateway</html>", { status: 200 }));

      const error = await apiClient.get("/test").catch((e: ApiError) => e);

      expect(error).toBeInstanceOf(ApiError);
      expect(error).toMatchObject({ code: "REFRESH_UNAVAILABLE", status: 503 });
      expect(mockedClearAuthSession).not.toHaveBeenCalled();
    });
  });

  describe("explicit access token", () => {
    it("sends the given token instead of the stored session and never touches the store", async () => {
      mockedLoadAuthSession.mockResolvedValue({
        accessToken: "stored-token",
        refreshToken: "stored-refresh",
        user: {
          id: "u1",
          phone: "+99361000000",
          email: null,
          displayName: null,
          role: "buyer" as const,
        },
        storedAt: new Date().toISOString(),
      });
      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockImplementation(() => Promise.resolve(jsonResponse({ ok: true })));

      await apiClient.post("/me/restore", undefined, undefined, {
        accessToken: "pending-token",
      });

      const init = fetchSpy.mock.calls[0]?.[1] as RequestInit;
      expect((init.headers as Record<string, string>).Authorization).toBe(
        "Bearer pending-token",
      );
      expect(mockedLoadAuthSession).not.toHaveBeenCalled();
    });

    it("does not refresh or retry a 401, because the token is not the stored session", async () => {
      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockImplementation(() =>
          Promise.resolve(
            jsonResponse({ code: "UNAUTHORIZED", message: "no" }, 401),
          ),
        );

      const error = await apiClient
        .post("/me/restore", undefined, undefined, { accessToken: "pending-token" })
        .catch((e: ApiError) => e);

      expect(error).toMatchObject({ code: "UNAUTHORIZED", status: 401 });
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(mockedStoreAuthSession).not.toHaveBeenCalled();
      expect(mockedClearAuthSession).not.toHaveBeenCalled();
    });
  });

  describe("non-401 errors", () => {
    it("passes through without retry", async () => {
      mockedLoadAuthSession.mockResolvedValue(null);

      vi.spyOn(globalThis, "fetch").mockImplementation(() =>
        Promise.resolve(
          jsonResponse({ code: "RATE_LIMITED", message: "Slow down" }, 429),
        ),
      );

      const error = await apiClient.get("/test").catch((e: ApiError) => e);

      expect(error).toBeInstanceOf(ApiError);
      expect(error).toMatchObject({
        code: "RATE_LIMITED",
        status: 429,
      });
    });

    it("throws CONTRACT_VIOLATION when schema parse fails", async () => {
      mockedLoadAuthSession.mockResolvedValue(null);

      vi.spyOn(globalThis, "fetch").mockImplementation(() =>
        Promise.resolve(jsonResponse({ unexpected: "shape" })),
      );

      const schema = {
        parse: () => {
          throw new Error("bad");
        },
        safeParse: () =>
          ({ success: false as const, error: { format: () => ({}) } }),
      };

      const error = await apiClient
        .get("/test", schema as unknown as ZodSchema<unknown>)
        .catch((e: ApiError) => e);

      expect(error).toBeInstanceOf(ApiError);
      expect(error).toMatchObject({
        code: "CONTRACT_VIOLATION",
        status: 502,
      });
    });
  });

  describe("timeout", () => {
    function mockFetchThatObservesAbort() {
      return vi.spyOn(globalThis, "fetch").mockImplementation((_url, init) => {
        return new Promise((_resolve, reject) => {
          const signal = (init as RequestInit | undefined)?.signal;
          if (signal?.aborted) {
            const err = new Error("Aborted");
            err.name = "AbortError";
            reject(err);
            return;
          }
          signal?.addEventListener("abort", () => {
            const err = new Error("Aborted");
            err.name = "AbortError";
            reject(err);
          });
        });
      });
    }

    it("throws NETWORK_ERROR when request exceeds timeout", async () => {
      mockedLoadAuthSession.mockResolvedValue(null);
      mockFetchThatObservesAbort();

      const error = await apiClient
        .get("/test", undefined, { timeout: 50 })
        .catch((e: ApiError) => e);

      expect(error).toBeInstanceOf(ApiError);
      expect(error).toMatchObject({
        code: "NETWORK_ERROR",
        status: 0,
        message: "Request timed out",
      });
    });

    it("throws NETWORK_ERROR when refresh request times out", async () => {
      mockedLoadAuthSession.mockResolvedValue({
        accessToken: "old-token",
        refreshToken: "refresh-123",
        user: {
          id: "u1",
          phone: "+99361000000",
          email: null,
          displayName: null,
          role: "buyer" as const,
        },
        storedAt: new Date().toISOString(),
      });

      mockFetchThatObservesAbort();

      const error = await apiClient
        .get("/test", undefined, { timeout: 50 })
        .catch((e: ApiError) => e);

      expect(error).toBeInstanceOf(ApiError);
      expect(error).toMatchObject({
        code: "NETWORK_ERROR",
        status: 0,
        message: "Request timed out",
      });
    });
  });
});

it("posts bounded binary bodies through the current refresh and locale transport", async () => {
 mockedLoadAuthSession.mockResolvedValue({ storedAt: new Date().toISOString(), accessToken: "binary-fixture", refreshToken: "refresh", user: { id: "fixture", phone: null, email: null, displayName: null, role: "buyer" } });
 const bytes = new Uint8Array([1, 2, 3]);
 const send = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({ ok: true }));
 await apiClient.postBinary("/services/conversations/fixture/attachments/fixture/bytes", bytes);
 const init = send.mock.calls[0]?.[1];
 expect(init?.body).toBe(bytes);
 expect(init?.headers).toMatchObject({ "Content-Type": "application/octet-stream", Authorization: "Bearer binary-fixture" });
});
