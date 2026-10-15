import { redirect } from "next/navigation";

import { getAccessToken } from "./cookies";
import { getApiBaseUrl } from "./api-config";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    public readonly responseBody: unknown,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function doFetch(
  path: string,
  options: Omit<RequestInit, "body"> & { body?: unknown } = {},
): Promise<Response> {
  const url = `${getApiBaseUrl()}${path}`;
  const headers = new Headers(options.headers);
  if (!headers.has("Content-Type") && options.body != null) {
    headers.set("Content-Type", "application/json");
  }

  const body =
    options.body != null && typeof options.body !== "string"
      ? JSON.stringify(options.body)
      : (options.body as BodyInit | null | undefined);

  const { body: _ignoredBody, ...rest } = options;
  void _ignoredBody;
  const fetchInit: RequestInit = { cache: "no-store", ...rest, headers };
  if (body != null) {
    fetchInit.body = body;
  }

  return fetch(url, fetchInit);
}

/**
 * Server-side API fetch wrapper.
 * Forwards Authorization: Bearer header from the access cookie.
 * Renewal happens in the writable Node proxy before rendering or actions.
 * An API-rejected session returns to login, where the proxy clears cookies.
 * Never leaks token material in rendered props or error messages.
 */
export async function apiFetch<T>(
  path: string,
  options: Omit<RequestInit, "body"> & { body?: unknown } = {},
): Promise<T> {
  const accessToken = await getAccessToken();

  const headers = new Headers(options.headers);
  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  const response = await doFetch(path, { ...options, headers });

  if (response.status === 401) redirect("/login?reason=session-expired");

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      code?: string;
      message?: string;
    };
    throw new ApiError(
      response.status,
      body.code ?? "UNKNOWN",
      body,
      body.message ?? `HTTP ${response.status}`,
    );
  }

  return response.json() as Promise<T>;
}

/**
 * Server-side API fetch wrapper for GET requests that returns null on 401
 * instead of redirecting. Useful for optional auth checks in layouts.
 */
export async function apiFetchOptional<T>(
  path: string,
  options: Omit<RequestInit, "body"> & { body?: unknown } = {},
): Promise<T | null> {
  const accessToken = await getAccessToken();

  const headers = new Headers(options.headers);
  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  const response = await doFetch(path, { ...options, headers });

  if (response.status === 401) return null;
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { code?: string; message?: string };
    throw new ApiError(response.status, body.code ?? "UNKNOWN", body, body.message ?? `HTTP ${response.status}`);
  }

  return response.json() as Promise<T>;
}
