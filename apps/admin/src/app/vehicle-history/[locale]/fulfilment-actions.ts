"use server";
import { HistoryOfferSchemas as O, HistoryOrderSchemas as H } from "@auto-tm/contracts";
import { unstable_rethrow } from "next/navigation";

import { rejectExpiredSession } from "@/lib/action-session";
import { ApiError, apiFetchOptional } from "@/lib/api-client";
import { getAccessToken } from "@/lib/cookies";
import type { DeskLocale } from "@/lib/history-desk-copy";
import { historyInboxScope } from "@/lib/history-inbox-scope";

type Result = { status: "ok"; scope: string; actorId: string; data: H.HistoryOrderState }
  | { status: "expired" | "stale" | "denied" | "conflict" | "capacity" | "unavailable" | "validation" };
const RecoveryAction = O.HistoryOfferActionSchema.omit({ mutation: true }).extend({ recovery: H.HistoryOperatorRecoverySchema });

export async function historyFulfilmentAction(locale: DeskLocale, value: unknown): Promise<Result> {
  await rejectExpiredSession();
  const parsed = H.HistoryFulfilmentActionSchema.or(RecoveryAction).safeParse(value);
  if (!parsed.success || !["en", "ru", "tk"].includes(locale)) return { status: "validation" };
  const { id, expectedAssignmentVersion, scope } = parsed.data;
  const recovery = "recovery" in parsed.data ? parsed.data.recovery : undefined;
  const mutation = "mutation" in parsed.data ? parsed.data.mutation : recovery;
  if (mutation && (mutation.orderId !== id || mutation.expectedAssignmentVersion !== expectedAssignmentVersion)) return { status: "validation" };
  const token = await getAccessToken();
  const binding = token ? historyInboxScope(token) : null;
  if (!token || !binding) return { status: "expired" };
  if (binding.scope !== scope) return { status: "stale" };

  const base = `/vehicle-history/operator/requests/${id}`;
  const options = { cache: "no-store", headers: { "Accept-Language": locale } } as const;
  try {
    if (mutation) {
      const saved = await apiFetchOptional<unknown>(base + (recovery ? "/recovery" : "/fulfilment"), { ...options, method: "POST", body: mutation }, token);
      if (token !== await getAccessToken()) return { status: "stale" };
      if (saved === null) return { status: "expired" };
    }
    const response = await apiFetchOptional<unknown>(`${base}/order?expectedAssignmentVersion=${expectedAssignmentVersion}`, options, token);
    if (token !== await getAccessToken()) return { status: "stale" };
    if (response === null) return { status: "expired" };
    const order = H.HistoryOrderStateSchema.safeParse(response);
    return order.success && order.data.order?.id === id
      ? { status: "ok", scope, actorId: binding.actorId, data: order.data } : { status: "unavailable" };
  } catch (error) {
    unstable_rethrow(error);
    if (token !== await getAccessToken()) return { status: "stale" };
    if (error instanceof ApiError) {
      if (error.code === "HISTORY_ORDER_CAPACITY") return { status: "capacity" };
      if (error.status === 403) return { status: "denied" };
      if (error.status === 409) return { status: "conflict" };
      if (error.status === 400) return { status: "validation" };
    }
    return { status: "unavailable" };
  }
}
