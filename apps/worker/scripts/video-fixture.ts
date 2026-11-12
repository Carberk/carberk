/**
 * Local Listing video fixture: Ready portrait and landscape videos on the
 * `ui:fixture` Listings, made by the real worker processing code, plus the
 * tester settings that let the fixture Users see them.
 *
 *   pnpm --filter @auto-tm/db ui:fixture        # once, for Listings and Users
 *   pnpm --filter @auto-tm/worker video:fixture # add or keep the videos
 *   pnpm --filter @auto-tm/worker video:fixture -- --force      # rebuild them
 *   pnpm --filter @auto-tm/worker video:fixture -- --write-env  # also set apps/api/.env
 *
 * Refuses any database or bucket that is not on localhost.
 */
import "reflect-metadata";

import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

import { CLIPS, CLIP_SECONDS } from "../../../scripts/local-video-fixture.cjs";

const workerDir = resolve(__dirname, "..");
const repoDir = resolve(workerDir, "../..");
process.loadEnvFile(existsSync(join(workerDir, ".env")) ? join(workerDir, ".env") : join(workerDir, ".env.template"));

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
function assertLocal(name: string, value: string | undefined): asserts value is string {
  if (!value) throw new Error(`${name} is required`);
  const host = new URL(value).hostname.replace(/^\[|\]$/g, "");
  if (!LOCAL_HOSTS.has(host)) throw new Error(`video:fixture runs only against localhost; ${name} points elsewhere`);
}

/** Fixed `ui:fixture` Users: the seller owns the video Listings, the buyer only watches. */
export const FIXTURE_SELLER_ID = "f1000000-0000-4000-8000-000000000001";
export const FIXTURE_BUYER_ID = "f1000000-0000-4000-8000-000000000010";
const COVER_OFFSET_MS = 4_000;

const exec = promisify(execFile);

