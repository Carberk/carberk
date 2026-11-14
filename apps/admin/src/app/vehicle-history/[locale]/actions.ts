"use server";
import { createHash } from "node:crypto";

import { VehicleHistorySchemas as V } from "@auto-tm/contracts";
import { unstable_rethrow } from "next/navigation";

import { apiFetchOptional, ApiError } from "@/lib/api-client";
import { rejectExpiredSession } from "@/lib/action-session";
import { getAccessToken } from "@/lib/cookies";
import type { DeskLocale } from "@/lib/history-desk-copy";

type Parsed<S extends { parse: (value: unknown) => unknown }> = ReturnType<S["parse"]>;
type Scope = { scope: string; actor: V.HistoryDesk["actor"] };
export type HistoryInboxResult = (Scope & { status: "ok" } & (
  { kind: "queue"; data: Parsed<typeof V.HistoryQueueResponseSchema> } |
  { kind: "detail" | "claim"; data: Parsed<typeof V.OperatorHistoryRequestSchema> } |
  { kind: "transcript"; data: Parsed<typeof V.HistoryMessagesPageSchema> }
)) | { status: "validation" | "expired" | "denied" | "stale" | "conflict" | "unavailable"; scope?: string };

/** Only the API authenticates. The cookie payload supplies a stable-session
 * correlation key after that same cookie has passed the current desk check. */
async function currentScope(locale: DeskLocale): Promise<Scope | null> {
  const token = await getAccessToken();
  if (!token) return null;
  const response = await apiFetchOptional<unknown>("/vehicle-history/desk", { cache: "no-store", headers: { "Accept-Language": locale } });
  if (!response) return null;
  const desk = V.HistoryDeskSchema.parse(response);
  const claims = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8")) as { sub?: unknown; sid?: unknown };
  const session = V.HistoryOperatorSchema.shape.id.safeParse(claims.sid);
  if (claims.sub !== desk.actor.id || !session.success || token !== await getAccessToken()) return null;
  return { actor: desk.actor, scope: createHash("sha256").update(`history-inbox\0${desk.actor.id}\0${session.data}`).digest("hex") };
}

/** Read/claim only. Receipt ACKs and client selection/disposal belong to their UI owners. */
export async function historyInboxAction(locale: DeskLocale, value: unknown): Promise<HistoryInboxResult> {
  await rejectExpiredSession();
  const parsed = V.HistoryInboxActionSchema.safeParse(value);
  if (!parsed.success || !["tk", "ru", "en"].includes(locale)) return { status: "validation" };
  const input = parsed.data;
  let context: Scope | null = null;
  try {
    context = await currentScope(locale);
    if (!context) return { status: "expired" };
    // This comparison precedes every claim, even an uncertain same-owner retry.
    if (input.scope && input.scope !== context.scope) return { status: "stale", scope: context.scope };
    const base = "/vehicle-history/operator/requests";
    const queryValues = input.kind === "queue" ? input.query : input.kind === "transcript"
      ? { expectedAssignmentVersion: String(input.expectedAssignmentVersion), ...(input.cursor ? { cursor: input.cursor } : {}) } : {};
    const query = new URLSearchParams();
    for (const [key, entry] of Object.entries(queryValues)) if (entry !== undefined) query.set(key, entry);
    const path = input.kind === "queue" ? base : `${base}/${input.id}${input.kind === "claim" ? "/claim" : input.kind === "transcript" ? "/messages" : ""}`;
    const response = await apiFetchOptional<unknown>(`${path}${query.size ? `?${query}` : ""}`, {
      method: input.kind === "claim" ? "POST" : "GET", cache: "no-store", headers: { "Accept-Language": locale },
      ...(input.kind === "claim" ? { body: { expectedAssignmentVersion: input.expectedAssignmentVersion } } : {}),
    });
    if (!response) return { status: "expired" };
    const result = input.kind === "queue" ? { kind: input.kind, data: V.HistoryQueueResponseSchema.parse(response) } as const
      : input.kind === "transcript" ? { kind: input.kind, data: V.HistoryMessagesPageSchema.parse(response) } as const
        : { kind: input.kind, data: V.OperatorHistoryRequestSchema.parse(response) } as const;
    if ((result.kind === "detail" || result.kind === "claim") && (result.data.id !== ("id" in input ? input.id : undefined) || !result.data.mine ||
      result.data.assignedOperator?.id !== context.actor.id || (input.kind === "detail" && result.data.assignmentVersion !== input.expectedAssignmentVersion))) {
      return { status: "conflict", scope: context.scope };
    }
    if (input.kind !== "queue") {
      const selectedResponse = await apiFetchOptional<unknown>(`${base}/${input.id}`, { cache: "no-store", headers: { "Accept-Language": locale } });
      if (!selectedResponse) return { status: "expired" };
      const selected = V.OperatorHistoryRequestSchema.parse(selectedResponse);
      const version = result.kind === "queue" || result.kind === "transcript" ? input.expectedAssignmentVersion : result.data.assignmentVersion;
      if (selected.id !== input.id || !selected.mine || selected.assignedOperator?.id !== context.actor.id || selected.assignmentVersion !== version ||
        (input.kind === "claim" && version !== input.expectedAssignmentVersion && !(input.expectedAssignmentVersion === 0 && version === 1))) {
        return { status: "conflict", scope: context.scope };
      }
    }
    const final = await currentScope(locale);
    if (!final) return { status: "expired" };
    if (final.scope !== context.scope) return { status: "stale", scope: final.scope };
    return { ...result, ...final, status: "ok" };
  } catch (error) {
    unstable_rethrow(error);
    const scope = context?.scope;
    if (error instanceof ApiError) {
      if (error.status === 403) return { status: "denied", ...(scope ? { scope } : {}) };
      if (error.status === 409) return { status: "conflict", ...(scope ? { scope } : {}) };
      if (error.status === 400) return { status: "validation", ...(scope ? { scope } : {}) };
    }
    return { status: "unavailable", ...(scope ? { scope } : {}) };
  }
}
