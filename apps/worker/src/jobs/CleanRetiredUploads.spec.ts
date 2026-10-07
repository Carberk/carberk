import { describe, expect, it } from "vitest";

import { CleanRetiredUploads } from "./CleanRetiredUploads";
import {
  deletionDirectory,
  type CleanupWork,
  type RetiredObjectStore,
  type RetiredUploadLedger,
} from "./retiredUploadCleanup";

// Issue #721 / ADR-0088. The Postgres ledger and the S3 store have their own
// specs; this one fixes what the sweep does with them.

const DIRECTORY = "pending/21b0b4e0-4d4a-4d2c-8bd6-705555cb7585/";
const NOW = new Date("2026-10-07T12:00:00Z");

function manifest(directory = DIRECTORY, extension = "jpg"): string[] {
  return [`${directory}original.${extension}`, ...["thumbnail", "list", "detail", "fullscreen"]
    .flatMap((name) => [`${directory}${name}.jpg`, `${directory}${name}.webp`])];
}

function work(overrides: Partial<CleanupWork> = {}): CleanupWork {
  return {
    uploadId: "upload-1", key: `${DIRECTORY}original.jpg`, objectKeys: manifest(),
    writeProtocol: "conditional-v1", attempts: 1, ...overrides,
  };
}

/** Work waits here until completed; a lease hands out what is due, as Postgres would. */
class InMemoryLedger implements RetiredUploadLedger {
  pending: CleanupWork[] = [];
  completed: string[] = [];
  failures: Array<{ uploadId: string; reason: string }> = [];
  blocked = new Map<string, string>();
  expiredPreparations = 0;
  leases: number[] = [];

  async retireExpiredPreparations(_now: Date, limit: number): Promise<number> {
    const cancelled = Math.min(this.expiredPreparations, limit);
    this.expiredPreparations -= cancelled;
    return cancelled;
  }

  async lease(_now: Date, limit: number): Promise<CleanupWork[]> {
    this.leases.push(limit);
    return this.pending.slice(0, limit).map((item) => ({ ...item, attempts: item.attempts + 1 }));
  }

  async blockingReference(item: CleanupWork): Promise<string | null> {
    return this.blocked.get(item.uploadId) ?? null;
  }

  async complete(uploadId: string): Promise<void> {
    this.completed.push(uploadId);
    this.pending = this.pending.filter((item) => item.uploadId !== uploadId);
  }

  async recordFailure(uploadId: string, reason: string): Promise<void> {
    this.failures.push({ uploadId, reason });
  }
}

/** Objects by key; `failAt` makes the store stop part-way, as an outage would. */
class InMemoryStore implements RetiredObjectStore {
  objects = new Set<string>();
  calls: string[][] = [];
  failAt: string | undefined;

  async deleteAndVerify(keys: string[]): Promise<void> {
    this.calls.push(keys);
    for (const key of keys) {
      if (key === this.failAt) throw new Error("storage unavailable");
      this.objects.delete(key);
    }
  }
}

function setup(pending: CleanupWork[] = [work()]) {
  const ledger = new InMemoryLedger();
  ledger.pending = pending;
  const store = new InMemoryStore();
  for (const item of pending) for (const key of item.objectKeys) store.objects.add(key);
  return { ledger, store, job: new CleanRetiredUploads(ledger, store) };
}

