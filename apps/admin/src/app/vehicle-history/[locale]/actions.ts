"use server";
import { VehicleHistorySchemas as V } from "@auto-tm/contracts";
import { unstable_rethrow } from "next/navigation";

import { apiFetchOptional, ApiError } from "../../../lib/api-client";
import { rejectExpiredSession } from "../../../lib/action-session";
import { getAccessToken } from "../../../lib/cookies";
import type { DeskLocale } from "../../../lib/history-desk-copy";
import { parseHistoryMessageInput } from "../../../lib/history-message-input";
import { historyInboxScope } from "../../../lib/history-inbox-scope";

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
  const response = await apiFetchOptional<unknown>("/vehicle-history/desk", { cache: "no-store", headers: { "Accept-Language": locale } }, token);
  if (!response) return null;
  const desk = V.HistoryDeskSchema.parse(response);
  const binding = historyInboxScope(token);
  if (binding?.actorId !== desk.actor.id || token !== await getAccessToken()) return null;
  return { actor: desk.actor, scope: binding.scope };
}

/** Read/claim only. Receipt ACKs and client selection/disposal belong to their UI owners. */
export async function historyInboxAction(locale: DeskLocale, value: unknown): Promise<HistoryInboxResult> {
  await rejectExpiredSession();
  const parsed = V.HistoryInboxActionSchema.safeParse(value);
  if (!parsed.success || !["tk", "ru", "en"].includes(locale)) return { status: "validation" };
  const input = parsed.data;
  let scope: string | undefined;
  try {
    const token = await getAccessToken();
    const binding = token ? historyInboxScope(token) : null;
    if (!token || !binding) return { status: "expired" };
    scope = binding.scope;
    if (input.kind === "queue" || input.kind === "claim") {
      const current = await currentScope(locale);
      if (!current) return { status: "expired" };
      if (token !== await getAccessToken()) return { status: "stale", scope: current.scope };
    }
    if (input.scope && input.scope !== scope) return { status: "stale", scope };
    const base = "/vehicle-history/operator/requests";
    const queryValues = input.kind === "queue" ? input.query : input.kind === "transcript"
      ? { expectedAssignmentVersion: String(input.expectedAssignmentVersion), ...(input.cursor ? { cursor: input.cursor } : {}) } : {};
    const query = new URLSearchParams();
    for (const [key, entry] of Object.entries(queryValues)) if (entry !== undefined) query.set(key, entry);
    const path = input.kind === "queue" ? base : `${base}/${input.id}${input.kind === "claim" ? "/claim" : input.kind === "transcript" ? "/messages" : ""}`;
    const response = await apiFetchOptional<unknown>(`${path}${query.size ? `?${query}` : ""}`, {
      method: input.kind === "claim" ? "POST" : "GET", cache: "no-store", headers: { "Accept-Language": locale },
      ...(input.kind === "claim" ? { body: { expectedAssignmentVersion: input.expectedAssignmentVersion } } : {}),
    }, token);
    if (!response) return { status: "expired" };
    const result = input.kind === "queue" ? { kind: input.kind, data: V.HistoryQueueResponseSchema.parse(response) } as const
      : input.kind === "transcript" ? { kind: input.kind, data: V.HistoryMessagesPageSchema.parse(response) } as const
        : { kind: input.kind, data: V.OperatorHistoryRequestSchema.parse(response) } as const;
    if ((result.kind === "detail" || result.kind === "claim") && (result.data.id !== ("id" in input ? input.id : undefined) || !result.data.mine ||
      result.data.assignedOperator?.id !== binding.actorId || (input.kind === "detail" && result.data.assignmentVersion !== input.expectedAssignmentVersion))) {
      return { status: "conflict", scope };
    }
    if (input.kind === "claim" || input.kind === "transcript") {
      const selectedResponse = await apiFetchOptional<unknown>(`${base}/${input.id}`, { cache: "no-store", headers: { "Accept-Language": locale } }, token);
      if (!selectedResponse) return { status: "expired" };
      const selected = V.OperatorHistoryRequestSchema.parse(selectedResponse);
      const version = result.kind === "claim" ? result.data.assignmentVersion : input.expectedAssignmentVersion;
      if (selected.id !== input.id || !selected.mine || selected.assignedOperator?.id !== binding.actorId || selected.assignmentVersion !== version ||
        (input.kind === "claim" && version !== input.expectedAssignmentVersion && !(input.expectedAssignmentVersion === 0 && version === 1))) {
        return { status: "conflict", scope };
      }
    }
    const final = await currentScope(locale);
    if (!final) return { status: "expired" };
    if (final.scope !== scope || token !== await getAccessToken()) return { status: "stale", scope: final.scope };
    return { ...result, ...final, status: "ok" };
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof ApiError) {
      if (error.status === 403) return { status: "denied", ...(scope && (input.kind === "queue" || input.kind === "claim") ? { scope } : {}) };
      if (error.status === 409) return { status: "conflict", ...(scope ? { scope } : {}) };
      if (error.status === 400) return { status: "validation", ...(scope ? { scope } : {}) };
    }
    return { status: "unavailable", ...(scope ? { scope } : {}) };
  }
}

