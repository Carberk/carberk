import type { ZodSchema } from "zod";
import { AuthSchemas } from "@auto-tm/contracts";

import { isAccessTokenExpired } from "../auth/accessTokenExpiry";
import {
  commitRefreshedAuthSession,
  loadAuthSession,
  type StoredAuthSession,
} from "../auth/session";
import { peekAuthSession } from "../auth/sessionSnapshot";
import { localeStore } from "../locale/localeStore";

import { apiRouteHeaders, captureRouteSnapshot, type RouteSnapshot } from "./routes";

export class ApiError extends Error {
  constructor(
    public code: string,
    public status: number,
    message?: string,
    public details?: unknown,
  ) {
    super(message ?? code);
    this.name = "ApiError";
  }
}

const DEFAULT_TIMEOUT_MS = 30_000;
const REFRESH_TIMEOUT_MS = 15_000;

interface RequestOptions<TResponse> {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  schema?: ZodSchema<TResponse>;
  // If false, do not attach Authorization header (used for OTP request/verify pre-login)
  auth?: boolean;
  // Bearer token of a session that is not stored yet, such as the pending session
  // of a User whose deletion is scheduled. It replaces the stored session for this
  // request, and a 401 is never refreshed or retried.
  accessToken?: string;
  // Per-request timeout override (defaults to 30s)
  timeout?: number;
  signal?: AbortSignal;
  // Additional headers for idempotency or other endpoint-specific contracts.
  headers?: Record<string, string>;
  // Fence this request before sending or retrying, never the shared refresh.
  assertSession?: () => Promise<unknown>;
}

type ClientOptions = Pick<RequestOptions<unknown>, "auth" | "accessToken" | "timeout" | "assertSession" | "headers" | "signal">;

let refreshInFlight: { session: StoredAuthSession; promise: Promise<void> } | null = null;

// Session-ID is stable across rotation; the API alone establishes authority.
function sameSession(a: StoredAuthSession | null, b: StoredAuthSession | null): boolean {
  const sid = (session: StoredAuthSession) => {
    try {
      const payload = session.accessToken.split(".")[1] ?? "";
      const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
      return (JSON.parse(atob(base64 + "=".repeat((4 - base64.length % 4) % 4))) as { sid?: string }).sid;
    } catch { return undefined; }
  };
  return a === null ? b === null : b !== null && a.user?.id === b.user?.id && sid(a) === sid(b);
}
function assertOwner(expected: StoredAuthSession | null, current: StoredAuthSession | null) {
  if (!sameSession(expected, current)) throw new ApiError("SESSION_CHANGED", 401);
}
function assertActive(signal?: AbortSignal) {
  if (signal?.aborted) throw new ApiError("NETWORK_ERROR", 0, "Request canceled");
}

async function withDeadline<T>(run: (signal: AbortSignal) => Promise<T>, timeoutMs: number, external?: AbortSignal): Promise<T> {
  assertActive(external);
  const controller = new AbortController();
  let reject!: (error: ApiError) => void;
  const canceled = new Promise<never>((_, fail) => { reject = fail; });
  const abort = (message: string) => {
    reject(new ApiError("NETWORK_ERROR", 0, message));
    controller.abort();
  };
  const onAbort = () => abort("Request canceled");
  external?.addEventListener("abort", onAbort, { once: true });
  const timer = setTimeout(() => abort("Request timed out"), timeoutMs);
  try {
    // The race also bounds native fetch implementations which ignore abort.
    return await Promise.race([run(controller.signal), canceled]);
  } finally {
    clearTimeout(timer);
    external?.removeEventListener("abort", onAbort);
  }
}

// A fixed 503 for every non-rejection refresh failure. The refresh's own status
// (a gateway 404, a throttler 429) would reach the screens' error copy and the
// query layer's no-retry-on-4xx rule as if it described the user's request.
function refreshUnavailable(message: string): ApiError {
  return new ApiError("REFRESH_UNAVAILABLE", 503, message);
}

