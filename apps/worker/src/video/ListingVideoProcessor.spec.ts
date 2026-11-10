import { createHash, randomUUID } from "node:crypto";
import { execFile , spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { DeleteObjectsCommand, S3Client } from "@aws-sdk/client-s3";
import { PrismaService } from "@auto-tm/db";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ListingVideoProcessor } from "./ListingVideoProcessor";
import { S3VideoProcessingStorage, type VideoProcessingStorage } from "./VideoProcessingStorage";
import { RecordingVideoProcessingTelemetry } from "./testing/RecordingVideoProcessingTelemetry";

const exec = promisify(execFile);
const hasFfmpeg = spawnSync(process.env["FFMPEG_PATH"] ?? "ffmpeg", ["-version"], { stdio: "ignore" }).status === 0;
const describeFfmpeg = hasFfmpeg ? describe : describe.skip;

class MemoryStorage implements VideoProcessingStorage {
  readonly bucket = "listing-videos-test";
  readonly objects = new Map<string, { body: Buffer; contentType: string }>();
  constructor(private readonly source: Buffer, private readonly dropKey?: string, private readonly missing = false, private readonly dropAll = false) {}
  private etag(body: Buffer) { return `"${createHash("md5").update(body).digest("hex")}"`; }
  async get(key: string) { if (this.missing || key !== "video-sources/source/source.mp4") throw new Error("NoSuchKey"); return { key, body: this.source, contentType: "video/mp4", etag: this.etag(this.source) }; }
  async initialize(key: string, contentType: string) { if (this.objects.has(key)) throw new Error("PreconditionFailed"); this.objects.set(key, { body: Buffer.alloc(0), contentType }); return this.etag(Buffer.alloc(0)); }
  async put(key: string, body: Buffer, contentType: string, expectedETag?: string) { if (this.dropAll || key === this.dropKey) return; const value = this.objects.get(key); if (expectedETag && (!value || this.etag(value.body) !== expectedETag)) throw new Error("PreconditionFailed"); if (!expectedETag && value) throw new Error("PreconditionFailed"); this.objects.set(key, { body, contentType }); }
  async head(key: string) { if (this.missing) return null; if (key === "video-sources/source/source.mp4") return { sizeBytes: this.source.length, contentType: "video/mp4", etag: this.etag(this.source) }; const value = this.objects.get(key); return value ? { sizeBytes: value.body.length, contentType: value.contentType, etag: this.etag(value.body) } : null; }
  async list(prefix: string) { return [...this.objects.keys()].filter((key) => key.startsWith(prefix)); }
}

interface FakePrisma {
  row: { status: string; [key: string]: unknown };
  videoGeneration: { findUnique: () => Promise<FakePrisma["row"]>; updateMany: (input: { data: Record<string, unknown> }) => Promise<{ count: number }> };
  listingVideo: { findUnique: () => Promise<{ id: string; ownerId: string; draftId: string; pendingGenerationId: string; activeGenerationId: null }>; update: () => Promise<unknown> };
  user: { findUnique: () => Promise<{ id: string }> };
  listingDraft: { findUnique: () => Promise<{ userId: string }> };
  videoOutputReservation: { createMany: () => Promise<{ count: number }>; update: () => Promise<unknown> };
  $queryRaw: () => Promise<unknown>;
  $transaction: <T>(work: (tx: FakePrisma) => Promise<T>) => Promise<T>;
}

function prismaFor(status = "Processing"): FakePrisma {
  const row = {
    id: "generation-1", sourceId: "source-1", processingAttempt: 1, processingRetryCount: 0, nextRetryAt: null, failureType: null, status,
    coverOffsetMs: 2_625, processingStartedAt: new Date(), source: { objectKey: "video-sources/source/source.mp4", sizeBytes: 0 },
  };
  const prisma: FakePrisma = {
    row,
    videoGeneration: {
      findUnique: async () => row,
      updateMany: async ({ data }: { data: Record<string, unknown> }) => { Object.assign(row, data); return { count: 1 }; },
    },
    listingVideo: {
      findUnique: async () => ({ id: "slot-1", ownerId: "owner-1", draftId: "draft-1", pendingGenerationId: "generation-1", activeGenerationId: null }),
      update: async () => ({}),
    },
    user: { findUnique: async () => ({ id: "owner-1" }) },
    listingDraft: { findUnique: async () => ({ userId: "owner-1" }) },
    videoOutputReservation: { createMany: async () => ({ count: 1 }), update: async () => ({}) },
    $queryRaw: async () => [],
    $transaction: async (work) => work(prisma),
  };
  return prisma;
}

