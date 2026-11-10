import type { VideoProcessingEvent, VideoProcessingTelemetry } from "../VideoProcessingTelemetry";

export class RecordingVideoProcessingTelemetry implements VideoProcessingTelemetry {
  readonly events: VideoProcessingEvent[] = [];
  record(event: VideoProcessingEvent): void {
    this.events.push(event);
  }
}
