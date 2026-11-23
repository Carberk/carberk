"use server";
import { HistoryOrderSchemas as H, HistoryOfferSchemas as O } from "@auto-tm/contracts";
import { unstable_rethrow } from "next/navigation";

import { rejectExpiredSession } from "@/lib/action-session";
import { ApiError, apiFetchOptional } from "@/lib/api-client";
import { getAccessToken } from "@/lib/cookies";
import type { DeskLocale } from "@/lib/history-desk-copy";
import { historyInboxScope } from "@/lib/history-inbox-scope";

const Scope = O.HistoryOfferActionSchema.omit({ mutation: true }).extend({ mutation: H.HistoryOperatorReplacementSchema.optional() });
type Result = { status: "ok"; data: H.HistoryOrderState }
  | { status: "expired" | "stale" | "denied" | "conflict" | "capacity" | "unavailable" | "validation" };

export async function historyReplacementAction(locale: DeskLocale, value: unknown): Promise<Result> {
  await rejectExpiredSession();
  const parsed = Scope.safeParse(value);
  if (!parsed.success || !["en", "ru", "tk"].includes(locale)) return { status: "validation" };
  const { id, expectedAssignmentVersion, scope, mutation } = parsed.data;
  if (mutation && (mutation.expectedAssignmentVersion !== expectedAssignmentVersion || mutation.orderId !== id)) return { status: "validation" };
  const token = await getAccessToken();
  const binding = token ? historyInboxScope(token) : null;
  if (!token || !binding) return { status: "expired" };
  if (binding.scope !== scope) return { status: "stale" };
  const base = `/vehicle-history/operator/requests/${id}`;
  const options = { cache: "no-store", headers: { "Accept-Language": locale } } as const;
  try {
    if (mutation) {
      const saved = await apiFetchOptional<unknown>(base + "/replacement-booking", { ...options, method: "POST", body: mutation }, token);
      if (token !== await getAccessToken()) return { status: "stale" };
      if (saved === null) return { status: "expired" };
    }
    const response = await apiFetchOptional<unknown>(`${base}/order?expectedAssignmentVersion=${expectedAssignmentVersion}`, options, token);
    if (token !== await getAccessToken()) return { status: "stale" };
    if (response === null) return { status: "expired" };
    const order = H.HistoryOrderStateSchema.safeParse(response);
    return order.success && order.data.order?.id === id ? { status: "ok", data: order.data } : { status: "unavailable" };
  } catch (error) {
    unstable_rethrow(error);
    if (token !== await getAccessToken()) return { status: "stale" };
    if (error instanceof ApiError) {
      if (error.code === "HISTORY_REPLACEMENT_CAPACITY") return { status: "capacity" };
      if (error.code === "HISTORY_ASSIGNMENT_CONFLICT" || error.status === 403) return { status: "denied" };
      if (error.status === 409) return { status: "conflict" };
      if (error.status === 400) return { status: "validation" };
    }
    return { status: "unavailable" };
  }
}