async function fixture(size = "320x240", hasAudio = false): Promise<{ dir: string; body: Buffer }> {
  const dir = await mkdtemp(join(tmpdir(), "carberk-video-fixture-"));
  const path = join(dir, "source.mp4");
  await exec("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", `color=c=blue:s=${size}:r=25`, ...(hasAudio ? ["-f", "lavfi", "-i", "sine=frequency=440", "-c:a", "aac"] : []), "-t", "3", "-c:v", "libx264", "-pix_fmt", "yuv420p", path]);
  return { dir, body: await readFile(path) };
}

describeFfmpeg("ListingVideoProcessor", () => {
  it("validates actual bytes and only marks Ready after every manifest object exists", async () => {
    const fixtureData = await fixture();
    try {
      const storage = new MemoryStorage(fixtureData.body);
      const prisma = prismaFor();
      prisma.row["source"] = { objectKey: "video-sources/source/source.mp4", sizeBytes: fixtureData.body.length };
      const telemetry = new RecordingVideoProcessingTelemetry();
      await new ListingVideoProcessor(prisma as unknown as PrismaService, storage, telemetry).process({ sourceId: "source-1", generationId: "generation-1", attempt: 1 });
      expect(prisma.row.status).toBe("Ready");
      expect(storage.objects.size).toBeGreaterThan(4);
      for (const value of storage.objects.values()) expect(value.body.length).toBeGreaterThan(0);
      const stored = (part: string) => [...storage.objects.entries()].filter(([key]) => key.includes(part)).reduce((sum, [, value]) => sum + value.body.length, 0);
      // What one Ready video costs in storage and worker time, by asset kind.
      expect(telemetry.events).toEqual([{
        event: "processed", attempt: 1, durationMs: 3_000, tiers: [240],
        sourceBytes: fixtureData.body.length, coverBytes: stored("/covers/"), renditionBytes: stored("/hls/"),
        elapsedMs: expect.any(Number),
      }]);
      const master = [...storage.objects.entries()].find(([key]) => key.endsWith("/hls/master.m3u8"));
      expect(master?.[1].body.toString()).toMatch(/CODECS="avc1\.[0-9a-f]+"/);
    } finally { await rm(fixtureData.dir, { recursive: true, force: true }); }
  }, 30_000);

  it.each([false, true])("advertises the dimensions and H264 level encoded in every portrait rendition (audio=%s)", async (hasAudio) => {
    const fixtureData = await fixture("720x1280", hasAudio);
    try {
      const storage = new MemoryStorage(fixtureData.body);
      const prisma = prismaFor();
      prisma.row["source"] = { objectKey: "video-sources/source/source.mp4", sizeBytes: fixtureData.body.length };
      await new ListingVideoProcessor(prisma as unknown as PrismaService, storage).process({ sourceId: "source-1", generationId: "generation-1", attempt: 1 });
      const masterObject = storage.objects.get("video-sources/source/processing/1/hls/master.m3u8");
      if (!masterObject) throw new Error("No master playlist was stored");
      const master = masterObject.body.toString();
      expect(master).toContain("RESOLUTION=240x426");
      for (const [tier, width, height] of [[240, 240, 426], [360, 360, 640], [720, 720, 1280]] as const) {
        const segment = storage.objects.get(`video-sources/source/processing/1/hls/${tier}p/${tier}-000.ts`);
        if (!segment) throw new Error("No rendition segment was stored");
        const segmentPath = join(fixtureData.dir, `${tier}.ts`);
        await writeFile(segmentPath, segment.body);
        const { stdout: probeText } = await exec("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "json", segmentPath]);
        const stream = JSON.parse(probeText).streams[0] as { width: number; height: number };
        expect(stream).toEqual({ width, height });
        const { stdout: h264 } = await exec("ffmpeg", ["-v", "error", "-i", segmentPath, "-c:v", "copy", "-an", "-f", "h264", "pipe:1"], { encoding: "buffer" });
        const sps = h264.indexOf(Buffer.from([0, 0, 0, 1, 0x67]));
        expect(sps).toBeGreaterThanOrEqual(0);
        const codec = h264.subarray(sps + 5, sps + 8).toString("hex");
        const lines = master.split("\n");
        const variant = lines[lines.findIndex((line) => line.endsWith(`/${tier}p/index.m3u8`)) - 1];
        expect(variant).toContain(`CODECS="avc1.${codec}${hasAudio ? ",mp4a.40.2" : ""}"`);
        expect(variant).toContain(`RESOLUTION=${stream.width}x${stream.height}`);
      }
    } finally { await rm(fixtureData.dir, { recursive: true, force: true }); }
  }, 30_000);

  it.each([
    { size: "1280x720", renditions: [[240, 426, 240], [360, 640, 360], [720, 1280, 720]] },
    { size: "640x360", renditions: [[240, 426, 240], [360, 640, 360]] },
    { size: "640x240", renditions: [[240, 640, 240]] },
    { size: "240x640", renditions: [[240, 240, 640]] },
  ] as const)("keeps available resolution without advertising unsupported tiers for $size", async ({ size, renditions }) => {
    const fixtureData = await fixture(size);
    try {
      const storage = new MemoryStorage(fixtureData.body);
      const prisma = prismaFor();
      prisma.row["source"] = { objectKey: "video-sources/source/source.mp4", sizeBytes: fixtureData.body.length };
      await new ListingVideoProcessor(prisma as unknown as PrismaService, storage).process({ sourceId: "source-1", generationId: "generation-1", attempt: 1 });
      expect(prisma.row.status).toBe("Ready");
      const master = storage.objects.get("video-sources/source/processing/1/hls/master.m3u8")?.body.toString();
      if (!master) throw new Error("No master playlist was stored");
      expect(master.match(/#EXT-X-STREAM-INF:/g)).toHaveLength(renditions.length);
      for (const [tier, width, height] of renditions) {
        const segment = storage.objects.get(`video-sources/source/processing/1/hls/${tier}p/${tier}-000.ts`);
        if (!segment) throw new Error("No rendition segment was stored");
        const segmentPath = join(fixtureData.dir, `${tier}.ts`);
        await writeFile(segmentPath, segment.body);
        const { stdout } = await exec("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "json", segmentPath]);
        expect(JSON.parse(stdout).streams[0]).toEqual({ width, height });
        const lines = master.split("\n");
        const variant = lines[lines.findIndex((line) => line.endsWith(`/${tier}p/index.m3u8`)) - 1];
        expect(variant).toContain(`RESOLUTION=${width}x${height}`);
      }
    } finally { await rm(fixtureData.dir, { recursive: true, force: true }); }
  }, 30_000);

  it("bounds transient processing retries and eventually records Failed", async () => {
    const fixtureData = await fixture();
    try {
      const storage = new MemoryStorage(fixtureData.body, undefined, false, true);
      const prisma = prismaFor();
      prisma.row["source"] = { objectKey: "video-sources/source/source.mp4", sizeBytes: fixtureData.body.length };
      const processor = new ListingVideoProcessor(prisma as unknown as PrismaService, storage);
      await expect(processor.process({ sourceId: "source-1", generationId: "generation-1", attempt: 1 })).rejects.toThrow();
      await expect(processor.process({ sourceId: "source-1", generationId: "generation-1", attempt: 2 })).rejects.toThrow();
      await expect(processor.process({ sourceId: "source-1", generationId: "generation-1", attempt: 3 })).rejects.toThrow();
      expect(prisma.row.status).toBe("Failed");
      expect(prisma.row["processingAttempt"]).toBe(3);
    } finally { await rm(fixtureData.dir, { recursive: true, force: true }); }
  }, 30_000);

  it("records a broken source as Failed and reports the failure without keys, IDs or error text", async () => {
    const prisma = prismaFor();
    const storage = new MemoryStorage(Buffer.from("not an mp4"));
    const telemetry = new RecordingVideoProcessingTelemetry();
    prisma.row["source"] = { objectKey: "video-sources/source/source.mp4", sizeBytes: 10 };
    await expect(new ListingVideoProcessor(prisma as unknown as PrismaService, storage, telemetry).process({ sourceId: "source-1", generationId: "generation-1", attempt: 1 })).rejects.toThrow();
    expect(prisma.row.status).toBe("Failed");
    expect(telemetry.events).toEqual([{ event: "processing_failed", attempt: 1, failureType: "SOURCE_INVALID", retryable: false, elapsedMs: expect.any(Number) }]);
    const line = JSON.stringify(telemetry.events);
    for (const secret of ["video-sources", "generation-1", "source-1", "owner-1", "invalid", "tmp"]) expect(line).not.toContain(secret);
  });

  it("reports a transient failure as retryable", async () => {
    const fixtureData = await fixture();
    try {
      const storage = new MemoryStorage(fixtureData.body, undefined, false, true);
      const prisma = prismaFor();
      prisma.row["source"] = { objectKey: "video-sources/source/source.mp4", sizeBytes: fixtureData.body.length };
      const telemetry = new RecordingVideoProcessingTelemetry();
      await expect(new ListingVideoProcessor(prisma as unknown as PrismaService, storage, telemetry).process({ sourceId: "source-1", generationId: "generation-1", attempt: 1 })).rejects.toThrow();
      expect(telemetry.events).toEqual([{ event: "processing_failed", attempt: 1, failureType: "TRANSIENT", retryable: true, elapsedMs: expect.any(Number) }]);
    } finally { await rm(fixtureData.dir, { recursive: true, force: true }); }
  }, 30_000);

  it("rejects a source that cannot produce a playable 240p tier", async () => {
    const fixtureData = await fixture("320x180");
    try {
      const storage = new MemoryStorage(fixtureData.body);
      const prisma = prismaFor();
      prisma.row["source"] = { objectKey: "video-sources/source/source.mp4", sizeBytes: fixtureData.body.length };
      await expect(new ListingVideoProcessor(prisma as unknown as PrismaService, storage).process({ sourceId: "source-1", generationId: "generation-1", attempt: 1 })).rejects.toThrow("playable tier");
      expect(prisma.row.status).toBe("Failed");
    } finally { await rm(fixtureData.dir, { recursive: true, force: true }); }
  }, 30_000);

  it("records a missing source as Failed without trusting declared metadata", async () => {
    const prisma = prismaFor();
    const storage = new MemoryStorage(Buffer.alloc(0), undefined, true);
    await expect(new ListingVideoProcessor(prisma as unknown as PrismaService, storage).process({ sourceId: "source-1", generationId: "generation-1", attempt: 1 })).rejects.toThrow("Stored video source is missing");
    expect(prisma.row.status).toBe("Failed");
  });

  it("fails closed when an output is half-finished", async () => {
    const fixtureData = await fixture();
    try {
      const storage = new MemoryStorage(fixtureData.body, "video-sources/source/processing/1/covers/list.webp");
      const prisma = prismaFor();
      prisma.row["source"] = { objectKey: "video-sources/source/source.mp4", sizeBytes: fixtureData.body.length };
      await expect(new ListingVideoProcessor(prisma as unknown as PrismaService, storage).process({ sourceId: "source-1", generationId: "generation-1", attempt: 1 })).rejects.toThrow(/output missing/);
      expect(prisma.row.status).toBe("Processing");
      expect(prisma.row["processingAttempt"]).toBe(2);
    } finally { await rm(fixtureData.dir, { recursive: true, force: true }); }
  }, 30_000);
});

describe.skipIf(!hasFfmpeg || (process.env["VIDEO_PROCESSING_DATABASE_E2E"] !== "1" && process.env["GITHUB_ACTIONS"] !== "true"))("ListingVideoProcessor with Postgres", () => {
  it("serializes output reservation with revocation and refuses subsequent reservations", async () => {
    const prisma = new PrismaService();
    const fixtureData = await fixture();
    const userId = randomUUID();
    let release!: () => void;
    let entered!: () => void;
    const initialized = new Promise<void>((resolve) => { entered = resolve; });
    const gate = new Promise<void>((resolve) => { release = resolve; });
    class GatedStorage extends MemoryStorage {
      override async initialize(key: string, contentType: string) {
        entered();
        await gate;
        return super.initialize(key, contentType);
      }
    }
    const storage = new GatedStorage(fixtureData.body);
    let processing: Promise<unknown> | undefined;
    let revocation: Promise<unknown> | undefined;
    try {
      await prisma.user.create({ data: { id: userId } });
      const draft = await prisma.listingDraft.create({ data: { userId, payload: {} } });
      const slot = await prisma.listingVideo.create({ data: { ownerId: userId, draftId: draft.id } });
      const source = await prisma.videoSource.create({ data: { userId, listingVideoId: slot.id, bucket: storage.bucket, objectKey: `lock-test/${userId}/source.mp4`, multipartUploadId: randomUUID(), contentType: "video/mp4", sizeBytes: fixtureData.body.length, partSizeBytes: 5 * 1024 * 1024, partCount: 1, state: "COMPLETED", coverOffsetMs: 500, expiresAt: new Date() } });
      // MemoryStorage uses one canonical source key; the DB still owns a unique key.
      const sourceStorage: VideoProcessingStorage = {
        bucket: storage.bucket,
        get: () => storage.get("video-sources/source/source.mp4"),
        head: (key) => storage.head(key === source.objectKey ? "video-sources/source/source.mp4" : key),
        initialize: (key, type) => storage.initialize(key, type),
        put: (key, body, type, fence) => storage.put(key, body, type, fence),
        list: (prefix) => storage.list(prefix),
      };
      const generation = await prisma.videoGeneration.create({ data: { listingVideoId: slot.id, sourceId: source.id, status: "Processing", coverOffsetMs: 500 } });
      processing = new ListingVideoProcessor(prisma, sourceStorage).process({ sourceId: source.id, generationId: generation.id, attempt: 1 }).catch((error: unknown) => error);
      await initialized;
      revocation = prisma.videoGeneration.update({ where: { id: generation.id }, data: { status: "Retired" } }).then(() => false);
      const blocked = async () => {
        const deadline = Date.now() + 3_000;
        while (Date.now() < deadline) {
          const [state] = await prisma.$queryRaw<{ waiting: bigint }[]>`SELECT count(*) AS waiting FROM pg_stat_activity WHERE datname = current_database() AND cardinality(pg_blocking_pids(pid)) > 0`;
          if (Number(state?.waiting) > 0) return true;
          await new Promise((resolve) => setTimeout(resolve, 5));
        }
        throw new Error("Revocation did not reach the generation lock");
      };
      expect(await Promise.race([revocation, blocked()])).toBe(true);
      release();
      await revocation;
      expect(await processing).toMatchObject({ message: "Video processing attempt was revoked" });
      expect((await prisma.videoGeneration.findUniqueOrThrow({ where: { id: generation.id } })).status).toBe("Retired");
      expect([...storage.objects.keys()]).toEqual([`lock-test/${userId}/processing/1/covers/thumbnail.webp`]);
    } finally {
      release();
      await Promise.allSettled([processing, revocation]);
      await prisma.user.deleteMany({ where: { id: userId } });
      await prisma.onModuleDestroy();
      await rm(fixtureData.dir, { recursive: true, force: true });
    }
  }, 30_000);
});

describe.skipIf(process.env["VIDEO_PROCESSING_STORAGE_E2E"] !== "1")("ListingVideoProcessor with local MinIO", () => {
  let fixtureData: Awaited<ReturnType<typeof fixture>>;
  let namespace: string;
  let s3: S3Client;
  let storage: S3VideoProcessingStorage;
  const bucket = process.env["LISTING_VIDEO_BUCKET_NAME"] || "listing-videos";

  beforeEach(async () => {
    fixtureData = await fixture();
    namespace = `e2e/${randomUUID()}`;
    s3 = new S3Client({ endpoint: process.env["MINIO_ENDPOINT"] ?? "http://127.0.0.1:9000", region: process.env["MINIO_REGION"] ?? "us-east-1", forcePathStyle: true, credentials: { accessKeyId: process.env["MINIO_ACCESS_KEY"] ?? "minioadmin", secretAccessKey: process.env["MINIO_SECRET_KEY"] ?? "minioadmin" } });
    storage = new S3VideoProcessingStorage(s3, bucket);
  });

  afterEach(async () => {
    try {
      const keys = await storage.list(namespace);
      if (keys.length) await s3.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: keys.map((Key) => ({ Key })) } }));
    } finally {
      await rm(fixtureData.dir, { recursive: true, force: true });
      s3.destroy();
    }
  });

  function recordedSource(sizeBytes: number) {
    const prisma = prismaFor();
    prisma.row["source"] = { objectKey: `${namespace}/source.mp4`, sizeBytes };
    return prisma;
  }

  it("processes and verifies a namespaced real-storage object set", async () => {
    await storage.put(`${namespace}/source.mp4`, fixtureData.body, "video/mp4");
    const prisma = recordedSource(fixtureData.body.length);
    await new ListingVideoProcessor(prisma as unknown as PrismaService, storage).process({ sourceId: "source-1", generationId: "generation-1", attempt: 1 });
    expect(prisma.row.status).toBe("Ready");
    const manifest = prisma.row["manifest"] as Record<string, { key: string; sizeBytes: number; etag: string }>;
    for (const record of Object.values(manifest)) expect(await storage.head(record.key)).toMatchObject({ sizeBytes: record.sizeBytes, etag: record.etag });
  }, 30_000);

  it("rejects a broken real-storage source after checking its actual bytes", async () => {
    const broken = Buffer.from("not an mp4");
    await storage.put(`${namespace}/source.mp4`, broken, "video/mp4");
    const prisma = recordedSource(broken.length);
    await expect(new ListingVideoProcessor(prisma as unknown as PrismaService, storage).process({ sourceId: "source-1", generationId: "generation-1", attempt: 1 })).rejects.toThrow("Video source is invalid");
    expect(prisma.row).toMatchObject({ status: "Failed", failureType: "SOURCE_INVALID" });
  });

  it("records a missing real-storage source as a permanent failure", async () => {
    const prisma = recordedSource(fixtureData.body.length);
    await expect(new ListingVideoProcessor(prisma as unknown as PrismaService, storage).process({ sourceId: "source-1", generationId: "generation-1", attempt: 1 })).rejects.toThrow("missing");
    expect(prisma.row).toMatchObject({ status: "Failed", failureType: "SOURCE_MISSING" });
  });

  it("rejects same-size corruption in real storage even when HEAD still matches the recorded size", async () => {
    const sourceKey = `${namespace}/source.mp4`;
    await storage.put(sourceKey, fixtureData.body, "video/mp4");
    const original = await storage.head(sourceKey);
    if (!original?.etag) throw new Error("No source write fence was stored");
    await storage.put(sourceKey, Buffer.alloc(fixtureData.body.length, 7), "video/mp4", original.etag);
    expect(await storage.head(sourceKey)).toMatchObject({ sizeBytes: fixtureData.body.length });
    const prisma = recordedSource(fixtureData.body.length);
    await expect(new ListingVideoProcessor(prisma as unknown as PrismaService, storage).process({ sourceId: "source-1", generationId: "generation-1", attempt: 1 })).rejects.toThrow("Video source is invalid");
    expect(prisma.row).toMatchObject({ status: "Failed", failureType: "SOURCE_INVALID" });
  });

  it("refuses Ready when a stored output disappears before final manifest verification", async () => {
    const removedKey = `${namespace}/processing/1/covers/list.webp`;
    class PartialStorage extends S3VideoProcessingStorage {
      override async put(key: string, body: Buffer, contentType: string, expectedETag?: string) {
        await super.put(key, body, contentType, expectedETag);
        if (key.endsWith("/hls/master.m3u8")) await s3.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: [{ Key: removedKey }] } }));
      }
    }
    const partialStorage = new PartialStorage(s3, bucket);
    await partialStorage.put(`${namespace}/source.mp4`, fixtureData.body, "video/mp4");
    const prisma = recordedSource(fixtureData.body.length);
    await expect(new ListingVideoProcessor(prisma as unknown as PrismaService, partialStorage).process({ sourceId: "source-1", generationId: "generation-1", attempt: 1 })).rejects.toThrow(`Processing output missing or changed: ${removedKey}`);
    expect(await storage.head(removedKey)).toBeNull();
    expect(await storage.head(`${namespace}/processing/1/hls/master.m3u8`)).not.toBeNull();
    expect(prisma.row).toMatchObject({ status: "Processing", processingAttempt: 2, failureType: "TRANSIENT" });
    expect(prisma.row["manifest"]).toBeUndefined();
  }, 30_000);
});
