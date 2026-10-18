import { createHash } from "node:crypto";

import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { server } from "../../../test/msw";
import { storeAuthSession } from "../../auth/session";
import { videoNativeStorage } from "../videoTransfer/testing/InMemoryVideoNativeStorage";

import { VideoUploadTask } from "./VideoUploadTasks";

const boundary = vi.hoisted(() => ({ secure: new Map<string, string>(), nativeSelections: [] as unknown[], unavailable: false }));
vi.mock("expo-secure-store", () => ({ getItemAsync: async (key: string) => boundary.secure.get(key) ?? null, setItemAsync: async (key: string, value: string) => { boundary.secure.set(key, value); }, deleteItemAsync: async (key: string) => { boundary.secure.delete(key); } }));
vi.mock("@react-native-async-storage/async-storage", async () => { const { videoNativeStorage: storage } = await import("../videoTransfer/testing/InMemoryVideoNativeStorage"); return { default: { getItem: async (key: string) => storage.values.get(key) ?? null, setItem: async (key: string, value: string) => { storage.values.set(key, value); } } }; });
vi.mock("expo-file-system", async () => ({ File: (await import("../videoTransfer/testing/InMemoryVideoNativeStorage")).VideoNativeFile }));
vi.mock("expo-crypto", async () => { const { webcrypto, randomUUID } = await import("node:crypto"); return { randomUUID, CryptoDigestAlgorithm: { SHA256: "SHA-256" }, digest: (algorithm: string, bytes: Uint8Array) => webcrypto.subtle.digest(algorithm, bytes) }; });
vi.mock("expo", async () => ({ requireOptionalNativeModule: () => boundary.unavailable ? null : {
 prepare: async (selection: { jobId: string; startMs: number; endMs: number }) => {
  boundary.nativeSelections.push(selection);
  const { videoNativeStorage: storage } = await import("../videoTransfer/testing/InMemoryVideoNativeStorage");
  const bytes = new Uint8Array([1, 2, 3, 4]), uri = `file:///documents/listing-video-preparation/${selection.jobId}/prepared.mp4`;
  storage.files.set(uri, bytes);
  return { uri, durationMs: selection.endMs - selection.startMs, sizeBytes: 4, sha256: createHash("sha256").update(bytes).digest("hex"), width: 640, height: 360, fps: 30, videoCodec: "h264", audioCodec: "aac", colour: "bt709" };
 }, cancel: async () => {}, discard: async () => {},
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
  await new VideoUploadTask(ownerId, target).recover();
  const reopened = new VideoUploadTask(ownerId, target);
  await reopened.recover();
  expect(reopened.snapshot().phase).toBe("READY");
 });
 it("reports an unavailable native preparation module without sending an original", async () => {
  boundary.unavailable = true;
  const task = new VideoUploadTask(ownerId, target);
  await task.start({ sourceUri: "file:///library/selected.mov", startMs: 0, endMs: 3000 }, 0);
  expect(task.snapshot()).toMatchObject({ phase: "FAILED", error: "VIDEO_PREPARATION_UNAVAILABLE" }); expect(uploads).toBe(0);
 });
});
