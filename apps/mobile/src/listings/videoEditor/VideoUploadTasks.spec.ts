import { onlineManager, focusManager } from "@tanstack/react-query";

import { createHash } from "node:crypto";

import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { server } from "../../../test/msw";
import { storeAuthSession } from "../../auth/session";
import { videoNativeStorage } from "../videoTransfer/testing/InMemoryVideoNativeStorage";

import { VideoUploadTask, videoUploadTask, rebindPublishedVideo, pauseVideoUploads } from "./VideoUploadTasks";

const boundary = vi.hoisted(() => ({ secure: new Map<string, string>(), nativeSelections: [] as unknown[], unavailable: false }));
vi.mock("expo-secure-store", () => ({ getItemAsync: async (key: string) => boundary.secure.get(key) ?? null, setItemAsync: async (key: string, value: string) => { boundary.secure.set(key, value); }, deleteItemAsync: async (key: string) => { boundary.secure.delete(key); } }));
vi.mock("@react-native-async-storage/async-storage", async () => { const { videoNativeStorage: storage } = await import("../videoTransfer/testing/InMemoryVideoNativeStorage"); return { default: { getItem: async (key: string) => storage.values.get(key) ?? null, setItem: async (key: string, value: string) => { storage.values.set(key, value); }, removeItem: async (key: string) => { storage.values.delete(key); } } }; });
vi.mock("expo-file-system", async () => ({ File: (await import("../videoTransfer/testing/InMemoryVideoNativeStorage")).VideoNativeFile }));
vi.mock("expo-crypto", async () => { const { webcrypto, randomUUID } = await import("node:crypto"); return { randomUUID, CryptoDigestAlgorithm: { SHA256: "SHA-256" }, digest: (algorithm: string, bytes: Uint8Array) => webcrypto.subtle.digest(algorithm, bytes) }; });
vi.mock("expo", async () => ({ requireOptionalNativeModule: () => boundary.unavailable ? null : {
 prepare: async (selection: { jobId: string; startMs: number; endMs: number }) => {
  boundary.nativeSelections.push(selection);
  const { videoNativeStorage: storage } = await import("../videoTransfer/testing/InMemoryVideoNativeStorage");
  const bytes = new Uint8Array([1, 2, 3, 4]), uri = `file:///documents/listing-video-preparation/${selection.jobId}/prepared.mp4`;
  storage.files.set(uri, bytes);
  return { uri, durationMs: selection.endMs - selection.startMs, sizeBytes: 4, sha256: createHash("sha256").update(bytes).digest("hex"), width: 640, height: 360, fps: 30, videoCodec: "h264", audioCodec: "aac", colour: "bt709" };
 }, cancel: async () => {}, discard: async (jobId: string) => { videoNativeStorage.files.delete(`file:///documents/listing-video-preparation/${jobId}/prepared.mp4`); },
} }));
const ownerId = "00000000-0000-4000-8000-000000000030", target = { kind: "draft" as const, id: "00000000-0000-4000-8000-000000000031" }, sessionId = "00000000-0000-4000-8000-000000000032";
const base = "http://localhost:3006/api/v1/listing-video-upload-sessions";
let state: string, complete: boolean, uploads: number, createBody: unknown;
const snapshot = () => ({ version: 1, sessionId, generation: sessionId, state, expiresAt: "2099-01-01T00:00:00Z", partBytes: 5242880, partCount: 1, parts: complete ? [{ partNumber: 1, sizeBytes: 4, etag: "opaque" }] : [] });
beforeEach(async () => {
 boundary.secure.clear(); boundary.nativeSelections = []; boundary.unavailable = false; videoNativeStorage.files.clear(); videoNativeStorage.values.clear(); state = "UPLOADING"; complete = false; uploads = 0;
 await storeAuthSession({ accessToken: "synthetic", refreshToken: "synthetic-refresh", user: { id: ownerId, phone: null, email: null, displayName: null, role: "buyer" } });
 server.use(
  http.post(base, async ({ request }) => { createBody = await request.json(); return HttpResponse.json(snapshot(), { status: 201 }); }),
  http.get(`${base}/${sessionId}`, () => HttpResponse.json(snapshot())),
  http.post(`${base}/${sessionId}/part-credentials`, () => HttpResponse.json({ version: 1, sessionId, parts: [{ partNumber: 1, url: "https://video.test/task-part", expiresAt: "2099-01-01T00:00:00Z", sizeBytes: 4 }] })),
  http.put("https://video.test/task-part", async ({ request }) => { expect([...new Uint8Array(await request.arrayBuffer())]).toEqual([1, 2, 3, 4]); uploads++; complete = true; return new HttpResponse(null); }),
  http.post(`${base}/${sessionId}/complete`, () => { state = "PROCESSING"; return HttpResponse.json(snapshot()); }),
  http.post(`${base}/${sessionId}/pause`, () => { state = "PAUSED"; return HttpResponse.json(snapshot()); }),
  http.delete(`${base}/${sessionId}`, () => { state = "CLEANUP_PENDING"; return HttpResponse.json(snapshot(), { status: 202 }); }),
 );
});
describe("native seller task uses actual preparation and transfer boundaries", () => {
 it("prepares the chosen interval, uses a relative poster, and uploads only staged bytes", async () => {
  const task = new VideoUploadTask(ownerId, target);
  await task.start({ sourceUri: "file:///library/selected.mov", startMs: 1000, endMs: 4000 }, 2000);
  expect(task.snapshot()).toMatchObject({ phase: "PROCESSING", record: { posterMs: 1000, confirmedBytes: 4, target } });
  expect(createBody).toMatchObject({ target, posterMs: 1000, prepared: { sizeBytes: 4 } });
  expect(JSON.stringify(createBody)).not.toContain("library"); expect(uploads).toBe(1);
 });
 it("uses current server readiness when reopening a processing video", async () => {
  const task = new VideoUploadTask(ownerId, target);
  await task.start({ sourceUri: "file:///library/selected.mov", startMs: 0, endMs: 3000 }, 0);
  state = "READY";
  const reopened = new VideoUploadTask(ownerId, target);
  await reopened.recover();
  expect(reopened.snapshot().phase).toBe("READY");
  expect(videoNativeStorage.files.size).toBe(0);
 });
 it("keeps cancellation authoritative over a late ready status response", async () => {
  const task = new VideoUploadTask(ownerId, target);
  await task.start({ sourceUri: "file:///library/selected.mov", startMs: 0, endMs: 3000 }, 0);
  let enter!: () => void, release!: () => void;
  const entered = new Promise<void>(resolve => { enter = resolve; }), held = new Promise<void>(resolve => { release = resolve; });
  server.use(http.get(`${base}/${sessionId}`, async () => { enter(); await held; return HttpResponse.json({ ...snapshot(), state: "READY" }); }));
  const recovering = task.recover(); await entered;
  await task.cancel(); release(); await recovering;
  expect(task.snapshot().phase).toBe("CANCELLED");
 });
 it("moves a processing draft journal to the published Listing without uploading again", async () => {
  const task = videoUploadTask(ownerId, target);
  await task.start({ sourceUri: "file:///library/selected.mov", startMs: 0, endMs: 3000 }, 0);
  const listingId = "00000000-0000-4000-8000-000000000043";
  await rebindPublishedVideo(ownerId, target.id, listingId);
  state = "READY";
  const published = videoUploadTask(ownerId, { kind: "listing", id: listingId });
  await published.recover();
  expect(published.snapshot()).toMatchObject({ phase: "READY", record: { target: { kind: "listing", id: listingId }, sessionId } });
  expect(uploads).toBe(1);
  expect(videoNativeStorage.values.has(`listing-video-transfer:v1:${ownerId}:draft:${target.id}`)).toBe(false);
 });
 it("reports an unavailable native preparation module without sending an original", async () => {
  boundary.unavailable = true;
  const task = new VideoUploadTask(ownerId, target);
  await task.start({ sourceUri: "file:///library/selected.mov", startMs: 0, endMs: 3000 }, 0);
  expect(task.snapshot()).toMatchObject({ phase: "FAILED", error: "VIDEO_PREPARATION_UNAVAILABLE" }); expect(uploads).toBe(0);
 });
 it("retries offline cancellation after reopening before disposing its prepared file", async () => {
  const task = new VideoUploadTask(ownerId, target);
  await task.start({ sourceUri: "file:///library/selected.mov", startMs: 0, endMs: 3000 }, 0);
  server.use(http.delete(`${base}/${sessionId}`, () => HttpResponse.error()));
  await task.cancel();
  expect(videoNativeStorage.files.size).toBe(1);
  server.use(http.delete(`${base}/${sessionId}`, () => { state = "CLEANUP_PENDING"; return HttpResponse.json(snapshot(), { status: 202 }); }));
  const reopened = new VideoUploadTask(ownerId, target);
  await reopened.recover();
  expect(state).toBe("CLEANUP_PENDING");
  expect(reopened.snapshot().phase).toBe("CANCELLED");
  expect(videoNativeStorage.files.size).toBe(0);
 });

 it("pauses actual upload bytes after preparation instead of cancelling the finished native export", async () => {
  let enter!: () => void, release!: () => void;
  const entered = new Promise<void>(resolve => { enter = resolve; }), held = new Promise<void>(resolve => { release = resolve; });
  server.use(http.put("https://video.test/task-part", async () => { enter(); await held; complete = true; return new HttpResponse(null); }));
  const task = new VideoUploadTask(ownerId, target);
  const running = task.start({ sourceUri: "file:///library/selected.mov", startMs: 0, endMs: 3000 }, 0);
  await entered; await task.pause(); release(); await running;
  expect(task.snapshot().phase).toBe("PAUSED");
  expect(state).toBe("PAUSED");
 });

 it("continues a network-interrupted upload on reconnect without an explicit retry", async () => {
  let offline = true;
  server.use(http.get(`${base}/${sessionId}`, () => offline ? HttpResponse.error() : HttpResponse.json(snapshot())));
  const unique = { kind: "listing" as const, id: "00000000-0000-4000-8000-000000000091" };
  const task = videoUploadTask(ownerId, unique);
  await task.start({ sourceUri: "file:///library/selected.mov", startMs: 0, endMs: 3000 }, 0);
  expect(task.snapshot().phase).toBe("FAILED");
  onlineManager.setOnline(false); offline = false; onlineManager.setOnline(true);
  await vi.waitFor(() => { expect(task.snapshot().phase).toBe("PROCESSING"); });
 });
 it("continues a lifecycle suspension on foreground but preserves an explicit Pause", async () => {
  const unique = { kind: "listing" as const, id: "00000000-0000-4000-8000-000000000092" };
  let enter!: () => void, release!: () => void;
  const entered = new Promise<void>(resolve => { enter = resolve; }), held = new Promise<void>(resolve => { release = resolve; });
  server.use(http.put("https://video.test/task-part", async () => { enter(); await held; complete = true; return new HttpResponse(null); }));
  const task = videoUploadTask(ownerId, unique);
  const running = task.start({ sourceUri: "file:///library/selected.mov", startMs: 0, endMs: 3000 }, 0);
  await entered; focusManager.setFocused(false); await pauseVideoUploads(); release(); await running;
  expect(task.snapshot().phase).toBe("PAUSED");
  focusManager.setFocused(true);
  await vi.waitFor(() => { expect(task.snapshot().phase).toBe("PROCESSING"); });
  // The seller's Pause remains an explicit durable intent, even after reconnect.
  const paused = new VideoUploadTask(ownerId, target);
  state = "UPLOADING"; complete = false;
  const record = task.snapshot().record!;
  videoNativeStorage.values.set(`listing-video-transfer:v1:${ownerId}:draft:${target.id}`, JSON.stringify({ ...record, target, state: "PAUSED", resumeOnForeground: false }));
  await paused.recover();
  expect(paused.snapshot().phase).toBe("PAUSED");
 });

});
