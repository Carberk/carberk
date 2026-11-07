import { describe, expect, it, vi } from "vitest";

import { VideoProcessingScheduler } from "./VideoProcessingScheduler";

describe("VideoProcessingScheduler", () => {
  it("only enqueues due durable processing attempts with their persisted fence", async () => {
    const now = new Date("2026-11-07T00:00:00.000Z");
    vi.setSystemTime(now);
    const rows = [
      { id: "generation-ready", sourceId: "source-ready", processingAttempt: 2, status: "Processing", nextRetryAt: new Date("2026-11-06T23:59:00.000Z"), source: {} },
      { id: "generation-new", sourceId: "source-new", processingAttempt: 1, status: "Processing", nextRetryAt: null, source: {} },
    ];
    const findMany = vi.fn().mockResolvedValue(rows);
    const add = vi.fn().mockResolvedValue(undefined);
    const scheduler = new VideoProcessingScheduler({ videoGeneration: { findMany } } as never, { add } as never);
    await expect(scheduler.enqueuePending()).resolves.toBe(2);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { status: "Processing", OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }] } }));
    expect(add).toHaveBeenNthCalledWith(1, "process", { sourceId: "source-ready", generationId: "generation-ready", attempt: 2 }, expect.objectContaining({ jobId: "generation-ready:2", attempts: 1 }));
    vi.useRealTimers();
  });
});
