import type { PreparedVideo, VideoPreparationPort, VideoSelection } from "../../VideoPreparation";

export class FakeVideoPreparation implements VideoPreparationPort {
  readonly files = new Set<string>();
  readonly selections: VideoSelection[] = [];
  hold = false;
  private finish: ((video: PreparedVideo) => void) | undefined;
  output: PreparedVideo = {
    uri: "file:///documents/videos/job-1/prepared.mp4", durationMs: 3000,
    sizeBytes: 100_000, width: 640, height: 360, fps: 30,
    videoCodec: "h264", audioCodec: "aac", colour: "bt709",
  };

  async prepare(selection: VideoSelection): Promise<PreparedVideo> {
    this.selections.push(selection);
    this.files.add(selection.jobId);
    if (this.hold) return new Promise((resolve) => { this.finish = resolve; });
    return this.output;
  }

  complete(): void { this.finish?.(this.output); }
  async cancel(_jobId: string): Promise<void> { /* Late native completion is intentional. */ }
  async discard(jobId: string): Promise<void> { this.files.delete(jobId); }
}
