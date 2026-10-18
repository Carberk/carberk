export interface VideoCleanupLease {
  id: string;
  uploadId: string;
  sessionId: string;
  generationId: string;
  sourceKey: string;
  objectKeys: string[];
  token: string;
  verifying: boolean;
}
export interface VideoCleanupObjects { removeAndVerify(work: VideoCleanupLease): Promise<void>; }
export interface VideoCleanupLedger {
  claim(now: Date, token: string): Promise<VideoCleanupLease | null>;
  recordAbsence(work: VideoCleanupLease, now: Date): Promise<void>;
  fail(work: VideoCleanupLease, now: Date, reason: string): Promise<void>;
}
