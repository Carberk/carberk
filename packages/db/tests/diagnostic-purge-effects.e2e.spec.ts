import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

import { PrismaPg } from "@prisma/adapter-pg";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool, type PoolClient } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { PrismaClient } from "../generated/prisma/client/client";
import { withDiagnosticSourceCommand, type DiagnosticSourceCommand, type DiagnosticSourceTuple, type Prisma } from "../src/index";

type Tx = Prisma.TransactionClient;
type OwnerWrites = (tx: Tx, userId: string, now: Date) => Promise<unknown>[];
function present<T>(value: T | undefined | null): T {
  if (value == null) throw new Error("missing persisted SQL fixture");
  return value;
}
function signal() {
  let release: () => void = () => { throw new Error("uninitialized barrier"); };
  const promise = new Promise<void>(resolve => { release = resolve; });
  return { promise, release };
}
const root = fileURLToPath(new URL("..", import.meta.url));
const cutoff = new Date("1980-01-02T00:00:00Z");

/** Authored only. Every positive uses the exported entry and a real interactive
 * Prisma transaction. Existing owner helpers execute their actual SQL; neither
 * effects nor query/permission/readback results are mocked. No grants are seeded. */
describe("finite account purge effects on migrated PostgreSQL", () => {
  let container: StartedPostgreSqlContainer, pool: Pool, prisma: PrismaClient;
  let diagnostic: OwnerWrites, service: OwnerWrites, video: OwnerWrites;
  let uid: string, foreign: string, session: string, ownConversation: string, foreignConversation: string;
  let attachment: string, ownAttachment: string, foreignMessage: string, ownMessage: string;
  let ownOrder: string, foreignOrder: string, ownRaw: string, foreignRaw: string;
  let upload: string, generation: string, draft: string, accountPrincipal: string, guestPrincipal: string, linked: string, retained: string;
  const clients: PoolClient[] = [];
  async function guards(enabled: boolean) {
    const rows = await pool.query<{ table: string; name: string }>(`SELECT c.relname AS table,t.tgname AS name FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
      WHERE t.tgname LIKE 'zz_diagnostic_source_%' OR t.tgname LIKE 'zzzz_campaign_preparation%' OR t.tgname='diagnostic_source_no_truncate'`);
    for (const r of rows.rows) await pool.query(`ALTER TABLE public."${r.table}" ${enabled ? "ENABLE" : "DISABLE"} TRIGGER "${r.name}"`);
  }
  async function command(tx: Tx): Promise<DiagnosticSourceCommand> {
    const [row] = await tx.$queryRaw<{ source: DiagnosticSourceTuple }[]>`SELECT diagnostic_source_project(to_jsonb(u),diagnostic_source_meta('users')->'fields') AS source FROM users u WHERE id=${uid}`;
    const source = present(row).source;
    return { operation: "account_purge", roots: [{ table: "users", key: { id: uid } }], rows: [{ table: "users", key: { id: uid }, verb: "update", expected: { source },
      next: { ...source, phone: null, phoneVerifiedAt: null, email: null, emailVerifiedAt: null, displayName: null, avatarKey: null, avatarUploadId: null, avatarUrl: null, deletionScheduledAt: null } }], actorUserId: null, sessionId: null, cutoff, campaign: null };
  }
  async function ownerPurge(tx: Tx, omitForeignAttribution = false) {
    await tx.$queryRaw`SELECT diagnostic_dispose_ownership(${uid}::text,${cutoff}::timestamp)`;
    // These are the actual production helpers, not a test interpreter of effects.
    for (const write of service(tx, uid, cutoff)) await write;
    for (const write of video(tx, uid, cutoff)) await write;
    for (const write of diagnostic(tx, uid, cutoff)) await write;
    if (omitForeignAttribution) await tx.$executeRaw`UPDATE service_messages SET "senderId"=${uid} WHERE id=${foreignMessage}`;
    // Measurement's existing deletion policy invalidates exports and cascades only
    // account/linked-current-visit payloads. The unrelated guest principal survives.
    await tx.measurementInvestigationExport.deleteMany();
    await tx.measurementPrincipal.deleteMany({ where: { userId: uid } });
    // Exact existing avatar retirement/cleanup intent, including DO NOTHING replay.
    await tx.$executeRaw`WITH retired AS (
      UPDATE media_uploads SET state='RETIRED', "retiredAt"=${cutoff}::timestamp,"claimToken"=NULL,"claimDeadline"=NULL
      WHERE id=(SELECT "avatarUploadId" FROM users WHERE id=${uid}) AND state NOT IN ('RETIRED','DELETED')
      RETURNING id,key,"objectKeys","writeProtocol")
     INSERT INTO media_upload_cleanups("uploadId",key,"objectKeys","writeProtocol",status,"nextAttemptAt")
     SELECT id,key,"objectKeys","writeProtocol",CASE WHEN "writeProtocol"='conditional-v1' THEN 'PENDING' ELSE 'LEGACY_PENDING' END,${cutoff}::timestamp FROM retired
     ON CONFLICT ("uploadId") DO NOTHING`;
    await tx.user.update({ where: { id: uid }, data: { phone: null, phoneVerifiedAt: null, email: null, emailVerifiedAt: null, displayName: null,
      avatarKey: null, avatarUploadId: null, avatarUrl: null, deletionScheduledAt: null } });
    await tx.session.deleteMany({ where: { userId: uid } });
    await tx.totpEnrollment.deleteMany({ where: { userId: uid } });
    await tx.fcmDevice.deleteMany({ where: { userId: uid } });
    await tx.notificationHistory.deleteMany({ where: { userId: uid } });
    await tx.notificationPreference.deleteMany({ where: { userId: uid } });
    await tx.savedSearch.deleteMany({ where: { userId: uid } });
    await tx.favorite.deleteMany({ where: { userId: uid } });
    await tx.ownedVehicle.deleteMany({ where: { userId: uid } });
    await tx.blockedUser.deleteMany({ where: { OR: [{ blockerId: uid }, { blockedId: uid }] } });
    await tx.dealershipMember.deleteMany({ where: { userId: uid } });
    await tx.listingDraft.deleteMany({ where: { userId: uid, businessId: null } });
    await tx.verifiedContactPhone.deleteMany({ where: { sellerId: uid } });
    await tx.otpRequest.deleteMany({ where: { userId: uid } });
    await tx.listing.updateMany({ where: { sellerId: uid, businessId: null }, data: { contactPhone: null } });
  }
  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:17-alpine").start();
    const url = container.getConnectionUri();
    execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], { cwd: root, env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
    pool = new Pool({ connectionString: url }); prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
    // Dynamic imports keep the DB package's compilation boundary intact while
    // hosted Vitest loads the actual worker sources through its TS transform.
    const load = async (path: string): Promise<Record<string, OwnerWrites>> => import(/* @vite-ignore */ fileURLToPath(new URL(path, import.meta.url))) as Promise<Record<string, OwnerWrites>>;
    diagnostic = present((await load("../../../apps/worker/src/jobs/diagnosticAccountErasure.ts"))["diagnosticAccountErasureWrites"]);
    service = present((await load("../../../apps/worker/src/jobs/serviceAccountErasure.ts"))["serviceAccountErasureWrites"]);
    video = present((await load("../../../apps/worker/src/jobs/video/videoAccountErasure.ts"))["videoAccountErasureWrites"]);
  });
  beforeEach(async () => {
    // Fixture construction precedes activation; no anchors/grants/proofs or
    // authority are manufactured, and all deliberate attacks below stay naked.
    await guards(false);
    uid = randomUUID(); foreign = randomUUID(); session = randomUUID();
    for (const id of [uid, foreign]) await prisma.user.create({ data: { id, email: `${id}@purge-effects.invalid`, displayName: "retained owner", deletionScheduledAt: id === uid ? new Date("1980-01-01Z") : null } });
    await prisma.session.create({ data: { id: session, userId: uid, refreshTokenHash: session, expiresAt: new Date("2030-01-01Z") } });
    ownConversation = randomUUID(); foreignConversation = randomUUID();
    for (const [id, customerId] of [[ownConversation, uid], [foreignConversation, foreign]] as const) {
      const support = await prisma.supportCase.create({ data: { customerId } });
      await prisma.serviceConversation.create({ data: { id, purpose: "support", supportCaseId: support.id } });
    }
    ownMessage = randomUUID(); foreignMessage = randomUUID();
    for (const [id, conversationId] of [[ownMessage, ownConversation], [foreignMessage, foreignConversation]] as const) {
      await prisma.serviceMessage.create({ data: { id, conversationId, sequence: 1, clientMessageId: id, senderId: uid, senderKind: "staff", body: "retained body", requestHash: id } });
    }
    attachment = randomUUID(); ownAttachment = randomUUID();
    for (const [id, conversationId] of [[attachment, foreignConversation], [ownAttachment, ownConversation]] as const) {
      await prisma.serviceAttachment.create({ data: { id, conversationId, uploaderId: uid, lifecycleEpoch: 0, category: "support", visibility: "customer", state: "ready",
        stagingKey: `staging/${id}`, objectKey: `private/${id}`, contentType: "image/jpeg", expectedBytes: 1, filename: "retained", rights: {}, expiresAt: new Date("2030-01-01Z") } });
    }
    draft = randomUUID(); upload = randomUUID(); generation = randomUUID();
    await prisma.listingDraft.create({ data: { id: draft, userId: uid, payload: {} } });
    const sourceKey = `video/v1/${upload}/${generation}/source.mp4`, posterKey = `video/v1/${upload}/${generation}/poster.jpg`;
    await prisma.mediaUpload.create({ data: { id: upload, userId: uid, key: sourceKey, kind: "video", contentType: "video/mp4", sizeBytes: 1000, writeProtocol: "video-v1", objectKeys: [sourceKey], state: "PREPARING" } });
    await prisma.videoUploadSession.create({ data: { id: generation, uploadId: upload, userId: uid, protocolVersion: 1, targetKind: "draft", targetId: draft, targetRevision: 1, state: "PROCESSING", sourceKey, expiresAt: new Date("1980-01-09Z") } });
    await prisma.videoGeneration.create({ data: { id: generation, sessionId: generation, uploadId: upload, listingId: draft, state: "PROCESSING", manifest: { assets: [{ key: posterKey }] } } });
    await prisma.videoProcessWork.create({ data: { generationId: generation, sessionId: generation, uploadId: upload, completionFence: randomUUID(), targetRevision: 1, processingVersion: "ffmpeg-debian-5.1.9-v1", state: "PROCESSING", leaseToken: randomUUID(), leaseExpiresAt: new Date("1980-01-02T00:20Z") } });
    accountPrincipal = randomUUID(); guestPrincipal = randomUUID(); linked = randomUUID(); retained = randomUUID();
    await prisma.measurementState.upsert({ where: { key: "collector" }, create: { key: "collector", epoch: "purge-effects" }, update: {} });
    for (const [id, userId] of [[accountPrincipal, uid], [guestPrincipal, null]] as const) await prisma.measurementPrincipal.create({ data: { id, userId, kind: userId ? "account" : "guest", pseudonym: id, generation: id, epoch: "purge-effects" } });
    for (const [id, linkedAccountId] of [[linked, accountPrincipal], [retained, null]] as const) await prisma.measurementVisit.create({ data: { id, principalId: guestPrincipal, linkedAccountId, startedAt: cutoff, foregroundAt: cutoff } });
    for (const visitId of [linked, retained]) await prisma.measurementRecord.create({ data: { id: randomUUID(), principalId: guestPrincipal, visitId, event: {}, origin: "client", environment: "test", population: "synthetic", conversionEligible: false, occurredAt: cutoff, receivedAt: cutoff, expiresAt: new Date("2030-01-01Z") } });
    const center = await prisma.diagnosticCenter.create({ data: { code: randomUUID(), names: {} } });
    const template = await prisma.diagnosticTemplateVersion.create({ data: { centerId: center.id, version: 1, definition: {} } });
    ownOrder = randomUUID(); foreignOrder = randomUUID(); ownRaw = randomUUID(); foreignRaw = randomUUID();
    const observation = { vin: "AAA", method: "vin", mileageKm: 10, observedAt: "1980-01-01T00:00:00Z" };
    for (const [id, commissionerId, rawId] of [[ownOrder, uid, ownRaw], [foreignOrder, foreign, foreignRaw]] as const) {
      await prisma.inspectionOrder.create({ data: { id, commissionerId, centerId: center.id, templateVersionId: template.id, requestKey: id, audience: "buyer_private", observedVehicle: observation } });
      await prisma.diagnosticIdentityRecord.create({ data: { id: rawId, orderId: id, orderVersion: 0, observation, observationHash: "a".repeat(64), recordedById: uid, recordedAt: cutoff } });
    }
    await guards(true);
  });
  afterEach(async () => { for (const c of clients.splice(0)) { await c.query("ROLLBACK"); c.release(); } await guards(false); });
  afterAll(async () => { await prisma?.$disconnect(); await pool?.end(); await container?.stop(); });

  it("commits the covered service/video/measurement union while retaining foreign bodies, bytes and unlinked guest history", async () => {
    await prisma.$transaction(async tx => withDiagnosticSourceCommand(tx, await command(tx), async () => ownerPurge(tx)));
    expect(await prisma.inspectionOrder.findUniqueOrThrow({ where: { id: ownOrder } })).toMatchObject({ commissionerId: null, observedVehicle: null, erasedAt: cutoff });
    expect(await prisma.diagnosticIdentityRecord.findUniqueOrThrow({ where: { id: ownRaw } })).toMatchObject({ observation: null, recordedById: null, erasedAt: cutoff });
    expect(await prisma.diagnosticIdentityRecord.findUniqueOrThrow({ where: { id: foreignRaw } })).toMatchObject({ observationHash: "a".repeat(64), recordedById: null, erasedAt: null });
    expect(await prisma.inspectionOrder.findUniqueOrThrow({ where: { id: foreignOrder } })).toMatchObject({ commissionerId: foreign, erasedAt: null });
    expect(await prisma.diagnosticSourceAnchor.findUnique({ where: { orderId: ownOrder } })).toBeNull();
    expect(await prisma.user.findUniqueOrThrow({ where: { id: uid } })).toMatchObject({ email: null, displayName: null, deletionScheduledAt: null });
    expect(await prisma.serviceMessage.findUnique({ where: { id: ownMessage } })).toBeNull();
    expect(await prisma.serviceMessage.findUniqueOrThrow({ where: { id: foreignMessage } })).toMatchObject({ senderId: null, body: "retained body" });
    expect(await prisma.serviceAttachment.findUniqueOrThrow({ where: { id: attachment } })).toMatchObject({ uploaderId: null, objectKey: `private/${attachment}`, state: "ready" });
    expect(await prisma.serviceErasureFence.findUniqueOrThrow({ where: { conversationId: ownConversation } })).toMatchObject({ epoch: 1, objectKeys: [`private/${ownAttachment}`] });
    expect(await prisma.serviceConversation.findUniqueOrThrow({ where: { id: foreignConversation } })).toMatchObject({ erasedAt: null, lifecycleEpoch: 0 });
    expect(await prisma.videoCleanupWork.findUniqueOrThrow({ where: { id: `session:${generation}` } })).toMatchObject({ objectKeys: [`video/v1/${upload}/${generation}/poster.jpg`], nextAttemptAt: new Date("1980-01-02T00:22Z") });
    expect(await prisma.videoProcessWork.findUniqueOrThrow({ where: { generationId: generation } })).toMatchObject({ state: "CANCELLED", leaseExpiresAt: new Date("1980-01-02T00:20Z") });
    expect(await prisma.measurementVisit.findUnique({ where: { id: linked } })).toBeNull();
    expect(await prisma.measurementVisit.findUniqueOrThrow({ where: { id: retained } })).toMatchObject({ principalId: guestPrincipal });
    expect(await prisma.measurementRecord.count({ where: { visitId: linked } })).toBe(0);
    expect(await prisma.measurementRecord.count({ where: { visitId: retained } })).toBe(1);
  });
  it.each(["finish", "delete"] as const)("%s refuses a missing effect and rolls back the User/Session writes", async mode => {
    await expect(prisma.$transaction(async tx => withDiagnosticSourceCommand(tx, await command(tx), async receipt => {
      await tx.user.update({ where: { id: uid }, data: { email: null, displayName: null, deletionScheduledAt: null } });
      await tx.session.deleteMany({ where: { userId: uid } });
      if (mode === "delete") await tx.$executeRaw`DELETE FROM diagnostic_source_commands WHERE id=${receipt.receiptId}::uuid`;
    }))).rejects.toThrow("diagnostic_source_final_effect");
    expect(await prisma.session.findUnique({ where: { id: session } })).not.toBeNull();
    expect(await prisma.user.findUniqueOrThrow({ where: { id: uid } })).toMatchObject({ displayName: "retained owner" });
  });
  it("direct receipt INSERT replaces forged effects and direct DELETE accepts the same real completed union", async () => {
    await prisma.$transaction(async tx => {
      const c = await command(tx);
      const [receipt] = await tx.$queryRaw<{ id: string; effects: unknown[] }[]>`INSERT INTO diagnostic_source_commands(id,backend_pid,full_transaction_id,command,effects) VALUES(${randomUUID()}::uuid,0,'forged',${JSON.stringify(c)}::jsonb,'[]') RETURNING id,effects`;
      expect(present(receipt).effects.length).toBeGreaterThan(10);
      await ownerPurge(tx);
      await tx.$executeRaw`DELETE FROM diagnostic_source_commands WHERE id=${present(receipt).id}::uuid`;
    });
    expect(await prisma.serviceMessage.findUniqueOrThrow({ where: { id: foreignMessage } })).toMatchObject({ senderId: null });
  });
  it("caller-declared foreign effects and forged derived state refuse without changing foreign content", async () => {
    await expect(prisma.$transaction(async tx => {
      const c = await command(tx);
      return withDiagnosticSourceCommand(tx, { ...c, rows: [...c.rows, { table: "service_messages", key: { id: foreignMessage }, verb: "delete", expected: { source: {} }, next: null }] }, async () => undefined);
    })).rejects.toThrow(/diagnostic_source_(row|expected_fields|purge_intent)/);
    await expect(prisma.$transaction(async tx => withDiagnosticSourceCommand(tx, await command(tx), async () => {
      await tx.$executeRaw`UPDATE diagnostic_source_commands SET effects='[]'`;
    }))).rejects.toThrow("diagnostic_source_immutable");
    expect(await prisma.serviceMessage.findUniqueOrThrow({ where: { id: foreignMessage } })).toMatchObject({ senderId: uid, body: "retained body" });
  });
  it("a forged final attribution and unselected foreign deletion refuse", async () => {
    await expect(prisma.$transaction(async tx => withDiagnosticSourceCommand(tx, await command(tx), async () => {
      await tx.serviceMessage.update({ where: { id: foreignMessage }, data: { body: "forged" } });
    }))).rejects.toThrow("diagnostic_source_effect_mismatch");
    await expect(prisma.$transaction(async tx => withDiagnosticSourceCommand(tx, await command(tx), async () => {
      await tx.serviceConversation.delete({ where: { id: foreignConversation } });
    }))).rejects.toThrow("diagnostic_source_uncovered_effect");
  });
  it("refuses malformed video inventory before any erasure or cleanup intent", async () => {
    await prisma.videoUploadSession.update({ where: { id: generation }, data: { sourceKey: "foreign/source.mp4" } });
    await expect(prisma.$transaction(async tx => withDiagnosticSourceCommand(tx, await command(tx), async () => ownerPurge(tx)))).rejects.toThrow("diagnostic_source_purge_video_inventory");
    expect(await prisma.videoCleanupWork.findUnique({ where: { id: `session:${generation}` } })).toBeNull();
    expect(await prisma.user.findUniqueOrThrow({ where: { id: uid } })).toMatchObject({ displayName: "retained owner" });
  });
  it.each(["purge-first", "collector-first"] as const)("%s uses a real collector barrier, with the source prefix before measurement", async order => {
    const a = await pool.connect(), b = await pool.connect(); clients.push(a, b);
    const pidA = present((await a.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")).rows[0]).pid;
    const pidB = present((await b.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")).rows[0]).pid;
    const c = await prisma.$transaction(tx => command(tx));
    await a.query("BEGIN"); await b.query("BEGIN");
    const prepared = signal();
    const first = order === "collector-first" ? b.query("SELECT * FROM measurement_state WHERE key='collector' FOR UPDATE") : a.query("SELECT diagnostic_prepare_source($1::jsonb)", [JSON.stringify(c)]);
    await first;
    const waiting = order === "collector-first" ? a.query("SELECT diagnostic_prepare_source($1::jsonb)", [JSON.stringify(c)]) : b.query("SELECT * FROM measurement_state WHERE key='collector' FOR UPDATE");
    const observed = (async () => {
      const end = Date.now() + 5000;
      while (Date.now() < end) {
        const [waiter, blocker] = order === "collector-first" ? [pidA, pidB] : [pidB, pidA];
        if ((await pool.query<{ blocked: boolean }>("SELECT $2::int=ANY(pg_blocking_pids($1::int)) AS blocked", [waiter, blocker])).rows[0]?.blocked) { prepared.release(); return; }
        await new Promise(resolve => setTimeout(resolve, 5));
      }
      throw new Error("real PostgreSQL collector barrier not reached within 5s");
    })();
    await Promise.all([prepared.promise, observed]);
    await (order === "collector-first" ? b : a).query("ROLLBACK");
    await waiting;
    await (order === "collector-first" ? a : b).query("ROLLBACK");
    expect(await prisma.measurementVisit.findUnique({ where: { id: linked } })).not.toBeNull();
  });
  it.each(["purge-first", "restore-first"] as const)("%s rechecks the due User after the opposing transaction commits", async order => {
    const entered = signal(), release = signal(), secondEntered = signal();
    let firstPid = 0, secondPid = 0;
    async function restore(tx: Tx): Promise<DiagnosticSourceCommand> {
      const c = await command(tx), row = present(c.rows[0]);
      if (row.expected === "absent") throw new Error("expected persisted User");
      return { ...c, operation: "account_restore", cutoff: null, rows: [{ table: "users", key: { id: uid }, verb: "update",
        expected: row.expected, next: { ...row.expected.source, deletionScheduledAt: null } }] };
    }
    const first = prisma.$transaction(async tx => {
      firstPid = present((await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`)[0]).pid;
      const c = order === "purge-first" ? await command(tx) : await restore(tx);
      await withDiagnosticSourceCommand(tx, c, async () => {
        entered.release(); await release.promise;
        if (order === "purge-first") await ownerPurge(tx);
        else await tx.user.update({ where: { id: uid }, data: { deletionScheduledAt: null } });
      });
    });
    await entered.promise;
    const second = prisma.$transaction(async tx => {
      secondPid = present((await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`)[0]).pid;
      const c = order === "purge-first" ? await restore(tx) : await command(tx);
      secondEntered.release();
      await withDiagnosticSourceCommand(tx, c, async () => {
        throw new Error("stale opposing command must never reach its writes");
      });
    }).catch((error: unknown) => error);
    await secondEntered.promise;
    try {
      const end = Date.now() + 5000;
      let observed = false;
      while (Date.now() < end) {
        if ((await pool.query<{ blocked: boolean }>("SELECT $2::int=ANY(pg_blocking_pids($1::int)) AS blocked", [secondPid, firstPid])).rows[0]?.blocked) { observed = true; break; }
        await new Promise(resolve => setTimeout(resolve, 5));
      }
      expect(observed).toBe(true);
    } finally { release.release(); }
    await first;
    const refused = await second;
    expect(refused).toBeInstanceOf(Error);
    expect((refused as Error).message).toMatch(/diagnostic_source_(graph_changed|purge_not_due|stale)/);
    expect(await prisma.user.findUniqueOrThrow({ where: { id: uid } })).toMatchObject({
      displayName: order === "purge-first" ? null : "retained owner", deletionScheduledAt: null,
    });
  });

  it.each([false, true])("avatar cleanup preserves exact inventory and existing upsert replay=%s", async replay => {
    await guards(false);
    const avatar = randomUUID(), key = `profiles/${uid}/${avatar}.webp`;
    await prisma.mediaUpload.create({ data: { id: avatar, userId: uid, key, kind: "image", contentType: "image/webp", sizeBytes: 72, state: "ADOPTED", writeProtocol: "conditional-v1", objectKeys: [key], claimTargetType: "profile", claimTargetId: uid } });
    await prisma.user.update({ where: { id: uid }, data: { avatarUploadId: avatar, avatarKey: key, avatarUrl: `https://synthetic.invalid/${avatar}` } });
    if (replay) await prisma.mediaUploadCleanup.create({ data: { uploadId: avatar, key, objectKeys: [key], writeProtocol: "conditional-v1", status: "PENDING", attempts: 2, nextAttemptAt: cutoff, lastError: "retained retry" } });
    const prior = await prisma.mediaUploadCleanup.findUnique({ where: { uploadId: avatar } });
    await guards(true);
    await expect(prisma.$transaction(async tx => withDiagnosticSourceCommand(tx, await command(tx), async () => {
      await ownerPurge(tx); throw new Error("avatar rollback sentinel");
    }))).rejects.toThrow("avatar rollback sentinel");
    expect(await prisma.mediaUpload.findUniqueOrThrow({ where: { id: avatar } })).toMatchObject({ state: "ADOPTED" });
    expect(await prisma.user.findUniqueOrThrow({ where: { id: uid } })).toMatchObject({ avatarUploadId: avatar });
    expect(await prisma.mediaUploadCleanup.findUnique({ where: { uploadId: avatar } })).toEqual(prior);
    await prisma.$transaction(async tx => withDiagnosticSourceCommand(tx, await command(tx), async () => ownerPurge(tx)));
    expect(await prisma.mediaUpload.findUniqueOrThrow({ where: { id: avatar } })).toMatchObject({ state: "RETIRED", retiredAt: cutoff, claimToken: null, claimDeadline: null });
    const cleanup = await prisma.mediaUploadCleanup.findUniqueOrThrow({ where: { uploadId: avatar } });
    expect(cleanup).toMatchObject({ uploadId: avatar, key, objectKeys: [key], writeProtocol: "conditional-v1", status: "PENDING" });
    if (replay) expect(cleanup).toEqual(prior);
  });

  it("Session/device/TOTP cascades are covered and the entire graph rolls back atomically", async () => {
    await guards(false);
    const enrollment = randomUUID(), code = randomUUID(), device = randomUUID(), subscription = randomUUID();
    const otherDevice = randomUUID(), otherSession = randomUUID(), otherSubscription = randomUUID(), deviceSubscription = randomUUID();
    await prisma.totpEnrollment.create({ data: { id: enrollment, userId: uid, encryptedSecret: "synthetic-encrypted-fixture", verifiedAt: cutoff, backupCodes: { create: { id: code, codeHash: "synthetic-hash" } } } });
    for (const [id, userId] of [[device, uid], [otherDevice, foreign]] as const) await prisma.fcmDevice.create({ data: { id, userId, token: id, platform: "ios" } });
    await prisma.session.create({ data: { id: otherSession, userId: foreign, refreshTokenHash: otherSession, expiresAt: new Date("2030-01-01Z") } });
    for (const [id, sessionId, deviceId] of [[subscription, session, otherDevice], [deviceSubscription, otherSession, device], [otherSubscription, otherSession, otherDevice]] as const) await prisma.servicePushSubscription.create({ data: { id, sessionId, deviceId, conversationId: foreignConversation, lifecycleEpoch: 0 } });
    const videoGrant = randomUUID();
    await prisma.videoGrant.create({ data: { id: videoGrant, ownerUserId: uid, ownerSessionId: session, secretHash: videoGrant, listingId: draft, generationId: generation, purpose: "preview", expiresAt: new Date("2030-01-01Z") } });
    const request = randomUUID();
    await prisma.diagnosticContinuityRequest.create({ data: { id: request, actorId: uid, sessionId: session, orderId: foreignOrder, kind: "consume" } });
    await guards(true);
    await expect(prisma.$transaction(async tx => withDiagnosticSourceCommand(tx, await command(tx), async () => { await ownerPurge(tx); throw new Error("cascade rollback sentinel"); }))).rejects.toThrow("cascade rollback sentinel");
    expect(await prisma.totpBackupCode.findUnique({ where: { id: code } })).not.toBeNull();
    expect(await prisma.servicePushSubscription.findUnique({ where: { id: subscription } })).not.toBeNull();
    expect(await prisma.diagnosticContinuityRequest.findUnique({ where: { id: request } })).not.toBeNull();
    await prisma.$transaction(async tx => withDiagnosticSourceCommand(tx, await command(tx), async () => {
      // Exercise real FK actions rather than letting helper DELETEs hide them.
      await tx.session.delete({ where: { id: session } });
      await tx.fcmDevice.delete({ where: { id: device } });
      await tx.totpEnrollment.delete({ where: { id: enrollment } });
      await ownerPurge(tx);
    }));
    expect(await prisma.servicePushSubscription.findUnique({ where: { id: deviceSubscription } })).toBeNull();
    expect(await prisma.videoGrant.findUnique({ where: { id: videoGrant } })).toBeNull();
    expect(await prisma.totpEnrollment.findUnique({ where: { id: enrollment } })).toBeNull();
    expect(await prisma.totpBackupCode.findUnique({ where: { id: code } })).toBeNull();
    expect(await prisma.fcmDevice.findUnique({ where: { id: device } })).toBeNull();
    expect(await prisma.servicePushSubscription.findUnique({ where: { id: subscription } })).toBeNull();
    expect(await prisma.diagnosticContinuityRequest.findUnique({ where: { id: request } })).toBeNull();
    expect(await prisma.servicePushSubscription.findUnique({ where: { id: otherSubscription } })).not.toBeNull();
    expect(await prisma.fcmDevice.findUnique({ where: { id: otherDevice } })).not.toBeNull();
  });

  it("History anonymous knowledge, legal hold and artifact byte boundaries survive the covered union", async () => {
    await guards(false);
    const request = randomUUID(), conversation = randomUUID(), quote = randomUUID(), order = randomUUID(), payment = randomUUID();
    const day = `synthetic-${order}`;
    await prisma.vehicleHistoryRequest.create({ data: { id: request, customerId: uid, proposedVin: "SYNTHETIC-VIN" } });
    await prisma.serviceConversation.create({ data: { id: conversation, purpose: "history", historyRequestId: request } });
    await prisma.historyCapacityDay.create({ data: { day, slotLimit: 2, morningLimit: 1, evidence: "synthetic capacity" } });
    await prisma.historyQuote.create({ data: { id: quote, requestId: request, providers: [], preflightOutcome: "synthetic", refundRule: "synthetic", windowStart: cutoff, windowEnd: new Date("1980-01-03Z"), feasible: true } });
    const hold = { until: "2030-01-01T00:00:00.000Z", reason: "Explicit synthetic hold" };
    await prisma.historyOrder.create({ data: { id: order, requestId: request, quoteId: quote, day, morning: true, holdExpiresAt: cutoff, promiseAt: cutoff, rights: { category: "payment_evidence", hold, schedule: { kind: "until", until: "2030-01-01T00:00:00.000Z" } } } });
    await prisma.historyPayment.create({ data: { id: payment, orderId: order, clientPaymentId: payment, claim: "held payment", evidence: "held evidence", confirmedById: uid } });
    const anonymous = randomUUID(), held = randomUUID(), personal = randomUUID();
    for (const [id, rights] of [[anonymous, { identifiability: "anonymous", schedule: { kind: "permitted_knowledge" }, hold: null }], [held, { identifiability: "personal", hold }], [personal, { identifiability: "personal", hold: null }]] as const) await prisma.serviceAttachment.create({ data: { id, conversationId: conversation, uploaderId: uid, lifecycleEpoch: 0, category: "vehicle_observation", visibility: "customer", state: "ready", stagingKey: `staging/${id}`, objectKey: `history/${id}`, contentType: "application/pdf", expectedBytes: 1, filename: "synthetic", rights, expiresAt: new Date("2030-01-01Z") } });
    const retainedArtifact = randomUUID(), privateArtifact = randomUUID();
    for (const [id, anonymous] of [[retainedArtifact, true], [privateArtifact, false]] as const) await prisma.historyArtifact.create({ data: { id, provider: "synthetic", originalDate: cutoff, objectKey: `history-artifact/${id}`, sha256: "a".repeat(64), sizeBytes: 1, expectedPages: 1, rights: { identifiability: anonymous ? "anonymous" : "personal", use: ["archive", "redistribute"] }, acquiredForOrderId: order, vehicleIdentity: "synthetic identity", mileageValue: 100, mileageUnit: "km", mileageObservedAt: cutoff, state: "verified", verifiedById: uid, provenance: "private acquisition" } });
    await guards(true);
    await expect(prisma.$transaction(async tx => withDiagnosticSourceCommand(tx, await command(tx), async () => {
      await tx.historyArtifact.delete({ where: { id: retainedArtifact } });
    }))).rejects.toThrow("diagnostic_source_effect_mismatch");
    await prisma.$transaction(async tx => withDiagnosticSourceCommand(tx, await command(tx), async () => ownerPurge(tx)));
    expect(await prisma.serviceAttachment.findUniqueOrThrow({ where: { id: anonymous } })).toMatchObject({ state: "ready", uploaderId: null, objectKey: `history/${anonymous}` });
    expect(await prisma.serviceAttachment.findUniqueOrThrow({ where: { id: held } })).toMatchObject({ state: "ready", uploaderId: null, objectKey: `history/${held}` });
    expect(await prisma.serviceAttachment.findUniqueOrThrow({ where: { id: personal } })).toMatchObject({ state: "removed", uploaderId: null });
    expect(await prisma.serviceErasureFence.findUniqueOrThrow({ where: { conversationId: conversation } })).toMatchObject({ objectKeys: [`history/${personal}`] });
    expect(await prisma.historyPayment.findUniqueOrThrow({ where: { id: payment } })).toMatchObject({ claim: "held payment", evidence: "held evidence", confirmedById: null });
    expect(await prisma.historyArtifact.findUniqueOrThrow({ where: { id: retainedArtifact } })).toMatchObject({ state: "verified", vehicleIdentity: "synthetic identity", mileageValue: 100, acquiredForOrderId: null, provenance: null, verifiedById: null });
    expect(await prisma.historyArtifact.findUniqueOrThrow({ where: { id: privateArtifact } })).toMatchObject({ state: "restricted", vehicleIdentity: null, mileageValue: null, objectKey: `history-artifact/${privateArtifact}`, acquiredForOrderId: null });
    expect(await prisma.historyArtifactCleanup.count({ where: { artifactId: { in: [retainedArtifact, privateArtifact] } } })).toBe(0);

  });

});
