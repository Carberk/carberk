import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { FFmpegVideoProcessor } from "./FFmpegVideoProcessor";
const run = promisify(execFile);
describe("real FFmpeg prepared-video processing", () => {
  let root: string; let source: string; let sha256: string;
  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), "carberk-video-processor-test-")); source = join(root, "source.mp4");
    await run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc2=size=640x360:rate=30", "-t", "1", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-an", source], { timeout: 30_000 });
    sha256 = createHash("sha256").update(await readFile(source)).digest("hex");
  }, 40_000);
  afterAll(async () => { if (root) await rm(root, { recursive: true, force: true }); });
  it("decodes actual bytes into adaptive tiers and an authoritative poster without upscaling", async () => {
    const output = await new FFmpegVideoProcessor().process({ path: source, sha256, posterMs: 0 });
    try {
      expect(output.durationMs).toBe(1000); expect(output.sourceSha256).toBe(sha256);
      expect(output.renditions).toEqual([{ label: 240, width: 426, height: 240 }, { label: 360, width: 640, height: 360 }]);
      expect(output.assets.some((asset) => asset.path === "master.m3u8")).toBe(true);
      expect(output.assets.some((asset) => asset.purpose === "poster")).toBe(true);
      const master = await readFile(join(output.directory, "master.m3u8"), "utf8"); expect(master).toContain("240/index.m3u8"); expect(master).toContain("360/index.m3u8"); expect(master).not.toContain("720/");
      await run("ffmpeg", ["-v", "error", "-i", join(output.directory, "360/index.m3u8"), "-f", "null", "-"], { timeout: 30_000 });
    } finally { await output.dispose(); }
  }, 90_000);
  it("rejects a hash mismatch and an out-of-interval poster before publishing output", async () => {
    const processor = new FFmpegVideoProcessor();
    await expect(processor.process({ path: source, sha256: "0".repeat(64), posterMs: 0 })).rejects.toThrow("VIDEO_HASH_MISMATCH");
    await expect(processor.process({ path: source, sha256, posterMs: 1000 })).rejects.toThrow("VIDEO_POSTER_INVALID");
  });
});
