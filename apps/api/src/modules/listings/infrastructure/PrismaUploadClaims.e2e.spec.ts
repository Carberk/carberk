import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaService } from "@auto-tm/db";

import {
  cleanSuiteFixtures,
  defineE2eSuite,
  seedSuiteCatalog,
} from "../../../../test/helpers/e2eSuite";
import { ListingMedia } from "../domain/ListingMedia";
import { imageUploadObjectKeys } from "../domain/imageUploadObjectKeys";
import type { UploadClaimTarget } from "../domain/ports/UploadClaimPort";
import { PrismaListingMediaRepository } from "./PrismaListingMediaRepository";
import { PrismaUploadClaims } from "./PrismaUploadClaims";

// Issue #721 / ADR-0088 against the hosted disposable Postgres: the row lock on
// the upload record, not two unique columns or a preflight read, decides the
// single adopter across Listing media and Profile Photos.

const suite = defineE2eSuite("upload-claims");
const USERS = ["owner", "stranger"] as const;
const OWNER = suite.id("owner");
const LISTING = suite.id("listing");
const OTHER_LISTING = suite.id("listing-2");
const listingTarget: UploadClaimTarget = { type: "listing", id: LISTING };
const profileTarget: UploadClaimTarget = { type: "profile", id: OWNER };

