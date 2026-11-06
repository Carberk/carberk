import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { PrismaService } from "@auto-tm/db";
import { Inject, Injectable, Logger } from "@nestjs/common";
import sharp from "sharp";

import { VIDEO_PROCESSING_STORAGE } from "./VideoProcessingStorage";
import type { VideoProcessingStorage } from "./VideoProcessingStorage";

const MAX_BYTES = 15 * 1024 * 1024;
const MAX_DURATION_SECONDS = 90;
const MAX_ATTEMPTS = 3;
const FFMPEG_TIMEOUT_MS = 120_000;
const FFMPEG_PATH = process.env["FFMPEG_PATH"] ?? "ffmpeg";
const FFMPEG_THREADS = process.env["FFMPEG_THREADS"] === "auto" ? "1" : (process.env["FFMPEG_THREADS"] ?? "1");
const COVER_SPECS = [
  ["thumbnail", 200, 200],
  ["list", 600, 400],
  ["detail", 1200, 800],
  ["fullscreen", 2400, 1600],
] as const;

export interface VideoProcessingJob {
  sourceId: string;
  generationId: string;
  attempt: number;
}

interface ProbeStream {
  codec_type?: string;
  codec_name?: string;
  width?: number;
  height?: number;
  pix_fmt?: string;
  r_frame_rate?: string;
  color_transfer?: string;
  color_space?: string;
}
interface ProbeResult {
  format?: { duration?: string; size?: string };
  streams?: ProbeStream[];
}

function run(command: string, args: string[], timeoutMs = FFMPEG_TIMEOUT_MS): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
    const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("FFmpeg processing timed out")); }, timeoutMs);
    child.once("error", (error) => { clearTimeout(timer); reject(error); });
    child.once("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(stderr.slice(-2_000) || `FFmpeg exited with ${code ?? "unknown"}`));
    });
  });
}

function parseRate(rate: string | undefined): number {
  if (!rate) return 0;
  const [numerator = 0, denominator = 0] = rate.split("/").map(Number);
  return denominator > 0 ? numerator / denominator : 0;
}

function processingPrefix(sourceKey: string, attempt: number): string {
  return `${sourceKey.replace(/\/source\.mp4$/, "")}/processing/${attempt}`;
}

function coverOffset(duration: number, offsetMs: number): number {
  // An exact-duration candidate is valid at the boundary: ask FFmpeg for the
  // final decodable frame rather than seeking beyond EOF.
  if (offsetMs >= Math.round(duration * 1000)) return Math.max(0, duration - 0.001);
  return Math.max(0, offsetMs / 1000);
}