async function refreshOnce(route: RouteSnapshot, routeHeaders: Record<string, string>, owner: StoredAuthSession): Promise<void> {
  if (refreshInFlight && sameSession(owner, refreshInFlight.session)) return refreshInFlight.promise;
  const promise = withDeadline(async signal => {
    const session = await loadAuthSession();
    if (!session) {
      throw new ApiError("UNAUTHENTICATED", 401, "No session to refresh");
    }
    assertOwner(owner, session);
    // Another caller already rotated the bearer that this request sent.
    if (session.refreshToken !== owner.refreshToken) return;
    const res = await fetch(
      `${route.apiBaseUrl}/auth/refresh`,
      {
        method: "POST",
        signal,
        redirect: "error",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          ...routeHeaders,
        },
        body: JSON.stringify({ refreshToken: session.refreshToken }),
      },
    );

    // Only a 401 is the API rejecting the refresh token (the one rejection the
    // contract defines). Any other answer says nothing about the token, so the
    // session stays and the next request retries (ADR-0077).
    if (res.status === 401) {
      if (!(await commitRefreshedAuthSession(session, null))) return;
      throw new ApiError("UNAUTHENTICATED", 401, "Refresh failed");
    }
    if (!res.ok) {
      throw refreshUnavailable("Refresh is temporarily unavailable");
    }

    let json: unknown;
    try {
      json = (await res.json()) as unknown;
    } catch {
      throw refreshUnavailable("Refresh answer was not readable");
    }
    const parsed = AuthSchemas.RefreshResponseSchema.safeParse(json);
    if (!parsed.success) {
      if (!(await commitRefreshedAuthSession(session, null))) return;
      throw new ApiError("CONTRACT_VIOLATION", 502, "Bad refresh response");
    }

    await commitRefreshedAuthSession(session, parsed.data);
  }, REFRESH_TIMEOUT_MS);
  const flight = { session: owner, promise };
  refreshInFlight = flight;
  try { await promise; }
  finally { if (refreshInFlight === flight) refreshInFlight = null; }
}

export async function accessTokenForRoute(route: RouteSnapshot): Promise<string | null> {
  const session = await loadAuthSession();
  if (!session) return null;
  if (isAccessTokenExpired(session)) {
    const headers = await apiRouteHeaders(route).catch(() => { throw new ApiError("ROUTE_UNAVAILABLE", 503); });
    await refreshOnce(route, headers, session);
  }
  const current = await loadAuthSession();
  assertOwner(session, current);
  if (!current) return null;
  if (isAccessTokenExpired(current)) throw refreshUnavailable("Refresh is temporarily unavailable");
  return current.accessToken;
}

