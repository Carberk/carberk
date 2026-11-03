import { describe, expect, it } from "vitest";

import {
  MAX_VIDEO_DURATION_SECONDS,
  createInitialVideoPrototypeState,
  selectedDurationSeconds,
  videoPrototypeReducer,
} from "../../src/video-prototype/state";
import { createDeterministicLocalVideoAdapter } from "../../src/video-prototype/localAdapter";

function run(...actions: Parameters<typeof videoPrototypeReducer>[1][]) {
  return actions.reduce(videoPrototypeReducer, createInitialVideoPrototypeState());
}

function readyForUpload() {
  return run(
    { type: "open-selection" },
    { type: "select-clip", durationSeconds: 120 },
    { type: "open-trim" },
    { type: "set-trim", startSeconds: 0, endSeconds: MAX_VIDEO_DURATION_SECONDS },
    { type: "continue-to-poster" },
    { type: "begin-preparing" },
    { type: "finish-preparing" },
  );
}

describe("Listing video prototype state machine", () => {
  it("starts with an empty optional video slot and required photos", () => {
    const state = createInitialVideoPrototypeState();

    expect(state.phase).toBe("empty");
    expect(state.photos).toHaveLength(3);
    expect(state.source).toBeNull();
  });

  it("walks from library selection through preview and exposes a 90-second trim limit", () => {
    const preview = run(
      { type: "open-selection" },
      { type: "select-clip", durationSeconds: 120 },
    );
    expect(preview.phase).toBe("preview");
    expect(preview.source?.durationSeconds).toBe(120);

    const trim = videoPrototypeReducer(preview, { type: "open-trim" });
    expect(trim.phase).toBe("trim");
    expect(trim.validationMessage).toBe("Selection exceeds the 90-second maximum.");
    expect(selectedDurationSeconds(trim)).toBe(120);

    const rejected = videoPrototypeReducer(trim, { type: "set-trim", startSeconds: 0, endSeconds: 91 });
    expect(selectedDurationSeconds(rejected)).toBe(91);
    expect(rejected.validationMessage).toBe("Selection exceeds the 90-second maximum.");

    const accepted = videoPrototypeReducer(rejected, { type: "set-trim", startSeconds: 0, endSeconds: 90 });
    expect(selectedDurationSeconds(accepted)).toBe(90);
    expect(accepted.validationMessage).toBeNull();
    expect(videoPrototypeReducer(accepted, { type: "continue-to-poster" }).phase).toBe("poster");
  });

  it("retains the poster inside the selected interval and enters preparing", () => {
    const poster = run(
      { type: "open-selection" },
      { type: "select-clip", durationSeconds: 90 },
      { type: "open-trim" },
      { type: "continue-to-poster" },
      { type: "adjust-poster", deltaSeconds: 10 },
    );

    expect(poster.phase).toBe("poster");
    expect(poster.selection?.posterSeconds).toBe(15);
    expect(videoPrototypeReducer(poster, { type: "begin-preparing" }).phase).toBe("preparing");
  });

  it("moves through preparing, uploading progress, pause, processing and ready", () => {
    let state = readyForUpload();
    expect(state.phase).toBe("uploading");
    expect(state.prepared?.id).toBe("prepared-synthetic-clip-v1");

    state = videoPrototypeReducer(state, { type: "upload-chunk" });
    state = videoPrototypeReducer(state, { type: "pause-upload" });
    expect(state.phase).toBe("paused");
    expect(state.uploadProgress).toBe(25);
    state = videoPrototypeReducer(state, { type: "resume-upload" });
    state = videoPrototypeReducer(state, { type: "upload-chunk" });
    state = videoPrototypeReducer(state, { type: "upload-chunk" });
    state = videoPrototypeReducer(state, { type: "upload-chunk" });
    expect(state.uploadProgress).toBe(100);
    state = videoPrototypeReducer(state, { type: "begin-processing" });
    expect(state.phase).toBe("processing");
    expect(videoPrototypeReducer(state, { type: "finish-processing" }).phase).toBe("ready");
  });

  it("fails and retries without changing trim or poster choices", () => {
    const uploading = readyForUpload();
    const selectionBeforeFailure = uploading.selection;
    const failed = videoPrototypeReducer(uploading, { type: "fail", message: "Synthetic upload interruption" });
    expect(failed.phase).toBe("failed");
    const retried = videoPrototypeReducer(failed, { type: "retry" });
    expect(retried.phase).toBe("uploading");
    expect(retried.selection).toEqual(selectionBeforeFailure);
    expect(retried.prepared?.id).toBe("prepared-synthetic-clip-v1");
  });

  it("keeps photos publishable while optional video is pending", () => {
    const pending = videoPrototypeReducer(readyForUpload(), { type: "continue-with-photos" });

    expect(pending.phase).toBe("optional-video-pending");
    expect(pending.photos).toEqual(["photo-1", "photo-2", "photo-3"]);
    expect(pending.selection?.endSeconds).toBe(90);
    expect(videoPrototypeReducer(pending, { type: "resume-video" }).phase).toBe("uploading");
  });

  it("removes all staged output while preserving photos", () => {
    const state = videoPrototypeReducer(readyForUpload(), { type: "remove-video" });

    expect(state.phase).toBe("empty");
    expect(state.source).toBeNull();
    expect(state.selection).toBeNull();
    expect(state.prepared).toBeNull();
    expect(state.photos).toHaveLength(3);
  });

  it("has no original-source upload operation in the local adapter", () => {
    const adapter = createDeterministicLocalVideoAdapter();
    const state = readyForUpload();
    if (!state.source || !state.selection) throw new Error("expected prepared state");
    const prepared = adapter.prepare(state.source, state.selection);

    expect(prepared.id).toBe("prepared-synthetic-clip-v1");
    expect(adapter.uploadChunk(prepared, 0)).toBe(25);
    expect(() => adapter.uploadChunk({ ...prepared, id: "source" as never }, 0)).toThrow(
      "VIDEO_PROTOTYPE_PREPARED_OUTPUT_REQUIRED",
    );
  });
});
