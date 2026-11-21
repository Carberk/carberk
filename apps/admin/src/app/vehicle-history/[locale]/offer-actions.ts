"use server";
import { HistoryOrderSchemas as H, HistoryOfferSchemas as O } from "@auto-tm/contracts";
import { unstable_rethrow } from "next/navigation";

import { historyInboxAction, type HistoryInboxResult } from "./actions";

import { rejectExpiredSession } from "@/lib/action-session";
import { ApiError, apiFetchOptional } from "@/lib/api-client";
import type { DeskLocale } from "@/lib/history-desk-copy";

type Failure = Exclude<HistoryInboxResult, { status: "ok" }>;
export type HistoryOfferResult = Failure | { status: "ok"; scope: string; actorId: string; data: O.HistoryOffer; order: H.HistoryOrderState };
export async function historyOfferAction(locale: DeskLocale, value: unknown): Promise<HistoryOfferResult> {
  await rejectExpiredSession();
  const parsed = O.HistoryOfferActionSchema.safeParse(value);
  if (!parsed.success || !["en", "ru", "tk"].includes(locale)) return { status: "validation" };
  const input = parsed.data;
  if (input.mutation && input.mutation.expectedAssignmentVersion !== input.expectedAssignmentVersion) return { status: "validation" };
  const selection = { kind: "detail", id: input.id, scope: input.scope, expectedAssignmentVersion: input.expectedAssignmentVersion };
  const before = await historyInboxAction(locale, selection);
  if (before.status !== "ok") return before;
  let response: unknown, orderResponse: unknown, failure: unknown;
  try {
    response = await apiFetchOptional<unknown>(`/vehicle-history/operator/requests/${input.id}/offer${input.mutation ? "" : `?expectedAssignmentVersion=${input.expectedAssignmentVersion}`}`, {
      method: input.mutation ? "POST" : "GET", cache: "no-store", headers: { "Accept-Language": locale },
      ...(input.mutation ? { body: input.mutation } : {}),
    });
    orderResponse = await apiFetchOptional<unknown>(`/vehicle-history/operator/requests/${input.id}/order?expectedAssignmentVersion=${input.expectedAssignmentVersion}`, {
      cache: "no-store", headers: { "Accept-Language": locale },
    });
  } catch (error) { unstable_rethrow(error); failure = error; }
  const after = await historyInboxAction(locale, selection);
  if (after.status !== "ok") return after;
  if (after.scope !== before.scope || after.actor.id !== before.actor.id) return { status: "stale", scope: after.scope };
  if (failure instanceof ApiError && [400, 403, 409].includes(failure.status)) return {
    status: failure.status === 400 ? "validation" : failure.status === 403 ? "denied" : "conflict", scope: after.scope,
  };
  if (failure) return { status: "unavailable", scope: after.scope };
  if (response === null) return { status: "expired", scope: after.scope };
  const result = O.HistoryOfferSchema.safeParse(response);
  const order = H.HistoryOrderStateSchema.safeParse(orderResponse);
  return result.success && order.success ? { status: "ok", scope: after.scope, actorId: after.actor.id, data: result.data, order: order.data } : { status: "unavailable", scope: after.scope };
}
