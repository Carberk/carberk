export const MAX_VIDEO_DURATION_SECONDS = 90;
export const SYNTHETIC_CLIP_SHA256 =
  "sha256:listing-video-prototype-synthetic-clip-v1";

export const DEFAULT_PHOTOS = ["photo-1", "photo-2", "photo-3"] as const;

export type PrototypePhase =
  | "empty"
  | "selection"
  | "preview"
  | "trim"
  | "poster"
  | "preparing"
  | "uploading"
  | "paused"
  | "processing"
  | "failed"
  | "ready"
  | "optional-video-pending";

export type SyntheticClip = {
  id: "synthetic-45s" | "synthetic-90s" | "synthetic-120s";
  durationSeconds: number;
  sha256: string;
};

export type VideoSelection = {
  startSeconds: number;
  endSeconds: number;
  posterSeconds: number;
};

export type PreparedClip = {
  id: "prepared-synthetic-clip-v1";
  sizeBytes: number;
  sha256: string;
};

export type VideoPrototypeState = {
  phase: PrototypePhase;
  photos: readonly string[];
  source: SyntheticClip | null;
  selection: VideoSelection | null;
  prepared: PreparedClip | null;
  uploadProgress: number;
  failureMessage: string | null;
  failedFrom: Exclude<PrototypePhase, "empty" | "selection" | "preview" | "trim" | "poster" | "failed" | "ready" | "optional-video-pending"> | null;
  validationMessage: string | null;
};

export type VideoPrototypeAction =
  | { type: "open-selection" }
  | { type: "select-clip"; durationSeconds: 45 | 90 | 120 }
  | { type: "open-trim" }
  | { type: "adjust-trim"; handle: "start" | "end"; deltaSeconds: number }
  | { type: "set-trim"; startSeconds: number; endSeconds: number }
  | { type: "continue-to-poster" }
  | { type: "adjust-poster"; deltaSeconds: number }
  | { type: "begin-preparing" }
  | { type: "finish-preparing" }
  | { type: "upload-chunk" }
  | { type: "pause-upload" }
  | { type: "resume-upload" }
  | { type: "begin-processing" }
  | { type: "finish-processing" }
  | { type: "fail"; message: string }
  | { type: "retry" }
  | { type: "continue-with-photos" }
  | { type: "resume-video" }
  | { type: "remove-video" }
  | { type: "reset" };

export function createInitialVideoPrototypeState(
  photos: readonly string[] = DEFAULT_PHOTOS,
): VideoPrototypeState {
  return {
    phase: "empty",
    photos,
    source: null,
    selection: null,
    prepared: null,
    uploadProgress: 0,
    failureMessage: null,
    failedFrom: null,
    validationMessage: null,
  };
}

function sourceForDuration(durationSeconds: 45 | 90 | 120): SyntheticClip {
  return {
    id:
      durationSeconds === 45
        ? "synthetic-45s"
        : durationSeconds === 90
          ? "synthetic-90s"
          : "synthetic-120s",
    durationSeconds,
    sha256: SYNTHETIC_CLIP_SHA256,
  };
}

function withValidation(
  state: VideoPrototypeState,
  message: string | null,
): VideoPrototypeState {
  return { ...state, validationMessage: message };
}

function isValidSelection(selection: VideoSelection | null): boolean {
  return (
    selection !== null &&
    selection.startSeconds >= 0 &&
    selection.endSeconds > selection.startSeconds &&
    selection.endSeconds - selection.startSeconds <= MAX_VIDEO_DURATION_SECONDS
  );
}

function selectionError(selection: VideoSelection): string | null {
  if (selection.endSeconds <= selection.startSeconds) {
    return "The end handle must be after the start handle.";
  }
  if (selection.endSeconds - selection.startSeconds > MAX_VIDEO_DURATION_SECONDS) {
    return "Selection exceeds the 90-second maximum.";
  }
  return null;
}

function clearVideo(state: VideoPrototypeState, phase: "empty" | "optional-video-pending") {
  return {
    ...state,
    phase,
    source: null,
    selection: null,
    prepared: null,
    uploadProgress: 0,
    failureMessage: null,
    failedFrom: null,
    validationMessage: null,
  } satisfies VideoPrototypeState;
}

