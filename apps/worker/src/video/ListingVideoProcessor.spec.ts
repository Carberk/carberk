import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { DeleteObjectsCommand, S3Client } from "@aws-sdk/client-s3";
import type { PrismaService } from "@auto-tm/db";
import { describe, expect, it } from "vitest";

import { ListingVideoProcessor } from "./ListingVideoProcessor";
import { S3VideoProcessingStorage, type VideoProcessingStorage } from "./VideoProcessingStorage";

const exec = promisify(execFile);

class MemoryStorage implements VideoProcessingStorage {
  readonly bucket = "listing-videos-test";
  readonly objects = new Map<string, { body: Buffer; contentType: string }>();
  constructor(private readonly source: Buffer, private readonly dropKey?: string, private readonly missing = false) {}
  async get(key: string) { if (this.missing || key !== "video-sources/source/source.mp4") throw new Error("NoSuchKey"); return { key, body: this.source, contentType: "video/mp4" }; }
  async put(key: string, body: Buffer, contentType: string) { if (key !== this.dropKey) this.objects.set(key, { body, contentType }); }
  async head(key: string) { if (this.missing) return null; if (key === "video-sources/source/source.mp4") return { sizeBytes: this.source.length, contentType: "video/mp4" }; const value = this.objects.get(key); return value ? { sizeBytes: value.body.length, contentType: value.contentType } : null; }
  async list(prefix: string) { return [...this.objects.keys()].filter((key) => key.startsWith(prefix)); }
}

interface FakePrisma {
  row: { status: string; [key: string]: unknown };
  videoGeneration: { findUnique: () => Promise<FakePrisma["row"]>; updateMany: (input: { data: Record<string, unknown> }) => Promise<{ count: number }> };
}

function prismaFor(status = "Processing"): FakePrisma {
  const row = {
    id: "generation-1", sourceId: "source-1", processingAttempt: 1, status,
    coverOffsetMs: 2_625, processingStartedAt: new Date(), source: { objectKey: "video-sources/source/source.mp4", sizeBytes: 0 },
  };
  return {
    row,
    videoGeneration: {
      findUnique: async () => row,
      updateMany: async ({ data }: { data: Record<string, unknown> }) => { Object.assign(row, data); return { count: 1 }; },
    },
  };
}

async function fixture(): Promise<{ dir: string; body: Buffer }> {
  const dir = await mkdtemp(join(tmpdir(), "carberk-video-fixture-"));
  const path = join(dir, "source.mp4");
  await exec("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=blue:s=320x240:r=25", "-t", "3", "-c:v", "libx264", "-pix_fmt", "yuv420p", path]);
  return { dir, body: await readFile(path) };
}

describe("ListingVideoProcessor", () => {
  it("validates actual bytes and only marks Ready after every manifest object exists", async () => {
    const fixtureData = await fixture();
    try {
      const storage = new MemoryStorage(fixtureData.body);
      const prisma = prismaFor();
      prisma.row["source"] = { objectKey: "video-sources/source/source.mp4", sizeBytes: fixtureData.body.length };
      await new ListingVideoProcessor(prisma as unknown as PrismaService, storage).process({ sourceId: "source-1", generationId: "generation-1", attempt: 1 });
      expect(prisma.row.status).toBe("Ready");
      expect(storage.objects.size).toBeGreaterThan(4);
      for (const value of storage.objects.values()) expect(value.body.length).toBeGreaterThan(0);
    } finally { await rm(fixtureData.dir, { recursive: true, force: true }); }
  }, 30_000);

  it("records a broken source as Failed", async () => {
    const prisma = prismaFor();
    const storage = new MemoryStorage(Buffer.from("not an mp4"));
    await expect(new ListingVideoProcessor(prisma as unknown as PrismaService, storage).process({ sourceId: "source-1", generationId: "generation-1", attempt: 1 })).rejects.toThrow();
    expect(prisma.row.status).toBe("Failed");
  });

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
      expect(prisma.row.status).toBe("Failed");
    } finally { await rm(fixtureData.dir, { recursive: true, force: true }); }
  }, 30_000);
});

describe.skipIf(process.env["VIDEO_PROCESSING_STORAGE_E2E"] !== "1")("ListingVideoProcessor with local MinIO", () => {
  it("processes and verifies a namespaced real-storage object set", async () => {
    const fixtureData = await fixture();
    const namespace = `e2e/${randomUUID()}`;
    const endpoint = process.env["MINIO_ENDPOINT"] ?? "http://127.0.0.1:9000";
    const bucket = process.env["LISTING_VIDEO_BUCKET_NAME"] || "listing-videos";
    const s3 = new S3Client({ endpoint, region: process.env["MINIO_REGION"] ?? "us-east-1", forcePathStyle: true, credentials: { accessKeyId: process.env["MINIO_ACCESS_KEY"] ?? "minioadmin", secretAccessKey: process.env["MINIO_SECRET_KEY"] ?? "minioadmin" } });
    const storage = new S3VideoProcessingStorage(s3, bucket);
    const sourceKey = `${namespace}/source.mp4`;
    await storage.put(sourceKey, fixtureData.body, "video/mp4");
    const prisma = prismaFor();
    prisma.row["source"] = { objectKey: sourceKey, sizeBytes: fixtureData.body.length };
    try {
      await new ListingVideoProcessor(prisma as unknown as PrismaService, storage).process({ sourceId: "source-1", generationId: "generation-1", attempt: 1 });
      expect(prisma.row.status).toBe("Ready");
      const keys = await storage.list(namespace);
      expect(keys.length).toBeGreaterThan(4);
    } finally {
      const keys = await storage.list(namespace);
      if (keys.length) await s3.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: keys.map((Key) => ({ Key })) } }));
      await rm(fixtureData.dir, { recursive: true, force: true });
      await s3.destroy();
    }
  }, 30_000);
});
