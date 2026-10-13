import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { resolve } from "node:path";
import { parseEnv, promisify } from "node:util";

import { PrismaService } from "@auto-tm/db";
import type { GlobalSetupContext } from "vitest/node";

import {
  MAX_TEST_WORKERS,
  templateDatabaseName,
  testDatabasePrefix,
  withDatabase,
  workerDatabaseName,
  type ApiTestDatabases,
} from "./helpers/testDatabases";

const run = promisify(execFile);
const dbPackageDir = resolve(__dirname, "../../../packages/db");

/**
 * DATABASE_URL and REDIS_URL as the workers will see them: the environment
 * first, then apps/api/.env, which test/setup-env.ts loads in each worker.
 * The file is read, not loaded, so this process's environment is unchanged.
 */
function runEnv(name: "DATABASE_URL" | "REDIS_URL"): string | undefined {
  if (process.env[name]) return process.env[name];
  const envPath = resolve(__dirname, "../.env");
  if (!existsSync(envPath)) return undefined;
  return parseEnv(readFileSync(envPath, "utf8"))[name];
}

/** How many forks Vitest runs: every VITEST_POOL_ID is between 1 and this. */
function workerCount(config: GlobalSetupContext["config"]): number {
  const forks = config.poolOptions?.forks;
  if (!config.fileParallelism || forks?.singleFork) return 1;
  return forks?.maxForks ?? config.maxWorkers ?? Math.max(availableParallelism() - 1, 1);
}

/** Runs one statement that cannot run in a transaction, such as CREATE DATABASE. */
async function withAdmin<T>(baseDatabaseUrl: string, work: (admin: PrismaService) => Promise<T>): Promise<T> {
  // PrismaService reads DATABASE_URL when constructed; this process's
  // DATABASE_URL is the base one, or unset when it comes from apps/api/.env.
  const previous = process.env["DATABASE_URL"];
  process.env["DATABASE_URL"] = baseDatabaseUrl;
  const admin = new PrismaService();
  if (previous === undefined) delete process.env["DATABASE_URL"];
  else process.env["DATABASE_URL"] = previous;
  try {
    return await work(admin);
  } finally {
    await admin.onModuleDestroy();
  }
}

/**
 * Creates one Postgres database per Vitest worker, cloned from a template
 * migrated with this checkout's committed migrations, and drops them all when
 * the run ends. `pnpm test:unit` sets AUTO_TM_TEST_DATABASES=off and needs no
 * services.
 */
export default async function setup({ config, provide }: GlobalSetupContext) {
  const baseDatabaseUrl = runEnv("DATABASE_URL");
  const baseRedisUrl = runEnv("REDIS_URL");
  if (process.env["AUTO_TM_TEST_DATABASES"] === "off" || (!baseDatabaseUrl && !baseRedisUrl)) {
    provide("apiTestDatabases", undefined);
    return;
  }
  // Spec files run in parallel. Without per-worker databases they would share
  // one database, and one spec's unscoped cleanup would wipe another's rows.
  if (!baseDatabaseUrl || !baseRedisUrl) {
    throw new Error(
      `API specs need both DATABASE_URL and REDIS_URL for per-worker databases; ${baseDatabaseUrl ? "REDIS_URL" : "DATABASE_URL"} is unset. ` +
        "Set it, or run unit specs with pnpm test:unit.",
    );
  }

  const workers = workerCount(config);
  if (workers > MAX_TEST_WORKERS) {
    throw new Error(
      `API specs need one Redis logical database per worker; run at most ${MAX_TEST_WORKERS} workers, not ${workers}`,
    );
  }
  const prefix = testDatabasePrefix(baseDatabaseUrl, randomBytes(3).toString("hex"));
  const template = templateDatabaseName(prefix);
  const names = Array.from({ length: workers }, (_, index) => workerDatabaseName(prefix, index + 1));

  const dropAll = () =>
    withAdmin(baseDatabaseUrl, async (admin) => {
      for (const name of [...names, template]) {
        await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
      }
      // The prefix is a plain identifier (testDatabasePrefix), so `_` is the only LIKE wildcard.
      const left = await admin.$queryRawUnsafe<{ datname: string }[]>(
        `SELECT datname FROM pg_database WHERE datname LIKE '${prefix.replaceAll("_", "\\_")}\\_%'`,
      );
      if (left.length > 0) {
        throw new Error(`API test databases were not dropped: ${left.map((row) => row.datname).join(", ")}`);
      }
    });

  try {
    await withAdmin(baseDatabaseUrl, (admin) => admin.$executeRawUnsafe(`CREATE DATABASE "${template}"`));
    await run(resolve(dbPackageDir, "node_modules/.bin/prisma"), ["migrate", "deploy"], {
      cwd: dbPackageDir,
      env: { ...process.env, DATABASE_URL: withDatabase(baseDatabaseUrl, template) },
    });
    await withAdmin(baseDatabaseUrl, async (admin) => {
      for (const name of names) {
        await admin.$executeRawUnsafe(`CREATE DATABASE "${name}" TEMPLATE "${template}"`);
      }
    });
  } catch (error) {
    await dropAll().catch(() => undefined);
    throw new Error(
      `Could not create the per-worker API test databases on ${new URL(baseDatabaseUrl).host}. ` +
        "Start the dev stack (pnpm compose:up), or run unit specs with pnpm test:unit.",
      { cause: error },
    );
  }

  const databases: ApiTestDatabases = { baseDatabaseUrl, baseRedisUrl, prefix, workers };
  provide("apiTestDatabases", databases);
  return dropAll;
}
