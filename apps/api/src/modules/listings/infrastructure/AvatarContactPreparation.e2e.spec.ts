import "reflect-metadata";
import { PrismaService, type Prisma } from "@auto-tm/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaProfilePhotoLink } from "./PrismaProfilePhotoLink";
import { PrismaUploadClaims } from "./PrismaUploadClaims";
import { PrismaVerifiedContactPhoneRepository } from "./PrismaVerifiedContactPhoneRepository";
import { PrismaBusinessContactPhoneRepository } from "./PrismaBusinessContactPhoneRepository";
import { VerifiedContactPhone } from "../domain/VerifiedContactPhone";
import { identityPorts } from "../application/testing/AvatarContactDatabase";

// AUTHORED ONLY. Never imported, collected or executed by the R7d writer.
// Parent first installs testing/avatar-contact-r7d-20261025.sql before matched
// activation. This suite changes no triggers and starts no service or container.
const clock = { now: () => new Date() };
const prefix = (n: number) => `r7d-20261025-${n}`;
function gate() {
  let release: () => void = () => undefined;
  const promise = new Promise<void>(resolve => { release = resolve; });
  return { promise, release };
}
function instrument(db: PrismaService, pause?: string) {
  const reached = gate(); const release = gate();
  let pid = 0; let paused = false;
  const service = new Proxy(db, { get(target, property) {
    if (property !== "$transaction") {
      const value: unknown = Reflect.get(target, property);
      return typeof value === "function" ? value.bind(target) : value;
    }
    return <T>(work: (tx: Prisma.TransactionClient) => Promise<T>) => target.$transaction(async tx => {
      pid = (await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`)[0]?.pid ?? 0;
      const wrapped = new Proxy(tx, { get(client, name) {
        const value: unknown = Reflect.get(client, name);
        if (name !== "$queryRaw" || typeof value !== "function") return typeof value === "function" ? value.bind(client) : value;
        return async (...args: unknown[]) => {
          const result: unknown = await Reflect.apply(value, client, args);
          const sql = args[0] as TemplateStringsArray | { sql: string };
          const text = Array.isArray(sql) ? sql.join("?") : (sql as { sql: string }).sql;
          if (pause && !paused && text.includes(pause)) { paused = true; reached.release(); await release.promise; }
          return result;
        };
      } });
      return work(wrapped);
    });
  } });
  return { service, reached, release, pid: () => pid };
}
async function entered(reached: Promise<void>, held: Promise<unknown>): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([reached, held.then(() => { throw new Error("production caller ended before hold boundary"); }),
      new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error("production hold boundary not reached")), 1500); })]);
  } finally { if (timer) clearTimeout(timer); }
}
async function blocked(db: PrismaService, waiter: () => number, holder: () => number): Promise<void> {
  const deadline = Date.now() + 1500;
  while (Date.now() < deadline) {
    const [row] = await db.$queryRaw<{ blocked: boolean }[]>`SELECT ${holder()}::int=ANY(pg_blocking_pids(${waiter()}::int)) AS blocked`;
    if (row?.blocked) return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error("required PostgreSQL backend wait was not observed");
}
const link = (db: PrismaService) => new PrismaProfilePhotoLink(db, new PrismaUploadClaims(db, clock));
const bind = (db: PrismaService, n: number, upload = "new") => link(db).bind({ userId: `${prefix(n)}-seller`, uploadId: `${prefix(n)}-${upload}`,
  key: `${prefix(n)}/${upload}/original.webp`, token: `${prefix(n)}-token-${upload}` });
const suspend = (db: PrismaService, n: number) => identityPorts(db, clock).admin.suspendUser(`${prefix(n)}-seller`, `${prefix(n)}-admin`, "Synthetic opposition");
async function state(db: PrismaService, n: number) {
  const p = prefix(n);
  return {
    user: await db.user.findUniqueOrThrow({ where: { id: `${p}-seller` } }),
    uploads: await db.mediaUpload.findMany({ where: { id: { in: ["old", "new", "other", "foreign"].map(id => `${p}-${id}`) } }, orderBy: { id: "asc" } }),
    cleanup: await db.mediaUploadCleanup.findMany({ where: { uploadId: { startsWith: p } }, orderBy: { uploadId: "asc" } }),
    audits: await db.auditLog.count({ where: { targetId: `${p}-seller` } }),
  };
}

describe("R7d real production opposition on parent activated disposable candidate", { concurrent: false }, () => {
  const db = new PrismaService(); const a = new PrismaService(); const b = new PrismaService();
  beforeAll(async () => {
    const [ready] = await db.$queryRaw<{ source: boolean; campaign: boolean }[]>`
      SELECT public.diagnostic_source_guards_ready() AS source,public.campaign_preparation_ready() AS campaign`;
    expect(ready).toEqual({ source: true, campaign: true });
    for (let n = 1; n <= 10; n++) {
      const s = await state(db, n);
      expect(s.uploads).toHaveLength(4);
      expect(s.uploads.every(u => u.objectKeys.length === 5 && u.objectKeys.includes(u.key))).toBe(true);
      expect(s.uploads.filter(u => u.state === "PREPARING").every(u => !!u.claimToken && !!u.claimDeadline && u.claimTargetType === "profile")).toBe(true);
      expect(s.user.avatarUploadId).toBe([5, 6].includes(n) ? null : `${prefix(n)}-old`);
      expect(s.cleanup).toEqual([]);
      expect(s.audits).toBe(0);
    }
  });
  afterAll(async () => { await Promise.all([db.onModuleDestroy(), a.onModuleDestroy(), b.onModuleDestroy()]); });

  it.each([true, false])("serializes real bind against actual suspension, avatarFirst=%s", async avatarFirst => {
    const n = avatarFirst ? 1 : 2;
    const before = await state(db, n);
    const first = instrument(a, avatarFirst ? "SELECT 1 FROM public.users" : "diagnostic_prepare_source(");
    const second = instrument(b);
    const held = (avatarFirst ? bind(first.service, n) : suspend(first.service, n)).then(() => ({ ok: true }), error => ({ ok: false, error }));
    let followed: Promise<{ ok: boolean; error?: unknown }> | undefined;
    let failure: unknown;
    try {
      await entered(first.reached.promise, held);
      followed = (avatarFirst ? suspend(second.service, n) : bind(second.service, n)).then(() => ({ ok: true }), error => ({ ok: false, error }));
      await blocked(db, second.pid, first.pid);
    } catch (error) { failure = error; }
    finally {
      first.release.release();
      await Promise.all([held, ...(followed ? [followed] : [])]);
    }
    if (failure) throw failure;
    expect(await held).toMatchObject({ ok: true });
    if (!followed) throw new Error("opposing production caller did not start");
    const outcome = await followed;
    const after = await state(db, n);
    if (avatarFirst) {
      // R1 projects avatar fields for purge closure although its selective
      // ordinary UPDATE guard excludes them. The waiting source command must
      // refuse its stale snapshot rather than overwrite the new pointer.
      expect(outcome.ok).toBe(false);
      expect(String(outcome.error)).toMatch(/diagnostic_source_(stale|graph_changed)/);
      expect(after.user.suspendedAt).toBeNull();
      expect(after.user.avatarUploadId).toBe(`${prefix(n)}-new`);
      expect(after.cleanup.map(c => c.uploadId)).toEqual([`${prefix(n)}-old`]);
    } else {
      expect(outcome.ok).toBe(false);
      expect(String(outcome.error)).toMatch(/avatar_contact_scope_changed|suspended/i);
      expect(after.user.avatarUploadId).toBe(`${prefix(n)}-old`);
      expect(after.cleanup).toEqual([]);
      expect(after.uploads).toEqual(before.uploads);
    }
    if (!avatarFirst) expect(after.user.suspendedAt).not.toBeNull();
    expect(after.uploads.find(u => u.id.endsWith("-foreign"))).toEqual(before.uploads.find(u => u.id.endsWith("-foreign")));
  });

  it.each([true, false])("serializes real Business confirmation against owner suspension, contactFirst=%s", async contactFirst => {
    const n = contactFirst ? 3 : 4;
    const confirmation = VerifiedContactPhone.create({ sellerId: `${prefix(n)}-business`, phone: "+99361000000", confirmedAt: clock.now() });
    const record = (client: PrismaService) => new PrismaBusinessContactPhoneRepository(client,
      identityPorts(client, clock).authority).record(confirmation,
      { userId: `${prefix(n)}-seller`, sessionId: `${prefix(n)}-session`, businessId: confirmation.sellerId });
    const first = instrument(a, contactFirst ? "SELECT 1 FROM public.users" : "diagnostic_prepare_source(");
    const second = instrument(b);
    const held = (contactFirst ? record(first.service) : suspend(first.service, n)).then(() => ({ ok: true }), error => ({ ok: false, error }));
    let followed: Promise<{ ok: boolean; error?: unknown }> | undefined;
    let failure: unknown;
    try {
      await entered(first.reached.promise, held);
      followed = (contactFirst ? suspend(second.service, n) : record(second.service)).then(() => ({ ok: true }), error => ({ ok: false, error }));
      await blocked(db, second.pid, first.pid);
    } catch (error) { failure = error; }
    finally {
      first.release.release();
      await Promise.all([held, ...(followed ? [followed] : [])]);
    }
    if (failure) throw failure;
    expect(await held).toMatchObject({ ok: true });
    if (!followed) throw new Error("opponent not started");
    const result = await followed;
    const business = await db.dealership.findUniqueOrThrow({ where: { id: confirmation.sellerId } });
    if (contactFirst) { expect(result.ok).toBe(true); expect(business.contactPhone).toBe("+99361000000"); }
    else { expect(result.ok).toBe(false); expect(String(result.error)).toMatch(/avatar_contact_scope_changed|SESSION_REQUIRED|USER_INACTIVE/); expect(business.contactPhone).toBeNull(); }
  });

  it.each([5, 6, 7, 8])("single adopter across two real binds with absence/replacement case %s", async n => {
    const firstUpload = n % 2 ? "new" : "other";
    const otherUpload = n % 2 ? "other" : "new";
    const before = await state(db, n);
    const first = instrument(a, "SELECT 1 FROM public.users"); const second = instrument(b);
    const held = bind(first.service, n, firstUpload).then(() => ({ ok: true }), error => ({ ok: false, error }));
    let followed: Promise<{ ok: boolean; error?: unknown }> | undefined;
    let failure: unknown;
    try {
      await entered(first.reached.promise, held);
      followed = bind(second.service, n, otherUpload).then(() => ({ ok: true }), error => ({ ok: false, error }));
      await blocked(db, second.pid, first.pid);
    } catch (error) { failure = error; }
    finally {
      first.release.release();
      await Promise.all([held, ...(followed ? [followed] : [])]);
    }
    if (failure) throw failure;
    expect(await held).toEqual({ ok: true });
    if (!followed) throw new Error("opponent not started");
    const result = await followed;
    expect(result.ok).toBe(false); expect(String(result.error)).toContain("avatar_contact_scope_changed");
    const after = await state(db, n);
    expect(after.user.avatarUploadId).toBe(`${prefix(n)}-${firstUpload}`);
    expect(after.uploads.find(u => u.id === `${prefix(n)}-${otherUpload}`)).toEqual(before.uploads.find(u => u.id === `${prefix(n)}-${otherUpload}`));
    expect(after.cleanup.map(c => c.uploadId)).toEqual(n < 7 ? [] : [`${prefix(n)}-old`]);
    expect(after.audits).toBe(0);
  });

  it.each([9, 10])("refuses stale absent contact insertion by the other real repository, case %s", async n => {
    const first = instrument(a, "SELECT 1 FROM public.users"); const second = instrument(b);
    const confirmation = VerifiedContactPhone.create({ sellerId: `${prefix(n)}-seller`, phone: "+99361000000", confirmedAt: clock.now() });
    const held = new PrismaVerifiedContactPhoneRepository(first.service).record(confirmation).then(() => ({ ok: true }), error => ({ ok: false, error }));
    let followed: Promise<{ ok: boolean; error?: unknown }> | undefined;
    let failure: unknown;
    try {
      await entered(first.reached.promise, held);
      followed = new PrismaVerifiedContactPhoneRepository(second.service).record(confirmation).then(() => ({ ok: true }), error => ({ ok: false, error }));
      await blocked(db, second.pid, first.pid);
    } catch (error) { failure = error; }
    finally {
      first.release.release();
      await Promise.all([held, ...(followed ? [followed] : [])]);
    }
    if (failure) throw failure;
    expect(await held).toEqual({ ok: true });
    if (!followed) throw new Error("opponent not started");
    const result = await followed;
    expect(result.ok).toBe(false); expect(String(result.error)).toContain("avatar_contact_scope_changed");
    expect(await db.verifiedContactPhone.count({ where: { sellerId: confirmation.sellerId, phone: confirmation.phone } })).toBe(1);
  });
});
