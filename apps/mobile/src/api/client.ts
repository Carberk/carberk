import type { ZodSchema } from "zod";
import { AuthSchemas } from "@auto-tm/contracts";

import { isAccessTokenExpired } from "../auth/accessTokenExpiry";
import {
  clearAuthSession,
  loadAuthSession,
  storeAuthSession,
} from "../auth/session";
import { localeStore } from "../locale/localeStore";

const BASE_URL = (
  process.env["EXPO_PUBLIC_API_URL"] ?? "http://localhost:3006/api/v1"
).replace(/\/$/, "");

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
  headers?: Record<string, string>;
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  binaryBody?: Uint8Array;
  responseBytesLimit?: number;
  schema?: ZodSchema<TResponse>;
  // If false, do not attach Authorization header (used for OTP request/verify pre-login)
  auth?: boolean;
  // Bearer token of a session that is not stored yet, such as the pending session
  // of a User whose deletion is scheduled. It replaces the stored session for this
  // request, and a 401 is never refreshed or retried.
  accessToken?: string;
  // Per-request timeout override (defaults to 30s)
  timeout?: number;
  // Fence this request before sending or retrying, never the shared refresh.
  assertSession?: () => Promise<unknown>;
}

type ClientOptions = Pick<RequestOptions<unknown>, "auth" | "accessToken" | "timeout" | "assertSession" | "headers">;

let refreshInFlight: Promise<void> | null = null;

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  // React Native 0.83's AbortController polyfill does not reliably cancel
  // fetch requests (facebook/react-native#55247). We use Promise.race so
  // the timeout always wins even if fetch ignores the abort signal.
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(
      () => reject(new ApiError("NETWORK_ERROR", 0, "Request timed out")),
      timeoutMs,
    ),
  );

  try {
    const res = await Promise.race([
      fetch(url, { ...init, signal: controller.signal }),
      timeoutPromise,
    ]);
    return res;
  } catch (err) {
    if (err instanceof ApiError && err.code === "NETWORK_ERROR") {
      throw err;
    }
    if (err instanceof Error && err.name === "AbortError") {
      throw new ApiError("NETWORK_ERROR", 0, "Request timed out");
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

// A fixed 503 for every non-rejection refresh failure. The refresh's own status
// (a gateway 404, a throttler 429) would reach the screens' error copy and the
// query layer's no-retry-on-4xx rule as if it described the user's request.
function refreshUnavailable(message: string): ApiError {
  return new ApiError("REFRESH_UNAVAILABLE", 503, message);
}

async function refreshOnce(): Promise<void> {
  if (refreshInFlight) {
    return refreshInFlight;
  }

  refreshInFlight = (async () => {
    const session = await loadAuthSession();
    if (!session) {
      throw new ApiError("UNAUTHENTICATED", 401, "No session to refresh");
    }
    // Sign-out or new sign-in makes this response stale. Cancelling one
    // request must not prevent storing the rotated single-use refresh token.
    const stillOwnsSession = async () => {
      const current = await loadAuthSession();
      return current?.user.id === session.user.id && current.refreshToken === session.refreshToken;
    };

    const res = await fetchWithTimeout(
      `${BASE_URL}/auth/refresh`,
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ refreshToken: session.refreshToken }),
      },
      REFRESH_TIMEOUT_MS,
    );

    // Only a 401 is the API rejecting the refresh token (the one rejection the
    // contract defines). Any other answer says nothing about the token, so the
    // session stays and the next request retries (ADR-0077).
    if (res.status === 401) {
      if (!(await stillOwnsSession())) return;
      await clearAuthSession();
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
    if (!(await stillOwnsSession())) return;
    if (!parsed.success) {
      await clearAuthSession();
      throw new ApiError("CONTRACT_VIOLATION", 502, "Bad refresh response");
    }

    await storeAuthSession({
      ...parsed.data,
      user: session.user,
    });
  })();

  try {
    await refreshInFlight;
  } finally {
    refreshInFlight = null;
  }
}

