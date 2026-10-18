import type { S3Client } from "@aws-sdk/client-s3";
import { describe, expect, it } from "vitest";
import { S3VideoCleanupObjects } from "./S3VideoCleanupObjects";
import type { VideoCleanupLease } from "./VideoCleanupPorts";
import { InMemoryS3VideoCleanup } from "./testing/InMemoryS3VideoCleanup";
const uploadId = "00000000-0000-4000-8000-000000000001", sessionId = "00000000-0000-4000-8000-000000000002";
const prefix = `video/v1/${uploadId}/${sessionId}/`;
const work: VideoCleanupLease = { id: `session:${sessionId}`, uploadId, sessionId, generationId: sessionId, sourceKey: `${prefix}source.mp4`, objectKeys: [`${prefix}master.m3u8`, `${prefix}240/seg-000.ts`, `${prefix}poster.jpg`], token: "lease", verifying: false };
function fixture() {
  const transport = new InMemoryS3VideoCleanup();
  for (const key of [work.sourceKey, ...work.objectKeys, "unrelated/private.mp4"]) transport.objects.add(key);
  transport.multipart.set("lost-init", work.sourceKey);
  transport.multipart.set("other", "unrelated/private.mp4");
  return { transport, storage: new S3VideoCleanupObjects(transport as unknown as S3Client, "private-video") };
}
describe("finite private video deletion", () => {
  it("aborts uncertain initialization and removes only the exact finite inventory", async () => {
    const f = fixture(); await f.storage.removeAndVerify(work);
    expect([...f.transport.objects]).toEqual(["unrelated/private.mp4"]);
    expect([...f.transport.multipart]).toEqual([["other", "unrelated/private.mp4"]]);
    await expect(f.storage.removeAndVerify(work)).resolves.toBeUndefined();
  });
  it.each(["Enabled", "Suspended"] as const)("keeps bytes when bucket versioning is %s", async versioning => {
    const f = fixture(); f.transport.versioning = versioning;
    await expect(f.storage.removeAndVerify(work)).rejects.toThrow("VIDEO_CLEANUP_VERSIONED_BUCKET");
    expect(f.transport.objects.size).toBe(5); expect(f.transport.multipart.size).toBe(2);
  });
  it.each(["holdDeletes", "holdAborts", "failHeads", "truncated"] as const)("does not declare absence when %s", async fault => {
    const f = fixture(); f.transport[fault] = true;
    await expect(f.storage.removeAndVerify(work)).rejects.toThrow({ holdDeletes: "VIDEO_CLEANUP_OBJECT_PRESENT", holdAborts: "VIDEO_CLEANUP_MULTIPART_PRESENT", failHeads: "Unavailable", truncated: "VIDEO_CLEANUP_MULTIPART_LIMIT" }[fault]);
  });
  it("refuses unowned or traversal keys before touching storage", async () => {
    const f = fixture();
    await expect(f.storage.removeAndVerify({ ...work, objectKeys: ["unrelated/private.mp4"] })).rejects.toThrow("VIDEO_CLEANUP_INVENTORY_INVALID");
    await expect(f.storage.removeAndVerify({ ...work, sourceKey: `${prefix}../source.mp4` })).rejects.toThrow("VIDEO_CLEANUP_INVENTORY_INVALID");
    expect(f.transport.objects.size).toBe(5); expect(f.transport.multipart.size).toBe(2);
  });
});
