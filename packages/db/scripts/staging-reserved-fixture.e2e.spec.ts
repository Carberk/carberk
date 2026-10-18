import { spawnSync, execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PrismaClient } from "../generated/prisma/client/client";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const root = fileURLToPath(new URL("../../..", import.meta.url));
const localRequire = createRequire(import.meta.url);
const source = readFileSync(`${root}/scripts/staging-campaign.mjs`, "utf8").replace("export function campaignMain", "function campaignMain") +
  readFileSync(`${root}/scripts/staging-remote.mjs`, "utf8").replace("import { campaignMain } from './staging-campaign.mjs';", "").replace("export function remoteProgram", "function remoteProgram");

describe("reserved staging fixtures on disposable application schema", () => {
  let postgres: StartedPostgreSqlContainer;
  let pool: Pool;
  let databaseUrl: string;
  beforeAll(async () => {
    postgres = await new PostgreSqlContainer("postgres:16-alpine").start();
    databaseUrl = postgres.getConnectionUri();
    execFileSync("pnpm", ["prisma", "migrate", "deploy"], { cwd: packageRoot, env: { ...process.env, DATABASE_URL: databaseUrl }, stdio: "pipe" });
    pool = new Pool({ connectionString: databaseUrl });
    await pool.query(`INSERT INTO brands(id,slug,"nameRu","nameTk","nameEn","updatedAt") VALUES('fixture-catalog-brand','fixture-catalog-brand','Test','Test','Test',now());
      INSERT INTO models(id,"brandId",slug,"nameRu","nameTk","nameEn","updatedAt") VALUES('fixture-catalog-model','fixture-catalog-brand','fixture-catalog-model','Test','Test','Test',now());
      INSERT INTO regions(id,slug,"nameRu","nameTk","nameEn","updatedAt") VALUES('fixture-catalog-region','fixture-catalog-region','Test','Test','Test',now());
      INSERT INTO cities(id,"regionId",slug,"nameRu","nameTk","nameEn","updatedAt") VALUES('fixture-catalog-city','fixture-catalog-region','fixture-catalog-city','Test','Test','Test',now());
      INSERT INTO users(id,"displayName","updatedAt") VALUES('unrelated-user','Preserve me',now());`);
  }, 120000);
  afterAll(async () => { await pool?.end(); await postgres?.stop(); });

  function execute(kind: string, id: string, profile?: string, candidate = "a".repeat(40), beforeQuery?: (query: string) => void): { code: number; receipt?: { listingId: string; sellerId: string; fixtures: string; profile: string; state: string; identities: number; retainedAudits: number; tombstone: boolean } } {
    let receipt; let code = 0;
    const identity = { projectId: "test-project", environmentId: "test-staging", services: { api: "test-api" },
      origins: { database: "postgresql://postgres.railway.internal:5432/railway", media: "http://minio.railway.internal:9000", publicMedia: "https://media.example" } };
    const process = { env: { STAGING_CAMPAIGN_PROFILE_ENABLED: "campaign897-identities-v1", RAILWAY_PROJECT_ID: "test-project", RAILWAY_ENVIRONMENT_ID: "test-staging", RAILWAY_SERVICE_ID: "test-api", RAILWAY_ENVIRONMENT_NAME: "staging", APP_ENV: "staging", SMS_DRIVER: "mock", AUTOTM_COMMIT_SHA: "a".repeat(40), DATABASE_URL: "postgresql://u:secret@postgres.railway.internal:5432/railway", MINIO_ENDPOINT: "http://minio.railway.internal:9000", MINIO_PUBLIC_URL: "https://media.example" }, exitCode: 0 };
    const payload = { kind, id, namespace: `cf_${id}`, target: "a".repeat(40), identity, profile, candidate };
    const program = runInNewContext(`${source}; remoteProgram(payload)`, { payload });
    runInNewContext(program, { URL, process, require: (name: string) => name === "node:child_process" ? {
      spawnSync: (_program: string, _args: string[], options: { input: string }) => {
        beforeQuery?.(options.input);
        return spawnSync(globalThis.process.execPath, [`${root}/scripts/testing/query-disposable-postgres.cjs`], {
        input: options.input, encoding: "utf8", timeout: 30000,
        env: { ...globalThis.process.env, STAGING_CONTROL_TEST_DATABASE_URL: databaseUrl, STAGING_TEST_DB_PACKAGE: `${packageRoot}/package.json` },
      });
      },
    } : localRequire(name), console: { log: (value: string) => { receipt = JSON.parse(value); }, error: () => { code = 1; } } });
    return { code: code || process.exitCode, receipt };
  }

  it("creates API-owned seller/listing rows, reuses unchanged originals and resets without touching unrelated data", async () => {
    const id = "1".repeat(32);
    const seeded = execute("fixture", id);
    expect(seeded.code).toBe(0); expect(seeded.receipt?.fixtures).toBe("present");
    const listingId = seeded.receipt?.listingId;
    const listing = (await pool.query(`SELECT status,"sellerId",description FROM listings WHERE id=$1`, [listingId])).rows[0];
    expect(listing).toEqual({ status: "active", sellerId: seeded.receipt?.sellerId, description: "Synthetic reserved staging fixture. No real vehicle or seller." });
    expect(execute("fixture", id).code).toBe(0);
    expect(execute("reset", id).code).toBe(0);
    expect((await pool.query(`SELECT count(*)::int AS count FROM listings WHERE id=$1`, [listingId])).rows[0]).toEqual({ count: 0 });
    expect((await pool.query(`SELECT "displayName" FROM users WHERE id='unrelated-user'`)).rows[0]).toEqual({ displayName: "Preserve me" });
    expect((await pool.query(`SELECT count(*)::int AS count FROM models`)).rows[0]).toEqual({ count: 1 });
  });

  it("refuses changed originals and new application references without deleting them", async () => {
    const id = "2".repeat(32); const seeded = execute("fixture", id);
    expect(seeded.code).toBe(0);
    await pool.query(`UPDATE users SET "displayName"='Changed by operator' WHERE id=$1`, [seeded.receipt?.sellerId]);
    expect(execute("reset", id).code).toBe(1);
    expect(execute("fixture", id).code).toBe(1);
    expect((await pool.query(`SELECT "displayName" FROM users WHERE id=$1`, [seeded.receipt?.sellerId])).rows[0]).toEqual({ displayName: "Changed by operator" });
    const other = execute("fixture", "3".repeat(32)); expect(other.code).toBe(0);
    await pool.query(`INSERT INTO favorites(id,"userId","listingId") VALUES('unrelated-favorite','unrelated-user',$1)`, [other.receipt?.listingId]);
    expect(execute("reset", "3".repeat(32)).code).toBe(1);
    expect((await pool.query(`SELECT count(*)::int AS count FROM favorites WHERE id='unrelated-favorite'`)).rows[0]).toEqual({ count: 1 });
  });

  it("retains reviewed additive tables while the baseline listing/user write/read/reset contract still works", async () => {
    const profileSource = readFileSync(`${root}/scripts/staging-schema.mjs`, "utf8")
      .replace("export const retainedSchemaProfile", "const retainedSchemaProfile")
      .replace("export function evaluateSchemaPlan", "function evaluateSchemaPlan");
    const profile = runInNewContext(`${profileSource}; retainedSchemaProfile`) as { additions: { name: string; checksum: string }[] };
    for (const migration of profile.additions) {
      const sql = readFileSync(`${root}/scripts/testing/retained-schema/${migration.name}.sql`, "utf8");
      expect(createHash("sha256").update(sql).digest("hex")).toBe(migration.checksum);
      const installed = (await pool.query(`SELECT checksum FROM _prisma_migrations WHERE migration_name=$1 AND finished_at IS NOT NULL AND rolled_back_at IS NULL`, [migration.name])).rows;
      if (installed.length) expect(installed).toEqual([{ checksum: migration.checksum }]);
      else {
        await pool.query(sql);
        await pool.query(`INSERT INTO _prisma_migrations(id,checksum,migration_name,finished_at,applied_steps_count) VALUES($1,$2,$3,now(),1)`, [randomUUID(), migration.checksum, migration.name]);
      }
    }
    // Use the real Prisma predeploy command with the older migration inventory.
    // Retained application tables/ledger entries must not force a down migration.
    const older = mkdtempSync(join(packageRoot, ".staging-compat-"));
    try {
      mkdirSync(join(older, "prisma", "migrations"), { recursive: true });
      cpSync(join(packageRoot, "prisma.config.ts"), join(older, "prisma.config.ts"));
      cpSync(join(packageRoot, "prisma", "schema.prisma"), join(older, "prisma", "schema.prisma"));
      for (const name of readdirSync(join(packageRoot, "prisma", "migrations"))) {
        if (!profile.additions.some(migration => migration.name === name))
          cpSync(join(packageRoot, "prisma", "migrations", name), join(older, "prisma", "migrations", name), { recursive: true });
      }
      execFileSync("pnpm", ["prisma", "migrate", "deploy", "--config", join(older, "prisma.config.ts")], {
        cwd: packageRoot, env: { ...process.env, DATABASE_URL: databaseUrl }, stdio: "pipe",
      });
    } finally { rmSync(older, { recursive: true, force: true }); }
    const seeded = execute("fixture", "4".repeat(32)); expect(seeded.code).toBe(0);
    const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
    try {
      const listing = await prisma.listing.findUniqueOrThrow({ where: { id: seeded.receipt?.listingId },
        select: { id: true, sellerId: true, status: true, priceAmount: true } });
      expect(listing.sellerId).toBe(seeded.receipt?.sellerId); expect(listing.status).toBe("active");
      await prisma.user.update({ where: { id: listing.sellerId }, data: { displayName: "Baseline write after retained schema" } });
      // Baseline writes still work; cleanup correctly refuses the changed original.
      expect(execute("reset", "4".repeat(32)).code).toBe(1);
      const untouched = execute("fixture", "5".repeat(32)); expect(untouched.code).toBe(0);
      expect(execute("reset", "5".repeat(32)).code).toBe(0);
      for (const table of ["listing_view_days", "listing_view_fingerprints", "staff_grants"])
        expect((await pool.query(`SELECT to_regclass($1) AS name`, [table])).rows[0]?.["name"]).toBe(table);
    } finally { await prisma.$disconnect(); }
  });

  // Hosted-only proof. These use the same executable remote adapter and actual FK/trigger
  // transactions, never a fake implementation of SQL ownership predicates.
  it("campaign prerequisites have four distinct verified identities, exact root grants, stable reuse and guarded disposal", async () => {
    const id = "6".repeat(32), namespace = `cf_${id}`, profile = "campaign897-identities-v1";
    const seeded = execute("fixture", id, profile);
    expect(seeded.code).toBe(0); expect(seeded.receipt?.identities).toBe(4);
    const identities = (await pool.query(`SELECT e.alias,u.id,u.role,u.phone,u.email IS NOT NULL AND u."emailVerifiedAt" IS NOT NULL AS verified
      FROM "${namespace}".campaign_entities e JOIN users u ON u.id=e.user_id ORDER BY e.alias`)).rows;
    expect(identities.map(row => [row.alias, row.role, row.phone, row.verified])).toEqual([
      ["buyer-a", "buyer", null, true], ["coordinator", "buyer", null, true], ["owner", "seller", null, true], ["sales-a", "buyer", null, true],
    ]);
    expect(new Set(identities.map(row => row.id)).size).toBe(4);
    expect((await pool.query(`SELECT capability FROM staff_grants WHERE "userId"=$1 ORDER BY capability`, [identities[1]?.id])).rows)
      .toEqual([{ capability: "founder.control" }, { capability: "staff.manage" }]);
    expect(execute("fixture", id, profile).code).toBe(0);
    expect((await pool.query(`SELECT count(*)::int AS count FROM "${namespace}".campaign_events`)).rows[0]).toEqual({ count: 8 });
    // Normal application writes, not bootstrap, own session creation/elevation. This SQL
    // tests the storage contract only; it is not evidence of OTP/TOTP HTTP acceptance.
    const coordinator = identities[1]?.id;
    await pool.query(`INSERT INTO sessions(id,"userId","refreshTokenHash","expiresAt") VALUES('campaign-session',$1,'synthetic-hash',now()+interval '1 hour')`, [coordinator]);
    await pool.query(`INSERT INTO totp_enrollments(id,"userId","encryptedSecret","updatedAt") VALUES('campaign-totp',$1,'synthetic-ciphertext',now())`, [coordinator]);
    await pool.query(`INSERT INTO totp_backup_codes(id,"totpEnrollmentId","codeHash") VALUES('campaign-backup','campaign-totp','synthetic-backup-hash')`);
    await pool.query(`UPDATE totp_enrollments SET "verifiedAt"=now() WHERE id='campaign-totp'; UPDATE sessions SET "adminTotpExpiresAt"=now()+interval '5 minutes' WHERE id='campaign-session';`);
    expect(execute("fixture", id, profile).code).toBe(0);
    expect(execute("reset", id, profile).code).toBe(0);
    expect(execute("reset", id, profile).code).toBe(0);
    expect(execute("fixture", id, profile).code).toBe(1);
    expect((await pool.query(`SELECT count(*)::int AS count FROM "${namespace}".campaign_records WHERE NOT deleted AND table_name<>'audit_logs'`)).rows[0]).toEqual({ count: 0 });
    expect((await pool.query(`SELECT count(*)::int AS count FROM audit_logs WHERE "targetType"='SyntheticCampaign' AND "targetId"=$1 AND "actorId" IS NULL AND details->>'disposition'='redacted-synthetic-audit'`, [id])).rows[0]).toEqual({ count: 2 });
    const email = (await pool.query(`SELECT email FROM "${namespace}".campaign_entities WHERE alias='coordinator'`)).rows[0]?.email;
    // Late pending auth writes and attempts to create a new identity with the disposed
    // synthetic method must be rejected, including a random replacement User ID.
    await expect(pool.query(`INSERT INTO users(id,email,"emailVerifiedAt","updatedAt") VALUES('late-campaign-user',$1,now(),now())`, [email])).rejects.toThrow();
    await expect(pool.query(`INSERT INTO sessions(id,"userId","refreshTokenHash","expiresAt") VALUES('late-session',$1,'late-hash',now()+interval '1 hour')`, [coordinator])).rejects.toThrow();
    expect((await pool.query(`SELECT "displayName" FROM users WHERE id='unrelated-user'`)).rows[0]).toEqual({ displayName: "Preserve me" });
  });

  it("campaign collision, candidate mismatch, foreign references and auth authority transfers refuse without cleanup damage", async () => {
    const id = "7".repeat(32), namespace = `cf_${id}`, profile = "campaign897-identities-v1";
    expect(execute("fixture", id, profile).code).toBe(0);
    expect(execute("fixture", id, profile, "b".repeat(40)).code).toBe(1);
    const buyer = (await pool.query(`SELECT user_id FROM "${namespace}".campaign_entities WHERE alias='buyer-a'`)).rows[0]?.user_id;
    await pool.query(`INSERT INTO owned_vehicles(id,"userId",brand,model,"updatedAt") VALUES('campaign-foreign-vehicle',$1,'Synthetic','Synthetic',now())`, [buyer]);
    expect(execute("reset", id, profile).code).toBe(1);
    expect((await pool.query(`SELECT count(*)::int AS count FROM users WHERE id=$1`, [buyer])).rows[0]).toEqual({ count: 1 });
    await pool.query(`DELETE FROM owned_vehicles WHERE id='campaign-foreign-vehicle'`);
    await pool.query(`INSERT INTO sessions(id,"userId","refreshTokenHash","expiresAt") VALUES('campaign-transfer-session',$1,'synthetic-transfer-hash',now()+interval '1 hour')`, [buyer]);
    await expect(pool.query(`UPDATE sessions SET "userId"='unrelated-user' WHERE id='campaign-transfer-session'`)).rejects.toThrow();
    await expect(pool.query(`INSERT INTO staff_grants("userId",capability) VALUES($1,'analytics.aggregate')`, [buyer])).rejects.toThrow();
    expect(execute("reset", id, profile).code).toBe(0);
    // A new reservation cannot adopt a pre-existing synthetic method, even if its ID differs.
    const collisionId = "8".repeat(32);
    await pool.query(`INSERT INTO users(id,email,"emailVerifiedAt","updatedAt") VALUES('campaign-method-collision',$1,now(),now())`, [`buyer-a.${collisionId}.${"a".repeat(12)}@campaign897.invalid`]);
    expect(execute("fixture", collisionId, profile).code).toBe(1);
    expect((await pool.query(`SELECT count(*)::int AS count FROM pg_namespace WHERE nspname=$1`, [`cf_${collisionId}`])).rows[0]).toEqual({ count: 0 });
    expect((await pool.query(`SELECT count(*)::int AS count FROM users WHERE id='campaign-method-collision'`)).rows[0]).toEqual({ count: 1 });
  });

  it("campaign reset retains ownership after OTP until delivery jobs and sink records have a reviewed disposition", async () => {
    const id = "9".repeat(32), namespace = `cf_${id}`, profile = "campaign897-identities-v1";
    expect(execute("fixture", id, profile).code).toBe(0);
    const buyer = (await pool.query(`SELECT user_id,email FROM "${namespace}".campaign_entities WHERE alias='buyer-a'`)).rows[0];
    await pool.query(`INSERT INTO otp_requests(id,purpose,channel,destination,"codeHash","expiresAt",ip,"updatedAt") VALUES('campaign-otp','sign_in','email',$1,'synthetic-code-hash',now()+interval '5 minutes','127.0.0.1',now())`, [buyer?.email]);
    expect(execute("fixture", id, profile).code).toBe(0);
    expect(execute("reset", id, profile).code).toBe(1);
    expect((await pool.query(`SELECT state FROM "${namespace}".campaign_manifest`)).rows[0]).toEqual({ state: "identities" });
    expect((await pool.query(`SELECT count(*)::int AS count FROM otp_requests WHERE id='campaign-otp'`)).rows[0]).toEqual({ count: 1 });
    // Removing the row externally cannot masquerade as delivery cleanup.
    await pool.query(`DELETE FROM otp_requests WHERE id='campaign-otp'`);
    expect(execute("reset", id, profile).code).toBe(1);
  });


  it("an OTP inserted between reset preflight and its locked transaction prevents a false cleanup receipt", async () => {
    const id = "a".repeat(32), namespace = `cf_${id}`, profile = "campaign897-identities-v1";
    expect(execute("fixture", id, profile).code).toBe(0);
    const email = (await pool.query(`SELECT email FROM "${namespace}".campaign_entities WHERE alias='buyer-a'`)).rows[0]?.email;
    let inserted = false;
    const result = execute("reset", id, profile, "a".repeat(40), (query) => {
      if (inserted || !query.includes("SET state='cleaning'")) return;
      const insertion = spawnSync(globalThis.process.execPath, [`${root}/scripts/testing/query-disposable-postgres.cjs`], {
        input: `INSERT INTO otp_requests(id,purpose,channel,destination,"codeHash","expiresAt",ip,"updatedAt") VALUES('campaign-racing-otp','sign_in','email','${email}','synthetic-race-hash',now()+interval '5 minutes','127.0.0.1',now());`,
        encoding: "utf8", timeout: 30000,
        env: { ...globalThis.process.env, STAGING_CONTROL_TEST_DATABASE_URL: databaseUrl, STAGING_TEST_DB_PACKAGE: `${packageRoot}/package.json` },
      });
      expect(insertion.status).toBe(0); inserted = true;
    });
    expect(inserted).toBe(true); expect(result.code).toBe(1);
    expect((await pool.query(`SELECT state FROM "${namespace}".campaign_manifest`)).rows[0]).toEqual({ state: "identities" });
    expect((await pool.query(`SELECT count(*)::int AS count FROM otp_requests WHERE id='campaign-racing-otp'`)).rows[0]).toEqual({ count: 1 });
  });

});
