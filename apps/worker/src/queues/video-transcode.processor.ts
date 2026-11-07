import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Inject, Logger, Optional } from "@nestjs/common";
import { UnrecoverableError } from "bullmq";

import { ListingVideoProcessor } from "../video/ListingVideoProcessor";
import type { VideoProcessingJob } from "../video/ListingVideoProcessor";

@Processor("video-transcode", { concurrency: 1 })
export class VideoTranscodeProcessor extends WorkerHost {
  private readonly logger = new Logger(VideoTranscodeProcessor.name);

  constructor(@Optional() @Inject(ListingVideoProcessor) private readonly processor?: ListingVideoProcessor) { super(); }

  async process(job?: { data: VideoProcessingJob }): Promise<void> {
    try {
      if (!this.processor || !job) throw new UnrecoverableError("video-transcode is not implemented; no work was performed");
      await this.processor.process(job.data);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Video processing failed";
      this.logger.error(message);
      if (/unsupported|invalid|duration|codec|color|decode/i.test(message)) throw new UnrecoverableError(message);
      throw error;
    }
  }
}