async function makeClip(dir: string, size: string): Promise<Buffer> {
  const path = join(dir, `${size}.mp4`);
  // `testsrc` draws a running seconds counter, so position checks can read the frame.
  await exec("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", `testsrc=size=${size}:rate=30`, "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=44100", "-t", String(CLIP_SECONDS), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-profile:v", "main", "-b:v", "1500k", "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", path]);
  return readFile(path);
}

/** Replaces or adds `KEY=value` lines in an env file. */
export function upsertEnv(text: string, values: Record<string, string>): string {
  let out = text;
  for (const [key, value] of Object.entries(values)) {
    const line = `${key}=${value}`;
    const pattern = new RegExp(`^${key}=.*$`, "m");
    out = pattern.test(out) ? out.replace(pattern, line) : `${out.replace(/\n?$/, "\n")}${line}\n`;
  }
  return out;
}

async function main(): Promise<void> {
  const args = new Set(process.argv.slice(2));
  const force = args.has("--force");
  assertLocal("DATABASE_URL", process.env["DATABASE_URL"]);
  const endpoint: string | undefined = process.env["LISTING_VIDEO_BUCKET_ENDPOINT"] || process.env["MINIO_ENDPOINT"];
  assertLocal("video bucket endpoint", endpoint);

  // Loaded after the guard so nothing connects to a refused target.
  const { DeleteObjectsCommand, PutObjectCommand, S3Client } = await import("@aws-sdk/client-s3");
  const { PrismaService } = await import("@auto-tm/db");
  const { ListingVideoProcessor } = await import("../src/video/ListingVideoProcessor");
  const { S3VideoProcessingStorage } = await import("../src/video/VideoProcessingStorage");

  const bucket = process.env["LISTING_VIDEO_BUCKET_NAME"] || "listing-videos";
  const s3 = new S3Client({
    endpoint,
    region: process.env["LISTING_VIDEO_BUCKET_REGION"] || process.env["MINIO_REGION"] || "us-east-1",
    credentials: {
      accessKeyId: process.env["LISTING_VIDEO_BUCKET_ACCESS_KEY_ID"] || process.env["MINIO_ACCESS_KEY"] || "",
      secretAccessKey: process.env["LISTING_VIDEO_BUCKET_SECRET_ACCESS_KEY"] || process.env["MINIO_SECRET_KEY"] || "",
    },
    forcePathStyle: true,
  });
  const storage = new S3VideoProcessingStorage(s3, bucket);
  const prisma = new PrismaService();
  const dir = await mkdtemp(join(tmpdir(), "carberk-video-fixture-"));
  try {
    const listings = await prisma.listing.findMany({
      where: { sellerId: FIXTURE_SELLER_ID, status: "active", deletedAt: null },
      orderBy: { id: "asc" },
      take: CLIPS.length,
      select: { id: true, listingVideo: { select: { id: true, activeGenerationId: true } } },
    });
    if (listings.length < CLIPS.length) throw new Error("Fixture Listings are missing; run `pnpm --filter @auto-tm/db ui:fixture` first");

    for (const [index, clip] of CLIPS.entries()) {
      const listing = listings[index];
      if (!listing) throw new Error("Fixture Listings are missing; run `pnpm --filter @auto-tm/db ui:fixture` first");
      if (listing.listingVideo?.activeGenerationId && !force) {
        console.log(`${clip.name}: Listing ${listing.id} already has a Ready video (use --force to rebuild)`);
        continue;
      }
      if (listing.listingVideo) {
        const sources = await prisma.videoSource.findMany({ where: { listingVideoId: listing.listingVideo.id }, select: { id: true } });
        for (const source of sources) {
          const keys = await storage.list(`video-sources/${source.id}/`);
          if (keys.length) await s3.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: keys.map((Key) => ({ Key })) } }));
        }
        await prisma.videoOutputReservation.deleteMany({ where: { sourceId: { in: sources.map((source) => source.id) } } });
        await prisma.listingVideo.delete({ where: { id: listing.listingVideo.id } });
      }

      const body = await makeClip(dir, clip.size);
      const slot = await prisma.listingVideo.create({ data: { ownerId: FIXTURE_SELLER_ID, listingId: listing.id } });
      const sourceId = randomUUID();
      const objectKey = `video-sources/${sourceId}/source.mp4`;
      await s3.send(new PutObjectCommand({ Bucket: bucket, Key: objectKey, Body: body, ContentType: "video/mp4" }));
      const source = await prisma.videoSource.create({
        data: {
          id: sourceId, userId: FIXTURE_SELLER_ID, listingVideoId: slot.id, bucket, objectKey, multipartUploadId: `fixture-${slot.id}`,
          contentType: "video/mp4", sizeBytes: body.length, partSizeBytes: body.length, partCount: 1, state: "COMPLETED",
          coverOffsetMs: COVER_OFFSET_MS, expiresAt: new Date(), completedAt: new Date(),
        },
      });
      const generation = await prisma.videoGeneration.create({
        data: { listingVideoId: slot.id, sourceId: source.id, status: "Processing", coverOffsetMs: COVER_OFFSET_MS, processingStartedAt: new Date() },
      });
      await prisma.listingVideo.update({ where: { id: slot.id }, data: { pendingGenerationId: generation.id } });
      await new ListingVideoProcessor(prisma, storage).process({ sourceId: source.id, generationId: generation.id, attempt: 1 });
      const ready = await prisma.videoGeneration.findUniqueOrThrow({ where: { id: generation.id }, select: { status: true } });
      if (ready.status !== "Ready") throw new Error(`${clip.name} video did not become Ready (${ready.status})`);
      console.log(`${clip.name}: Ready video on Listing ${listing.id}`);
    }

    const env = {
      LISTING_VIDEO_UPLOADS_ENABLED: "true",
      LISTING_VIDEO_UPLOAD_TESTER_USER_IDS: FIXTURE_SELLER_ID,
      LISTING_VIDEO_VIEW_TESTER_USER_IDS: [FIXTURE_SELLER_ID, FIXTURE_BUYER_ID].join(","),
    };
    const apiEnv = join(repoDir, "apps/api/.env");
    if (args.has("--write-env")) {
      if (!existsSync(apiEnv)) throw new Error("apps/api/.env is missing; create it from .env.template first");
      writeFileSync(apiEnv, upsertEnv(readFileSync(apiEnv, "utf8"), env));
      console.log("Updated apps/api/.env; restart the API to apply it.");
    } else {
      console.log("Add to apps/api/.env (or rerun with --write-env), then restart the API:");
      for (const [key, value] of Object.entries(env)) console.log(`${key}=${value}`);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
    await prisma.$disconnect();
    s3.destroy();
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
