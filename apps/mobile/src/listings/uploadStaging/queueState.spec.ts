import { describe, it, expect, vi } from "vitest";

vi.mock("expo-file-system/legacy", () => ({
  documentDirectory: "/mock/documents/",
  getInfoAsync: vi.fn(() => Promise.resolve({ exists: false })),
  makeDirectoryAsync: vi.fn(() => Promise.resolve()),
  readDirectoryAsync: vi.fn(() => Promise.resolve([])),
}));

import {
  computePublishGate,
  reconstructQueueFromDraft,
  updatePhotoState,
  removePhotoFromQueue,
  reorderPhotos,
  isRetryable,
  createStagedPhoto,
  appendPhotoToQueue,
  findPhotoById,
  transitionPhotoToFailed,
  collectPhotosToResume,
  transitionUploadQueueToWaitingForNetwork,
} from "./queueState";
import { getStagingPath } from "./stagingDir";
import type { StagedPhoto, UploadQueue, UploadError } from "./types";

function makeQueue(photos: StagedPhoto[]): UploadQueue {
  return { stagingKey: "draft-1", photos };
}

function makePhoto(overrides: Partial<StagedPhoto> = {}): StagedPhoto {
  return {
    photoId: "p1",
    state: "selected",
    sortOrder: 0,
    retryCount: 0,
    ...overrides,
  };
}

function makeError(code: UploadError["code"], retryable: boolean): UploadError {
  return { code, message: "test error", retryable };
}

describe("computePublishGate", () => {
  it("returns canPublish=false with blocker when queue is empty", () => {
    const result = computePublishGate(makeQueue([]));
    expect(result.canPublish).toBe(false);
    expect(result.blockers).toContain("wizardErrors.photosRequired");
  });

  it("returns canPublish=false when photo is in selected state", () => {
    const result = computePublishGate(
      makeQueue([makePhoto({ state: "selected" })]),
    );
    expect(result.canPublish).toBe(false);
    expect(result.blockers).toContain("wizardErrors.uploadsInProgress");
  });

  it("returns canPublish=false when photo is in failed state", () => {
    const result = computePublishGate(
      makeQueue([makePhoto({ state: "failed" })]),
    );
    expect(result.canPublish).toBe(false);
    expect(result.blockers).toContain("wizardErrors.uploadsFailed");
  });

  it("returns canPublish=true with three keyed attached photos", () => {
    const result = computePublishGate(
      makeQueue([0, 1, 2].map((i) => makePhoto({ photoId: `p${i}`, key: `p${i}.webp`, state: "attached" }))),
    );
    expect(result.canPublish).toBe(true);
    expect(result.blockers).toHaveLength(0);
  });

  it("returns canPublish=false for mixed states with pending", () => {
    const result = computePublishGate(
      makeQueue([
        makePhoto({ photoId: "p1", state: "attached" }),
        makePhoto({ photoId: "p2", state: "selected" }),
      ]),
    );
    expect(result.canPublish).toBe(false);
    expect(result.blockers).toContain("wizardErrors.uploadsInProgress");
  });

  // A photo waiting for the network has no key yet and would be dropped silently
  // from the published Listing, so it still counts as an upload in progress.
  it("blocks publishing while another photo waits for the network", () => {
    const result = computePublishGate(
      makeQueue([
        makePhoto({ photoId: "p1", state: "attached" }),
        makePhoto({ photoId: "p2", state: "waiting_for_network" }),
      ]),
    );
    expect(result.canPublish).toBe(false);
    expect(result.blockers).toContain("wizardErrors.uploadsInProgress");
  });

  // A lost photo can never upload; the seller has to remove it, like a failed one.
  it("blocks publishing while another photo is lost", () => {
    const result = computePublishGate(
      makeQueue([
        makePhoto({ photoId: "p1", state: "attached" }),
        makePhoto({ photoId: "p2", state: "lost" }),
      ]),
    );
    expect(result.canPublish).toBe(false);
    expect(result.blockers).toContain("wizardErrors.uploadsFailed");
  });
});