type HistoryHandoverFailure = Exclude<HistoryInboxResult, { status: "ok" }>;
export type HistoryAssigneesResult = HistoryHandoverFailure |
  (Scope & { status: "ok"; data: Parsed<typeof V.HistoryAssigneesResponseSchema> });
export type HistoryHandoverResult = HistoryHandoverFailure |
  (Scope & { status: "ok"; data: Parsed<typeof V.HandoverHistoryResponseSchema> });

export async function historyAssigneesAction(locale: DeskLocale, value: unknown): Promise<HistoryAssigneesResult> {
  await rejectExpiredSession();
  const input = V.HistoryAssigneesActionSchema.safeParse(value);
  if (!input.success || !["tk", "ru", "en"].includes(locale)) return { status: "validation" };
  const selection = { ...input.data, kind: "detail" };
  const before = await historyInboxAction(locale, selection);
  if (before.status !== "ok") return before;
  if (before.kind !== "detail") return { status: "unavailable", scope: before.scope };
  let response: unknown, failure: unknown;
  try { response = await apiFetchOptional<unknown>("/vehicle-history/operator/requests/assignees", {
    cache: "no-store", headers: { "Accept-Language": locale },
  }); } catch (error) { unstable_rethrow(error); failure = error; }
  const after = await historyInboxAction(locale, selection);
  if (after.status !== "ok") return after;
  if (after.kind !== "detail" || after.scope !== before.scope || after.actor.id !== before.actor.id) return { status: "stale", scope: after.scope };
  if (failure instanceof ApiError && failure.status === 403) return { status: "denied", scope: after.scope };
  if (failure) return { status: "unavailable", scope: after.scope };
  if (response === null) return { status: "expired", scope: after.scope };
  const data = V.HistoryAssigneesResponseSchema.safeParse(response);
  if (!data.success || data.data.items.some((item) => item.id === after.actor.id) ||
    new Set(data.data.items.map((item) => item.id)).size !== data.data.items.length) return { status: "unavailable", scope: after.scope };
  return { status: "ok", scope: after.scope, actor: after.actor, data: data.data };
}

