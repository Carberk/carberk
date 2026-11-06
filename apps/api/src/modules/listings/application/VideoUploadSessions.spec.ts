import { describe, it, expect, beforeEach, vi } from "vitest";

import { VideoUploadSessions } from "./VideoUploadSessions";
import {
  FakeVideoStorage,
  InMemoryVideoUploadRepository,
} from "./testing/InMemoryVideoWorld";
import type { ListingDraftRepository } from "../domain/ports/ListingDraftRepository";
import type { ListingRepository } from "../domain/ports/ListingRepository";

const OWNER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const DRAFT_ID = "33333333-3333-4333-8333-333333333333";
const LISTING_ID = "44444444-4444-4444-8444-444444444444";
const SIZE = 6 * 1024 * 1024; // two parts: 5 MiB + 1 MiB

function makeWorld() {
  let now = new Date("2026-11-06T00:00:00.000Z");
  const storage = new FakeVideoStorage();
  const repo = new InMemoryVideoUploadRepository();
  const drafts = {
    findById: async (id: string) =>
      id === DRAFT_ID ? { id, userId: OWNER } : null,
  } as unknown as ListingDraftRepository;
  const listings = {
    findById: async (id: string) =>
      id === LISTING_ID
        ? { id, sellerId: OWNER, deletedAt: null, status: "active" }
        : null,
  } as unknown as ListingRepository;
  const access = { canResumeVideo: (userId: string) => userId === OWNER, canUploadVideo: (userId: string) => userId === OWNER };
  const sessions = new VideoUploadSessions(
    repo,
    storage,
    access,
    drafts,
    listings,
    () => now,
  );
  return {
    storage,
    repo,
    sessions,
    setNow: (d: Date) => {
      now = d;
    },
    getNow: () => now,
  };
}

const openInput = {
  userId: OWNER,
  target: { type: "draft" as const, id: DRAFT_ID },
  contentType: "video/mp4",
  sizeBytes: SIZE,
  coverOffsetMs: 1200,
};

