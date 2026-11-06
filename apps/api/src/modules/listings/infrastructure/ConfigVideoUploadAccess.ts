import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import type { Env } from "../../../env.schema";
import type { VideoUploadAccessPort } from "../domain/ports/VideoUploadAccessPort";

/** Tester gate from API config only (ADR-0112): switch + upload User-ID list. */
@Injectable()
export class ConfigVideoUploadAccess implements VideoUploadAccessPort {
  private readonly enabled: boolean;
  private readonly testerIds: ReadonlySet<string>;

  constructor(@Inject(ConfigService) config: ConfigService<Env, true>) {
    this.enabled = config.get("LISTING_VIDEO_UPLOADS_ENABLED", { infer: true });
    const raw = config.get("LISTING_VIDEO_UPLOAD_TESTER_USER_IDS", { infer: true });
    this.testerIds = new Set(
      raw.split(",").map((value) => value.trim()).filter((value) => value.length > 0),
    );
  }

  canResumeVideo(userId: string): boolean {
    return this.testerIds.has(userId);
  }

  canUploadVideo(userId: string): boolean {
    return this.enabled && this.testerIds.has(userId);
  }
}
