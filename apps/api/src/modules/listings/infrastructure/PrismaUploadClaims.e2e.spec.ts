import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaService, type Prisma, withCampaignPreparation } from "@auto-tm/db";

import { withFixtureCallerDrain } from "../../../../test/helpers/fixtureCallerDrain";
import { PrismaProfilePhotoLink } from "./PrismaProfilePhotoLink";
import { ListingMedia } from "../domain/ListingMedia";
import { imageUploadObjectKeys } from "../domain/imageUploadObjectKeys";
import type { UploadClaimTarget } from "../domain/ports/UploadClaimPort";
import { PrismaListingMediaRepository } from "./PrismaListingMediaRepository";
import { PrismaUploadClaims } from "./PrismaUploadClaims";
import { claimPostgresFixture } from "./testing/UploadClaimsPostgresFixture";
import { retireWithFixturePreparation } from "./testing/UploadClaimsRetireFixture";

// Task-owned disposable worker database only. Snapshot and restore every guard
// mode; seed before activation and run actual caller transactions as a nonowner.
const fixture = (n: number) => `r7c-existing-20261025-${n}`;
let OWNER: string, STRANGER: string, LISTING: string, OTHER_LISTING: string;
let listingTarget: UploadClaimTarget, profileTarget: UploadClaimTarget;
// Stable graph selection also supports individual tests and name filters.
const fixtureCaseNames = [
  "Listing first: the overlapping Profile Photo claim is refused and adopts nothing",
  "Profile Photo first: the overlapping Listing claim is refused and writes no media row",
  "lets one of two Listings adopt when both hold the same upload",
  "reserves all of a publication's uploads or none",
  "keeps provenance checks: another User's upload and an unknown upload are not available",
  "joins the in-flight reservation and returns the one committed row to both",
  "rolls the adoption back with the transaction that carried it",
  "writes the claim deadline and retirement time from the injected UTC clock",
  "releases the Listing row, closes adoption and records the exact manifest in one transaction",
  "keeps a legacy upload's physical cleanup explicitly pending",
  "never lets a RETIRED upload be adopted again",
  "never lets a DELETED upload be adopted again",
  "keeps the adopter and records no work when the releasing transaction fails",
  "records one piece of work when the same upload is retired concurrently",
  "retires an abandoned preparation and refuses its late finalization",
  "refuses a new row whose poster upload was retired",
  "release returns every held upload to AVAILABLE without recording work, and a retry can reserve them again",
  "release touches nothing a committed attempt holds",
  "settle retires exactly one held upload with its manifest and releases the rest",
  "settle is false and retires nothing once the attempt no longer holds the upload",
  "pre-reserve retirement refuses another User's upload and existing Listing/Profile adopters under the lock",
  "keeps the row locked during reinspection and refuses retirement when the object is now valid",
  "retireUnclaimed retires an AVAILABLE upload but never an adopted or held one",
  "replaces the real profile, preserves foreign bytes and makes an adopted retry unchanged",
  "unbinds a real legacy profile with the exact manifest and leaves foreign rows unchanged",
  "the migration backfill marks an existing Listing claim adopted and leaves unclaimed uploads alone"
] as const;


