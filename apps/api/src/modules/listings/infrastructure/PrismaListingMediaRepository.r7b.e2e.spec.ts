import { PrismaService, type Prisma } from "@auto-tm/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaListingMediaRepository } from "./PrismaListingMediaRepository";
import { PrismaMediaUploadRepository } from "./PrismaMediaUploadRepository";
import { PrismaUploadClaims } from "./PrismaUploadClaims";
import { ListingMedia } from "../domain/ListingMedia";

// AUTHORED ONLY. Never imported/collected/executed by this writer. Parent installs
// testing/media-callers-r7b-20261025.sql before matching candidate activation.
const p = (n: number) => `r7b-20261025-${n}`;
const clock = { now: () => new Date() };
const media = (n: number, id = "photo", provenance = true) => ListingMedia.create({
  id: `${p(n)}-${id}`, listingId: `${p(n)}-listing`, kind: "image", key: `${p(n)}/original.webp`, sortOrder: 0,
  ...(provenance ? { uploadId: `${p(n)}-upload` } : {}),
});
const repository = (db: PrismaService) => new PrismaListingMediaRepository(db, new PrismaUploadClaims(db, clock));
async function reservation(db: PrismaService, n: number) {
  const result = await new PrismaUploadClaims(db, clock).reserve({ userId: `${p(n)}-owner`, uploadIds: [`${p(n)}-upload`], target: { type: "listing", id: `${p(n)}-listing` } });
  if (!("token" in result)) throw new Error("r7b_expected_reservation");
  return { token: result.token };
}
async function state(db: PrismaService, n: number) {
  return { uploads: await db.mediaUpload.findMany({ where: { userId: `${p(n)}-owner` }, orderBy: { id: "asc" } }),
    media: await db.listingMedia.findMany({ where: { listingId: { in: [`${p(n)}-listing`, `${p(n)}-other`] } }, orderBy: { id: "asc" } }),
    cleanup: await db.mediaUploadCleanup.findMany({ where: { uploadId: { in: [`${p(n)}-upload`, `${p(n)}-second-upload`] } }, orderBy: { uploadId: "asc" } }) };
}
function gate() {
  let release: () => void = () => undefined;
  const promise = new Promise<void>(resolve => { release = resolve; });
  return { promise, release };
}
function instrument(db: PrismaService, fault = false) {
  const reached = gate(), release = gate();
  let pid = 0;
  const service = new Proxy(db, { get(target, key) {
    if (key !== "$transaction") { const value: unknown = Reflect.get(target, key); return typeof value === "function" ? value.bind(target) : value; }
    return <T>(work: (tx: Prisma.TransactionClient) => Promise<T>) => target.$transaction(async tx => {
      pid = (await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`)[0]?.pid ?? 0;
      return work(new Proxy(tx, { get(client, name) {
        const value: unknown = Reflect.get(client, name);
        if (name !== "$queryRaw" || typeof value !== "function") return typeof value === "function" ? value.bind(client) : value;
        return async (...args: unknown[]) => {
          const result: unknown = await Reflect.apply(value, client, args);
          const sql = args[0] as TemplateStringsArray | { sql: string };
          const text = Array.isArray(sql) ? sql.join("?") : (sql as { sql: string }).sql;
          if (text.includes("campaign_finish(")) {
            if (fault) throw new Error("r7b_finish_fault_injection");
            reached.release(); await release.promise;
          }
          return result;
        };
      } }));
    });
  } });
  return { service, reached, release, pid: () => pid };
}
async function held(reached: Promise<void>, running: Promise<unknown>) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { await Promise.race([reached, running.then(() => { throw new Error("r7b_barrier_not_reached"); }),
    new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error("r7b_barrier_timeout")), 1500); })]); }
  finally { if (timer) clearTimeout(timer); }
}
async function blocked(db: PrismaService, waiter: () => number, holder: () => number) {
  const deadline = Date.now() + 1500;
  while (Date.now() < deadline) {
    const [row] = await db.$queryRaw<{ blocked: boolean }[]>`SELECT ${holder()}::int=ANY(pg_blocking_pids(${waiter()}::int)) AS blocked`;
    if (row?.blocked) return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error("r7b_backend_wait_not_observed");
}

describe("R7b disposable production media callers", { concurrent: false }, () => {
  const db = new PrismaService(), a = new PrismaService(), b = new PrismaService();
  beforeAll(async () => {
    const [ready] = await db.$queryRaw<{ source: boolean; campaign: boolean }[]>`SELECT public.diagnostic_source_guards_ready() AS source, public.campaign_preparation_ready() AS campaign`;
    expect(ready).toEqual({ source: true, campaign: true });
    for (let n = 1; n <= 13; n++) {
      expect(await db.listing.count({ where: { id: { in: [`${p(n)}-listing`, `${p(n)}-other`] }, sellerId: `${p(n)}-owner`, status: "active" } })).toBe(2);
      expect((await state(db, n)).cleanup).toEqual([]);
    }
  });
  afterAll(async () => { await Promise.all([db.onModuleDestroy(), a.onModuleDestroy(), b.onModuleDestroy()]); });
  it("adopts and joins idempotently through the actual repository", async () => {
    const claim = await reservation(db, 1);
    expect((await repository(db).save(media(1), claim)).id).toBe(`${p(1)}-photo`);
    expect((await repository(db).save(media(1), claim)).id).toBe(`${p(1)}-photo`);
    expect((await repository(db).save(media(1, "retry"), claim)).id).toBe(`${p(1)}-photo`);
    const after = await state(db, 1);
    expect(after.media).toHaveLength(1); expect(after.uploads[0]).toMatchObject({ state: "ADOPTED", claimToken: null });
  });
  it("refuses a stale token and rolls back without media", async () => {
    await reservation(db, 2); const before = await state(db, 2);
    await expect(repository(db).save(media(2), { token: "foreign-token" })).rejects.toMatchObject({ code: "UPLOAD_ALREADY_ATTACHED" });
    expect(await state(db, 2)).toEqual(before);
  });
  it("refuses a retired upload without an adopter", async () => {
    const before = await state(db, 3);
    await expect(repository(db).save(media(3), { token: "stale-token" })).rejects.toMatchObject({ code: "UPLOAD_NOT_AVAILABLE" });
    expect(await state(db, 3)).toEqual(before);
  });
  it("rolls back earlier reorder writes on a foreign Listing ID", async () => {
    const before = await state(db, 4);
    await expect(repository(db).updateSortOrder(`${p(4)}-listing`, [{ mediaId: `${p(4)}-photo`, sortOrder: 5 }, { mediaId: `${p(4)}-foreign`, sortOrder: 6 }])).rejects.toMatchObject({ code: "P2025" });
    expect(await state(db, 4)).toEqual(before);
  });
  it("rolls back adoption and media together on a driver fault after finish", async () => {
    const claim = await reservation(db, 5), before = await state(db, 5);
    await expect(repository(instrument(a, true).service).save(media(5), claim)).rejects.toThrow("r7b_finish_fault_injection");
    expect(await state(db, 5)).toEqual(before);
  });
  it("serializes two actual attaches of the same upload and refuses the stale discovery", async () => {
    const claim = await reservation(db, 6), first = instrument(a), second = instrument(b);
    const started: Promise<unknown>[] = [];
    const one = repository(first.service).save(media(6), claim).then(value => ({ value }), error => ({ error })); started.push(one);
    let two: Promise<{ value: ListingMedia } | { error: unknown }> | undefined;
    try {
      await held(first.reached.promise, one);
      two = repository(second.service).save(media(6, "opponent"), claim).then(value => ({ value }), error => ({ error })); started.push(two);
      await blocked(db, second.pid, first.pid);
    } finally {
      first.release.release(); second.release.release(); await Promise.allSettled(started);
    }
    expect(await one).toMatchObject({ value: { id: `${p(6)}-photo` } });
    if (!two) throw new Error("r7b_opponent_not_started");
    const outcome = await two;
    expect(outcome).toHaveProperty("error");
    if (!("error" in outcome)) throw new Error("r7b_expected_stale_discovery");
    expect(String(outcome.error)).toContain("media_caller_scope_changed");
    expect((await state(db, 6)).media.map(row => row.id)).toEqual([`${p(6)}-photo`]);
  });
  it("registers exact provenance through its actual ordinary outer transaction", async () => {
    const objectKeys = ["original", "sm", "md", "lg", "thumb"].map(name => `${p(7)}/${name}.webp`);
    await new PrismaMediaUploadRepository(db).record({ id: `${p(7)}-registered`, userId: `${p(7)}-owner`, key: `${p(7)}/original.webp`, kind: "image", contentType: "image/webp", sizeBytes: 100,
      createdAt: new Date(), writeProtocol: "conditional-v1", objectKeys });
    expect((await state(db, 7)).uploads[0]).toMatchObject({ id: `${p(7)}-registered`, state: "AVAILABLE", objectKeys: [`${p(7)}/original.webp`, `${p(7)}/sm.webp`, `${p(7)}/md.webp`, `${p(7)}/lg.webp`, `${p(7)}/thumb.webp`] });
  });
  it("saves and directly deletes legacy media without retiring bytes", async () => {
    await repository(db).save(media(8, "legacy", false)); await repository(db).delete(`${p(8)}-legacy`);
    expect(await state(db, 8)).toEqual({ uploads: [], media: [], cleanup: [] });
  });
  it("retires through the actual supplied helper and persists its exact clock and cleanup", async () => {
    const actual = new Date("2026-10-25T12:00:03.789Z");
    const caller = new PrismaListingMediaRepository(db, new PrismaUploadClaims(db, { now: () => actual }));
    expect(await caller.deleteReleasingUpload(`${p(9)}-upload-photo`, 1)).toEqual({ removed: true });
    const after = await state(db, 9);
    expect(after.media.map(row => row.id)).toEqual([`${p(9)}-second-upload-photo`]);
    expect(after.uploads.find(row => row.id === `${p(9)}-upload`)).toMatchObject({ state: "RETIRED", retiredAt: actual, claimToken: null, claimDeadline: null });
    expect(after.cleanup).toHaveLength(1);
    expect(after.cleanup[0]).toMatchObject({ uploadId: `${p(9)}-upload`, key: `${p(9)}/upload/original.webp`, writeProtocol: "conditional-v1", status: "PENDING",
      objectKeys: ["original", "sm", "md", "lg", "thumb"].map(name => `${p(9)}/upload/${name}.webp`) });
  });
  it("rolls back media, retirement and cleanup on an explicit finish fault", async () => {
    const before = await state(db, 10), fault = instrument(a, true);
    const caller = new PrismaListingMediaRepository(fault.service, new PrismaUploadClaims(fault.service, { now: () => new Date("2026-10-25T12:00:05.123Z") }));
    await expect(caller.deleteReleasingUpload(`${p(10)}-upload-photo`, 1)).rejects.toThrow("r7b_finish_fault_injection");
    expect(await state(db, 10)).toEqual(before);
  });
  it("refuses the photo floor without deleting or retiring", async () => {
    const before = await state(db, 11);
    await expect(repository(db).deleteReleasingUpload(`${p(11)}-upload-photo`, 2)).rejects.toMatchObject({ code: "PHOTO_MINIMUM_REQUIRED" });
    expect(await state(db, 11)).toEqual(before);
  });
  it.each([{ n: 12, firstSuffix: "upload", secondSuffix: "second-upload" }, { n: 13, firstSuffix: "second-upload", secondSuffix: "upload" }])(
    "serializes distinct-photo floor opponents with $firstSuffix first", async ({ n, firstSuffix, secondSuffix }) => {
      const first = instrument(a), second = instrument(b), started: Promise<unknown>[] = [];
      const one = repository(first.service).deleteReleasingUpload(`${p(n)}-${firstSuffix}-photo`, 1).then(value => ({ value }), error => ({ error })); started.push(one);
      let two: Promise<unknown> | undefined;
      try {
        await held(first.reached.promise, one);
        two = repository(second.service).deleteReleasingUpload(`${p(n)}-${secondSuffix}-photo`, 1).then(value => ({ value }), error => ({ error })); started.push(two);
        await blocked(db, second.pid, first.pid);
      } finally {
        first.release.release(); second.release.release(); await Promise.allSettled(started);
      }
      expect(await one).toEqual({ value: { removed: true } });
      if (!two) throw new Error("r7b_opponent_not_started");
      expect(await two).toMatchObject({ error: { code: "PHOTO_MINIMUM_REQUIRED" } });
      const after = await state(db, n);
      expect(after.media.map(row => row.id)).toEqual([`${p(n)}-${secondSuffix}-photo`]);
      expect(after.uploads.find(row => row.id === `${p(n)}-${firstSuffix}`)).toMatchObject({ state: "RETIRED" });
      expect(after.uploads.find(row => row.id === `${p(n)}-${secondSuffix}`)).toMatchObject({ state: "ADOPTED", retiredAt: null });
      expect(after.cleanup.map(row => row.uploadId)).toEqual([`${p(n)}-${firstSuffix}`]);
    });

});