async function rawRequest<TResponse>(
  path: string,
  opts: RequestOptions<TResponse>,
  isRetry: boolean,
): Promise<TResponse> {
  await opts.assertSession?.();
  const headers: Record<string, string> = {
    Accept: "application/json",
  };

  const locale = localeStore.getState().locale ?? "ru";
  Object.assign(headers, opts.headers);
  headers["Accept-Language"] = locale;

  if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  if (opts.accessToken !== undefined) {
    headers["Authorization"] = `Bearer ${opts.accessToken}`;
  } else if (opts.auth !== false) {
    let session = await loadAuthSession();
    // Public routes that personalise their response (the feed's `isFavorited`)
    // ignore an expired bearer instead of answering 401, so the 401 refresh
    // below would never run for them. Refresh an expired token up front.
    if (session && !isRetry && isAccessTokenExpired(session)) {
      try {
        await refreshOnce();
      } catch {
        // A refresh the API rejected with 401, or whose 2xx JSON answer broke
        // the contract, has cleared the session, so the request goes out
        // anonymous. Any other failure (5xx, network, timeout, unreadable
        // answer) keeps the session, so the request goes out with the old
        // bearer. Either way a protected route still reaches the 401 path
        // below.
      }
      session = await loadAuthSession();
    }
    if (session) {
      headers["Authorization"] = `Bearer ${session.accessToken}`;
    }
  }

  await opts.assertSession?.();
  const res = await fetchWithTimeout(
    `${BASE_URL}${path}`,
    {
      method: opts.method ?? "GET",
      headers,
      body: opts.binaryBody !== undefined ? opts.binaryBody as BodyInit : opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    },
    opts.timeout ?? DEFAULT_TIMEOUT_MS,
  );

  if (
    res.status === 401 &&
    opts.auth !== false &&
    opts.accessToken === undefined &&
    !isRetry
  ) {
    await opts.assertSession?.();
    await refreshOnce();
    return rawRequest(path, opts, true);
  }

  if (res.status === 204) {
    return undefined as TResponse;
  }

  if (res.ok && opts.responseBytesLimit !== undefined) {
    const declared = Number(res.headers.get("Content-Length"));
    if (declared > opts.responseBytesLimit) throw new ApiError("INVALID_ATTACHMENT", 502);
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.length > opts.responseBytesLimit) throw new ApiError("INVALID_ATTACHMENT", 502);
    return bytes as TResponse;
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
    const errorBody = json as { code?: string; message?: string; details?: unknown } | null;
    const code = errorBody?.code ?? "UNKNOWN_ERROR";
    const message =
      errorBody?.message ??
      (rawText ? `Non-JSON error (${res.status}): ${rawText.slice(0, 200)}` : `HTTP ${res.status}`);

    console.error("[apiClient] request failed", {
      url: `${BASE_URL}${path}`,
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

export const apiClient = {
  getBytes(path: string, maxBytes: number, opts: ClientOptions = {}): Promise<Uint8Array> {
    if (maxBytes <= 0 || maxBytes > 20 * 1024 * 1024) return Promise.reject(new ApiError("INVALID_ATTACHMENT", 400));
    return rawRequest(path, { method: "GET", responseBytesLimit: maxBytes, ...opts }, false);
  },
  postBinary(path: string, bytes: Uint8Array, opts: ClientOptions = {}): Promise<unknown> {
    if (bytes.byteLength > 20 * 1024 * 1024) return Promise.reject(new ApiError("INVALID_ATTACHMENT", 400));
    return rawRequest(path, { method: "POST", binaryBody: bytes, ...opts, headers: { ...opts.headers, "Content-Type": "application/octet-stream" } }, false);
  },
  get<T>(path: string, schema?: ZodSchema<T>, opts: ClientOptions = {}) {
    return rawRequest<T>(path, { method: "GET", schema, ...opts }, false);
  },
  post<T>(path: string, body: unknown, schema?: ZodSchema<T>, opts: ClientOptions = {}) {
    return rawRequest<T>(path, { method: "POST", body, schema, ...opts }, false);
  },
  patch<T>(path: string, body: unknown, schema?: ZodSchema<T>, opts: ClientOptions = {}) {
    return rawRequest<T>(path, { method: "PATCH", body, schema, ...opts }, false);
  },
  put<T>(path: string, body: unknown, schema?: ZodSchema<T>, opts: ClientOptions = {}) {
    return rawRequest<T>(path, { method: "PUT", body, schema, ...opts }, false);
  },
  delete<T>(path: string, schema?: ZodSchema<T>, opts: ClientOptions = {}) {
    return rawRequest<T>(path, { method: "DELETE", schema, ...opts }, false);
  },
};
