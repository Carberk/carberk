import { ListingsSchemas as L, type VehicleHistorySchemas as V } from "@auto-tm/contracts";

import { ApiError } from "./api-client";
import type { HistoryListingLabels } from "./history-listing-catalog";
import type { HistorySourceListing } from "./history-source-listing";

export type HistoryListingFailure = {
  status: "validation" | "expired" | "denied" | "stale" | "conflict" | "unavailable" | "not-found" | "video-unavailable";
  scope?: string;
};
type Binding = { id: string; scope: string; actor: V.HistoryDesk["actor"]; expectedAssignmentVersion: number };
export type HistoryListingResult = HistoryListingFailure | (Binding & (
  { status: "absent" } |
  { status: "ok"; sourceListingId: string } & (
    { kind: "detail"; data: { listing: HistorySourceListing; labels: HistoryListingLabels } } |
    { kind: "cover" | "play"; data: L.VideoAccessResponse }
  )
));

const access = L.VideoAccessResponseSchema;
const viewerVideo = access.shape.video.unwrap();
const viewerAccess = access.omit({ pendingStatus: true }).extend({
  video: viewerVideo.extend({ cover: viewerVideo.shape.cover.strict() }).strict().optional(),
}).strict();

/** Viewer grants name the returned video/generation and exact manifest member.
 * Reject owner/moderator URLs even if an upstream response otherwise decodes. */
export function readHistoryViewerMedia(value: unknown, play: boolean): L.VideoAccessResponse {
  const invalid = () => new ApiError(502, "INVALID_VIEWER_VIDEO", null, "Video unavailable");
  const parsed = viewerAccess.safeParse(value);
  if (!parsed.success) throw invalid();
  const data = parsed.data;
  if (data.status === "none" && !play && Object.keys(data).length === 1) return data;
  if (data.status !== "ready" || !data.video || !data.expiresAt || Date.parse(data.expiresAt) <= Date.now() ||
    !data.qualities?.length || new Set(data.qualities).size !== data.qualities.length || Boolean(data.url) !== play) throw invalid();
  const video = data.video;
  const validUrl = (value: string, member: string) => {
    const url = new URL(value);
    const extension = member === "master" ? "m3u8" : "webp";
    const resource = `${Buffer.from(member).toString("base64url")}.${extension}`;
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password && !url.hash &&
      url.pathname === `/api/v1/listings/video-files/viewer/${video.id}/${video.generationId}/${resource}` &&
      [...url.searchParams.keys()].join() === "grant" && Boolean(url.searchParams.get("grant"));
  };
  for (const [variant, url] of Object.entries(video.cover)) if (!validUrl(url, `cover:${variant}`)) throw invalid();
  if (data.url && !validUrl(data.url, "master")) throw invalid();
  return data;
}