export async function historyHandoverAction(locale: DeskLocale, value: unknown): Promise<HistoryHandoverResult> {
  await rejectExpiredSession();
  const input = V.HistoryHandoverActionSchema.safeParse(value);
  if (!input.success || !["tk", "ru", "en"].includes(locale) || input.data.targetOperatorId === undefined) return { status: "validation" };
  const selection = { kind: "detail", id: input.data.id, scope: input.data.scope,
    expectedAssignmentVersion: input.data.expectedAssignmentVersion };
  const before = await historyInboxAction(locale, selection);
  if (before.status !== "ok") return before;
  if (before.kind !== "detail") return { status: "unavailable", scope: before.scope };
  let response: unknown, failure: unknown;
  try { response = await apiFetchOptional<unknown>(`/vehicle-history/operator/requests/${input.data.id}/handover`, {
    method: "POST", cache: "no-store", headers: { "Accept-Language": locale },
    body: { targetOperatorId: input.data.targetOperatorId, expectedAssignmentVersion: input.data.expectedAssignmentVersion },
  }); } catch (error) { unstable_rethrow(error); failure = error; }
  if (response === null) return { status: "expired" };
  if (failure instanceof ApiError && failure.status === 403) return { status: "denied", scope: before.scope };
  if (failure instanceof ApiError && failure.status === 409) return { status: "conflict", scope: before.scope };
  let after: Scope | null;
  try { after = await currentScope(locale); }
  catch (error) {
    unstable_rethrow(error);
    return { status: error instanceof ApiError && error.status === 403 ? "denied" : "unavailable", scope: before.scope };
  }
  if (!after) return { status: "expired" };
  if (after.scope !== before.scope || after.actor.id !== before.actor.id) return { status: "stale", scope: after.scope };
  if (failure instanceof ApiError && failure.status === 400) return { status: "validation", scope: after.scope };
  if (failure) return { status: "unavailable", scope: after.scope };
  const data = V.HandoverHistoryResponseSchema.safeParse(response);
  if (!data.success || data.data.id !== input.data.id || data.data.assignmentVersion !== input.data.expectedAssignmentVersion + 1 ||
    data.data.assignedOperator.id !== input.data.targetOperatorId) return { status: "unavailable", scope: after.scope };
  return { status: "ok", scope: after.scope, actor: after.actor, data: data.data };
}

export type HistoryMessageResult = Exclude<HistoryInboxResult, { status: "ok" }> |
  (Scope & { status: "ok" } & (
    { kind: "send"; data: V.HistoryMessage } |
    { kind: "receipts"; data: Parsed<typeof V.HistoryReceiptsSchema> } |
    { kind: "ack"; data: Parsed<typeof V.HistoryReceiptSchema> }
  ));

/** Dormant until the reply/reader owners connect it. Detail retains the existing
 * current-purpose, stable-session and selected-assignment fence on both sides
 * of the HTTP operation, including uncertain failures. No mutation is replayed. */
export async function historyMessageAction(locale: DeskLocale, value: unknown): Promise<HistoryMessageResult> {
  await rejectExpiredSession();
  const input = parseHistoryMessageInput(value);
  if (!input || !["tk", "ru", "en"].includes(locale)) return { status: "validation" };
  const selection = { kind: "detail", id: input.id, scope: input.scope, expectedAssignmentVersion: input.expectedAssignmentVersion };
  const before = await historyInboxAction(locale, selection);
  if (before.status !== "ok") return before;
  let response: unknown, failure: unknown;
  try {
    const path = `/vehicle-history/operator/requests/${input.id}/${input.kind === "send" ? "messages" : "receipts"}`;
    response = await apiFetchOptional<unknown>(path + (input.kind === "receipts" ? `?expectedAssignmentVersion=${input.expectedAssignmentVersion}` : ""), {
      method: input.kind === "receipts" ? "GET" : "POST", cache: "no-store", headers: { "Accept-Language": locale },
      ...(input.kind === "receipts" ? {} : { body: { ...input.body, expectedAssignmentVersion: input.expectedAssignmentVersion } }),
    });
  } catch (error) { unstable_rethrow(error); failure = error; }
  const after = await historyInboxAction(locale, selection);
  if (after.status !== "ok") return after;
  if (after.scope !== before.scope || after.actor.id !== before.actor.id) return { status: "stale", scope: after.scope };
  const scope = after.scope;
  if (failure instanceof ApiError) {
    if (failure.status === 403) return { status: "denied", scope };
    if (failure.status === 409) return { status: "conflict", scope };
    if (failure.status === 400) return { status: "validation", scope };
  }
  if (failure) return { status: "unavailable", scope };
  if (response === null) return { status: "expired", scope };
  const admitted = { status: "ok", scope, actor: after.actor } as const;
  if (input.kind === "send") {
    const result = V.HistoryMessageSchema.safeParse(response);
    if (!result.success || result.data.clientMessageId !== input.body.clientMessageId || result.data.text !== input.body.text ||
      result.data.author.id !== after.actor.id || result.data.author.kind !== "operator") return { status: "unavailable", scope };
    return { ...admitted, kind: input.kind, data: result.data };
  }
  if (input.kind === "receipts") {
    const result = V.HistoryReceiptsSchema.safeParse(response);
    // Prior staff epochs remain valid facts. The current epoch must belong to
    // this actor; version zero belongs to one other participant (the requester).
    if (!result.success || new Set(result.data.items.map((item) => item.assignmentVersion)).size !== result.data.items.length ||
      result.data.items.some((item) => item.assignmentVersion > input.expectedAssignmentVersion ||
        (item.assignmentVersion === input.expectedAssignmentVersion && item.participantId !== after.actor.id) ||
        (item.assignmentVersion === 0 && item.participantId === after.actor.id))) return { status: "unavailable", scope };
    return { ...admitted, kind: input.kind, data: result.data };
  }
  // The fetched cursor's order is correlation only. The API independently
  // checks its current-session contiguous offer; never fetch here to create one.
  const result = V.HistoryReceiptSchema.safeParse(response);
  if (!result.success || result.data.participantId !== after.actor.id || result.data.assignmentVersion !== input.expectedAssignmentVersion ||
    BigInt(input.body.kind === "read" ? result.data.readOrder : result.data.receivedOrder) < BigInt(input.throughOrder)) return { status: "unavailable", scope };
  return { ...admitted, kind: input.kind, data: result.data };
}

