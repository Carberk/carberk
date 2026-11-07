import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { VideoUploadTarget } from "../domain/VideoUpload";
import { LISTING_VIDEO_READ_PORT, type ListingVideoReadPort } from "../domain/ports/ListingVideoReadPort";
import { VIDEO_UPLOAD_ACCESS_PORT, type VideoUploadAccessPort } from "../domain/ports/VideoUploadAccessPort";

@Injectable()
export class GetTargetVideoStatus {
  constructor(
    @Inject(LISTING_VIDEO_READ_PORT) private readonly videos: ListingVideoReadPort,
    @Inject(VIDEO_UPLOAD_ACCESS_PORT) private readonly access: VideoUploadAccessPort,
  ) {}

  async execute(target: VideoUploadTarget, ownerId: string) {
    const result = this.access.canResumeVideo(ownerId) ? await this.videos.getForTarget(target, ownerId) : null;
    if (!result) throw new NotFoundException({ code: "VIDEO_UPLOAD_NOT_AVAILABLE", message: "Video upload is not available" });
    return result;
  }
}
