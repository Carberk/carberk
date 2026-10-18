// Storage/cleanup contract only. No authentication, admission, Session or token proof.
import { execFileSync, spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { GenericContainer, type StartedTestContainer } from "testcontainers";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PrismaClient } from "../generated/prisma/client/client";

const root = fileURLToPath(new URL("../../..", import.meta.url));
const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const localRequire = createRequire(import.meta.url);
const profile = "campaign897-business-v2";
const candidate = "a".repeat(40);
const aliases = ["buyer-a", "buyer-b", "owner", "sales-a", "sales-b", "coordinator", "support", "history-fulfiller", "payment-verifier", "reception-steward", "technician", "independent-reviewer", "private-reviewer", "aggregate-viewer", "investigator"];
const source = readFileSync(`${root}/scripts/staging-campaign.mjs`, "utf8").replaceAll("export function ", "function ").replaceAll("export async function ", "async function ") +
  readFileSync(`${root}/scripts/staging-remote.mjs`, "utf8").replace(/import \{[^}]+\} from '\.\/staging-campaign\.mjs';/, "").replace("export function remoteProgram", "function remoteProgram");
const slug = (id: string) => `campaign897-${id}-${candidate.slice(0, 12)}`;
const contact = (id: string) => `+999${(BigInt(`0x${createHash("sha256").update(`${id}:${candidate}:business-contact`).digest("hex").slice(0, 12)}`) % 1000000000000n).toString().padStart(12, "0")}`;