describe("common upload claim on Postgres (#721)", () => {
  let prisma: PrismaService;
  let claims: PrismaUploadClaims;
  let mediaRepo: PrismaListingMediaRepository;
  const cleanupIds: string[] = [];

  async function clean(): Promise<void> {
    await prisma.user.updateMany({
      where: { id: { in: USERS.map((alias) => suite.id(alias)) } },
      data: { avatarUploadId: null, avatarKey: null },
    });
    await prisma.mediaUploadCleanup.deleteMany({ where: { uploadId: { in: cleanupIds } } });
    cleanupIds.length = 0;
    await cleanSuiteFixtures(prisma, suite, { userAliases: USERS });
  }

  beforeAll(() => {
    prisma = new PrismaService();
    claims = new PrismaUploadClaims(prisma, { now: () => new Date() });
    mediaRepo = new PrismaListingMediaRepository(prisma, claims);
  });

  afterAll(async () => {
    await clean();
    await prisma.onModuleDestroy();
  });

  beforeEach(async () => {
    await clean();
    await seedSuiteCatalog(prisma, suite);
    for (const alias of USERS) {
      await prisma.user.create({
        data: { id: suite.id(alias), phone: suite.phone(alias), phoneVerifiedAt: new Date(), role: "buyer" },
      });
    }
    for (const id of [LISTING, OTHER_LISTING]) {
      await prisma.listing.create({ data: {
        id, sellerId: OWNER, status: "active", brandId: suite.catalog.brandId,
        modelId: suite.catalog.modelId, cityId: suite.catalog.cityId,
        priceAmount: 100000, priceCurrency: "TMT", publishedAt: new Date(),
      } });
    }
  });

  async function presigned(protocol: "legacy" | "conditional-v1" = "legacy", userId = OWNER) {
    const key = `pending/${randomUUID()}/original.webp`;
    const upload = await prisma.mediaUpload.create({ data: {
      userId, key, kind: "image", contentType: "image/webp", sizeBytes: 2048,
      writeProtocol: protocol,
      objectKeys: protocol === "conditional-v1" ? imageUploadObjectKeys(key) : [],
    } });
    cleanupIds.push(upload.id);
    return upload;
  }

  const stateOf = async (id: string) =>
    (await prisma.mediaUpload.findUniqueOrThrow({ where: { id } })).state;

  const mediaFor = (upload: { id: string; key: string }, listingId = LISTING) =>
    ListingMedia.create({
      id: randomUUID(), listingId, kind: "image", key: upload.key, sortOrder: 0, uploadId: upload.id,
    });

  async function tokenOf(reservation: Awaited<ReturnType<PrismaUploadClaims["reserve"]>>) {
    if (!("token" in reservation)) throw new Error("Expected a new reservation");
    return reservation.token;
  }

  /** What profile infrastructure (#642) does with the same claim. */
  async function adoptAsProfile(upload: { id: string; key: string }, token: string) {
    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${OWNER} FOR UPDATE`;
      const outcome = await claims.finalize(tx, { token, uploadIds: [upload.id], target: profileTarget });
      await tx.user.update({ where: { id: OWNER }, data: { avatarUploadId: upload.id, avatarKey: upload.key } });
      return outcome;
    });
  }

  /** Sessions of this database blocked on a lock while claiming an upload. */
  async function waitingClaimants(expected: number): Promise<void> {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const [row] = await prisma.$queryRaw<{ waiting: bigint }[]>`
        SELECT count(*) AS waiting FROM pg_stat_activity
        WHERE datname = current_database() AND wait_event_type = 'Lock'
          AND query ILIKE '%media_uploads%FOR UPDATE%'`;
      if (Number(row?.waiting ?? 0) >= expected) return;
      await new Promise((done) => setTimeout(done, 25));
    }
    throw new Error(`Expected ${expected} claimants to wait on the upload lock`);
  }

  /**
   * Holds the upload's row lock, queues `first` and then `second` behind it, and
   * releases. Postgres grants a row lock to its waiters in arrival order, so the
   * overlap is forced and its winner is known.
   */
  async function overlap<A, B>(uploadId: string, first: () => Promise<A>, second: () => Promise<B>) {
    let release!: () => void;
    const held = new Promise<void>((resolveHeld) => { release = resolveHeld; });
    let locked!: () => void;
    const lockTaken = new Promise<void>((resolveLocked) => { locked = resolveLocked; });
    const barrier = prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM media_uploads WHERE id = ${uploadId} FOR UPDATE`;
      locked();
      await held;
    }, { timeout: 30_000 });
    await lockTaken;
    const firstResult = first().then((value) => ({ value }), (error: unknown) => ({ error }));
    await waitingClaimants(1);
    const secondResult = second().then((value) => ({ value }), (error: unknown) => ({ error }));
    await waitingClaimants(2);
    release();
    await barrier;
    return [await firstResult, await secondResult] as const;
  }

  describe("one adopter across Listing media and Profile Photos", () => {
    it("Listing first: the overlapping Profile Photo claim is refused and adopts nothing", async () => {
      const upload = await presigned("conditional-v1");

      const [listing, profile] = await overlap(
        upload.id,
        () => claims.reserve({ userId: OWNER, uploadIds: [upload.id], target: listingTarget }),
        () => claims.reserve({ userId: OWNER, uploadIds: [upload.id], target: profileTarget }),
      );

      expect(profile).toMatchObject({ error: { code: "UPLOAD_ALREADY_ATTACHED" } });
      if (!("value" in listing)) throw listing.error;
      const saved = await mediaRepo.save(mediaFor(upload), { token: await tokenOf(listing.value) });
      expect(saved.uploadId).toBe(upload.id);
      expect(await stateOf(upload.id)).toBe("ADOPTED");
      // The committed adopter still refuses the other kind of claimant.
      await expect(claims.reserve({ userId: OWNER, uploadIds: [upload.id], target: profileTarget }))
        .rejects.toMatchObject({ code: "UPLOAD_ALREADY_ATTACHED" });
      expect((await prisma.user.findUniqueOrThrow({ where: { id: OWNER } })).avatarUploadId).toBeNull();
      expect(await prisma.listingMedia.count({ where: { uploadId: upload.id } })).toBe(1);
    });

    it("Profile Photo first: the overlapping Listing claim is refused and writes no media row", async () => {
      const upload = await presigned("conditional-v1");

      const [profile, listing] = await overlap(
        upload.id,
        () => claims.reserve({ userId: OWNER, uploadIds: [upload.id], target: profileTarget }),
        () => claims.reserve({ userId: OWNER, uploadIds: [upload.id], target: listingTarget }),
      );

      expect(listing).toMatchObject({ error: { code: "UPLOAD_ALREADY_ATTACHED" } });
      if (!("value" in profile)) throw profile.error;
      expect(await adoptAsProfile(upload, await tokenOf(profile.value))).toBe("adopted");
      // A Listing row cannot be forced in beside the Profile Photo, even with a stolen token.
      await expect(mediaRepo.save(mediaFor(upload), { token: await tokenOf(profile.value) }))
        .rejects.toMatchObject({ code: "UPLOAD_ALREADY_ATTACHED" });
      expect(await prisma.listingMedia.count({ where: { uploadId: upload.id } })).toBe(0);
      expect((await prisma.user.findUniqueOrThrow({ where: { id: OWNER } })).avatarUploadId).toBe(upload.id);
    });

    it("lets one of two Listings adopt when both hold the same upload", async () => {
      const upload = await presigned();
      const token = await tokenOf(await claims.reserve({ userId: OWNER, uploadIds: [upload.id], target: listingTarget }));

      await expect(claims.reserve({
        userId: OWNER, uploadIds: [upload.id], target: { type: "listing", id: OTHER_LISTING },
      })).rejects.toMatchObject({ code: "UPLOAD_ALREADY_ATTACHED" });
      await expect(mediaRepo.save(mediaFor(upload, OTHER_LISTING), { token }))
        .rejects.toMatchObject({ code: "UPLOAD_ALREADY_ATTACHED" });
      expect(await prisma.listingMedia.count({ where: { uploadId: upload.id } })).toBe(0);
    });

    it("reserves all of a publication's uploads or none", async () => {
      const [free, taken] = [await presigned(), await presigned()];
      await claims.reserve({ userId: OWNER, uploadIds: [taken.id], target: profileTarget });

      await expect(claims.reserve({ userId: OWNER, uploadIds: [free.id, taken.id], target: listingTarget }))
        .rejects.toMatchObject({ code: "UPLOAD_ALREADY_ATTACHED" });

      expect(await stateOf(free.id)).toBe("AVAILABLE");
    });

    it("keeps provenance checks: another User's upload and an unknown upload are not available", async () => {
      const foreign = await presigned("legacy", suite.id("stranger"));

      for (const id of [foreign.id, randomUUID()]) {
        await expect(claims.reserve({ userId: OWNER, uploadIds: [id], target: listingTarget }))
          .rejects.toMatchObject({ code: "UPLOAD_NOT_AVAILABLE" });
      }
      expect(await stateOf(foreign.id)).toBe("AVAILABLE");
    });
  });

  describe("retrying the same target", () => {
    it("joins the in-flight reservation and returns the one committed row to both", async () => {
      const upload = await presigned();
      const first = await tokenOf(await claims.reserve({ userId: OWNER, uploadIds: [upload.id], target: listingTarget }));
      const retry = await tokenOf(await claims.reserve({ userId: OWNER, uploadIds: [upload.id], target: listingTarget }));
      expect(retry).toBe(first);

      const [one, two] = await Promise.all([
        mediaRepo.save(mediaFor(upload), { token: first }),
        mediaRepo.save(mediaFor(upload), { token: retry }),
      ]);

      expect(one.id).toBe(two.id);
      expect(await prisma.listingMedia.count({ where: { uploadId: upload.id } })).toBe(1);
      expect(await claims.reserve({ userId: OWNER, uploadIds: [upload.id], target: listingTarget }))
        .toEqual({ alreadyAdopted: true });
    });

    it("rolls the adoption back with the transaction that carried it", async () => {
      const upload = await presigned();
      const token = await tokenOf(await claims.reserve({ userId: OWNER, uploadIds: [upload.id], target: profileTarget }));

      await expect(prisma.$transaction(async (tx) => {
        await claims.finalize(tx, { token, uploadIds: [upload.id], target: profileTarget });
        await tx.user.update({ where: { id: OWNER }, data: { avatarUploadId: upload.id } });
        throw new Error("the adopter's own write failed");
      })).rejects.toThrow("the adopter's own write failed");

      expect(await stateOf(upload.id)).toBe("PREPARING");
      expect((await prisma.user.findUniqueOrThrow({ where: { id: OWNER } })).avatarUploadId).toBeNull();
    });

    it("writes the claim deadline and retirement time from the injected UTC clock", async () => {
      // The worker ledger compares claimDeadline against its own clock, so the
      // claim must record the injected clock's time, not the database session's
      // now() (review P3 at 9fc23c13).
      const at = new Date("2030-01-01T00:00:00.000Z");
      const timed = new PrismaUploadClaims(prisma, { now: () => at });
      const upload = await presigned("conditional-v1");

      await timed.reserve({ userId: OWNER, uploadIds: [upload.id], target: listingTarget });
      const reserved = await prisma.mediaUpload.findUniqueOrThrow({ where: { id: upload.id } });
      expect(reserved.claimDeadline?.getTime()).toBe(at.getTime() + 10 * 60 * 1000);

      await prisma.$transaction((tx) => timed.retire(tx, upload.id));
      const retired = await prisma.mediaUpload.findUniqueOrThrow({ where: { id: upload.id } });
      expect(retired.retiredAt?.getTime()).toBe(at.getTime());
    });
  });

  describe("retirement", () => {
    async function adopted(protocol: "legacy" | "conditional-v1") {
      const upload = await presigned(protocol);
      const token = await tokenOf(await claims.reserve({ userId: OWNER, uploadIds: [upload.id], target: listingTarget }));
      const media = await mediaRepo.save(mediaFor(upload), { token });
      return { upload, media };
    }

    it("releases the Listing row, closes adoption and records the exact manifest in one transaction", async () => {
      const { upload, media } = await adopted("conditional-v1");

      expect(await mediaRepo.deleteReleasingUpload(media.id)).toMatchObject({ removed: true });

      expect(await prisma.listingMedia.count({ where: { id: media.id } })).toBe(0);
      const row = await prisma.mediaUpload.findUniqueOrThrow({ where: { id: upload.id } });
      expect(row).toMatchObject({ state: "RETIRED", claimToken: null });
      expect(row.retiredAt).not.toBeNull();
      const work = await prisma.mediaUploadCleanup.findUniqueOrThrow({ where: { uploadId: upload.id } });
      expect(work).toMatchObject({ status: "PENDING", key: upload.key, attempts: 0, writeProtocol: "conditional-v1" });
      expect([...work.objectKeys].sort()).toEqual(imageUploadObjectKeys(upload.key).sort());
    });

    it("keeps a legacy upload's physical cleanup explicitly pending", async () => {
      const { upload, media } = await adopted("legacy");

      await mediaRepo.deleteReleasingUpload(media.id);

      expect(await stateOf(upload.id)).toBe("RETIRED");
      expect(await prisma.mediaUploadCleanup.findUniqueOrThrow({ where: { uploadId: upload.id } }))
        .toMatchObject({ status: "LEGACY_PENDING", objectKeys: [] });
    });

    it.each(["RETIRED", "DELETED"])("never lets a %s upload be adopted again", async (state) => {
      const { upload, media } = await adopted("conditional-v1");
      await mediaRepo.deleteReleasingUpload(media.id);
      await prisma.mediaUpload.update({ where: { id: upload.id }, data: { state } });

      for (const target of [listingTarget, profileTarget]) {
        await expect(claims.reserve({ userId: OWNER, uploadIds: [upload.id], target }))
          .rejects.toMatchObject({ code: "UPLOAD_NOT_AVAILABLE" });
      }
      await expect(mediaRepo.save(mediaFor(upload), { token: randomUUID() }))
        .rejects.toMatchObject({ code: "UPLOAD_NOT_AVAILABLE" });
      expect(await prisma.listingMedia.count({ where: { uploadId: upload.id } })).toBe(0);
    });

    it("keeps the adopter and records no work when the releasing transaction fails", async () => {
      const { upload, media } = await adopted("conditional-v1");

      await expect(prisma.$transaction(async (tx) => {
        await tx.listingMedia.delete({ where: { id: media.id } });
        expect(await claims.retire(tx, upload.id)).toBe(true);
        throw new Error("release failed");
      })).rejects.toThrow("release failed");

      expect(await stateOf(upload.id)).toBe("ADOPTED");
      expect(await prisma.listingMedia.count({ where: { id: media.id } })).toBe(1);
      expect(await prisma.mediaUploadCleanup.count({ where: { uploadId: upload.id } })).toBe(0);
    });

    it("records one piece of work when the same upload is retired concurrently", async () => {
      const { upload } = await adopted("conditional-v1");

      const outcomes = await Promise.all([1, 2, 3].map(() =>
        prisma.$transaction((tx) => claims.retire(tx, upload.id))));

      expect(outcomes.filter(Boolean)).toHaveLength(1);
      expect(await prisma.mediaUploadCleanup.count({ where: { uploadId: upload.id } })).toBe(1);
      expect(await prisma.$transaction((tx) => claims.retire(tx, upload.id))).toBe(false);
    });

    it("retires an abandoned preparation and refuses its late finalization", async () => {
      const upload = await presigned("conditional-v1");
      const token = await tokenOf(await claims.reserve({ userId: OWNER, uploadIds: [upload.id], target: listingTarget }));

      await claims.abandon(token);

      expect(await stateOf(upload.id)).toBe("RETIRED");
      expect(await prisma.mediaUploadCleanup.count({ where: { uploadId: upload.id } })).toBe(1);
      await expect(mediaRepo.save(mediaFor(upload), { token }))
        .rejects.toMatchObject({ code: "UPLOAD_NOT_AVAILABLE" });
      expect(await prisma.listingMedia.count({ where: { uploadId: upload.id } })).toBe(0);
    });

    it("refuses a new row whose poster upload was retired", async () => {
      const { upload: poster, media: posterMedia } = await adopted("conditional-v1");
      await mediaRepo.deleteReleasingUpload(posterMedia.id);
      const video = await presigned();
      const token = await tokenOf(await claims.reserve({ userId: OWNER, uploadIds: [video.id], target: listingTarget }));

      await expect(mediaRepo.save(mediaFor(video), { token, posterUploadId: poster.id }))
        .rejects.toMatchObject({ code: "UPLOAD_NOT_AVAILABLE" });
      expect(await prisma.listingMedia.count({ where: { uploadId: video.id } })).toBe(0);
    });
  });

  describe("release and settle for a transient publish failure (#735)", () => {
    it("release returns every held upload to AVAILABLE without recording work, and a retry can reserve them again", async () => {
      const [one, two] = [await presigned("conditional-v1"), await presigned("conditional-v1")];
      const token = await tokenOf(
        await claims.reserve({ userId: OWNER, uploadIds: [one.id, two.id], target: listingTarget }),
      );

      await claims.release(token);

      for (const upload of [one, two]) {
        expect(await prisma.mediaUpload.findUniqueOrThrow({ where: { id: upload.id } })).toMatchObject({
          state: "AVAILABLE", claimToken: null, claimDeadline: null,
          claimTargetType: null, claimTargetId: null,
        });
      }
      expect(await prisma.mediaUploadCleanup.count({ where: { uploadId: { in: [one.id, two.id] } } })).toBe(0);
      const retry = await claims.reserve({ userId: OWNER, uploadIds: [one.id, two.id], target: { type: "listing", id: OTHER_LISTING } });
      expect(retry).toMatchObject({ joined: false });
      expect(await stateOf(one.id)).toBe("PREPARING");
      expect(await stateOf(two.id)).toBe("PREPARING");
      expect("token" in retry && retry.token).not.toBe(token);
    });

    it("release touches nothing a committed attempt holds", async () => {
      const upload = await presigned();
      const token = await tokenOf(await claims.reserve({ userId: OWNER, uploadIds: [upload.id], target: listingTarget }));
      await mediaRepo.save(mediaFor(upload), { token });

      await claims.release(token);

      expect(await stateOf(upload.id)).toBe("ADOPTED");
      expect(await prisma.listingMedia.count({ where: { uploadId: upload.id } })).toBe(1);
      expect(await prisma.mediaUploadCleanup.count({ where: { uploadId: upload.id } })).toBe(0);
    });

    it("settle retires exactly one held upload with its manifest and releases the rest", async () => {
      const [bad, good] = [await presigned("conditional-v1"), await presigned("conditional-v1")];
      const token = await tokenOf(
        await claims.reserve({ userId: OWNER, uploadIds: [bad.id, good.id], target: listingTarget }),
      );

      expect(await claims.settle(token, bad.id)).toBe(true);

      expect(await prisma.mediaUpload.findUniqueOrThrow({ where: { id: bad.id } }))
        .toMatchObject({ state: "RETIRED", claimToken: null });
      const work = await prisma.mediaUploadCleanup.findUniqueOrThrow({ where: { uploadId: bad.id } });
      expect(work).toMatchObject({ status: "PENDING", key: bad.key });
      expect([...work.objectKeys].sort()).toEqual(imageUploadObjectKeys(bad.key).sort());
      expect(await prisma.mediaUpload.findUniqueOrThrow({ where: { id: good.id } }))
        .toMatchObject({ state: "AVAILABLE", claimToken: null });
      expect(await prisma.mediaUploadCleanup.count({ where: { uploadId: good.id } })).toBe(0);
    });

    it("settle is false and retires nothing once the attempt no longer holds the upload", async () => {
      const upload = await presigned();
      const token = await tokenOf(await claims.reserve({ userId: OWNER, uploadIds: [upload.id], target: listingTarget }));
      await mediaRepo.save(mediaFor(upload), { token });

      expect(await claims.settle(token, upload.id)).toBe(false);

      expect(await stateOf(upload.id)).toBe("ADOPTED");
      expect(await prisma.mediaUploadCleanup.count({ where: { uploadId: upload.id } })).toBe(0);
      expect(await prisma.listingMedia.count({ where: { uploadId: upload.id } })).toBe(1);
    });

    it("pre-reserve retirement refuses another User's upload and existing Listing/Profile adopters under the lock", async () => {
      const [foreign, listed, profile] = [await presigned(), await presigned(), await presigned()];
      // Legacy references can predate claim-state backfill and still authorize no retirement.
      await prisma.listingMedia.create({ data: { listingId: LISTING, kind: "image", key: listed.key, uploadId: listed.id, sortOrder: 0 } });
      await prisma.user.update({ where: { id: OWNER }, data: { avatarUploadId: profile.id, avatarKey: profile.key } });
      const retire = claims.retireUnclaimed.bind(claims);
      expect(await retire(foreign.id, suite.id("stranger"), async () => true)).toBe(false);
      expect(await retire(listed.id, OWNER, async () => true)).toBe(false);
      expect(await retire(profile.id, OWNER, async () => true)).toBe(false);
      for (const upload of [foreign, listed, profile]) {
        expect(await stateOf(upload.id)).toBe("AVAILABLE");
        expect(await prisma.mediaUploadCleanup.count({ where: { uploadId: upload.id } })).toBe(0);
      }
    });

    it("keeps the row locked during reinspection and refuses retirement when the object is now valid", async () => {
      const upload = await presigned();
      let locked = false;
      const retire = claims.retireUnclaimed.bind(claims);
      const result = await retire(upload.id, OWNER, async () => {
        // Another transaction cannot take the upload's row lock while storage is rechecked.
        locked = await prisma.$transaction(async (tx) => {
          const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM media_uploads WHERE id = ${upload.id} FOR UPDATE SKIP LOCKED`;
          return rows.length === 0;
        });
        return false;
      });
      expect(result).toBe(false);
      expect(locked).toBe(true);
      expect(await stateOf(upload.id)).toBe("AVAILABLE");
      expect(await prisma.mediaUploadCleanup.count({ where: { uploadId: upload.id } })).toBe(0);
    });

    it("retireUnclaimed retires an AVAILABLE upload but never an adopted or held one", async () => {
      const [free, adopted] = [await presigned(), await presigned()];
      const token = await tokenOf(await claims.reserve({ userId: OWNER, uploadIds: [adopted.id], target: listingTarget }));
      await mediaRepo.save(mediaFor(adopted), { token });

      expect(await claims.retireUnclaimed(adopted.id, OWNER, async () => true)).toBe(false);
      expect(await claims.retireUnclaimed(free.id, OWNER, async () => true)).toBe(true);

      expect(await stateOf(adopted.id)).toBe("ADOPTED");
      expect(await stateOf(free.id)).toBe("RETIRED");
      expect(await prisma.mediaUploadCleanup.count({ where: { uploadId: { in: [free.id, adopted.id] } } })).toBe(1);
    });
  });

  it("the migration backfill marks an existing Listing claim adopted and leaves unclaimed uploads alone", async () => {
    // Rows as they stand between the additive migration and its backfill.
    const [claimed, unclaimed] = [await presigned(), await presigned()];
    await prisma.listingMedia.create({ data: {
      listingId: LISTING, kind: "image", key: claimed.key, sortOrder: 0, uploadId: claimed.id,
    } });
    // The migration ships in every checkout (implementation commit 6161871b),
    // so there is no existsSync guard. Its UPDATE is scoped to this test's
    // rows: the database is shared with other suites, and an unscoped backfill
    // would adopt their in-flight uploads too.
    const file = resolve(__dirname,
      "../../../../../../packages/db/prisma/migrations/20261007130100_backfill_upload_adoption_state/migration.sql");
    const scope = ` AND u."id" IN ('${claimed.id}', '${unclaimed.id}')`;
    const sql = readFileSync(file, "utf8")
      .replace(`u."state" = 'AVAILABLE'`, `u."state" = 'AVAILABLE'${scope}`);
    expect(sql).toContain(scope.trim());
    await prisma.$executeRawUnsafe(sql);

    expect(await prisma.mediaUpload.findUniqueOrThrow({ where: { id: claimed.id } })).toMatchObject({
      state: "ADOPTED", claimTargetType: "listing", claimTargetId: LISTING, writeProtocol: "legacy",
    });
    expect(await stateOf(unclaimed.id)).toBe("AVAILABLE");
    await expect(claims.reserve({ userId: OWNER, uploadIds: [claimed.id], target: profileTarget }))
      .rejects.toMatchObject({ code: "UPLOAD_ALREADY_ATTACHED" });
  });
});
