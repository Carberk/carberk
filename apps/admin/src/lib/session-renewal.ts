import { createHash } from "node:crypto";

import { getApiBaseUrl } from "./api-config";
import { forwardVisitorIp, readVisitorIpPolicy } from "./visitor-ip";

const HANDOFF_MS = 5_000;
const MAX_ENTRIES = 128;
const REFRESH_TIMEOUT_MS = 10_000;
const VISITOR_IP_POLICY = readVisitorIpPolicy();
const handoffs = new Map<string, TokenPair>();
let owner: { key: string; promise: Promise<RenewalResult> } | undefined;

type TokenPair = { accessToken: string; refreshToken: string };
export type RenewalResult =
  | { kind: "tokens"; tokens: TokenPair }
  | { kind: "rejected" }
  | { kind: "unavailable" };

/** An expiry hint only. The API still validates signatures and session state. */
export function hasCurrentAccessToken(token: string | undefined): boolean {
  if (!token) return false;
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8")) as { exp?: unknown };
    return typeof payload.exp === "number" && Number.isFinite(payload.exp) && payload.exp * 1000 > Date.now() + 5_000;
  } catch {
    return false;
  }
}

/** Only the Node proxy calls this; no render/action bundle owns a second cache. */
export async function renewSession(
  refreshToken: string,
  incomingHeaders?: { get(name: string): string | null },
): Promise<RenewalResult> {
  const key = createHash("sha256").update(refreshToken).digest("hex");
  const deadline = Date.now() + REFRESH_TIMEOUT_MS;
  for (;;) {
    const shared = handoffs.get(key);
    if (shared) return { kind: "tokens", tokens: shared };
    if (owner?.key === key) return owner.promise;
    if (owner) {
      // Serialize admission: random, unvalidated cookies cannot allocate 128
      // pending owners. Only API-proven pairs ever enter the handoff cache.
      const remaining = deadline - Date.now();
      if (remaining <= 0) return { kind: "unavailable" };
      let timer: ReturnType<typeof setTimeout> | undefined;
      await Promise.race([
        owner.promise,
        new Promise<void>((resolve) => { timer = setTimeout(resolve, remaining); }),
      ]);
      clearTimeout(timer);
      if (Date.now() >= deadline) return { kind: "unavailable" };
      continue;
    }
    // At most 128 retained handoffs plus in-flight owners combined. An active
    // owner is never evicted. Capacity is temporary, never an auth rejection.
    if (handoffs.size >= MAX_ENTRIES) return { kind: "unavailable" };
    const pending = rotate(refreshToken, incomingHeaders).then((result) => {
      if (result.kind === "tokens") {
        handoffs.set(key, result.tokens);
        setTimeout(() => { handoffs.delete(key); }, HANDOFF_MS).unref();
      }
      owner = undefined;
      return result;
    });
    owner = { key, promise: pending };
    return pending;
  }
}

async function rotate(
  refreshToken: string,
  incomingHeaders?: { get(name: string): string | null },
): Promise<RenewalResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => { controller.abort(); }, REFRESH_TIMEOUT_MS);
  try {
    const headers = new Headers({ "Content-Type": "application/json" });
    if (incomingHeaders) forwardVisitorIp(headers, incomingHeaders, VISITOR_IP_POLICY);
    const response = await fetch(`${getApiBaseUrl()}/auth/refresh`, {
      method: "POST", cache: "no-store", signal: controller.signal,
      headers,
      body: JSON.stringify({ refreshToken }),
    });
    if (response.status === 400 || response.status === 401) return { kind: "rejected" };
    if (!response.ok) return { kind: "unavailable" };
    const tokens = await response.json() as Partial<TokenPair>;
    if (typeof tokens.accessToken !== "string" || !hasCurrentAccessToken(tokens.accessToken) || typeof tokens.refreshToken !== "string" || !/^[a-f0-9]{64}$/.test(tokens.refreshToken)) return { kind: "unavailable" };
    return { kind: "tokens", tokens: { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken } };
  } catch {
    return { kind: "unavailable" };
  } finally {
    clearTimeout(timeout);
  }
}
