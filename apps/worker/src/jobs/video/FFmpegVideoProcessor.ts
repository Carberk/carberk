import type { PreparedVideoSource, ProcessedVideo, VideoMediaProcessor } from "./VideoMediaProcessor";
export class FFmpegVideoProcessor implements VideoMediaProcessor {
  async process(_source: PreparedVideoSource): Promise<ProcessedVideo> { throw new Error("VIDEO_PROCESSOR_INACTIVE"); }
}
