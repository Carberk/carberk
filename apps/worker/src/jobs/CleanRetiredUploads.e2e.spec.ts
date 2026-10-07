import { randomUUID } from "node:crypto";

import {
  DeleteObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { PrismaService } from "@auto-tm/db";

import { CleanRetiredUploads } from "./CleanRetiredUploads";
import { PrismaRetiredUploadLedger } from "./PrismaRetiredUploadLedger";
import { RETIRED_UPLOAD_BUCKET, S3RetiredObjectStore } from "./S3RetiredObjectStore";
import type { RetiredObjectStore } from "./retiredUploadCleanup";

/**
 * Issue #721 / ADR-0088 against the hosted disposable Postgres and the
 * digest-pinned MinIO that `scripts/ci-services.sh` starts. It never runs
 * against a live or local provider.
 *
 * Every row here is due around the year 2000 and every sweep runs "then", so a
 * sweep can only see this suite's work: other suites share the database and
 * their rows are due now.
 */
const endpoint = process.env["MINIO_ENDPOINT"] ?? "";
const hosted = process.env["GITHUB_ACTIONS"] === "true" && Boolean(process.env["DATABASE_URL"]) &&
  /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(endpoint);

const DUE = new Date("2000-01-01T00:00:00Z");
const SWEEP = new Date("2000-01-02T00:00:00Z");
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

describe.skipIf(!hosted)("retired upload cleanup on Postgres and MinIO (#721)", () => {
  let prisma: PrismaService;
  let s3: S3Client;
  let ledger: PrismaRetiredUploadLedger;
  let store: S3RetiredObjectStore;
  let job: CleanRetiredUploads;
  const userId = randomUUID();
  const uploadIds: string[] = [];
  const objectKeys = new Set<string>();
  const catalog = { brandId: randomUUID(), modelId: randomUUID(), regionId: randomUUID(), cityId: randomUUID() };
  const slug = `cleanup-${randomUUID()}`;

  beforeAll(async () => {
    prisma = new PrismaService();
    s3 = new S3Client({
      endpoint, region: "us-east-1", forcePathStyle: true, requestChecksumCalculation: "WHEN_REQUIRED",
      credentials: {
        accessKeyId: process.env["MINIO_ACCESS_KEY"] ?? "minioadmin",
        secretAccessKey: process.env["MINIO_SECRET_KEY"] ?? "minioadmin",
      },
    });
    ledger = new PrismaRetiredUploadLedger(prisma);
    store = new S3RetiredObjectStore(s3);
    job = new CleanRetiredUploads(ledger, store);
    const names = { nameRu: "Cleanup", nameTk: "Cleanup", nameEn: "Cleanup" };
    await prisma.brand.create({ data: { id: catalog.brandId, slug: `${slug}-brand`, ...names } });
    await prisma.model.create({ data: { id: catalog.modelId, brandId: catalog.brandId, slug: `${slug}-model`, ...names } });
    await prisma.region.create({ data: { id: catalog.regionId, slug: `${slug}-region`, ...names } });
    await prisma.city.create({ data: { id: catalog.cityId, regionId: catalog.regionId, slug: `${slug}-city`, ...names } });
  });

  afterEach(async () => {
    await prisma.mediaUploadCleanup.deleteMany({ where: { uploadId: { in: uploadIds } } });
    await prisma.user.updateMany({ where: { id: userId }, data: { avatarUploadId: null, avatarKey: null } });
    await prisma.listing.deleteMany({ where: { sellerId: userId } });
    await prisma.mediaUpload.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    uploadIds.length = 0;
  });

  afterAll(async () => {
    if (!prisma) return;
    for (const Key of objectKeys) await s3.send(new DeleteObjectCommand({ Bucket: RETIRED_UPLOAD_BUCKET, Key }));
    await prisma.city.deleteMany({ where: { id: catalog.cityId } });
    await prisma.region.deleteMany({ where: { id: catalog.regionId } });
    await prisma.model.deleteMany({ where: { id: catalog.modelId } });
    await prisma.brand.deleteMany({ where: { id: catalog.brandId } });
    s3.destroy();
    await prisma.onModuleDestroy();
  });

  function manifest(key: string): string[] {
    const directory = key.slice(0, key.lastIndexOf("/") + 1);
    return [key, ...["thumbnail", "list", "detail", "fullscreen"]
      .flatMap((name) => [`${directory}${name}.jpg`, `${directory}${name}.webp`])];
  }

  async function exists(Key: string): Promise<boolean> {
    try {
      await s3.send(new HeadObjectCommand({ Bucket: RETIRED_UPLOAD_BUCKET, Key }));
      return true;
    } catch (error) {
      if ((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404) return false;
      throw error;
    }
  }

  const present = async (keys: string[]) => (await Promise.all(keys.map(exists))).filter(Boolean).length;

  /** A fenced upload with its nine stored objects, retired and waiting for cleanup unless told otherwise. */
  async function retiredUpload(options: {
    state?: string; work?: "PENDING" | "LEGACY_PENDING" | "none"; preparing?: boolean;
  } = {}) {
    await prisma.user.upsert({
      where: { id: userId }, update: {},
      create: { id: userId, phone: `+9936${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`, phoneVerifiedAt: new Date(), role: "buyer" },
    });
    const key = `pending/${randomUUID()}/original.jpg`;
    const keys = manifest(key);
    for (const Key of keys) {
      objectKeys.add(Key);
      await s3.send(new PutObjectCommand({
        Bucket: RETIRED_UPLOAD_BUCKET, Key, Body: Buffer.from(`bytes of ${Key}`), IfNoneMatch: "*",
      }));
    }
    const upload = await prisma.mediaUpload.create({ data: {
      userId, key, kind: "image", contentType: "image/jpeg", sizeBytes: 2048,
      writeProtocol: "conditional-v1", objectKeys: keys,
      ...(options.preparing
        ? { state: "PREPARING", claimToken: randomUUID(), claimTargetType: "listing", claimTargetId: randomUUID(),
            claimDeadline: new Date(DUE.getTime() - HOUR) }
        : options.state === "ADOPTED"
          ? { state: "ADOPTED", claimTargetType: "listing", claimTargetId: randomUUID() }
          : { state: options.state ?? "RETIRED", retiredAt: DUE }),
    } });
    uploadIds.push(upload.id);
    if (!options.preparing && options.work !== "none") {
      await prisma.mediaUploadCleanup.create({ data: {
        uploadId: upload.id, key, objectKeys: keys, writeProtocol: "conditional-v1",
        status: options.work ?? "PENDING", nextAttemptAt: DUE,
      } });
    }
    return { id: upload.id, key, keys, directory: key.slice(0, key.lastIndexOf("/") + 1) };
  }

  const workOf = (uploadId: string) => prisma.mediaUploadCleanup.findUniqueOrThrow({ where: { uploadId } });
  const stateOf = async (id: string) => (await prisma.mediaUpload.findUnique({ where: { id } }))?.state;

  async function listing() {
    return prisma.listing.create({ data: {
      sellerId: userId, status: "active", brandId: catalog.brandId, modelId: catalog.modelId,
      cityId: catalog.cityId, priceAmount: 100000, priceCurrency: "TMT", publishedAt: new Date(),
    } });
  }

  /** Deletes for real, then fails before the whole manifest is gone. */
  function outageAfter(deleted: number): RetiredObjectStore {
    return {
      deleteAndVerify: async (keys) => {
        for (const Key of keys.slice(0, deleted)) {
          await s3.send(new DeleteObjectCommand({ Bucket: RETIRED_UPLOAD_BUCKET, Key }));
        }
        throw new Error("storage unavailable");
      },
    };
  }

  it("removes the actual bytes after a failed attempt and a retry, and only then marks the work done", async () => {
    const upload = await retiredUpload();

    const failed = await new CleanRetiredUploads(ledger, outageAfter(4)).execute({ now: SWEEP, limit: 10 });

    expect(failed).toMatchObject({ deleted: 0, waiting: 1 });
    expect(await present(upload.keys)).toBe(5);
    const waiting = await workOf(upload.id);
    expect(waiting).toMatchObject({ status: "PENDING", attempts: 1, lastError: "storage unavailable", completedAt: null });
    expect(waiting.nextAttemptAt.getTime()).toBeGreaterThan(SWEEP.getTime());
    expect(await stateOf(upload.id)).toBe("RETIRED");

    // Not due yet: the backoff is durable, so an immediate sweep leaves it alone.
    expect(await job.execute({ now: SWEEP, limit: 10 })).toMatchObject({ deleted: 0, waiting: 0 });
    expect(await present(upload.keys)).toBe(5);

    const retried = await job.execute({ now: new Date(waiting.nextAttemptAt.getTime() + 1), limit: 10 });

    expect(retried).toMatchObject({ deleted: 1, waiting: 0 });
    expect(await present(upload.keys)).toBe(0);
    const done = await workOf(upload.id);
    expect(done).toMatchObject({ status: "DONE", attempts: 2, lastError: null });
    expect(done.completedAt).not.toBeNull();
    expect(await stateOf(upload.id)).toBe("DELETED");
  });

  it("keeps work that a crashed worker had leased, and a restarted worker finishes it", async () => {
    const upload = await retiredUpload();

    const leased = await ledger.lease(SWEEP, 10);
    expect(leased.map((work) => work.uploadId)).toEqual([upload.id]);
    // The process dies here: nothing is completed or reported.

    const afterCrash = await workOf(upload.id);
    expect(afterCrash).toMatchObject({ status: "PENDING", attempts: 1 });
    expect(await present(upload.keys)).toBe(9);
    const restarted = new CleanRetiredUploads(new PrismaRetiredUploadLedger(prisma), new S3RetiredObjectStore(s3));

    await restarted.execute({ now: new Date(afterCrash.nextAttemptAt.getTime() + 1), limit: 10 });

    expect(await present(upload.keys)).toBe(0);
    expect(await workOf(upload.id)).toMatchObject({ status: "DONE" });
  });

  it("generation versus retirement: a delayed generator cannot recreate bytes once cleanup is complete", async () => {
    const upload = await retiredUpload({ preparing: true });
    const thumbnail = `${upload.directory}thumbnail.jpg`;
    // The generator read what it is about to replace, then stalled past its deadline.
    const read = await s3.send(new HeadObjectCommand({ Bucket: RETIRED_UPLOAD_BUCKET, Key: thumbnail }));

    const result = await job.execute({ now: SWEEP, limit: 10 });

    expect(result).toEqual({ cancelledPreparations: 1, deleted: 1, waiting: 0 });
    expect(await stateOf(upload.id)).toBe("DELETED");
    expect(await workOf(upload.id)).toMatchObject({ status: "DONE" });

    for (const Key of [thumbnail, upload.key]) {
      const late = await s3.send(new PutObjectCommand({
        Bucket: RETIRED_UPLOAD_BUCKET, Key, Body: Buffer.from("late variant"), IfMatch: read.ETag,
      })).then(() => "written", (error: { $metadata?: { httpStatusCode?: number } }) => error.$metadata?.httpStatusCode);
      expect([404, 409, 412]).toContain(late);
    }
    expect(await present(upload.keys)).toBe(0);
    // The stalled attempt cannot finalize either: its reservation is gone for good.
    expect(await prisma.mediaUpload.findUniqueOrThrow({ where: { id: upload.id } }))
      .toMatchObject({ claimToken: null, claimDeadline: null });
  });

  it("leaves a preparation that is still inside its deadline alone", async () => {
    const upload = await retiredUpload({ preparing: true });
    await prisma.mediaUpload.update({ where: { id: upload.id }, data: { claimDeadline: new Date(SWEEP.getTime() + MINUTE) } });

    expect(await job.execute({ now: SWEEP, limit: 10 })).toMatchObject({ cancelledPreparations: 0, deleted: 0 });
    expect(await stateOf(upload.id)).toBe("PREPARING");
    expect(await present(upload.keys)).toBe(9);
  });

  describe("no live claimant loses storage", () => {
    it.each([
      ["a legacy Listing media key with no upload", async (directory: string) => {
        await prisma.listingMedia.create({ data: {
          listingId: (await listing()).id, kind: "image", key: `${directory}list.jpg`, sortOrder: 0,
        } });
      }],
      ["a Listing video poster", async (directory: string) => {
        await prisma.listingMedia.create({ data: {
          listingId: (await listing()).id, kind: "video", key: "legacy/video.mp4", posterKey: `${directory}original.jpg`, sortOrder: 0,
        } });
      }],
      ["a Profile Photo key", async (directory: string) => {
        await prisma.user.update({ where: { id: userId }, data: { avatarKey: `${directory}original.jpg` } });
      }],
    ])("blocks while %s is retained under the directory, then deletes once it is gone", async (_label, retain) => {
      const upload = await retiredUpload();
      await retain(upload.directory);

      expect(await job.execute({ now: SWEEP, limit: 10 })).toMatchObject({ deleted: 0, waiting: 1 });

      expect(await present(upload.keys)).toBe(9);
      const blocked = await workOf(upload.id);
      expect(blocked.status).toBe("PENDING");
      expect(blocked.lastError).toMatch(/reference|claim/i);
      expect(await stateOf(upload.id)).toBe("RETIRED");

      await prisma.listing.deleteMany({ where: { sellerId: userId } });
      await prisma.user.update({ where: { id: userId }, data: { avatarKey: null } });
      await job.execute({ now: new Date(blocked.nextAttemptAt.getTime() + 1), limit: 10 });

      expect(await present(upload.keys)).toBe(0);
      expect(await workOf(upload.id)).toMatchObject({ status: "DONE" });
    });

    it.each([
      ["a Listing media row", async (upload: { id: string; key: string }) => {
        await prisma.listingMedia.create({ data: {
          listingId: (await listing()).id, kind: "image", key: "elsewhere/original.jpg", sortOrder: 0, uploadId: upload.id,
        } });
      }],
      ["a Profile Photo", async (upload: { id: string }) => {
        await prisma.user.update({ where: { id: userId }, data: { avatarUploadId: upload.id } });
      }],
    ])("never deletes an upload that %s still adopts, even if work for it exists", async (_label, adopt) => {
      const upload = await retiredUpload({ state: "ADOPTED" });
      await adopt(upload);

      expect(await job.execute({ now: SWEEP, limit: 10 })).toMatchObject({ deleted: 0, waiting: 1 });

      expect(await present(upload.keys)).toBe(9);
      expect(await stateOf(upload.id)).toBe("ADOPTED");
      expect(await workOf(upload.id)).toMatchObject({ status: "PENDING" });
    });

    it("never takes legacy work, whose bytes stay until deletion is proven safe", async () => {
      const upload = await retiredUpload({ work: "LEGACY_PENDING" });

      expect(await job.execute({ now: SWEEP, limit: 10 })).toMatchObject({ deleted: 0, waiting: 0 });

      expect(await present(upload.keys)).toBe(9);
      expect(await workOf(upload.id)).toMatchObject({ status: "LEGACY_PENDING", attempts: 0 });
    });
  });

  it("still deletes the bytes after the upload record and its User are gone", async () => {
    const upload = await retiredUpload();
    await prisma.user.delete({ where: { id: userId } });
    expect(await stateOf(upload.id)).toBeUndefined();

    expect(await job.execute({ now: SWEEP, limit: 10 })).toMatchObject({ deleted: 1 });

    expect(await present(upload.keys)).toBe(0);
    expect(await workOf(upload.id)).toMatchObject({ status: "DONE" });
  });

  it("takes bounded batches, and overlapping sweeps process each piece of work once", async () => {
    const uploads = [await retiredUpload(), await retiredUpload(), await retiredUpload()];
    const processed: string[] = [];
    const counting: RetiredObjectStore = {
      deleteAndVerify: async (keys) => {
        processed.push(keys[0] as string);
        await store.deleteAndVerify(keys);
      },
    };
    const sweep = () => new CleanRetiredUploads(new PrismaRetiredUploadLedger(prisma), counting)
      .execute({ now: SWEEP, limit: 2 });

    const [one, two] = await Promise.all([sweep(), sweep()]);

    expect(Math.max(one.deleted, two.deleted)).toBeLessThanOrEqual(2);
    expect(one.deleted + two.deleted).toBe(3);
    expect([...processed].sort()).toEqual(uploads.map((upload) => upload.key).sort());
    for (const upload of uploads) expect(await present(upload.keys)).toBe(0);
  });

  it("backs off further after each failure, up to a bound", async () => {
    const upload = await retiredUpload();
    const failing = new CleanRetiredUploads(ledger, outageAfter(0));

    await failing.execute({ now: SWEEP, limit: 10 });
    const first = (await workOf(upload.id)).nextAttemptAt.getTime() - SWEEP.getTime();
    await prisma.mediaUploadCleanup.update({ where: { uploadId: upload.id }, data: { attempts: 3, nextAttemptAt: DUE } });
    await failing.execute({ now: SWEEP, limit: 10 });
    const later = (await workOf(upload.id)).nextAttemptAt.getTime() - SWEEP.getTime();
    await prisma.mediaUploadCleanup.update({ where: { uploadId: upload.id }, data: { attempts: 60, nextAttemptAt: DUE } });
    await failing.execute({ now: SWEEP, limit: 10 });
    const capped = await workOf(upload.id);

    expect(first).toBeGreaterThan(0);
    expect(later).toBeGreaterThan(first);
    expect(capped.nextAttemptAt.getTime() - SWEEP.getTime()).toBeLessThanOrEqual(6 * HOUR);
    expect(capped.nextAttemptAt.getTime() - SWEEP.getTime()).toBeGreaterThanOrEqual(later);
    expect(capped).toMatchObject({ status: "PENDING", attempts: 61 });
    expect(await present(upload.keys)).toBe(9);
  });
});
