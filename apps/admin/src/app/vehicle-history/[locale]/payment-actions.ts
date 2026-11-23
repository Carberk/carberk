"use server";
import { HistoryPaymentSchemas as P, HistoryOrderSchemas as H, HistoryPaymentProofSchemas as F, VehicleHistorySchemas as V } from "@auto-tm/contracts";
import { unstable_rethrow } from "next/navigation";

import type { HistoryInboxResult } from "./actions";

import { apiFetchOptional, ApiError } from "@/lib/api-client";
import { rejectExpiredSession } from "@/lib/action-session";
import { getAccessToken } from "@/lib/cookies";
import { historyInboxScope } from "@/lib/history-inbox-scope";
import type { DeskLocale } from "@/lib/history-desk-copy";

const Input = V.HistoryAssigneesActionSchema.extend({ mutation: P.HistoryPaymentCheckInputSchema.optional() }).strict();
export type PaymentResult = Exclude<HistoryInboxResult, { status: "ok" }> | { status: "closed" }
  | { status: "ok"; scope: string; actorId: string; data: P.HistoryPaymentVerification; order: H.HistoryOrderState; receipts: F.PaymentProof[] };

export async function historyPaymentAction(locale: DeskLocale, value: unknown): Promise<PaymentResult> {
  await rejectExpiredSession();
  const parsed = Input.safeParse(value);
  if (!parsed.success || !["en", "tk", "ru"].includes(locale)) return { status: "validation" };
  const input = parsed.data;
  if (input.mutation && (input.mutation.expectedAssignmentVersion !== input.expectedAssignmentVersion || input.mutation.orderId !== input.id)) return { status: "validation" };
  const token = await getAccessToken();
  const binding = token ? historyInboxScope(token) : null;
  if (!token || !binding) return { status: "expired" };
  const { scope, actorId } = binding;
  if (input.scope !== scope) return { status: "stale", scope };
  const options = { cache: "no-store", headers: { "Accept-Language": locale } } as const;
  try {
    const base = "/vehicle-history/operator/requests/" + input.id;
    const query = "?expectedAssignmentVersion=" + input.expectedAssignmentVersion;
    const response = await apiFetchOptional<unknown>(base + "/payment-verification" + (input.mutation ? "" : query), {
      ...options, method: input.mutation ? "POST" : "GET", ...(input.mutation ? { body: input.mutation } : {}),
    }, token);
    if (token !== await getAccessToken()) return { status: "stale" };
    if (response === null) return { status: "expired" };
    const order = await apiFetchOptional<unknown>(base + "/order" + query, options, token);
    const receipts = await apiFetchOptional<unknown>(base + "/payment-proofs" + query, options, token);
    const detail = await apiFetchOptional<unknown>(base, options, token);
    if (token !== await getAccessToken()) return { status: "stale" };
    if (order === null || receipts === null || detail === null) return { status: "expired" };
    const selected = V.OperatorHistoryRequestSchema.safeParse(detail);
    if (!selected.success || selected.data.id !== input.id || !selected.data.mine || selected.data.assignedOperator?.id !== actorId
      || selected.data.assignmentVersion !== input.expectedAssignmentVersion) return { status: "conflict", scope };
    const data = P.HistoryPaymentVerificationSchema.safeParse(response), state = H.HistoryOrderStateSchema.safeParse(order), files = F.PaymentProofsSchema.safeParse(receipts);
    if (!data.success || !state.success || !files.success || data.data.orderId !== input.id || state.data.order?.id !== input.id
      || data.data.checks.some((check) => check.input.orderId !== input.id) || files.data.items.some((file) => file.orderId !== input.id)) return { status: "unavailable", scope };
    return { status: "ok", scope, actorId, data: data.data, order: state.data, receipts: files.data.items };
  } catch (error) {
    unstable_rethrow(error);
    if (token !== await getAccessToken()) return { status: "stale" };
    if (error instanceof ApiError) {
      if (error.code === "HISTORY_PAYMENT_CLOSED") return { status: "closed" };
      if ([400, 403, 409].includes(error.status)) return { status: error.status === 400 ? "validation" : error.status === 403 ? "denied" : "conflict", scope };
    }
    return { status: "unavailable", scope };
  }
}
