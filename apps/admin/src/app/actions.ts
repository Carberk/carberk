"use server";

import { redirect, unstable_rethrow } from "next/navigation";
import { AuthSchemas, ErrorCode, type StaffSchemas } from "@auto-tm/contracts";

import { rejectExpiredSession } from "@/lib/action-session";
import { apiFetch, apiFetchOptional, ApiError } from "@/lib/api-client";
import {
  clearAuthCookies,
  getRefreshToken,
  setAuthCookies,
} from "@/lib/cookies";
import { validateReturnTo } from "@/lib/validators";

// ─── OTP ───

export async function requestOtp(
  _prev: unknown,
  formData: FormData,
): Promise<
  | { ok: false; error: string }
  | { ok: true; resendInSeconds: number; testCode?: string }
> {
  await rejectExpiredSession();
  const phone = formData.get("phone");
  const parsed = AuthSchemas.PhoneTm.safeParse(phone);
  if (!parsed.success) {
    return { ok: false, error: "Введите номер телефона в формате +993XXXXXXXX" };
  }

  try {
    const result = await apiFetch<AuthSchemas.OtpRequestResponse>(
      "/auth/otp/request",
      { method: "POST", body: { phone: parsed.data } as unknown },
    );
    const response: { ok: true; resendInSeconds: number; testCode?: string } = {
      ok: true,
      resendInSeconds: result.resendInSeconds,
    };
    if (result.testCode !== undefined) {
      response.testCode = result.testCode;
    }
    return response;
  } catch (err) {
    unstable_rethrow(err);
    if (err instanceof ApiError) {
      if (err.code === ErrorCode.RateLimited) {
        return { ok: false, error: "Слишком много попыток. Попробуйте позже." };
      }
      return { ok: false, error: "Временно недоступно. Попробуйте ещё раз." };
    }
    return { ok: false, error: "Не удалось отправить код. Попробуйте позже." };
  }
}

export type VerifyOtpResult =
  | { ok: false; error: string }
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
  const phone = formData.get("phone");
  const code = formData.get("code");

  const parsedPhone = AuthSchemas.PhoneTm.safeParse(phone);
  if (!parsedPhone.success) {
    return { ok: false, error: "Неверный формат номера телефона." };
  }
  if (typeof code !== "string" || !/^\d{6}$/.test(code)) {
    return { ok: false, error: "Код должен содержать 6 цифр." };
  }

  try {
    const result = await apiFetch<AuthSchemas.OtpVerifyResponse>(
      "/auth/otp/verify",
      {
        method: "POST",
        body: { phone: parsedPhone.data, code } as unknown,
      },
    );

    await setAuthCookies(result.accessToken, result.refreshToken);
    if (result.user.role !== "admin") {
      try {
        const summary = await apiFetchOptional<ReturnType<typeof StaffSchemas.StaffSummarySchema.parse>>("/staff/capabilities", { cache: "no-store" });
        if (!summary || summary.capabilities.length === 0) throw new ApiError(403,"FORBIDDEN",{},"Current staff authority required");
      } catch (error) {
        unstable_rethrow(error);
        if (!(error instanceof ApiError) || ![401,403].includes(error.status))
          return { ok: false, error: "Временно недоступно. Попробуйте ещё раз." };
        await clearAuthCookies();
        return { ok: false, error: "Доступ к панели администратора ограничен. Обратитесь к администратору." };
      }
    }

    // After OTP, check TOTP status to decide where to send the user
    const totpStatus =
      await apiFetchOptional<AuthSchemas.AdminTotpStatusResponse>(
        "/auth/staff/totp/status",
      );

    if (!totpStatus) {
      // Token expired/invalid between OTP verify and status check (rare)
      await clearAuthCookies();
      return { ok: false, error: "Сессия истекла. Войдите снова." };
    }

    if (totpStatus.enrolled && totpStatus.elevated) {
      return { ok: true, next: "reports" };
    }

    return { ok: true, next: "totp", totpEnrolled: totpStatus.enrolled };
  } catch (err) {
    unstable_rethrow(err);
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
      return { ok: false, error: "Временно недоступно. Попробуйте ещё раз." };
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

export async function getTotpStatus(): Promise<TotpStatusResult> {
  await rejectExpiredSession();
  try {
    const status =
      await apiFetchOptional<AuthSchemas.AdminTotpStatusResponse>(
        "/auth/staff/totp/status",
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

export async function enrollTotp(): Promise<TotpEnrollResult> {
  await rejectExpiredSession();
  try {
    const result = await apiFetch<AuthSchemas.AdminTotpEnrollResponse>(
      "/auth/staff/totp/enroll",
      { method: "POST" },
    );
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
          error: "Двухфакторная аутентификация уже настроена.",
        };
      }
      return { ok: false, error: "Временно недоступно. Попробуйте ещё раз." };
    }
    return {
      ok: false,
      error: "Не удалось начать настройку 2FA. Попробуйте позже.",
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
  const code = formData.get("code") as string;
  if (!code || code.length < 1) {
    return { ok: false, error: "Введите код." };
  }

  try {
    const result = await apiFetch<AuthSchemas.AdminTotpVerifyResponse>(
      "/auth/staff/totp/verify",
      { method: "POST", body: { code } as unknown },
    );
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
      return { ok: false, error: "Временно недоступно. Попробуйте ещё раз." };
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
    "/auth/staff/totp/status",
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