export function videoPrototypeReducer(
  state: VideoPrototypeState,
  action: VideoPrototypeAction,
): VideoPrototypeState {
  switch (action.type) {
    case "open-selection":
      return ["empty", "optional-video-pending", "preview", "trim", "poster", "failed", "ready"].includes(state.phase)
        ? { ...state, phase: "selection", validationMessage: null }
        : state;

    case "select-clip": {
      if (state.phase !== "selection") return state;
      const source = sourceForDuration(action.durationSeconds);
      return {
        ...state,
        phase: "preview",
        source,
        selection: {
          startSeconds: 0,
          endSeconds: source.durationSeconds,
          posterSeconds: Math.min(5, source.durationSeconds),
        },
        prepared: null,
        uploadProgress: 0,
        failureMessage: null,
        failedFrom: null,
        validationMessage: null,
      };
    }

    case "open-trim":
      return state.phase === "preview" && state.selection
        ? { ...state, phase: "trim", validationMessage: selectionError(state.selection) }
        : state;

    case "adjust-trim": {
      if ((state.phase !== "trim" && state.phase !== "preview") || !state.source || !state.selection) {
        return state;
      }
      const selection = { ...state.selection };
      if (action.handle === "start") {
        selection.startSeconds = Math.max(
          0,
          Math.min(selection.endSeconds - 1, selection.startSeconds + action.deltaSeconds),
        );
      } else {
        selection.endSeconds = Math.max(
          selection.startSeconds + 1,
          Math.min(state.source.durationSeconds, selection.endSeconds + action.deltaSeconds),
        );
      }
      return withValidation({ ...state, phase: "trim", selection }, selectionError(selection));
    }

    case "set-trim": {
      if (!state.source || !state.selection || (state.phase !== "trim" && state.phase !== "preview")) {
        return state;
      }
      const selection = {
        ...state.selection,
        startSeconds: Math.max(0, Math.min(action.startSeconds, state.source.durationSeconds - 1)),
        endSeconds: Math.max(1, Math.min(action.endSeconds, state.source.durationSeconds)),
      };
      return withValidation({ ...state, phase: "trim", selection }, selectionError(selection));
    }

    case "continue-to-poster":
      if (!state.selection || !isValidSelection(state.selection)) {
        return withValidation(
          { ...state, phase: "trim" },
          state.selection ? selectionError(state.selection) : "Choose a video interval first.",
        );
      }
      return { ...state, phase: "poster", validationMessage: null };

    case "adjust-poster": {
      if (!state.selection) return state;
      const next = Math.max(
        state.selection.startSeconds,
        Math.min(state.selection.endSeconds, state.selection.posterSeconds + action.deltaSeconds),
      );
      return {
        ...state,
        selection: { ...state.selection, posterSeconds: next },
        validationMessage: null,
      };
    }

    case "begin-preparing":
      if (state.phase !== "poster" || !isValidSelection(state.selection)) {
        return withValidation(state, "Choose a valid interval before preparing.");
      }
      return {
        ...state,
        phase: "preparing",
        prepared: null,
        uploadProgress: 0,
        failureMessage: null,
        failedFrom: null,
        validationMessage: null,
      };

    case "finish-preparing":
      if (state.phase !== "preparing" || !state.source || !state.selection) return state;
      return {
        ...state,
        phase: "uploading",
        prepared: {
          id: "prepared-synthetic-clip-v1",
          sizeBytes: 8_400_000,
          sha256: "sha256:prepared-synthetic-clip-v1",
        },
        uploadProgress: 0,
        validationMessage: null,
      };

    case "upload-chunk":
      if (state.phase !== "uploading" || !state.prepared) return state;
      return { ...state, uploadProgress: Math.min(100, state.uploadProgress + 25), validationMessage: null };

    case "pause-upload":
      return state.phase === "uploading" ? { ...state, phase: "paused" } : state;

    case "resume-upload":
      return state.phase === "paused" && state.prepared
        ? { ...state, phase: "uploading", validationMessage: null }
        : state;

    case "begin-processing":
      return state.phase === "uploading" && state.uploadProgress === 100 && state.prepared
        ? { ...state, phase: "processing", validationMessage: null }
        : state;

    case "finish-processing":
      return state.phase === "processing" ? { ...state, phase: "ready", validationMessage: null } : state;

    case "fail":
      if (
        state.phase !== "preparing" &&
        state.phase !== "uploading" &&
        state.phase !== "paused" &&
        state.phase !== "processing"
      ) {
        return state;
      }
      return {
        ...state,
        phase: "failed",
        failureMessage: action.message,
        failedFrom: state.phase,
      };

    case "retry":
      if (state.phase !== "failed" || !state.failedFrom) return state;
      return {
        ...state,
        phase: state.prepared ? "uploading" : "preparing",
        uploadProgress: state.prepared ? state.uploadProgress : 0,
        failureMessage: null,
        failedFrom: null,
        validationMessage: null,
      };

    case "continue-with-photos":
      if (state.phase === "empty" || state.phase === "optional-video-pending") return state;
      return { ...state, phase: "optional-video-pending", validationMessage: null };

    case "resume-video":
      if (state.phase !== "optional-video-pending") return state;
      return {
        ...state,
        phase: state.prepared ? "uploading" : state.source ? "preparing" : "selection",
        validationMessage: null,
      };

    case "remove-video":
      return clearVideo(state, "empty");

    case "reset":
      return createInitialVideoPrototypeState(state.photos);

    default:
      return state;
  }
}

export function selectedDurationSeconds(state: VideoPrototypeState): number | null {
  if (!state.selection) return null;
  return state.selection.endSeconds - state.selection.startSeconds;
}
