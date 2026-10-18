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
  sha256: string;
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
  private active: { jobId: string; cancelled: boolean } | undefined;
  constructor(private readonly native: VideoPreparationPort) {}

  async prepare(selection: VideoSelection): Promise<PreparedVideo> {
    const { startMs, endMs, maxBytes, jobId } = selection;
    if (!Number.isSafeInteger(startMs) || !Number.isSafeInteger(endMs) ||
      startMs < 0 || endMs <= startMs || endMs - startMs > 90_000 ||
      !Number.isSafeInteger(maxBytes) || maxBytes <= 0 || !/^[a-zA-Z0-9-]{1,80}$/.test(jobId)) {
      throw new Error("INVALID_SELECTION");
    }
    if (this.active) throw new Error("BUSY");
    const run = { jobId, cancelled: false };
    this.active = run;
    let output: PreparedVideo | undefined;
    try {
      output = await this.native.prepare(selection);
      if (run.cancelled) throw new Error("CANCELLED");
      const { width, height, durationMs, fps, sizeBytes } = output;
      const maximumWidth = width >= height ? 1280 : 720;
      const maximumHeight = width >= height ? 720 : 1280;
      if (![width, height, durationMs, fps, sizeBytes].every((value) => Number.isFinite(value) && value > 0) ||
        width > maximumWidth || height > maximumHeight || fps > 30 || sizeBytes > maxBytes ||
        !/^[a-f0-9]{64}$/.test(output.sha256) || durationMs > 90_000 || Math.abs(durationMs - (endMs - startMs)) > 100 ||
        output.videoCodec !== "h264" || (output.audioCodec !== null && output.audioCodec !== "aac") ||
        output.colour !== "bt709" || output.uri === selection.sourceUri || !output.uri.endsWith("/prepared.mp4")) {
        throw new Error("INVALID_OUTPUT");
      }
      return output;
    } catch (error) {
      if (output) await this.native.discard(jobId);
      throw error;
    } finally {
      if (this.active === run) this.active = undefined;
    }
  }

  async cancel(jobId: string): Promise<void> {
    if (this.active?.jobId === jobId) this.active.cancelled = true;
    await this.native.cancel(jobId);
  }
}
