import { useQuery } from "@tanstack/react-query";
import type { ListingsSchemas } from "@auto-tm/contracts";
import { z } from "zod";

import { apiClient } from "../../api/client";
import { useAuth } from "../../auth/useAuth";

const capabilities = z.object({ canUpload: z.boolean(), canView: z.boolean() }).strict();
const descriptor = z.object({ generationId: z.string().uuid(), durationMs: z.number().int().positive().max(90000), renditions: z.array(z.union([z.literal(240), z.literal(360), z.literal(720)])).min(1).max(3) }).strict();
const posterGrant = z.object({ url: z.string().regex(/^\/video-grants\/[A-Za-z0-9_-]{43}\/poster\.jpg$/), generationId: z.string().uuid(), expiresAt: z.string().datetime() }).strict();
export interface ListingVideo { media: ListingsSchemas.ListingMedia; renditions: number[]; }
/** Ready metadata and a short-lived poster grant only. No player/source/media
 * request exists until a separate intentional Play mounts the native player. */
export function useListingVideo(listingId: string | undefined): ListingVideo | null {
 const { userId } = useAuth();
 const valid = z.string().uuid().safeParse(listingId).success && z.string().uuid().safeParse(userId).success;
 const admitted = useQuery({ queryKey: ["listing-video-capabilities", userId, null], queryFn: () => apiClient.get("/listing-video/capabilities", capabilities), enabled: valid, staleTime: 0 });
 const current = useQuery({ queryKey: ["listing-video", userId, listingId], queryFn: () => apiClient.get(`/listings/${listingId}/video`, descriptor), enabled: valid && admitted.data?.canView === true, staleTime: 15000, retry: false });
 const poster = useQuery({ queryKey: ["listing-video-poster", userId, listingId, current.data?.generationId], queryFn: () => apiClient.post(`/listings/${listingId}/video-grants`, { purpose: "poster" }, posterGrant), enabled: valid && admitted.data?.canView === true && current.isSuccess, staleTime: 40000, refetchInterval: 45000, retry: false, gcTime: 0 });
 if (!admitted.data?.canView || !current.isSuccess || !poster.isSuccess || !current.data || !poster.data || poster.data.generationId !== current.data.generationId || Date.parse(poster.data.expiresAt) <= Date.now()) return null;
 const uri = `${(process.env["EXPO_PUBLIC_API_URL"] ?? "http://localhost:3006/api/v1").replace(/\/$/, "")}${poster.data.url}`;
 return { media: { id: current.data.generationId, key: `private-video:${current.data.generationId}`, kind: "video", width: 640, height: 480, sortOrder: 1, durationMs: current.data.durationMs, variants: { thumbnail: uri, list: uri, detail: uri, fullscreen: uri } }, renditions: current.data.renditions };
}
