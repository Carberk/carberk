"use server";

import { redirect, unstable_rethrow } from "next/navigation";
import { AuthSchemas, ErrorCode } from "@auto-tm/contracts";

import { rejectExpiredSession } from "@/lib/action-session";
import { apiFetch, apiFetchOptional, ApiError } from "@/lib/api-client";
import {
  clearAuthCookies,
  getRefreshToken,
  setAuthCookies,
} from "@/lib/cookies";
import { authCopy, historyAuth, totpPath } from "@/lib/history-auth";
import { validateReturnTo } from "@/lib/validators";

function scopedError(err: unknown, returnTo: unknown, fallback: string): string {
  const intent = historyAuth(returnTo);
  if (!intent) return fallback;
  const t = authCopy[intent.locale];
  if (err instanceof ApiError) {
    if (err.status === 401) return t.expired;
    if (err.status === 403) return t.denied;
    if (err.code === ErrorCode.RateLimited) return t.limited;
    if (err.status === 400 && (err.code === "INVALID_OTP" || err.code === "INVALID_TOTP")) return t.invalid;
  }
  return t.network;
}

// ─── OTP ───

export async function requestOtp(
  _prev: unknown,
  formData: FormData,
): Promise<
  | { ok: false; error: string }
  | { ok: true; resendInSeconds: number; requestId: string; requestedAt: string; testCode?: string }
> {
  await rejectExpiredSession();
  const returnTo = formData.get("returnTo");
  const intent = historyAuth(returnTo);
  const t = authCopy[intent?.locale ?? "ru"];
  const phone = formData.get("phone");
  const parsed = AuthSchemas.PhoneTm.safeParse(phone);
  if (!parsed.success) {
    return { ok: false, error: t.phoneError };
  }

  try {
    const requestedAt = new Date().toISOString();
    const result = await apiFetch<AuthSchemas.OtpRequestResponse>(
      "/auth/otp/request",
      { method: "POST", headers: intent ? { "Accept-Language": intent.locale } : {}, body: { phone: parsed.data } as unknown },
    );
    const response: { ok: true; resendInSeconds: number; requestId: string; requestedAt: string; testCode?: string } = {
      ok: true,
      resendInSeconds: result.resendInSeconds,
      requestId: result.requestId,
      requestedAt,
    };
    if (result.testCode !== undefined) {
      response.testCode = result.testCode;
    }
    return response;
  } catch (err) {
    unstable_rethrow(err);
    if (historyAuth(returnTo)) return { ok: false, error: scopedError(err, returnTo, t.network) };
    if (err instanceof ApiError) {
      if (err.code === ErrorCode.RateLimited) {
        return { ok: false, error: "Слишком много попыток. Попробуйте позже." };
      }
      return { ok: false, error: err.message };
    }
    return { ok: false, error: "Не удалось отправить код. Попробуйте позже." };
  }
}

export type VerifyOtpResult =
  | { ok: false; error: string; sessionCreated?: boolean; restart?: boolean }
  | {
      ok: true;
      next: "totp" | "reports";
      backupCodes?: string[];
      totpEnrolled?: boolean;
    };

