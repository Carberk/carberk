import { RateLimitReason, RateLimitedDetailsSchema } from "@auto-tm/contracts";

import { ApiError } from "../api/client";
import { isUncertainWrite } from "../api/uncertainWrite";

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

export function getRequestOtpErrorKey(
  error: unknown,
  invalidKey: "phoneFormatError" | "emailFormatError",
) {
  if (!(error instanceof ApiError) || isUncertainWrite(error)) return "codeRequestUncertain";
  if (error.code === "VALIDATION_FAILED") return invalidKey;
  if (isDailyCodeLimit(error)) return "dailyCodeLimit";
  if (error.code === "RATE_LIMITED" || error.status === 429) return "rateLimitedCode";
  return "requestFailed";
}

export function getRequestOtpErrorCopy(
  error: unknown,
  t: Translate,
  invalidKey: "phoneFormatError" | "emailFormatError",
): string {
  return t(getRequestOtpErrorKey(error, invalidKey));
}
