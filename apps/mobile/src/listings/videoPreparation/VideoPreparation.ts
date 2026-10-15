export interface VideoSelection {
  jobId: string;
  sourceUri: string;
  startMs: number;
  endMs: number;
  maxBytes: number;
}

export interface PreparedVideo {
  uri: string;
  durationMs: number;
  sizeBytes: number;
  width: number;
  height: number;
  fps: number;
  videoCodec: string;
  audioCodec: string | null;
  colour: string;
}

export interface VideoPreparationPort {
  prepare(selection: VideoSelection): Promise<PreparedVideo>;
  cancel(jobId: string): Promise<void>;
  discard(jobId: string): Promise<void>;
}

/** Owns safe handoff from a native export to a future uploader. */
export class VideoPreparation {
  constructor(private readonly native: VideoPreparationPort) {}

  prepare(selection: VideoSelection): Promise<PreparedVideo> {
    return this.native.prepare(selection);
  }

  cancel(jobId: string): Promise<void> {
    return this.native.cancel(jobId);
  }
}