export type HistoryPrivateNoteResult = Exclude<HistoryInboxResult, { status: "ok" }> |
  (Scope & { status: "ok" } & (
    { kind: "page"; data: V.HistoryPrivateNotesPage } |
    { kind: "add"; data: V.HistoryPrivateNote }
  ));

export async function historyPrivateNoteAction(locale: DeskLocale, value: unknown): Promise<HistoryPrivateNoteResult> {
  await rejectExpiredSession();
  if (!value || typeof value !== "object" || Array.isArray(value)) return { status: "validation" };
  const command = value as Record<string, unknown>;
  const selection = V.HistoryInboxActionSchema.safeParse({ kind: "detail", id: command["id"], scope: command["scope"],
    expectedAssignmentVersion: command["expectedAssignmentVersion"] });
  if (!selection.success || selection.data.kind !== "detail" || !["tk", "ru", "en"].includes(locale)) return { status: "validation" };
  const kind = command["kind"];
  if (kind !== "page" && kind !== "add") return { status: "validation" };
  if (Object.keys(command).some((key) => !["kind", "id", "scope", "expectedAssignmentVersion", ...(kind === "page" ? ["cursor"] : ["body"])].includes(key))) return { status: "validation" };
  const cursor = kind === "page" && command["cursor"] !== undefined ? V.HistoryPrivateNoteSchema.shape.id.safeParse(command["cursor"]) : null;
  if (cursor && !cursor.success || kind === "page" && "body" in command || kind === "add" && "cursor" in command) return { status: "validation" };
  const body = kind === "add" ? V.AddHistoryPrivateNoteSchema.safeParse(command["body"]) : null;
  if (kind === "add" && (!body?.success || body.data.expectedAssignmentVersion !== selection.data.expectedAssignmentVersion)) return { status: "validation" };
  const before = await historyInboxAction(locale, selection.data);
  if (before.status !== "ok") return before;
  let response: unknown, failure: unknown;
  try {
    const path = `/vehicle-history/operator/requests/${selection.data.id}/notes`;
    const query = new URLSearchParams({ expectedAssignmentVersion: String(selection.data.expectedAssignmentVersion) });
    if (cursor?.success) query.set("cursor", cursor.data);
    response = await apiFetchOptional<unknown>(kind === "page" ? `${path}?${query}` : path, {
      method: kind === "page" ? "GET" : "POST", cache: "no-store", headers: { "Accept-Language": locale },
      ...(body?.success ? { body: body.data } : {}),
    });
  } catch (error) { unstable_rethrow(error); failure = error; }
  const after = await historyInboxAction(locale, selection.data);
  if (after.status !== "ok") return after;
  if (after.scope !== before.scope || after.actor.id !== before.actor.id) return { status: "stale", scope: after.scope };
  const scope = after.scope;
  if (failure instanceof ApiError) {
    if (failure.status === 403) return { status: "denied", scope };
    if (failure.status === 409) return { status: "conflict", scope };
    if (failure.status === 400) return { status: "validation", scope };
  }
  if (failure) return { status: "unavailable", scope };
  if (response === null) return { status: "expired", scope };
  if (kind === "page") {
    const data = V.HistoryPrivateNotesPageSchema.safeParse(response);
    if (!data.success || new Set(data.data.items.map((note) => note.id)).size !== data.data.items.length ||
      data.data.nextCursor && data.data.nextCursor !== data.data.items.at(-1)?.id) return { status: "unavailable", scope };
    return { status: "ok", scope, actor: after.actor, kind, data: data.data };
  }
  const data = V.HistoryPrivateNoteSchema.safeParse(response);
  if (!data.success || !body?.success || data.data.clientNoteId !== body.data.clientNoteId ||
    data.data.text !== body.data.text || data.data.author.id !== after.actor.id) return { status: "unavailable", scope };
  return { status: "ok", scope, actor: after.actor, kind, data: data.data };
}