export async function verifyOtp(
  _prev: unknown,
  formData: FormData,
): Promise<VerifyOtpResult> {
  await rejectExpiredSession();
  const returnTo = formData.get("returnTo");
  const t = authCopy[historyAuth(returnTo)?.locale ?? "ru"];
  const phone = formData.get("phone");
  const code = formData.get("code");

  const parsedPhone = AuthSchemas.PhoneTm.safeParse(phone);
  if (!parsedPhone.success) {
    return { ok: false, error: t.phoneError };
  }
  if (typeof code !== "string" || !/^\d{6}$/.test(code)) {
    return { ok: false, error: t.codeError };
  }

  let sessionCreated = false;
  try {
    const result = await apiFetchOptional<AuthSchemas.OtpVerifyResponse>(
      "/auth/otp/verify",
      {
        method: "POST",
        body: { phone: parsedPhone.data, code } as unknown,
      },
    );

    if (!result) return { ok: false, error: t.expired };
    if (!historyAuth(returnTo) && result.user.role !== "admin") {
      await clearAuthCookies();
      return {
        ok: false,
        error:
          "Доступ к панели администратора ограничен. Обратитесь к администратору.",
      };
    }

    await setAuthCookies(result.accessToken, result.refreshToken);
    sessionCreated = true;

    // After OTP, check TOTP status to decide where to send the user
    const totpStatus =
      await apiFetchOptional<AuthSchemas.AdminTotpStatusResponse>(
        totpPath("status", returnTo),
      );

    if (!totpStatus) {
      // Token expired/invalid between OTP verify and status check (rare)
      await clearAuthCookies();
      return { ok: false, error: t.expired };
    }

    if (totpStatus.enrolled && totpStatus.elevated) {
      return { ok: true, next: "reports" };
    }

    return { ok: true, next: "totp", totpEnrolled: totpStatus.enrolled };
  } catch (err) {
    unstable_rethrow(err);
    if (historyAuth(returnTo)) {
      const restart = err instanceof ApiError && (err.status === 401 || err.status === 403);
      return { ok: false, error: scopedError(err, returnTo, t.network), sessionCreated: sessionCreated && !restart, restart };
    }
    if (err instanceof ApiError) {
      if (err.code === ErrorCode.RateLimited) {
        return {
          ok: false,
          error: "Слишком много попыток. Подождите и попробуйте снова.",
        };
      }
      if (err.status === 400 && err.code === "INVALID_OTP") {
        return {
          ok: false,
          error: "Неверный код. Попробуйте ещё раз.",
        };
      }
      return { ok: false, error: err.message };
    }
    return { ok: false, error: "Не удалось подтвердить код. Попробуйте позже." };
  }
}

// ─── TOTP ───

export type TotpStatusResult =
  | { ok: false }
  | {
      ok: true;
      enrolled: boolean;
      elevated: boolean;
      adminTotpExpiresAt?: string;
    };

export async function getTotpStatus(returnTo?: string): Promise<TotpStatusResult> {
  await rejectExpiredSession();
  try {
    const status =
      await apiFetchOptional<AuthSchemas.AdminTotpStatusResponse>(
        totpPath("status", returnTo),
      );
    if (!status) return { ok: false };
    const result: TotpStatusResult = {
      ok: true,
      enrolled: status.enrolled,
      elevated: status.elevated,
    };
    if (status.adminTotpExpiresAt != null) {
      result.adminTotpExpiresAt = status.adminTotpExpiresAt;
    }
    return result;
  } catch {
    return { ok: false };
  }
}

export type TotpEnrollResult =
  | { ok: false; error: string; reason?: "already-enrolled" }
  | { ok: true; qrCodeDataUrl: string };

export async function enrollTotp(returnTo?: string): Promise<TotpEnrollResult> {
  const t = authCopy[historyAuth(returnTo)?.locale ?? "ru"];
  await rejectExpiredSession();
  try {
    const result = await apiFetchOptional<AuthSchemas.AdminTotpEnrollResponse>(
      totpPath("enroll", returnTo),
      { method: "POST" },
    );
    if (!result) return { ok: false, error: t.expired };
    // Generate the QR data URL server-side so the secret never reaches the client
    const { generateTotpQrCodeDataUrl } = await import("@/lib/qrcode");
    const qrCodeDataUrl = await generateTotpQrCodeDataUrl(result.qrCodeUrl);
    return { ok: true, qrCodeDataUrl };
  } catch (err) {
    unstable_rethrow(err);
    if (err instanceof ApiError) {
      if (
        err.code === ErrorCode.Conflict &&
        (err.responseBody as { details?: { reason?: string } })?.details
          ?.reason === "TOTP_ALREADY_ENROLLED"
      ) {
        return {
          ok: false,
          reason: "already-enrolled",
          error: t.enrolled,
        };
      }
      return { ok: false, error: scopedError(err, returnTo, err.message) };
    }
    return {
      ok: false,
      error: scopedError(err, returnTo, "Не удалось начать настройку 2FA. Попробуйте позже."),
    };
  }
}

