import { ForbiddenException, Injectable } from "@nestjs/common";

/**
 * Video remains a controlled experiment until native preparation, processing,
 * storage and playback evidence is complete. The default is closed even when
 * an operator accidentally omits the rollout flag or tester list.
 */
@Injectable()
export class VideoEligibility {
  isEligible(userId: string): boolean {
    if (process.env["VIDEO_ROLLOUT_ENABLED"] !== "true") return false;
    const ids = (process.env["VIDEO_TESTER_USER_IDS"] ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    return ids.includes(userId);
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
