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
function instrument(db: PrismaService, point: "before-source" | "after-source" | "campaign-finish", fault?: "omit-audit" | "corrupt-photo") {
 const arrived = gate(), resume = gate(); let pid = 0;
 const client = new Proxy(db, { get(target, key) {
  if (key !== "$transaction") { const v: unknown = Reflect.get(target, key); return typeof v === "function" ? v.bind(target) : v; }
  return <T>(work: (tx: Prisma.TransactionClient) => Promise<T>) => target.$transaction(async tx => {
   pid = (await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`)[0]?.pid ?? 0;
   return work(new Proxy(tx, { get(t, k) {
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
  });
 } });
 return { client, arrived, resume, pid: () => pid };
}

describe("R7b real publication finite transaction closure", { concurrent: false }, () => {
 const db = new PrismaService(), a = new PrismaService(), b = new PrismaService();
 let identity: Awaited<ReturnType<typeof configuredIdentityTestPorts>>;
 let originalGuards: { table: string; name: string; mode: string }[] = [];
 const epoch = suite.id("epoch");
 const capture = new PrismaMeasurementCommit({ enabled: true, environment: "test", purposes: ["product_improvement"], evidenceRef: "r7b-round1-isolated", realCollectionApproved: false }, epoch, () => now);
 const photos = (n: number) => [1, 2, 3].map(k => ({ photoId: id(n, `photo-${k}`), key: `${suite.slug}/${n}/${k}/original.webp`, sortOrder: k - 1 }));
 function publisher(client = db, measurement = capture) {
  return new PublishListing(new PrismaListingDraftRepository(client), client, new PrismaExchangeRateRepository(client), new EventEmitterListingEventPublisher(new EventEmitter2()),
   { generate: async key => ({ variants: { thumbnail: key, list: key, detail: key, fullscreen: key }, thumbHash: "1fsDBYCIiIiHiIdweIeHh4d4cIgH" }) },
   new UploadAdoptionGuard(new PrismaMediaUploadRepository(client), { inspect: async () => ({ contentType: "image/webp", sizeBytes: 1024 }) }),
   new ContactPhonePolicy(identity.check, new PrismaVerifiedContactPhoneRepository(client)), clock, new PrismaUploadClaims(client, clock), undefined, measurement);
 }
 const publish = (n: number, client = db, measurement = capture) => publisher(client, measurement).execute({ userId: id(n, "owner"), draftId: id(n, "draft") });
 async function snapshot(n: number) {
  return { listings: await db.listing.findMany({ where: { sellerId: id(n, "owner") } }), media: await db.listingMedia.findMany({ where: { id: { in: photos(n).map(p => p.photoId) } } }),
   draft: await db.listingDraft.findUnique({ where: { id: id(n, "draft") } }), audit: await db.auditLog.findMany({ where: { actorId: id(n, "owner") } }),
   outbox: await db.measurementOutbox.findMany({ where: { principalId: id(n, "principal") } }) };
 }
 beforeAll(async () => {
  if (process.env["R7B_DISPOSABLE_DATABASE"] !== "round1-8c41fd9a") throw new Error("requires_task_owned_disposable_database");
  await seedSuiteCatalog(db, suite);
  await db.measurementState.create({ data: { key: "collector", epoch } });
  for (let n = 1; n <= 16; n++) {
   const owner = id(n, "owner");
   await db.user.create({ data: { id: owner, phone: suite.phone(`${n}-owner`), phoneVerifiedAt: now, role: "seller" } });
   await db.measurementPrincipal.create({ data: { id: id(n, "principal"), userId: owner, epoch, generation: id(n, "generation"), pseudonym: id(n, "pseudonym").replaceAll("-", "").repeat(2), kind: "account" } });
   for (const [k, photo] of photos(n).entries()) await db.mediaUpload.create({ data: { id: id(n, `upload-${k + 1}`), userId: owner, key: photo.key, kind: "image", contentType: "image/webp", sizeBytes: 1024, state: "AVAILABLE" } });
   await db.listingDraft.create({ data: { id: id(n, "draft"), userId: owner, payload: { ...suite.catalog, brandId: suite.catalog.brandId, modelId: suite.catalog.modelId, cityId: suite.catalog.cityId, regionId: suite.catalog.regionId, year: 2020, vin: "WVWZZZ1JZXW000001", priceAmount: 1000, priceCurrency: "TMT", contactPhone: suite.phone(`${n}-owner`), condition: "used", mileageKm: 1000, description: "Checked publication fixture", allowCalls: true, allowChat: true, conditionDisclosure: { damaged: false }, photos: photos(n) } } });
   if ([11, 12].includes(n)) {
    const draft = await db.listingDraft.findUniqueOrThrow({ where: { id: id(n, "draft") } });
    await db.listingDraft.create({ data: { id: id(n, "opponent-draft"), userId: owner, payload: draft.payload as Prisma.InputJsonValue } });
   }
   if ([2, 3, 4, 5].includes(n)) {
    const key = `video/v1/${id(n, "video-upload")}/${id(n, "video")}/source.mp4`;
    await db.mediaUpload.create({ data: { id: id(n, "video-upload"), userId: owner, key, kind: "video", contentType: "video/mp4", sizeBytes: 1024, writeProtocol: "video-v1", objectKeys: [key], state: "PREPARING", claimToken: id(n, "video"), claimTargetType: "video_session", claimTargetId: id(n, "video"), claimDeadline: new Date("2026-11-01T00:00:00Z") } });
    await db.videoUploadSession.create({ data: { id: id(n, "video"), uploadId: id(n, "video-upload"), userId: owner, sourceKey: key, protocolVersion: 1, targetKind: "draft", targetId: id(n, "draft"), targetRevision: 1, state: n === 3 ? "PROCESSING" : "READY", expiresAt: new Date(n === 4 ? "2026-10-24T00:00:00Z" : "2026-11-01T00:00:00Z"), cancelledAt: n === 5 ? now : null } });
    await db.videoGeneration.create({ data: { id: id(n, "video"), sessionId: id(n, "video"), uploadId: id(n, "video-upload"), listingId: id(n, "draft"), targetRevision: 1, state: n === 3 ? "PROCESSING" : "READY", ...(n === 3 ? {} : { readyAt: now, durationMs: 1000, posterKey: `video/v1/${id(n, "video-upload")}/${id(n, "video")}/poster.jpg`, manifest: { version: 1 } }) } });
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
   await identity?.module.close();
   for (const g of originalGuards) {
    const mode = ({ O: "ENABLE", D: "DISABLE", A: "ENABLE ALWAYS", R: "ENABLE REPLICA" } as const)[g.mode as "O" | "D" | "A" | "R"];
    if (!mode) throw new Error("unknown_trigger_mode");
    await db.$executeRawUnsafe(`ALTER TABLE public."${g.table}" ${mode} TRIGGER "${g.name}"`);
   }
   await db.$executeRawUnsafe('DROP TRIGGER IF EXISTS r7b_capture_fault ON measurement_outbox');
   await db.$executeRawUnsafe('DROP FUNCTION IF EXISTS public.r7b_capture_fault()');
  } finally { await Promise.all([db.$disconnect(), a.$disconnect(), b.$disconnect()]); }
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
   if (!publicationFirst) expect(state.draft?.payload).toMatchObject({ description: "concurrent edit" });
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
});
