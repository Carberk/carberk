import type { SyntheticClip } from "./fixtures";

export const MAX_VIDEO_DURATION_SECONDS = 90;
export type EditorPhase = "preview" | "trim" | "poster";
export type JobPhase = "preparing" | "uploading" | "paused" | "processing";
export type PendingPhase = EditorPhase | JobPhase | "failed";
export type VideoSelection = { startSeconds: number; endSeconds: number; posterSeconds: number };
export type PreparedClip = {
  kind: "prepared-descriptor-v1";
  descriptorUtf8: string;
  sizeBytes: number;
  sha256: string;
};
export type PendingVideo = {
  source: SyntheticClip;
  selection: VideoSelection;
  phase: PendingPhase;
  prepared: PreparedClip | null;
  progress: number;
  failedAt: JobPhase | null;
  failure: "preparation" | "upload" | "processing" | null;
};
export type ReadyVideo = { source: SyntheticClip; selection: VideoSelection; prepared: PreparedClip };
export type VideoPrototypeState = {
  view: "video" | "photos";
  libraryOpen: boolean;
  access: "eligible" | "ineligible" | "permission-denied";
  pending: PendingVideo | null;
  active: ReadyVideo | null;
  photos: readonly string[];
  fields: { description: string };
};
export type VideoPrototypeAction =
  | { type: "library"; open: boolean }
  | { type: "access"; value: VideoPrototypeState["access"] }
  | { type: "select"; source: SyntheticClip }
  | { type: "edit"; phase: EditorPhase }
  | { type: "trim"; handle: "start" | "end"; seconds: number }
  | { type: "poster"; seconds: number }
  | { type: "prepare" }
  | { type: "prepared"; output: PreparedClip }
  | { type: "progress"; value: number }
  | { type: "pause" }
  | { type: "resume" }
  | { type: "process" }
  | { type: "ready" }
  | { type: "fail"; stage: JobPhase }
  | { type: "retry" }
  | { type: "view"; value: VideoPrototypeState["view"] }
  | { type: "remove-pending" }
  | { type: "remove-active" }
  | { type: "reset" };

export function createInitialVideoPrototypeState(): VideoPrototypeState {
  return {
    view: "video", libraryOpen: false, access: "eligible", pending: null, active: null,
    photos: ["photo-1", "photo-2", "photo-3"], fields: { description: "Synthetic Listing" },
  };
}

export function selectionError(source: SyntheticClip, selection: VideoSelection): "interval" | "tooLong" | "poster" | null {
  const { startSeconds: start, endSeconds: end, posterSeconds: poster } = selection;
  if (![start, end, poster].every(Number.isFinite) || start < 0 || end <= start || end > source.durationSeconds) return "interval";
  if (end - start > MAX_VIDEO_DURATION_SECONDS) return "tooLong";
  if (poster < start || poster > end) return "poster";
  return null;
}

function boundPoster(selection: VideoSelection): VideoSelection {
  return { ...selection, posterSeconds: Math.max(selection.startSeconds, Math.min(selection.endSeconds, selection.posterSeconds)) };
}

export function videoPrototypeReducer(state: VideoPrototypeState, action: VideoPrototypeAction): VideoPrototypeState {
  const pending = state.pending;
  const update = (change: Partial<PendingVideo>): VideoPrototypeState => pending ? { ...state, pending: { ...pending, ...change } } : state;
  switch (action.type) {
    case "library": return { ...state, libraryOpen: action.open };
    case "access": return { ...state, access: action.value };
    case "select": {
      if (!state.libraryOpen || state.access !== "eligible") return state;
      const endSeconds = Math.min(90, action.source.durationSeconds);
      return { ...state, libraryOpen: false, pending: {
        source: action.source,
        selection: { startSeconds: 0, endSeconds, posterSeconds: Math.min(5, endSeconds) },
        phase: "preview", prepared: null, progress: 0, failedAt: null, failure: null,
      } };
    }
    case "edit": {
      if (!pending || !["preview", "trim", "poster"].includes(pending.phase)) return state;
      if (action.phase === "poster" && selectionError(pending.source, pending.selection)) return state;
      // A long source always visits the trim screen before its poster picker.
      if (action.phase === "poster" && pending.phase === "preview" && pending.source.durationSeconds > 90) return state;
      return update({ phase: action.phase });
    }
    case "trim": {
      if (!pending || pending.phase !== "trim" || !Number.isFinite(action.seconds)) return state;
      const selection = { ...pending.selection };
      if (action.handle === "start") selection.startSeconds = Math.max(0, Math.min(selection.endSeconds - 1, action.seconds));
      else selection.endSeconds = Math.min(pending.source.durationSeconds, Math.max(selection.startSeconds + 1, action.seconds));
      return update({ selection: boundPoster(selection) });
    }
    case "poster":
      return pending && pending.phase === "poster" && Number.isFinite(action.seconds)
        ? update({ selection: boundPoster({ ...pending.selection, posterSeconds: action.seconds }) }) : state;
    case "prepare":
      return pending?.phase === "poster" && !selectionError(pending.source, pending.selection)
        ? update({ phase: "preparing", prepared: null, progress: 0, failure: null, failedAt: null }) : state;
    case "prepared":
      return pending?.phase === "preparing" ? update({ phase: "uploading", prepared: action.output, progress: 0 }) : state;
    case "progress":
      return pending?.phase === "uploading" && pending.prepared && Number.isFinite(action.value) && action.value >= pending.progress && action.value <= 100
        ? update({ progress: action.value }) : state;
    case "pause": return pending?.phase === "uploading" ? update({ phase: "paused" }) : state;
    case "resume": return pending?.phase === "paused" ? update({ phase: "uploading" }) : state;
    case "process": return pending?.phase === "uploading" && pending.progress === 100 ? update({ phase: "processing" }) : state;
    case "ready":
      return pending?.phase === "processing" && pending.prepared
        ? { ...state, pending: null, active: { source: pending.source, selection: pending.selection, prepared: pending.prepared } } : state;
    case "fail":
      return pending && ["preparing", "uploading", "paused", "processing"].includes(pending.phase)
        ? update({ phase: "failed", failedAt: action.stage, failure: action.stage === "preparing" ? "preparation" : action.stage === "processing" ? "processing" : "upload" }) : state;
    case "retry":
      return pending?.phase === "failed" && pending.failedAt
        ? update({ phase: pending.failedAt === "preparing" ? "preparing" : pending.failedAt === "processing" ? "processing" : "uploading", failure: null, failedAt: null }) : state;
    case "view": return { ...state, view: action.value };
    case "remove-pending": return { ...state, pending: null, libraryOpen: false };
    case "remove-active": return { ...state, active: null };
    case "reset": return createInitialVideoPrototypeState();
  }
}
