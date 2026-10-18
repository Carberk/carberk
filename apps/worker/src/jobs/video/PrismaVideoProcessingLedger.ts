import type { PrismaService } from "@auto-tm/db";

import type { VideoProcessingLedger, VideoProcessingLease, VideoProcessingFacts, VideoPublishedAsset } from "./VideoProcessingPorts";

export interface VideoWorkerEligibility { isEligible(userId: string): boolean; }
/** Durable processing boundary. Unimplemented methods deliberately deny readiness. */
export class PrismaVideoProcessingLedger implements VideoProcessingLedger {
  constructor(private readonly prisma: PrismaService, private readonly eligibility: VideoWorkerEligibility) {}
  async claim(_id: string, _now: Date, _token: string): Promise<VideoProcessingLease | null> { return null; }
  async plan(_lease: VideoProcessingLease, _assets: VideoPublishedAsset[], _now: Date): Promise<boolean> { return false; }
  async adopt(_lease: VideoProcessingLease, _facts: VideoProcessingFacts, _now: Date): Promise<boolean> { return false; }
  async fail(_lease: VideoProcessingLease, _reason: string, _now: Date): Promise<void> {}
}
