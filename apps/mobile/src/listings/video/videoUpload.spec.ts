import { describe, expect, it, vi } from "vitest";
import type { VideoUploadsSchemas } from "@auto-tm/contracts";

type OpenVideoUploadResponse = VideoUploadsSchemas.OpenVideoUploadResponse;
type VideoUploadStatusResponse = VideoUploadsSchemas.VideoUploadStatusResponse;
type CancelVideoUploadResponse = VideoUploadsSchemas.CancelVideoUploadResponse;

import { ApiError } from "../../api/client";

import {
  VideoUploadController,
  type VideoUploadApi,
  type VideoUploadFileSystem,
  type VideoUploadTransport,
} from "./videoUpload";
import { InMemoryVideoUploadPersistence } from "./application/testing/InMemoryVideoUploadPersistence";

const TARGET = { type: "draft" as const, id: "draft-1" };
const PART_SIZE = 5 * 1024 * 1024;
const TOTAL = PART_SIZE + 2_000_000;
const URL_EXPIRY = "2030-01-01T00:00:00.000Z";

function openResponse(): OpenVideoUploadResponse {
  return {
    sessionId: "session-1",
    generationId: "generation-1",
    target: TARGET,
    state: "UPLOADING",
    partSizeBytes: PART_SIZE,
    parts: [
      { partNumber: 1, sizeBytes: PART_SIZE, uploadUrl: "https://bucket/1", expiresAt: URL_EXPIRY },
      { partNumber: 2, sizeBytes: 2_000_000, uploadUrl: "https://bucket/2", expiresAt: URL_EXPIRY },
    ],
    expiresAt: "2030-01-07T00:00:00.000Z",
  };
}

function statusResponse(confirmedParts: { partNumber: number; sizeBytes: number }[], state: "UPLOADING" | "PROCESSING" | "CANCELLED" = "UPLOADING"): VideoUploadStatusResponse {
  return {
    ...openResponse(),
    state,
    confirmedParts,
    parts: state === "UPLOADING" ? openResponse().parts.filter((part) => !confirmedParts.some((confirmed) => confirmed.partNumber === part.partNumber)) : [],
  };
}

function cancelResponse(): CancelVideoUploadResponse {
  return { sessionId: "session-1", generationId: "generation-1", state: "CANCELLED" };
}

function harness() {
  const persistence = new InMemoryVideoUploadPersistence();
  const fs: VideoUploadFileSystem = {
    exists: vi.fn(async () => true),
    remove: vi.fn(async () => {}),
  };
  const transport: VideoUploadTransport = { put: vi.fn(async () => {}) };
  const api: VideoUploadApi = {
    open: vi.fn(async () => openResponse()),
    status: vi.fn(async () => statusResponse([])),
    complete: vi.fn(async () => statusResponse([{ partNumber: 1, sizeBytes: PART_SIZE }, { partNumber: 2, sizeBytes: 2_000_000 }], "PROCESSING")),
    cancel: vi.fn(async () => cancelResponse()),
  };
  return { api, fs, transport, persistence };
}

function controller(overrides: Partial<ConstructorParameters<typeof VideoUploadController>[0]> = {}) {
  const deps = harness();
  const instance = new VideoUploadController({
    target: TARGET,
    storageKey: "listing-video:draft-1",
    localUri: "file:///prepared.mp4",
    sizeBytes: TOTAL,
    coverOffsetMs: 1_000,
    api: deps.api,
    fileSystem: deps.fs,
    transport: deps.transport,
    persistence: deps.persistence,
    ...overrides,
  });
  return { instance, ...deps };
}

