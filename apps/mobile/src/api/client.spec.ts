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
