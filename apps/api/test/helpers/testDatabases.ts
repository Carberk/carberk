/**
 * What test/globalSetup.ts hands every Vitest worker: the run's base
 * connection URLs and the prefix of the per-worker Postgres databases it
 * created. test/setup-env.ts turns them into this worker's DATABASE_URL and
 * REDIS_URL before any module under test is loaded.
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