describe("reconstructQueueFromDraft", () => {
  it("marks photo with key as attached", () => {
    const result = reconstructQueueFromDraft(
      "draft-1",
      { photos: [{ photoId: "p1", key: "k1", sortOrder: 0 }] },
      [],
    );
    expect(result.photos[0]?.state).toBe("attached");
  });

  it("marks photo without key but with local file as compressed", () => {
    const result = reconstructQueueFromDraft(
      "draft-1",
      { photos: [{ photoId: "p1", sortOrder: 0 }] },
      ["p1"],
    );
    expect(result.photos[0]?.state).toBe("compressed");
  });

  it("marks photo without key and no local file as lost", () => {
    const result = reconstructQueueFromDraft(
      "draft-1",
      { photos: [{ photoId: "p1", sortOrder: 0 }] },
      [],
    );
    expect(result.photos[0]?.state).toBe("lost");
  });

  it("brings back a staged file the draft never saved as ready to upload", () => {
    const result = reconstructQueueFromDraft(
      "draft-1",
      { photos: [{ photoId: "p1", key: "k1", sortOrder: 0 }] },
      ["p2"],
    );
    expect(result.photos[1]).toMatchObject({
      photoId: "p2",
      state: "compressed",
      sortOrder: 1,
      localUri: getStagingPath("draft-1", "p2"),
    });
    expect(collectPhotosToResume(result).map((p) => p.photoId)).toEqual(["p2"]);
  });
});

describe("createStagedPhoto", () => {
  it("creates a photo in selected state with given id and sort order", () => {
    const photo = createStagedPhoto("new-id", 5);
    expect(photo.photoId).toBe("new-id");
    expect(photo.state).toBe("selected");
    expect(photo.sortOrder).toBe(5);
    expect(photo.retryCount).toBe(0);
  });
});

describe("appendPhotoToQueue", () => {
  it("appends a photo to the end of the queue", () => {
    const queue = makeQueue([makePhoto({ photoId: "p1" })]);
    const photo = makePhoto({ photoId: "p2" });
    const result = appendPhotoToQueue(queue, photo);
    expect(result.photos).toHaveLength(2);
    expect(result.photos[1]?.photoId).toBe("p2");
  });
});

describe("findPhotoById", () => {
  it("finds an existing photo by id", () => {
    const queue = makeQueue([makePhoto({ photoId: "p1" })]);
    expect(findPhotoById(queue, "p1")?.photoId).toBe("p1");
  });

  it("returns undefined for missing photo", () => {
    const queue = makeQueue([makePhoto({ photoId: "p1" })]);
    expect(findPhotoById(queue, "missing")).toBeUndefined();
  });
});

describe("transitionPhotoToFailed", () => {
  it("transitions photo to failed with error and increments retryCount", () => {
    const queue = makeQueue([makePhoto({ retryCount: 1 })]);
    const error = makeError("NETWORK_ERROR", true);
    const result = transitionPhotoToFailed(queue, "p1", error);
    expect(result.photos[0]?.state).toBe("failed");
    expect(result.photos[0]?.error).toEqual(error);
    expect(result.photos[0]?.retryCount).toBe(2);
  });
});

describe("collectPhotosToResume", () => {
  it("collects compressed photos", () => {
    const queue = makeQueue([makePhoto({ state: "compressed" })]);
    expect(collectPhotosToResume(queue)).toHaveLength(1);
  });

  it("collects waiting_for_network photos", () => {
    const queue = makeQueue([makePhoto({ state: "waiting_for_network" })]);
    expect(collectPhotosToResume(queue)).toHaveLength(1);
  });

  it("collects failed photos with retryable errors under retry cap", () => {
    const queue = makeQueue([
      makePhoto({ state: "failed", retryCount: 1, error: makeError("NETWORK_ERROR", true) }),
    ]);
    expect(collectPhotosToResume(queue)).toHaveLength(1);
  });

  it("skips failed photos with non-retryable errors", () => {
    const queue = makeQueue([
      makePhoto({ state: "failed", retryCount: 0, error: makeError("LOCAL_FILE_MISSING", false) }),
    ]);
    expect(collectPhotosToResume(queue)).toHaveLength(0);
  });

  it("skips failed photos at retry cap", () => {
    const queue = makeQueue([
      makePhoto({ state: "failed", retryCount: 2, error: makeError("NETWORK_ERROR", true) }),
    ]);
    expect(collectPhotosToResume(queue)).toHaveLength(0);
  });
});