describe("CleanRetiredUploads (#721)", () => {
  it("deletes the exact recorded manifest and completes the work", async () => {
    const { ledger, store, job } = setup();

    const result = await job.execute({ now: NOW, limit: 10 });

    expect(store.calls).toEqual([manifest()]);
    expect(store.objects.size).toBe(0);
    expect(ledger.completed).toEqual(["upload-1"]);
    expect(result).toEqual({ cancelledPreparations: 0, deleted: 1, waiting: 0 });
  });

  it("keeps failed work, records why, and finishes it on a later run after a partial deletion", async () => {
    const { ledger, store, job } = setup();
    store.failAt = `${DIRECTORY}detail.jpg`;

    const failed = await job.execute({ now: NOW, limit: 10 });

    expect(failed).toMatchObject({ deleted: 0, waiting: 1 });
    expect(ledger.completed).toEqual([]);
    expect(ledger.failures).toEqual([{ uploadId: "upload-1", reason: "storage unavailable" }]);
    // Some objects are gone and some remain: the work is not complete.
    expect(store.objects.has(`${DIRECTORY}original.jpg`)).toBe(false);
    expect(store.objects.has(`${DIRECTORY}fullscreen.webp`)).toBe(true);

    store.failAt = undefined;
    const retried = await job.execute({ now: NOW, limit: 10 });

    expect(retried).toMatchObject({ deleted: 1, waiting: 0 });
    expect(store.objects.size).toBe(0);
    expect(ledger.completed).toEqual(["upload-1"]);
  });

  it("takes no more than its limit in one run and carries on past a failure", async () => {
    const items = [1, 2, 3].map((n) => {
      const directory = `pending/0000000${n}-4d4a-4d2c-8bd6-705555cb7585/`;
      return work({ uploadId: `upload-${n}`, key: `${directory}original.jpg`, objectKeys: manifest(directory) });
    });
    const { ledger, store, job } = setup(items);
    store.failAt = items[0]?.objectKeys[3];

    const result = await job.execute({ now: NOW, limit: 2 });

    expect(ledger.leases).toEqual([2]);
    expect(store.calls).toHaveLength(2);
    expect(result).toMatchObject({ deleted: 1, waiting: 1 });
    expect(ledger.completed).toEqual(["upload-2"]);
    expect(ledger.pending.map((item) => item.uploadId)).toEqual(["upload-1", "upload-3"]);
  });

  it("deletes nothing while a live claimant or retained key references the directory", async () => {
    const { ledger, store, job } = setup();
    ledger.blocked.set("upload-1", "a Listing media key is still under this directory");

    const result = await job.execute({ now: NOW, limit: 10 });

    expect(store.calls).toEqual([]);
    expect(store.objects.size).toBe(9);
    expect(ledger.completed).toEqual([]);
    expect(ledger.failures).toEqual([
      { uploadId: "upload-1", reason: "a Listing media key is still under this directory" },
    ]);
    expect(result).toMatchObject({ deleted: 0, waiting: 1 });
  });

  it.each([
    ["an unfenced legacy upload", work({ writeProtocol: "legacy" })],
    ["a chat attachment", work({
      key: "chat-attachments/c1/21b0b4e0-4d4a-4d2c-8bd6-705555cb7585/original.jpg",
      objectKeys: manifest("chat-attachments/c1/21b0b4e0-4d4a-4d2c-8bd6-705555cb7585/"),
    })],
    ["a made-up prefix", work({ key: "pending/original.jpg", objectKeys: manifest("pending/") })],
    ["a directory that is not a UUID", work({
      key: "pending/not-a-uuid/original.jpg", objectKeys: manifest("pending/not-a-uuid/"),
    })],
    ["a video original", work({ key: `${DIRECTORY}original.mp4`, objectKeys: manifest(DIRECTORY, "mp4") })],
    ["a manifest reaching into another directory", work({
      objectKeys: [...manifest().slice(0, 8), "pending/9f1c2d3e-4d4a-4d2c-8bd6-705555cb7585/list.jpg"],
    })],
    ["a manifest with an extra key", work({ objectKeys: [...manifest(), `${DIRECTORY}extra.jpg`] })],
    ["an empty manifest", work({ objectKeys: [] })],
  ])("never deletes for %s", async (_label, item) => {
    const { ledger, store, job } = setup([item]);

    expect(deletionDirectory(item)).toBeNull();
    const result = await job.execute({ now: NOW, limit: 10 });

    expect(store.calls).toEqual([]);
    expect(ledger.completed).toEqual([]);
    expect(ledger.failures).toHaveLength(1);
    expect(result).toMatchObject({ deleted: 0, waiting: 1 });
  });

  it("grants authority only over the strict owned pending UUID directory", () => {
    expect(deletionDirectory(work())).toBe(DIRECTORY);
    expect(deletionDirectory(work({
      key: `${DIRECTORY}original.webp`, objectKeys: manifest(DIRECTORY, "webp"),
    }))).toBe(DIRECTORY);
  });

  it("cancels stranded preparations within the same limit before taking work", async () => {
    const { ledger, job } = setup([]);
    ledger.expiredPreparations = 5;

    const result = await job.execute({ now: NOW, limit: 3 });

    expect(result).toEqual({ cancelledPreparations: 3, deleted: 0, waiting: 0 });
    expect(ledger.leases).toEqual([3]);
  });
});