export type HistoryReminderResult = Exclude<HistoryInboxResult, { status: "ok" }> |
  (Scope & { status: "ok"; kind: "reminder"; data: V.HistoryReminder; refused: boolean });

export async function historyReminderAction(locale: DeskLocale, value: unknown): Promise<HistoryReminderResult> {
  await rejectExpiredSession();
  if (!value || typeof value !== "object" || Array.isArray(value)) return { status: "validation" };
  const input = value as Record<string, unknown>;
  const selection = V.HistoryInboxActionSchema.safeParse({ kind: "detail", id: input["id"], scope: input["scope"],
    expectedAssignmentVersion: input["expectedAssignmentVersion"] });
  const body = input["body"] === undefined ? null : V.SendHistoryReminderSchema.safeParse(input["body"]);
  if (!selection.success || selection.data.kind !== "detail" || !["tk", "ru", "en"].includes(locale)
    || Object.keys(input).some((key) => !["id", "scope", "expectedAssignmentVersion", "body"].includes(key))
    || body && (!body.success || body.data.expectedAssignmentVersion !== selection.data.expectedAssignmentVersion)) return { status: "validation" };
  const before = await historyInboxAction(locale, selection.data);
  if (before.status !== "ok") return before;
  const path = `/vehicle-history/operator/requests/${selection.data.id}/reminder`;
  let response: unknown, failure: unknown, refused = false;
  try {
    try {
      response = await apiFetchOptional<unknown>(body ? path : `${path}?expectedAssignmentVersion=${selection.data.expectedAssignmentVersion}`, {
        method: body ? "POST" : "GET", cache: "no-store", headers: { "Accept-Language": locale },
        ...(body?.success ? { body: body.data } : {}),
      });
    } catch (error) {
      unstable_rethrow(error);
      if (!(body && error instanceof ApiError && error.status === 409 && error.code === "HISTORY_REMINDER_CONFLICT")) throw error;
      refused = true;
      response = await apiFetchOptional<unknown>(`${path}?expectedAssignmentVersion=${selection.data.expectedAssignmentVersion}`,
        { cache: "no-store", headers: { "Accept-Language": locale } });
    }
  } catch (error) { unstable_rethrow(error); failure = error; }
  const after = await historyInboxAction(locale, selection.data);
  if (after.status !== "ok") return after;
  if (after.scope !== before.scope || after.actor.id !== before.actor.id) return { status: "stale", scope: after.scope };
  if (failure instanceof ApiError && failure.status === 403) return { status: "denied", scope: after.scope };
  if (failure instanceof ApiError && failure.status === 409) return { status: "conflict", scope: after.scope };
  if (failure) return { status: "unavailable", scope: after.scope };
  if (response === null) return { status: "expired", scope: after.scope };
  const data = V.HistoryReminderSchema.safeParse(response);
  if (!data.success) return { status: "unavailable", scope: after.scope };
  return { status: "ok", kind: "reminder", scope: after.scope, actor: after.actor, data: data.data, refused };
}
