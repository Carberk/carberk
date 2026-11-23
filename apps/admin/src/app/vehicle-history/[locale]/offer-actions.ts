"use server";
import { HistoryOrderSchemas as H, HistoryOfferSchemas as O, VehicleHistorySchemas as V } from "@auto-tm/contracts";
import { unstable_rethrow } from "next/navigation";

import type { HistoryInboxResult } from "./actions";

import { rejectExpiredSession } from "@/lib/action-session";
import { ApiError, apiFetchOptional } from "@/lib/api-client";
import { getAccessToken } from "@/lib/cookies";
import { historyInboxScope } from "@/lib/history-inbox-scope";
import type { DeskLocale } from "@/lib/history-desk-copy";

type Failure = Exclude<HistoryInboxResult, { status: "ok" }>;
export type HistoryOfferResult = Failure | { status: "capacity"; scope: string }
  | { status: "ok"; scope: string; actorId: string; data: O.HistoryOffer; order: H.HistoryOrderState };
export async function historyOfferAction(locale: DeskLocale, value: unknown): Promise<HistoryOfferResult> {
  await rejectExpiredSession();
  const parsed = O.HistoryOfferActionSchema.safeParse(value);
  if (!parsed.success || !["en", "ru", "tk"].includes(locale)) return { status: "validation" };
  const input = parsed.data;
  if (input.mutation && input.mutation.expectedAssignmentVersion !== input.expectedAssignmentVersion) return { status: "validation" };
  const token = await getAccessToken();
  const binding = token ? historyInboxScope(token) : null;
  if (!token || !binding) return { status: "expired" };
  const { scope, actorId } = binding;
  if (scope !== input.scope) return { status: "stale", scope };
  const base = `/vehicle-history/operator/requests/${input.id}`;
  const query = `?expectedAssignmentVersion=${input.expectedAssignmentVersion}`;
  const options = { cache: "no-store", headers: { "Accept-Language": locale } } as const;
  let response: unknown, orderResponse: unknown, failure: unknown, detail: unknown;
  try {
    response = await apiFetchOptional<unknown>(`${base}/offer${input.mutation ? "" : query}`, {
      ...options, method: input.mutation ? "POST" : "GET",
      ...(input.mutation ? { body: input.mutation } : {}),
    }, token);
    if (response === null) return { status: "expired" };
    if (token !== await getAccessToken()) return { status: "stale" };
    orderResponse = await apiFetchOptional<unknown>(`${base}/order${query}`, options, token);
  } catch (error) { unstable_rethrow(error); failure = error; }
  if (token !== await getAccessToken()) return { status: "stale" };
  try { detail = await apiFetchOptional<unknown>(base, options, token); }
  catch (error) {
    unstable_rethrow(error);
    if (token !== await getAccessToken()) return { status: "stale" };
    return { status: error instanceof ApiError && error.status === 403 ? "denied" : "unavailable", scope };
  }
  if (token !== await getAccessToken()) return { status: "stale" };
  if (detail === null || orderResponse === null) return { status: "expired" };
  const selected = V.OperatorHistoryRequestSchema.safeParse(detail);
  if (!selected.success || selected.data.id !== input.id || !selected.data.mine || selected.data.assignedOperator?.id !== actorId ||
      selected.data.assignmentVersion !== input.expectedAssignmentVersion) return { status: "conflict", scope };
  if (failure instanceof ApiError) {
    if (failure.status === 409 && failure.code === "HISTORY_ORDER_CAPACITY") return { status: "capacity", scope };
    if ([400, 403, 409].includes(failure.status)) return {
      status: failure.status === 400 ? "validation" : failure.status === 403 ? "denied" : "conflict", scope,
    };
  }
  if (failure) return { status: "unavailable", scope };
  const result = O.HistoryOfferSchema.safeParse(response);
  const order = H.HistoryOrderStateSchema.safeParse(orderResponse);
  return result.success && order.success ? { status: "ok", scope, actorId, data: result.data, order: order.data } : { status: "unavailable", scope };
}
