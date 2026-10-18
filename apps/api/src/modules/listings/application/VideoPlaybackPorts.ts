import type { Readable } from "node:stream";
export const VIDEO_PLAYBACK_AUTHORITY = Symbol("VideoPlaybackAuthority");
export const VIDEO_PLAYBACK_OBJECTS = Symbol("VideoPlaybackObjects");
export const VIDEO_GRANT_ISSUER = Symbol("VideoGrantIssuer");
export interface VideoGrantIssuer {
  issue(input: { userId: string; sessionId: string; listingId: string; purpose: "poster" | "playback" }): Promise<{ url: string; generationId: string; expiresAt: Date } | null>;
}
export interface VideoPlaybackAsset { path: string; purpose: "poster" | "playback"; key: string; sizeBytes: number; contentType: string; }
export interface VideoPlaybackAuthority {
  /** Must recheck grant hash/deadline/revocation, owning session/account, current tester
   * access, Listing visibility and exact active ready generation on EACH request. */
  authorize(secret: string): Promise<{ purpose: "poster" | "playback"; assets: VideoPlaybackAsset[] } | null>;
}
export interface VideoPlaybackObjects {
  open(asset: VideoPlaybackAsset, range: { start: number; end: number } | undefined, signal: AbortSignal): Promise<Readable>;
}
