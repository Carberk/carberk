export interface VideoUploadAccessPort {
  canResumeVideo(userId: string): boolean;
  canUploadVideo(userId: string): boolean;
}
