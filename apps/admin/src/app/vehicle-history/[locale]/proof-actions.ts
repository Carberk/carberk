"use server";
import { HistoryPaymentProofSchemas as P, VehicleHistorySchemas as V } from "@auto-tm/contracts";
import { unstable_rethrow } from "next/navigation";

import { historyInboxAction, type HistoryInboxResult } from "./actions";

import { apiFetchOptional, ApiError } from "@/lib/api-client";
import { getAccessToken } from "@/lib/cookies";
import { rejectExpiredSession } from "@/lib/action-session";
import type { DeskLocale } from "@/lib/history-desk-copy";

type Failure = Exclude<HistoryInboxResult, { status: "ok" }>;
export type ProofResult = Failure | { status: "ok"; scope: string; actorId: string; items: P.PaymentProof[]; content: { file: P.PaymentProof; dataBase64: string } | null };
const Input = V.HistoryAssigneesActionSchema.extend({ fileId: P.PaymentProofSchema.shape.id.optional() }).strict();
export async function historyProofAction(locale: DeskLocale, value: unknown): Promise<ProofResult> {
  await rejectExpiredSession();
  const parsed = Input.safeParse(value);
  if (!parsed.success || !["tk", "ru", "en"].includes(locale)) return { status: "validation" };
  const input = parsed.data;
  const selection = { kind: "detail", id: input.id, scope: input.scope, expectedAssignmentVersion: input.expectedAssignmentVersion };
  const before = await historyInboxAction(locale, selection);
  if (before.status !== "ok") return before;
  let response: unknown, failure: unknown;
  try {
    response = await apiFetchOptional<unknown>(`/vehicle-history/operator/requests/${input.id}/payment-proofs${input.fileId ? `/${input.fileId}/content` : ""}?expectedAssignmentVersion=${input.expectedAssignmentVersion}`, {
      cache: "no-store", headers: { "Accept-Language": locale },
    });
  } catch (error) { unstable_rethrow(error); failure = error; }
  const after = await historyInboxAction(locale, selection);
  if (after.status !== "ok") return after;
  if (before.scope !== after.scope || before.actor.id !== after.actor.id) return { status: "stale", scope: after.scope };
  if (failure instanceof ApiError && [400, 403, 409].includes(failure.status)) return { status: failure.status === 400 ? "validation" : failure.status === 403 ? "denied" : "conflict", scope: after.scope };
  if (failure) return { status: "unavailable", scope: after.scope };
  if (!response) return { status: "expired", scope: after.scope };
  const list = P.PaymentProofsSchema.safeParse(response), content = P.ReadPaymentProofSchema.safeParse(response);
  if (input.fileId ? !content.success || content.data.file.id !== input.fileId || content.data.file.orderId !== input.id : !list.success) return { status: "unavailable", scope: after.scope };
  if (list.success && list.data.items.some((file) => file.orderId !== input.id)) return { status: "unavailable", scope: after.scope };
  return { status: "ok", scope: after.scope, actorId: after.actor.id, items: list.success ? list.data.items : [], content: content.success ? content.data : null };
}
export type HistoricalProofResult = { status: "ok"; content: { file: P.PaymentProof; dataBase64: string } } | { status: "validation" | "expired" | "denied" | "unavailable" };
export async function historicalProofAction(locale: DeskLocale, value: unknown): Promise<HistoricalProofResult> {
  await rejectExpiredSession();
  const parsed = P.HistoricalPaymentEvidenceSchema.safeParse(value);
  if (!parsed.success || !["tk", "ru", "en"].includes(locale)) return { status: "validation" };
  const token = await getAccessToken();
  if (!token) return { status: "expired" };
  try {
    const response = await apiFetchOptional<unknown>("/vehicle-history/payment-evidence/read", { method: "POST", cache: "no-store", headers: { "Accept-Language": locale }, body: parsed.data });
    if (!response || token !== await getAccessToken()) return { status: "expired" };
    const content = P.ReadPaymentProofSchema.safeParse(response);
    return content.success && content.data.file.id === parsed.data.fileId && content.data.file.orderId === parsed.data.requestId
      ? { status: "ok", content: content.data } : { status: "unavailable" };
  } catch (error) {
    unstable_rethrow(error);
    return { status: error instanceof ApiError && error.status === 403 ? "denied" : "unavailable" };
  }
}