async function rawRequest<TResponse>(
  path: string,
  opts: RequestOptions<TResponse>,
  isRetry: boolean,
  route: RouteSnapshot = captureRouteSnapshot(),
  routeHeaders?: Record<string, string>,
  owner?: StoredAuthSession | null,
): Promise<TResponse> {
  assertActive(opts.signal);
  routeHeaders ??= await apiRouteHeaders(route).catch(() => { throw new ApiError("ROUTE_UNAVAILABLE", 503); });
  assertActive(opts.signal);
  await opts.assertSession?.();
  assertActive(opts.signal);
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...Object.fromEntries(Object.entries(opts.headers ?? {}).filter(([key]) => key.toLowerCase() !== "x-carberk-gateway-key")),
    ...routeHeaders,
  };


  const locale = localeStore.getState().locale ?? "ru";
  headers["Accept-Language"] = locale;

  if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  if (opts.accessToken !== undefined) {
    headers["Authorization"] = `Bearer ${opts.accessToken}`;
  } else if (opts.auth !== false) {
    let session = await loadAuthSession();
    assertActive(opts.signal);
    if (owner !== undefined) assertOwner(owner, session);
    owner ??= session;
    // Public routes that personalise their response (the feed's `isFavorited`)
    // ignore an expired bearer instead of answering 401, so the 401 refresh
    // below would never run for them. Refresh an expired token up front.
    if (session && !isRetry && isAccessTokenExpired(session)) {
      try {
        await refreshOnce(route, routeHeaders, session);
      } catch (error) {
        if (error instanceof ApiError && ["UNAUTHENTICATED", "CONTRACT_VIOLATION"].includes(error.code)) owner = null;
        // A refresh the API rejected with 401, or whose 2xx JSON answer broke
        // the contract, has cleared the session, so the request goes out
        // anonymous. Any other failure (5xx, network, timeout, unreadable
        // answer) keeps the session, so the request goes out with the old
        // bearer. Either way a protected route still reaches the 401 path
        // below.
      }
      session = await loadAuthSession();
      await opts.assertSession?.();
      assertOwner(owner, session);
    }
    owner = session;
    if (session) {
      headers["Authorization"] = `Bearer ${session.accessToken}`;
    }
  }

  await opts.assertSession?.();
  assertActive(opts.signal);
  if (owner !== undefined) assertOwner(owner, await loadAuthSession());
  assertActive(opts.signal);
  const res = await fetch(
    `${route.apiBaseUrl}${path}`,
    {
      signal: opts.signal,
      redirect: "error",
      method: opts.method ?? "GET",
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    },
  );
  assertActive(opts.signal);

  if (
    res.status === 401 &&
    opts.auth !== false &&
    opts.accessToken === undefined &&
    !isRetry
  ) {
    await opts.assertSession?.();
    assertActive(opts.signal);
    if (!owner) throw new ApiError("UNAUTHENTICATED", 401);
    await refreshOnce(route, routeHeaders, owner);
    assertActive(opts.signal);
    return rawRequest(path, opts, true, route, routeHeaders, owner);
  }

  if (res.status === 204) {
    return undefined as TResponse;
  }

  let json: unknown;
  let rawText: string | undefined;

  try {
    json = (await res.json()) as unknown;
  } catch {
    rawText = await res.text().catch(() => undefined);
    json = null;
  }

  if (!res.ok) {
    const errorBody = json as { code?: string; message?: string; details?: unknown; error?: string } | null;
    if (route.entry === "tm" && errorBody?.error === "gateway_access_denied") throw new ApiError("ROUTE_UNAVAILABLE", 503);
    const code = errorBody?.code ?? "UNKNOWN_ERROR";
    const message =
      errorBody?.message ??
      (rawText ? `Non-JSON error (${res.status}): ${rawText.slice(0, 200)}` : `HTTP ${res.status}`);

    console.error("[apiClient] request failed", {
      url: `${route.apiBaseUrl}${path}`,
      status: res.status,
      code,
      rawText: rawText?.slice(0, 500),
    });

    throw new ApiError(code, res.status, message, errorBody?.details);
  }

  if (opts.schema) {
    const parsed = opts.schema.safeParse(json);
    if (!parsed.success) {
      throw new ApiError(
        "CONTRACT_VIOLATION",
        502,
        "Response did not match expected schema",
        parsed.error.format(),
      );
    }
    return parsed.data;
  }

  return json as TResponse;
}

function request<T>(path: string, opts: RequestOptions<T>): Promise<T> {
  const route = captureRouteSnapshot();
  const owner = opts.auth !== false && opts.accessToken === undefined ? peekAuthSession() : undefined;
  return withDeadline(signal => rawRequest(path, { ...opts, signal }, false, route, undefined, owner), opts.timeout ?? DEFAULT_TIMEOUT_MS, opts.signal);
}

export const apiClient = {
  get<T>(path: string, schema?: ZodSchema<T>, opts: ClientOptions = {}) {
    return request<T>(path, { method: "GET", schema, ...opts });
  },
  post<T>(path: string, body: unknown, schema?: ZodSchema<T>, opts: ClientOptions = {}) {
    return request<T>(path, { method: "POST", body, schema, ...opts });
  },
  patch<T>(path: string, body: unknown, schema?: ZodSchema<T>, opts: ClientOptions = {}) {
    return request<T>(path, { method: "PATCH", body, schema, ...opts });
  },
  put<T>(path: string, body: unknown, schema?: ZodSchema<T>, opts: ClientOptions = {}) {
    return request<T>(path, { method: "PUT", body, schema, ...opts });
  },
  delete<T>(path: string, schema?: ZodSchema<T>, opts: ClientOptions = {}) {
    return request<T>(path, { method: "DELETE", schema, ...opts });
  },
};
