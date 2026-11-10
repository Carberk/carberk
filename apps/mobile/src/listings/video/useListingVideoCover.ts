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

/** A grant lives five minutes; renew it a minute early so a mounted tile never holds a dead URL. */
const COVER_GRANT_STALE_MS = 4 * 60_000;

/**
 * The Ready video's cover for one Listing (#1051). Asks only the cover read
 * (`GET video-access/viewer/...`), which issues cover-scoped URLs; playback is
 * a separate POST made by the player on Play. Listing reads carry `video`
 * only for a signed-in viewer allowed to see it, so a missing video, or no
 * session yet, asks for nothing.
 */
export function useListingVideoCover(
  listingId: string,
  video: ListingsSchemas.ReadyListingVideo | undefined,
): ListingVideoCover | undefined {
  const { isAuthenticated, userId } = useAuth();
  const generationId = video?.generationId;
  const { data } = useQuery({
    queryKey: queryKeys.listings.videoCover(userId, listingId, generationId),
    queryFn: () => apiClient.get(`/listings/video-access/viewer/listing/${listingId}`, ListingsSchemas.VideoAccessResponseSchema),
    enabled: !!video && isAuthenticated === true && !!userId,
    staleTime: COVER_GRANT_STALE_MS,
    refetchInterval: COVER_GRANT_STALE_MS,
    retry: false,
  });
  // A grant for another generation would show the replaced video's cover.
  const cover = data?.status === "ready" && data.video?.generationId === generationId ? data.video?.cover : undefined;
  const durationMs = video?.durationMs;
  // Stable while nothing changes, so a gallery built from it keeps its tiles.
  return useMemo(() => (durationMs === undefined ? undefined : { durationMs, cover }), [durationMs, cover]);
}
