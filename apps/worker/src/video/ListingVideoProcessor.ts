import { spawn } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { PrismaService, retireVideoGenerations } from "@auto-tm/db";
import { Inject, Injectable, Logger, Optional } from "@nestjs/common";
import sharp from "sharp";

import { VIDEO_PROCESSING_STORAGE } from "./VideoProcessingStorage";
import type { VideoProcessingStorage } from "./VideoProcessingStorage";
import { LogVideoProcessingTelemetry, VIDEO_PROCESSING_TELEMETRY } from "./VideoProcessingTelemetry";
import type { VideoProcessingTelemetry } from "./VideoProcessingTelemetry";

const MAX_BYTES = 15 * 1024 * 1024;
const MAX_DURATION_SECONDS = 90;
const MAX_ATTEMPTS = 3;
const RETRY_BACKOFF_MS = 5_000;
const FFMPEG_TIMEOUT_MS = 120_000;
const FFMPEG_PATH = process.env["FFMPEG_PATH"] ?? "ffmpeg";
const FFMPEG_THREADS = process.env["FFMPEG_THREADS"] === "auto" ? "1" : (process.env["FFMPEG_THREADS"] ?? "1");
const COVER_SPECS = [["thumbnail", 200, 200], ["list", 600, 400], ["detail", 1200, 800], ["fullscreen", 2400, 1600]] as const;

export interface VideoProcessingJob { sourceId: string; generationId: string; attempt: number; }
type FailureType = "SOURCE_MISSING" | "SOURCE_INVALID" | "TRANSIENT";
type ManifestRecord = { key: string; sizeBytes: number; etag: string | null };
interface ProbeStream { codec_type?: string; codec_name?: string; width?: number; height?: number; bit_rate?: string; pix_fmt?: string; r_frame_rate?: string; color_transfer?: string; color_space?: string; }
interface ProbeResult { format?: { duration?: string; size?: string; bit_rate?: string }; streams?: ProbeStream[]; }

class SourceVideoError extends Error { constructor(message: string, readonly failureType: Exclude<FailureType, "TRANSIENT">) { super(message); } }

function run(command: string, args: string[], timeoutMs = FFMPEG_TIMEOUT_MS): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = ""; let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
    const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("FFmpeg processing timed out")); }, timeoutMs);
    child.once("error", (error) => { clearTimeout(timer); reject(error); });
    child.once("close", (code) => { clearTimeout(timer); if (code === 0) resolve({ stdout, stderr }); else reject(new Error(stderr.slice(-2_000) || `FFmpeg exited with ${code ?? "unknown"}`)); });
  });
}

function parseRate(rate: string | undefined): number { if (!rate) return 0; const [numerator = 0, denominator = 0] = rate.split("/").map(Number); return denominator > 0 ? numerator / denominator : 0; }
function processingPrefix(sourceKey: string, attempt: number): string { return `${sourceKey.replace(/\/source\.mp4$/, "")}/processing/${attempt}`; }
function coverOffset(duration: number, offsetMs: number): number { return offsetMs >= Math.round(duration * 1000) ? Math.max(0, duration - 0.001) : Math.max(0, offsetMs / 1000); }