describe("common upload claim on Postgres (#721)", { concurrent: false }, () => {
  let prisma: PrismaService;
  const databaseFixture = claimPostgresFixture(readFileSync(resolve(__dirname, "testing/upload-claims-existing-r7c-20261025.sql"), "utf8"), "r7c-existing-20261025-", true);
  let claims: PrismaUploadClaims;
  let mediaRepo: PrismaListingMediaRepository;
  let profileLink: PrismaProfilePhotoLink;
  let graph = 0;
  const allocated = new Map<string, number>();

  beforeAll(async () => {
    prisma = await databaseFixture.start();
    const [ready] = await prisma.$queryRaw<{ source: boolean; campaign: boolean }[]>`
      SELECT public.diagnostic_source_guards_ready() AS source, public.campaign_preparation_ready() AS campaign`;
    expect(ready).toEqual({ source: true, campaign: true });
    // Assert complete preactivation fixture reachability before any negatives.
    for (let n = 1; n <= 26; n++) {
      const p = fixture(n);
      expect(await prisma.user.count({ where: { id: { in: [`${p}-owner`, `${p}-stranger`] } } })).toBe(2);
      expect(await prisma.listing.count({ where: { id: { in: [`${p}-listing`, `${p}-listing-2`] } } })).toBe(2);
      const uploads = await prisma.mediaUpload.findMany({ where: { id: { startsWith: `${p}-upload-` } } });
      expect(uploads).toHaveLength(32);
      expect(uploads.every(u => u.state === "AVAILABLE" && u.claimToken === null &&
        (u.writeProtocol === "legacy" ? u.objectKeys.length === 0 :
          JSON.stringify(u.objectKeys) === JSON.stringify(imageUploadObjectKeys(u.key))))).toBe(true);
      expect(await prisma.mediaUploadCleanup.count({ where: { uploadId: { startsWith: `${p}-upload-` } } })).toBe(0);
    }
  });

  afterAll(() => databaseFixture.stop());

  beforeEach(({ task }) => {
    graph = fixtureCaseNames.findIndex(name => name === task.name) + 1;
    if (!graph) throw new Error("upload_claim_fixture_graph_missing");
    const p = fixture(graph);
    OWNER = `${p}-owner`; STRANGER = `${p}-stranger`;
    LISTING = `${p}-listing`; OTHER_LISTING = `${p}-listing-2`;
    listingTarget = { type: "listing", id: LISTING };
    profileTarget = { type: "profile", id: OWNER };
    allocated.clear();
    claims = new PrismaUploadClaims(prisma, { now: () => new Date() });
    mediaRepo = new PrismaListingMediaRepository(prisma, claims);
    profileLink = new PrismaProfilePhotoLink(prisma, claims);
  });

  const suppliedRetire = (caller: PrismaUploadClaims, id: string, at: Date) =>
    prisma.$transaction(tx => retireWithFixturePreparation(tx, id, at, () => caller.retire(tx, id)));

  async function presigned(protocol: "legacy" | "conditional-v1" = "legacy", userId = OWNER) {
    const alias = userId === OWNER ? "owner" : userId === STRANGER ? "stranger" : undefined;
    if (!alias) throw new Error("upload_claim_fixture_owner");
    const pool = `${alias}-${protocol}`;
    const index = allocated.get(pool) ?? 0;
    allocated.set(pool, index + 1);
    const upload = await prisma.mediaUpload.findUniqueOrThrow({ where: { id: `${fixture(graph)}-upload-${pool}-${index}` } });
    expect(upload).toMatchObject({ userId, writeProtocol: protocol, state: "AVAILABLE", claimToken: null });
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

  // This proxy only pauses a completed production statement or fails the real
  // User write. PID discovery runs before the callback, never behind its wait.
  function instrument(pausePrefix = false, failUserWrite = false) {
    let pid = 0, release!: () => void, reached!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    const entered = new Promise<void>(resolve => { reached = resolve; });
    const service = new Proxy(prisma, { get(target, name) {
      if (name !== "$transaction") {
        const value: unknown = Reflect.get(target, name);
        return typeof value === "function" ? value.bind(target) : value;
      }
      return <T>(work: (tx: Prisma.TransactionClient) => Promise<T>, options?: { maxWait?: number; timeout?: number; isolationLevel?: Prisma.TransactionIsolationLevel }) => target.$transaction(async tx => {
        pid = (await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`)[0]?.pid ?? 0;
        return work(new Proxy(tx, { get(client, property) {
          const value: unknown = Reflect.get(client, property);
          if (property === "user" && failUserWrite) return new Proxy(client.user, { get(model, method) {
            if (method !== "update") return Reflect.get(model, method);
            return async (...args: unknown[]) => {
              await Reflect.apply(model.update, model, args);
              throw new Error("the adopter's own write failed");
            };
          } });
          if (property !== "$queryRaw" || typeof value !== "function") return typeof value === "function" ? value.bind(client) : value;
          return async (...args: unknown[]) => {
            const result: unknown = await Reflect.apply(value, client, args);
            const query = args[0] as TemplateStringsArray | { sql: string };
            const text = Array.isArray(query) ? query.join("?") : (query as { sql: string }).sql;
            if (pausePrefix && text.includes("SELECT pg_advisory_xact_lock(")) { reached(); await held; }
            return result;
          };
        } }));
      }, options);
    } });
    return { service, release, entered, pid: () => pid };
  }

  async function boundedEntry(entered: Promise<void>, caller: Promise<unknown>) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([entered, caller.then(result => {
          if (result && typeof result === "object" && "error" in result) throw result.error;
          throw new Error("upload_claim_prefix_not_reached");
        }),
        new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error("upload_claim_prefix_timeout")), 5000); })]);
    } finally { if (timer) clearTimeout(timer); }
  }

  async function waitingClaimant(waiter: () => number, holder: () => number, running: Promise<unknown>) {
    for (let attempt = 0; attempt < 200; attempt++) {
      const [row] = await prisma.$queryRaw<{ blocked: boolean }[]>`
        SELECT ${holder()}::int = ANY(pg_blocking_pids(${waiter()}::int)) AS blocked`;
      if (waiter() && holder() && row?.blocked) return;
      await Promise.race([new Promise(resolve => setTimeout(resolve, 25)),
        running.then(result => {
          if (result && typeof result === "object" && "error" in result) throw result.error;
          throw new Error("upload_claim_contender_finished_without_wait");
        })]);
    }
    throw new Error("Expected claimant to wait on the metadata key prefix");
  }

  /** Actual first reserve owns the first metadata key after its campaign prefix;
   * second reserve waits on that same key.
   * The stale-discovery/public-error mismatch is reported to parent, with the
   * original literal assertions below preserved. No test translates the error. */
  async function overlap<A, B>(_uploadId: string, first: (claims: PrismaUploadClaims) => Promise<A>, second: (claims: PrismaUploadClaims) => Promise<B>) {
    const holder = instrument(true), waiter = instrument();
    return withFixtureCallerDrain(holder.release, async start => {
      const firstResult = start(() => first(new PrismaUploadClaims(holder.service, { now: () => new Date() }))
        .then(value => ({ value }), (error: unknown) => ({ error })));
      await boundedEntry(holder.entered, firstResult);
      const secondResult = start(() => second(new PrismaUploadClaims(waiter.service, { now: () => new Date() }))
        .then(value => ({ value }), (error: unknown) => ({ error })));
      await waitingClaimant(waiter.pid, holder.pid, secondResult);
      holder.release();
      return [await firstResult, await secondResult] as const;
    });
  }

  describe("one adopter across Listing media and Profile Photos", () => {
    it("Listing first: the overlapping Profile Photo claim is refused and adopts nothing", async () => {
      const upload = await presigned("conditional-v1");

      const [listing, profile] = await overlap(
        upload.id,
        contender => contender.reserve({ userId: OWNER, uploadIds: [upload.id], target: listingTarget }),
        contender => contender.reserve({ userId: OWNER, uploadIds: [upload.id], target: profileTarget }),
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
        contender => contender.reserve({ userId: OWNER, uploadIds: [upload.id], target: profileTarget }),
        contender => contender.reserve({ userId: OWNER, uploadIds: [upload.id], target: listingTarget }),
      );

      expect(listing).toMatchObject({ error: { code: "UPLOAD_ALREADY_ATTACHED" } });
      if (!("value" in profile)) throw profile.error;
      await expect(profileLink.bind({ userId: OWNER, uploadId: upload.id, key: upload.key, token: await tokenOf(profile.value) })).resolves.toBeUndefined();
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
      const foreign = await presigned("legacy", STRANGER);

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

      const [one, two] = await Promise.allSettled([
        mediaRepo.save(mediaFor(upload), { token: first }),
        mediaRepo.save(mediaFor(upload), { token: retry }),
      ]);

      if (one.status === "rejected") throw one.reason;
      if (two.status === "rejected") throw two.reason;
      expect(one.value.id).toBe(two.value.id);
      expect(await prisma.listingMedia.count({ where: { uploadId: upload.id } })).toBe(1);
      expect(await claims.reserve({ userId: OWNER, uploadIds: [upload.id], target: listingTarget }))
        .toEqual({ alreadyAdopted: true });
    });

    it("rolls the adoption back with the transaction that carried it", async () => {
      const upload = await presigned();
      const token = await tokenOf(await claims.reserve({ userId: OWNER, uploadIds: [upload.id], target: profileTarget }));

      const fault = instrument(false, true);
      const failingClaims = new PrismaUploadClaims(fault.service, { now: () => new Date() });
      const failingLink = new PrismaProfilePhotoLink(fault.service, failingClaims);
      await expect(failingLink.bind({ userId: OWNER, uploadId: upload.id, key: upload.key, token }))
        .rejects.toThrow("the adopter's own write failed");

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

      await suppliedRetire(timed, upload.id, at);
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
      // Test-only fixture state fault, not a competing production caller.
      await prisma.$transaction(tx => withCampaignPreparation(tx, [{ table: "media_uploads", key: { id: upload.id }, verb: "update", next: { state } }],
        () => tx.mediaUpload.update({ where: { id: upload.id }, data: { state } })));

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

      // Fault the enclosing transaction after the real media release returns;
      // this is driver-failure evidence, never a handwritten opposing command.
      let retired = false;
      const observedClaims = new Proxy(claims, { get(target, name) {
        if (name === "retire") return async (tx: unknown, id: string) => {
          const result = await target.retire(tx, id); retired = result; return result;
        };
        const value: unknown = Reflect.get(target, name);
        return typeof value === "function" ? value.bind(target) : value;
      } });
      const failingService = new Proxy(prisma, { get(target, name) {
        if (name === "$transaction") return <T>(work: (tx: Prisma.TransactionClient) => Promise<T>, options?: { maxWait?: number; timeout?: number; isolationLevel?: Prisma.TransactionIsolationLevel }) => target.$transaction(async tx => {
          await work(tx);
          expect(retired).toBe(true);
          throw new Error("release failed");
        }, options);
        const value: unknown = Reflect.get(target, name);
        return typeof value === "function" ? value.bind(target) : value;
      } });
      await expect(new PrismaListingMediaRepository(failingService, observedClaims).deleteReleasingUpload(media.id))
        .rejects.toThrow("release failed");

      expect(await stateOf(upload.id)).toBe("ADOPTED");
      expect(await prisma.listingMedia.count({ where: { id: media.id } })).toBe(1);
      expect(await prisma.mediaUploadCleanup.count({ where: { uploadId: upload.id } })).toBe(0);
    });

    it("records one piece of work when the same upload is retired concurrently", async () => {
      const { upload } = await adopted("conditional-v1");

      // Each caller owns its live upfront receipt; the supplied helper reuses it.
      const settled = await Promise.allSettled([1, 2, 3].map(() =>
        suppliedRetire(claims, upload.id, new Date())));
      const outcomes = settled.map(result => { if (result.status === "rejected") throw result.reason; return result.value; });

      expect(outcomes.filter(Boolean)).toHaveLength(1);
      expect(await prisma.mediaUploadCleanup.count({ where: { uploadId: upload.id } })).toBe(1);
      expect(await suppliedRetire(claims, upload.id, new Date())).toBe(false);
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
      expect(await prisma.listingMedia.findUniqueOrThrow({ where: { uploadId: listed.id } })).toMatchObject({ listingId: LISTING, key: listed.key });
      expect(await prisma.user.findUniqueOrThrow({ where: { id: OWNER } })).toMatchObject({ avatarUploadId: profile.id, avatarKey: profile.key });
      const retire = claims.retireUnclaimed.bind(claims);
      expect(await retire(foreign.id, STRANGER, async () => true)).toBe(false);
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

  it("replaces the real profile, preserves foreign bytes and makes an adopted retry unchanged", async () => {
    const [old, next, foreign] = [await presigned("conditional-v1"), await presigned("conditional-v1"), await presigned("conditional-v1", STRANGER)];
    const bind = async (upload: { id: string; key: string }) => {
      const token = await tokenOf(await claims.reserve({ userId: OWNER, uploadIds: [upload.id], target: profileTarget }));
      await profileLink.bind({ userId: OWNER, uploadId: upload.id, key: upload.key, token });
      return token;
    };
    await bind(old);
    const foreignBefore = await prisma.mediaUpload.findUniqueOrThrow({ where: { id: foreign.id } });
    const token = await bind(next);
    expect(await stateOf(old.id)).toBe("RETIRED");
    expect(await stateOf(next.id)).toBe("ADOPTED");
    expect(await prisma.mediaUploadCleanup.findUniqueOrThrow({ where: { uploadId: old.id } })).toMatchObject({ key: old.key, objectKeys: old.objectKeys, writeProtocol: "conditional-v1", status: "PENDING" });
    const before = await prisma.user.findUniqueOrThrow({ where: { id: OWNER } });
    await profileLink.bind({ userId: OWNER, uploadId: next.id, key: next.key, token });
    expect(await prisma.user.findUniqueOrThrow({ where: { id: OWNER } })).toEqual(before);
    expect(await prisma.mediaUpload.findUniqueOrThrow({ where: { id: foreign.id } })).toEqual(foreignBefore);
    expect(await profileLink.unbind(OWNER)).toBe(next.key);
    expect(await profileLink.unbind(OWNER)).toBeNull();
    expect(await stateOf(next.id)).toBe("RETIRED");
    expect(await prisma.mediaUploadCleanup.count({ where: { uploadId: { in: [old.id, next.id] } } })).toBe(2);
  });

  it("unbinds a real legacy profile with the exact manifest and leaves foreign rows unchanged", async () => {
    const upload = await presigned();
    const foreign = await presigned("legacy", STRANGER);
    const before = await prisma.mediaUpload.findUniqueOrThrow({ where: { id: foreign.id } });
    const token = await tokenOf(await claims.reserve({ userId: OWNER, uploadIds: [upload.id], target: profileTarget }));
    await profileLink.bind({ userId: OWNER, uploadId: upload.id, key: upload.key, token });
    expect(await profileLink.unbind(OWNER)).toBe(upload.key);
    expect(await profileLink.unbind(OWNER)).toBeNull();
    expect(await stateOf(upload.id)).toBe("RETIRED");
    expect(await prisma.mediaUploadCleanup.findUniqueOrThrow({ where: { uploadId: upload.id } })).toMatchObject({ key: upload.key, objectKeys: [], writeProtocol: "legacy", status: "LEGACY_PENDING" });
    expect(await prisma.mediaUpload.findUniqueOrThrow({ where: { id: foreign.id } })).toEqual(before);
  });

  it("the migration backfill marks an existing Listing claim adopted and leaves unclaimed uploads alone", async () => {
    // Rows as they stand between the additive migration and its backfill.
    const [claimed, unclaimed] = [await presigned(), await presigned()];
    expect(await prisma.listingMedia.findUniqueOrThrow({ where: { uploadId: claimed.id } })).toMatchObject({ listingId: LISTING, key: claimed.key });
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
    await prisma.$transaction(tx => withCampaignPreparation(tx, [{ table: "media_uploads", key: { id: claimed.id }, verb: "update",
      next: { state: "ADOPTED", claimTargetType: "listing", claimTargetId: LISTING } }], () => tx.$executeRawUnsafe(sql)));

    expect(await prisma.mediaUpload.findUniqueOrThrow({ where: { id: claimed.id } })).toMatchObject({
      state: "ADOPTED", claimTargetType: "listing", claimTargetId: LISTING, writeProtocol: "legacy",
    });
    expect(await stateOf(unclaimed.id)).toBe("AVAILABLE");
    await expect(claims.reserve({ userId: OWNER, uploadIds: [claimed.id], target: profileTarget }))
      .rejects.toMatchObject({ code: "UPLOAD_ALREADY_ATTACHED" });
  });
});
