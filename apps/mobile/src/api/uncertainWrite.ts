import { ApiError } from "./client";

/** A missing/unreadable answer is not evidence that a mutation rolled back. */
export function isUncertainWrite(error: unknown): boolean {
  // These client failures precede the business send (or follow its rejected
  // 401). Keep their existing key/refresh recovery policy retryable.
  if (error instanceof ApiError && ["ROUTE_UNAVAILABLE", "REFRESH_UNAVAILABLE"].includes(error.code)) return false;
  return !(error instanceof ApiError) || error.status === 0 || error.status >= 500;
}
