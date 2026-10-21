import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";

import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { PrismaService } from "@auto-tm/db";

import { CleanRetiredUploads } from "./CleanRetiredUploads";
import { PrismaRetiredUploadLedger } from "./PrismaRetiredUploadLedger";
import { PurgeExpiredAccounts } from "./PurgeExpiredAccounts";
import { RETIRED_UPLOAD_BUCKET, S3RetiredObjectStore } from "./S3RetiredObjectStore";
import type { CleanupWork, RetiredObjectStore } from "./retiredUploadCleanup";

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
/** The product's per-request S3 budget (ConditionalImageStorage, S3RetiredObjectStore). */
const REQUEST_BUDGET_MS = 10_000;

describe.skipIf(!hosted)("retired upload cleanup on Postgres and MinIO (#721)", () => {
  let prisma: PrismaService;
  let s3: S3Client;
  let ledger: PrismaRetiredUploadLedger;
  let store: S3RetiredObjectStore;
  let job: CleanRetiredUploads;
  const userId = randomUUID();
  /** Another account, a different seller, used only as NP-4's foreign stock. */
  const foreignUserId = randomUUID();
  const users = [userId, foreignUserId];
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
    await prisma.user.updateMany({ where: { id: { in: users } }, data: { avatarUploadId: null, avatarKey: null } });
    await prisma.listing.deleteMany({ where: { sellerId: { in: users } } });
    await prisma.mediaUpload.deleteMany({ where: { userId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
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
      .map((name) => `${directory}${name}.webp`)];
  }

  async function exists(Key: string, abortSignal?: AbortSignal): Promise<boolean> {
    try {
      await s3.send(new HeadObjectCommand({ Bucket: RETIRED_UPLOAD_BUCKET, Key }), abortSignal ? { abortSignal } : {});
      return true;
    } catch (error) {
      if ((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404) return false;
      throw error;
    }
  }

  const present = async (keys: string[]) => (await Promise.all(keys.map((Key) => exists(Key)))).filter(Boolean).length;
  /** `present` within the product's request budget, so a store that serialized reads behind a held PUT fails instead of hanging. */
  const presentInBudget = async (keys: string[]) =>
    (await Promise.all(keys.map((Key) => exists(Key, AbortSignal.timeout(REQUEST_BUDGET_MS))))).filter(Boolean).length;

  /** A fenced upload with its current five or historical nine stored objects, retired and waiting for cleanup unless told otherwise. */
  async function retiredUpload(options: {
    state?: string; work?: "PENDING" | "LEGACY_PENDING" | "none"; preparing?: boolean; historicalPlaceholder?: boolean;
    owner?: string;
  } = {}) {
    const owner = options.owner ?? userId;
    await prisma.user.upsert({
      where: { id: owner }, update: {},
      create: { id: userId, phone: `+9936${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`, phoneVerifiedAt: new Date(), role: "buyer" },
    });
    const key = `pending/${randomUUID()}/original.${options.historicalPlaceholder ? "jpg" : "webp"}`;
    const directory = key.slice(0, key.lastIndexOf("/") + 1);
    const keys = options.historicalPlaceholder ? [key, ...["thumbnail", "list", "detail", "fullscreen"].flatMap((name) => [`${directory}${name}.jpg`, `${directory}${name}.webp`])] : manifest(key);
    for (const Key of keys) {
      objectKeys.add(Key);
      await s3.send(new PutObjectCommand({
        Bucket: RETIRED_UPLOAD_BUCKET, Key, Body: options.historicalPlaceholder ? Buffer.alloc(0) : Buffer.from(`bytes of ${Key}`), IfNoneMatch: "*", CacheControl: "no-store",
      }));
    }
    const upload = await prisma.mediaUpload.create({ data: {
      userId: owner, key, kind: "image", contentType: options.historicalPlaceholder ? "image/jpeg" : "image/webp", sizeBytes: 2048,
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

  async function listing(sellerId = userId) {
    return prisma.listing.create({ data: {
      sellerId, status: "active", brandId: catalog.brandId, modelId: catalog.modelId,
      cityId: catalog.cityId, priceAmount: 100000, priceCurrency: "TMT", publishedAt: new Date(),
    } });
  }

  async function bytesOf(Key: string): Promise<Buffer> {
    const object = await s3.send(new GetObjectCommand({ Bucket: RETIRED_UPLOAD_BUCKET, Key }),
      { abortSignal: AbortSignal.timeout(REQUEST_BUDGET_MS) });
    if (!object.Body) throw new Error(`No body for ${Key}`);
    return Buffer.from(await object.Body.transformToByteArray());
  }

  /**
   * Another account's adopted photo: its own User, its own active Listing and
   * Listing media, in another directory. A race on this suite's upload must
   * leave all of it, and its bytes, as they were. Its rows go in `afterEach`
   * and its objects in `afterAll`, like every other fixture here.
   */
  async function foreignStock() {
    const stock = await retiredUpload({ state: "ADOPTED", work: "none", owner: foreignUserId });
    const shop = await listing(foreignUserId);
    await prisma.mediaUpload.update({ where: { id: stock.id }, data: { claimTargetId: shop.id } });
    const media = await prisma.listingMedia.create({ data: {
      listingId: shop.id, kind: "image", sortOrder: 0, key: stock.key, uploadId: stock.id,
    } });
    const bytes = await Promise.all(stock.keys.map(bytesOf));
    return {
      expectIntact: async () => {
        expect(foreignUserId).not.toBe(userId);
        expect(await prisma.user.findUnique({ where: { id: foreignUserId } })).not.toBeNull();
        expect(await prisma.listing.findUniqueOrThrow({ where: { id: shop.id } }))
          .toMatchObject({ sellerId: foreignUserId, status: "active" });
        expect(await prisma.listingMedia.findUniqueOrThrow({ where: { id: media.id } }))
          .toMatchObject({ listingId: shop.id, key: stock.key, uploadId: stock.id });
        expect(await prisma.mediaUpload.findUniqueOrThrow({ where: { id: stock.id } })).toMatchObject({
          userId: foreignUserId, state: "ADOPTED", key: stock.key, claimTargetType: "listing", claimTargetId: shop.id,
        });
        expect(await prisma.mediaUploadCleanup.count({ where: { uploadId: stock.id } })).toBe(0);
        const now = await Promise.all(stock.keys.map(bytesOf));
        expect(now.map((current, index) => current.equals(bytes[index] ?? Buffer.alloc(0)))).toEqual(stock.keys.map(() => true));
      },
    };
  }

  /**
   * Fixture transition, not the API route: it puts an AVAILABLE upload into
   * the state the API's retirement leaves for the worker (RETIRED, with its
   * exact manifest as PENDING work due at `now`), so this suite can prove the
   * worker's cleanup. Who may retire, and that adopted or held uploads are
   * refused under the lock, is proven against the real
   * PrismaUploadClaims.retireUnclaimed in apps/api PrismaUploadClaims.e2e.spec.ts:432-475.
   */
  async function prepareRetiredForCleanup(uploadId: string, now: Date): Promise<void> {
    await prisma.$transaction(async (tx) => {
      const upload = await tx.mediaUpload.findUniqueOrThrow({ where: { id: uploadId } });
      const { count } = await tx.mediaUpload.updateMany({
        where: { id: uploadId, state: "AVAILABLE" },
        data: { state: "RETIRED", retiredAt: now, claimToken: null, claimDeadline: null },
      });
      if (count !== 1) throw new Error(`Upload ${uploadId} was not AVAILABLE`);
      await tx.mediaUploadCleanup.create({ data: {
        uploadId, key: upload.key, objectKeys: upload.objectKeys, writeProtocol: upload.writeProtocol,
        status: "PENDING", nextAttemptAt: now,
      } });
    });
  }

  /**
   * NP-4: the generator's variant write (ConditionalImageStorage: read the
   * ETag, then PUT with IfMatch) as one real streamed request. Its first bytes
   * are taken by the HTTP request, then the rest waits on a gate, so the PUT is
   * in flight at the S3 boundary while recovery and cleanup run. The answer is
   * MinIO's own; nothing is faked. `release` is idempotent, for `finally`.
   *
   * The request carries the product's own 10 s abort budget, as
   * ConditionalImageStorage does, so started, released and failed paths all
   * settle within it. An aborted request reports `aborted`, which is never an
   * accepted refusal.
   */
  function heldGeneratorPut(Key: string, IfMatch: string) {
    const body = Buffer.from(`late variant for ${Key}`);
    const half = Math.floor(body.length / 2);
    let reads = 0;
    let settled = false;
    let open!: () => void;
    let taken!: () => void;
    const gate = new Promise<void>((resolve) => { open = resolve; });
    const firstBytesTaken = new Promise<void>((resolve) => { taken = resolve; });
    // highWaterMark 1: a second read happens only once the first bytes are consumed.
    const stream = new Readable({
      highWaterMark: 1,
      read() {
        reads += 1;
        if (reads === 1) this.push(body.subarray(0, half));
        if (reads === 2) {
          taken();
          void gate.then(() => {
            if (this.destroyed) return;
            this.push(body.subarray(half));
            this.push(null);
          });
        }
      },
    });
    const abortSignal = AbortSignal.timeout(REQUEST_BUDGET_MS);
    const outcome = s3.send(new PutObjectCommand({
      Bucket: RETIRED_UPLOAD_BUCKET, Key, Body: stream, ContentLength: body.length,
      ContentType: "image/webp", IfMatch, CacheControl: "no-store",
    }), { abortSignal }).then(
      () => "written" as const,
      (error: { $metadata?: { httpStatusCode?: number }; name?: string }) =>
        abortSignal.aborted ? "aborted" as const : error.$metadata?.httpStatusCode ?? error.name,
    ).finally(() => { settled = true; });
    const started = Promise.race([firstBytesTaken, outcome.then((answer) => {
      throw new Error(`The generator PUT settled before it was held: ${String(answer)}`);
    })]);
    return { started, outcome, inFlight: () => !settled, release: () => open() };
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

  it("cleans an expired historical nine-object placeholder through the existing fenced ledger", async () => {
    const upload = await retiredUpload({ historicalPlaceholder: true });
    const result = await new CleanRetiredUploads(new PrismaRetiredUploadLedger(prisma), new S3RetiredObjectStore(s3)).execute({ now: SWEEP, limit: 10 });
    expect(result.deleted).toBe(1);
    expect(await stateOf(upload.id)).toBe("DELETED");
    expect((await workOf(upload.id)).status).toBe("DONE");
    for (const Key of upload.keys) expect(await exists(Key)).toBe(false);
  });

  it("removes the actual bytes after a failed attempt and a retry, and only then marks the work done", async () => {
    const upload = await retiredUpload();

    const failed = await new CleanRetiredUploads(ledger, outageAfter(4)).execute({ now: SWEEP, limit: 10 });

    expect(failed).toMatchObject({ deleted: 0, waiting: 1 });
    expect(await present(upload.keys)).toBe(1);
    const waiting = await workOf(upload.id);
    expect(waiting).toMatchObject({ status: "PENDING", attempts: 1, lastError: "storage unavailable", completedAt: null });
    expect(waiting.nextAttemptAt.getTime()).toBeGreaterThan(SWEEP.getTime());
    expect(await stateOf(upload.id)).toBe("RETIRED");

    // Not due yet: the backoff is durable, so an immediate sweep leaves it alone.
    expect(await job.execute({ now: SWEEP, limit: 10 })).toMatchObject({ deleted: 0, waiting: 0 });
    expect(await present(upload.keys)).toBe(1);

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
    expect(await present(upload.keys)).toBe(5);
    const restarted = new CleanRetiredUploads(new PrismaRetiredUploadLedger(prisma), new S3RetiredObjectStore(s3));

    await restarted.execute({ now: new Date(afterCrash.nextAttemptAt.getTime() + 1), limit: 10 });

    expect(await present(upload.keys)).toBe(0);
    expect(await workOf(upload.id)).toMatchObject({ status: "DONE" });
  });

  it("generation versus retirement: a delayed generator cannot recreate bytes once cleanup is complete", async () => {
    const upload = await retiredUpload({ preparing: true });
    // Attach owns an existing Listing; publish owns one that does not exist yet.
    await prisma.mediaUpload.update({ where: { id: upload.id }, data: { claimTargetId: (await listing()).id } });
    const thumbnail = `${upload.directory}thumbnail.webp`;
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

  it("NP-4 publish: a generator PUT held across claim recovery, ordinary retirement and cleanup resurrects nothing", async () => {
    const foreign = await foreignStock();
    // retiredUpload's claim target is a Listing id that does not exist yet: a publish claim.
    const upload = await retiredUpload({ preparing: true });
    const thumbnail = `${upload.directory}thumbnail.webp`;
    const { ETag } = await s3.send(new HeadObjectCommand({ Bucket: RETIRED_UPLOAD_BUCKET, Key: thumbnail }));
    if (!ETag) throw new Error("The conditional variant has no ETag");
    const held = heldGeneratorPut(thumbnail, ETag);
    try {
      await held.started;

      // The deadline passes with the PUT still in flight: the claim is released, good bytes kept.
      expect(await job.execute({ now: SWEEP, limit: 10 })).toEqual({ cancelledPreparations: 1, deleted: 0, waiting: 0 });
      expect(await prisma.mediaUpload.findUniqueOrThrow({ where: { id: upload.id } })).toMatchObject({
        state: "AVAILABLE", claimToken: null, claimDeadline: null, claimTargetType: null, claimTargetId: null, retiredAt: null,
      });
      expect(await prisma.mediaUploadCleanup.count({ where: { uploadId: upload.id } })).toBe(0);
      expect(await presentInBudget(upload.keys)).toBe(5);
      expect(held.inFlight()).toBe(true);

      // Only a retirement of the unclaimed upload records deletion work; the fixture prepares it.
      await prepareRetiredForCleanup(upload.id, SWEEP);
      const work = await workOf(upload.id);
      expect(work).toMatchObject({ status: "PENDING", attempts: 0, key: upload.key, writeProtocol: "conditional-v1" });
      expect([...work.objectKeys].sort()).toEqual([...upload.keys].sort());

      expect(await job.execute({ now: SWEEP, limit: 10 })).toEqual({ cancelledPreparations: 0, deleted: 1, waiting: 0 });
      expect(await workOf(upload.id)).toMatchObject({ status: "DONE" });
      expect(await stateOf(upload.id)).toBe("DELETED");
      expect(await presentInBudget(upload.keys)).toBe(0);
      expect(held.inFlight()).toBe(true);

      held.release();
      expect([404, 409, 412]).toContain(await held.outcome);
      expect(await present(upload.keys)).toBe(0);
      await foreign.expectIntact();
    } finally {
      held.release();
      await held.outcome;
    }
  }, 4 * REQUEST_BUDGET_MS);

  it("NP-4 attach: a generator PUT held across claim recovery and cleanup resurrects nothing", async () => {
    const foreign = await foreignStock();
    const upload = await retiredUpload({ preparing: true });
    const target = await listing();
    await prisma.mediaUpload.update({ where: { id: upload.id }, data: { claimTargetId: target.id } });
    const thumbnail = `${upload.directory}thumbnail.webp`;
    const { ETag } = await s3.send(new HeadObjectCommand({ Bucket: RETIRED_UPLOAD_BUCKET, Key: thumbnail }));
    if (!ETag) throw new Error("The conditional variant has no ETag");
    const held = heldGeneratorPut(thumbnail, ETag);
    try {
      await held.started;

      // Recovery alone first, so the recorded work is visible before cleanup takes it.
      expect(await ledger.retireExpiredPreparations(SWEEP, 10)).toBe(1);
      expect(await prisma.mediaUpload.findUniqueOrThrow({ where: { id: upload.id } })).toMatchObject({
        state: "RETIRED", retiredAt: SWEEP, claimToken: null, claimDeadline: null,
        claimTargetType: "listing", claimTargetId: target.id,
      });
      const work = await workOf(upload.id);
      expect(work).toMatchObject({ status: "PENDING", attempts: 0, key: upload.key, writeProtocol: "conditional-v1" });
      expect([...work.objectKeys].sort()).toEqual([...upload.keys].sort());
      expect(await presentInBudget(upload.keys)).toBe(5);
      expect(held.inFlight()).toBe(true);

      expect(await job.execute({ now: SWEEP, limit: 10 })).toEqual({ cancelledPreparations: 0, deleted: 1, waiting: 0 });
      expect(await workOf(upload.id)).toMatchObject({ status: "DONE", attempts: 1 });
      expect(await stateOf(upload.id)).toBe("DELETED");
      expect(await presentInBudget(upload.keys)).toBe(0);
      expect(held.inFlight()).toBe(true);

      held.release();
      expect([404, 409, 412]).toContain(await held.outcome);
      expect(await present(upload.keys)).toBe(0);
      await foreign.expectIntact();
    } finally {
      held.release();
      await held.outcome;
    }
  }, 4 * REQUEST_BUDGET_MS);

  it("releases an expired publish claim to AVAILABLE without deleting any bytes or recording cleanup", async () => {
    const upload = await retiredUpload({ preparing: true });
    expect(await job.execute({ now: SWEEP, limit: 10 })).toEqual({ cancelledPreparations: 1, deleted: 0, waiting: 0 });
    expect(await prisma.mediaUpload.findUniqueOrThrow({ where: { id: upload.id } })).toMatchObject({
      state: "AVAILABLE", claimToken: null, claimDeadline: null, claimTargetType: null, claimTargetId: null, retiredAt: null,
    });
    expect(await prisma.mediaUploadCleanup.count({ where: { uploadId: upload.id } })).toBe(0);
    expect(await present(upload.keys)).toBe(5);
  });

  it.each(["listing", "profile", "legacy-key"] as const)("touches nothing a live %s owner references when a publish deadline expires", async (owner) => {
    const upload = await retiredUpload({ preparing: true });
    if (owner === "profile") {
      await prisma.user.update({ where: { id: userId }, data: { avatarUploadId: upload.id, avatarKey: upload.key } });
    } else {
      await prisma.listingMedia.create({ data: {
        listingId: (await listing()).id, kind: "image", sortOrder: 0,
        key: owner === "legacy-key" ? `${upload.directory}list.webp` : upload.key,
        ...(owner === "listing" ? { uploadId: upload.id } : {}),
      } });
    }
    const before = await prisma.mediaUpload.findUniqueOrThrow({ where: { id: upload.id } });
    expect(await job.execute({ now: SWEEP, limit: 10 })).toEqual({ cancelledPreparations: 0, deleted: 0, waiting: 0 });
    expect(await prisma.mediaUpload.findUniqueOrThrow({ where: { id: upload.id } })).toEqual(before);
    expect(await prisma.mediaUploadCleanup.count({ where: { uploadId: upload.id } })).toBe(0);
    expect(await present(upload.keys)).toBe(5);
  });

  it("leaves a preparation that is still inside its deadline alone", async () => {
    const upload = await retiredUpload({ preparing: true });
    await prisma.mediaUpload.update({ where: { id: upload.id }, data: { claimDeadline: new Date(SWEEP.getTime() + MINUTE) } });

    expect(await job.execute({ now: SWEEP, limit: 10 })).toMatchObject({ cancelledPreparations: 0, deleted: 0 });
    expect(await stateOf(upload.id)).toBe("PREPARING");
    expect(await present(upload.keys)).toBe(5);
  });

  describe("no live claimant loses storage", () => {
    it.each([
      ["a legacy Listing media key with no upload", async (directory: string) => {
        await prisma.listingMedia.create({ data: {
          listingId: (await listing()).id, kind: "image", key: `${directory}list.webp`, sortOrder: 0,
        } });
      }],
      ["a Listing video poster", async (directory: string) => {
        await prisma.listingMedia.create({ data: {
          listingId: (await listing()).id, kind: "video", key: "legacy/video.mp4", posterKey: `${directory}original.webp`, sortOrder: 0,
        } });
      }],
      ["a Profile Photo key", async (directory: string) => {
        await prisma.user.update({ where: { id: userId }, data: { avatarKey: `${directory}original.webp` } });
      }],
    ])("blocks while %s is retained under the directory, then deletes once it is gone", async (_label, retain) => {
      const upload = await retiredUpload();
      await retain(upload.directory);

      expect(await job.execute({ now: SWEEP, limit: 10 })).toMatchObject({ deleted: 0, waiting: 1 });

      expect(await present(upload.keys)).toBe(5);
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
          listingId: (await listing()).id, kind: "image", key: "elsewhere/original.webp", sortOrder: 0, uploadId: upload.id,
        } });
      }],
      ["a Profile Photo", async (upload: { id: string }) => {
        await prisma.user.update({ where: { id: userId }, data: { avatarUploadId: upload.id } });
      }],
    ])("never deletes an upload that %s still adopts, even if work for it exists", async (_label, adopt) => {
      const upload = await retiredUpload({ state: "ADOPTED" });
      await adopt(upload);

      expect(await job.execute({ now: SWEEP, limit: 10 })).toMatchObject({ deleted: 0, waiting: 1 });

      expect(await present(upload.keys)).toBe(5);
      expect(await stateOf(upload.id)).toBe("ADOPTED");
      expect(await workOf(upload.id)).toMatchObject({ status: "PENDING" });
    });

    it("never takes legacy work, whose bytes stay until deletion is proven safe", async () => {
      const upload = await retiredUpload({ work: "LEGACY_PENDING" });

      expect(await job.execute({ now: SWEEP, limit: 10 })).toMatchObject({ deleted: 0, waiting: 0 });

      expect(await present(upload.keys)).toBe(5);
      expect(await workOf(upload.id)).toMatchObject({ status: "LEGACY_PENDING", attempts: 0 });
    });
  });

  it("day-30 purge: the User's Profile Photo is retired with the name, and the next sweep deletes its nine objects (#642)", async () => {
    const photo = await retiredUpload({ state: "ADOPTED", work: "none" });
    await prisma.mediaUpload.update({
      where: { id: photo.id }, data: { claimTargetType: "profile", claimTargetId: userId },
    });
    await prisma.user.update({ where: { id: userId }, data: {
      avatarUploadId: photo.id, avatarKey: photo.key, avatarIndex: 7, displayName: "Aman",
      deletionScheduledAt: DUE,
    } });

    // While the User still shows the photo there is no work, and nothing is deleted.
    expect(await job.execute({ now: SWEEP, limit: 10 })).toMatchObject({ deleted: 0, waiting: 0 });
    expect(await present(photo.keys)).toBe(5);

    // Only this suite's User is due in the year 2000, so the purge touches no one else.
    expect(await new PurgeExpiredAccounts(prisma).execute({ now: SWEEP })).toEqual({ purgedCount: 1 });

    expect(await prisma.user.findUniqueOrThrow({ where: { id: userId } })).toMatchObject({
      displayName: null, avatarKey: null, avatarUploadId: null, avatarIndex: 7, phone: null,
    });
    expect(await prisma.mediaUpload.findUniqueOrThrow({ where: { id: photo.id } })).toMatchObject({
      state: "RETIRED", retiredAt: SWEEP,
    });
    const work = await workOf(photo.id);
    expect(work).toMatchObject({
      status: "PENDING", attempts: 0, key: photo.key, writeProtocol: "conditional-v1", nextAttemptAt: SWEEP,
    });
    expect([...work.objectKeys].sort()).toEqual([...photo.keys].sort());
    // The purge only records the work; the bytes go in the sweep, with its retries.
    expect(await present(photo.keys)).toBe(5);

    expect(await job.execute({ now: SWEEP, limit: 10 })).toMatchObject({ deleted: 1, waiting: 0 });

    expect(await present(photo.keys)).toBe(0);
    expect(await workOf(photo.id)).toMatchObject({ status: "DONE" });
    expect(await stateOf(photo.id)).toBe("DELETED");
  });

  it("day-30 purge: a failed deletion of the photo is kept and retried (#642)", async () => {
    const photo = await retiredUpload({ state: "ADOPTED", work: "none" });
    await prisma.user.update({ where: { id: userId }, data: {
      avatarUploadId: photo.id, avatarKey: photo.key, deletionScheduledAt: DUE,
    } });
    await new PurgeExpiredAccounts(prisma).execute({ now: SWEEP });

    const failed = await new CleanRetiredUploads(ledger, outageAfter(2)).execute({ now: SWEEP, limit: 10 });

    expect(failed).toMatchObject({ deleted: 0, waiting: 1 });
    const waiting = await workOf(photo.id);
    expect(waiting).toMatchObject({ status: "PENDING", attempts: 1, lastError: "storage unavailable" });

    await job.execute({ now: new Date(waiting.nextAttemptAt.getTime() + 1), limit: 10 });

    expect(await present(photo.keys)).toBe(0);
    expect(await workOf(photo.id)).toMatchObject({ status: "DONE", attempts: 2 });
  });

  it("still deletes the bytes after the upload record and its User are gone", async () => {
    const upload = await retiredUpload();
    await prisma.user.delete({ where: { id: userId } });
    expect(await stateOf(upload.id)).toBeUndefined();

    expect(await job.execute({ now: SWEEP, limit: 10 })).toMatchObject({ deleted: 1 });

    expect(await present(upload.keys)).toBe(0);
    expect(await workOf(upload.id)).toMatchObject({ status: "DONE" });
  });

  it("keeps a single PostgreSQL lease within the sweep limit (#770 diagnostic)", async () => {
    const uploads = [await retiredUpload(), await retiredUpload(), await retiredUpload()];
    const first = await ledger.lease(SWEEP, 2);
    expect(first.length).toBeLessThanOrEqual(2);
    expect(first).toHaveLength(2);
    const second = await ledger.lease(SWEEP, 2);
    expect(second).toHaveLength(1);
    expect([...first, ...second].map((work) => work.uploadId).sort())
      .toEqual(uploads.map((upload) => upload.id).sort());
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
    // Hold both returned leases before deletion. No sleep or scheduling guess:
    // each job must report the work its own production SQL lease returned.
    const leases: CleanupWork[][] = [];
    let arrivals = 0;
    let release!: () => void;
    const bothLeased = new Promise<void>((resolve) => { release = resolve; });
    class ObservedLedger extends PrismaRetiredUploadLedger {
      override async lease(now: Date, limit: number): Promise<CleanupWork[]> {
        let leased: CleanupWork[];
        try {
          leased = await super.lease(now, limit);
          leases.push(leased);
        } finally {
          arrivals += 1;
          if (arrivals === 2) release();
        }
        await bothLeased;
        return leased;
      }
    }
    const sweep = () => new CleanRetiredUploads(new ObservedLedger(prisma), counting)
      .execute({ now: SWEEP, limit: 2 });

    const [one, two] = await Promise.all([sweep(), sweep()]);

    expect(leases).toHaveLength(2);
    for (const leased of leases) expect(leased.length).toBeLessThanOrEqual(2);
    expect(leases.flat().map((work) => work.uploadId).sort())
      .toEqual(uploads.map((upload) => upload.id).sort());
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
    expect(await present(upload.keys)).toBe(5);
  });
});
