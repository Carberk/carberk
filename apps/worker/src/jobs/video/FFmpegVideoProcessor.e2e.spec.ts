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
    let root: string;
    let source: string;
    let sha256: string;
    beforeAll(async () => {
        root = await mkdtemp(join(tmpdir(), "carberk-video-processor-test-"));
        source = join(root, "source.mp4");
        await run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc2=size=640x360:rate=30", "-t", "1", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-an", source], { timeout: 30000 });
        sha256 = createHash("sha256").update(await readFile(source)).digest("hex");
    }, 40000);
    afterAll(async () => { if (root)
        await rm(root, { recursive: true, force: true }); });
    it("decodes actual bytes into adaptive tiers and an authoritative poster without upscaling", async () => {
        const output = await new FFmpegVideoProcessor().process({ path: source, sha256, posterMs: 0 });
        try {
            expect(output.durationMs).toBe(1000);
            expect(output.sourceSha256).toBe(sha256);
            expect(output.renditions).toEqual([{ label: 240, width: 426, height: 240 }, { label: 360, width: 640, height: 360 }]);
            expect(output.assets.some((asset) => asset.path === "master.m3u8")).toBe(true);
            expect(output.assets.some((asset) => asset.purpose === "poster")).toBe(true);
            const master = await readFile(join(output.directory, "master.m3u8"), "utf8");
            expect(master).toContain("240/index.m3u8");
            expect(master).toContain("360/index.m3u8");
            expect(master).not.toContain("720/");
            await run("ffmpeg", ["-v", "error", "-i", join(output.directory, "360/index.m3u8"), "-f", "null", "-"], { timeout: 30000 });
        }
        finally {
            await output.dispose();
        }
    }, 90000);
    it("preserves portrait orientation and AAC audio while every generated tier decodes", async () => {
        const portrait = join(root, "portrait.mp4");
        await run("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "testsrc2=size=360x640:rate=24", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000", "-t", "1", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-ac", "1", portrait], { timeout: 30_000 });
        const hash = createHash("sha256").update(await readFile(portrait)).digest("hex");
        const output = await new FFmpegVideoProcessor().process({ path: portrait, sha256: hash, posterMs: 500 });
        try {
            expect(output.renditions).toEqual([{ label: 240, width: 240, height: 426 }, { label: 360, width: 360, height: 640 }]);
            for (const tier of output.renditions) {
                const playlist = join(output.directory, String(tier.label), "index.m3u8");
                await run("ffmpeg", ["-v", "error", "-xerror", "-i", playlist, "-f", "null", "-"], { timeout: 30_000 });
                const facts = JSON.parse((await run("ffprobe", ["-v", "error", "-show_streams", "-of", "json", playlist])).stdout);
                expect(facts.streams.some((stream: { codec_name: string }) => stream.codec_name === "aac")).toBe(true);
            }
            const poster = JSON.parse((await run("ffprobe", ["-v", "error", "-show_streams", "-of", "json", join(output.directory, "poster.jpg")])).stdout);
            expect(poster.streams[0]).toMatchObject({ width: 640, height: 480, codec_name: "mjpeg" });
        } finally { await output.dispose(); }
    }, 90_000);
    it("rejects HDR and oversized prepared media rather than silently changing the accepted contract", async () => {
        for (const [name, size, transfer] of [["hdr", "640x360", "smpte2084"], ["oversized", "1920x1080", "bt709"]]) {
            const path = join(root, `${name}.mp4`);
            await run("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", `color=size=${size}:rate=30`, "-t", "0.1", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-x264-params", `transfer=${transfer}:colorprim=bt2020:colormatrix=bt2020nc`, path], { timeout: 30_000 });
            const hash = createHash("sha256").update(await readFile(path)).digest("hex");
            await expect(new FFmpegVideoProcessor().process({ path, sha256: hash, posterMs: 0 })).rejects.toThrow("VIDEO_SOURCE_UNSUPPORTED");
        }
    }, 90_000);
    it("rejects a hash mismatch and an out-of-interval poster before publishing output", async () => {
        const processor = new FFmpegVideoProcessor();
        await expect(processor.process({ path: source, sha256: "0".repeat(64), posterMs: 0 })).rejects.toThrow("VIDEO_HASH_MISMATCH");
        await expect(processor.process({ path: source, sha256, posterMs: 1000 })).rejects.toThrow("VIDEO_POSTER_INVALID");
    });
});
