import { randomUUID } from "node:crypto";
import { resolve } from "node:path";

import { PrismaService, withCampaignPreparation, type Prisma } from "@auto-tm/db";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { CleanRetiredUploads } from "./CleanRetiredUploads";
import { PrismaRetiredUploadLedger } from "./PrismaRetiredUploadLedger";
import { PurgeExpiredAccounts } from "./PurgeExpiredAccounts";
import { PrismaVideoCleanupLedger } from "./video/PrismaVideoCleanupLedger";
// Only the public opponent contract is named here. Production implementation
// loads from the assembled API, without widening the worker TypeScript root.
interface Claims {
  release(token: string): Promise<void>;
  reserve(input: { userId: string; uploadIds: string[]; target: { type: "listing" | "profile"; id: string } }): Promise<unknown>;
  finalize(tx: unknown, input: { token: string; uploadIds: string[]; target: { type: "listing" | "profile"; id: string } }): Promise<"adopted" | "already">;
}

// Explicit task-owned disposable database only. This suite needs no HTTP, Redis
// or storage service. Storage retry is tested through its real application port.
const database = process.env["RETIRED_UPLOAD_TEST_DATABASE_URL"];
if (database && !/^postgresql:\/\/auto_tm_ci:auto_tm_ci_pass@127\.0\.0\.1:\d+\/auto_tm_ci(?:\?.*)?$/.test(database)) {
  throw new Error("Retired upload acceptance requires its task-owned disposable database");
}
const NOW = new Date("2000-01-02T00:00:00Z");
const DUE = new Date("2000-01-01T00:00:00Z");

