import { RateLimitReason, RateLimitedDetailsSchema } from "@auto-tm/contracts";

import type { ApiError } from "../api/client";

type Translate = (key: string) => string;

/**
 * True when no more Sign-in Codes can be sent to this phone or email today
 * (ADR-0054: 5 per destination per 24 hours). Nothing the User does on the
 * code screen can help until the window clears.
 */
export function isDailyCodeLimit(error: ApiError): boolean {
  if (error.code !== "RATE_LIMITED" && error.status !== 429) return false;

  const details = RateLimitedDetailsSchema.safeParse(error.details);
  return (
    details.success &&
    details.data.reason === RateLimitReason.DestinationLimit
  );
}

export function getRequestOtpErrorCopy(
  error: ApiError,
  t: Translate,
  invalidKey: "phoneFormatError" | "emailFormatError",
): string {
  if (error.code === "VALIDATION_FAILED") return t(invalidKey);
  if (error.code === "NETWORK_ERROR" || error.status === 0) return t("offline");
  if (isDailyCodeLimit(error)) return t("dailyCodeLimit");
  if (error.code === "RATE_LIMITED" || error.status === 429) {
    return t("rateLimitedCode");
  }
  return t("requestFailed");
}
