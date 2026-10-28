import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { Session } from "node:inspector";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { CreateBucketCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { PrismaPg } from "@prisma/adapter-pg";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import sharp from "sharp";
import { GenericContainer, Wait } from "testcontainers";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { PrismaClient } from "../generated/prisma/client/client";
import { FakeObjectStore } from "../scripts/demo-inventory/application/testing/FakeObjectStore";
import { DEMO_CARS, DEMO_SELLERS } from "../scripts/demo-inventory/content";
import { DEMO_PHOTO_MANIFEST } from "../scripts/demo-inventory/manifest";
import { demoSellerId, demoSellerPhone } from "../scripts/demo-inventory/marker";
import { removeDemoInventory } from "../scripts/demo-inventory/remove";
import { seedDemoInventory } from "../scripts/demo-inventory/seed";
import { createS3ObjectStore } from "../scripts/demo-inventory/storage";
import { deleteMaintenanceListings, upsertMaintenanceListing } from "../scripts/maintenance-listings";
import { PrismaReviewerScenarioSeedStore } from "../scripts/reviewer-scenario-store";
import { accountSourceCommand } from "../src/account-source-command";
import { PrismaTesterAccountStore } from "../src/PrismaTesterAccountStore";
import { withDiagnosticSourceCommand } from "../src/diagnostic-source-command";
import { listingSourceCommand } from "../src/listing-source-command";
import { parseReviewerScenarioAccounts, reviewerScenarioSeedIds, runReviewerScenarioSeed } from "../src/reviewer-scenario-seed";
import { parseTesterAccounts, runTesterAccounts } from "../src/tester-accounts";

import { trackPoolClientEnds } from "./helpers/track-pool-client-ends";

const run = promisify(execFile);
const packageDir = fileURLToPath(new URL("..", import.meta.url));
const now = new Date("2026-10-26T00:00:00Z");
const testerJson = JSON.stringify([{ phone: "+99370000001", email: "r7g-tester@example.invalid", code: "123456" }]);
const reviewerJson = JSON.stringify([1, 2, 3].map(index => ({ phone: `+9936500000${index}`, email: `r7g-reviewer${index}@example.invalid`, code: "123456" })));
const reviewerOptions = { mode: "seed" as const, reviewDemoAccountsJson: reviewerJson, now,
  env: { appEnv: "staging", authorization: "seed-reviewer-scenario", signupsEnabled: "false", reviewDemoAccountEnabled: "true" } };
function must<T>(value: T | undefined): T { if (value === undefined) throw new Error("Missing fixture"); return value; }
function latch() { let release!: () => void; const promise = new Promise<void>(resolve => { release = resolve; }); return { promise, release }; }

/** Source-only checkpoint: run only in the parent's released interval. Each case
 * migrates a disposable database, sets up ordinary facts, then ENABLES every source
 * fence. No guard disable, seeded rights, fake receipt or internal-module mocks.
 * Most cases use the owning storage fake; the real MinIO case records actual bytes. */
describe("R7g maintenance callers on restricted PostgreSQL", () => {
  let container: StartedPostgreSqlContainer, control: Pool, observer: Pool, appPool: Pool;
  let owner: PrismaClient, db: PrismaClient, databaseName: string, appUrl: string;
  let drainOwner: (() => Promise<void>) | undefined, drainApp: (() => Promise<void>) | undefined;
  let sellerId: string, foreignId: string, listingId: string;
  type Guard = { table: string; name: string; mode: string };
  let guardSnapshot: Guard[] = [];
  const evidence: Record<string, unknown>[] = [];
  const inspector = new Session();
  const loaded: Promise<{ url: string; sha256: string }>[] = [];
  const sha256 = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");
  async function guards(): Promise<Guard[]> {
    return (await observer.query<Guard>(`SELECT c.relname AS table,t.tgname AS name,t.tgenabled AS mode
      FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND NOT t.tgisinternal ORDER BY c.relname,t.tgname`)).rows;
  }
  let create: Parameters<typeof upsertMaintenanceListing>[1]["create"];
  let storage: FakeObjectStore;
  const role = `r7g_${randomUUID().replaceAll("-", "")}`, password = randomUUID();

  beforeAll(async () => {
    // V8 supplies the code actually loaded, including Vite transformations. Disk
    // hashes below are separate source pins, never substitutes for loaded bytes.
    inspector.connect();
    inspector.on("Debugger.scriptParsed", ({ params }) => {
      if (!params.url.includes(packageDir) || params.url.includes("node_modules")) return;
      loaded.push(new Promise((resolve, reject) => {
        inspector.post("Debugger.getScriptSource", { scriptId: params.scriptId }, (error, result) => {
          if (error) reject(error); else resolve({ url: params.url, sha256: sha256(result.scriptSource) });
        });
      }));
    });
    await new Promise<void>((resolve, reject) => inspector.post("Debugger.enable", error => error ? reject(error) : resolve()));
    const migrations = readdirSync(`${packageDir}prisma/migrations`).sort().filter(name => name !== "migration_lock.toml")
      .map(name => ({ name, sha256: sha256(readFileSync(`${packageDir}prisma/migrations/${name}/migration.sql`)) }));
    expect(migrations).toHaveLength(98);
    expect(sha256(JSON.stringify(migrations))).toBe("7e6c3b98ddd2a75ef4751be9ff8fb0fbe5b3a7926f3a27eb91e50e3801e78046");
    evidence.push({ kind: "source", migrations, pins: ["tests/maintenance-finite.r7g.e2e.spec.ts", "scripts/maintenance-listings.ts", "scripts/demo-inventory/application/testing/FakeObjectStore.ts", "src/account-source-command.ts", "scripts/reviewer-scenario-store.ts", "scripts/promote-admin.ts", "scripts/ui-fixture.ts", "scripts/demo-inventory/seed.ts", "scripts/demo-inventory/remove.ts", "src/reviewer-scenario-seed.ts", "src/promote-admin.ts", "src/tester-accounts.ts", "src/PrismaTesterAccountStore.ts", "generated/prisma/client/client.ts", "dist/src/index.js", "../contracts/dist/index.js"]
      .map(path => ({ path, sha256: sha256(readFileSync(`${packageDir}${path}`)) })) });
    container = await new PostgreSqlContainer("postgres:17-alpine").start();
    evidence.push({ kind: "resource", containerId: container.getId(), role });
    control = new Pool({ connectionString: container.getConnectionUri() });
    await control.query(`CREATE ROLE "${role}" LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT`);
  });
  beforeEach(async () => {
    databaseName = `r7g_${randomUUID().replaceAll("-", "")}`;
    await control.query(`CREATE DATABASE "${databaseName}"`);
    const url = new URL(container.getConnectionUri()); url.pathname = `/${databaseName}`;
    await run(`${packageDir}node_modules/.bin/prisma`, ["migrate", "deploy"], { cwd: packageDir, env: { ...process.env, DATABASE_URL: url.toString() } });
    observer = new Pool({ connectionString: url.toString() });
    guardSnapshot = await guards();
    const applied = (await observer.query<{ name: string; sha256: string }>('SELECT migration_name AS name,checksum AS sha256 FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name')).rows;
    expect(applied).toHaveLength(98);
    expect(sha256(JSON.stringify(applied))).toBe("7e6c3b98ddd2a75ef4751be9ff8fb0fbe5b3a7926f3a27eb91e50e3801e78046");
    evidence.push({ kind: "database", databaseName, applied, guardSnapshot });
    drainOwner = trackPoolClientEnds(observer);
    owner = new PrismaClient({ adapter: new PrismaPg(observer) });
    await observer.query(`GRANT USAGE ON SCHEMA public TO "${role}"`);
    await observer.query(`GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO "${role}"`);
    await observer.query(`GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO "${role}"`);
    await observer.query(`GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO "${role}"`);
    url.username = role; url.password = password; url.searchParams.set("application_name", "maintenance_r7g"); appUrl = url.toString();
    appPool = new Pool({ connectionString: appUrl }); drainApp = trackPoolClientEnds(appPool); db = new PrismaClient({ adapter: new PrismaPg(appPool) });
    const emptyObjects = new Map([["demo-inventory/orphan.webp", Buffer.from("orphan")]]);
    const emptyStore = new FakeObjectStore({ "listing-photos": emptyObjects }, true);
    expect(await removeDemoInventory({ prisma: db, storage: emptyStore })).toMatchObject({ exitCode: 0, counts: { sellers: 0, objects: 0 } });
    expect([...emptyStore.snapshot().keys()]).toEqual(["demo-inventory/orphan.webp"]);
    const names = { nameEn: "R7g", nameRu: "R7g", nameTk: "R7g" };
    const brand = await owner.brand.create({ data: { slug: randomUUID(), ...names } });
    const model = await owner.model.create({ data: { slug: randomUUID(), brandId: brand.id, ...names } });
    const region = await owner.region.create({ data: { slug: randomUUID(), ...names } });
    const city = await owner.city.create({ data: { slug: randomUUID(), regionId: region.id, ...names } });
    sellerId = demoSellerId(0); foreignId = randomUUID(); listingId = randomUUID();
    await owner.user.create({ data: { id: sellerId, phone: demoSellerPhone(sellerId), phoneVerifiedAt: now, role: "seller", displayName: must(DEMO_SELLERS[0]).displayName } });
    await owner.user.create({ data: { id: foreignId, email: "foreign@example.invalid", emailVerifiedAt: now } });
    const reviewer = must(parseReviewerScenarioAccounts(reviewerJson)[2]);
    await owner.user.create({ data: { ...reviewer, phoneVerifiedAt: now, emailVerifiedAt: now } });
    const tester = must(parseTesterAccounts(testerJson, "[]")[0]);
    await owner.user.create({ data: { ...tester, phoneVerifiedAt: now, emailVerifiedAt: now } });
    // UI replacement plan exists, but no destructive work is needed to detect it.
    await owner.user.create({ data: { id: "f1000000-0000-4000-8000-000000000010" } });
    create = { id: listingId, sellerId, brandId: brand.id, modelId: model.id, cityId: city.id, regionId: region.id, year: 2020, priceAmount: 100, status: "active", damaged: false };
    await owner.listing.create({ data: create });
    await owner.favorite.create({ data: { userId: foreignId, listingId } });
    await owner.listingMedia.create({ data: { listingId, kind: "image", key: "demo-inventory/retained/original.webp", sortOrder: 0 } });
    const conversation = await owner.conversation.create({ data: { listingId, sellerId, buyerId: foreignId } });
    await owner.conversationParticipant.create({ data: { conversationId: conversation.id, userId: foreignId } });
    await owner.message.create({ data: { conversationId: conversation.id, senderId: foreignId, kind: "text", body: "Retain on refusal" } });
    await owner.inspectionInterest.create({ data: { listingId, requesterUserId: foreignId, side: "buyer" } });
    await owner.contentReport.create({ data: { reporterUserId: foreignId, targetType: "listing", targetId: listingId, reason: "misleading" } });
    await owner.session.create({ data: { userId: tester.id, refreshTokenHash: randomUUID(), expiresAt: new Date("2027-01-01") } });
    const center = await owner.diagnosticCenter.create({ data: { code: randomUUID(), names: {} } });
    const template = await owner.diagnosticTemplateVersion.create({ data: { centerId: center.id, version: 1, definition: {} } });
    await owner.inspectionOrder.create({ data: { centerId: center.id, templateVersionId: template.id, commissionerId: foreignId, requestKey: randomUUID(), audience: "buyer_private", listingId } });
    storage = new FakeObjectStore({ "listing-photos": new Map([
      ["demo-inventory/retained/original.webp", Buffer.from("retained")], ["foreign/original.webp", Buffer.from("foreign")],
    ]), "chat-attachments": new Map([["foreign/chat", Buffer.from("foreign chat")]]) });
    const triggers = await observer.query<{ table: string; name: string }>(`SELECT c.relname AS table,t.tgname AS name FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND (t.tgname LIKE 'zz_diagnostic_source_%' OR t.tgname LIKE 'zzzz_campaign_preparation%' OR t.tgname='diagnostic_source_no_truncate')`);
    for (const trigger of triggers.rows) await observer.query(`ALTER TABLE public."${trigger.table}" ENABLE TRIGGER "${trigger.name}"`);
    expect((await observer.query("SELECT diagnostic_source_guards_ready() AS ready")).rows).toEqual([{ ready: true }]);
    expect((await appPool.query("SELECT rolsuper,rolcreatedb,rolcreaterole FROM pg_roles WHERE rolname=current_user")).rows).toEqual([{ rolsuper: false, rolcreatedb: false, rolcreaterole: false }]);
  });
  afterEach(async () => {
    if (observer && guardSnapshot.length > 0) {
      expect((await observer.query("SELECT count(*)::int AS count FROM diagnostic_source_commands")).rows).toEqual([{ count: 0 }]);
      for (const guard of guardSnapshot) {
        const mode = ({ O: "ENABLE", D: "DISABLE", R: "ENABLE REPLICA", A: "ENABLE ALWAYS" } as Record<string, string>)[guard.mode];
        if (!mode) throw new Error("Unknown original trigger mode");
        await observer.query(`ALTER TABLE public."${guard.table}" ${mode} TRIGGER "${guard.name}"`);
      }
      expect(await guards()).toEqual(guardSnapshot);
      evidence.push({ kind: "cleanup", databaseName, receipts: 0, guardsRestored: true });
      guardSnapshot = [];
    }
    await db?.$disconnect(); await appPool?.end(); await drainApp?.();
    await owner?.$disconnect(); await observer?.end(); await drainOwner?.();
    if (databaseName) {
      await control.query(`DROP DATABASE "${databaseName}"`);
      expect((await control.query("SELECT count(*)::int AS count FROM pg_database WHERE datname=$1", [databaseName])).rows).toEqual([{ count: 0 }]);
      evidence.push({ kind: "databaseRemoved", databaseName });
    }
  });
  afterAll(async () => {
    try {
      await control?.query(`DROP ROLE "${role}"`);
      if (control) expect((await control.query("SELECT count(*)::int AS count FROM pg_roles WHERE rolname=$1", [role])).rows).toEqual([{ count: 0 }]);
      evidence.push({ kind: "roleRemoved", role });
    }
    finally {
      await control?.end(); await container?.stop();
      evidence.push({ kind: "containerStopped", containerId: container?.getId() });
      const scripts = await Promise.all(loaded);
      inspector.disconnect();
      writeFileSync("/tmp/897-r7g-restricted-loaded-evidence.json", JSON.stringify({ evidence, loaded: scripts }, null, 2));
    }
  });

  async function snapshot() {
    const result: Record<string, unknown> = {};
    const tables = await observer.query<{ tablename: string }>("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename");
    for (const { tablename } of tables.rows) {
      result[tablename] = must((await observer.query<{ rows: unknown }>(`SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]') AS rows FROM public."${tablename.replaceAll('"', '""')}" t`)).rows[0]).rows;
    }
    return { rows: result, objects: [...storage.snapshot()].map(([key, bytes]) => [key, bytes.toString("hex")]),
      chatObjects: [...storage.snapshot("chat-attachments")].map(([key, bytes]) => [key, bytes.toString("hex")]) };
  }
  async function command(script: string, args: string[], env: Record<string, string> = {}) {
    try {
      const output = await run(process.execPath, ["--import", "tsx", script, ...args], { cwd: packageDir, env: { ...process.env, DATABASE_URL: appUrl, ...env } });
      return { code: 0, output: output.stdout + output.stderr };
    } catch (error) {
      const failure = error as { code: number; stdout: string; stderr: string };
      return { code: failure.code, output: failure.stdout + failure.stderr };
    }
  }

  it("supports finite Listing create/change/hard-delete, preserving foreign rows and ordinary scalar/media effects", async () => {
    const id = randomUUID();
    await upsertMaintenanceListing(db, { create: { ...create, id }, update: {} });
    await upsertMaintenanceListing(db, { create, update: { year: 2021, priceAmount: 222, description: "refreshed" } });
    expect(await db.listing.findUniqueOrThrow({ where: { id: listingId } })).toMatchObject({ year: 2021, priceAmount: 222, description: "refreshed" });
    const foreign = await db.user.findUniqueOrThrow({ where: { id: foreignId } });
    const report = await db.contentReport.findMany();
    await deleteMaintenanceListings(db, { id: listingId });
    expect(await db.listing.findUnique({ where: { id: listingId } })).toBeNull();
    expect(await db.favorite.count()).toBe(0); expect(await db.conversation.count()).toBe(0);
    expect(await db.message.count()).toBe(0); expect(await db.inspectionInterest.count()).toBe(0);
    expect(await db.inspectionOrder.findMany()).toMatchObject([{ listingId: null, commissionerId: foreignId }]);
    expect(await db.user.findUniqueOrThrow({ where: { id: foreignId } })).toEqual(foreign);
    expect(await db.contentReport.findMany()).toEqual(report);
    expect(await db.listing.findUnique({ where: { id } })).not.toBeNull();
  });

  it.each(["revoke", "seed"] as const)("reviewer %s refuses the whole unsupported account plan with complete graph/object equality", async mode => {
    const before = await snapshot();
    expect(await runReviewerScenarioSeed(new PrismaReviewerScenarioSeedStore(db), {
      ...reviewerOptions, mode, env: { ...reviewerOptions.env, authorization: "wrong" },
    })).toMatchObject({ exitCode: 1, message: expect.stringContaining("AUTHORIZATION") });
    expect(await snapshot()).toEqual(before);
    const result = await runReviewerScenarioSeed(new PrismaReviewerScenarioSeedStore(db), {
      ...reviewerOptions, mode,
      reviewDemoAccountsJson: mode === "seed" ? reviewerJson.replace("r7g-reviewer3", "rotated-reviewer3") : reviewerJson,
    });
    expect(result).toMatchObject({ exitCode: 1, message: expect.stringContaining("unsupported") });
    expect(await snapshot()).toEqual(before);
  });

  it.each(["foreign seller", "business inventory"])("reviewer %s at a fixed Listing ID refuses before every effect", async association => {
    const id = reviewerScenarioSeedIds.primaryListingId;
    const seller = must(parseReviewerScenarioAccounts(reviewerJson)[1]);
    let businessId: string | null = null;
    if (association === "business inventory") {
      await new PrismaReviewerScenarioSeedStore(db).upsertUser(seller);
      businessId = (await db.dealership.create({ data: { slug: randomUUID(), name: "Foreign business" } })).id;
    }
    await upsertMaintenanceListing(db, { create: { ...create, id, sellerId: businessId ? seller.id : foreignId, businessId } });
    const before = await snapshot();
    expect(await runReviewerScenarioSeed(new PrismaReviewerScenarioSeedStore(db), reviewerOptions))
      .toMatchObject({ exitCode: 1, message: expect.stringContaining("Listing association") });
    expect(await snapshot()).toEqual(before);
    // The database adapter also refuses direct use, before changing a foreign owner.
    await expect(new PrismaReviewerScenarioSeedStore(db).upsertListing({ id,
      sellerId: must(parseReviewerScenarioAccounts(reviewerJson)[1]).id, contactPhone: "+99365000002",
      priceAmount: 1, description: "must not commit", publishedAt: now, damaged: false, knownIssuesText: null,
    })).rejects.toThrow("Listing association");
    expect(await snapshot()).toEqual(before);
  });

  it.each(["brand slug", "brand ID", "model slug", "model ID", "region slug", "city slug"])(
    "foreign reviewer %s collision refuses before all effects", async collision => {
      const ids = reviewerScenarioSeedIds;
      const names = { nameEn: "Foreign", nameRu: "Foreign", nameTk: "Foreign" };
      if (collision === "brand slug" || collision === "brand ID") {
        await db.brand.create({ data: { ...names, id: collision === "brand ID" ? ids.brandId : randomUUID(),
          slug: collision === "brand slug" ? "autotm-reviewer" : "foreign-brand" } });
      } else if (collision.startsWith("model")) {
        await db.brand.create({ data: { ...names, id: ids.brandId, slug: "autotm-reviewer" } });
        await db.model.create({ data: { ...names, id: collision === "model ID" ? ids.modelId : randomUUID(),
          brandId: ids.brandId, slug: collision === "model slug" ? "review-scenario" : "foreign-model" } });
      } else if (collision === "region slug") {
        await db.region.create({ data: { ...names, slug: "reviewer-region" } });
      } else {
        await db.region.create({ data: { ...names, id: ids.regionId, slug: "reviewer-region" } });
        await db.city.create({ data: { ...names, regionId: ids.regionId, slug: "reviewer-city" } });
      }
      const before = await snapshot();
      expect(await runReviewerScenarioSeed(new PrismaReviewerScenarioSeedStore(db), reviewerOptions))
        .toMatchObject({ exitCode: 1, message: expect.stringContaining("catalog association") });
      expect(await snapshot()).toEqual(before);
    },
  );

  it("schedules a whole no-Session tester list once and archives only its personal inventory", async () => {
    const entries = [
      { phone: "+99370000011", email: "schedule11@example.invalid", code: "123456" },
      { phone: "+99370000012", email: "schedule12@example.invalid", code: "123456" },
      { phone: "+99370000013", email: "schedule13@example.invalid", code: "123456" },
    ];
    const input = { testerAccountsJson: JSON.stringify(entries), reviewerAccountsJson: "[]", now };
    const store = new PrismaTesterAccountStore(db);
    expect(await runTesterAccounts(store, { ...input, mode: "seed" })).toMatchObject({ created: 3 });
    const targets = parseTesterAccounts(input.testerAccountsJson, "[]");
    const earlier = new Date("2026-10-25T00:00:00Z"), later = new Date("2026-10-28T00:00:00Z");
    // Establish schedules through the accepted operation, never naked protected DML.
    for (const [index, date] of [[1, earlier], [2, later]] as const) {
      await db.$transaction(async tx => {
        const plan = await accountSourceCommand(tx, { operation: "account_schedule", userId: must(targets[index]).id, deletionScheduledAt: date });
        await withDiagnosticSourceCommand(tx, plan.command, () => tx.user.update({ where: { id: must(targets[index]).id }, data: { deletionScheduledAt: date } }));
      });
    }
    const personalId = randomUUID();
    await upsertMaintenanceListing(db, { create: { ...create, id: personalId, sellerId: must(targets[0]).id } });
    const foreignBefore = await db.user.findUniqueOrThrow({ where: { id: foreignId } });
    expect(await runTesterAccounts(store, { ...input, mode: "remove" }))
      .toEqual({ created: 0, scheduled: 2, sessionsDeleted: 0, listingsArchived: 1 });
    expect(await db.user.findUniqueOrThrow({ where: { id: must(targets[0]).id } })).toMatchObject({ deletionScheduledAt: now });
    expect(await db.user.findUniqueOrThrow({ where: { id: must(targets[1]).id } })).toMatchObject({ deletionScheduledAt: earlier });
    expect(await db.user.findUniqueOrThrow({ where: { id: must(targets[2]).id } })).toMatchObject({ deletionScheduledAt: now });
    expect(await db.listing.findUniqueOrThrow({ where: { id: personalId } })).toMatchObject({ status: "archived", archivedByDeletion: true });
    expect(await db.user.findUniqueOrThrow({ where: { id: foreignId } })).toEqual(foreignBefore);
    const after = await snapshot();
    expect(await runTesterAccounts(store, { ...input, mode: "remove" }))
      .toEqual({ created: 0, scheduled: 0, sessionsDeleted: 0, listingsArchived: 0 });
    expect(await snapshot()).toEqual(after);
  });

  it("a Session on the last tester refuses the whole list before scheduling the first", async () => {
    const input = { testerAccountsJson: JSON.stringify([
      { phone: "+99370000021", email: "schedule21@example.invalid", code: "123456" },
      { phone: "+99370000001", email: "r7g-tester@example.invalid", code: "123456" },
    ]), reviewerAccountsJson: "[]", now };
    const store = new PrismaTesterAccountStore(db);
    await runTesterAccounts(store, { ...input, mode: "seed" });
    const before = await snapshot();
    await expect(runTesterAccounts(store, { ...input, mode: "remove" })).rejects.toThrow("unsupported atomic");
    expect(await snapshot()).toEqual(before);
  });

  it.each(["business inventory", "collector baseline"])("tester %s refuses before any account effect", async extra => {
    const input = { mode: "seed" as const, testerAccountsJson: JSON.stringify([
      { phone: "+99370000031", email: "schedule31@example.invalid", code: "123456" },
    ]), reviewerAccountsJson: "[]", now };
    const store = new PrismaTesterAccountStore(db);
    await runTesterAccounts(store, input);
    const target = must(parseTesterAccounts(input.testerAccountsJson, "[]")[0]);
    if (extra === "business inventory") {
      const business = await db.dealership.create({ data: { slug: randomUUID(), name: "Foreign business" } });
      await upsertMaintenanceListing(db, { create: { ...create, id: randomUUID(), sellerId: target.id, businessId: business.id } });
    } else {
      await db.measurementState.create({ data: { key: "collector", epoch: "r7g" } });
      await db.measurementState.create({ data: { key: "inventory_baseline:r7g", epoch: "r7g" } });
    }
    const before = await snapshot();
    await expect(runTesterAccounts(store, { ...input, mode: "remove" })).rejects.toThrow("unsupported");
    expect(await snapshot()).toEqual(before);
  });

  it("an unchanged schedule gives no permission to archive newly active personal inventory", async () => {
    const input = { mode: "seed" as const, testerAccountsJson: JSON.stringify([
      { phone: "+99370000061", email: "schedule61@example.invalid", code: "123456" },
    ]), reviewerAccountsJson: "[]", now };
    const store = new PrismaTesterAccountStore(db);
    await runTesterAccounts(store, input);
    const target = must(parseTesterAccounts(input.testerAccountsJson, "[]")[0]);
    expect(await runTesterAccounts(store, { ...input, mode: "remove" })).toMatchObject({ scheduled: 1 });
    await upsertMaintenanceListing(db, { create: { ...create, id: randomUUID(), sellerId: target.id } });
    const before = await snapshot();
    await expect(runTesterAccounts(store, { ...input, mode: "remove" })).rejects.toThrow("unsupported atomic");
    expect(await snapshot()).toEqual(before);
  });

  it("a personal archive error rolls back every tester schedule and its finite receipt", async () => {
    const input = { mode: "seed" as const, testerAccountsJson: JSON.stringify([
      { phone: "+99370000041", email: "schedule41@example.invalid", code: "123456" },
      { phone: "+99370000042", email: "schedule42@example.invalid", code: "123456" },
    ]), reviewerAccountsJson: "[]", now };
    const store = new PrismaTesterAccountStore(db);
    await runTesterAccounts(store, input);
    const target = must(parseTesterAccounts(input.testerAccountsJson, "[]")[1]);
    await upsertMaintenanceListing(db, { create: { ...create, id: randomUUID(), sellerId: target.id } });
    const before = await snapshot();
    // Database-boundary fault after User scheduling, before the archive completes.
    await observer.query(`CREATE FUNCTION public.r7g_refuse_archive() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'r7g_archive_fault'; END $$`);
    await observer.query(`CREATE TRIGGER r7g_archive_fault BEFORE UPDATE OF status ON listings
      FOR EACH ROW EXECUTE FUNCTION public.r7g_refuse_archive()`);
    try {
      await expect(runTesterAccounts(store, { ...input, mode: "remove" })).rejects.toThrow("r7g_archive_fault");
      expect(await snapshot()).toEqual(before);
    } finally {
      await observer.query("DROP TRIGGER r7g_archive_fault ON listings");
      await observer.query("DROP FUNCTION public.r7g_refuse_archive()");
    }
  });

  it("an opposing account schedule makes removal stale without any partial schedule", async () => {
    const input = { mode: "seed" as const, testerAccountsJson: JSON.stringify([
      { phone: "+99370000051", email: "schedule51@example.invalid", code: "123456" },
      { phone: "+99370000052", email: "schedule52@example.invalid", code: "123456" },
    ]), reviewerAccountsJson: "[]", now };
    const store = new PrismaTesterAccountStore(db);
    await runTesterAccounts(store, input);
    const targets = parseTesterAccounts(input.testerAccountsJson, "[]");
    const target = must(targets[1]), held = latch(), release = latch();
    const earlier = new Date("2026-10-25T00:00:00Z");
    const blocker = owner.$transaction(async tx => {
      const plan = await accountSourceCommand(tx, { operation: "account_schedule", userId: target.id, deletionScheduledAt: earlier });
      await withDiagnosticSourceCommand(tx, plan.command, async () => {
        await tx.user.update({ where: { id: target.id }, data: { deletionScheduledAt: earlier } });
        held.release(); await release.promise;
      });
    });
    let waiting: Promise<unknown> | undefined;
    try {
      await Promise.race([held.promise, blocker]);
      waiting = runTesterAccounts(store, { ...input, mode: "remove" });
      const outcome = waiting.then(() => "unexpected success", error => String(error));
      const deadline = Date.now() + 3000;
      let blocked = false;
      while (Date.now() < deadline) {
        blocked = must((await observer.query<{ blocked: boolean }>("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND application_name='maintenance_r7g' AND cardinality(pg_blocking_pids(pid))>0) AS blocked")).rows[0]).blocked;
        if (blocked) break;
      }
      expect(blocked).toBe(true);
      release.release(); await blocker;
      expect(await outcome).toContain("diagnostic_source");
      expect(await db.user.findUniqueOrThrow({ where: { id: target.id } })).toMatchObject({ deletionScheduledAt: earlier });
      expect(await db.user.findUniqueOrThrow({ where: { id: must(targets[0]).id } })).toMatchObject({ deletionScheduledAt: null });
    } finally { release.release(); await Promise.allSettled([blocker, ...(waiting ? [waiting] : [])]); }
  });

  it("a reviewer refresh cannot overwrite an owner changed while finite preparation waits", async () => {
    const reviewer = new PrismaReviewerScenarioSeedStore(db), seller = must(parseReviewerScenarioAccounts(reviewerJson)[1]);
    await reviewer.upsertUser(seller);
    const id = reviewerScenarioSeedIds.primaryListingId;
    await upsertMaintenanceListing(db, { create: { ...create, id, sellerId: seller.id } });
    const held = latch(), release = latch();
    const blocker = owner.$transaction(async tx => {
      const plan = await listingSourceCommand(tx, { operation: "listing_change", listingId: id,
        actorUserId: seller.id, roots: [], changes: { sellerId: foreignId } });
      await withDiagnosticSourceCommand(tx, plan, async () => {
        await tx.listing.update({ where: { id }, data: { sellerId: foreignId } });
        held.release(); await release.promise;
      });
    });
    let waiting: Promise<unknown> | undefined;
    try {
      await Promise.race([held.promise, blocker]);
      waiting = reviewer.upsertListing({ id, sellerId: seller.id, contactPhone: seller.phone,
        priceAmount: 1, description: "must not commit", publishedAt: now, damaged: false, knownIssuesText: null });
      const outcome = waiting.then(() => "unexpected success", error => String(error));
      const deadline = Date.now() + 3000;
      let blocked = false;
      while (Date.now() < deadline) {
        blocked = must((await observer.query<{ blocked: boolean }>("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND application_name='maintenance_r7g' AND cardinality(pg_blocking_pids(pid))>0) AS blocked")).rows[0]).blocked;
        if (blocked) break;
      }
      expect(blocked).toBe(true);
      release.release(); await blocker;
      expect(await outcome).toContain("diagnostic_source");
      expect(await db.listing.findUniqueOrThrow({ where: { id } })).toMatchObject({ sellerId: foreignId, priceAmount: 100, description: null });
    } finally { release.release(); await Promise.allSettled([blocker, ...(waiting ? [waiting] : [])]); }
  });

  it("tester complete removal refuses before DML and ordinary absent seed remains available", async () => {
    const store = new PrismaTesterAccountStore(db);
    const before = await snapshot();
    await expect(runTesterAccounts(store, { mode: "remove", testerAccountsJson: testerJson, reviewerAccountsJson: "[]", now })).rejects.toThrow("unsupported atomic");
    expect(await snapshot()).toEqual(before);
    expect(await runTesterAccounts(store, { mode: "seed", testerAccountsJson: testerJson.replace("70000001", "70000002").replace("r7g-tester", "new-tester"), reviewerAccountsJson: "[]", now })).toMatchObject({ created: 1 });
  });

  it("demo Listing-only convergence remains supported when no User deletion or rotation is planned", async () => {
    const users = await db.user.findMany({ orderBy: { id: "asc" } });
    expect(await seedDemoInventory({ prisma: db, storage, photos: { load: async () => { throw new Error("unexpected photo read"); } }, now,
      sellers: [must(DEMO_SELLERS[0])], cars: [], manifest: { ...DEMO_PHOTO_MANIFEST, listings: {} } })).toMatchObject({ exitCode: 0 });
    expect(await db.user.findMany({ orderBy: { id: "asc" } })).toEqual(users);
    expect(await db.listing.findUnique({ where: { id: listingId } })).toBeNull();
    expect(storage.snapshot().has("foreign/original.webp")).toBe(true);
  });

  it("demo remove and stale-seller seed refuse before row or object effects", async () => {
    const before = await snapshot();
    expect(await removeDemoInventory({ prisma: db, storage })).toMatchObject({ exitCode: 1, message: expect.stringContaining("unsupported physical User DELETE") });
    expect(await snapshot()).toEqual(before);
    const cars = DEMO_CARS.filter(car => car.sellerKey !== must(DEMO_SELLERS[0]).key);
    expect(await seedDemoInventory({ prisma: db, storage, photos: { load: async () => { throw new Error("unexpected photo read"); } }, now,
      sellers: DEMO_SELLERS.slice(1), cars, manifest: { ...DEMO_PHOTO_MANIFEST, listings: Object.fromEntries(cars.map(car => [car.slug, must(DEMO_PHOTO_MANIFEST.listings[car.slug])])) } })).toMatchObject({ exitCode: 1, message: expect.stringContaining("unsupported physical User DELETE") });
    expect(await snapshot()).toEqual(before);
  });

  it("equal reviewer source and tester empty removal are read-only, while a missing ordinary reviewer can be created", async () => {
    const store = new PrismaReviewerScenarioSeedStore(db);
    const accounts = parseReviewerScenarioAccounts(reviewerJson);
    const before = await snapshot();
    expect(await store.upsertUser(must(accounts[2]))).toMatchObject({ id: must(accounts[2]).id });
    expect(await runTesterAccounts(new PrismaTesterAccountStore(db), { mode: "remove", testerAccountsJson: "[]", reviewerAccountsJson: "[]", now }))
      .toEqual({ created: 0, scheduled: 0, sessionsDeleted: 0, listingsArchived: 0 });
    expect(await snapshot()).toEqual(before);
    expect(await store.upsertUser(must(accounts[0]))).toMatchObject({ id: must(accounts[0]).id, role: "buyer" });
  });

  it("the real UI fixture refuses replacement before Listing/catalog/media/object mutation", async () => {
    const before = await snapshot();
    expect(await command("scripts/ui-fixture.ts", [], { MINIO_ENDPOINT: "http://127.0.0.1:9000" }))
      .toMatchObject({ code: 1, output: expect.stringContaining("unsupported physical User DELETE") });
    expect(await snapshot()).toEqual(before);
  });

  it("real promote-admin command preserves exact lookup/dry-run and refuses role/audit DML", async () => {
    const before = await snapshot();
    expect(await command("scripts/promote-admin.ts", ["--email", "foreign@example.invalid", "--reason", "finite maintenance"])).toMatchObject({ code: 1, output: expect.stringContaining("unsupported User.role promotion") });
    expect(await command("scripts/promote-admin.ts", ["--email", "foreign@example.invalid", "--reason", "finite maintenance", "--dry-run"])).toMatchObject({ code: 0, output: expect.stringContaining("dry-run") });
    expect(await snapshot()).toEqual(before);
  });

  it("supported reviewer and demo seed converge with real MinIO bytes, then unsupported plans preserve them", async () => {
    const minio = await new GenericContainer("cgr.dev/chainguard/minio@sha256:4692462f35d97d7e82c30371d82f057703c5d9489bcae726010594c812f2d285")
      .withEnvironment({ MINIO_ROOT_USER: "minioadmin", MINIO_ROOT_PASSWORD: "minioadmin" })
      .withCommand(["server", "/data"]).withExposedPorts(9000)
      .withWaitStrategy(Wait.forHttp("/minio/health/live", 9000)).start();
    const endpoint = `http://${minio.getHost()}:${minio.getMappedPort(9000)}`;
    const realStore = createS3ObjectStore({ endpoint, region: "us-east-1", accessKeyId: "minioadmin", secretAccessKey: "minioadmin" });
    const s3 = new S3Client({ endpoint, region: "us-east-1", forcePathStyle: true, credentials: { accessKeyId: "minioadmin", secretAccessKey: "minioadmin" } });
    const originalEnv = Object.fromEntries(["MINIO_ENDPOINT", "MINIO_ACCESS_KEY", "MINIO_SECRET_KEY"].map(key => [key, process.env[key]]));
    async function bytes() {
      const result = [];
      for (const key of (await realStore.list("")).sort()) {
        const object = await s3.send(new GetObjectCommand({ Bucket: "listing-photos", Key: key }));
        if (!object.Body) throw new Error("Missing object body");
        result.push({ key, sha256: sha256(Buffer.from(await object.Body.transformToByteArray())) });
      }
      return result;
    }
    try {
      await s3.send(new CreateBucketCommand({ Bucket: "listing-photos" }));
      await s3.send(new PutObjectCommand({ Bucket: "listing-photos", Key: "foreign/original.webp", Body: "foreign bytes" }));
      process.env["MINIO_ENDPOINT"] = endpoint; process.env["MINIO_ACCESS_KEY"] = "minioadmin"; process.env["MINIO_SECRET_KEY"] = "minioadmin";
      const foreign = await db.user.findUniqueOrThrow({ where: { id: foreignId } });
      const reviewer = new PrismaReviewerScenarioSeedStore(db);
      expect(await runReviewerScenarioSeed(reviewer, reviewerOptions)).toMatchObject({ exitCode: 0 });
      const users = await db.user.findMany({ orderBy: { id: "asc" } });
      const photoBytes = await bytes();
      expect(photoBytes).toHaveLength(31);
      expect(await runReviewerScenarioSeed(reviewer, reviewerOptions)).toMatchObject({ exitCode: 0 });
      expect(await db.user.findMany({ orderBy: { id: "asc" } })).toEqual(users);
      expect(await bytes()).toEqual(photoBytes);
      const reviewerAccount = must(parseReviewerScenarioAccounts(reviewerJson)[1]);
      const reviewerBefore = await db.user.findUniqueOrThrow({ where: { id: reviewerAccount.id } });
      await db.user.update({ where: { id: reviewerAccount.id }, data: { displayName: "Presentation drift" } });
      expect(await runReviewerScenarioSeed(reviewer, reviewerOptions)).toMatchObject({ exitCode: 0 });
      const reviewerAfter = await db.user.findUniqueOrThrow({ where: { id: reviewerAccount.id } });
      expect({ ...reviewerAfter, updatedAt: reviewerBefore.updatedAt }).toEqual(reviewerBefore);
      expect(await bytes()).toEqual(photoBytes);
      // Resolve one real content/manifest entry against task-owned ordinary catalog rows.
      const brand = await db.brand.findUniqueOrThrow({ where: { id: create.brandId } });
      const model = await db.model.findUniqueOrThrow({ where: { id: create.modelId } });
      const city = await db.city.findUniqueOrThrow({ where: { id: create.cityId } });
      if (!city.regionId) throw new Error("Missing region");
      const region = await db.region.findUniqueOrThrow({ where: { id: city.regionId } });
      const names = { nameEn: "R7g media", nameRu: "R7g media", nameTk: "R7g media" };
      await db.color.create({ data: names }); await db.bodyType.create({ data: names });
      await db.engineType.create({ data: names }); await db.transmission.create({ data: names }); await db.driveType.create({ data: names });
      const car = { ...must(DEMO_CARS[0]), sellerKey: must(DEMO_SELLERS[0]).key, brandSlug: brand.slug, modelSlug: model.slug,
        citySlug: city.slug, regionSlug: region.slug, colorEn: names.nameEn, bodyTypeEn: names.nameEn, engineTypeEn: names.nameEn,
        transmissionEn: names.nameEn, driveTypeEn: names.nameEn, priceCurrency: "TMT" as const };
      const entry = must(DEMO_PHOTO_MANIFEST.listings[car.slug]);
      const photo = readFileSync(`${packageDir}scripts/reviewer-fixtures/camry-1.jpg`);
      const input = { prisma: db, storage: realStore, photos: { load: async () => photo }, now, sellers: [must(DEMO_SELLERS[0])], cars: [car], manifest: { ...DEMO_PHOTO_MANIFEST, listings: { [car.slug]: entry } } };
      expect(await seedDemoInventory(input)).toMatchObject({ exitCode: 0 });
      const demoBefore = await bytes();
      expect(await seedDemoInventory(input)).toMatchObject({ exitCode: 0 });
      expect(await bytes()).toEqual(demoBefore);
      const demoSeller = must(DEMO_SELLERS[0]);
      const demoUserBefore = await db.user.findUniqueOrThrow({ where: { id: demoSeller.id } });
      await db.user.update({ where: { id: demoSeller.id }, data: { displayName: "Presentation drift" } });
      expect(await seedDemoInventory(input)).toMatchObject({ exitCode: 0 });
      const demoUserAfter = await db.user.findUniqueOrThrow({ where: { id: demoSeller.id } });
      expect({ ...demoUserAfter, updatedAt: demoUserBefore.updatedAt }).toEqual(demoUserBefore);
      expect(await bytes()).toEqual(demoBefore);
      const media = await db.listingMedia.findFirstOrThrow({ where: { key: { startsWith: "demo-inventory/" } } });
      const object = await s3.send(new GetObjectCommand({ Bucket: "listing-photos", Key: media.key }));
      if (!object.Body) throw new Error("Missing demo photo");
      const meta = await sharp(Buffer.from(await object.Body.transformToByteArray())).metadata();
      expect(meta.format).toBe("webp"); expect(meta.exif).toBeUndefined(); expect(meta.xmp).toBeUndefined(); expect(meta.iptc).toBeUndefined();
      expect({ width: meta.width, height: meta.height }).toEqual({ width: media.width, height: media.height });
      const before = await snapshot(), objectsBefore = await bytes();
      expect(await removeDemoInventory({ prisma: db, storage: realStore })).toMatchObject({ exitCode: 1, message: expect.stringContaining("unsupported") });
      expect(await runReviewerScenarioSeed(reviewer, { ...reviewerOptions, mode: "revoke" })).toMatchObject({ exitCode: 1, message: expect.stringContaining("unsupported") });
      expect(await snapshot()).toEqual(before); expect(await bytes()).toEqual(objectsBefore);
      expect(await db.user.findUniqueOrThrow({ where: { id: foreignId } })).toEqual(foreign);
      evidence.push({ kind: "minio", objects: objectsBefore, metadata: { width: meta.width, height: meta.height, format: meta.format } });
    } finally {
      for (const [key, value] of Object.entries(originalEnv)) { if (value === undefined) Reflect.deleteProperty(process.env, key); else process.env[key] = value; }
      s3.destroy(); realStore.close(); await minio.stop();
      evidence.push({ kind: "minioStopped", containerId: minio.getId() });
    }
  });

  it("naked protected writes and ordinary User insertion into a contended destination fail without partial effects", async () => {
    const before = await snapshot();
    await expect(db.listing.create({ data: { ...create, id: randomUUID() } })).rejects.toThrow();
    await expect(db.user.update({ where: { id: foreignId }, data: { role: "admin" } })).rejects.toThrow();
    const reservation = await appPool.connect();
    try {
      await reservation.query("BEGIN");
      await reservation.query(`SELECT pg_advisory_xact_lock(897100,hashtext(jsonb_build_array('unique',jsonb_build_array('email'),jsonb_build_object('email',$1::text))::text))`, ["contended@example.invalid"]);
      await expect(db.user.create({ data: { email: "contended@example.invalid" } })).rejects.toThrow("diagnostic_source_user_insert_busy");
    } finally { await reservation.query("ROLLBACK"); reservation.release(); }
    expect(await snapshot()).toEqual(before);
  });

  it("a failed finite Listing write rolls back its receipt and full graph", async () => {
    const before = await snapshot();
    await expect(upsertMaintenanceListing(db, { create, update: { year: 2022, cityId: randomUUID() } })).rejects.toThrow();
    expect(await snapshot()).toEqual(before);
  });

  it("an opposing prepared source change makes the waiting caller stale without applying its scalar patch", async () => {
    const held = latch(), release = latch();
    const blocker = owner.$transaction(async tx => {
      await withDiagnosticSourceCommand(tx, await listingSourceCommand(tx, { operation: "listing_change", listingId, actorUserId: sellerId, roots: [], changes: { year: 2022 } }), async () => {
        await tx.listing.update({ where: { id: listingId }, data: { year: 2022 } });
        held.release(); await release.promise;
      });
    });
    let waiting: Promise<unknown> | undefined;
    try {
      await Promise.race([held.promise, blocker]);
      waiting = upsertMaintenanceListing(db, { create, update: { year: 2023, description: "must not commit" } });
      const outcome = waiting.then(() => "unexpected success", error => String(error));
      const deadline = Date.now() + 3000;
      let blocked = false;
      while (Date.now() < deadline) {
        blocked = must((await observer.query<{ blocked: boolean }>("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND application_name='maintenance_r7g' AND cardinality(pg_blocking_pids(pid))>0) AS blocked")).rows[0]).blocked;
        if (blocked) break;
      }
      expect(blocked).toBe(true);
      release.release(); await blocker;
      expect(await outcome).toContain("diagnostic_source");
      expect(await db.listing.findUniqueOrThrow({ where: { id: listingId } })).toMatchObject({ year: 2022, description: null });
    } finally { release.release(); await Promise.allSettled([blocker, ...(waiting ? [waiting] : [])]); }
  });
});
