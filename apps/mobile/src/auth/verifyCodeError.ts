import { ApiError } from "../api/client";

import { isDailyCodeLimit } from "./requestOtpError";

type Translate = (key: string) => string;

export interface VerifyCodeErrorCopy {
  message: string;
  // A terminal error cannot be fixed by entering or resending a code; the
  // User has to change the phone or email.
  terminal: boolean;
}

export function getVerifyCodeErrorCopy(
  error: unknown,
  t: Translate,
  method: "phone" | "email",
): VerifyCodeErrorCopy {
  if (!(error instanceof ApiError)) {
    return { message: t("offline"), terminal: false };
  }

  switch (error.code) {
    case "SIGN_IN_METHOD_TAKEN":
      return {
        message: t(method === "email" ? "emailTaken" : "phoneTaken"),
        terminal: true,
      };
    case "INVALID_OTP":
      return { message: t("wrongCode"), terminal: false };
    case "OTP_ALREADY_USED":
      return { message: t("usedCode"), terminal: false };
    case "OTP_EXPIRED":
    case "OTP_NOT_FOUND":
      return { message: t("expiredCode"), terminal: false };
    case "OTP_LOCKED":
      return { message: t("lockedCode"), terminal: false };
  }

  if (error.code === "RATE_LIMITED" || error.status === 429) {
    return { message: t("rateLimitedCode"), terminal: false };
  }
  if (error.code === "NETWORK_ERROR" || error.status === 0) {
    return { message: t("offline"), terminal: false };
  }
  return { message: error.message || t("verifyFailed"), terminal: false };
}

export interface ResendCodeErrorCopy {
  message: string;
  // No more codes can be sent to this destination today, so the code screen
  // stops offering Resend and code entry and points to Help instead.
  dailyLimit: boolean;
}

export function getResendCodeErrorCopy(
  error: unknown,
  t: Translate,
): ResendCodeErrorCopy {
  if (!(error instanceof ApiError)) {
    return { message: t("offline"), dailyLimit: false };
  }
  if (error.code === "NETWORK_ERROR" || error.status === 0) {
    return { message: t("offline"), dailyLimit: false };
  }
  if (isDailyCodeLimit(error)) {
    return { message: t("dailyCodeLimit"), dailyLimit: true };
  }
  if (error.code === "RATE_LIMITED" || error.status === 429) {
    return { message: t("rateLimitedCode"), dailyLimit: false };
  }
  return { message: t("verifyFailed"), dailyLimit: false };
}

/**
 * The confirmed value belongs to another User. Adding or changing a Sign-in
 * Method shows this as a state of its own; sign-in keeps the inline copy above.
 */
export function isSignInMethodTaken(error: unknown): boolean {
  return error instanceof ApiError && error.code === "SIGN_IN_METHOD_TAKEN";
}
