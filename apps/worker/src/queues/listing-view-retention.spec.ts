import "reflect-metadata";

import { Logger } from "@nestjs/common";
import type { Queue } from "bullmq";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ExpireListingViewFingerprints } from "../jobs/ExpireListingViewFingerprints";
import { FakeListingViewRetentionLedger } from "../jobs/application/testing/FakeListingViewRetentionLedger";

import { AccountPurgeScheduler } from "./account-purge.scheduler";
import { RetiredUploadCleanupScheduler } from "./retired-upload-cleanup.scheduler";
import { FakeListingViewRetentionQueue } from "./application/testing/FakeListingViewRetentionQueue";
import { ListingViewRetentionProcessor } from "./listing-view-retention.processor";
import { ListingViewRetentionScheduler } from "./listing-view-retention.scheduler";

// Time and Logger are external boundaries. The scheduler, sweep and processor are real.
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); vi.unstubAllEnvs(); });

describe("Listing view retention worker composition", () => {
  it("coalesces replicas into one minute scheduler and one immediate startup catch-up with bounded retries", async () => {
    const queue = new FakeListingViewRetentionQueue();
    await new ListingViewRetentionScheduler(queue as unknown as Queue).onModuleInit();
    await new ListingViewRetentionScheduler(queue as unknown as Queue).onModuleInit();
    expect([...queue.schedules.keys()]).toEqual(["listing-view-retention-minute"]);
    expect(queue.schedules.get("listing-view-retention-minute")).toEqual({ repeat: { every: 60_000 }, name: "sweep", data: {},
      opts: { attempts: 3, backoff: { type: "exponential", delay: 1000 }, removeOnComplete: 10, removeOnFail: 100 } });
    expect([...queue.startup.values()]).toEqual([{ name: "sweep", data: {}, opts: {
      attempts: 3, backoff: { type: "exponential", delay: 1000 }, removeOnComplete: true,
      removeOnFail: true, jobId: "listing-view-retention-catch-up" } }]);
  });

  it("actually wires the new processor without removing upload cleanup or account purge", async () => {
    for (const [name, value] of Object.entries({ DATABASE_URL: "postgresql://unused:unused@127.0.0.1:1/unused", REDIS_URL: "redis://127.0.0.1:1",
      MINIO_ENDPOINT: "http://127.0.0.1:1", MINIO_ACCESS_KEY: "unused", MINIO_SECRET_KEY: "unused", PUSH_TRANSPORT: "test", EMAIL_DRIVER: "mock" })) vi.stubEnv(name, value);
    const { AppModule } = await import("../app.module");
    const providers = Reflect.getMetadata("providers", AppModule) as unknown[];
    expect(providers).toContain(ListingViewRetentionScheduler);
    expect(providers).toContain(ListingViewRetentionProcessor);
    expect(providers).toContain(RetiredUploadCleanupScheduler);
    expect(providers).toContain(AccountPurgeScheduler);
    expect(providers).toContainEqual(expect.objectContaining({ provide: ExpireListingViewFingerprints }));
  });

  it("processes due work and exposes aggregate health; an outage is retryable without exposing storage errors", async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-14T19:00:00.000Z"));
    const logs: string[] = [];
    vi.spyOn(Logger.prototype, "log").mockImplementation((value) => { logs.push(String(value)); });
    vi.spyOn(Logger.prototype, "error").mockImplementation((value) => { logs.push(String(value)); });
    const ledger = new FakeListingViewRetentionLedger();
    ledger.expiresAt.push(new Date("2026-10-14T18:59:00.000Z"), new Date("2026-10-15T18:55:00.000Z"));
    const processor = new ListingViewRetentionProcessor(new ExpireListingViewFingerprints(ledger));
    await processor.process();
    expect(ledger.expiresAt).toEqual([new Date("2026-10-15T18:55:00.000Z")]);
    expect(logs[0]).toContain('"deleted":1');
    expect(logs[0]).toContain('"lastSuccessAt":"2026-10-14T19:00:00.000Z"');
    ledger.failing = true;
    await expect(processor.process()).rejects.toThrow("Listing view retention unavailable");
    expect(logs.join(" ")).not.toContain("private-row-secret");
    expect(logs.at(-1)).toContain('"healthy":false');
    expect(logs.at(-1)).toContain('"lastSuccessAt":"2026-10-14T19:00:00.000Z"');
    ledger.failing = false;
    await processor.process();
    expect(logs.at(-1)).toContain('"healthy":true');
  });
});
