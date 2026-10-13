import { describe, expect, inject, it } from "vitest";

import config from "../vitest.config.mjs";
import "./helpers/testDatabases";

// Spec files run in parallel. Each Vitest worker gets its own Postgres
// database, cloned from a migrated template, and its own Redis logical
// database, so a spec that TRUNCATEs or calls an unscoped deleteMany() can only
// reach rows of the worker running it.

describe("API spec files run in parallel on per-worker databases", () => {
  it("lets Vitest run spec files in parallel, with a global setup that creates the databases", () => {
    expect(config.test?.fileParallelism).not.toBe(false);
    expect(config.test?.globalSetup).toEqual(["./test/globalSetup.ts"]);
  });

  // `pnpm test:unit` runs without services and creates no databases.
  it.skipIf(process.env["AUTO_TM_TEST_DATABASES"] === "off")(
    "points this worker at its own Postgres database and Redis logical database",
    () => {
      const databases = inject("apiTestDatabases");
      expect(databases, "test/globalSetup.ts provided no worker databases").toBeDefined();
      const worker = Number(process.env["VITEST_POOL_ID"]);
      expect(worker).toBeGreaterThanOrEqual(1);
      expect(worker).toBeLessThanOrEqual(databases!.workers);

      const database = new URL(process.env["DATABASE_URL"]!);
      const base = new URL(databases!.baseDatabaseUrl);
      expect(database.pathname).toBe(`/${databases!.prefix}_w${worker}`);
      expect(database.pathname).not.toBe(base.pathname);
      expect(database.host).toBe(base.host);

      const redis = new URL(process.env["REDIS_URL"]!);
      expect(redis.pathname).toBe(`/${worker}`);
      expect(redis.host).toBe(new URL(databases!.baseRedisUrl).host);
    },
  );
});
