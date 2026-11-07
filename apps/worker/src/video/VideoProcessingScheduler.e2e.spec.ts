import { randomUUID } from "node:crypto";

import type { PrismaService } from "@auto-tm/db";
import { Queue } from "bullmq";
import { describe, expect, it } from "vitest";

import { VideoProcessingScheduler } from "./VideoProcessingScheduler";

const redisUrl = process.env["REDIS_URL"] ?? "";

describe.skipIf(redisUrl === "")("video processing handoff on real BullMQ", () => {
  it("enqueues a persisted attempt once and keeps a later attempt separate", async () => {
    const generationId = randomUUID();
    const sourceId = randomUUID();
    const row = { id: generationId, sourceId, processingAttempt: 2 };
    const prisma = { videoGeneration: { findMany: async () => [row] } } as unknown as PrismaService;
    const queue = new Queue("video-transcode", { connection: { url: redisUrl }, prefix: `test-video-processing-${randomUUID()}` });
    const scheduler = new VideoProcessingScheduler(prisma, queue);
    try {
      await expect(scheduler.enqueuePending()).resolves.toBe(1);
      await scheduler.enqueuePending();
      expect(await queue.getWaitingCount()).toBe(1);
      expect((await queue.getJob(`${generationId}-2`))?.data).toEqual({ sourceId, generationId, attempt: 2 });
      row.processingAttempt = 3;
      await scheduler.enqueuePending();
      expect(await queue.getWaitingCount()).toBe(2);
      expect((await queue.getJob(`${generationId}-3`))?.data).toEqual({ sourceId, generationId, attempt: 3 });
    } finally {
      await queue.obliterate({ force: true });
      await queue.close();
    }
  });
});
