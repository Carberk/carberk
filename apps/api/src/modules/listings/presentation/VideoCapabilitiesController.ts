import { Controller, Get, Header, UseFilters } from "@nestjs/common";

import { VideoUploadErrorFilter } from "./VideoUploadErrorFilter";

@UseFilters(VideoUploadErrorFilter)
@Controller("api/v1/listing-video")
export class VideoCapabilitiesController {
  @Get("capabilities")
  @Header("Cache-Control", "private, no-store")
  capabilities() { return { canUpload: false, canView: false }; }
}