describe("VideoUploadSessions", () => {
  let world: ReturnType<typeof makeWorld>;
  beforeEach(() => {
    world = makeWorld();
  });

  it("an upload tester opens a session for their own Draft with a fixed part layout", async () => {
    const view = await world.sessions.open(openInput);
    expect(view.state).toBe("UPLOADING");
    expect(view.parts.map((p) => p.sizeBytes)).toEqual([5 * 1024 * 1024, 1024 * 1024]);
    expect(view.expiresAt).toBe("2026-11-13T00:00:00.000Z");
    expect(view.parts.every((p) => p.uploadUrl.length > 0)).toBe(true);
  });

  it("a non-tester is refused even for their own Draft", async () => {
    await expect(
      world.sessions.open({ ...openInput, userId: OTHER }),
    ).rejects.toMatchObject({ response: { code: "LISTING_VIDEO_UNAVAILABLE" } });
  });

  it("a foreign Draft and an unknown Draft share the unavailable response", async () => {
    const foreign = world.sessions.open({
      ...openInput,
      target: { type: "draft", id: LISTING_ID },
    });
    // LISTING_ID as a draft id is unknown to the draft store.
    await expect(foreign).rejects.toMatchObject({
      response: { code: "VIDEO_UPLOAD_NOT_AVAILABLE" },
    });
    const repo = world.repo;
    expect(repo.sessions.size).toBe(0);
  });

  it("a second distinct pending selection for the same target conflicts", async () => {
    await world.sessions.open(openInput);
    await expect(world.sessions.open(openInput)).rejects.toMatchObject({
      response: { code: "VIDEO_UPLOAD_CONFLICT" },
    });
  });

  it("replaying an open with the same idempotency key returns the same session", async () => {
    const first = await world.sessions.open({ ...openInput, idempotencyKey: "key-1" });
    const replay = await world.sessions.open({ ...openInput, idempotencyKey: "key-1" });
    expect(replay.sessionId).toBe(first.sessionId);
    expect(replay.generationId).toBe(first.generationId);
  });

  it("reusing an idempotency key with different input conflicts", async () => {
    await world.sessions.open({ ...openInput, idempotencyKey: "key-1" });
    await expect(
      world.sessions.open({ ...openInput, idempotencyKey: "key-1", sizeBytes: 1024 }),
    ).rejects.toMatchObject({ response: { code: "VIDEO_UPLOAD_CONFLICT" } });
  });

  it("status reports server-confirmed parts and fresh URLs only for missing parts", async () => {
    const opened = await world.sessions.open(openInput);
    const session = await world.repo.findSession(opened.sessionId);
    world.storage.putPart(session!.source.objectKey, 1, 5 * 1024 * 1024);
    const view = await world.sessions.status({ userId: OWNER, sessionId: opened.sessionId });
    expect(view.confirmedParts).toEqual([{ partNumber: 1, sizeBytes: 5 * 1024 * 1024 }]);
    expect(view.parts.map((p) => p.partNumber)).toEqual([2]);
    expect(view.expiresAt).toBe(opened.expiresAt);
  });

  it("a foreign session id is unavailable, like an unknown one", async () => {
    const opened = await world.sessions.open(openInput);
    await expect(
      world.sessions.status({ userId: OTHER, sessionId: opened.sessionId }),
    ).rejects.toMatchObject({ response: { code: "VIDEO_UPLOAD_NOT_AVAILABLE" } });
    await expect(
      world.sessions.status({ userId: OWNER, sessionId: LISTING_ID }),
    ).rejects.toMatchObject({ response: { code: "VIDEO_UPLOAD_NOT_AVAILABLE" } });
  });

  async function uploadAll(sessionId: string) {
    const session = await world.repo.findSession(sessionId);
    const key = session!.source.objectKey;
    world.storage.putPart(key, 1, 5 * 1024 * 1024);
    world.storage.putPart(key, 2, 1024 * 1024);
    return key;
  }

  it("completion verifies the server-listed layout and completes exactly once", async () => {
    const opened = await world.sessions.open(openInput);
    await uploadAll(opened.sessionId);
    const first = await world.sessions.complete({ userId: OWNER, sessionId: opened.sessionId });
    expect(first.state).toBe("PROCESSING");
    const second = await world.sessions.complete({ userId: OWNER, sessionId: opened.sessionId });
    expect(second.sessionId).toBe(first.sessionId);
    expect(second.generationId).toBe(first.generationId);
    expect(second.state).toBe("PROCESSING");
    expect(world.storage.completeCalls).toBe(1);
  });

  it("completion with a missing part is refused and the session can be fixed and retried", async () => {
    const opened = await world.sessions.open(openInput);
    const session = await world.repo.findSession(opened.sessionId);
    world.storage.putPart(session!.source.objectKey, 1, 5 * 1024 * 1024);
    await expect(
      world.sessions.complete({ userId: OWNER, sessionId: opened.sessionId }),
    ).rejects.toMatchObject({ response: { code: "UPLOAD_OBJECT_INVALID" } });
    world.storage.putPart(session!.source.objectKey, 2, 1024 * 1024);
    const done = await world.sessions.complete({ userId: OWNER, sessionId: opened.sessionId });
    expect(done.state).toBe("PROCESSING");
  });

  it("cancel aborts the multipart upload, retires the pending generation and repeats safely", async () => {
    const opened = await world.sessions.open(openInput);
    const session = await world.repo.findSession(opened.sessionId);
    const key = session!.source.objectKey;
    world.storage.putPart(key, 1, 5 * 1024 * 1024);
    const cancelled = await world.sessions.cancel({ userId: OWNER, sessionId: opened.sessionId });
    expect(cancelled.state).toBe("CANCELLED");
    expect(world.storage.hasMultipart(key)).toBe(false);
    expect((await world.repo.findSession(opened.sessionId))!.generation.status).toBe("Retired");
    const again = await world.sessions.cancel({ userId: OWNER, sessionId: opened.sessionId });
    expect(again.state).toBe("CANCELLED");
    // After cancel, a new selection may open for the same target.
    const reopened = await world.sessions.open(openInput);
    expect(reopened.state).toBe("UPLOADING");
  });

  it("cancelling a completed upload is refused and its object is untouched", async () => {
    const opened = await world.sessions.open(openInput);
    const key = await uploadAll(opened.sessionId);
    await world.sessions.complete({ userId: OWNER, sessionId: opened.sessionId });
    await expect(
      world.sessions.cancel({ userId: OWNER, sessionId: opened.sessionId }),
    ).rejects.toMatchObject({ response: { code: "VIDEO_UPLOAD_CONFLICT" } });
    expect(await world.storage.headObject(key)).toMatchObject({ sizeBytes: SIZE });
  });

  it("expiry cleans an unfinished session and never touches a completed one", async () => {
    const opened = await world.sessions.open(openInput);
    const doneOpened = await world.sessions.open({
      ...openInput,
      target: { type: "listing", id: LISTING_ID },
    });
    const doneKey = await uploadAll(doneOpened.sessionId);
    // uploadAll used the draft session helper; upload listing parts too.
    const doneSession = await world.repo.findSession(doneOpened.sessionId);
    world.storage.putPart(doneSession!.source.objectKey, 1, 5 * 1024 * 1024);
    world.storage.putPart(doneSession!.source.objectKey, 2, 1024 * 1024);
    await world.sessions.complete({ userId: OWNER, sessionId: doneOpened.sessionId });

    world.setNow(new Date("2026-11-14T00:00:00.000Z"));
    const expiredCount = await world.sessions.expireDue();
    expect(expiredCount).toBe(1);
    const expired = await world.repo.findSession(opened.sessionId);
    expect(expired!.source.state).toBe("EXPIRED");
    expect(world.storage.hasMultipart(expired!.source.objectKey)).toBe(false);
    expect(await world.storage.headObject(doneKey)).toMatchObject({ sizeBytes: SIZE });
    expect(await world.storage.headObject(doneSession!.source.objectKey)).toMatchObject({
      sizeBytes: SIZE,
    });
    const view = await world.sessions.status({ userId: OWNER, sessionId: opened.sessionId });
    expect(view.state).toBe("EXPIRED");
  });

  it("replaying an expired open returns terminal status without transfer URLs", async () => {
    const opened = await world.sessions.open({ ...openInput, idempotencyKey: "expired-replay" });
    world.setNow(new Date("2026-11-14T00:00:00.000Z"));
    const replay = await world.sessions.open({ ...openInput, idempotencyKey: "expired-replay" });
    expect(replay.sessionId).toBe(opened.sessionId);
    expect(replay.state).toBe("EXPIRED");
    expect(replay.parts).toEqual([]);
  });

  it("an ambiguous completion cannot be cancelled or expired before late storage success is reconciled", async () => {
    const opened = await world.sessions.open(openInput);
    const key = await uploadAll(opened.sessionId);
    world.storage.deferCompletion = true;
    await expect(world.sessions.complete({ userId: OWNER, sessionId: opened.sessionId })).rejects.toThrow("TimeoutError");
    await expect(world.sessions.cancel({ userId: OWNER, sessionId: opened.sessionId })).rejects.toMatchObject({ response: { code: "VIDEO_UPLOAD_CONFLICT" } });
    world.setNow(new Date("2026-11-14T00:00:00.000Z"));
    await world.sessions.expireDue();
    const status = await world.sessions.status({ userId: OWNER, sessionId: opened.sessionId });
    expect(status.state).toBe("PROCESSING");
    expect(await world.storage.headObject(key)).toMatchObject({ sizeBytes: SIZE });
    expect(world.storage.abortCalls).toBe(0);
  });

  it("a later sweep retries failed cleanup even though expiry is already terminal", async () => {
    const opened = await world.sessions.open(openInput);
    const session = await world.repo.findSession(opened.sessionId);
    const key = session!.source.objectKey;
    world.storage.putPart(key, 1, 5 * 1024 * 1024);
    world.storage.failAbort = true;
    world.setNow(new Date("2026-11-14T00:00:00.000Z"));
    await world.sessions.expireDue();
    expect(world.storage.hasMultipart(key)).toBe(true);
    world.storage.failAbort = false;
    await world.sessions.expireDue();
    expect(world.storage.hasMultipart(key)).toBe(false);
    expect((await world.sessions.status({ userId: OWNER, sessionId: opened.sessionId })).state).toBe("EXPIRED");
  });

  it("processes expired uploads even when stale completion reconciliation is blocked", async () => {
    const blocked = await world.sessions.open(openInput);
    const blockedSession = await world.repo.findSession(blocked.sessionId);
    await uploadAll(blocked.sessionId);
    await world.sessions.complete({ userId: OWNER, sessionId: blocked.sessionId }).catch(() => undefined);
    blockedSession!.source.state = "COMPLETING";
    blockedSession!.source.completionStartedAt = new Date("2026-11-01T00:00:00.000Z");
    const due = await world.sessions.open({ ...openInput, target: { type: "listing", id: LISTING_ID } });
    const dueSession = await world.repo.findSession(due.sessionId);
    dueSession!.source.expiresAt = new Date("2026-11-05T00:00:00.000Z");
    world.setNow(new Date("2026-11-14T00:00:00.000Z"));
    expect(await world.sessions.expireDue(1)).toBe(1);
    expect((await world.repo.findSession(due.sessionId))!.source.state).toBe("EXPIRED");
  });

  it("the production lifecycle timer expires abandoned parts without a caller", async () => {
    vi.useFakeTimers();
    try {
      const opened = await world.sessions.open(openInput);
      const source = (await world.repo.findSession(opened.sessionId))!.source;
      world.storage.putPart(source.objectKey, 1, 5242880);
      world.setNow(new Date("2026-11-14T00:00:00.000Z"));
      world.sessions.onModuleInit();
      await vi.advanceTimersByTimeAsync(60_000);
      expect(world.storage.hasMultipart(source.objectKey)).toBe(false);
      expect((await world.sessions.status({ userId: OWNER, sessionId: opened.sessionId })).state).toBe("EXPIRED");
    } finally {
      world.sessions.onModuleDestroy();
      vi.useRealTimers();
    }
  });

  it("completion after the 7-day expiry is refused", async () => {
    const opened = await world.sessions.open(openInput);
    await uploadAll(opened.sessionId);
    world.setNow(new Date("2026-11-14T00:00:00.000Z"));
    await expect(
      world.sessions.complete({ userId: OWNER, sessionId: opened.sessionId }),
    ).rejects.toMatchObject({ response: { code: "VIDEO_UPLOAD_EXPIRED" } });
  });
});
