import { ForbiddenException, Inject, Injectable } from "@nestjs/common";

import { ConfigService } from "@nestjs/config";
import type { Env } from "../../../env.schema";

/**
 * Video remains a controlled experiment until native preparation, processing,
 * storage and playback evidence is complete. The default is closed even when
 * an operator accidentally omits the rollout flag or tester list.
 */
@Injectable()
export class VideoEligibility {
  constructor(@Inject(ConfigService) private readonly config: ConfigService<Env, true>) {}

  isEligible(userId: string): boolean {
    return this.config.get("VIDEO_ROLLOUT_ENABLED", { infer: true }) === true &&
      this.config.get("VIDEO_TESTER_USER_IDS", { infer: true }).includes(userId);
  }

  assertUploadEligible(userId: string): void {
    this.assertEligible(userId);
    if (!this.config.get("VIDEO_UPLOADS_ENABLED", { infer: true })) {
      throw new ForbiddenException({ code: "VIDEO_UPLOADS_UNAVAILABLE", message: "Listing video uploads are currently unavailable" });
    }
  }

  assertEligible(userId: string): void {
    if (!this.isEligible(userId)) {
      throw new ForbiddenException({
        code: "VIDEO_ROLLOUT_UNAVAILABLE",
        message: "Listing video is currently limited to approved testers",
      });
    }
  }
}