describe("reservation-owned synthetic business v2 storage graph, without admission or authentication", () => {
  let postgres: StartedPostgreSqlContainer;
  let redis: StartedTestContainer;
  let databaseUrl: string;
  let redisUrl: string;
  let db: PrismaClient;
  let pool: Pool;
  beforeAll(async () => {
    postgres = await new PostgreSqlContainer("postgres:16-alpine").start();
    databaseUrl = postgres.getConnectionUri();
    redis = await new GenericContainer("redis:7-alpine").withExposedPorts(6379).start();
    redisUrl = `redis://${redis.getHost()}:${redis.getMappedPort(6379)}`;
    execFileSync("pnpm", ["prisma", "migrate", "deploy"], { cwd: packageRoot, env: { ...process.env, DATABASE_URL: databaseUrl }, stdio: "pipe" });
    pool = new Pool({ connectionString: databaseUrl });
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
    await pool.query(`INSERT INTO brands(id,slug,"nameRu","nameTk","nameEn","updatedAt") VALUES('graph-brand','graph-brand','Test','Test','Test',now());
      INSERT INTO models(id,"brandId",slug,"nameRu","nameTk","nameEn","updatedAt") VALUES('graph-model','graph-brand','graph-model','Test','Test','Test',now());
      INSERT INTO regions(id,slug,"nameRu","nameTk","nameEn","updatedAt") VALUES('graph-region','graph-region','Test','Test','Test',now());
      INSERT INTO cities(id,"regionId",slug,"nameRu","nameTk","nameEn","updatedAt") VALUES('graph-city','graph-region','graph-city','Test','Test','Test',now());`);
    await db.user.create({ data: { id: "graph-foreign-user", displayName: "Unrelated user" } });
    await db.dealership.create({ data: { id: "graph-foreign-business", slug: "graph-foreign-business", name: "Unrelated business" } });
    await db.listing.create({ data: listing("graph-foreign-listing", "graph-foreign-user", "graph-foreign-business") });
  }, 120000);
  afterAll(async () => { await db?.$disconnect(); await pool?.end(); await redis?.stop(); await postgres?.stop(); });

  function execute(kind: "fixture" | "reset", id: string, selectedProfile = profile, selectedCandidate = candidate, beforeQuery?: (query: string) => void) {
    let code = 0;
    let receipt: { profile: string; state: string; identities: number; fixtures: string; tombstone: boolean } | undefined;
    const remoteProcess = { execPath: process.execPath, exitCode: 0, env: {
      STAGING_CAMPAIGN_PROFILE_ENABLED: selectedProfile, RAILWAY_PROJECT_ID: "graph-project", RAILWAY_ENVIRONMENT_ID: "graph-staging", RAILWAY_SERVICE_ID: "graph-api", RAILWAY_ENVIRONMENT_NAME: "staging",
      APP_ENV: "staging", SMS_DRIVER: "mock", AUTOTM_COMMIT_SHA: candidate, DATABASE_URL: "postgresql://fixture:synthetic@postgres.railway.internal:5432/railway",
      REDIS_URL: "redis://fixture:synthetic@redis.railway.internal:6379/0", MINIO_ENDPOINT: "http://minio.railway.internal:9000", MINIO_PUBLIC_URL: "https://media.example",
    } };
    const payload = { kind, id, namespace: `cf_${id}`, profile: selectedProfile, candidate: selectedCandidate, target: candidate, redisOrigin: "redis://redis.railway.internal:6379/0", identity: {
      projectId: "graph-project", environmentId: "graph-staging", services: { api: "graph-api" }, origins: { database: "postgresql://postgres.railway.internal:5432/railway", media: "http://minio.railway.internal:9000", publicMedia: "https://media.example" },
    } };
    const program = runInNewContext(`${source}; remoteProgram(payload)`, { payload });
    runInNewContext(program, { URL, process: remoteProcess, require: (name: string) => name === "node:child_process" ? {
      spawnSync: (command: string, args: string[], options: { input: string }) => {
        if (command === process.execPath) return spawnSync(command, args, { ...options, encoding: "utf8", timeout: 30000, cwd: `${root}/apps/api`, env: { ...process.env, REDIS_URL: redisUrl } });
        beforeQuery?.(options.input);
        return spawnSync(process.execPath, [`${root}/scripts/testing/query-disposable-postgres.cjs`], { input: options.input, encoding: "utf8", timeout: 30000,
          env: { ...process.env, STAGING_CONTROL_TEST_DATABASE_URL: databaseUrl, STAGING_TEST_DB_PACKAGE: `${packageRoot}/package.json` } });
      },
    } : localRequire(name), console: { log: (value: string) => { receipt = JSON.parse(value); }, error: () => { code = 1; } } });
    return { code: code || remoteProcess.exitCode, receipt };
  }

  function listing(id: string, sellerId: string, businessId: string) {
    return { id, sellerId, businessId, status: "draft" as const, brandId: "graph-brand", modelId: "graph-model", cityId: "graph-city", description: "Synthetic media-free inventory", priceAmount: 100, damaged: false };
  }
  async function seed(id: string) {
    // Intentional first behavioral RED on current source: fixed v2 profile is absent.
    expect(execute("fixture", id).code).toBe(0);
    const rows = (await pool.query(`SELECT alias,user_id,email FROM "cf_${id}".campaign_entities ORDER BY alias`)).rows as { alias: string; user_id: string; email: string }[];
    const actor = (alias: string) => {
      const row = rows.find(row => row.alias === alias);
      if (!row) throw new Error("fixed roster alias missing");
      return row.user_id;
    };
    const business = await db.dealership.findUniqueOrThrow({ where: { slug: slug(id) } });
    return { rows, actor, business };
  }
  async function graph(id: string) {
    const seeded = await seed(id);
    const { actor, business } = seeded;
    const car = await db.listing.create({ data: listing(randomUUID(), actor("owner"), business.id) });
    const draft = await db.listingDraft.create({ data: { userId: actor("owner"), businessId: business.id, payload: { description: "Unpublished synthetic draft", media: [] } } });
    const conversation = await db.conversation.create({ data: { businessId: business.id, listingId: car.id, buyerId: actor("buyer-a"), sellerId: actor("owner") } });
    await db.conversationParticipant.createMany({ data: ["buyer-a", "owner"].map(alias => ({ conversationId: conversation.id, userId: actor(alias) })) });
    const message = await db.message.create({ data: { conversationId: conversation.id, senderId: actor("buyer-a"), kind: "text", body: "Synthetic enquiry" } });
    await db.conversation.update({ where: { id: conversation.id }, data: { lastMessageId: message.id, firstBuyerMessageId: message.id } });
    await db.businessEnquiryAudit.create({ data: { conversationId: conversation.id, version: 0, actorId: actor("owner"), action: "closed", enquiryState: "closed" } });
    await db.favorite.create({ data: { userId: actor("buyer-b"), listingId: car.id } });
    // Storage-only invitation hash, never issued/redeemed as a credential.
    const invitation = await db.dealershipInvitation.create({ data: { dealershipId: business.id, recipientUserId: actor("sales-a"), tokenHash: randomUUID(), expiresAt: new Date("2099-01-01T00:00:00Z") } });
    await db.dealershipInvitation.update({ where: { id: invitation.id }, data: { revokedAt: new Date() } });
    await db.ownedVehicle.create({ data: { userId: actor("owner"), dealershipId: business.id, brand: "Synthetic", model: "No real car" } });
    await db.blockedUser.create({ data: { blockerId: actor("buyer-b"), blockedId: actor("sales-b") } });
    await db.notificationPreference.create({ data: { userId: actor("buyer-a"), optOuts: { marketing: true } } });
    await db.verifiedContactPhone.create({ data: { sellerId: actor("owner"), phone: contact(id), confirmedAt: new Date() } });
    await db.contentReport.create({ data: { reporterUserId: actor("buyer-b"), targetType: "listing", targetId: car.id, reason: "synthetic-storage-fixture" } });
    return { ...seeded, car, draft, conversation, message };
  }
  async function liveRecords(id: string) {
    return (await pool.query(`SELECT table_name,row_key,row_hash FROM "cf_${id}".campaign_records WHERE NOT deleted ORDER BY table_name,row_key::text`)).rows;
  }

  it("provides a fixed distinct roster and only a nonoperational synthetic owner root, without new staff authority", async () => {
    const id = "11".repeat(16), otherId = "12".repeat(16);
    const first = await seed(id), second = await seed(otherId);
    expect(first.rows.map(row => row.alias)).toEqual([...aliases].sort());
    expect(new Set([...first.rows, ...second.rows].map(row => row.user_id)).size).toBe(30);
    expect(new Set([...first.rows, ...second.rows].map(row => row.email)).size).toBe(30);
    expect(first.business.id).not.toBe(second.business.id);
    expect(first.business).toMatchObject({ slug: slug(id), status: "recovery", admissionMode: "synthetic", admittedAt: null, checkedEvidence: null, contactPhone: contact(id), contactConfirmedAt: null, logoUrl: null });
    expect(await db.dealershipMember.findMany({ where: { dealershipId: first.business.id }, select: { userId: true, role: true } })).toEqual([{ userId: first.actor("owner"), role: "owner" }]);
    expect(await db.staffGrant.findMany({ where: { userId: { in: first.rows.map(row => row.user_id) } }, select: { userId: true, capability: true }, orderBy: { capability: "asc" } })).toEqual([
      { userId: first.actor("coordinator"), capability: "founder.control" }, { userId: first.actor("coordinator"), capability: "staff.manage" },
    ]);
    expect(await db.session.count()).toBe(0);
    const original = await liveRecords(id);
    expect(execute("fixture", id).code).toBe(0);
    expect(await liveRecords(id)).toEqual(original);
    expect(execute("reset", id).code).toBe(0);
    expect(execute("reset", otherId).code).toBe(0);
  });

  it("journals ordinary media-free Prisma edits and disposes only exact owned rows while retaining terminal proof", async () => {
    const id = "21".repeat(16), owned = await graph(id);
    const unrelated = await db.listing.findUniqueOrThrow({ where: { id: "graph-foreign-listing" } });
    await db.dealership.update({ where: { id: owned.business.id }, data: { name: "Edited synthetic business", description: "Mutable, not an original snapshot" } });
    await db.listing.update({ where: { id: owned.car.id }, data: { description: "Owner saved a normal edit", priceAmount: 100 } });
    await db.listingDraft.update({ where: { id: owned.draft.id }, data: { payload: { description: "Recoverable edited draft", media: [] } } });
    await db.message.update({ where: { id: owned.message.id }, data: { body: "Edited synthetic message" } });
    expect(execute("fixture", id).code).toBe(0);
    const before = await liveRecords(id);
    for (const table of ["dealerships", "dealership_members", "dealership_invitations", "listings", "listing_drafts", "conversations", "conversation_participants", "messages", "business_enquiry_audits", "favorites", "verified_contact_phones", "owned_vehicles", "blocked_users", "content_reports", "notification_preferences"])
      expect(before.some(row => row.table_name === table), table).toBe(true);
    expect(execute("reset", id).code).toBe(0);
    expect(await db.dealership.findUnique({ where: { id: owned.business.id } })).toBeNull();
    expect(await db.listing.findUnique({ where: { id: owned.car.id } })).toBeNull();
    expect(await db.message.findUnique({ where: { id: owned.message.id } })).toBeNull();
    expect((await liveRecords(id)).filter(row => row.table_name !== "audit_logs")).toEqual([]);
    expect(await db.listing.findUnique({ where: { id: unrelated.id } })).toEqual(unrelated);
    expect((await pool.query(`SELECT state FROM "cf_${id}".campaign_manifest`)).rows).toEqual([{ state: "disposed" }]);
    expect(execute("reset", id).code).toBe(0);
    await expect(db.listingDraft.create({ data: { userId: owned.actor("owner"), businessId: owned.business.id, payload: {} } })).rejects.toThrow();
  });

  it("refuses existing slug, contact and alias collisions without adopting or damaging them", async () => {
    for (const [index, collision] of ["slug", "contact", "email"].entries()) {
      const id = `${31 + index}`.repeat(16);
      const foreign = collision === "email" ? await db.user.create({ data: { email: `buyer-b.${id}.${candidate.slice(0, 12)}@campaign897.invalid` } }) :
        await db.dealership.create({ data: { slug: collision === "slug" ? slug(id) : `contact-collision-${id}`, name: "Foreign preexisting root", contactPhone: collision === "contact" ? contact(id) : null } });
      expect(execute("fixture", id).code).toBe(1);
      expect((await pool.query("SELECT count(*)::int AS count FROM pg_namespace WHERE nspname=$1", [`cf_${id}`])).rows).toEqual([{ count: 0 }]);
      if (collision === "email") expect(await db.user.findUnique({ where: { id: foreign.id } })).toEqual(foreign);
      else expect(await db.dealership.findUnique({ where: { id: foreign.id } })).toEqual(foreign);
    }
  });

  it("refuses mixed foreign child creation and parent or key transfers without changing either graph", async () => {
    const id = "41".repeat(16), owned = await graph(id), before = await liveRecords(id);
    const membership = await db.dealershipMember.findUniqueOrThrow({ where: { userId: owned.actor("owner") } });
    const participant = await db.conversationParticipant.findFirstOrThrow({ where: { conversationId: owned.conversation.id } });
    await expect(db.dealership.update({ where: { id: owned.business.id }, data: { slug: "transferred-synthetic-root" } })).rejects.toThrow();
    await expect(db.dealership.update({ where: { id: owned.business.id }, data: { contactPhone: "+999000000000000" } })).rejects.toThrow();
    await expect(db.dealershipMember.update({ where: { id: membership.id }, data: { dealershipId: "graph-foreign-business" } })).rejects.toThrow();
    await expect(db.listing.update({ where: { id: owned.car.id }, data: { businessId: "graph-foreign-business" } })).rejects.toThrow();
    await expect(db.listing.update({ where: { id: owned.car.id }, data: { sellerId: "graph-foreign-user" } })).rejects.toThrow();
    await expect(db.conversationParticipant.update({ where: { id: participant.id }, data: { userId: "graph-foreign-user" } })).rejects.toThrow();
    await expect(db.message.update({ where: { id: owned.message.id }, data: { senderId: "graph-foreign-user" } })).rejects.toThrow();
    await expect(db.favorite.create({ data: { userId: owned.actor("buyer-a"), listingId: "graph-foreign-listing" } })).rejects.toThrow();
    await expect(db.dealershipInvitation.create({ data: { dealershipId: owned.business.id, recipientUserId: "graph-foreign-user", tokenHash: randomUUID(), expiresAt: new Date(Date.now() + 60000) } })).rejects.toThrow();
    expect(await liveRecords(id)).toEqual(before);
    expect(await db.dealership.findUnique({ where: { id: owned.business.id } })).toEqual(owned.business);
    expect(await db.dealershipMember.findUnique({ where: { id: membership.id } })).toEqual(membership);
    expect(await db.conversationParticipant.findUnique({ where: { id: participant.id } })).toEqual(participant);
    expect(execute("reset", id).code).toBe(0);
  });

  it("refuses foreign incoming FK and scalar targets before any owned deletion, then safely retries", async () => {
    const id = "51".repeat(16), owned = await graph(id), before = await liveRecords(id);
    // An unknown incoming FK with a composite descendant must never cascade.
    // These external tables are outside the profile and cleanup allowlist.
    await pool.query(`CREATE TABLE public.graph_unexpected_parent (business_id text, user_id text, PRIMARY KEY(business_id,user_id));
      INSERT INTO public.graph_unexpected_parent VALUES('${owned.business.id}','${owned.actor("owner")}');
      CREATE TABLE public.graph_unexpected_child (id text PRIMARY KEY, business_id text, user_id text,
      FOREIGN KEY(business_id,user_id) REFERENCES public.graph_unexpected_parent(business_id,user_id));
      INSERT INTO public.graph_unexpected_child VALUES('preserve-composite','${owned.business.id}','${owned.actor("owner")}');
      ALTER TABLE public.graph_unexpected_parent ADD FOREIGN KEY(business_id) REFERENCES dealerships(id);`);
    try {
      expect(execute("reset", id).code).toBe(1);
      expect(await liveRecords(id)).toEqual(before);
      expect((await pool.query("SELECT id FROM graph_unexpected_child")).rows).toEqual([{ id: "preserve-composite" }]);
    } finally { await pool.query("DROP TABLE public.graph_unexpected_child; DROP TABLE public.graph_unexpected_parent;"); }
    // A polymorphic target has no FK; guard inventory must still see it.
    const report = await db.contentReport.create({ data: { reporterUserId: "graph-foreign-user", targetType: "listing", targetId: owned.car.id, reason: "foreign-target-preservation" } });
    expect(execute("reset", id).code).toBe(1);
    expect(await db.contentReport.findUnique({ where: { id: report.id } })).toEqual(report);
    expect(await liveRecords(id)).toEqual(before);
    await db.contentReport.delete({ where: { id: report.id } });
    expect(execute("reset", id).code).toBe(0);
  });

  it("rejects candidate/profile changes, active v1 migration and missing tracking without deleting owned data", async () => {
    const id = "61".repeat(16), owned = await graph(id), before = await liveRecords(id);
    expect(execute("reset", id, profile, "b".repeat(40)).code).toBe(1);
    expect(execute("fixture", id, "campaign897-identities-v1").code).toBe(1);
    expect(await liveRecords(id)).toEqual(before);
    const trigger = (await pool.query(`SELECT tgname FROM pg_trigger WHERE tgrelid='public.listings'::regclass AND NOT tgisinternal AND tgname LIKE $1`, [`cf_${id}%`])).rows[0]?.tgname as string | undefined;
    expect(trigger).toBeDefined();
    if (!trigger || !/^cf_[a-f0-9]{32}_[a-z_]+$/.test(trigger)) throw new Error("profile listing tracking missing");
    await pool.query(`ALTER TABLE public.listings DISABLE TRIGGER "${trigger}"`);
    try { expect(execute("reset", id).code).toBe(1); expect(await db.listing.findUnique({ where: { id: owned.car.id } })).toEqual(owned.car); }
    finally { await pool.query(`ALTER TABLE public.listings ENABLE TRIGGER "${trigger}"`); }
    expect(execute("reset", id).code).toBe(0);
    const v1 = "62".repeat(16);
    expect(execute("fixture", v1, "campaign897-identities-v1").code).toBe(0);
    expect(execute("fixture", v1).code).toBe(1);
    expect(execute("reset", v1, "campaign897-identities-v1").code).toBe(0);
  });

  it("resumes from committed cleaning after interruption and never treats a missing response as completed cleanup", async () => {
    const id = "71".repeat(16), owned = await graph(id);
    let interrupted = false;
    const reset = execute("reset", id, profile, candidate, query => {
      if (!query.includes("DELETE FROM public.")) return;
      interrupted = true; throw new Error("synthetic interruption before graph disposal transaction");
    });
    expect(interrupted).toBe(true); expect(reset.code).toBe(1);
    expect((await pool.query(`SELECT state FROM "cf_${id}".campaign_manifest`)).rows).toEqual([{ state: "cleaning" }]);
    expect(await db.listing.findUnique({ where: { id: owned.car.id } })).toEqual(owned.car);
    await expect(db.listing.update({ where: { id: owned.car.id }, data: { description: "late graph write" } })).rejects.toThrow();
    expect(execute("reset", id).code).toBe(0);
    expect(await db.dealership.findUnique({ where: { id: owned.business.id } })).toBeNull();
    expect(execute("reset", id).code).toBe(0);
  });
});