describe.skipIf(!database)("retired upload prepared PostgreSQL callers", () => {
  let db: PrismaService;
  let ledger: PrismaRetiredUploadLedger;
  const userId = randomUUID();
  const catalog = { brandId: randomUUID(), modelId: randomUUID(), regionId: randomUUID(), cityId: randomUUID() };
  const uploads: string[] = [];
  const generations: string[] = [];

  const role = `retired_${randomUUID().replaceAll("-", "")}`;
  let roleCreated = false;
  let guardState: { table: string; name: string; enabled: string }[] = [];
  let activation: Promise<void> | undefined;
  async function guards(enabled: boolean) {
    for (const row of guardState) {
      const table = row.table.replaceAll('"', '""'), name = row.name.replaceAll('"', '""');
      await db.$executeRawUnsafe(`ALTER TABLE public."${table}" ${enabled ? "ENABLE" : "DISABLE"} TRIGGER "${name}"`);
    }
  }
  async function activate() {
    await guards(true);
    const [ready] = await db.$queryRaw<{ ready: boolean }[]>`SELECT diagnostic_source_guards_ready() AND campaign_preparation_ready() AS ready`;
    expect(ready?.ready).toBe(true);
  }
  function runtime(): PrismaService {
    return new Proxy(db, { get(target, property) {
      if (property === "$transaction") return async <T>(run: (tx: Prisma.TransactionClient) => Promise<T>, options?: Parameters<PrismaService["$transaction"]>[1]) => {
        activation ??= activate(); await activation;
        return target.$transaction(async tx => {
          await tx.$executeRawUnsafe(`SET LOCAL ROLE "${role}"`);
          const [actual] = await tx.$queryRaw<{ name: string; superuser: boolean; owns: boolean }[]>`SELECT current_user AS name,r.rolsuper AS superuser,pg_has_role(current_user,c.relowner,'USAGE') AS owns FROM pg_roles r JOIN pg_class c ON c.oid='public.media_uploads'::regclass WHERE r.rolname=current_user`;
          expect(actual).toEqual({ name: role, superuser: false, owns: false });
          return run(tx);
        }, options);
      };
      const value: unknown = Reflect.get(target, property); return typeof value === "function" ? value.bind(target) : value;
    } });
  }
  beforeAll(async () => {
    process.env["DATABASE_URL"] = database;
    db = new PrismaService();
    guardState = await db.$queryRaw<typeof guardState>`SELECT c.relname AS table,t.tgname AS name,t.tgenabled::text AS enabled FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND (t.tgname LIKE 'zz_diagnostic_source_%' OR t.tgname LIKE 'zzzz_campaign_preparation%' OR t.tgname='diagnostic_source_no_truncate')`;
    expect(guardState.length).toBeGreaterThan(0);
    await guards(false);
    await db.$executeRawUnsafe(`CREATE ROLE "${role}" NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT`);
    roleCreated = true;
    await db.$executeRawUnsafe(`GRANT USAGE ON SCHEMA public TO "${role}"`);
    await db.$executeRawUnsafe(`GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO "${role}"`);
    await db.$executeRawUnsafe(`GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO "${role}"`);
    await db.$executeRawUnsafe(`GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO "${role}"`);
    ledger = new PrismaRetiredUploadLedger(runtime());
    await db.user.create({ data: { id: userId } });
    const names = { nameRu: "Cleanup", nameTk: "Cleanup", nameEn: "Cleanup" };
    await db.brand.create({ data: { id: catalog.brandId, slug: randomUUID(), ...names } });
    await db.model.create({ data: { id: catalog.modelId, brandId: catalog.brandId, slug: randomUUID(), ...names } });
    await db.region.create({ data: { id: catalog.regionId, slug: randomUUID(), ...names } });
    await db.city.create({ data: { id: catalog.cityId, regionId: catalog.regionId, slug: randomUUID(), ...names } });
  });
  beforeEach(async () => {
    await guards(false); activation = undefined;
    await db.user.update({ where: { id: userId }, data: { avatarKey: null, avatarUploadId: null } });
    await db.listing.deleteMany({ where: { sellerId: userId } });
    await db.videoCleanupWork.deleteMany({ where: { uploadId: { in: uploads } } });
    await db.videoGeneration.deleteMany({ where: { id: { in: generations } } });
    generations.length = 0;
    await db.mediaUploadCleanup.deleteMany({ where: { uploadId: { in: uploads } } });
    await db.mediaUpload.deleteMany({ where: { id: { in: uploads } } });
    uploads.length = 0;
  });
  afterAll(async () => {
    if (!db) return;
    try {
    await guards(false);
    await db.user.update({ where: { id: userId }, data: { avatarKey: null, avatarUploadId: null } });
    await db.listing.deleteMany({ where: { sellerId: userId } });
    await db.videoCleanupWork.deleteMany({ where: { uploadId: { in: uploads } } });
    await db.videoGeneration.deleteMany({ where: { id: { in: generations } } });
    generations.length = 0;
    await db.mediaUploadCleanup.deleteMany({ where: { uploadId: { in: uploads } } });
    await db.mediaUpload.deleteMany({ where: { id: { in: uploads } } });
    await db.user.delete({ where: { id: userId } });
    await db.city.delete({ where: { id: catalog.cityId } });
    await db.region.delete({ where: { id: catalog.regionId } });
    await db.model.delete({ where: { id: catalog.modelId } });
    await db.brand.delete({ where: { id: catalog.brandId } });
    } finally {
      try {
        for (const row of guardState) {
          const table = row.table.replaceAll('"', '""'), name = row.name.replaceAll('"', '""');
          const mode = row.enabled === "D" ? "DISABLE" : row.enabled === "A" ? "ENABLE ALWAYS" : row.enabled === "R" ? "ENABLE REPLICA" : "ENABLE";
          await db.$executeRawUnsafe(`ALTER TABLE public."${table}" ${mode} TRIGGER "${name}"`);
        }
        if (roleCreated) { await db.$executeRawUnsafe(`DROP OWNED BY "${role}"`); await db.$executeRawUnsafe(`DROP ROLE "${role}"`); }
      } finally { await db.onModuleDestroy(); }
    }
  });
  async function listing() {
    return db.listing.create({ data: { sellerId: userId, status: "active", brandId: catalog.brandId, modelId: catalog.modelId, cityId: catalog.cityId, priceAmount: 100000 } });
  }
  async function upload(options: { target?: { type: string; id: string }; protocol?: string; deadline?: Date; retired?: boolean } = {}) {
    const id = randomUUID(), key = `pending/${randomUUID()}/original.webp`;
    const directory = key.replace(/[^/]+$/, "");
    const objectKeys = [key, ...["thumbnail", "list", "detail", "fullscreen"].map(n => `${directory}${n}.webp`)];
    const row = await db.mediaUpload.create({ data: {
      id, userId, key, objectKeys, writeProtocol: options.protocol ?? "conditional-v1", kind: "image", contentType: "image/webp", sizeBytes: 100,
      state: options.retired ? "RETIRED" : "PREPARING", retiredAt: options.retired ? DUE : null,
      ...(!options.retired ? { claimToken: randomUUID(), claimDeadline: options.deadline ?? DUE, claimTargetType: options.target?.type ?? "listing", claimTargetId: options.target?.id ?? randomUUID() } : {}),
    } });
    uploads.push(id); return row;
  }
  async function work(id: string, due = DUE, status = "PENDING") {
    const row = await db.mediaUpload.findUniqueOrThrow({ where: { id } });
    return db.mediaUploadCleanup.create({ data: { uploadId: id, key: row.key, objectKeys: row.objectKeys, writeProtocol: row.writeProtocol, nextAttemptAt: due, status } });
  }

  /** These real opponents require the accepted633f claims and994e video
   * preparation, plus311637ca purge, to be assembled by the parent. Variable
   * import keeps the private video helper absent at de80 a named runtime
   * prerequisite instead of copying it or fabricating an opposing command. */
  async function claims(): Promise<Claims> {
    const path = resolve(__dirname, "../../../api/src/modules/listings/infrastructure/PrismaUploadClaims.ts");
    const module = await import(/* @vite-ignore */ path) as { PrismaUploadClaims: new (db: PrismaService, clock: { now(): Date }) => Claims };
    return new module.PrismaUploadClaims(runtime(), { now: () => DUE });
  }
  async function finalize(row: Awaited<ReturnType<typeof upload>>, claim: Claims, client = runtime()) {
    const path = resolve(__dirname, "video/VideoTransactionPreparation.ts");
    const module = await import(/* @vite-ignore */ path) as { preparedVideo<T>(tx: Prisma.TransactionClient, selection: { uploadId: string; target: { kind: string; id: string } }, work: () => Promise<T>): Promise<T> };
    return client.$transaction(tx => module.preparedVideo(tx, { uploadId: row.id, target: { kind: "profile", id: userId } }, async () => {
      const result = await claim.finalize(tx, { token: row.claimToken ?? "missing", uploadIds: [row.id], target: { type: "profile", id: userId } });
      await tx.user.update({ where: { id: userId }, data: { avatarUploadId: row.id, avatarKey: row.key } });
      return result;
    }));
  }
  function pause(match: string) {
    let enter = (_pid: number) => {}; let release = () => {};
    const entered = new Promise<number>(resolve => { enter = resolve; });
    const gate = new Promise<void>(resolve => { release = resolve; });
    let used = false;
    const client = new Proxy(runtime(), { get(target, property) {
      if (property === "$transaction") return <T>(run: (tx: Prisma.TransactionClient) => Promise<T>, options?: Parameters<PrismaService["$transaction"]>[1]) => target.$transaction(tx => run(new Proxy(tx, { get(connection, key) {
        if (key === "$queryRaw") return async (first: TemplateStringsArray | Prisma.Sql, ...values: unknown[]) => {
          const result: unknown = await Reflect.apply(connection.$queryRaw, connection, [first, ...values]);
          const text = Array.isArray(first) ? first.join("") : (first as Prisma.Sql).text;
          if (!used && text.includes(match)) {
            used = true;
            const [backend] = await connection.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
            if (!backend) throw new Error("missing holder backend");
            enter(backend.pid); await gate;
          }
          return result;
        };
        const value: unknown = Reflect.get(connection, key); return typeof value === "function" ? value.bind(connection) : value;
      } })), options);
      const value: unknown = Reflect.get(target, property); return typeof value === "function" ? value.bind(target) : value;
    } });
    return { client, entered, release };
  }
  async function blockedBy(pid: number) {
    const end = Date.now() + 2000;
    while (Date.now() < end) {
      const rows = await db.$queryRaw<{ pid: number }[]>`SELECT pid FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND ${pid}=ANY(pg_blocking_pids(pid))`;
      if (rows.length) return;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    throw new Error("real opposing caller did not exhibit PostgreSQL lock wait");
  }
  const outcome = async <T>(promise: Promise<T>) => promise.then(value => ({ ok: true as const, value }), error => ({ ok: false as const, error: error as unknown }));
  it.each(["finalize", "recovery"])("composition race: profile finalization and recovery with %s holding the first real lock", async first => {
    const row = await upload({ target: { type: "profile", id: userId } }); const claim = await claims();
    const held = pause(first === "finalize" ? "pg_advisory_xact_lock" : "pg_try_advisory_xact_lock");
    const a = outcome<unknown>(first === "finalize" ? finalize(row, claim, held.client) : new PrismaRetiredUploadLedger(held.client).retireExpiredPreparations(NOW, 1));
    let b: Promise<unknown> | undefined;
    try {
      const pid = await Promise.race([held.entered, a.then(answer => { throw new Error(`holder exited before its real lock: ${answer.ok ? JSON.stringify(answer.value) : String(answer.error)}`); })]);
      if (first === "finalize") {
        b = ledger.retireExpiredPreparations(NOW, 1);
        expect(await b).toBe(0); // Real nonblocking SKIP LOCKED path.
      } else {
        const other = outcome(finalize(row, claim)); b = other;
        await blockedBy(pid); held.release();
        expect(await other).toMatchObject({ ok: false, error: expect.objectContaining({ message: "VIDEO_PREPARATION_CHANGED" }) });
      }
    } finally { held.release(); await Promise.allSettled([a, ...(b ? [b] : [])]); }
    expect((await a).ok).toBe(true);
    expect(await db.mediaUpload.findUnique({ where: { id: row.id } })).toMatchObject({ state: first === "finalize" ? "ADOPTED" : "RETIRED" });
    expect(await db.mediaUploadCleanup.count({ where: { uploadId: row.id } })).toBe(first === "finalize" ? 0 : 1);
  });
  it.each(["purge", "lease"])("composition race: actual purge and due cleanup with %s holding its real prefix", async first => {
    const row = await upload({ retired: true }); await work(row.id);
    await db.user.update({ where: { id: userId }, data: { avatarUploadId: row.id, avatarKey: row.key, deletionScheduledAt: NOW } });
    const foreignId = randomUUID();
    await db.user.create({ data: { id: foreignId, phone: "+99360000901", email: "foreign-race@example.test", emailVerifiedAt: DUE, phoneVerifiedAt: DUE, displayName: "Foreign retained" } });
    await db.user.update({ where: { id: userId }, data: { phone: "+99360000902", email: "purge-race@example.test", emailVerifiedAt: DUE, phoneVerifiedAt: DUE, displayName: "Purge subject" } });
    const foreignListing = await db.listing.create({ data: { sellerId: foreignId, status: "active", brandId: catalog.brandId, modelId: catalog.modelId, cityId: catalog.cityId, priceAmount: 200000 } });
    const snapshot = async () => ({
      user: await db.user.findUniqueOrThrow({ where: { id: userId } }),
      upload: await db.mediaUpload.findUniqueOrThrow({ where: { id: row.id } }),
      cleanup: await db.mediaUploadCleanup.findUniqueOrThrow({ where: { uploadId: row.id } }),
      foreignUser: await db.user.findUniqueOrThrow({ where: { id: foreignId } }),
      foreignListing: await db.listing.findUniqueOrThrow({ where: { id: foreignListing.id } }),
    });
    const before = await snapshot();
    try {
      const held = pause(first === "purge" ? "diagnostic_prepare_source" : "pg_try_advisory_xact_lock");
      const a = outcome<unknown>(first === "purge" ? new PurgeExpiredAccounts(held.client).execute({ now: NOW }) : new PrismaRetiredUploadLedger(held.client).lease(NOW, 1));
      let b: Promise<unknown> | undefined;
      try {
        const pid = await Promise.race([held.entered, a.then(answer => { throw new Error(`holder exited before prefix: ${answer.ok ? JSON.stringify(answer.value) : String(answer.error)}`); })]);
        if (first === "purge") { b = ledger.lease(NOW, 1); expect(await b).toEqual([]); }
        else { b = outcome(new PurgeExpiredAccounts(runtime()).execute({ now: NOW })); await blockedBy(pid); }
      } finally { held.release(); await Promise.allSettled([a, ...(b ? [b] : [])]); }
      expect((await a).ok).toBe(true);
      if (b && first === "lease") {
        const answer = await b as Awaited<ReturnType<typeof outcome>>;
        expect(answer).toMatchObject({ ok: false, error: { code: "P2010", meta: { driverAdapterError: { cause: {
          originalCode: "P0001", originalMessage: "diagnostic_source_graph_changed",
        } } } } });
        expect(await a).toMatchObject({ ok: true, value: [{ uploadId: row.id, attempts: 1 }] });
        const after = await snapshot();
        expect(after).toEqual({ ...before, cleanup: { ...before.cleanup, attempts: 1, nextAttemptAt: new Date("2000-01-02T00:01:00Z") } });
        expect(await db.$queryRaw<{ count: number }[]>`SELECT count(*)::int AS count FROM diagnostic_source_commands`).toEqual([{ count: 0 }]);
        console.info("[897-purge-stale-evidence]", JSON.stringify({ before, after }));
        // A separate actual caller discovers fresh OLD facts. No production retry.
        expect(await new PurgeExpiredAccounts(runtime()).execute({ now: NOW })).toEqual({ purgedCount: 1 });
      }
      expect(await db.user.findUnique({ where: { id: userId } })).toMatchObject({ avatarUploadId: null, avatarKey: null });
      const pending = await db.mediaUploadCleanup.findUniqueOrThrow({ where: { uploadId: row.id } });
      expect(pending).toMatchObject({ status: "PENDING", completedAt: null, objectKeys: row.objectKeys, attempts: first === "lease" ? 1 : 0 });
      const objects = new Set(row.objectKeys);
      const clean = new CleanRetiredUploads(ledger, { deleteAndVerify: async keys => { expect(keys).toEqual(row.objectKeys); for (const key of keys) objects.delete(key); expect(objects.size).toBe(0); } });
      expect(await clean.execute({ now: first === "lease" ? pending.nextAttemptAt : NOW, limit: 1 })).toEqual({ cancelledPreparations: 0, deleted: 1, waiting: 0 });
      expect(await db.mediaUploadCleanup.findUnique({ where: { uploadId: row.id } })).toMatchObject({ status: "DONE", objectKeys: row.objectKeys });
      const final = await snapshot();
      expect(final.foreignUser).toEqual(before.foreignUser);
      expect(final.foreignListing).toEqual(before.foreignListing);
    } finally {
      await guards(false); activation = undefined;
      await db.listing.delete({ where: { id: foreignListing.id } });
      await db.user.delete({ where: { id: foreignId } });
    }
  });
  it.each(["finalize", "recovery"])("composition: actual profile finalization and recovery serialize with %s first", async first => {
    const row = await upload({ target: { type: "profile", id: userId } });
    const claim = await claims();
    if (first === "finalize") {
      expect(await finalize(row, claim)).toBe("adopted");
      expect(await ledger.retireExpiredPreparations(NOW, 1)).toBe(0);
      expect(await db.mediaUpload.findUnique({ where: { id: row.id } })).toMatchObject({ state: "ADOPTED", claimToken: null });
      expect(await db.user.findUnique({ where: { id: userId } })).toMatchObject({ avatarUploadId: row.id, avatarKey: row.key });
      expect(await db.mediaUploadCleanup.findUnique({ where: { uploadId: row.id } })).toBeNull();
    } else {
      expect(await ledger.retireExpiredPreparations(NOW, 1)).toBe(1);
      await expect(finalize(row, claim)).rejects.toMatchObject({ code: "UPLOAD_NOT_AVAILABLE" });
      expect(await db.mediaUpload.findUnique({ where: { id: row.id } })).toMatchObject({ state: "RETIRED" });
      expect(await db.user.findUnique({ where: { id: userId } })).toMatchObject({ avatarUploadId: null, avatarKey: null });
      expect(await db.mediaUploadCleanup.findUnique({ where: { uploadId: row.id } })).toMatchObject({ status: "PENDING", objectKeys: row.objectKeys });
    }
  });
  it.each(["release", "recovery"])("composition: actual publish claim release and recovery preserve retry with %s first", async first => {
    const row = await upload(); const claim = await claims();
    if (first === "release") { await claim.release(row.claimToken ?? "missing"); expect(await ledger.retireExpiredPreparations(NOW, 1)).toBe(0); }
    else { expect(await ledger.retireExpiredPreparations(NOW, 1)).toBe(1); await claim.release(row.claimToken ?? "missing"); }
    expect(await db.mediaUpload.findUnique({ where: { id: row.id } })).toMatchObject({ state: "AVAILABLE", claimToken: null, claimTargetId: null });
    expect(await db.mediaUploadCleanup.findUnique({ where: { uploadId: row.id } })).toBeNull();
    expect(await claim.reserve({ userId, uploadIds: [row.id], target: { type: "listing", id: randomUUID() } })).toMatchObject({ joined: false });
    expect(await db.mediaUpload.findUnique({ where: { id: row.id } })).toMatchObject({ state: "PREPARING" });
  });
  it.each(["purge", "cleanup"])("composition: actual account purge and cleanup preserve terminal photo work with %s first", async first => {
    const row = await upload({ retired: true });
    await db.mediaUpload.update({ where: { id: row.id }, data: { state: "ADOPTED", retiredAt: null, claimTargetType: "profile", claimTargetId: userId } });
    await db.user.update({ where: { id: userId }, data: { avatarUploadId: row.id, avatarKey: row.key, deletionScheduledAt: NOW } });
    const purge = new PurgeExpiredAccounts(runtime());
    const objects = new Set(row.objectKeys);
    const clean = new CleanRetiredUploads(ledger, { deleteAndVerify: async keys => { for (const key of keys) objects.delete(key); } });
    if (first === "cleanup") expect(await clean.execute({ now: NOW, limit: 1 })).toEqual({ cancelledPreparations: 0, deleted: 0, waiting: 0 });
    expect(await purge.execute({ now: NOW })).toEqual({ purgedCount: 1 });
    expect(await db.user.findUnique({ where: { id: userId } })).toMatchObject({ avatarKey: null, avatarUploadId: null, deletionScheduledAt: null });
    expect(await clean.execute({ now: NOW, limit: 1 })).toEqual({ cancelledPreparations: 0, deleted: 1, waiting: 0 });
    expect(objects.size).toBe(0);
    expect(await db.mediaUploadCleanup.findUnique({ where: { uploadId: row.id } })).toMatchObject({ status: "DONE", objectKeys: row.objectKeys });
    expect(await db.mediaUpload.findUnique({ where: { id: row.id } })).toMatchObject({ state: "DELETED" });
  });
  it.each(["video", "image"])("composition: actual video and image cleanup keep separate inventories with %s first", async first => {
    const image = await upload({ retired: true }); await work(image.id);
    const id = randomUUID(), uploadId = randomUUID(); generations.push(id); uploads.push(uploadId);
    const sourceKey = `video/v1/${uploadId}/${id}/source.mp4`, posterKey = `video/v1/${uploadId}/${id}/poster.jpg`;
    await db.mediaUpload.create({ data: { id: uploadId, userId, key: sourceKey, kind: "video", contentType: "video/mp4", sizeBytes: 1000, writeProtocol: "video-v1", objectKeys: [sourceKey], state: "RETIRED", retiredAt: DUE } });
    await db.videoGeneration.create({ data: { id, uploadId, listingId: randomUUID(), state: "RETIRED", retiredAt: DUE } });
    await db.videoCleanupWork.create({ data: { id: `session:${id}`, uploadId, sessionId: id, generationId: id, sourceKey, objectKeys: [posterKey], nextAttemptAt: DUE } });
    const video = new PrismaVideoCleanupLedger(runtime());
    let lease: Awaited<ReturnType<PrismaVideoCleanupLedger["claim"]>>;
    if (first === "video") { lease = await video.claim(NOW, randomUUID()); expect(await ledger.lease(NOW, 1)).toMatchObject([{ uploadId: image.id }]); }
    else { expect(await ledger.lease(NOW, 1)).toMatchObject([{ uploadId: image.id }]); lease = await video.claim(NOW, randomUUID()); }
    expect(lease).toMatchObject({ uploadId, objectKeys: [posterKey] });
    if (!lease) throw new Error("expected real video cleanup lease");
    await video.recordAbsence(lease, NOW); await ledger.complete(image.id, NOW);
    expect(await db.videoCleanupWork.findUnique({ where: { id: `session:${id}` } })).toMatchObject({ state: "VERIFYING", objectKeys: [posterKey] });
    expect(await db.mediaUpload.findUnique({ where: { id: uploadId } })).toMatchObject({ state: "RETIRED", key: sourceKey });
    expect(await db.mediaUpload.findUnique({ where: { id: image.id } })).toMatchObject({ state: "DELETED" });
  });

  it("releases a stranded publish and atomically retires attach/profile preparations", async () => {
    const target = await listing();
    const publish = await upload();
    const attach = await upload({ target: { type: "listing", id: target.id } });
    const profile = await upload({ target: { type: "profile", id: userId } });
    expect(await ledger.retireExpiredPreparations(NOW, 10)).toBe(3);
    expect(await db.mediaUpload.findUnique({ where: { id: publish.id } })).toMatchObject({ state: "AVAILABLE", claimToken: null, claimTargetType: null, claimTargetId: null });
    expect(await db.mediaUploadCleanup.findUnique({ where: { uploadId: publish.id } })).toBeNull();
    for (const row of [attach, profile]) {
      expect(await db.mediaUpload.findUnique({ where: { id: row.id } })).toMatchObject({ state: "RETIRED", claimToken: null, claimDeadline: null });
      expect(await db.mediaUploadCleanup.findUnique({ where: { uploadId: row.id } })).toMatchObject({ status: "PENDING", key: row.key, objectKeys: row.objectKeys, nextAttemptAt: DUE });
    }
  });
  it("preserves legacy policy and refuses video and preparations not yet due", async () => {
    const target = await listing();
    const legacy = await upload({ protocol: "legacy", target: { type: "listing", id: target.id } });
    const video = await upload({ protocol: "video-v1" });
    const future = await upload({ deadline: new Date("2000-01-03T00:00:00Z") });
    expect(await ledger.retireExpiredPreparations(NOW, 10)).toBe(1);
    expect(await db.mediaUploadCleanup.findUnique({ where: { uploadId: legacy.id } })).toMatchObject({ status: "LEGACY_PENDING" });
    for (const row of [video, future]) expect(await db.mediaUpload.findUnique({ where: { id: row.id } })).toMatchObject({ state: "PREPARING", claimToken: row.claimToken });
  });
  it.each(["upload", "key", "poster", "avatarUpload", "avatarKey"])("refuses recovery while live %s references remain", async kind => {
    const row = await upload();
    if (kind.startsWith("avatar")) await db.user.update({ where: { id: userId }, data: kind === "avatarUpload" ? { avatarUploadId: row.id } : { avatarKey: row.key } });
    else {
      const target = await listing();
      await db.listingMedia.create({ data: { listingId: target.id, kind: "image", key: kind === "key" ? row.key : `other/${randomUUID()}`, posterKey: kind === "poster" ? row.key : null, uploadId: kind === "upload" ? row.id : null, sortOrder: 0 } });
    }
    expect(await ledger.retireExpiredPreparations(NOW, 10)).toBe(0);
    expect(await db.mediaUpload.findUnique({ where: { id: row.id } })).toMatchObject({ state: "PREPARING", claimToken: row.claimToken });
    expect(await db.mediaUploadCleanup.findUnique({ where: { uploadId: row.id } })).toBeNull();
  });
  it.each(["upload", "key", "poster", "avatarUpload", "avatarKey"])("refuses completion while a live %s reference remains", async kind => {
    const row = await upload({ retired: true }); await work(row.id);
    if (kind.startsWith("avatar")) await db.user.update({ where: { id: userId }, data: kind === "avatarUpload" ? { avatarUploadId: row.id } : { avatarKey: row.key } });
    else {
      const target = await listing();
      await db.listingMedia.create({ data: { listingId: target.id, kind: "image", key: kind === "key" ? row.key : `other/${randomUUID()}`, posterKey: kind === "poster" ? row.key : null, uploadId: kind === "upload" ? row.id : null, sortOrder: 0 } });
    }
    await expect(ledger.complete(row.id, NOW)).rejects.toThrow("retired_upload_live_reference");
    expect(await db.mediaUpload.findUnique({ where: { id: row.id } })).toMatchObject({ state: "RETIRED" });
    expect(await db.mediaUploadCleanup.findUnique({ where: { uploadId: row.id } })).toMatchObject({ status: "PENDING", completedAt: null });
  });
  it("leases due work once across overlapping workers and persists bounded backoff", async () => {
    const rows = await Promise.all([upload({ retired: true }), upload({ retired: true }), upload({ retired: true })]);
    for (const row of rows) await work(row.id);
    const answers = await Promise.allSettled([ledger.lease(NOW, 2), new PrismaRetiredUploadLedger(runtime()).lease(NOW, 2)]);
    for (const answer of answers) if (answer.status === "rejected") expect(String(answer.reason)).toContain("retired_upload_scope_changed");
    const ids = answers.flatMap(answer => answer.status === "fulfilled" ? answer.value : []).map(r => r.uploadId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeGreaterThan(0); expect(ids.length).toBeLessThanOrEqual(3);
    const rest = await ledger.lease(NOW, 3);
    expect(new Set([...ids, ...rest.map(r => r.uploadId)]).size).toBe(3);
    for (const row of rows) expect(await db.mediaUploadCleanup.findUnique({ where: { uploadId: row.id } })).toMatchObject({ attempts: 1, status: "PENDING", nextAttemptAt: new Date("2000-01-02T00:01:00Z") });
  });
  it("skips a cleanup row held by another worker without losing work", async () => {
    const row = await upload({ retired: true }); await work(row.id);
    let release = () => {}; let ready = () => {};
    const held = new Promise<void>(resolve => { ready = resolve; });
    const gate = new Promise<void>(resolve => { release = resolve; });
    const owner = runtime().$transaction(tx => withCampaignPreparation(tx, [{ table: "media_upload_cleanups", key: { uploadId: row.id }, verb: "update", next: {} }], async () => {
      await tx.$queryRaw`SELECT 1 FROM media_upload_cleanups WHERE "uploadId"=${row.id} FOR UPDATE`;
      ready(); await gate;
    }));
    try {
      await Promise.race([held, owner.then(() => { throw new Error("Lock owner ended before barrier"); })]);
      expect(await ledger.lease(NOW, 1)).toEqual([]);
      expect(await db.mediaUploadCleanup.findUnique({ where: { uploadId: row.id } })).toMatchObject({ attempts: 0, nextAttemptAt: DUE });
    } finally { release(); await owner; }
    expect(await ledger.lease(NOW, 1)).toMatchObject([{ uploadId: row.id, attempts: 1 }]);
  });
  it("leases an unlocked selected root while another cleanup row is held", async () => {
    const heldRow = await upload({ retired: true }); await work(heldRow.id);
    const freeRow = await upload({ retired: true }); await work(freeRow.id);
    let release = () => {}; let ready = () => {};
    const held = new Promise<void>(resolve => { ready = resolve; });
    const gate = new Promise<void>(resolve => { release = resolve; });
    const owner = runtime().$transaction(tx => withCampaignPreparation(tx, [{ table: "media_upload_cleanups", key: { uploadId: heldRow.id }, verb: "update", next: {} }], async () => {
      await tx.$queryRaw`SELECT 1 FROM media_upload_cleanups WHERE "uploadId"=${heldRow.id} FOR UPDATE`;
      ready(); await gate;
    }));
    try {
      await Promise.race([held, owner.then(() => { throw new Error("Lock owner ended before barrier"); })]);
      expect(await ledger.lease(NOW, 2)).toMatchObject([{ uploadId: freeRow.id, attempts: 1 }]);
      expect(await db.mediaUploadCleanup.findUnique({ where: { uploadId: heldRow.id } })).toMatchObject({ attempts: 0, nextAttemptAt: DUE });
    } finally { release(); await owner; }
    expect(await ledger.lease(NOW, 2)).toMatchObject([{ uploadId: heldRow.id, attempts: 1 }]);
  });
  it("rolls back retirement and cleanup when the transaction cannot commit", async () => {
    const row = await upload({ target: { type: "profile", id: userId } });
    const rollback = new Proxy(runtime(), { get(target, property) {
      if (property === "$transaction") return (run: (tx: Prisma.TransactionClient) => Promise<unknown>) => target.$transaction(async tx => { await run(tx); throw new Error("test_commit_refusal"); });
      const value: unknown = Reflect.get(target, property); return typeof value === "function" ? value.bind(target) : value;
    } });
    await expect(new PrismaRetiredUploadLedger(rollback).retireExpiredPreparations(NOW, 1)).rejects.toThrow("test_commit_refusal");
    expect(await db.mediaUpload.findUnique({ where: { id: row.id } })).toMatchObject({ state: "PREPARING", claimToken: row.claimToken });
    expect(await db.mediaUploadCleanup.findUnique({ where: { uploadId: row.id } })).toBeNull();
  });
  it("rolls back completion and retains durable retry after storage or commit failure", async () => {
    const row = await upload({ retired: true }); await work(row.id);
    const rollback = new Proxy(runtime(), { get(target, property) {
      if (property === "$transaction") return (run: (tx: Prisma.TransactionClient) => Promise<unknown>) => target.$transaction(async tx => { await run(tx); throw new Error("test_commit_refusal"); });
      const value: unknown = Reflect.get(target, property); return typeof value === "function" ? value.bind(target) : value;
    } });
    await expect(new PrismaRetiredUploadLedger(rollback).complete(row.id, NOW)).rejects.toThrow("test_commit_refusal");
    expect(await db.mediaUpload.findUnique({ where: { id: row.id } })).toMatchObject({ state: "RETIRED" });
    expect(await db.mediaUploadCleanup.findUnique({ where: { uploadId: row.id } })).toMatchObject({ status: "PENDING", completedAt: null });
    const failed = new CleanRetiredUploads(ledger, { deleteAndVerify: async () => { throw new Error("storage unavailable"); } });
    expect(await failed.execute({ now: NOW, limit: 1 })).toEqual({ cancelledPreparations: 0, deleted: 0, waiting: 1 });
    const retry = await db.mediaUploadCleanup.findUniqueOrThrow({ where: { uploadId: row.id } });
    expect(retry).toMatchObject({ status: "PENDING", attempts: 1, lastError: "storage unavailable", completedAt: null });
    const objects = new Set(row.objectKeys);
    const success = new CleanRetiredUploads(ledger, { deleteAndVerify: async keys => { for (const key of keys) objects.delete(key); expect(objects.size).toBe(0); } });
    expect(await success.execute({ now: retry.nextAttemptAt, limit: 1 })).toEqual({ cancelledPreparations: 0, deleted: 1, waiting: 0 });
    expect(await db.mediaUpload.findUnique({ where: { id: row.id } })).toMatchObject({ state: "DELETED" });
    expect(await db.mediaUploadCleanup.findUnique({ where: { uploadId: row.id } })).toMatchObject({ status: "DONE", attempts: 2, lastError: null });
  });
  it("refuses stale post-wait cleanup selection without changing lease or adopting a new row", async () => {
    const row = await upload({ retired: true }); await work(row.id);
    let release = () => {}; let prepared = () => {};
    const ready = new Promise<void>(resolve => { prepared = resolve; });
    const gate = new Promise<void>(resolve => { release = resolve; });
    const delayed = new Proxy(runtime(), { get(target, property) {
      if (property === "$transaction") return (run: (tx: Prisma.TransactionClient) => Promise<unknown>, options?: Parameters<PrismaService["$transaction"]>[1]) => target.$transaction(tx => run(new Proxy(tx, { get(transaction, key) {
        if (key === "$queryRaw") return async (first: TemplateStringsArray, ...values: unknown[]) => {
          const result = await transaction.$queryRaw(first, ...values);
          if (Array.isArray(first) && first.join("").includes("public.campaign_prepare(")) { prepared(); await gate; }
          return result;
        };
        const value: unknown = Reflect.get(transaction, key); return typeof value === "function" ? value.bind(transaction) : value;
      } })), options);
      const value: unknown = Reflect.get(target, property); return typeof value === "function" ? value.bind(target) : value;
    } });
    const pending = new PrismaRetiredUploadLedger(delayed).lease(NOW, 1);
    // Attach a rejection handler immediately and drain on every exit.
    const settled = pending.then(value => ({ value }), error => ({ error: error as unknown }));
    try {
      await Promise.race([ready, pending.then(() => { throw new Error("Lease ended before preparation barrier"); })]);
      await ledger.recordFailure(row.id, "concurrent storage failure");
    } finally { release(); await settled; }
    const answer = await settled;
    expect("error" in answer ? String(answer.error) : answer.value).toContain("retired_upload_scope_changed");
    expect(await db.mediaUploadCleanup.findUnique({ where: { uploadId: row.id } })).toMatchObject({ attempts: 0, status: "PENDING", nextAttemptAt: DUE, lastError: "concurrent storage failure" });
  });
  it("completes durable cleanup after physical upload deletion", async () => {
    const row = await upload({ retired: true }); await work(row.id);
    await db.mediaUpload.delete({ where: { id: row.id } });
    await ledger.complete(row.id, NOW);
    expect(await db.mediaUploadCleanup.findUnique({ where: { uploadId: row.id } })).toMatchObject({ status: "DONE", completedAt: NOW });
  });
});
