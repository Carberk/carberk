import { describe, expect, it } from "vitest";

import { OwnedVideoUploadProtocol, type VideoSessionCreate } from "./OwnedVideoUploadProtocol";
import { InMemoryOwnedVideoSessionLedger } from "./testing/InMemoryOwnedVideoSessionLedger";
import { InMemoryVideoObjectStorage } from "./testing/InMemoryVideoObjectStorage";
const actor = { userId: "seller", sessionId: "current-auth-session" };
const input: VideoSessionCreate = { protocolVersion: 1, target: { kind: "listing", id: "00000000-0000-4000-8000-000000000004" }, prepared: { sizeBytes: 6 * 1024 * 1024, sha256: "a".repeat(64) }, posterMs: 0, idempotencyKey: "tester-first-video" };
function fixture() {
  const ledger = new InMemoryOwnedVideoSessionLedger(), storage = new InMemoryVideoObjectStorage();
  return { ledger, storage, service: new OwnedVideoUploadProtocol(ledger, storage) };
}
describe("owned multipart protocol", () => {
  it("creates one durable idempotent session and returns only the bounded public descriptor", async () => {
    const f = fixture();
    const created = await f.service.create(actor, input);
    expect(created).toEqual({ version: 1, sessionId: "00000000-0000-4000-8000-000000000001", generation: "00000000-0000-4000-8000-000000000003", state: "UPLOADING", expiresAt: new Date("2026-10-24T00:00:00Z"), partBytes: 5242880, partCount: 2 });
    expect(await f.service.create(actor, input)).toEqual(created);
    expect(f.storage.initialized).toBe(1);
  });
  it("recovers a successful create with a lost response without repeating provider creation", async () => {
    const f = fixture(); f.storage.loseInitializeResponse = true;
    await expect(f.service.create(actor, input)).rejects.toThrow("VIDEO_STORAGE_UNAVAILABLE");
    expect((await f.service.create(actor, input)).state).toBe("UPLOADING");
    expect(f.storage.initialized).toBe(1);
  });
  it("reconciles a lost completion response and queues processing without claiming readiness", async () => {
    const f = fixture(); const created = await f.service.create(actor, input); f.storage.loseCompleteResponse = true;
    expect((await f.service.complete(actor, created.sessionId)).state).toBe("PROCESSING");
  });
  it("returns persisted pause intent before refusing new part credentials, then resumes bounded renewal", async () => {
    const f = fixture(); const created = await f.service.create(actor, input);
    expect((await f.service.change(actor, created.sessionId, "pause")).state).toBe("PAUSED");
    await expect(f.service.credentials(actor, created.sessionId, [1])).rejects.toThrow("VIDEO_PART_INVALID");
    expect((await f.service.change(actor, created.sessionId, "resume")).state).toBe("UPLOADING");
    expect(await f.service.credentials(actor, created.sessionId, [2])).toMatchObject({ version: 1, parts: [{ partNumber: 2 }] });
    await expect(f.service.credentials(actor, created.sessionId, [3])).rejects.toThrow("VIDEO_PART_INVALID");
    await expect(f.service.credentials(actor, created.sessionId, [1, 1])).rejects.toThrow("VIDEO_PART_INVALID");
    expect((await f.service.get(actor, created.sessionId)).parts).toEqual([]);
  });
  it("lets persisted cancellation win a late successful provider completion", async () => {
    const f = fixture(); const created = await f.service.create(actor, input);
    f.storage.afterComplete = () => { f.ledger.cancelled = true; };
    await expect(f.service.complete(actor, created.sessionId)).rejects.toThrow("VIDEO_SESSION_UNAVAILABLE");
    expect(f.ledger.session?.state).toBe("COMPLETING");
  });
});
