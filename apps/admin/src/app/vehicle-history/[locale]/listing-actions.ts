"use server";

import { VehicleHistorySchemas as V } from "@auto-tm/contracts";
import { unstable_rethrow } from "next/navigation";

import { rejectExpiredSession } from "../../../lib/action-session";
import { ApiError, apiFetchOptional } from "../../../lib/api-client";
import { resolveHistoryListingCatalog } from "../../../lib/history-listing-catalog";
import { readHistorySourceListing } from "../../../lib/history-source-listing";
import { readHistoryViewerMedia, type HistoryListingFailure, type HistoryListingResult } from "../../../lib/history-listing-envelope";

import { historyInboxAction } from "./actions";

class CurrentRequestLost extends Error {
  constructor(readonly result: HistoryListingFailure) { super("Current History request unavailable"); }
}

/** Dormant request-bound reader. Source IDs and media audiences are never inputs. */
export async function historyListingAction(locale: unknown, value: unknown): Promise<HistoryListingResult> {
  await rejectExpiredSession();
  if ((locale !== "tk" && locale !== "ru" && locale !== "en") || !value || typeof value !== "object" ||
    !("kind" in value) || (value.kind !== "detail" && value.kind !== "cover" && value.kind !== "play")) return { status: "validation" };
  const kind = value.kind;
  // Reuse the existing strict selection contract without adding shared commands.
  const parsed = V.HistoryInboxActionSchema.safeParse({ ...value, kind: "detail" });
  if (!parsed.success || parsed.data.kind !== "detail") return { status: "validation" };
  const input = parsed.data;
  const selected = await historyInboxAction(locale, input);
  if (selected.status !== "ok") return { status: selected.status, ...(selected.scope ? { scope: selected.scope } : {}) };
  if (selected.kind !== "detail") return { status: "unavailable" };
  const binding = { id: input.id, scope: selected.scope, actor: selected.actor, expectedAssignmentVersion: input.expectedAssignmentVersion };
  const sourceListingId = selected.data.sourceListingId;
  if (!sourceListingId) return { ...binding, status: "absent" };
  const reauthorize = async () => {
    const current = await historyInboxAction(locale, input);
    if (current.status !== "ok") throw new CurrentRequestLost({ status: current.status, ...(current.scope ? { scope: current.scope } : {}) });
    if (current.kind !== "detail" || current.scope !== selected.scope || current.actor.id !== selected.actor.id ||
      current.data.id !== input.id || current.data.assignmentVersion !== input.expectedAssignmentVersion ||
      current.data.sourceListingId !== sourceListingId) throw new CurrentRequestLost({ status: "conflict", scope: selected.scope });
  };
  try {
    if (kind !== "detail") {
      let response: unknown;
      try {
        response = await apiFetchOptional(`/listings/video-access/viewer/listing/${sourceListingId}${kind === "play" ? "/playback" : ""}`, {
          method: kind === "play" ? "POST" : "GET", cache: "no-store", headers: { "Accept-Language": locale },
        });
      } finally { await reauthorize(); }
      if (response === null) return { status: "expired", scope: selected.scope };
      const data = readHistoryViewerMedia(response, kind === "play");
      return { ...binding, status: "ok", kind, sourceListingId, data };
    }
    const listing = await readHistorySourceListing(sourceListingId, reauthorize);
    const labels = await resolveHistoryListingCatalog(listing, locale, reauthorize);
    await reauthorize();
    return { ...binding, status: "ok", kind: "detail", sourceListingId, data: { listing, labels } };
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof CurrentRequestLost) return error.result;
    try { await reauthorize(); }
    catch (current) {
      unstable_rethrow(current);
      if (current instanceof CurrentRequestLost) return current.result;
      return { status: "unavailable", scope: selected.scope };
    }
    const failures: Record<number, HistoryListingFailure["status"]> = { 400: "validation", 401: "expired", 403: "denied", 404: "not-found", 409: "conflict" };
    const status = error instanceof ApiError ? failures[error.status] : undefined;
    // Reauthorization succeeded; only viewer unavailability is local to video.
    return { status: kind !== "detail" && (!status || status === "not-found")
      ? "video-unavailable" : status ?? "unavailable", scope: selected.scope };
  }
}
