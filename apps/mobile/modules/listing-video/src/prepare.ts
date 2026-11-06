/**
 * Typed phone-side preparation for one Listing video interval (#1039).
 *
 * The phone decodes only the kept interval and re-encodes it as H.264/AAC
 * at most 30 fps, fitted inside 1280x720 (or 720x1280) without upscaling,
 * HDR normalised to SDR, one file of at most 15 MiB. The native side is
 * AVFoundation on iOS; Android (Media3 Transformer) is proven in #1050.
 */

export const MAX_INTERVAL_S = 90;
export const MIN_INTERVAL_S = 3;
export const MAX_OUTPUT_BYTES = 15 * 1024 * 1024;
export const MAX_FPS = 30;
export const AUDIO_BITRATE = 128_000;
/** Long-side / short-side envelope; orientation follows the source. */
export const ENVELOPE = { long: 1280, short: 720 } as const;

export type ListingVideoErrorCode =
  | "invalid-interval"
  | "invalid-cover"
  | "invalid-source"
  | "source-unreadable"
  | "unsupported-source"
  | "insufficient-storage"
  | "cancelled"
  | "export-failed"
  | "output-too-large"
  | "unsupported-platform";

export class ListingVideoError extends Error {
  readonly code: ListingVideoErrorCode;

  constructor(code: ListingVideoErrorCode, message: string) {
    super(message);
    this.name = "ListingVideoError";
    this.code = code;
  }
}

export interface PreparedVideoFile {
  /** Durable staged file URI (app storage), never the library original. */
  uri: string;
  durationS: number;
  sizeBytes: number;
  width: number;
  height: number;
  fps: number;
  hasAudio: boolean;
}

export interface PrepareProgress {
  /** 0..1 of the kept interval re-encoded so far. */
  fraction: number;
}

export interface PrepareHandle {
  done: Promise<PreparedVideoFile>;
  cancel: () => void;
}

export interface NativePreparedFile {
  uri: string;
  durationS: number;
  sizeBytes: number;
  width: number;
  height: number;
  fps: number;
  hasAudio: boolean;
}

export interface ListingVideoNativeModule {
  prepare(
    sourceUri: string,
    startS: number,
    endS: number,
    coverS: number,
    jobId: string,
  ): Promise<NativePreparedFile>;
  cancel(jobId: string): void;
  addProgressListener(
    listener: (event: { jobId: string; fraction: number }) => void,
  ): { remove: () => void };
}

/** Video bitrate that fits the 15 MiB cap alongside 128 kbps audio. */
export function videoBitrateForDuration(durationS: number): number {
  const budgetBits = MAX_OUTPUT_BYTES * 8 * 0.97;
  const audioBits = AUDIO_BITRATE * durationS;
  const perSecond = Math.floor((budgetBits - audioBits) / durationS);
  return Math.max(400_000, Math.min(1_250_000, perSecond));
}

/** Fit `width`x`height` inside the 720p envelope without upscaling. Even out. */
export function fitWithinEnvelope(
  width: number,
  height: number,
): { width: number; height: number } {
  const long = Math.max(width, height);
  const short = Math.min(width, height);
  const scale = Math.min(
    1,
    ENVELOPE.long / long,
    ENVELOPE.short / short,
  );
  const even = (v: number) => Math.max(2, Math.floor((v * scale) / 2) * 2);
  return width >= height
    ? { width: even(width), height: even(height) }
    : { width: even(width), height: even(height) };
}

export function validateInterval(
  startS: number,
  endS: number,
  coverS: number,
): void {
  if (!Number.isFinite(startS) || !Number.isFinite(endS) || startS < 0 || endS <= startS) {
    throw new ListingVideoError(
      "invalid-interval",
      "The kept part must start at or after 0 and end after it starts.",
    );
  }
  const durationS = endS - startS;
  if (durationS < MIN_INTERVAL_S || durationS > MAX_INTERVAL_S) {
    throw new ListingVideoError(
      "invalid-interval",
      `The kept part must be between ${MIN_INTERVAL_S} and ${MAX_INTERVAL_S} seconds.`,
    );
  }
  if (!Number.isFinite(coverS) || coverS < startS || coverS > endS) {
    throw new ListingVideoError(
      "invalid-cover",
      "The cover moment must sit inside the kept part.",
    );
  }
}

let jobCounter = 0;

export function prepareListingVideo(
  native: ListingVideoNativeModule | null,
  source: string,
  startS: number,
  endS: number,
  coverS: number,
  onProgress?: (progress: PrepareProgress) => void,
): PrepareHandle {
  let cancelImpl: () => void = () => undefined;
  const done = (async (): Promise<PreparedVideoFile> => {
    if (!source || typeof source !== "string") {
      throw new ListingVideoError("invalid-source", "No source video was given.");
    }
    validateInterval(startS, endS, coverS);
    if (!native) {
      throw new ListingVideoError(
        "unsupported-platform",
        "Video preparation is not available on this platform yet.",
      );
    }
    const jobId = `lv-${++jobCounter}`;
    let cancelled = false;
    cancelImpl = () => {
      cancelled = true;
      native.cancel(jobId);
    };
    const sub = onProgress
      ? native.addProgressListener((event) => {
          if (event.jobId === jobId) onProgress({ fraction: event.fraction });
        })
      : null;
    try {
      const file = await native.prepare(source, startS, endS, coverS, jobId);
      if (cancelled) {
        throw new ListingVideoError("cancelled", "Preparation was cancelled.");
      }
      if (file.sizeBytes > MAX_OUTPUT_BYTES) {
        throw new ListingVideoError(
          "output-too-large",
          "The prepared video is larger than 15 MiB.",
        );
      }
      return file;
    } catch (error) {
      if (error instanceof ListingVideoError) throw error;
      throw mapNativeError(error, cancelled);
    } finally {
      sub?.remove();
    }
  })();
  return { done, cancel: () => cancelImpl() };
}

function mapNativeError(error: unknown, cancelled: boolean): ListingVideoError {
  if (cancelled) {
    return new ListingVideoError("cancelled", "Preparation was cancelled.");
  }
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code: unknown }).code)
      : "";
  const known: ListingVideoErrorCode[] = [
    "invalid-source",
    "source-unreadable",
    "unsupported-source",
    "insufficient-storage",
    "cancelled",
    "output-too-large",
  ];
  if ((known as string[]).includes(code)) {
    return new ListingVideoError(
      code as ListingVideoErrorCode,
      error instanceof Error ? error.message : code,
    );
  }
  return new ListingVideoError(
    "export-failed",
    error instanceof Error ? error.message : "Video preparation failed.",
  );
}
