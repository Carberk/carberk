"use server";

import { HistoryOrderSchemas as H } from "@auto-tm/contracts";
import { unstable_rethrow } from "next/navigation";

import { rejectExpiredSession } from "@/lib/action-session";
import { ApiError, apiFetchOptional } from "@/lib/api-client";
import { getAccessToken } from "@/lib/cookies";
import type { DeskLocale } from "@/lib/history-desk-copy";
import { historyInboxScope } from "@/lib/history-inbox-scope";

export type RefundMode = "decision" | "execution";
export type RefundResult = { status: "ok"; data: H.HistoryRefundCase; scope: string }
  | { status: "invalid" | "missing" | "expired" | "denied" | "conflict" | "unavailable" };

type Target = { locale: DeskLocale; id: string; mode: RefundMode };

export async function readRefund(target: Target): Promise<RefundResult> {
  return fetchRefund(target);
}

export async function recordRefund(target: Target & Pick<H.HistoryRefundCommand, "orderId" | "amountMinor" | "attemptKey"> & { scope: string },
  _state: RefundResult, form: FormData): Promise<RefundResult> {
  const kind = target.mode === "execution" ? "execute" : "approve";
  const data = H.HistoryRefundCommandSchema.safeParse({
    kind, orderId: target.orderId, amountMinor: target.amountMinor, attemptKey: target.attemptKey, reason: form.get("reason"),
    ...(kind === "execute" ? { externalReference: form.get("externalReference"), returned: form.get("returned") === "on" } : {}),
  });
  if (!data.success) return { status: "invalid" };
  return fetchRefund(target, { input: data.data, scope: target.scope });
}

async function fetchRefund({ locale, id, mode }: Target,
  mutation?: { input: H.HistoryRefundCommand; scope: string }): Promise<RefundResult> {
  await rejectExpiredSession();
  if (!["en", "ru", "tk"].includes(locale) || !["decision", "execution"].includes(mode)
    || !H.HistoryAcceptedOrderSchema.shape.id.safeParse(id).success) return { status: "invalid" };
  try {
    const token = await getAccessToken();
    const binding = token && historyInboxScope(token);
    if (!token || !binding) return { status: "expired" };
    if (mutation && mutation.scope !== binding.scope) return { status: "denied" };
    const path = `/vehicle-history/refunds/${id}${mode === "execution" ? "/execution" : ""}`;
    const response = await apiFetchOptional<unknown>(path, {
      cache: "no-store", method: mutation ? "POST" : "GET", headers: { "Accept-Language": locale },
      ...(mutation ? { body: mutation.input } : {}),
    }, token);
    if (!response) return { status: "expired" };
    if (token !== await getAccessToken()) return { status: "denied" };
    return { status: "ok", data: H.HistoryRefundCaseSchema.parse(response), scope: binding.scope };
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof ApiError) {
      if (error.status === 400) return { status: "invalid" };
      if (error.status === 403) return { status: "denied" };
      if (error.status === 404) return { status: "missing" };
      if (error.status === 409) return { status: "conflict" };
    }
    return { status: "unavailable" };
  }
}
