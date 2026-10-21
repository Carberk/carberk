import { GetBucketVersioningCommand } from "@aws-sdk/client-s3";
import { describe, expect, it } from "vitest";

import { ExpireServiceContent } from "./ExpireServiceContent";
import { S3RetiredObjectStore } from "./S3RetiredObjectStore";

const namespace = `cf_${"a".repeat(32)}`, candidate = "b".repeat(40), now = new Date("2027-01-19T00:00:00Z");
/** External database boundary: a restarted worker sees only a pending empty fence.
 * SQL authority outcomes are supplied by the database, never by a mocked resolver. */
function pendingDatabase(options: { admitted?: boolean; requiredCandidate?: string; disappeared?: boolean } = {}) {
 const fence = { conversationId: "conversation", epoch: 1, objectKeys: [], erasedAt: now, cleanupCompletedAt: null as Date | null };
 const db = {
  supportCase: { findMany: async () => [] },
  serviceAttachment: { findMany: async () => [] },
  historyArtifactCleanup: { findMany: async () => [] },
  serviceErasureFence: {
   findMany: async () => fence.cleanupCompletedAt ? [] : [{ ...fence }],
   findUnique: async () => options.disappeared ? null : { ...fence },
   updateMany: async () => { fence.cleanupCompletedAt = now; return { count: 1 }; },
  },
  $queryRaw: async (parts: TemplateStringsArray) => {
   const sql = parts.join("?");
   if (sql.includes("pg_namespace")) return [{ name: namespace }];
   // Customer and assignee linkage has already been erased. The journal still claims the fence.
   return [];
  },
  $executeRawUnsafe: async () => 0,
  $queryRawUnsafe: async (sql: string, ...values: unknown[]) => {
   if (sql.includes("campaign_records")) return [{ present: true }];
   if (sql.includes("campaign_support_lifecycle_authority")) {
    if (options.requiredCandidate && values[2] !== options.requiredCandidate) throw new Error("Campaign lifecycle candidate refused");
    return [{ admitted: options.admitted ?? true }];
   }
   throw new Error("Unexpected database query");
  },
  $transaction: async <T>(work: (tx: unknown) => Promise<T>) => work(db),
 };
 return { db, fence };
}
function storage(versioned = false) {
 const requests: unknown[] = [];
 const s3 = { send: async (request: unknown) => {
  requests.push(request);
  if (!(request instanceof GetBucketVersioningCommand)) throw new Error("Empty text manifest must not delete private bytes");
  return versioned ? { Status: "Enabled" } : {};
 } };
 return { requests, store: new S3RetiredObjectStore(s3 as never, "service-private") };
}
describe("restarted text Support cleanup through the real worker", () => {
 it("checks the real private bucket before completing the exact empty fence and leaves retries neutral", async () => {
  const { db, fence } = pendingDatabase(), { requests, store } = storage();
  const worker = new ExpireServiceContent(db as never, store, candidate);
  expect(await worker.execute(now)).toEqual({ supportPurged: 0, attachmentsRetired: 0, cleanupsCompleted: 1 });
  expect(fence.cleanupCompletedAt).toEqual(now);
  expect(requests).toHaveLength(1);
  expect((requests[0] as GetBucketVersioningCommand).input.Bucket).toBe("service-private");
  expect(await worker.execute(now)).toEqual({ supportPurged: 0, attachmentsRetired: 0, cleanupsCompleted: 0 });
  expect(requests).toHaveLength(1);
 });
 it("performs no storage I/O or completion for stale/disposed authority or a vanished fence", async () => {
  for (const options of [{ admitted: false }, { disappeared: true }]) {
   const { db, fence } = pendingDatabase(options), { requests, store } = storage();
   expect(await new ExpireServiceContent(db as never, store, candidate).execute(now)).toEqual({ supportPurged: 0, attachmentsRetired: 0, cleanupsCompleted: 0 });
   expect(requests).toEqual([]);
   expect(fence.cleanupCompletedAt).toBeNull();
  }
 });
 it("refuses the wrong current candidate before touching storage", async () => {
  const { db, fence } = pendingDatabase({ requiredCandidate: candidate }), { requests, store } = storage();
  await expect(new ExpireServiceContent(db as never, store, "c".repeat(40)).execute(now)).rejects.toThrow("candidate refused");
  expect(requests).toEqual([]);
  expect(fence.cleanupCompletedAt).toBeNull();
 });
 it("keeps the fence pending when the real store refuses a versioned private bucket", async () => {
  const { db, fence } = pendingDatabase(), { store } = storage(true);
  await expect(new ExpireServiceContent(db as never, store, candidate).execute(now)).rejects.toThrow("Service private cleanup unavailable");
  expect(fence.cleanupCompletedAt).toBeNull();
 });
});
