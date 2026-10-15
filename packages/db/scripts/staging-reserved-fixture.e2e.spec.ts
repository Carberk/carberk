import { spawnSync, execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

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
});
