import { randomUUID } from "node:crypto";

import { Queue, Worker } from "bullmq";
import { describe, expect, it, vi } from "vitest";

import { ExpireListingViewFingerprints } from "../jobs/ExpireListingViewFingerprints";
import { FakeListingViewRetentionLedger } from "../jobs/application/testing/FakeListingViewRetentionLedger";

import { ListingViewRetentionProcessor } from "./listing-view-retention.processor";
import { ListingViewRetentionScheduler } from "./listing-view-retention.scheduler";

const redisUrl = process.env["REDIS_URL"] ?? "";
const hosted = process.env["GITHUB_ACTIONS"] === "true" && /^redis:\/\/(localhost|127\.0\.0\.1):\d+/.test(redisUrl);

describe.skipIf(!hosted)("Listing retention actual Redis trigger/retry (#899)", () => {
  it("registers one shared minute trigger and retries sanitized failures until startup catch-up deletes due work", async () => {
    const connection = { url: redisUrl };
    const name = `listing-retention-test-${randomUUID()}`;
    const queue = new Queue(name, { connection });
    const ledger = new FakeListingViewRetentionLedger();
    ledger.expiresAt.push(new Date("2000-01-01T00:00:00.000Z")); ledger.failing = true;
    const processor = new ListingViewRetentionProcessor(new ExpireListingViewFingerprints(ledger));
    const worker = new Worker(name, () => processor.process(), { connection });
    try {
      await worker.waitUntilReady();
      await Promise.all([new ListingViewRetentionScheduler(queue).onModuleInit(), new ListingViewRetentionScheduler(queue).onModuleInit()]);
      const schedules = await queue.getJobSchedulers();
      expect(schedules.map((schedule) => schedule.key)).toEqual(["listing-view-retention-minute"]);
      await vi.waitFor(async () => {
        const failedOrRetried = await queue.getJobs(["delayed", "failed"]);
        expect(failedOrRetried.some((job) => job.attemptsMade >= 1 && job.failedReason === "Listing view retention unavailable")).toBe(true);
      }, { timeout: 5000 });
      ledger.failing = false;
      await vi.waitFor(() => expect(ledger.expiresAt).toEqual([]), { timeout: 8000 });
      const jobs = await queue.getJobs(["completed", "failed", "delayed", "wait", "active"]);
      expect(jobs.every((job) => JSON.stringify(job.data) === "{}")).toBe(true);
      expect(jobs.some((job) => job.failedReason?.includes("private-row-secret"))).toBe(false);
    } finally {
      await worker.close();
      await queue.obliterate({ force: true });
      await queue.close();
    }
  }, 20_000);
});
