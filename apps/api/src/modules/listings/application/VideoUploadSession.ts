import { Inject, Injectable } from "@nestjs/common";
import { IDENTITY_CLOCK_PORT, type ClockPort } from "../../identity/identity.public";

export type VideoSessionState = "UPLOADING" | "PAUSED" | "COMPLETING" | "PROCESSING" | "FAILED" | "CANCELLED" | "CLEANUP_PENDING" | "DELETED";
export interface VideoSessionRecord {
  id: string;
  uploadId: string;
  userId: string;
  listingId?: string;
  sourceKey: string;
  state: VideoSessionState;
  expiresAt: Date;
  claimToken: string;
}

const unfinished = (state: VideoSessionState) => state === "UPLOADING" || state === "PAUSED";

@Injectable()
export class VideoUploadSessionService {
  constructor(@Inject(IDENTITY_CLOCK_PORT) private readonly clock: ClockPort) {}

  canMutate(session: VideoSessionRecord, userId: string): boolean {
    return session.userId === userId && session.expiresAt > this.clock.now() && unfinished(session.state);
  }

  pause(session: VideoSessionRecord, userId: string): VideoSessionRecord {
    if (!this.canMutate(session, userId) || session.state !== "UPLOADING") throw new Error("VIDEO_SESSION_NOT_MUTABLE");
    return { ...session, state: "PAUSED" };
  }

  resume(session: VideoSessionRecord, userId: string): VideoSessionRecord {
    if (!this.canMutate(session, userId) || session.state !== "PAUSED") throw new Error("VIDEO_SESSION_NOT_MUTABLE");
    return { ...session, state: "UPLOADING" };
  }

  cancel(session: VideoSessionRecord, userId: string): VideoSessionRecord {
    if (session.userId !== userId) throw new Error("VIDEO_SESSION_FORBIDDEN");
    if (!unfinished(session.state)) throw new Error("VIDEO_SESSION_NOT_MUTABLE");
    return { ...session, state: "CLEANUP_PENDING" };
  }

  expire(session: VideoSessionRecord): VideoSessionRecord {
    return session.expiresAt <= this.clock.now() && unfinished(session.state)
      ? { ...session, state: "CLEANUP_PENDING" } : session;
  }
}
