import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { server } from "../../../test/msw";
import { storeAuthSession } from "../../auth/session";

import { VideoTransfer } from "./VideoTransfer";
import { InMemoryVideoTransferDevice } from "./testing/InMemoryVideoTransferDevice";

const secure = vi.hoisted(() => new Map<string, string>());
vi.mock("expo-secure-store", () => ({ getItemAsync: async (key: string) => secure.get(key) ?? null, setItemAsync: async (key: string, value: string) => { secure.set(key, value); }, deleteItemAsync: async (key: string) => { secure.delete(key); } }));
const ownerId = "00000000-0000-4000-8000-000000000010", sessionId = "00000000-0000-4000-8000-000000000011";
const base = "http://localhost:3006/api/v1/listing-video-upload-sessions";
let device: InMemoryVideoTransferDevice, state: string, parts: number[], puts: number[], completed: boolean;
const snapshot = () => ({ version: 1, sessionId, generation: sessionId, state, expiresAt: "2099-01-01T00:00:00Z", partBytes: 5242880, partCount: 2, parts: parts.map(partNumber => ({ partNumber, sizeBytes: partNumber === 1 ? 5242880 : 2, etag: `opaque-${partNumber}` })) });
beforeEach(async () => {
  secure.clear(); state = "UPLOADING"; parts = []; puts = []; completed = false; device = new InMemoryVideoTransferDevice();
  await storeAuthSession({ accessToken: "synthetic", refreshToken: "synthetic-refresh", user: { id: ownerId, phone: null, email: null, displayName: null, role: "buyer" } });
  device.record = { version: 1, ownerId, idempotencyKey: "fixture-video", target: { kind: "listing", id: sessionId }, prepared: { uri: "file:///documents/videos/job-1/prepared.mp4", durationMs: 5055, sizeBytes: device.bytes.length, sha256: "a".repeat(64), width: 960, height: 540, fps: 30, videoCodec: "h264", audioCodec: "aac", colour: "bt709" }, posterMs: 0, state: "UPLOADING", confirmedBytes: 0 };
  server.use(
    http.post(base, async ({ request }) => { const body = await request.json() as Record<string, unknown>; expect(body["sourceUri"]).toBeUndefined(); expect(body["prepared"]).toEqual({ sizeBytes: 5242882, sha256: "a".repeat(64) }); return HttpResponse.json(snapshot(), { status: 201 }); }),
    http.get(`${base}/${sessionId}`, () => HttpResponse.json(snapshot())),
    http.post(`${base}/${sessionId}/part-credentials`, async ({ request }) => { const body = await request.json() as { partNumbers: number[] }; return HttpResponse.json({ version: 1, sessionId, parts: body.partNumbers.map(partNumber => ({ partNumber, url: `https://video.test/part/${partNumber}`, expiresAt: "2099-01-01T00:00:00Z", sizeBytes: partNumber === 1 ? 5242880 : 2 })) }); }),
    http.put("https://video.test/part/:number", async ({ request, params }) => { expect(request.headers.get("authorization")).toBeNull(); const part = Number(params["number"]); const bytes = new Uint8Array(await request.arrayBuffer()); expect(bytes.length).toBe(part === 1 ? 5242880 : 2); expect(bytes[0]).toBe(7); parts.push(part); puts.push(part); return new HttpResponse(null, { status: 200 }); }),
    http.post(`${base}/${sessionId}/complete`, () => { completed = true; state = "PROCESSING"; return HttpResponse.json(snapshot()); }),
    http.post(`${base}/${sessionId}/pause`, () => { state = "PAUSED"; return HttpResponse.json(snapshot()); }),
    http.post(`${base}/${sessionId}/resume`, () => { state = "UPLOADING"; return HttpResponse.json(snapshot()); }),
    http.delete(`${base}/${sessionId}`, () => { state = "CLEANUP_PENDING"; return HttpResponse.json(snapshot(), { status: 202 }); }),
  );
});
describe("prepared video resumable foreground transfer", () => {
  it("uploads only missing prepared parts then records processing without public readiness", async () => {
    parts = [1]; await new VideoTransfer(device).run();
    expect(puts).toEqual([2]); expect(completed).toBe(true);
    expect(device.record).toMatchObject({ sessionId, state: "PROCESSING", confirmedBytes: 5242882 });
  });
  it("reconciles a lost PUT answer before retrying its already committed part", async () => {
    server.use(http.put("https://video.test/part/1", () => { puts.push(1); parts.push(1); return new HttpResponse(null, { status: 502 }); }));
    await new VideoTransfer(device).run();
    expect(puts).toEqual([1, 2]); expect(completed).toBe(true);
  });
  it("persists explicit pause through reopening and requires Continue to send bytes", async () => {
    if (!device.record) throw new Error("Fixture missing");
    device.record.sessionId = sessionId;
    await new VideoTransfer(device).pause();
    await new VideoTransfer(device).run();
    expect(device.record?.state).toBe("PAUSED"); expect(puts).toEqual([]); expect(completed).toBe(false);
    await new VideoTransfer(device).resume(); expect(completed).toBe(true);
  });
  it("keeps cancellation authoritative over a late successful part response", async () => {
    if (!device.record) throw new Error("Fixture missing");
    device.record.sessionId = sessionId;
    let release!: () => void, entered!: () => void; const waiting = new Promise<void>(resolve => { entered = resolve; });
    server.use(http.put("https://video.test/part/1", async () => { entered(); await new Promise<void>(resolve => { release = resolve; }); return new HttpResponse(null); }));
    const transfer = new VideoTransfer(device), running = transfer.run();
    await Promise.race([waiting, running]);
    await transfer.cancel(); release?.(); await running;
    expect(device.record?.state).toBe("CANCELLED"); expect(completed).toBe(false);
  });
  it("bounds successful PUT retries when the server never confirms their parts", async () => {
    server.use(http.put("https://video.test/part/1", () => { puts.push(1); if (puts.length > 4) state = "FAILED"; return new HttpResponse(null); }));
    await expect(new VideoTransfer(device).run()).rejects.toThrow("VIDEO_PART_RETRY_EXHAUSTED");
    expect(puts).toEqual([1, 1, 1]); expect(completed).toBe(false);
  });
  it("refuses missing or changed local prepared bytes without sending them", async () => {
    device.valid = false; await expect(new VideoTransfer(device).run()).rejects.toThrow("VIDEO_LOCAL_SOURCE_UNAVAILABLE");
    expect(puts).toEqual([]); expect(completed).toBe(false);
  });
});
