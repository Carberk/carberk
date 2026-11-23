"use server";
import { HistoryPaymentSchemas as P, HistoryOrderSchemas as H, HistoryPaymentProofSchemas as F, VehicleHistorySchemas as V } from "@auto-tm/contracts";
import { unstable_rethrow } from "next/navigation";

import { historyInboxAction, type HistoryInboxResult } from "./actions";

import { apiFetchOptional, ApiError } from "@/lib/api-client";
import { rejectExpiredSession } from "@/lib/action-session";
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
  const selection = { kind: "detail", id: input.id, scope: input.scope, expectedAssignmentVersion: input.expectedAssignmentVersion };
  const before = await historyInboxAction(locale, selection);
  if (before.status !== "ok") return before;
  let response: unknown, order: unknown, receipts: unknown, failure: unknown;
  try {
    const base = `/vehicle-history/operator/requests/${input.id}`;
    const query = `?expectedAssignmentVersion=${input.expectedAssignmentVersion}`;
    response = await apiFetchOptional<unknown>(`${base}/payment-verification${input.mutation ? "" : query}`, {
      method: input.mutation ? "POST" : "GET", cache: "no-store", headers: { "Accept-Language": locale }, ...(input.mutation ? { body: input.mutation } : {}),
    });
    order = await apiFetchOptional<unknown>(`${base}/order${query}`, { cache: "no-store", headers: { "Accept-Language": locale } });
    receipts = await apiFetchOptional<unknown>(`${base}/payment-proofs${query}`, { cache: "no-store", headers: { "Accept-Language": locale } });
  } catch (error) { unstable_rethrow(error); failure = error; }
  const after = await historyInboxAction(locale, selection);
  if (after.status !== "ok") return after;
  if (after.scope !== before.scope || after.actor.id !== before.actor.id) return { status: "stale", scope: after.scope };
  if (failure instanceof ApiError && failure.code === "HISTORY_PAYMENT_CLOSED") return { status: "closed" };
  if (failure instanceof ApiError && [400, 403, 409].includes(failure.status)) return { status: failure.status === 400 ? "validation" : failure.status === 403 ? "denied" : "conflict", scope: after.scope };
  if (failure) return { status: "unavailable", scope: after.scope };
  if (!response) return { status: "expired", scope: after.scope };
  const data = P.HistoryPaymentVerificationSchema.safeParse(response), state = H.HistoryOrderStateSchema.safeParse(order), files = F.PaymentProofsSchema.safeParse(receipts);
  if (!data.success || !state.success || !files.success || data.data.orderId !== input.id || state.data.order?.id !== input.id
    || data.data.checks.some((check) => check.input.orderId !== input.id) || files.data.items.some((file) => file.orderId !== input.id)) return { status: "unavailable", scope: after.scope };
  return { status: "ok", scope: after.scope, actorId: after.actor.id, data: data.data, order: state.data, receipts: files.data.items };
}