describe("VideoUploadController", () => {
  it("counts only status-confirmed bytes and resumes the confirmed part after reopening", async () => {
    const first = controller();
    let statusCalls = 0;
    vi.mocked(first.api.status).mockImplementation(async () => {
      statusCalls += 1;
      if (statusCalls === 1) return statusResponse([]);
      if (statusCalls === 2 || statusCalls === 3) return statusResponse([{ partNumber: 1, sizeBytes: PART_SIZE }]);
      return statusResponse([{ partNumber: 1, sizeBytes: PART_SIZE }, { partNumber: 2, sizeBytes: 2_000_000 }]);
    });
    await first.instance.start();

    expect(first.instance.state.confirmedBytes).toBe(TOTAL);
    expect(first.instance.state.phase).toBe("processing");
    expect(first.transport.put).toHaveBeenCalledWith("https://bucket/1", { uri: "file:///prepared.mp4", offset: 0, sizeBytes: PART_SIZE }, expect.any(AbortSignal));
    expect(first.transport.put).toHaveBeenCalledWith("https://bucket/2", { uri: "file:///prepared.mp4", offset: PART_SIZE, sizeBytes: 2_000_000 }, expect.any(AbortSignal));
    expect(first.fs.remove).toHaveBeenCalledWith("file:///prepared.mp4");
    expect(first.api.complete).toHaveBeenCalledOnce();
    await first.instance.start();
    expect(first.api.complete).toHaveBeenCalledOnce();

    const reopened = controller({ persistence: first.persistence });
    await reopened.instance.restore();
    expect(reopened.api.status).not.toHaveBeenCalled();
    expect(reopened.instance.state.phase).toBe("idle");
  });

  it("keeps a manual pause across reopen and continues from the confirmed part", async () => {
    const run = controller();
    await run.instance.openSession();
    await run.instance.pause();
    expect(run.instance.state.phase).toBe("paused");
    expect(run.instance.state.pauseReason).toBe("user");

    vi.mocked(run.api.status).mockResolvedValue(statusResponse([{ partNumber: 1, sizeBytes: PART_SIZE }]));
    await run.instance.checkStatus();
    const paused = controller({ persistence: run.persistence });
    vi.mocked(paused.api.status).mockResolvedValue(statusResponse([{ partNumber: 1, sizeBytes: PART_SIZE }]));
    await paused.instance.restore();
    expect(paused.instance.state.phase).toBe("paused");
    expect(paused.instance.state.pauseReason).toBe("user");
    vi.mocked(paused.api.status)
      .mockResolvedValueOnce(statusResponse([{ partNumber: 1, sizeBytes: PART_SIZE }]))
      .mockResolvedValue(statusResponse([{ partNumber: 1, sizeBytes: PART_SIZE }, { partNumber: 2, sizeBytes: 2_000_000 }], "PROCESSING"));
    await paused.instance.resume();
    expect(paused.instance.state.phase).toBe("processing");
    expect(paused.transport.put).toHaveBeenCalledWith("https://bucket/2", { uri: "file:///prepared.mp4", offset: PART_SIZE, sizeBytes: 2_000_000 }, expect.any(AbortSignal));
  });

  it("waits for a lost connection and auto-continues when it returns", async () => {
    const run = controller();
    const firstStatus = vi.mocked(run.api.status).mockResolvedValue(statusResponse([]));
    await run.instance.openSession();
    run.instance.setNetworkAvailable(false);
    expect(run.instance.state.phase).toBe("paused");
    expect(run.instance.state.pauseReason).toBe("network");
    firstStatus.mockResolvedValue(statusResponse([{ partNumber: 1, sizeBytes: PART_SIZE }, { partNumber: 2, sizeBytes: 2_000_000 }]));
    run.instance.setNetworkAvailable(true);
    await run.instance.waitForIdleForTest();
    expect(run.instance.state.phase).toBe("processing");
  });

  it("reopens the session and finishes when connection returns after opening failed", async () => {
    const run = controller();
    vi.mocked(run.api.open).mockRejectedValueOnce(new Error("network offline"));
    vi.mocked(run.api.status).mockResolvedValue(statusResponse([
      { partNumber: 1, sizeBytes: PART_SIZE },
      { partNumber: 2, sizeBytes: 2_000_000 },
    ], "PROCESSING"));

    await run.instance.start();
    expect(run.instance.state.phase).toBe("paused");
    expect(run.instance.state.pauseReason).toBe("network");
    run.instance.setNetworkAvailable(true);

    await vi.waitFor(() => expect(run.instance.state.phase).toBe("processing"));
    expect(run.instance.state.confirmedBytes).toBe(7_242_880);
  });

  it("continues after a quick pause while the previous status request is still pending", async () => {
    const run = controller();
    const entered = deferred<boolean>();
    const initialStatus = deferred<VideoUploadStatusResponse>();
    vi.mocked(run.api.status)
      .mockImplementationOnce(() => {
        entered.resolve(true);
        return initialStatus.promise;
      })
      .mockResolvedValue(statusResponse([
        { partNumber: 1, sizeBytes: PART_SIZE },
        { partNumber: 2, sizeBytes: 2_000_000 },
      ], "PROCESSING"));

    const running = run.instance.start();
    await entered.promise;
    await run.instance.pause();
    const resumed = run.instance.resume();
    initialStatus.resolve(statusResponse([]));
    await Promise.all([running, resumed]);

    await vi.waitFor(() => expect(run.instance.state.phase).toBe("processing"));
    expect(run.instance.state.confirmedBytes).toBe(7_242_880);
  });

  it.each(["network", "foreground"] as const)("continues after a quick %s return while the prior PUT is pending", async (cause) => {
    const run = controller();
    const part = deferred<undefined>();
    vi.mocked(run.transport.put).mockReturnValueOnce(part.promise);
    vi.mocked(run.api.status).mockResolvedValueOnce(statusResponse([])).mockResolvedValue(statusResponse([], "PROCESSING"));
    const started = run.instance.start();
    await vi.waitFor(() => expect(run.transport.put).toHaveBeenCalled());
    if (cause === "network") { run.instance.setNetworkAvailable(false); run.instance.setNetworkAvailable(true); }
    else { run.instance.setForeground(false); run.instance.setForeground(true); }
    part.resolve(undefined);
    await started;
    await vi.waitFor(() => expect(run.instance.state.phase).toBe("processing"));
  });

  it("renews an expired part URL without uploading a confirmed part again", async () => {
    const run = controller();
    vi.mocked(run.api.status)
      .mockResolvedValueOnce(statusResponse([]))
      .mockResolvedValueOnce({ ...statusResponse([]), parts: [{ partNumber: 1, sizeBytes: PART_SIZE, uploadUrl: "https://bucket/renewed", expiresAt: URL_EXPIRY }, { partNumber: 2, sizeBytes: 2_000_000, uploadUrl: "https://bucket/2-renewed", expiresAt: URL_EXPIRY }] })
      .mockResolvedValueOnce({ ...statusResponse([]), parts: [{ partNumber: 1, sizeBytes: PART_SIZE, uploadUrl: "https://bucket/renewed", expiresAt: URL_EXPIRY }, { partNumber: 2, sizeBytes: 2_000_000, uploadUrl: "https://bucket/2-renewed", expiresAt: URL_EXPIRY }] })
      .mockResolvedValueOnce(statusResponse([{ partNumber: 1, sizeBytes: PART_SIZE }]))
      .mockResolvedValueOnce(statusResponse([{ partNumber: 1, sizeBytes: PART_SIZE }]))
      .mockResolvedValueOnce(statusResponse([{ partNumber: 1, sizeBytes: PART_SIZE }, { partNumber: 2, sizeBytes: 2_000_000 }], "PROCESSING"));
    vi.mocked(run.transport.put)
      .mockRejectedValueOnce(new Error("expired URL"))
      .mockResolvedValue(undefined);

    await run.instance.start();

    expect(run.transport.put).toHaveBeenNthCalledWith(2, "https://bucket/renewed", expect.objectContaining({ offset: 0, sizeBytes: PART_SIZE }), expect.any(AbortSignal));
    expect(run.transport.put).toHaveBeenCalledTimes(3);
    expect(run.instance.state.confirmedBytes).toBe(TOTAL);
  });

  it("sends the cover offset relative to the kept interval", async () => {
    const run = controller();
    run.instance.setPreparedFile({ uri: "file:///prepared.mp4", sizeBytes: TOTAL }, {
      source: { uri: "file:///original.mp4", durationS: 45 }, startS: 20, endS: 35, posterS: 25, coverIndex: 1,
    });
    await run.instance.openSession();
    expect(run.api.open).toHaveBeenCalledWith(expect.objectContaining({ coverOffsetMs: 5_000 }), expect.any(String));
  });

  it("retains Cancel during Open and cancels the idempotent session before deleting the file", async () => {
    const run = controller();
    const pending = deferred<OpenVideoUploadResponse>();
    vi.mocked(run.api.open).mockReturnValue(pending.promise);
    const started = run.instance.start();
    await vi.waitFor(() => expect(run.api.open).toHaveBeenCalled());
    const cancelled = run.instance.cancel();
    expect(run.instance.state.phase).toBe("operation-unknown");
    expect(run.fs.remove).not.toHaveBeenCalled();
    await vi.waitFor(async () => expect(JSON.parse((await run.persistence.get("listing-video:draft-1")) ?? "null")).toMatchObject({ operation: "cancel", idempotencyKey: expect.any(String) }));
    pending.resolve(openResponse());
    await Promise.all([started, cancelled]);
    expect(run.api.cancel).toHaveBeenCalledWith("session-1");
    expect(run.instance.state.phase).toBe("idle");
    expect(run.fs.remove).toHaveBeenCalledWith("file:///prepared.mp4");
  });

  it("keeps removal unknown across reopen when the server reports processing", async () => {
    const run = controller();
    vi.mocked(run.api.cancel).mockRejectedValue(new Error("connection lost"));
    await run.instance.openSession();
    await run.instance.cancel("remove");
    vi.mocked(run.api.status).mockResolvedValue(statusResponse([], "PROCESSING"));
    await run.instance.checkStatus();
    const reopened = controller({ persistence: run.persistence });
    await reopened.instance.restore();
    expect(reopened.instance.state).toMatchObject({ phase: "operation-unknown", operation: "remove" });
    expect(run.fs.remove).not.toHaveBeenCalled();
  });

  it("resumes a restored automatic background pause when already foregrounded", async () => {
    const run = controller();
    await run.instance.openSession();
    run.instance.setForeground(false);
    const reopened = controller({ persistence: run.persistence, isForeground: () => true });
    vi.mocked(reopened.api.status).mockResolvedValue(statusResponse([{ partNumber: 1, sizeBytes: PART_SIZE }, { partNumber: 2, sizeBytes: 2_000_000 }]));
    await reopened.instance.restore();
    await vi.waitFor(() => expect(reopened.instance.state.phase).toBe("processing"));
  });

  it("uses fixed part offsets when confirmed parts are sparse", async () => {
    const run = controller({ sizeBytes: PART_SIZE * 2 + 100 });
    const sparse = { ...statusResponse([{ partNumber: 2, sizeBytes: PART_SIZE }]), parts: [
      { partNumber: 3, sizeBytes: 100, uploadUrl: "https://bucket/3", expiresAt: URL_EXPIRY },
      { partNumber: 1, sizeBytes: PART_SIZE, uploadUrl: "https://bucket/1", expiresAt: URL_EXPIRY },
    ] };
    vi.mocked(run.api.status).mockResolvedValueOnce(sparse).mockResolvedValue(statusResponse([], "PROCESSING"));
    await run.instance.start();
    expect(run.transport.put).toHaveBeenCalledWith("https://bucket/3", { uri: "file:///prepared.mp4", offset: 10_485_760, sizeBytes: 100 }, expect.any(AbortSignal));
  });

  it("reconciles a lost completion response without completing twice", async () => {
    const run = controller();
    const all = [{ partNumber: 1, sizeBytes: PART_SIZE }, { partNumber: 2, sizeBytes: 2_000_000 }];
    const pending = deferred<VideoUploadStatusResponse>();
    vi.mocked(run.api.status).mockResolvedValueOnce(statusResponse(all)).mockResolvedValue(statusResponse(all, "PROCESSING"));
    vi.mocked(run.api.complete).mockImplementationOnce(async () => {
      await pending.promise;
      throw new Error("completion response lost");
    });
    const started = run.instance.start();
    await vi.waitFor(() => expect(run.api.complete).toHaveBeenCalled());
    await run.instance.pause();
    const resumed = run.instance.resume();
    pending.resolve(statusResponse(all, "PROCESSING"));
    await Promise.all([started, resumed]);
    await vi.waitFor(() => expect(run.instance.state.phase).toBe("processing"));
    expect(run.api.complete).toHaveBeenCalledOnce();
  });

  it.each(["status", "complete"] as const)("ignores an actual late %s response after confirmed Cancel", async (request) => {
    const run = controller();
    const pending = deferred<VideoUploadStatusResponse>();
    if (request === "status") vi.mocked(run.api.status).mockReturnValue(pending.promise);
    else {
      vi.mocked(run.api.status).mockResolvedValue(statusResponse([{ partNumber: 1, sizeBytes: PART_SIZE }, { partNumber: 2, sizeBytes: 2_000_000 }]));
      vi.mocked(run.api.complete).mockReturnValue(pending.promise);
    }
    const started = run.instance.start();
    await vi.waitFor(() => expect(run.api[request]).toHaveBeenCalled());
    await run.instance.cancel("remove");
    pending.resolve(statusResponse([], "PROCESSING"));
    await started;
    expect(run.instance.state.phase).toBe("idle");
    expect(await run.persistence.get("listing-video:draft-1")).toBeNull();
  });

  it("interrupts persistent HTTP 500s after bounded renewal and Continue can retry", async () => {
    const run = controller();
    vi.mocked(run.transport.put).mockRejectedValue(new Error("HTTP 500"));
    await run.instance.start();
    expect(run.instance.state).toMatchObject({ phase: "failed", failure: "transfer" });
    expect(run.transport.put).toHaveBeenCalledTimes(3);
    vi.mocked(run.api.status).mockResolvedValue(statusResponse([], "PROCESSING"));
    await run.instance.resume();
    expect(run.instance.state.phase).toBe("processing");
  });

  it("persists Open identity before the request and reuses it after restart", async () => {
    const run = controller();
    const pending = deferred<OpenVideoUploadResponse>();
    vi.mocked(run.api.open).mockReturnValue(pending.promise);
    void run.instance.start();
    await vi.waitFor(() => expect(run.api.open).toHaveBeenCalled());
    const record = JSON.parse((await run.persistence.get("listing-video:draft-1")) ?? "null");
    const reopened = controller({ persistence: run.persistence });
    vi.mocked(reopened.api.status).mockResolvedValue(statusResponse([], "PROCESSING"));
    await reopened.instance.restore();
    expect(reopened.api.open).toHaveBeenCalledWith(expect.anything(), record.idempotencyKey);
    expect(reopened.instance.state.phase).toBe("processing");
    run.instance.dispose();
    pending.resolve(openResponse());
  });

  it("fences a late Cancel response from the next prepared selection", async () => {
    const run = controller();
    const lateCancel = deferred<ReturnType<typeof cancelResponse>>();
    vi.mocked(run.api.cancel).mockReturnValueOnce(lateCancel.promise);
    await run.instance.openSession();
    const cancelling = run.instance.cancel();
    await vi.waitFor(() => expect(run.api.cancel).toHaveBeenCalled());
    vi.mocked(run.api.status).mockResolvedValue(statusResponse([], "CANCELLED"));
    await run.instance.checkStatus();
    run.instance.setPreparedFile({ uri: "file:///next-prepared.mp4", sizeBytes: 100 }, {
      source: { uri: "file:///next-original.mp4", durationS: 15 }, startS: 0, endS: 15, posterS: 2, coverIndex: 0,
    });
    vi.mocked(run.api.open).mockResolvedValueOnce({ ...openResponse(), sessionId: "session-2", generationId: "generation-2" });
    await run.instance.openSession();
    lateCancel.resolve(cancelResponse());
    await cancelling;
    expect(run.instance.state).toMatchObject({ phase: "uploading", sessionId: "session-2", localUri: "file:///next-prepared.mp4" });
    expect(run.fs.remove).not.toHaveBeenCalledWith("file:///next-prepared.mp4");
  });

  it("does not let an unmounted Open overwrite the reopened seller's manual pause", async () => {
    const run = controller();
    const lateOpen = deferred<OpenVideoUploadResponse>();
    vi.mocked(run.api.open).mockReturnValueOnce(lateOpen.promise);
    const oldStart = run.instance.start();
    await vi.waitFor(() => expect(run.api.open).toHaveBeenCalled());
    run.instance.dispose();
    const reopened = controller({ persistence: run.persistence });
    const part = deferred<undefined>();
    vi.mocked(reopened.transport.put).mockReturnValueOnce(part.promise);
    const restoring = reopened.instance.restore();
    await vi.waitFor(() => expect(reopened.transport.put).toHaveBeenCalled());
    await reopened.instance.pause();
    lateOpen.resolve(openResponse());
    await oldStart;
    expect(JSON.parse((await run.persistence.get("listing-video:draft-1")) ?? "null")).toMatchObject({ phase: "paused", pauseReason: "user" });
    part.resolve(undefined);
    await restoring;
  });

  it("reports a missing prepared file before resuming unconfirmed bytes", async () => {
    const run = controller();
    await run.instance.openSession();
    await run.instance.pause();
    vi.mocked(run.fs.exists).mockResolvedValue(false);
    vi.mocked(run.api.status).mockResolvedValue(statusResponse([{ partNumber: 1, sizeBytes: PART_SIZE }]));
    await run.instance.resume();
    expect(run.instance.state).toMatchObject({ phase: "failed", failure: "source" });
    expect(run.transport.put).not.toHaveBeenCalled();
  });

  it("retains an unknown cancellation through delayed completion cleanup", async () => {
    const run = controller();
    const deleting = deferred<undefined>();
    vi.mocked(run.fs.remove).mockReturnValueOnce(deleting.promise);
    vi.mocked(run.api.status).mockResolvedValue(statusResponse([], "PROCESSING"));
    vi.mocked(run.api.cancel).mockRejectedValue(new Error("connection lost"));
    const started = run.instance.start();
    await vi.waitFor(() => expect(run.fs.remove).toHaveBeenCalled());
    await run.instance.cancel();
    deleting.resolve(undefined);
    await started;
    const reopened = controller({ persistence: run.persistence });
    await reopened.instance.restore();
    expect(reopened.instance.state).toMatchObject({ phase: "operation-unknown", operation: "cancel" });
  });

  it("serializes a new cancellation after an in-flight persistence removal", async () => {
    const run = controller();
    const removing = deferred<undefined>();
    const remove = run.persistence.remove.bind(run.persistence);
    vi.spyOn(run.persistence, "remove").mockImplementationOnce(async (key) => { await removing.promise; await remove(key); });
    vi.mocked(run.api.status).mockResolvedValue(statusResponse([], "PROCESSING"));
    vi.mocked(run.api.cancel).mockRejectedValue(new Error("connection lost"));
    const started = run.instance.start();
    await vi.waitFor(() => expect(run.persistence.remove).toHaveBeenCalled());
    const cancelled = run.instance.cancel();
    removing.resolve(undefined);
    await Promise.all([started, cancelled]);
    expect(JSON.parse((await run.persistence.get("listing-video:draft-1")) ?? "null")).toMatchObject({ phase: "operation-unknown", operation: "cancel" });
    expect(run.instance.state.phase).toBe("operation-unknown");
  });

  it("offers transfer recovery after a timeout while connectivity remains online", async () => {
    const run = controller();
    vi.mocked(run.transport.put).mockRejectedValue(new ApiError("NETWORK_ERROR", 0, "Upload timed out"));
    await run.instance.start();
    expect(run.instance.state).toMatchObject({ phase: "failed", failure: "transfer" });
  });

  it("keeps an unknown cancel visible until Check status confirms it", async () => {
    const run = controller();
    vi.mocked(run.api.cancel).mockRejectedValue(new Error("connection lost"));
    await run.instance.openSession();
    await run.instance.cancel("cancel");
    expect(run.instance.state.phase).toBe("operation-unknown");
    expect(run.instance.state.operation).toBe("cancel");
    expect(run.instance.state.confirmedBytes).toBe(0);

    vi.mocked(run.api.status).mockResolvedValue(statusResponse([], "CANCELLED"));
    await run.instance.checkStatus();
    expect(run.instance.state.phase).toBe("idle");
    expect(await run.persistence.get("listing-video:draft-1")).toBeNull();
  });

  it("does not turn an unknown cancel into a failure when status is still uploading", async () => {
    const run = controller();
    vi.mocked(run.api.cancel).mockRejectedValue(new Error("connection lost"));
    await run.instance.openSession();
    await run.instance.cancel("remove");

    vi.mocked(run.api.status).mockResolvedValue(statusResponse([]));
    await run.instance.checkStatus();

    expect(run.instance.state.phase).toBe("operation-unknown");
    expect(run.instance.state.operation).toBe("remove");
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

it("keeps an uploading session and manual pause when publication changes its target", async () => {
  const { instance, persistence, api } = controller({ storageKey: "listing-video:draft:draft-1" });
  await instance.openSession();
  await instance.pause();
  await instance.adopt({ type: "listing", id: "published-1" });
  expect(instance.state).toMatchObject({ target: { type: "listing", id: "published-1" }, phase: "paused", pauseReason: "user", sessionId: "session-1" });
  const reopened = new VideoUploadController({ target: { type: "listing", id: "published-1" }, storageKey: "listing-video:listing:published-1", localUri: "", sizeBytes: 0, coverOffsetMs: 0, persistence, api });
  await reopened.restore();
  expect(reopened.state).toMatchObject({ phase: "paused", pauseReason: "user", sessionId: "session-1", target: { type: "listing", id: "published-1" } });
  instance.dispose(); reopened.dispose();
});


it("keeps the canonical Listing identity when an older Draft status arrives after publish", async () => {
  const run = controller();
  const late = deferred<VideoUploadStatusResponse>();
  await run.instance.openSession();
  vi.mocked(run.api.status).mockReturnValueOnce(late.promise);
  const checking = run.instance.checkStatus();
  const listing = { type: "listing" as const, id: "listing-1" };
  await run.instance.adopt(listing);
  late.resolve(statusResponse([]));
  await checking;
  expect(run.instance.state.target).toEqual(listing);
  vi.mocked(run.api.status).mockResolvedValue({ ...statusResponse([]), target: listing });
  await run.instance.checkStatus();
  expect(run.instance.state.target).toEqual(listing);
});

it("waits for an in-flight Open before local removal and fences its late progress", async () => {
  const run = controller();
  const opening = deferred<OpenVideoUploadResponse>();
  vi.mocked(run.api.open).mockReturnValue(opening.promise);
  const starting = run.instance.start();
  await vi.waitFor(() => expect(run.api.open).toHaveBeenCalled());
  const clearing = run.instance.clear();
  opening.resolve(openResponse());
  await Promise.all([starting, clearing]);
  expect(run.instance.state.phase).toBe("idle");
  expect(run.instance.state.sessionId).toBeUndefined();
  expect(run.api.status).not.toHaveBeenCalled();
  expect(run.transport.put).not.toHaveBeenCalled();
  expect(await run.persistence.get("listing-video:draft-1")).toBeNull();
});


it("recovers a published session's canonical target from status after reopening", async () => {
  const run = controller({ storageKey: "listing-video:draft:draft-1" });
  await run.instance.openSession();
  await run.instance.pause();
  const listing = { type: "listing" as const, id: "listing-1" };
  vi.mocked(run.api.status).mockResolvedValue({ ...statusResponse([]), target: listing });
  await run.instance.checkStatus();
  expect(run.instance.state.target).toEqual(listing);
  expect(await run.persistence.get("listing-video:draft:draft-1")).toBeNull();
  expect(JSON.parse((await run.persistence.get("listing-video:listing:listing-1")) ?? "null").target).toEqual(listing);
});
