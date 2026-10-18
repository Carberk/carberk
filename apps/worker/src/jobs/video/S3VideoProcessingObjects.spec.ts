import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { S3Client } from "@aws-sdk/client-s3";
import { describe, expect, it } from "vitest";

import { S3VideoProcessingObjects } from "./S3VideoProcessingObjects";
import { InMemoryS3VideoTransport } from "./testing/InMemoryS3VideoTransport";
import type { VideoProcessingLease } from "./VideoProcessingPorts";
const uploadId = "00000000-0000-4000-8000-000000000001";
const sessionId = "00000000-0000-4000-8000-000000000002";
const generationId = "00000000-0000-4000-8000-000000000003";
const bytes = Buffer.from("bounded exact source bytes");
const sha256 = createHash("sha256").update(bytes).digest("hex");
const lease: VideoProcessingLease = { uploadId, sessionId, generationId, completionFence: "fence", leaseToken: "lease", targetRevision: 1, sourceKey: `video/v1/${uploadId}/${sessionId}/source.mp4`, sizeBytes: bytes.length, sha256, posterMs: 0 };
describe("private processing byte storage", () => {
  it("downloads only the exact owned source and verifies length and full hash", async () => {
    const transport = new InMemoryS3VideoTransport(); transport.objects.set(`private-video/${lease.sourceKey}`, { bytes, type: "video/mp4" });
    const storage = new S3VideoProcessingObjects(transport as unknown as S3Client, "private-video");
    const local = await storage.download(lease);
    try { expect(await readFile(local.path)).toEqual(bytes); } finally { await local.dispose(); }
    await expect(storage.download({ ...lease, sha256: "0".repeat(64) })).rejects.toThrow("VIDEO_HASH_MISMATCH");
    await expect(storage.download({ ...lease, sourceKey: "pending/arbitrary/source.mp4" })).rejects.toThrow("VIDEO_SOURCE_INVALID");
  });
  it("creates immutable exact outputs and refuses conflicting existing bytes", async () => {
    const root = await mkdtemp(join(tmpdir(), "carberk-storage-test-"));
    try {
      await writeFile(join(root, "master.m3u8"), bytes);
      const transport = new InMemoryS3VideoTransport();
      const storage = new S3VideoProcessingObjects(transport as unknown as S3Client, "private-video");
      const asset = { path: "master.m3u8", key: `video/v1/${uploadId}/${generationId}/master.m3u8`, sizeBytes: bytes.length, sha256, purpose: "playback" as const, contentType: "application/vnd.apple.mpegurl" };
      await storage.publish(root, asset); await storage.publish(root, asset);
      expect(await storage.verify(asset)).toBe(true);
      expect(transport.objects.get(`private-video/${asset.key}`)?.bytes).toEqual(bytes);
      transport.objects.set(`private-video/${asset.key}`, { bytes: Buffer.from("conflict"), type: asset.contentType });
      await expect(storage.publish(root, asset)).rejects.toThrow("VIDEO_OBJECT_WRITE_FAILED");
      expect(await storage.verify(asset)).toBe(false);
      await expect(storage.publish(root, { ...asset, path: "source.mp4", key: lease.sourceKey })).rejects.toThrow("VIDEO_OUTPUT_INVALID");
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});
