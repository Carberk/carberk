import type { PrismaService } from "@auto-tm/db";

import type { VideoCleanupLease, VideoCleanupLedger } from "./VideoCleanupPorts";
export class PrismaVideoCleanupLedger implements VideoCleanupLedger {
  constructor(private readonly prisma: PrismaService) {}
  async claim(_now: Date, _token: string): Promise<VideoCleanupLease | null> { return null; }
  async recordAbsence(_work: VideoCleanupLease, _now: Date): Promise<void> {}
  async fail(_work: VideoCleanupLease, _now: Date, _reason: string): Promise<void> {}
}