@Injectable()
export class ListingVideoProcessor {
  private readonly logger = new Logger(ListingVideoProcessor.name);
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(VIDEO_PROCESSING_STORAGE) private readonly storage: VideoProcessingStorage,
    @Optional() @Inject(VIDEO_PROCESSING_TELEMETRY) private readonly telemetry: VideoProcessingTelemetry = new LogVideoProcessingTelemetry(),
  ) {}

  async process(job: VideoProcessingJob, attemptsStarted = 1): Promise<void> {
    const generation = await this.prisma.videoGeneration.findUnique({ where: { id: job.generationId }, include: { source: true } });
    if (!generation || generation.sourceId !== job.sourceId || generation.processingAttempt !== job.attempt || generation.status !== "Processing") return;
    const startedAt = Date.now();
    if (attemptsStarted > 1) {
      // BullMQ has recovered a lost execution lock. Never reuse output keys
      // whose initialization or PUT may still be in flight from that worker.
      await this.recordFailure(job, generation, new Error("Worker execution was abandoned"), "Worker execution was abandoned", startedAt);
      return;
    }
    const workDir = await mkdtemp(join(tmpdir(), "carberk-video-"));
    try {
      const sourceHead = await this.storage.head(generation.source.objectKey);
      if (!sourceHead) throw new SourceVideoError("Stored video source is missing", "SOURCE_MISSING");
      if (sourceHead.sizeBytes > MAX_BYTES || sourceHead.sizeBytes !== generation.source.sizeBytes) throw new SourceVideoError("Stored video size does not match the server record", "SOURCE_INVALID");
      let source;
      try { source = await this.storage.get(generation.source.objectKey); } catch (error) {
        const missing = error instanceof Error && /NoSuchKey|NotFound/i.test(error.message);
        if (missing) throw new SourceVideoError("Stored video source is missing", "SOURCE_MISSING");
        if (error instanceof Error && /maximum body size/i.test(error.message)) throw new SourceVideoError(error.message, "SOURCE_INVALID");
        throw error;
      }
      if (source.body.byteLength > MAX_BYTES || source.body.byteLength !== generation.source.sizeBytes) throw new SourceVideoError("Stored video size does not match the server record", "SOURCE_INVALID");
      const input = join(workDir, "source.mp4"); await writeFile(input, source.body, { mode: 0o600 });
      let probe: ProbeResult; try { probe = await this.probe(input); } catch { throw new SourceVideoError("Video source is invalid", "SOURCE_INVALID"); }
      const validated = this.validate(probe, source.body.byteLength);
      const actualDurationMs = Math.round(validated.duration * 1000);
      if (generation.coverOffsetMs > actualDurationMs) throw new SourceVideoError("Cover offset is beyond the actual video duration", "SOURCE_INVALID");
      try { await this.decode(input); } catch { throw new SourceVideoError("Video source does not decode cleanly", "SOURCE_INVALID"); }

      const prefix = processingPrefix(generation.source.objectKey, job.attempt);
      const manifest: Record<string, ManifestRecord> = {};
      const offset = coverOffset(validated.duration, generation.coverOffsetMs);
      for (const [name, width, height] of COVER_SPECS) {
        const output = join(workDir, `${name}.png`);
        await run(FFMPEG_PATH, ["-y", "-hide_banner", "-loglevel", "error", "-max_alloc", "67108864", "-threads", FFMPEG_THREADS, "-ss", String(offset), "-i", input, "-frames:v", "1", "-vf", `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}`, "-f", "image2", output]);
        await this.writeOutput(job, `${prefix}/covers/${name}.webp`, await sharp(await readFile(output)).webp({ quality: 80 }).toBuffer(), "image/webp", manifest, `cover:${name}`);
      }

      const tiers = [240, 360, 720].filter((tier) => tier <= Math.min(validated.height, validated.width));
      if (tiers.length === 0) throw new SourceVideoError("Video is too small to produce a playable tier", "SOURCE_INVALID");
      const hasAudio = validated.audioCodec !== null;
      const variants: string[] = [];
      for (const tier of tiers) {
        const playlist = join(workDir, `${tier}.m3u8`); const segmentPattern = join(workDir, `${tier}-%03d.ts`);
        const scale = validated.height >= validated.width ? `scale=${tier}:-2` : `scale=-2:${tier}`;
        await run(FFMPEG_PATH, ["-y", "-hide_banner", "-loglevel", "error", "-max_alloc", "67108864", "-threads", FFMPEG_THREADS, "-i", input, "-vf", scale, "-c:v", "libx264", "-preset", "veryfast", "-b:v", `${tier}k`, "-maxrate", `${tier}k`, "-bufsize", `${tier * 2}k`, "-g", "120", "-keyint_min", "120", "-sc_threshold", "0", "-force_key_frames", "expr:gte(t,n_forced*4)", ...(hasAudio ? ["-c:a", "aac", "-b:a", "128k"] : ["-an"]), "-f", "hls", "-hls_time", "4", "-hls_playlist_type", "vod", "-hls_flags", "independent_segments", "-master_pl_name", `${tier}-master.m3u8`, "-hls_segment_filename", segmentPattern, playlist]);
        const playlistKey = `${prefix}/hls/${tier}p/index.m3u8`;
        // The muxer reads codec profile/compatibility/level and dimensions from
        // the encoded stream, including the scaler's even-pixel rounding.
        const streamInfo = (await readFile(join(workDir, `${tier}-master.m3u8`), "utf8")).split("\n").find((line) => line.startsWith("#EXT-X-STREAM-INF:"));
        if (!streamInfo || !streamInfo.includes("CODECS=") || !streamInfo.includes("RESOLUTION=")) throw new Error("Encoded rendition metadata is missing");
        variants.push(`${streamInfo}\n${playlistKey}`);
        const playlistText = (await readFile(playlist, "utf8")).replace(/(\S+\.ts)/g, (member) => `${prefix}/hls/${tier}p/${member}`);
        await this.writeOutput(job, playlistKey, Buffer.from(playlistText), "application/vnd.apple.mpegurl", manifest, `playlist:${tier}`);
        await this.uploadSegments(workDir, prefix, tier, job, manifest);
      }
      const masterKey = `${prefix}/hls/master.m3u8`;
      const master = variants.join("\n");
      await this.writeOutput(job, masterKey, Buffer.from(`#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-INDEPENDENT-SEGMENTS\n${master}\n`), "application/vnd.apple.mpegurl", manifest, "master");
      for (const record of Object.values(manifest)) {
        const head = await this.storage.head(record.key);
        if (!head || head.sizeBytes !== record.sizeBytes || (record.etag && head.etag && record.etag !== head.etag)) throw new Error(`Processing output missing or changed: ${record.key}`);
      }
      const promoted = await this.prisma.$transaction(async (tx) => {
        const initialSlot = await tx.listingVideo.findUnique({ where: { id: generation.listingVideoId } });
        if (!initialSlot) return false;
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${initialSlot.ownerId} FOR UPDATE`;
        // Publishing a Draft takes the same owner lock before transferring its
        // slot, so resolve the canonical target only after that lock is held.
        const target = await tx.listingVideo.findUnique({ where: { id: initialSlot.id } });
        if (!target) return false;
        const owner = await tx.user.findUnique({ where: { id: target.ownerId } });
        if (!owner || owner.suspendedAt || owner.deletionScheduledAt) throw new Error("Video target is ineligible");
        if (target.draftId) {
          await tx.$queryRaw`SELECT id FROM listing_drafts WHERE id = ${target.draftId} FOR UPDATE`;
          const draft = await tx.listingDraft.findUnique({ where: { id: target.draftId } });
          if (draft?.userId !== owner.id) throw new Error("Video target is ineligible");
        } else {
          await tx.$queryRaw`SELECT id FROM listings WHERE id = ${target.listingId} FOR UPDATE`;
          const listing = target.listingId ? await tx.listing.findUnique({ where: { id: target.listingId } }) : null;
          if (!listing || listing.sellerId !== owner.id || listing.deletedAt || listing.status === "banned") throw new Error("Video target is ineligible");
        }
        await tx.$queryRaw`SELECT id FROM listing_videos WHERE id = ${generation.listingVideoId} FOR UPDATE`;
        const slot = await tx.listingVideo.findUnique({ where: { id: generation.listingVideoId } });
        if (!slot || slot.pendingGenerationId !== job.generationId) return false;
        const ready = await tx.videoGeneration.updateMany({ where: { id: job.generationId, processingAttempt: job.attempt, status: "Processing" }, data: { status: "Ready", manifest, durationMs: actualDurationMs, width: validated.width, height: validated.height, videoCodec: validated.videoCodec, audioCodec: validated.audioCodec, processingStartedAt: generation.processingStartedAt ?? new Date(), completedAt: new Date(), lastError: null, failureType: null, nextRetryAt: null } });
        if (!ready.count) return false;
        await tx.listingVideo.update({ where: { id: slot.id }, data: { activeGenerationId: job.generationId, pendingGenerationId: null } });
        if (slot.activeGenerationId) await retireVideoGenerations(tx, slot.id, [slot.activeGenerationId], new Date());
        return true;
      });
      if (promoted) {
        const bytes = (covers: boolean) => Object.entries(manifest).filter(([name]) => name.startsWith("cover:") === covers).reduce((sum, [, record]) => sum + record.sizeBytes, 0);
        this.telemetry.record({ event: "processed", attempt: job.attempt, elapsedMs: Date.now() - startedAt, durationMs: actualDurationMs, tiers, sourceBytes: source.body.byteLength, coverBytes: bytes(true), renditionBytes: bytes(false) });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 500) : "Video processing failed";
      if (!/attempt was revoked/i.test(message)) await this.recordFailure(job, generation, error, message, startedAt);
      this.logger.warn(`Video processing attempt ${job.attempt} failed: ${message}`); throw error;
    } finally { await rm(workDir, { recursive: true, force: true }); }
  }

  private async recordFailure(job: VideoProcessingJob, generation: { processingRetryCount?: number }, error: unknown, message: string, startedAt: number): Promise<void> {
    const failureType: FailureType = error instanceof SourceVideoError ? error.failureType : "TRANSIENT";
    const retryCount = Number(generation.processingRetryCount ?? 0);
    const retryable = failureType === "TRANSIENT" && retryCount + 1 < MAX_ATTEMPTS;
    const failed = await this.prisma.videoGeneration.updateMany({ where: { id: job.generationId, processingAttempt: job.attempt, status: "Processing" }, data: retryable ? { status: "Processing", processingAttempt: job.attempt + 1, processingRetryCount: retryCount + 1, nextRetryAt: new Date(Date.now() + RETRY_BACKOFF_MS * 2 ** retryCount), lastError: message, failureType } : { status: "Failed", lastError: message, failureType, nextRetryAt: null } });
    // A superseded attempt writes nothing; its failure is not this generation's.
    if (failed.count > 0) this.telemetry.record({ event: "processing_failed", attempt: job.attempt, failureType, retryable, elapsedMs: Date.now() - startedAt });
  }

  private async writeOutput(job: VideoProcessingJob, key: string, body: Buffer, contentType: string, manifest: Record<string, ManifestRecord>, name: string): Promise<void> {
    // Persist before storage I/O, outside the reservation transaction. A crash
    // or an uncertain initialization must never erase its cleanup evidence.
    const reservation = await this.prisma.videoOutputReservation.createMany({ data: { key, sourceId: job.sourceId, generationId: job.generationId, attempt: job.attempt }, skipDuplicates: true });
    // Duplicate deliveries cannot initialize a key twice or fail its owner.
    if (!reservation.count) throw new Error("Video processing attempt was revoked (duplicate delivery)");
    const fence = await this.prisma.$transaction(async (tx) => {
      // Retirement/attempt updates acquire this row lock too. Keep it through
      // reservation so revocation cannot commit between authorization and PUT.
      await tx.$queryRaw`SELECT "id" FROM "video_generations" WHERE "id" = ${job.generationId} FOR UPDATE`;
      const active = await tx.videoGeneration.findUnique({ where: { id: job.generationId }, select: { sourceId: true, processingAttempt: true, status: true } });
      if (!active || active.sourceId !== job.sourceId || active.processingAttempt !== job.attempt || active.status !== "Processing") {
        await tx.videoOutputReservation.update({ where: { key }, data: { settled: true } });
        return null;
      }
      // Keep the issued intent even if initialize or the transaction fails.
      await this.prisma.videoOutputReservation.update({ where: { key }, data: { started: true } });
      const reserved = await this.storage.initialize(key, contentType);
      await tx.videoOutputReservation.update({ where: { key }, data: { settled: true } });
      return reserved;
    }, { timeout: 35_000 });
    if (!fence) throw new Error("Video processing attempt was revoked");
    await this.assertAttemptActive(job); await this.storage.put(key, body, contentType, fence);
    const head = await this.storage.head(key); if (!head || head.sizeBytes !== body.byteLength) throw new Error(`Processing output missing or changed: ${key}`);
    manifest[name] = { key, sizeBytes: body.byteLength, etag: head.etag };
  }
  private async probe(input: string): Promise<ProbeResult> { const probePath = process.env["FFPROBE_PATH"] ?? (FFMPEG_PATH === "ffmpeg" ? "ffprobe" : FFMPEG_PATH.replace(/ffmpeg(?:\.exe)?$/, "ffprobe")); const { stdout } = await run(probePath, ["-v", "error", "-max_alloc", "67108864", "-print_format", "json", "-show_format", "-show_streams", input]); return JSON.parse(stdout) as ProbeResult; }
  private validate(probe: ProbeResult, sizeBytes: number): { duration: number; width: number; height: number; videoCodec: string; audioCodec: string | null } {
    const video = probe.streams?.find((stream) => stream.codec_type === "video"); const audio = probe.streams?.find((stream) => stream.codec_type === "audio"); const duration = Number(probe.format?.duration ?? 0);
    if (!video || !Number.isFinite(duration) || duration <= 0 || duration > MAX_DURATION_SECONDS || sizeBytes > MAX_BYTES) throw new SourceVideoError("Video duration, size or stream is invalid", "SOURCE_INVALID");
    if (video.codec_name !== "h264" || !video.width || !video.height || video.width > 1280 || video.height > 1280 || (video.width > 720 && video.height > 720) || parseRate(video.r_frame_rate) > 30 || ["bt2020", "smpte2084", "arib-std-b67"].includes(video.color_transfer ?? "") || video.color_space === "bt2020nc") throw new SourceVideoError("Video codec, dimensions, frame rate or color space is unsupported", "SOURCE_INVALID");
    if (audio && audio.codec_name !== "aac") throw new SourceVideoError("Audio codec is unsupported", "SOURCE_INVALID");
    return { duration, width: video.width, height: video.height, videoCodec: "h264", audioCodec: audio?.codec_name ?? null };
  }
  private async decode(input: string): Promise<void> { await run(FFMPEG_PATH, ["-v", "error", "-max_alloc", "67108864", "-threads", FFMPEG_THREADS, "-i", input, "-map", "0:v:0", "-map", "0:a?", "-f", "null", "-"]); }
  private async assertAttemptActive(job: VideoProcessingJob): Promise<void> { const active = await this.prisma.videoGeneration.findUnique({ where: { id: job.generationId }, select: { processingAttempt: true, status: true } }); if (!active || active.processingAttempt !== job.attempt || active.status !== "Processing") throw new Error("Video processing attempt was revoked"); }
  private async uploadSegments(workDir: string, prefix: string, tier: number, job: VideoProcessingJob, manifest: Record<string, ManifestRecord>): Promise<void> { for (const name of (await readdir(workDir)).filter((entry) => entry.startsWith(`${tier}-`) && entry.endsWith(".ts")).sort()) await this.writeOutput(job, `${prefix}/hls/${tier}p/${name}`, await readFile(join(workDir, name)), "video/mp2t", manifest, `segment:${tier}:${name}`); }
}
