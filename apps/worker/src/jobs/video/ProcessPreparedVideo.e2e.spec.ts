import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { beforeAll, afterAll, describe, expect, it } from "vitest";

import { FFmpegVideoProcessor } from "./FFmpegVideoProcessor";
import { ProcessPreparedVideo } from "./ProcessPreparedVideo";
import { InMemoryVideoProcessingLedger, InMemoryVideoProcessingObjects } from "./testing/InMemoryVideoProcessing";
const run = promisify(execFile);
describe("real prepared bytes through processing publication", () => {
  let root: string, source: string, hash: string;
  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), "carberk-video-workflow-")); source = join(root, "source.mp4");
    await run("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "testsrc2=size=320x240:rate=30", "-t", "0.5", "-c:v", "libx264", "-pix_fmt", "yuv420p", source], { timeout: 30_000 });
    hash = createHash("sha256").update(await readFile(source)).digest("hex");
  });
  afterAll(async () => { if (root) await rm(root, { recursive: true, force: true }); });
  function fixture() {
    const ledger = new InMemoryVideoProcessingLedger({ generationId: "generation", uploadId: "upload", sessionId: "session", leaseToken: "lease", completionFence: "fence", targetRevision: 1, sourceKey: "video/v1/upload/session/source.mp4", sizeBytes: 1000, sha256: hash, posterMs: 0 });
    const objects = new InMemoryVideoProcessingObjects(source, ledger);
    return { ledger, objects, service: new ProcessPreparedVideo(ledger, objects, new FFmpegVideoProcessor(), () => new Date("2026-10-17T00:00:00Z"), () => "lease") };
  }
  it("makes exact encoded bytes ready only after durable intent and full readback", async () => {
    const f = fixture();
    expect(await f.service.execute("generation")).toBe("adopted");
    expect(f.ledger.ready).toMatchObject({ sourceSha256: hash, durationMs: 500, width: 320, height: 240 });
    if (!f.ledger.ready) throw new Error("Expected adopted generation");
    expect(f.ledger.ready.assets.length).toBe(f.objects.bytes.size);
    expect(f.ledger.ready.assets.every(asset => asset.key.startsWith("video/v1/upload/generation/") && /^[a-f0-9]{64}$/.test(asset.sha256))).toBe(true);
  });
  it("never adopts a completed encode with failed object readback", async () => {
    const f = fixture(); f.objects.corruptReadback = true;
    expect(await f.service.execute("generation")).toBe("failed");
    expect(f.ledger.ready).toBeNull(); expect(f.ledger.failure).toBe("VIDEO_READBACK_FAILED");
    expect(f.ledger.planned.length).toBeGreaterThan(0);
  });
  it("lets cancellation win after object publication while retaining every cleanup key", async () => {
    const f = fixture(); f.objects.afterPublish = () => { f.ledger.cancelled = true; };
    expect(await f.service.execute("generation")).toBe("superseded");
    expect(f.ledger.ready).toBeNull();
    expect(f.ledger.planned.map(asset => asset.key).sort()).toEqual([...f.objects.bytes.keys()].sort());
  });
});
