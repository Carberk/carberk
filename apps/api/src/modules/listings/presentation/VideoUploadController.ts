import { Controller, Inject } from "@nestjs/common";

import { OWNED_VIDEO_UPLOAD_PROTOCOL, OwnedVideoUploadProtocol } from "../application/OwnedVideoUploadProtocol";
import { VideoEligibility } from "../application/VideoEligibility";

@Controller("api/v1/listing-video-upload-sessions")
export class VideoUploadController {
  constructor(
    @Inject(OWNED_VIDEO_UPLOAD_PROTOCOL) private readonly protocol: OwnedVideoUploadProtocol,
    @Inject(VideoEligibility) private readonly eligibility: VideoEligibility,
  ) {}
}