describe("transitionUploadQueueToWaitingForNetwork", () => {
  it("moves upload-ready and in-flight photos to waiting_for_network", () => {
    const result = transitionUploadQueueToWaitingForNetwork(
      makeQueue([
        makePhoto({ photoId: "p1", state: "compressed" }),
        makePhoto({ photoId: "p2", state: "presigned" }),
        makePhoto({ photoId: "p3", state: "uploading" }),
        makePhoto({ photoId: "p4", state: "uploaded" }),
        makePhoto({ photoId: "p5", state: "failed" }),
      ]),
    );

    expect(result.photos.map((photo) => photo.state)).toEqual([
      "waiting_for_network",
      "waiting_for_network",
      "waiting_for_network",
      "uploaded",
      "failed",
    ]);
  });
});

describe("updatePhotoState", () => {
  it("updates state and increments retryCount on failed", () => {
    const queue = makeQueue([makePhoto({ retryCount: 1 })]);
    const result = updatePhotoState(queue, "p1", "failed");
    expect(result.photos[0]?.state).toBe("failed");
    expect(result.photos[0]?.retryCount).toBe(2);
  });

  it("does not increment retryCount on non-failed", () => {
    const queue = makeQueue([makePhoto({ retryCount: 1 })]);
    const result = updatePhotoState(queue, "p1", "attached");
    expect(result.photos[0]?.state).toBe("attached");
    expect(result.photos[0]?.retryCount).toBe(1);
  });
});

describe("removePhotoFromQueue", () => {
  it("removes photo and re-sorts remaining", () => {
    const queue = makeQueue([
      makePhoto({ photoId: "p1", sortOrder: 0 }),
      makePhoto({ photoId: "p2", sortOrder: 1 }),
      makePhoto({ photoId: "p3", sortOrder: 2 }),
    ]);
    const result = removePhotoFromQueue(queue, "p2");
    expect(result.photos).toHaveLength(2);
    expect(result.photos[0]?.photoId).toBe("p1");
    expect(result.photos[0]?.sortOrder).toBe(0);
    expect(result.photos[1]?.photoId).toBe("p3");
    expect(result.photos[1]?.sortOrder).toBe(1);
  });
});

describe("reorderPhotos", () => {
  it("reorders by given IDs", () => {
    const queue = makeQueue([
      makePhoto({ photoId: "p1", sortOrder: 0 }),
      makePhoto({ photoId: "p2", sortOrder: 1 }),
      makePhoto({ photoId: "p3", sortOrder: 2 }),
    ]);
    const result = reorderPhotos(queue, ["p3", "p1", "p2"]);
    expect(result.photos[0]?.photoId).toBe("p3");
    expect(result.photos[0]?.sortOrder).toBe(0);
    expect(result.photos[1]?.photoId).toBe("p1");
    expect(result.photos[1]?.sortOrder).toBe(1);
    expect(result.photos[2]?.photoId).toBe("p2");
    expect(result.photos[2]?.sortOrder).toBe(2);
  });
});

describe("isRetryable", () => {
  it("returns true when error is undefined", () => {
    expect(isRetryable(undefined)).toBe(true);
  });

  it("returns true for retryable errors", () => {
    expect(isRetryable(makeError("NETWORK_ERROR", true))).toBe(true);
    expect(isRetryable(makeError("PRESIGN_FAILED", true))).toBe(true);
    expect(isRetryable(makeError("PUT_FAILED", true))).toBe(true);
    expect(isRetryable(makeError("RATE_LIMITED", true))).toBe(true);
  });

  it("returns false for non-retryable errors", () => {
    expect(isRetryable(makeError("LOCAL_FILE_MISSING", false))).toBe(false);
    expect(isRetryable(makeError("COMPRESSION_FAILED", false))).toBe(false);
  });
});
