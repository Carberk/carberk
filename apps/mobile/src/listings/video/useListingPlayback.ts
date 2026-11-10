import { useCallback, useEffect, useRef, useState } from "react";
import { ListingsSchemas } from "@auto-tm/contracts";

import { apiClient, ApiError } from "../../api/client";

export type PlaybackAudience = "viewer" | "owner-preview" | "moderator";
export type PlaybackTargetType = "listing" | "draft";

export interface PlaybackTarget {
  audience: PlaybackAudience;
  type: PlaybackTargetType;
  id: string;
}

export type ListingPlayback =
  | { phase: "loading" }
  | {
      phase: "ready";
      url: string;
      qualities: number[];
      durationMs: number;
      expiresAt?: string;
    }
  | { phase: "unavailable" }
  | { phase: "error" };

/**
 * Issues the playback grant for one explicit Play tap (#1057). A refused
 * request (404) means the video can no longer be played; any other failure
 * is retryable. The grant lives five minutes, so `retry` also renews it.
 */
export function useListingPlayback(target: PlaybackTarget) {
  const [playback, setPlayback] = useState<ListingPlayback>({ phase: "loading" });
  const targetRef = useRef(target);
  targetRef.current = target;
  const requestId = useRef(0);

  const request = useCallback(async () => {
    const id = ++requestId.current;
    const { audience, type, id: targetId } = targetRef.current;
    setPlayback({ phase: "loading" });
    try {
      const res = await apiClient.post(
        `/listings/video-access/${audience}/${type}/${targetId}/playback`,
        {},
        ListingsSchemas.VideoAccessResponseSchema,
      );
      if (requestId.current !== id) return;
      if (res.status !== "ready" || !res.url || !res.video) {
        setPlayback({ phase: "unavailable" });
        return;
      }
      setPlayback({
        phase: "ready",
        url: res.url,
        qualities: res.qualities ?? [],
        durationMs: res.video.durationMs,
        ...(res.expiresAt ? { expiresAt: res.expiresAt } : {}),
      });
    } catch (error) {
      if (requestId.current !== id) return;
      if (error instanceof ApiError && error.status === 404) {
        setPlayback({ phase: "unavailable" });
      } else {
        setPlayback({ phase: "error" });
      }
    }
  }, []);

  useEffect(() => {
    void request();
  }, [request, target.audience, target.type, target.id]);

  return { playback, retry: request };
}
