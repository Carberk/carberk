import { randomUUID } from "node:crypto";

import { Queue, Worker } from "bullmq";
import { describe, expect, it } from "vitest";

import { OrphanCleanupProcessor } from "./orphan-cleanup.processor";

const redisUrl = process.env["REDIS_URL"] ?? "";
const FAILURE_WAIT_MS = 10_000;

// Each case owns its Redis prefix; it never consumes or clears production queues.
describe.skipIf(redisUrl === "")("unsupported worker jobs — real Redis", () => {
  it.each([
    ["orphan-cleanup", () => new OrphanCleanupProcessor()],
  ] as const)("%s fails without completing or retrying", async (name, makeProcessor) => {
    const options = {
      connection: { url: redisUrl },
      prefix: `test-unsupported-${randomUUID()}`,
    };
    const queue = new Queue(name, options);
    const processor = makeProcessor();
    let calls = 0;
    const worker = new Worker(name, async () => {
      calls += 1;
      return processor.process();
    }, options);

    // Wait on the worker's own `failed` event, which BullMQ emits in this process after it has moved
    // the job to failed in Redis. The earlier wait used QueueEvents, whose Redis stream consumer
    // reads only entries added after its first XREAD (`$`), and QueueEvents.waitUntilReady()
    // resolves when the connection is ready, before that read is issued. A failure published in
    // that gap is never delivered, which matches CI run 36847567660: the processor logged its error,
    // then the wait reported "no finish notification arrived" 10 s later. This is the cause the
    // BullMQ source supports; it was not reproduced. The listener here is registered before the job
    // exists, so there is no gap to miss.
    const failure = new Promise<Error>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`${name} job was not reported failed by its worker within ${FAILURE_WAIT_MS} ms`)),
        FAILURE_WAIT_MS,
      );
      worker.once("failed", (_job, error) => {
        clearTimeout(timer);
        resolve(error);
      });
    });
    failure.catch(() => undefined); // still delivered to the await below; avoids a stray unhandled rejection

    try {
      await worker.waitUntilReady();
      const job = await queue.add("external-job", { listingMediaId: "test-media" }, {
        attempts: 5,
        removeOnFail: false,
      });

      const error = await failure;
      expect(error.message).toBe(`${name} is not implemented; no work was performed`);
      if (job.id === undefined) throw new Error("Queue did not assign a job ID");
      const stored = await queue.getJob(job.id);
      expect(await stored?.getState()).toBe("failed");
      expect(stored?.attemptsMade).toBe(1);
      expect(stored?.failedReason).toContain("no work was performed");
      expect(await queue.getCompletedCount()).toBe(0);
      expect(await queue.getDelayedCount()).toBe(0);
      expect(calls).toBe(1);
    } finally {
      await worker.close();
      await queue.obliterate({ force: true });
      await queue.close();
    }
  }, 20_000);
});