export type TotpVerifyResult =
  | { ok: false; error: string }
  | { ok: true; adminTotpExpiresAt: string; backupCodes?: string[] };

export async function verifyTotp(
  _prev: unknown,
  formData: FormData,
): Promise<TotpVerifyResult> {
  await rejectExpiredSession();
  const returnTo = formData.get("returnTo");
  const t = authCopy[historyAuth(returnTo)?.locale ?? "ru"];
  const code = formData.get("code") as string;
  if (!code || code.length < 1 || (historyAuth(returnTo) && !/^(?:[0-9]{6}|[a-fA-F0-9]{16})$/.test(code))) {
    return { ok: false, error: historyAuth(returnTo) ? t.totpError : "Введите код." };
  }

  try {
    const result = await apiFetchOptional<AuthSchemas.AdminTotpVerifyResponse>(
      totpPath("verify", returnTo),
      { method: "POST", body: { code } as unknown },
    );
    if (!result) return { ok: false, error: t.expired };
    const response: TotpVerifyResult = {
      ok: true,
      adminTotpExpiresAt: result.adminTotpExpiresAt,
    };
    if (result.backupCodes != null) {
      response.backupCodes = result.backupCodes;
    }
    return response;
  } catch (err) {
    unstable_rethrow(err);
    if (historyAuth(returnTo)) return { ok: false, error: scopedError(err, returnTo, t.network) };
    if (err instanceof ApiError) {
      if (err.code === ErrorCode.RateLimited) {
        return {
          ok: false,
          error: "Слишком много попыток. Подождите и попробуйте снова.",
        };
      }
      if (err.status === 403 || (err.status === 400 && err.code === "INVALID_TOTP")) {
        return {
          ok: false,
          error: "Неверный код. Попробуйте ещё раз.",
        };
      }
      return { ok: false, error: err.message };
    }
    return {
      ok: false,
      error: "Не удалось подтвердить код. Попробуйте позже.",
    };
  }
}

// ─── Logout ───

export async function logout(): Promise<void> {
  await rejectExpiredSession();
  const refreshToken = await getRefreshToken();
  if (refreshToken) {
    try {
      await apiFetch("/auth/logout", {
        method: "POST",
        body: { refreshToken } as unknown,
      });
    } catch {
      // Ignore API failures — always clear cookies locally
    }
  }
  await clearAuthCookies();
  redirect("/login");
}

export async function logoutAll(): Promise<void> {
  await rejectExpiredSession();
  try {
    await apiFetch("/auth/logout-all", { method: "POST" });
  } catch {
    // Ignore API failures — always clear cookies locally
  }
  await clearAuthCookies();
  redirect("/login");
}

// ─── Auth gate helpers ───

export async function requireAuthWithReturnTo(
  returnTo: string | null | undefined,
): Promise<void> {
  await rejectExpiredSession();
  const status = await apiFetchOptional<AuthSchemas.AdminTotpStatusResponse>(
    "/auth/admin/totp/status",
  );

  if (!status) {
    // Cookie clearing belongs to the writable proxy on the login GET.
    const safeReturnTo = validateReturnTo(returnTo);
    const url = new URL("/login", "http://localhost");
    url.searchParams.set("reason", "session-expired");
    if (safeReturnTo) url.searchParams.set("returnTo", safeReturnTo);
    redirect(url.pathname + url.search);
  }

  if (!status.elevated) {
    const safeReturnTo = validateReturnTo(returnTo);
    const url = new URL("/login", "http://localhost");
    url.searchParams.set("mode", "totp");
    if (safeReturnTo) url.searchParams.set("returnTo", safeReturnTo);
    redirect(url.pathname + url.search);
  }
}
