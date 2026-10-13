import { describe, expect, it } from "vitest";

import {
  databaseName,
  templateDatabaseName,
  testDatabasePrefix,
  withDatabase,
  withRedisDatabase,
  workerDatabaseName,
  workerUrls,
  type ApiTestDatabases,
} from "./helpers/testDatabases";

const databases: ApiTestDatabases = {
  baseDatabaseUrl: "postgresql://auto_tm_ci:auto_tm_ci_pass@127.0.0.1:32768/auto_tm_ci?schema=public",
  baseRedisUrl: "redis://127.0.0.1:32769",
  prefix: "auto_tm_ci_t0a1b2c",
  workers: 4,
};

describe("per-worker API test databases", () => {
  it("names one run's template and worker databases after the base database", () => {
    const prefix = testDatabasePrefix(databases.baseDatabaseUrl, "0a1b2c");
    expect(prefix).toBe("auto_tm_ci_t0a1b2c");
    expect(templateDatabaseName(prefix)).toBe("auto_tm_ci_t0a1b2c_template");
    expect(workerDatabaseName(prefix, 3)).toBe("auto_tm_ci_t0a1b2c_w3");
  });

  it("gives each worker its own Postgres database and Redis logical database on the same servers", () => {
    const first = workerUrls(databases, 1);
    const fourth = workerUrls(databases, 4);

    expect(first.databaseUrl).toBe(
      "postgresql://auto_tm_ci:auto_tm_ci_pass@127.0.0.1:32768/auto_tm_ci_t0a1b2c_w1?schema=public",
    );
    expect(databaseName(fourth.databaseUrl)).toBe("auto_tm_ci_t0a1b2c_w4");
    expect(first.redisUrl).toBe("redis://127.0.0.1:32769/1");
    expect(fourth.redisUrl).toBe("redis://127.0.0.1:32769/4");
  });

  it("replaces a logical database already named in the Redis URL, keeping its credentials", () => {
    expect(withRedisDatabase("redis://:secret@localhost:6379/0", 2)).toBe("redis://:secret@localhost:6379/2");
    expect(withDatabase("postgresql://u:p@localhost:5432/auto_tm_dev", "x")).toBe(
      "postgresql://u:p@localhost:5432/x",
    );
  });

  it("refuses a worker the run created no database for", () => {
    expect(() => workerUrls(databases, 0)).toThrow(/worker 0 has no test database/);
    expect(() => workerUrls(databases, 5)).toThrow(/worker 5 has no test database; the run created 4/);
    expect(() => workerUrls(databases, Number(undefined))).toThrow(/no test database/);
  });

  it("refuses a base database name that cannot be quoted safely or is too long", () => {
    expect(() => testDatabasePrefix("postgresql://u:p@h:5432/Auto-TM", "0a1b2c")).toThrow(
      /lower-case letters, digits/,
    );
    expect(() => testDatabasePrefix(`postgresql://u:p@h:5432/${"a".repeat(50)}`, "0a1b2c")).toThrow(
      /too long/,
    );
  });
});
