import { Injectable, Logger } from "@nestjs/common";

/**
 * Worker measurements for Listing video (#1052). Counts, sizes, durations and
 * fixed failure types only: no storage keys, IDs, paths or FFmpeg output,
 * which can name files and the owner's object prefix.
 */
export type VideoProcessingEvent =
  | {
      event: "processed";
      attempt: number;
      elapsedMs: number;
      durationMs: number;
      tiers: number[];
      sourceBytes: number;
      coverBytes: number;
      renditionBytes: number;
    }
  | {
      event: "processing_failed";
      attempt: number;
      failureType: "SOURCE_MISSING" | "SOURCE_INVALID" | "TRANSIENT";
      retryable: boolean;
      elapsedMs: number;
    };

export interface VideoProcessingTelemetry {
  record(event: VideoProcessingEvent): void;
}

export const VIDEO_PROCESSING_TELEMETRY = Symbol("VideoProcessingTelemetry");

/** One structured line per job, searchable in Railway logs as `listing_video.<event>`. */
@Injectable()
export class LogVideoProcessingTelemetry implements VideoProcessingTelemetry {
  private readonly logger = new Logger("ListingVideoTelemetry");
  record({ event, ...fields }: VideoProcessingEvent): void {
    this.logger.log({ event: `listing_video.${event}`, ...fields });
  }
}
