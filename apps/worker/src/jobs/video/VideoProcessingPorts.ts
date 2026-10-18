import type { ProcessedVideo, ProcessedVideoAsset } from "./VideoMediaProcessor";

export interface VideoProcessingLease {
  generationId: string;
  uploadId: string;
  sessionId: string;
  completionFence: string;
  targetRevision: number;
  leaseToken: string;
  sourceKey: string;
  sizeBytes: number;
  sha256: string;
  posterMs: number;
}
export interface VideoPublishedAsset extends ProcessedVideoAsset { key: string; }
export interface VideoProcessingFacts {
  durationMs: number;
  width: number;
  height: number;
  sourceSha256: string;
  assets: VideoPublishedAsset[];
}
/** PostgreSQL owns leases and terminal fences. Every method repeats the same
 * current session/generation/target checks, never trusting a queue payload. */
export interface VideoProcessingLedger {
  claim(generationId: string, now: Date, leaseToken: string): Promise<VideoProcessingLease | null>;
  plan(lease: VideoProcessingLease, assets: VideoPublishedAsset[], now: Date): Promise<boolean>;
  adopt(lease: VideoProcessingLease, facts: VideoProcessingFacts, now: Date): Promise<boolean>;
  fail(lease: VideoProcessingLease, reason: string, now: Date): Promise<void>;
}
export interface LocalVideoSource { path: string; dispose(): Promise<void>; }
/** Explicit private bucket only. Publishing is create-only and verifies any
 * preexisting key against the exact expected bytes. Readback hashes full bytes. */
export interface VideoProcessingObjects {
  download(lease: VideoProcessingLease): Promise<LocalVideoSource>;
  publish(directory: ProcessedVideo["directory"], asset: VideoPublishedAsset): Promise<void>;
  verify(asset: VideoPublishedAsset): Promise<boolean>;
}
