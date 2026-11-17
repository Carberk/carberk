import { AuthSchemas, ErrorCode, ErrorResponseSchema } from "@auto-tm/contracts";

import type { Locale } from "@/i18n/locales";









export type DeletionChannel = "phone" | "email";

export type DeletionFailure =
  | "invalid-value"
  | "invalid-code-format"
  | "invalid-code"
  | "rate-limited"
  | "unavailable";

export type RequestDeletionResult =
  | { ok: true; destination: string; resendInSeconds: number }
  | { ok: false; error: DeletionFailure };

export type ConfirmDeletionResult = { ok: true } | { ok: false; error: DeletionFailure };

export interface DeletionApiContext {

  baseUrl: string;
  locale: Locale;





  clientIp: string | null;

  clientIpHeader?: string;
  fetch?: typeof fetch;
}

const TM_COUNTRY_CODE = "+993";


export function normalizePhoneInput(value: string): string {
  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("993")) digits = digits.slice(3);
  if (digits.startsWith("0")) digits = digits.slice(1);
  return `${TM_COUNTRY_CODE}${digits}`;
}

function destinationBody(channel: DeletionChannel, value: string) {
  return channel === "phone"
    ? { phone: normalizePhoneInput(value) }
    : { email: value };
}

export function apiUrl(baseUrl: string, path: string): string {
  const origin = baseUrl.replace(/\/+$/, "").replace(/\/api\/v1$/, "");
  return `${origin}/api/v1${path}`;
}


const API_TIMEOUT_MS = 10_000;

async function post(
  path: string,
  body: unknown,
  context: DeletionApiContext,
): Promise<Response | null> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Accept-Language": context.locale,
  };
  if (context.clientIp) headers[context.clientIpHeader ?? "x-real-ip"] = context.clientIp;

  try {
    return await (context.fetch ?? fetch)(apiUrl(context.baseUrl, path), {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
    });
  } catch (error) {

    console.error("[account-deletion] API unreachable", {
      path,
      error: error instanceof Error ? error.name : String(error),
    });
    return null;
  }
}

const ErrorCodeBody = ErrorResponseSchema.pick({ code: true });

async function failureFrom(response: Response): Promise<DeletionFailure> {

  if (response.status === 429) return "rate-limited";
  const parsed = ErrorCodeBody.safeParse(await response.json().catch(() => null));

  switch (parsed.success ? parsed.data.code : null) {
    case ErrorCode.RateLimited:
      return "rate-limited";
    case ErrorCode.InvalidOtp:
      return "invalid-code";
    case ErrorCode.ValidationFailed:
      return "invalid-value";
    default:
      console.error("[account-deletion] API error", {
        url: response.url,
        status: response.status,
        code: parsed.success ? parsed.data.code : null,
      });
      return "unavailable";
  }
}

export async function requestAccountDeletion(
  channel: DeletionChannel,
  value: string,
  context: DeletionApiContext,
): Promise<RequestDeletionResult> {
  const parsed = AuthSchemas.AccountDeletionRequestSchema.safeParse(
    destinationBody(channel, value),
  );
  if (!parsed.success) return { ok: false, error: "invalid-value" };

  const response = await post("/account-deletion/request", parsed.data, context);
  if (!response) return { ok: false, error: "unavailable" };
  if (!response.ok) return { ok: false, error: await failureFrom(response) };

  const body = AuthSchemas.AccountDeletionRequestResponseSchema.safeParse(
    await response.json().catch(() => null),
  );
  if (!body.success) {
    console.error("[account-deletion] unexpected request response", { status: response.status });
    return { ok: false, error: "unavailable" };
  }

  return {
    ok: true,
    destination: "phone" in parsed.data ? parsed.data.phone : parsed.data.email,
    resendInSeconds: body.data.resendInSeconds,
  };
}




export async function confirmAccountDeletion(
  channel: DeletionChannel,
  destination: string,
  code: string,
  context: DeletionApiContext,
): Promise<ConfirmDeletionResult> {
  const target = destinationBody(channel, destination);
  const parsed = AuthSchemas.AccountDeletionConfirmRequestSchema.safeParse({
    ...target,
    code: code.trim(),
  });
  if (!parsed.success) {

    const destinationValid =
      AuthSchemas.AccountDeletionRequestSchema.safeParse(target).success;
    return {
      ok: false,
      error: destinationValid ? "invalid-code-format" : "invalid-value",
    };
  }

  const response = await post("/account-deletion/confirm", parsed.data, context);
  if (!response) return { ok: false, error: "unavailable" };
  if (!response.ok) return { ok: false, error: await failureFrom(response) };
  return { ok: true };
}
