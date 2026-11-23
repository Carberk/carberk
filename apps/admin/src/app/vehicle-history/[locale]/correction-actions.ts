"use server";
import { HistoryOrderSchemas as H, VehicleHistorySchemas as V } from "@auto-tm/contracts";
import { unstable_rethrow } from "next/navigation";

import type { HistoryInboxResult } from "./actions";

import { rejectExpiredSession } from "@/lib/action-session";
import { apiFetchOptional, ApiError } from "@/lib/api-client";
import { getAccessToken } from "@/lib/cookies";
import { historyInboxScope } from "@/lib/history-inbox-scope";
import type { DeskLocale } from "@/lib/history-desk-copy";

type Failure = Exclude<HistoryInboxResult, { status: "ok" }>;
export type CorrectionResult = Failure | { status: "capacity" | "closed" }
  | { status: "ok"; scope: string; actorId: string; data: H.HistoryCorrectionState; order: H.HistoryOrderState };
export async function historyCorrectionAction(locale: DeskLocale, value: unknown): Promise<CorrectionResult> {
  await rejectExpiredSession();
  const parsed = H.HistoryCorrectionActionSchema.safeParse(value);
  if (!parsed.success || !["en", "ru", "tk"].includes(locale)) return { status: "validation" };
  const input = parsed.data;
  if (input.mutation && input.mutation.expectedAssignmentVersion !== input.expectedAssignmentVersion) return { status: "validation" };
  const token = await getAccessToken();
  const binding = token ? historyInboxScope(token) : null;
  if (!token || !binding) return { status: "expired" };
  const { actorId } = binding;
  if (binding.scope !== input.scope) return { status: "stale" };
  const options = { cache: "no-store", headers: { "Accept-Language": locale } } as const;
  const base = `/vehicle-history/operator/requests/${input.id}`;
  async function selected() {
    const detail = await apiFetchOptional<unknown>(base, options, token);
    if (token !== await getAccessToken()) return "stale" as const;
    if (detail === null) return "expired" as const;
    const selection = V.OperatorHistoryRequestSchema.safeParse(detail);
    return selection.success && selection.data.id === input.id && selection.data.mine
      && selection.data.assignedOperator?.id === actorId && selection.data.assignmentVersion === input.expectedAssignmentVersion ? null : "conflict" as const;
  }
  try {
    const before = await selected();
    if (before) return { status: before };
    const query = `?expectedAssignmentVersion=${input.expectedAssignmentVersion}`;
    const response = await apiFetchOptional<unknown>(base + "/correction" + (input.mutation ? "" : query), {
      ...options, method: input.mutation ? "POST" : "GET", ...(input.mutation ? { body: input.mutation } : {}),
    }, token);
    if (token !== await getAccessToken()) return { status: "stale" };
    const orderResponse = await apiFetchOptional<unknown>(base + "/order" + query, options, token);
    const after = await selected();
    if (after) return { status: after };
    if (response === null || orderResponse === null) return { status: "expired" };
    const data = H.HistoryCorrectionStateSchema.safeParse(response), order = H.HistoryOrderStateSchema.safeParse(orderResponse);
    return data.success && order.success && order.data.order?.id === input.id
      ? { status: "ok", scope: binding.scope, actorId: binding.actorId, data: data.data, order: order.data } : { status: "unavailable" };
  } catch (error) {
    unstable_rethrow(error);
    if (token !== await getAccessToken()) return { status: "stale" };
    if (error instanceof ApiError) {
      if (error.code === "HISTORY_ORDER_CAPACITY") return { status: "capacity" };
      if (error.code === "HISTORY_CORRECTION_CLOSED") return { status: "closed" };
      if ([400, 403, 409].includes(error.status)) return { status: error.status === 400 ? "validation" : error.status === 403 ? "denied" : "conflict" };
    }
    return { status: "unavailable" };
  }
}
