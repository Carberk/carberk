import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { ListingsSchemas } from "@auto-tm/contracts";

import { apiClient } from "../../api/client";
import { queryKeys } from "../../api/queryKeys";
import { useAuth } from "../../auth/useAuth";

/** The cover URLs a grant authorises: one per photo size. */
export type VideoCoverUrls = NonNullable<ListingsSchemas.VideoAccessResponse["video"]>["cover"];

/** What a buyer surface draws for a Listing's Ready video before anyone taps Play. */
export interface ListingVideoCover {
  durationMs: number;
  /** Absent until the cover grant arrives, or when it was refused: the tile stays dark with Play. */
  cover?: VideoCoverUrls | undefined;
}

/** Who may read the cover, and how the surface may treat its grant. */
export interface ListingVideoCoverOptions {
  /** The signed-in viewer owns this Listing: read the owner-preview cover. */
  isOwner?: boolean;
  /** The Listing's status, which decides whether a non-owner may see the tile at all. */
  status?: string | undefined;
  /** Detail and the gallery keep a mounted tile's grant fresh; cards do not poll. */
  timedRefresh?: boolean;
  /** An owner's unpublished draft reads its cover by draft id; everything else is a Listing. */
  targetType?: "listing" | "draft";
}

/** Renew a little before the grant dies; even a 10-second local grant gets half its life. */
const COVER_REFRESH_MARGIN_MS = 5_000;

/** Milliseconds from now until the grant in hand should be renewed, if it says when it dies. */
function msUntilCoverRefresh(expiresAt: string | undefined): number | undefined {
  if (!expiresAt) return undefined;
  const expiry = Date.parse(expiresAt);
  if (Number.isNaN(expiry)) return undefined;
  return Math.max(1_000, expiry - COVER_REFRESH_MARGIN_MS - Date.now());
}

/**
 * The Ready video's cover for one Listing (#1051). Asks only the cover read,
 * which issues cover-scoped URLs; playback is a separate POST made by the
 * player on Play. The tile exists only where the video can actually play:
 * the owner reads it as `owner-preview` (any status but `banned`, which the
 * server refuses for every audience), and everyone else only on an `active`
 * or `sold` Listing, the only statuses the `viewer` audience may read.
 * Listing reads carry `video` only for a signed-in viewer allowed to see it,
 * so a missing video, or no session yet, asks for nothing.
 */
export function useListingVideoCover(
  listingId: string,
  video: ListingsSchemas.ReadyListingVideo | undefined,
  options: ListingVideoCoverOptions = {},
): ListingVideoCover | undefined {
  const { isAuthenticated, userId } = useAuth();
  const { isOwner = false, status, timedRefresh = false, targetType = "listing" } = options;
  const audience = isOwner ? "owner-preview" : "viewer";
  const visible =
    !!video && status !== "banned" && (isOwner || status === undefined || status === "active" || status === "sold");
  const generationId = video?.generationId;
  const { data } = useQuery({
    queryKey: queryKeys.listings.videoCover(userId, listingId, generationId, audience),
    queryFn: () =>
      apiClient.get(`/listings/video-access/${audience}/${targetType}/${listingId}`, ListingsSchemas.VideoAccessResponseSchema),
    enabled: visible && isAuthenticated === true && !!userId,
    staleTime: (query) => msUntilCoverRefresh(query.state.data?.expiresAt) ?? 0,
    refetchInterval: timedRefresh ? (query) => msUntilCoverRefresh(query.state.data?.expiresAt) ?? false : false,
    retry: false,
  });
  // A grant for another generation would show the replaced video's cover.
  const cover = data?.status === "ready" && data.video?.generationId === generationId ? data.video?.cover : undefined;
  const durationMs = visible ? video?.durationMs : undefined;
  // Stable while nothing changes, so a gallery built from it keeps its tiles.
  return useMemo(() => (durationMs === undefined ? undefined : { durationMs, cover }), [durationMs, cover]);
}
