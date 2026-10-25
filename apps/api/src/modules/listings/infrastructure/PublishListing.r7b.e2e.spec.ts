import { createRequire } from "node:module";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { Test, type TestingModule } from "@nestjs/testing";
import type { Provider } from "@nestjs/common";
import { MODULE_METADATA } from "@nestjs/common/constants";
import { ConfigService } from "@nestjs/config";
import { IdentityModule } from "../../identity/identity.module";
import { BUSINESS_AUTHORITY_PORT, IDENTITY_CLOCK_PORT, type BusinessAuthorityPort } from "../../identity/identity.public";
import { PrismaMeasurementStore } from "../../measurement/infrastructure/PrismaMeasurementStore";
import { ListingOwnership } from "../application/ListingOwnership";
import { VideoEligibility } from "../application/VideoEligibility";
import { PrismaOwnedVideoSessionLedger } from "./PrismaOwnedVideoSessionLedger";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { PrismaService, PrismaMeasurementCommit, type Prisma } from "@auto-tm/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { defineE2eSuite, seedSuiteCatalog } from "../../../../test/helpers/e2eSuite";
import { configuredIdentityTestPorts } from "../../../common/application/testing/ConfiguredIdentityTestPorts";
import { PublishListing } from "../application/PublishListing";
import { UploadAdoptionGuard } from "../application/UploadAdoptionGuard";
import { Listing } from "../domain/Listing";
import { PrismaListingRepository } from "./PrismaListingRepository";
import { ContactPhonePolicy } from "../domain/ContactPhonePolicy";
import { PrismaListingDraftRepository } from "./PrismaListingDraftRepository";
import { PrismaMediaUploadRepository } from "./PrismaMediaUploadRepository";
import { PrismaUploadClaims } from "./PrismaUploadClaims";
import { PrismaVerifiedContactPhoneRepository } from "./PrismaVerifiedContactPhoneRepository";
import { PrismaExchangeRateRepository } from "./PrismaExchangeRateRepository";
import { EventEmitterListingEventPublisher } from "./EventEmitterListingEventPublisher";

