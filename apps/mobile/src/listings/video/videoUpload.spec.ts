import { describe, expect, it, vi } from "vitest";
import type { VideoUploadsSchemas } from "@auto-tm/contracts";

type OpenVideoUploadResponse = VideoUploadsSchemas.OpenVideoUploadResponse;
type VideoUploadStatusResponse = VideoUploadsSchemas.VideoUploadStatusResponse;
type CancelVideoUploadResponse = VideoUploadsSchemas.CancelVideoUploadResponse;

import {
  VideoUploadController,
  type VideoUploadApi,
  type VideoUploadFileSystem,
  type VideoUploadPersistence,
  type VideoUploadTransport,
} from "./videoUpload";

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
  const stored = new Map<string, string>();
  const persistence: VideoUploadPersistence = {
    get: vi.fn(async (key) => stored.get(key) ?? null),
    set: vi.fn(async (key, value) => void stored.set(key, value)),
    remove: vi.fn(async (key) => void stored.delete(key)),
  };
  const fs: VideoUploadFileSystem = {
    exists: vi.fn(async () => true),
    readPart: vi.fn(async (_uri, _offset, size) => new Blob([new Uint8Array(size)])),
    remove: vi.fn(async () => {}),
  };
  const transport: VideoUploadTransport = { put: vi.fn(async () => {}) };
  const api: VideoUploadApi = {
    open: vi.fn(async () => openResponse()),
    status: vi.fn(async () => statusResponse([])),
    complete: vi.fn(async () => statusResponse([], "PROCESSING")),
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
      return statusResponse([{ partNumber: 1, sizeBytes: PART_SIZE }, { partNumber: 2, sizeBytes: 2_000_000 }], "PROCESSING");
    });
    await first.instance.start();

    expect(first.instance.state.confirmedBytes).toBe(TOTAL);
    expect(first.instance.state.phase).toBe("processing");
    expect(first.fs.readPart).toHaveBeenCalledWith("file:///prepared.mp4", 0, PART_SIZE);
    expect(first.fs.readPart).toHaveBeenCalledWith("file:///prepared.mp4", PART_SIZE, 2_000_000);
    expect(first.fs.remove).toHaveBeenCalledWith("file:///prepared.mp4");

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
    expect(paused.fs.readPart).toHaveBeenCalledWith("file:///prepared.mp4", PART_SIZE, 2_000_000);
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

    expect(run.transport.put).toHaveBeenNthCalledWith(2, "https://bucket/renewed", expect.any(Blob));
    expect(run.fs.readPart).toHaveBeenCalledTimes(3);
    expect(run.instance.state.confirmedBytes).toBe(TOTAL);
  });

  it("treats duplicate completion as success and ignores a late response after cancel", async () => {
    const run = controller();
    const late = deferred<VideoUploadStatusResponse>();
    vi.mocked(run.api.status).mockImplementation(async () => late.promise);
    await run.instance.openSession();
    const cancel = run.instance.cancel("remove");
    late.resolve(statusResponse([], "PROCESSING"));
    await cancel;
    expect(run.instance.state.operation).toBeUndefined();
    expect(run.instance.state.phase).toBe("idle");
    expect(run.fs.remove).toHaveBeenCalledWith("file:///prepared.mp4");
  });

  it("keeps an unknown cancel visible until Check status confirms it", async () => {
    const run = controller();
    vi.mocked(run.api.cancel).mockRejectedValueOnce(new Error("connection lost"));
    await run.instance.openSession();
    await run.instance.cancel("cancel");
    expect(run.instance.state.phase).toBe("operation-unknown");
    expect(run.instance.state.operation).toBe("cancel");
    expect(run.instance.state.confirmedBytes).toBe(0);

    vi.mocked(run.api.status).mockResolvedValue(statusResponse([], "CANCELLED"));
    await run.instance.checkStatus();
    expect(run.instance.state.phase).toBe("idle");
    expect(run.persistence.remove).toHaveBeenCalledWith("listing-video:draft-1");
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}
