/**
 * Per-worker databases for API spec files that run in parallel.
 *
 * test/globalSetup.ts migrates one template database per run and clones a
 * Postgres database from it for every Vitest worker. It hands the workers an
 * `ApiTestDatabases` value, and test/setup-env.ts turns it into this worker's
 * DATABASE_URL and REDIS_URL before any module under test is loaded. A spec
 * that TRUNCATEs or calls an unscoped deleteMany() therefore only reaches the
 * rows of the worker running it.
 */
export interface ApiTestDatabases {
  /** DATABASE_URL as the run found it, before any worker rewrote it. */
  baseDatabaseUrl: string;
  /** REDIS_URL as the run found it. */
  baseRedisUrl: string;
  /** Worker N uses the Postgres database `<prefix>_w<N>`. */
  prefix: string;
  /** How many worker databases exist: `_w1` to `_w<workers>`. */
  workers: number;
}

declare module "vitest" {
  interface ProvidedContext {
    apiTestDatabases: ApiTestDatabases | undefined;
  }
}

/**
 * Redis has 16 logical databases by default. Worker N uses database N, and
 * database 0 stays with the development server.
 */
export const MAX_TEST_WORKERS = 15;

const IDENTIFIER = /^[a-z0-9_]+$/;
/** Postgres truncates identifiers longer than 63 bytes. */
const MAX_IDENTIFIER = 63;

/** The database name in a Postgres connection URL. */
export function databaseName(url: string): string {
  return decodeURIComponent(new URL(url).pathname.replace(/^\//, ""));
}

/** The same connection URL, naming another database. */
export function withDatabase(url: string, name: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${name}`;
  return parsed.toString();
}

/** The same Redis URL, selecting logical database `index`. */
export function withRedisDatabase(url: string, index: number): string {
  const parsed = new URL(url);
  parsed.pathname = `/${index}`;
  return parsed.toString();
}

/**
 * The name shared by one run's template and worker databases:
 * `<base>_t<runId>`. It is a plain lower-case identifier, so the SQL that
 * creates and drops these databases can quote it safely.
 */
export function testDatabasePrefix(baseDatabaseUrl: string, runId: string): string {
  const prefix = `${databaseName(baseDatabaseUrl)}_t${runId}`;
  if (!IDENTIFIER.test(prefix)) {
    throw new Error(`Test database names must be lower-case letters, digits and "_"; got ${prefix}`);
  }
  // `_template` is the longest suffix.
  if (prefix.length + "_template".length > MAX_IDENTIFIER) {
    throw new Error(`Test database prefix ${prefix} is too long for a Postgres identifier`);
  }
  return prefix;
}

export const templateDatabaseName = (prefix: string): string => `${prefix}_template`;

export const workerDatabaseName = (prefix: string, worker: number): string => `${prefix}_w${worker}`;

/**
 * This worker's DATABASE_URL and REDIS_URL. `worker` is Vitest's
 * VITEST_POOL_ID, from 1 to the run's worker count.
 */
export function workerUrls(
  databases: ApiTestDatabases,
  worker: number,
): { databaseUrl: string; redisUrl: string } {
  if (!Number.isInteger(worker) || worker < 1 || worker > databases.workers) {
    throw new Error(
      `Vitest worker ${worker} has no test database; the run created ${databases.workers}`,
    );
  }
  return {
    databaseUrl: withDatabase(databases.baseDatabaseUrl, workerDatabaseName(databases.prefix, worker)),
    redisUrl: withRedisDatabase(databases.baseRedisUrl, worker),
  };
}
