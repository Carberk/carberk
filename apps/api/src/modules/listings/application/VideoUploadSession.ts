import { Injectable } from "@nestjs/common";
export type VideoSessionState = "UPLOADING" | "PAUSED" | "COMPLETING" | "PROCESSING" | "FAILED" | "CANCELLED" | "CLEANUP_PENDING" | "DELETED";
export interface VideoSessionRecord { id: string; uploadId: string; userId: string; listingId?: string; state: VideoSessionState; expiresAt: Date; claimToken: string; }
@Injectable()
export class VideoUploadSessionService {
  constructor(private readonly now: () => Date = () => new Date()) {}
  canMutate(session: VideoSessionRecord, userId: string): boolean { return session.userId === userId && session.expiresAt.getTime() > this.now().getTime() && !["CANCELLED", "DELETED", "CLEANUP_PENDING"].includes(session.state); }
  pause(session: VideoSessionRecord, userId: string): VideoSessionRecord { if (!this.canMutate(session, userId)) throw new Error("VIDEO_SESSION_NOT_MUTABLE"); return { ...session, state: "PAUSED" }; }
  resume(session: VideoSessionRecord, userId: string): VideoSessionRecord { if (!this.canMutate(session, userId)) throw new Error("VIDEO_SESSION_NOT_MUTABLE"); return { ...session, state: "UPLOADING" }; }
  cancel(session: VideoSessionRecord, userId: string): VideoSessionRecord { if (session.userId !== userId) throw new Error("VIDEO_SESSION_FORBIDDEN"); return { ...session, state: "CLEANUP_PENDING" }; }
  expire(session: VideoSessionRecord): VideoSessionRecord { return session.expiresAt.getTime() <= this.now().getTime() && !["DELETED", "CLEANUP_PENDING"].includes(session.state) ? { ...session, state: "CLEANUP_PENDING" } : session; }
}
