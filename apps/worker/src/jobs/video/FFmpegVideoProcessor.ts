import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import { lstat, mkdtemp, mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join, isAbsolute } from "node:path";
import { tmpdir } from "node:os";

import { z } from "zod";

import type { PreparedVideoSource, ProcessedVideo, ProcessedVideoAsset, VideoMediaProcessor } from "./VideoMediaProcessor";
const probeSchema = z.object({ format: z.object({ duration: z.string(), format_name: z.string() }), streams: z.array(z.object({ codec_type: z.string(), codec_name: z.string(), width: z.number().optional(), height: z.number().optional(), avg_frame_rate: z.string().optional(), pix_fmt: z.string().optional(), color_transfer: z.string().optional(), channels: z.number().optional(), side_data_list: z.array(z.object({ rotation: z.number().optional() })).optional() })).max(2) });
/** Local adapter only. Durable worker must verify ownership/fences and read back all
 * returned objects before adoption. Nothing here marks a generation READY. */
export class FFmpegVideoProcessor implements VideoMediaProcessor {
    private busy = false;
    constructor(private readonly ffmpeg = "ffmpeg", private readonly ffprobe = "ffprobe", private readonly scratchRoot = tmpdir()) { }
    async process(source: PreparedVideoSource): Promise<ProcessedVideo> {
        if (this.busy)
            throw new Error("VIDEO_PROCESSOR_BUSY");
        this.busy = true;
        let directory: string | undefined;
        try {
            if (!isAbsolute(source.path) || !/^[a-f0-9]{64}$/.test(source.sha256))
                throw new Error("VIDEO_SOURCE_INVALID");
            const info = await lstat(source.path);
            if (!info.isFile() || info.isSymbolicLink() || info.size < 1 || info.size > 15 * 1024 * 1024)
                throw new Error("VIDEO_SOURCE_INVALID");
            if (await this.hash(source.path) !== source.sha256)
                throw new Error("VIDEO_HASH_MISMATCH");
            const facts = probeSchema.parse(JSON.parse(await this.run(this.ffprobe, ["-v", "error", "-protocol_whitelist", "file,pipe", "-show_format", "-show_streams", "-of", "json", source.path], 10000)));
            const video = facts.streams.find((track) => track.codec_type === "video");
            const audio = facts.streams.find((track) => track.codec_type === "audio");
            const durationMs = Math.round(Number(facts.format.duration) * 1000);
            const frameRate = (video?.avg_frame_rate ?? "0/1").split("/").map(Number);
            const fps = (frameRate[0] ?? 0) / (frameRate[1] ?? 1);
            if (!facts.format.format_name.split(",").some((name) => name === "mp4" || name === "mov") || !video || facts.streams.filter((track) => track.codec_type === "video").length !== 1 || video.codec_name !== "h264" || video.pix_fmt !== "yuv420p" || !video.width || !video.height || !Number.isFinite(fps) || fps <= 0 || fps > 30.01 || !Number.isFinite(durationMs) || durationMs <= 0 || Number(facts.format.duration) > 90 || video.width > (video.width >= video.height ? 1280 : 720) || video.height > (video.width >= video.height ? 720 : 1280) || ["smpte2084", "arib-std-b67"].includes(video.color_transfer ?? "") || video.side_data_list?.some((side) => side.rotation && side.rotation % 360 !== 0) || (audio && (audio.codec_name !== "aac" || (audio.channels ?? 0) > 2)) || facts.streams.some((track) => !["video", "audio"].includes(track.codec_type)))
                throw new Error("VIDEO_SOURCE_UNSUPPORTED");
            if (!Number.isInteger(source.posterMs) || source.posterMs < 0 || source.posterMs >= durationMs)
                throw new Error("VIDEO_POSTER_INVALID");
            await this.run(this.ffmpeg, ["-v", "error", "-xerror", "-nostdin", "-threads", "1", "-protocol_whitelist", "file,pipe", "-i", source.path, "-map", "0:v:0", "-map", "0:a:0?", "-f", "null", "-"], 120000);
            directory = await mkdtemp(join(this.scratchRoot, "carberk-video-job-"));
            const output = directory;
            const renditions: ProcessedVideo["renditions"] = [];
            let master = "#EXTM3U\n#EXT-X-VERSION:3\n";
            for (const label of [240, 360, 720] as const) {
                const landscape = video.width >= video.height;
                const envelopeWidth = landscape ? label * 16 / 9 : label;
                const envelopeHeight = landscape ? label : label * 16 / 9;
                const factor = Math.min(1, envelopeWidth / video.width, envelopeHeight / video.height);
                if (label !== 240 && factor === 1 && renditions.some((tier) => tier.width === video.width && tier.height === video.height))
                    continue;
                const width = Math.floor(video.width * factor / 2) * 2;
                const height = Math.floor(video.height * factor / 2) * 2;
                if (width < 2 || height < 2)
                    throw new Error("VIDEO_SOURCE_UNSUPPORTED");
                await mkdir(join(output, String(label)));
                const bitrate = label === 240 ? 240000 : label === 360 ? 480000 : 1200000;
                await this.run(this.ffmpeg, ["-v", "error", "-xerror", "-nostdin", "-threads", "1", "-protocol_whitelist", "file,pipe", "-i", source.path, "-map", "0:v:0", "-map", "0:a:0?", "-vf", `scale=${width}:${height}`, "-r", "30", "-c:v", "libx264", "-threads", "1", "-preset", "fast", "-pix_fmt", "yuv420p", "-profile:v", "main", "-b:v", String(bitrate), "-maxrate", String(bitrate), "-bufsize", String(bitrate * 2), "-g", "60", "-keyint_min", "60", "-sc_threshold", "0", "-c:a", "aac", "-b:a", "64000", "-ac", "2", "-f", "hls", "-hls_time", "2", "-hls_playlist_type", "vod", "-hls_list_size", "0", "-hls_segment_filename", join(output, String(label), "seg-%03d.ts"), join(output, String(label), "index.m3u8")], 180000);
                renditions.push({ label, width, height });
                master += `#EXT-X-STREAM-INF:BANDWIDTH=${bitrate + 96000},RESOLUTION=${width}x${height}\n${label}/index.m3u8\n`;
                if (factor === 1)
                    break;
            }
            await writeFile(join(output, "master.m3u8"), master);
            await this.run(this.ffmpeg, ["-v", "error", "-nostdin", "-ss", String(source.posterMs / 1000), "-protocol_whitelist", "file,pipe", "-i", source.path, "-frames:v", "1", "-vf", "scale=640:480:force_original_aspect_ratio=increase,crop=640:480", "-c:v", "mjpeg", "-threads", "1", join(output, "poster.jpg")], 30000);
            const assets = await this.inventory(output);
            if (!assets.some((asset) => asset.path === "poster.jpg"))
                throw new Error("VIDEO_POSTER_INVALID");
            const totalBytes = assets.reduce((sum, asset) => sum + asset.sizeBytes, 0);
            if (totalBytes > 100 * 1024 * 1024 || assets.length > 1024)
                throw new Error("VIDEO_OUTPUT_LIMIT");
            return { directory: output, durationMs, width: video.width, height: video.height, sourceSha256: source.sha256, renditions, assets, dispose: () => rm(output, { recursive: true, force: true }) };
        }
        catch (error) {
            if (directory)
                await rm(directory, { recursive: true, force: true });
            throw error;
        }
        finally {
            this.busy = false;
        }
    }
    private async hash(path: string): Promise<string> { const hash = createHash("sha256"); for await (const bytes of createReadStream(path))
        hash.update(bytes); return hash.digest("hex"); }
    private async inventory(root: string, relative = ""): Promise<ProcessedVideoAsset[]> {
        const assets: ProcessedVideoAsset[] = [];
        for (const entry of await readdir(join(root, relative), { withFileTypes: true })) {
            const path = relative ? `${relative}/${entry.name}` : entry.name;
            if (entry.isDirectory())
                assets.push(...await this.inventory(root, path));
            else {
                if (!entry.isFile() || !/^[A-Za-z0-9_/-]+\.(m3u8|ts|jpg)$/.test(path))
                    throw new Error("VIDEO_OUTPUT_INVALID");
                const bytes = await stat(join(root, path));
                if (!bytes.size)
                    throw new Error("VIDEO_OUTPUT_INVALID");
                assets.push({ path, sizeBytes: bytes.size, sha256: await this.hash(join(root, path)), purpose: path.endsWith(".jpg") ? "poster" : "playback", contentType: path.endsWith(".jpg") ? "image/jpeg" : path.endsWith(".ts") ? "video/mp2t" : "application/vnd.apple.mpegurl" });
            }
        }
        return assets;
    }
    private run(binary: string, args: string[], timeout: number): Promise<string> {
        return new Promise((resolve, reject) => {
            const child = spawn(binary, args, { stdio: ["ignore", "pipe", "pipe"], signal: AbortSignal.timeout(timeout) });
            let stdout = "", outputBytes = 0;
            let overflow = false;
            child.stdout.on("data", (chunk: Buffer) => { outputBytes += chunk.length; if (outputBytes > 128 * 1024) {
                overflow = true;
                child.kill("SIGKILL");
            }
            else
                stdout += chunk.toString(); });
            child.stderr.on("data", (chunk: Buffer) => { outputBytes += chunk.length; if (outputBytes > 128 * 1024) {
                overflow = true;
                child.kill("SIGKILL");
            } });
            child.on("error", () => reject(new Error("VIDEO_CODEC_UNAVAILABLE")));
            child.on("close", (code) => { if (code !== 0 || overflow)
                reject(new Error("VIDEO_CODEC_FAILED"));
            else
                resolve(stdout); });
        });
    }
}