@Injectable()
export class ListingVideoProcessor {
  private readonly logger = new Logger(ListingVideoProcessor.name);

  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Inject(VIDEO_PROCESSING_STORAGE) private readonly storage: VideoProcessingStorage,
  ) {}

  async process(job: VideoProcessingJob): Promise<void> {
    const generation = await this.prisma.videoGeneration.findUnique({ where: { id: job.generationId }, include: { source: true } });
    if (!generation || generation.sourceId !== job.sourceId || generation.processingAttempt !== job.attempt || generation.status !== "Processing") return;
    const workDir = await mkdtemp(join(tmpdir(), "carberk-video-"));
    try {
      const sourceHead = await this.storage.head(generation.source.objectKey);
      if (!sourceHead) throw new Error("Stored video source is missing");
      if (sourceHead.sizeBytes > MAX_BYTES) throw new Error("Video exceeds 15 MiB");
      if (sourceHead.sizeBytes !== generation.source.sizeBytes) throw new Error("Stored video size does not match the server record");
      const source = await this.storage.get(generation.source.objectKey);
      if (source.body.byteLength > MAX_BYTES) throw new Error("Video exceeds 15 MiB");
      if (source.body.byteLength !== generation.source.sizeBytes) throw new Error("Stored video size does not match the server record");
      const input = join(workDir, "source.mp4");
      await writeFile(input, source.body, { mode: 0o600 });
      const probe = await this.probe(input);
      const validated = this.validate(probe, source.body.byteLength);
      const actualDurationMs = Math.round(validated.duration * 1000);
      if (generation.coverOffsetMs > actualDurationMs) throw new Error("Cover offset is beyond the actual video duration");
      await this.decode(input);
      const prefix = processingPrefix(generation.source.objectKey, job.attempt);
      const manifest: Record<string, string> = {};
      const offset = coverOffset(validated.duration, generation.coverOffsetMs);
      for (const [name, width, height] of COVER_SPECS) {
        await this.assertAttemptActive(job);
        const output = join(workDir, `${name}.png`);
        await run(FFMPEG_PATH, ["-y", "-hide_banner", "-loglevel", "error", "-max_alloc", "67108864", "-threads", FFMPEG_THREADS, "-ss", String(offset), "-i", input, "-frames:v", "1", "-vf", `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}`, "-f", "image2", output]);
        const key = `${prefix}/covers/${name}.webp`;
        await this.storage.put(key, await sharp(await readFile(output)).webp({ quality: 80 }).toBuffer(), "image/webp");
        manifest[`cover:${name}`] = key;
      }
      const tiers = [240, 360, 720].filter((tier) => tier <= (validated.height >= validated.width ? validated.height : validated.width));
      for (const tier of tiers) {
        await this.assertAttemptActive(job);
        const playlist = join(workDir, `${tier}.m3u8`);
        const segmentPattern = join(workDir, `${tier}-%03d.ts`);
        const scale = validated.height >= validated.width ? `scale=-2:min(${tier}\\,ih)` : `scale=min(${tier}\\,iw):-2`;
        await run(FFMPEG_PATH, ["-y", "-hide_banner", "-loglevel", "error", "-max_alloc", "67108864", "-threads", FFMPEG_THREADS, "-i", input, "-vf", scale, "-c:v", "libx264", "-preset", "veryfast", "-b:v", `${tier}k`, "-maxrate", `${tier}k`, "-bufsize", `${tier * 2}k`, "-c:a", "aac", "-f", "hls", "-hls_time", "4", "-hls_playlist_type", "vod", "-hls_segment_filename", segmentPattern, playlist]);
        const playlistKey = `${prefix}/hls/${tier}p/index.m3u8`;
        const playlistText = (await readFile(playlist, "utf8")).replace(/(\S+\.ts)/g, (member) => `${prefix}/hls/${tier}p/${member}`);
        await this.storage.put(playlistKey, Buffer.from(playlistText), "application/vnd.apple.mpegurl");
        manifest[`playlist:${tier}`] = playlistKey;
        for (const key of await this.uploadSegments(workDir, prefix, tier)) manifest[`segment:${tier}:${key.split("/").pop() ?? key}`] = key;
      }
      const masterKey = `${prefix}/hls/master.m3u8`;
      const master = tiers.map((tier) => `#EXT-X-STREAM-INF:BANDWIDTH=${tier * 1000},RESOLUTION=${validated.height >= validated.width ? Math.max(2, Math.round(validated.width * tier / validated.height)) : tier}x${Math.max(2, Math.round(validated.height * tier / validated.width))}\n${prefix}/hls/${tier}p/index.m3u8`).join("\n");
      await this.assertAttemptActive(job);
      await this.storage.put(masterKey, Buffer.from(`#EXTM3U\n#EXT-X-VERSION:3\n${master}\n`), "application/vnd.apple.mpegurl");
      manifest["master"] = masterKey;
      for (const key of Object.values(manifest)) {
        if (!await this.storage.head(key)) throw new Error(`Processing output missing: ${key}`);
      }
      await this.prisma.videoGeneration.updateMany({ where: { id: job.generationId, processingAttempt: job.attempt, status: "Processing" }, data: { status: "Ready", manifest, durationMs: actualDurationMs, width: validated.width, height: validated.height, videoCodec: validated.videoCodec, audioCodec: validated.audioCodec, processingStartedAt: generation.processingStartedAt ?? new Date(), completedAt: new Date(), lastError: null } });
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 500) : "Video processing failed";
      await this.prisma.videoGeneration.updateMany({ where: { id: job.generationId, processingAttempt: job.attempt, status: "Processing" }, data: { status: job.attempt >= MAX_ATTEMPTS ? "Failed" : "Failed", lastError: message } });
      this.logger.warn(`Video processing attempt ${job.attempt} failed: ${message}`);
      throw error;
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
  }

  private async probe(input: string): Promise<ProbeResult> {
    const probePath = process.env["FFPROBE_PATH"] ?? (FFMPEG_PATH === "ffmpeg" ? "ffprobe" : FFMPEG_PATH.replace(/ffmpeg(?:\.exe)?$/, "ffprobe"));
    const { stdout } = await run(probePath, ["-v", "error", "-max_alloc", "67108864", "-print_format", "json", "-show_format", "-show_streams", input]);
    return JSON.parse(stdout) as ProbeResult;
  }

  private validate(probe: ProbeResult, sizeBytes: number): { duration: number; width: number; height: number; videoCodec: string; audioCodec: string | null } {
    const video = probe.streams?.find((stream) => stream.codec_type === "video");
    const audio = probe.streams?.find((stream) => stream.codec_type === "audio");
    const duration = Number(probe.format?.duration ?? 0);
    if (!video || !Number.isFinite(duration) || duration <= 0 || duration > MAX_DURATION_SECONDS || sizeBytes > MAX_BYTES) throw new Error("Video duration, size or stream is invalid");
    if (video.codec_name !== "h264" || !video.width || !video.height || video.width > 1280 || video.height > 1280 || (video.width > 720 && video.height > 720) || parseRate(video.r_frame_rate) > 30 || ["bt2020", "smpte2084", "arib-std-b67"].includes(video.color_transfer ?? "") || video.color_space === "bt2020nc") throw new Error("Video codec, dimensions, frame rate or color space is unsupported");
    if (audio && audio.codec_name !== "aac") throw new Error("Audio codec is unsupported");
    return { duration, width: video.width, height: video.height, videoCodec: "h264", audioCodec: audio?.codec_name ?? null };
  }

  private async decode(input: string): Promise<void> { await run(FFMPEG_PATH, ["-v", "error", "-max_alloc", "67108864", "-threads", FFMPEG_THREADS, "-i", input, "-map", "0:v:0", "-map", "0:a?", "-f", "null", "-"]); }

  private async assertAttemptActive(job: VideoProcessingJob): Promise<void> {
    const active = await this.prisma.videoGeneration.findUnique({ where: { id: job.generationId }, select: { processingAttempt: true, status: true } });
    if (!active || active.processingAttempt !== job.attempt || active.status !== "Processing") throw new Error("Video processing attempt was revoked");
  }

  private async uploadSegments(workDir: string, prefix: string, tier: number): Promise<string[]> {
    const keys: string[] = [];
    const names = (await import("node:fs/promises")).readdir(workDir).then((names) => names.filter((name) => name.startsWith(`${tier}-`) && name.endsWith(".ts")));
    for (const name of await names) { const key = `${prefix}/hls/${tier}p/${name}`; await this.storage.put(key, await readFile(join(workDir, name)), "video/mp2t"); keys.push(key); }
    return keys;
  }
}
