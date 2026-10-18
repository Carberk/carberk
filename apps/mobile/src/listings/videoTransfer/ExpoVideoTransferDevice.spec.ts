import { createHash } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { ExpoVideoTransferDevice } from "./ExpoVideoTransferDevice";
import { videoNativeStorage } from "./testing/InMemoryVideoNativeStorage";
import type { VideoTransferRecord } from "./VideoTransfer";

vi.mock("@react-native-async-storage/async-storage", async () => { const { videoNativeStorage: storage } = await import("./testing/InMemoryVideoNativeStorage"); return { default: { getItem: async (key: string) => storage.values.get(key) ?? null, setItem: async (key: string, value: string) => { storage.values.set(key, value); } } }; });
vi.mock("expo-file-system", async () => ({ File: (await import("./testing/InMemoryVideoNativeStorage")).VideoNativeFile }));
vi.mock("expo-crypto", async () => { const { webcrypto } = await import("node:crypto"); return { CryptoDigestAlgorithm: { SHA256: "SHA-256" }, digest: (algorithm: string, bytes: Uint8Array) => webcrypto.subtle.digest(algorithm, bytes) }; });
const owner = "00000000-0000-4000-8000-000000000010", target = "00000000-0000-4000-8000-000000000011";
const uri = "file:///documents/listing-video-preparation/job-1/prepared.mp4";
const bytes = new Uint8Array([1, 2, 3, 4]);
const record: VideoTransferRecord = { version: 1, ownerId: owner, idempotencyKey: "job-1", target: { kind: "listing", id: target }, prepared: { uri, durationMs: 1000, sizeBytes: 4, sha256: createHash("sha256").update(bytes).digest("hex"), width: 640, height: 360, fps: 30, videoCodec: "h264", audioCodec: "aac", colour: "bt709" }, posterMs: 0, state: "PAUSED", confirmedBytes: 0 };
beforeEach(() => { videoNativeStorage.values.clear(); videoNativeStorage.files.clear(); videoNativeStorage.files.set(uri, bytes); });
describe("native video transfer journal and staged bytes", () => {
  it("recovers exact paused metadata after reopening only in its owning account/target", async () => {
    await new ExpoVideoTransferDevice(owner, target).save(record);
    expect(await new ExpoVideoTransferDevice(owner, target).load()).toEqual(record);
    expect(await new ExpoVideoTransferDevice("00000000-0000-4000-8000-000000000012", target).load()).toBeNull();
  });
  it("verifies the actual staged content and reads only the requested prepared range", async () => {
    const device = new ExpoVideoTransferDevice(owner, target);
    expect(await device.verify(record.prepared)).toBe(true);
    expect(await device.readPart(record.prepared, 1, 2)).toEqual(new Uint8Array([2, 3]));
    videoNativeStorage.files.set(uri, new Uint8Array([4, 3, 2, 1]));
    expect(await device.verify(record.prepared)).toBe(false);
  });
  it("rejects original paths, forged authority and credentials in durable metadata", async () => {
    const device = new ExpoVideoTransferDevice(owner, target);
    await expect(device.save({ ...record, prepared: { ...record.prepared, uri: "file:///library/original.mp4" } })).rejects.toThrow("VIDEO_JOURNAL_INVALID");
    await expect(device.save({ ...record, ownerId: "00000000-0000-4000-8000-000000000012" })).rejects.toThrow("VIDEO_JOURNAL_INVALID");
    await expect(device.save(Object.assign({}, record, { presignedUrl: "https://private.test?secret" }))).rejects.toThrow("VIDEO_JOURNAL_INVALID");
  });
});
