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
const source = readFileSync(`${root}/scripts/staging-remote.mjs`, "utf8").replace("export function remoteProgram", "function remoteProgram");

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

  function execute(kind: string, id: string): { code: number; receipt?: { listingId: string; sellerId: string; fixtures: string } } {
    let receipt; let code = 0;
    const identity = { projectId: "test-project", environmentId: "test-staging", services: { api: "test-api" },
      origins: { database: "postgresql://postgres.railway.internal:5432/railway", media: "http://minio.railway.internal:9000", publicMedia: "https://media.example" } };
    const process = { env: { RAILWAY_PROJECT_ID: "test-project", RAILWAY_ENVIRONMENT_ID: "test-staging", RAILWAY_SERVICE_ID: "test-api", RAILWAY_ENVIRONMENT_NAME: "staging", APP_ENV: "staging", SMS_DRIVER: "mock", AUTOTM_COMMIT_SHA: "a".repeat(40), DATABASE_URL: "postgresql://u:secret@postgres.railway.internal:5432/railway", MINIO_ENDPOINT: "http://minio.railway.internal:9000", MINIO_PUBLIC_URL: "https://media.example" }, exitCode: 0 };
    const payload = { kind, id, namespace: `cf_${id}`, target: "a".repeat(40), identity };
    const program = runInNewContext(`${source}; remoteProgram(payload)`, { payload });
    runInNewContext(program, { URL, process, require: (name: string) => name === "node:child_process" ? {
      spawnSync: (_program: string, _args: string[], options: { input: string }) => spawnSync(globalThis.process.execPath, [`${root}/scripts/testing/query-disposable-postgres.cjs`], {
        input: options.input, encoding: "utf8", timeout: 30000,
        env: { ...globalThis.process.env, STAGING_CONTROL_TEST_DATABASE_URL: databaseUrl, STAGING_TEST_DB_PACKAGE: `${packageRoot}/package.json` },
      }),
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
});
