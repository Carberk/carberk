import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import type { Env } from "../env.schema";

/** Independent tester lists; the upload switch never revokes existing work. */
@Injectable()
export class ConfigListingVideoAccess {
  constructor(@Inject(ConfigService) private readonly config: ConfigService<Env, true>) {}

  canResumeVideo(userId: string): boolean {
    return this.includes("LISTING_VIDEO_UPLOAD_TESTER_USER_IDS", userId);
  }

  canUploadVideo(userId: string): boolean {
    return this.canResumeVideo(userId) && (this.config.get("LISTING_VIDEO_UPLOADS_ENABLED", { infer: true }) ?? false);
  }

  canViewVideo(userId: string): boolean {
    return this.includes("LISTING_VIDEO_VIEW_TESTER_USER_IDS", userId);
  }

  private includes(key: "LISTING_VIDEO_UPLOAD_TESTER_USER_IDS" | "LISTING_VIDEO_VIEW_TESTER_USER_IDS", userId: string): boolean {
    return (this.config.get(key, { infer: true }) ?? "").split(",").some((value) => value.trim() === userId && userId.length > 0);
  }
}
