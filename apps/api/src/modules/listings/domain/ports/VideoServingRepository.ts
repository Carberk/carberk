export type VideoAudience = "viewer" | "owner-preview" | "moderator";
export interface ServingGeneration {
  id: string;
  status: string;
  durationMs: number | null;
  sourceState: string;
  bucket: string;
  manifest: unknown;
}
export interface ServingVideo {
  id: string;
  ownerId: string;
  targetOwnerId: string;
  listingStatus: string | null;
  deleted: boolean;
  active: ServingGeneration | null;
  pendingStatus: string | null;
}
/** One authoritative snapshot of target, pointers, generation and provenance. */
export interface VideoServingRepository {
  find(target: { type: "listing" | "draft"; id: string } | { videoId: string }): Promise<ServingVideo | null>;
}
export const VIDEO_SERVING_REPOSITORY = Symbol("VideoServingRepository");
