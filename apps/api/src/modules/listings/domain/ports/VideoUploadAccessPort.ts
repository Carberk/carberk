/** Upload-tester gate (ADR-0112): list + switch + account eligibility decided elsewhere. */
export interface VideoUploadAccessPort {
  canUploadVideo(userId: string): boolean;
  /** Existing sessions keep working when only the new-upload switch is off. */
  canResumeVideo(userId: string): boolean;
}

export const VIDEO_UPLOAD_ACCESS_PORT = Symbol("VideoUploadAccessPort");