// Isolated task-owned database only. Fixtures precede matched guard activation;
// every tested write then uses its production entry, never a test source command.
const suite = defineE2eSuite("r7b-publication-round1-20261025");
const now = new Date("2026-10-25T12:00:00.000Z"), clock = { now: () => now };
const id = (n: number, label: string) => suite.id(`${n}-${label}`);
function gate() { let release = () => {}; const promise = new Promise<void>(resolve => { release = resolve; }); return { promise, release }; }
async function reached(barrier: Promise<void>, running: Promise<unknown>) {
 let timer: ReturnType<typeof setTimeout> | undefined;
 try { await Promise.race([barrier, running.then(() => { throw new Error("publication_barrier_not_reached"); }), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("publication_barrier_timeout")), 3000); })]); }
 finally { if (timer) clearTimeout(timer); }
}
async function waiting(db: PrismaService, waiter: () => number, holder: () => number) {
 const deadline = Date.now() + 3000;
 while (Date.now() < deadline) {
  const [row] = await db.$queryRaw<{ blocked: boolean }[]>`SELECT ${holder()}::int=ANY(pg_blocking_pids(${waiter()}::int)) AS blocked`;
  if (row?.blocked) return;
  await new Promise(resolve => setTimeout(resolve, 10));
 }
 throw new Error("publication_backend_wait_not_observed");
}
function instrument(db: PrismaService, point: "before-source" | "after-source" | "campaign-finish" | "transaction-end", fault?: "omit-audit" | "corrupt-photo") {
 const arrived = gate(), resume = gate(); let pid = 0;
 const client = new Proxy(db, { get(target, key) {
  if (key !== "$transaction") { const v: unknown = Reflect.get(target, key); return typeof v === "function" ? v.bind(target) : v; }
  return <T>(work: (tx: Prisma.TransactionClient) => Promise<T>, options?: { maxWait?: number; timeout?: number; isolationLevel?: Prisma.TransactionIsolationLevel }) => target.$transaction(async tx => {
   pid = (await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`)[0]?.pid ?? 0;
   const result = await work(new Proxy(tx, { get(t, k) {
    if (fault === "omit-audit" && k === "auditLog") return { create: async () => ({}) };
    if (fault === "corrupt-photo" && k === "listingMedia") return new Proxy(t.listingMedia, { get(model, name) {
     if (name === "create") return (args: Prisma.ListingMediaCreateArgs) => model.create({ ...args, data: { ...args.data, thumbHash: "corrupted" } });
     const v: unknown = Reflect.get(model, name); return typeof v === "function" ? v.bind(model) : v;
    } });
    const value: unknown = Reflect.get(t, k);
    if (k !== "$queryRaw" || typeof value !== "function") return typeof value === "function" ? value.bind(t) : value;
    return async (...args: unknown[]) => {
     const sql = Array.isArray(args[0]) ? args[0].join("?") : (args[0] as { sql: string }).sql;
     if (point === "before-source" && sql.includes("diagnostic_prepare_source")) { arrived.release(); await resume.promise; }
     const result: unknown = await Reflect.apply(value, t, args);
     if (point === "after-source" && sql.includes("diagnostic_prepare_source") || point === "campaign-finish" && sql.includes("campaign_finish(")) { arrived.release(); await resume.promise; }
     return result;
    };
   } }));
   if (point === "transaction-end") { arrived.release(); await resume.promise; }
   return result;
  }, options);
 } });
 return { client, arrived, resume, pid: () => pid };
}

describe("R7b real publication finite transaction closure", { concurrent: false }, () => {
 const db = new PrismaService(), a = new PrismaService(), b = new PrismaService();
 let identity: Awaited<ReturnType<typeof configuredIdentityTestPorts>>;
 let originalGuards: { table: string; name: string; mode: string }[] = [];
 const epoch = suite.id("epoch");
 const modules: TestingModule[] = [], principalIds = new Map<number, string>();
 async function opponents(client: PrismaService) {
  const configured = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, IdentityModule) as Provider[];
  const selected = configured.filter(p => typeof p === "function" ? p.name === "CheckBusinessAuthority" : p && "useClass" in p && ["PrismaBusinessAuthority", "PrismaAccountDeletionUnitOfWork"].includes(p.useClass.name) || p && "provide" in p && p.provide === BUSINESS_AUTHORITY_PORT);
  const deletion = selected.find(p => typeof p === "object" && p && "useClass" in p && p.useClass.name === "PrismaAccountDeletionUnitOfWork");
  if (!deletion || typeof deletion !== "object" || !("provide" in deletion)) throw new Error("configured_deletion_provider_missing");
  // The fixture owns these shared pools; Nest compositions borrow them.
  const borrowed = new Proxy(client, { get(target, key) { if (key === "onModuleDestroy") return undefined; const value: unknown = Reflect.get(target,key); return typeof value === "function" ? value.bind(target) : value; } });
  const module = await Test.createTestingModule({ providers: [{ provide: PrismaService, useValue: borrowed }, { provide: IDENTITY_CLOCK_PORT, useValue: clock }, ...selected] }).compile(); modules.push(module);
  const authority = module.get<BusinessAuthorityPort>(BUSINESS_AUTHORITY_PORT);
  const unit = module.get<{ run(command: { userId: string; deletionScheduledAt: Date }, work: (writes: { scheduleDeletion(userId: string, at: Date): Promise<void>; archiveActiveListings(userId: string): Promise<void> }) => Promise<void>): Promise<void> }>(deletion.provide);
  return { schedule: (n: number, at = now) => unit.run({ userId: id(n, "owner"), deletionScheduledAt: at }, async writes => { await writes.scheduleDeletion(id(n, "owner"), at); await writes.archiveActiveListings(id(n, "owner")); }),
   video: new PrismaOwnedVideoSessionLedger(client, authority, new ListingOwnership(authority), clock, new VideoEligibility(new ConfigService({ VIDEO_ROLLOUT_ENABLED: true, VIDEO_UPLOADS_ENABLED: true, VIDEO_TESTER_USER_IDS: [17,18].map(n => id(n,"owner")) })), new PrismaUploadClaims(client, clock), randomUUID) };
 }

 const capture = new PrismaMeasurementCommit({ enabled: true, environment: "test", purposes: ["product_improvement"], evidenceRef: "r7b-round1-isolated", realCollectionApproved: false }, epoch, () => now);
 const photos = (n: number) => [1, 2, 3].map(k => ({ photoId: id(n, `photo-${k}`), key: `${suite.slug}/${n}/${k}/original.webp`, sortOrder: k - 1 }));
 function publisher(client = db, measurement = capture, preparation?: { arrived: ReturnType<typeof gate>; resume: ReturnType<typeof gate> }) {
  return new PublishListing(new PrismaListingDraftRepository(client), client, new PrismaExchangeRateRepository(client), new EventEmitterListingEventPublisher(new EventEmitter2()),
   { generate: async key => { if(preparation) { preparation.arrived.release(); await preparation.resume.promise; } return { variants: { thumbnail: key, list: key, detail: key, fullscreen: key }, thumbHash: "1fsDBYCIiIiHiIdweIeHh4d4cIgH" }; } },
   new UploadAdoptionGuard(new PrismaMediaUploadRepository(client), { inspect: async () => ({ contentType: "image/webp", sizeBytes: 1024 }) }),
   new ContactPhonePolicy(identity.check, new PrismaVerifiedContactPhoneRepository(client)), clock, new PrismaUploadClaims(client, clock), undefined, measurement);
 }
 const publish = (n: number, client = db, measurement = capture, preparation?: { arrived: ReturnType<typeof gate>; resume: ReturnType<typeof gate> }) => publisher(client, measurement, preparation).execute({ userId: id(n, "owner"), draftId: id(n, "draft") });
 async function snapshot(n: number) {
  return { listings: await db.listing.findMany({ where: { sellerId: id(n, "owner") } }), media: await db.listingMedia.findMany({ where: { id: { in: photos(n).map(p => p.photoId) } } }),
   draft: await db.listingDraft.findUnique({ where: { id: id(n, "draft") } }), audit: await db.auditLog.findMany({ where: { actorId: id(n, "owner") } }),
   uploads: await db.mediaUpload.findMany({where:{userId:id(n,"owner")},orderBy:{id:"asc"}}),
   video: await db.videoUploadSession.findMany({where:{userId:id(n,"owner")},orderBy:{id:"asc"}}),
   generations: await db.videoGeneration.findMany({where:{uploadId:{in:[id(n,"video-upload")]}},orderBy:{id:"asc"}}),
   outbox: await db.measurementOutbox.findMany({ where: { principalId: principalIds.get(n) ?? id(n, "principal") } }) };
 }
 beforeAll(async () => {
  if (process.env["R7B_DISPOSABLE_DATABASE"] !== "round1-8c41fd9a") throw new Error("requires_task_owned_disposable_database");
  await seedSuiteCatalog(db, suite);
  await db.measurementState.create({ data: { key: "collector", epoch } });
  for (let n = 1; n <= 28; n++) {
   const owner = id(n, "owner");
   await db.user.create({ data: { id: owner, phone: suite.phone(`${n}-owner`), phoneVerifiedAt: now, role: "seller" } });
   if (n <= 16) await db.measurementPrincipal.create({ data: { id: id(n, "principal"), userId: owner, epoch, generation: id(n, "generation"), pseudonym: id(n, "pseudonym").replaceAll("-", "").repeat(2), kind: "account" } });
   if (n >= 17 && n !== 25) {
    const store = new PrismaMeasurementStore(db, { epoch, environment: "test", population: "synthetic" }, () => now);
    expect(await store.bootstrap({ authenticatedUserId: owner })).not.toBeNull();
    principalIds.set(n, (await db.measurementPrincipal.findUniqueOrThrow({ where: { userId: owner } })).id);
    await db.session.create({ data: { id: id(n,"session"), userId: owner, refreshTokenHash: id(n,"refresh"), expiresAt: new Date("2026-11-01T00:00:00Z") } });
   }
   for (const [k, photo] of photos(n).entries()) await db.mediaUpload.create({ data: { id: id(n, `upload-${k + 1}`), userId: owner, key: photo.key, kind: "image", contentType: "image/webp", sizeBytes: 1024, state: "AVAILABLE" } });
   await db.listingDraft.create({ data: { id: id(n, "draft"), userId: owner, payload: { ...suite.catalog, brandId: suite.catalog.brandId, modelId: suite.catalog.modelId, cityId: suite.catalog.cityId, regionId: suite.catalog.regionId, year: 2020, vin: "WVWZZZ1JZXW000001", priceAmount: 1000, priceCurrency: "TMT", contactPhone: suite.phone(`${n}-owner`), condition: "used", mileageKm: 1000, description: "Checked publication fixture", allowCalls: true, allowChat: true, conditionDisclosure: { damaged: false }, photos: photos(n) } } });
   if ([11, 12].includes(n)) {
    const draft = await db.listingDraft.findUniqueOrThrow({ where: { id: id(n, "draft") } });
    await db.listingDraft.create({ data: { id: id(n, "opponent-draft"), userId: owner, payload: draft.payload as Prisma.InputJsonValue } });
   }
   if ([2, 3, 4, 5, 17, 18].includes(n)) {
    const key = `video/v1/${id(n, "video-upload")}/${id(n, "video")}/source.mp4`;
    await db.mediaUpload.create({ data: { id: id(n, "video-upload"), userId: owner, key, kind: "video", contentType: "video/mp4", sizeBytes: 1024, writeProtocol: "video-v1", objectKeys: [key], state: "PREPARING", claimToken: id(n, "video"), claimTargetType: "video_session", claimTargetId: id(n, "video"), claimDeadline: new Date("2026-11-01T00:00:00Z") } });
    await db.videoUploadSession.create({ data: { id: id(n, "video"), uploadId: id(n, "video-upload"), userId: owner, sourceKey: key, sizeBytes: 1024, protocolVersion: 1, targetKind: "draft", targetId: id(n, "draft"), targetRevision: 1, state: [3,17,18].includes(n) ? "PROCESSING" : "READY", expiresAt: new Date(n === 4 ? "2026-10-24T00:00:00Z" : "2026-11-01T00:00:00Z"), cancelledAt: n === 5 ? now : null } });
    await db.videoGeneration.create({ data: { id: id(n, "video"), sessionId: id(n, "video"), uploadId: id(n, "video-upload"), listingId: id(n, "draft"), targetRevision: 1, state: [3,17,18].includes(n) ? "PROCESSING" : "READY", ...([3,17,18].includes(n) ? {} : { readyAt: now, durationMs: 1000, posterKey: `video/v1/${id(n, "video-upload")}/${id(n, "video")}/poster.jpg`, manifest: { version: 1 } }) } });
    if ([17,18].includes(n)) {
     const fence=id(n,"completion-fence");
     await db.videoUploadSession.update({where:{id:id(n,"video")},data:{completionFence:fence,completedAt:now}});
     await db.videoGeneration.update({where:{id:id(n,"video")},data:{completionFence:fence}});
     await db.videoProcessWork.create({data:{generationId:id(n,"video"),uploadId:id(n,"video-upload"),sessionId:id(n,"video"),completionFence:fence,targetRevision:1,processingVersion:"ffmpeg-debian-5.1.9-v1"}});
    }
   }
  }
  await db.$executeRawUnsafe(`CREATE FUNCTION public.r7b_capture_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."principalId"='${id(14, "principal")}' THEN RAISE EXCEPTION 'r7b_capture_unavailable_fault'; END IF; RETURN NEW; END $$`);
  await db.$executeRawUnsafe('CREATE TRIGGER r7b_capture_fault BEFORE INSERT ON measurement_outbox FOR EACH ROW EXECUTE FUNCTION public.r7b_capture_fault()');
  identity = await configuredIdentityTestPorts(db);
  const guards = await db.$queryRaw<{ table: string; name: string; mode: string }[]>`SELECT c.relname AS table,t.tgname AS name,t.tgenabled::text AS mode FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND (t.tgname LIKE 'zz_diagnostic_source_%' OR t.tgname LIKE 'zzzz_campaign_preparation%' OR t.tgname='diagnostic_source_no_truncate')`;
  originalGuards = guards;
  for (const g of guards) await db.$executeRawUnsafe(`ALTER TABLE public."${g.table}" ENABLE TRIGGER "${g.name}"`);
  expect(await db.$queryRaw`SELECT public.diagnostic_source_guards_ready() AS source,public.campaign_preparation_ready() AS campaign`).toEqual([{ source: true, campaign: true }]);
 });
 afterAll(async () => {
  try {
   for (const g of originalGuards) {
    const mode = ({ O: "ENABLE", D: "DISABLE", A: "ENABLE ALWAYS", R: "ENABLE REPLICA" } as const)[g.mode as "O" | "D" | "A" | "R"];
    if (!mode) throw new Error("unknown_trigger_mode");
    await db.$executeRawUnsafe(`ALTER TABLE public."${g.table}" ${mode} TRIGGER "${g.name}"`);
   }
   await db.$executeRawUnsafe('DROP TRIGGER IF EXISTS r7b_capture_fault ON measurement_outbox');
   await db.$executeRawUnsafe('DROP FUNCTION IF EXISTS public.r7b_capture_fault()');
  } finally { await identity?.module.close(); for (const module of modules) await module.close(); await Promise.all([db.$disconnect(), a.$disconnect(), b.$disconnect()]); }
 });
 it.each([1, 2, 3, 4, 5])("publishes exact photos/audit/capture with absent, READY, pending or invalid video graph %i", async n => {
  const result = await publish(n); const state = await snapshot(n);
  expect(state.draft).toBeNull(); expect(state.listings).toHaveLength(1); expect(state.media).toHaveLength(3); expect(state.audit).toHaveLength(1); expect(state.outbox).toHaveLength(2);
  expect(state.listings[0]).toMatchObject({ id: result.listing.id, activeVideoGenerationId: n === 2 ? id(n, "video") : null, pendingVideoGenerationId: n === 3 ? id(n, "video") : null, activeVideoRevision: [2, 3].includes(n) ? 1 : 0 });
  expect(state.outbox.map(row => (row.event as { eventName: string }).eventName).sort()).toEqual(["listing_published", "listing_visibility_changed"]);
  expect(state.outbox.every(row => row.expiresAt.toISOString() === "2026-11-01T12:00:00.000Z")).toBe(true);
  expect(await db.mediaUpload.count({ where: { userId: id(n, "owner"), kind: "image", state: "ADOPTED", claimToken: null, claimDeadline: null } })).toBe(3);
  if ([4, 5].includes(n)) expect(await db.videoGeneration.findUnique({ where: { id: id(n, "video") } })).toMatchObject({ listingId: id(n, "draft") });
 });
 it("commits publication when optional capture is disabled after planning", async () => {
  const disabled = new PrismaMeasurementCommit({ enabled: true, environment: "test", purposes: [], evidenceRef: "disabled-purpose", realCollectionApproved: false }, epoch, () => now);
  await publish(6, db, disabled); const state = await snapshot(6);
  expect(state.listings).toHaveLength(1); expect(state.outbox).toEqual([]); expect(state.media).toHaveLength(3);
 });
 it("preserves optional absence when capture activation changes after the source receipt", async () => {
  const activation = { enabled: true, environment: "test" as const, purposes: ["product_improvement" as const], evidenceRef: "r7b-after-plan", realCollectionApproved: false };
  const commit = new PrismaMeasurementCommit(activation, epoch, () => now), hook = instrument(a, "after-source");
  const started = publish(13, hook.client, commit);
  try {
   await reached(hook.arrived.promise, started); activation.enabled = false; hook.resume.release(); await started;
   const state = await snapshot(13); expect(state.listings).toHaveLength(1); expect(state.outbox).toEqual([]); expect(state.media).toHaveLength(3);
  } finally { hook.resume.release(); await Promise.allSettled([started]); }
 });
 it("commits core publication after the actual capture savepoint rolls an outbox failure back", async () => {
  await publish(14); const state = await snapshot(14);
  expect(state.listings).toHaveLength(1); expect(state.media).toHaveLength(3); expect(state.audit).toHaveLength(1); expect(state.outbox).toEqual([]); expect(state.draft).toBeNull();
 });
 it("retains ordinary nonpublication listing_create and listing_change", async () => {
  const repo = new PrismaListingRepository(db);
  const listing = Listing.create({ id: id(15, "ordinary"), publicNumber: 0, sellerId: id(15, "owner"), status: "active", brandId: suite.catalog.brandId, modelId: suite.catalog.modelId, year: 2020, cityId: suite.catalog.cityId, priceAmount: 1000, priceCurrency: "TMT", contactPhone: suite.phone("15-owner"), allowCalls: true, allowChat: true, publishedAt: now, createdAt: now, updatedAt: now });
  await repo.save(listing); await repo.update(listing);
  expect(await db.listing.findUnique({ where: { id: id(15, "ordinary") } })).toMatchObject({ sellerId: id(15, "owner"), status: "active" });
 });
 it.each(["omit-audit", "corrupt-photo"] as const)("rolls back publication on the %s source completion attack", async fault => {
  const n = fault === "omit-audit" ? 7 : 8, hooked = instrument(a, "after-source", fault); hooked.resume.release();
  await expect(publish(n, hooked.client)).rejects.toThrow(fault === "omit-audit" ? "diagnostic_source_final_effect" : "diagnostic_source_effect_mismatch");
  const state = await snapshot(n); expect(state.listings).toEqual([]); expect(state.media).toEqual([]); expect(state.audit).toEqual([]); expect(state.outbox).toEqual([]); expect(state.draft).not.toBeNull();
  expect(await db.mediaUpload.count({ where: { userId: id(n, "owner"), kind: "image", state: "AVAILABLE" } })).toBe(3);
 });
 it.each([true, false])("serializes the real publish and draft update in publication-first=%s order", async publicationFirst => {
  const foreign = await snapshot(24);
  const n = publicationFirst ? 9 : 10, draftRepo = new PrismaListingDraftRepository(b), draft = await draftRepo.findById(id(n, "draft"));
  if (!draft) throw new Error("draft_fixture_missing");
  const updated = draft.updatePayload({ ...(draft.payload as object), description: "concurrent edit" }, new Date("2026-10-25T12:00:01Z"));
  const first = instrument(a, publicationFirst ? "after-source" : "campaign-finish"), second = instrument(b, "before-source"); second.resume.release(); const started: Promise<unknown>[] = [];
  const one = (publicationFirst ? publish(n, first.client) : new PrismaListingDraftRepository(first.client).update(updated)).then(value => ({ value }), error => ({ error })); started.push(one);
  try {
   await reached(first.arrived.promise, one);
   const two = (publicationFirst ? new PrismaListingDraftRepository(second.client).update(updated) : publish(n, second.client)).then(value => ({ value }), error => ({ error })); started.push(two);
   await waiting(db, second.pid, first.pid);
   first.resume.release(); const outcomes = await Promise.all([one, two]); expect(outcomes[0]).toHaveProperty("value");
   expect(outcomes[1]).toMatchObject({ error: { message: publicationFirst ? "draft_dependencies_changed" : "diagnostic_source_graph_changed" } });
   const state = await snapshot(n);
   expect(state.listings).toHaveLength(publicationFirst ? 1 : 0);
   expect(state.media).toHaveLength(publicationFirst ? 3 : 0); expect(state.audit).toHaveLength(publicationFirst ? 1 : 0); expect(state.outbox).toHaveLength(publicationFirst ? 2 : 0);
   expect(state.uploads.filter(row=>row.state===(publicationFirst ? "ADOPTED" : "AVAILABLE"))).toHaveLength(3);
   if (!publicationFirst) expect(state.draft?.payload).toMatchObject({ description: "concurrent edit" });
   else expect(state.draft).toBeNull();
   expect(await snapshot(24)).toEqual(foreign);
  } finally { first.resume.release(); await Promise.allSettled(started); }
 });
 it.each([true, false])("permits only one real publication adopter in original-draft-first=%s order", async originalFirst => {
  const n = originalFirst ? 11 : 12, first = instrument(a, "after-source"), second = instrument(b, "after-source"), started: Promise<unknown>[] = [];
  second.resume.release();
  const original = () => publisher(originalFirst ? first.client : second.client).execute({ userId: id(n, "owner"), draftId: id(n, "draft") });
  const opponent = () => publisher(originalFirst ? second.client : first.client).execute({ userId: id(n, "owner"), draftId: id(n, "opponent-draft") });
  const one = (originalFirst ? original() : opponent()).then(value => ({ value }), error => ({ error })); started.push(one);
  try {
   await reached(first.arrived.promise, one);
   const two = (originalFirst ? opponent() : original()).then(value => ({ value }), error => ({ error })); started.push(two);
   await waiting(db, second.pid, first.pid);
   first.resume.release();
   expect(await one).toHaveProperty("value"); expect(await two).toMatchObject({ error: { message: "upload_claim_scope_changed" } });
   expect(await db.listing.count({ where: { sellerId: id(n, "owner") } })).toBe(1);
   expect(await db.listingMedia.count({ where: { uploadId: { in: [1, 2, 3].map(k => id(n, `upload-${k}`)) } } })).toBe(3);
   expect(await db.listingDraft.findUnique({ where: { id: id(n, originalFirst ? "opponent-draft" : "draft") } })).not.toBeNull();
  } finally { first.resume.release(); second.resume.release(); await Promise.allSettled(started); }
 });
 it.each([true, false])("serializes actual video cancellation with publication-first=%s", async publicationFirst => {
  const n = publicationFirst ? 17 : 18, foreign = await snapshot(24);
  const first = instrument(a, publicationFirst ? "after-source" : "transaction-end"), second = instrument(b, "transaction-end"); second.resume.release();
  const videoFirst = await opponents(first.client), videoSecond = await opponents(second.client);
  const cancel = (video: PrismaOwnedVideoSessionLedger) => video.change({ userId: id(n,"owner"), sessionId: id(n,"session") }, id(n,"video"), "cancel");
  const started: Promise<unknown>[] = [], preparation = {arrived:gate(),resume:gate()};
  // Reserve photos through the real caller, then hold external variant work.
  // The video writer can now win before the publication outer receipt, rather
  // than merely blocking the separate photo-reservation transaction.
  const preparedPublication = publicationFirst ? undefined : publish(n,second.client,capture,preparation).then(value=>({value}),error=>({error}));
  if(preparedPublication) started.push(preparedPublication);
  try {
   if(preparedPublication) await reached(preparation.arrived.promise,preparedPublication);
   const one = (publicationFirst ? publish(n, first.client) : cancel(videoFirst.video)).then(value => ({value}), error => ({error})); started.push(one);
   await reached(first.arrived.promise, one);
   preparation.resume.release();
   const two = publicationFirst ? cancel(videoSecond.video).then(value=>({value}),error=>({error})) : preparedPublication!; started.push(two);
   await waiting(db, second.pid, first.pid); first.resume.release();
   expect(await one).toHaveProperty("value");
   if(publicationFirst) expect(await two).toMatchObject({error:{message:"VIDEO_SESSION_UNAVAILABLE"}});
   else expect(await two).toMatchObject({error:{code:"P2010",meta:{driverAdapterError:{cause:{originalCode:"P0001",originalMessage:"listing_publication_video_binding"}}}}});
   const state = await snapshot(n); expect(state.listings).toHaveLength(publicationFirst ? 1 : 0);
   expect(state.media).toHaveLength(publicationFirst ? 3 : 0); expect(state.outbox).toHaveLength(publicationFirst ? 2 : 0);
   const session = await db.videoUploadSession.findUniqueOrThrow({ where: { id: id(n,"video") } });
   expect(session).toMatchObject(publicationFirst ? { targetKind: "listing", targetId: state.listings[0]!.id, targetRevision: 1, cancelledAt: null } : { targetKind: "draft", targetId: id(n,"draft"), targetRevision: 1, state: "CLEANUP_PENDING" });
   expect(state.audit).toHaveLength(publicationFirst?1:0); expect(state.draft===null).toBe(publicationFirst);
   expect(state.uploads.filter(row=>row.kind==="image"&&row.state===(publicationFirst?"ADOPTED":"AVAILABLE"))).toHaveLength(3);
   expect(state.generations).toMatchObject([{listingId:publicationFirst?state.listings[0]!.id:id(n,"draft"),targetRevision:1,state:publicationFirst?"PROCESSING":"RETIRED"}]);
   expect(await db.videoProcessWork.findUnique({where:{generationId:id(n,"video")}})).toMatchObject({state:publicationFirst?"PENDING":"CANCELLED",targetRevision:1,completionFence:id(n,"completion-fence")});
   if(publicationFirst) {
    expect(state.listings[0]).toMatchObject({activeVideoGenerationId:null,pendingVideoGenerationId:id(n,"video"),activeVideoRevision:1});
    expect(state.uploads.find(row=>row.kind==="video")).toMatchObject({state:"PREPARING",claimTargetType:"video_session",claimTargetId:id(n,"video"),claimToken:id(n,"video")});
    expect(await db.videoCleanupWork.findUnique({where:{id:`session:${id(n,"video")}`}})).toBeNull();
   } else {
    expect(state.uploads.find(row=>row.kind==="video")).toMatchObject({state:"RETIRED",claimToken:null,claimDeadline:null});
    expect(await db.videoCleanupWork.findUnique({where:{id:`session:${id(n,"video")}`}})).toMatchObject({uploadId:id(n,"video-upload"),sessionId:id(n,"video"),generationId:id(n,"video"),writeProtocol:"video-v1",objectKeys:[],state:"PENDING"});
    expect(await db.mediaUploadCleanup.findUnique({where:{uploadId:id(n,"video-upload")}})).toMatchObject({writeProtocol:"video-v1",status:"LEGACY_PENDING"});
   }
   expect(await snapshot(24)).toEqual(foreign);
  } finally { first.resume.release(); second.resume.release(); preparation.resume.release(); await Promise.allSettled(started); }
 });
 it.each([true, false])("serializes account scheduling with publication-first=%s", async publicationFirst => {
  const scheduledAt = new Date("2026-10-26T12:00:00Z");
  const n = publicationFirst ? 19 : 20, foreign = await snapshot(24);
  const first = instrument(a, "after-source"), second = instrument(b, "before-source"); second.resume.release();
  const firstAccount = await opponents(first.client), secondAccount = await opponents(second.client);
  const started: Promise<unknown>[] = [];
  const one = (publicationFirst ? publish(n, first.client) : firstAccount.schedule(n,scheduledAt)).then(value => ({value}), error => ({error})); started.push(one);
  try {
   await reached(first.arrived.promise, one);
   const two = (publicationFirst ? secondAccount.schedule(n,scheduledAt) : publish(n, second.client)).then(value => ({value}), error => ({error})); started.push(two);
   await waiting(db, second.pid, first.pid); first.resume.release(); expect(await one).toHaveProperty("value");
   if (publicationFirst) expect(await two).toMatchObject({ error: { code: "P2010", meta: { driverAdapterError: { cause: { originalCode: "P0001", originalMessage: "diagnostic_source_graph_changed" } } } } });
   else expect(await two).toMatchObject({ error: { message: "upload_claim_scope_changed" } });
   const state = await snapshot(n); expect(state.listings).toHaveLength(publicationFirst ? 1 : 0); expect(state.media).toHaveLength(publicationFirst ? 3 : 0); expect(state.outbox).toHaveLength(publicationFirst ? 2 : 0);
   expect(await db.user.findUnique({where:{id:id(n,"owner")}})).toMatchObject({deletionScheduledAt:publicationFirst ? null : scheduledAt});
   expect(state.audit).toHaveLength(publicationFirst ? 1 : 0); expect(state.draft === null).toBe(publicationFirst);
   expect(state.uploads.filter(row=>row.state===(publicationFirst?"ADOPTED":"AVAILABLE"))).toHaveLength(3);
   if (publicationFirst) {
    // A new explicit caller attempt rediscovers the committed publication.
    await secondAccount.schedule(n,scheduledAt);
    const erased = await snapshot(n); expect(erased.outbox).toEqual([]); expect(erased.media).toHaveLength(3);
    expect(erased.listings).toMatchObject([{status:"archived",archivedByDeletion:true}]);
    expect(await db.measurementPrincipal.findUnique({where:{userId:id(n,"owner")}})).toBeNull();
   }
   expect(await snapshot(24)).toEqual(foreign);
  } finally { first.resume.release(); await Promise.allSettled(started); }
 });
 it.each([true,false])("commits optional capture around actual principal bootstrap publication-first=%s",async publicationFirst=>{
  const n=publicationFirst?25:26, foreign=await snapshot(24);
  const first=instrument(a,publicationFirst?"after-source":"transaction-end"),second=instrument(b,"transaction-end"); second.resume.release();
  const bootstrap=(client:PrismaService)=>new PrismaMeasurementStore(client,{epoch,environment:"test",population:"synthetic"},()=>now).bootstrap({authenticatedUserId:id(n,"owner")});
  const started:Promise<unknown>[]=[];
  const one=(publicationFirst?publish(n,first.client):bootstrap(first.client)).then(value=>({value}),error=>({error})); started.push(one);
  try {
   await reached(first.arrived.promise,one);
   const two=(publicationFirst?bootstrap(second.client):publish(n,second.client)).then(value=>({value}),error=>({error})); started.push(two);
   await waiting(db,second.pid,first.pid);first.resume.release();expect(await one).toHaveProperty("value");expect(await two).toHaveProperty("value");
   const principal=await db.measurementPrincipal.findUniqueOrThrow({where:{userId:id(n,"owner")}});principalIds.set(n,principal.id);
   const state=await snapshot(n);expect(state.listings).toHaveLength(1);expect(state.media).toHaveLength(3);expect(state.audit).toHaveLength(1);expect(state.draft).toBeNull();
   expect(state.outbox).toHaveLength(publicationFirst?0:2);
   for(const row of state.outbox) expect(row).toMatchObject({principalId:principal.id,generation:principal.generation,epoch:principal.epoch,environment:"test",expiresAt:new Date("2026-11-01T12:00:00Z")});
   expect(state.outbox.map(row=>(row.event as {eventName:string}).eventName).sort()).toEqual(publicationFirst?[]:["listing_published","listing_visibility_changed"]);
   expect(state.uploads.filter(row=>row.state==="ADOPTED"&&row.claimToken===null&&row.claimDeadline===null)).toHaveLength(3);
   expect(await snapshot(24)).toEqual(foreign);
  }finally{first.resume.release();second.resume.release();await Promise.allSettled(started);}
 });

 it.each([true,false])("serializes actual due account purge with publication-first=%s",async publicationFirst=>{
  const n=publicationFirst?27:28,foreign=await snapshot(24);
  const scheduling=await opponents(db); await scheduling.schedule(n);
  const first=instrument(a,"after-source"),second=instrument(b,"before-source"); second.resume.release();
  // Consume the worker's real CommonJS build across its runtime boundary.
  const loadWorker=createRequire(resolve(process.cwd(),"package.json"));
  const {PurgeExpiredAccounts}=loadWorker("../worker/dist/jobs/PurgeExpiredAccounts.js") as {PurgeExpiredAccounts:new(client:PrismaService)=>{execute(input:{now:Date}):Promise<{purgedCount:number}>}};
  const purge=(client:PrismaService)=>new PurgeExpiredAccounts(client).execute({now});
  const started:Promise<unknown>[]=[];
  const one=(publicationFirst?publish(n,first.client):purge(first.client)).then(value=>({value}),error=>({error}));started.push(one);
  try{
   await reached(first.arrived.promise,one);
   const two=(publicationFirst?purge(second.client):publish(n,second.client)).then(value=>({value}),error=>({error}));started.push(two);
   await waiting(db,second.pid,first.pid);first.resume.release();
   if(publicationFirst)expect(await one).toHaveProperty("value");else expect(await one).toEqual({value:{purgedCount:1}});
   if(publicationFirst)expect(await two).toMatchObject({error:{code:"P2010",meta:{driverAdapterError:{cause:{originalCode:"P0001",originalMessage:"diagnostic_source_graph_changed"}}}}});
   else expect(await two).toMatchObject({error:{message:"upload_claim_scope_changed"}});
   if(publicationFirst)expect(await purge(second.client)).toEqual({purgedCount:1});
   const state=await snapshot(n);expect(state.listings).toHaveLength(publicationFirst?1:0);expect(state.media).toHaveLength(publicationFirst?3:0);expect(state.outbox).toEqual([]);expect(state.draft).toBeNull();
   expect(state.audit).toHaveLength(publicationFirst?1:0);
   expect(await db.user.findUnique({where:{id:id(n,"owner")}})).toMatchObject({phone:null,email:null,deletionScheduledAt:null});
   expect(await db.session.count({where:{userId:id(n,"owner")}})).toBe(0);
   expect(await db.measurementPrincipal.findUnique({where:{userId:id(n,"owner")}})).toBeNull();
   expect(await snapshot(24)).toEqual(foreign);
  }finally{first.resume.release();await Promise.allSettled(started);}
 });
 // Epoch rotation is last: its public operation intentionally erases all principals.
 it.each([true, false])("serializes collector epoch rotation with publication-first=%s", async publicationFirst => {
  const n = publicationFirst ? 21 : 22, foreign = await snapshot(24);
  const current = await db.measurementState.findUniqueOrThrow({where:{key:"collector"}}), nextEpoch = randomUUID();
  const bootstrap = new PrismaMeasurementStore(db, { epoch: current.epoch, environment: "test", population: "synthetic" }, () => now);
  expect(await bootstrap.bootstrap({authenticatedUserId:id(n,"owner")})).not.toBeNull();
  const principal = await db.measurementPrincipal.findUniqueOrThrow({where:{userId:id(n,"owner")}}); principalIds.set(n,principal.id);
  const commit = new PrismaMeasurementCommit({enabled:true, environment:"test", purposes:["product_improvement"], evidenceRef:"r7b-collector-race", realCollectionApproved:false},current.epoch,()=>now);
  const publication = instrument(a, publicationFirst ? "after-source" : "before-source"), rotation = instrument(b,"transaction-end");
  const store = new PrismaMeasurementStore(rotation.client,{epoch:current.epoch,environment:"test",population:"synthetic"},()=>now);
  const started: Promise<unknown>[] = [];
  const one = publish(n,publication.client,commit).then(value=>({value}),error=>({error})); started.push(one);
  try {
   await reached(publication.arrived.promise,one);
   const two = store.rotateRestoreEpoch(nextEpoch).then(value=>({value}),error=>({error})); started.push(two);
   if(publicationFirst) {
    await waiting(db,rotation.pid,publication.pid); publication.resume.release(); expect(await one).toHaveProperty("value");
    await reached(rotation.arrived.promise,two); expect((await snapshot(n)).outbox).toHaveLength(2); rotation.resume.release(); expect(await two).toHaveProperty("value");
   } else {
    await reached(rotation.arrived.promise,two); publication.resume.release(); await waiting(db,publication.pid,rotation.pid); rotation.resume.release(); expect(await two).toHaveProperty("value");
    expect(await one).toMatchObject({error:{code:"P2010",meta:{driverAdapterError:{cause:{originalCode:"P0001",originalMessage:"listing_publication_measurement_identity"}}}}});
   }
   const state = await snapshot(n); expect(state.listings).toHaveLength(publicationFirst?1:0); expect(state.media).toHaveLength(publicationFirst?3:0); expect(state.outbox).toEqual([]);
   expect(await db.measurementPrincipal.count()).toBe(0); expect(await db.measurementState.findUnique({where:{key:"collector"}})).toMatchObject({epoch:nextEpoch});
   const after = await snapshot(24); expect({...after,outbox:foreign.outbox}).toEqual(foreign);
  } finally { publication.resume.release(); rotation.resume.release(); await Promise.allSettled(started); }
 });

});
