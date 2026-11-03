import { afterEach, describe, expect, it } from "vitest";

import {
  diagnosticPreparedReaderOwnership,
  expectedDiagnosticMinioPort,
  expectedDiagnosticPostgresPort,
  expectedDiagnosticRedisPort,
} from "./diagnosticPreparedReaderFixture";

const originalPort = process.env["DIAGNOSTIC_EXPECTED_POSTGRES_PORT"];
const originalRedisPort = process.env["DIAGNOSTIC_EXPECTED_REDIS_PORT"];
const originalMinioPort = process.env["DIAGNOSTIC_EXPECTED_MINIO_PORT"];

afterEach(() => {
  if (originalPort === undefined) {
    delete (process.env as { DIAGNOSTIC_EXPECTED_POSTGRES_PORT?: string }).DIAGNOSTIC_EXPECTED_POSTGRES_PORT;
  } else process.env["DIAGNOSTIC_EXPECTED_POSTGRES_PORT"] = originalPort;
  if (originalRedisPort === undefined) {
    delete (process.env as { DIAGNOSTIC_EXPECTED_REDIS_PORT?: string }).DIAGNOSTIC_EXPECTED_REDIS_PORT;
  } else process.env["DIAGNOSTIC_EXPECTED_REDIS_PORT"] = originalRedisPort;
  if (originalMinioPort === undefined) {
    delete (process.env as { DIAGNOSTIC_EXPECTED_MINIO_PORT?: string }).DIAGNOSTIC_EXPECTED_MINIO_PORT;
  } else process.env["DIAGNOSTIC_EXPECTED_MINIO_PORT"] = originalMinioPort;
});

describe("diagnostic prepared reader expected PostgreSQL port", () => {
  it("keeps the historical port when no override is configured", () => {
    delete (process.env as { DIAGNOSTIC_EXPECTED_POSTGRES_PORT?: string }).DIAGNOSTIC_EXPECTED_POSTGRES_PORT;

    expect(expectedDiagnosticPostgresPort()).toBe(61169);
  });

  it("accepts a strict decimal TCP port override", () => {
    process.env["DIAGNOSTIC_EXPECTED_POSTGRES_PORT"] = "61172";

    expect(expectedDiagnosticPostgresPort()).toBe(61172);
  });

  it.each(["", "61169.0", " 61169", "+61169", "1e4", "0", "65536", "-1"])(
    "rejects malformed or out-of-range override %j",
    value => {
      process.env["DIAGNOSTIC_EXPECTED_POSTGRES_PORT"] = value;

      expect(expectedDiagnosticPostgresPort()).toBeUndefined();
    },
  );

  it("keeps historical Redis and MinIO ports when no overrides are configured", () => {
    delete (process.env as { DIAGNOSTIC_EXPECTED_REDIS_PORT?: string }).DIAGNOSTIC_EXPECTED_REDIS_PORT;
    delete (process.env as { DIAGNOSTIC_EXPECTED_MINIO_PORT?: string }).DIAGNOSTIC_EXPECTED_MINIO_PORT;

    expect(expectedDiagnosticRedisPort()).toBe(61168);
    expect(expectedDiagnosticMinioPort()).toBe(61170);
  });

  it("accepts fresh Redis and MinIO port overrides used by initialization", () => {
    process.env["DIAGNOSTIC_EXPECTED_REDIS_PORT"] = "61171";
    process.env["DIAGNOSTIC_EXPECTED_MINIO_PORT"] = "61173";

    expect(expectedDiagnosticRedisPort()).toBe(61171);
    expect(expectedDiagnosticMinioPort()).toBe(61173);
  });

  it.each(["", "61171.0", " 61171", "+61171", "1e4", "0", "65536", "-1"])(
    "rejects malformed or out-of-range Redis and MinIO overrides %j",
    value => {
      expect(expectedDiagnosticRedisPort(value)).toBeUndefined();
      expect(expectedDiagnosticMinioPort(value)).toBeUndefined();
    },
  );

  it("uses the initialization ownership boundary for fresh ports and preserves other checks", () => {
    const valid = {
      databaseUrl: "postgresql://fixture:pass@127.0.0.1:61172/auto_tm_897_938_s1r1_tabcdef_w1",
      expectedDatabaseUrl: "postgresql://fixture:pass@127.0.0.1:61172/auto_tm_897_938_s1r1_tabcdef_w1",
      redisUrl: "redis://127.0.0.1:61171/1",
      expectedRedisUrl: "redis://127.0.0.1:61171/1",
      minioEndpoint: "http://127.0.0.1:61173",
      bucket: "diagnostic-test-private",
      expectedPostgresPort: 61172,
      expectedRedisPort: 61171,
      expectedMinioPort: 61173,
    } as const;

    expect(diagnosticPreparedReaderOwnership(valid)).toEqual({ workerUrls: true, ownedWorkerDatabase: true, ownedRedisDb1: true, ownedStorage: true });
    expect(diagnosticPreparedReaderOwnership({ ...valid, expectedRedisUrl: "redis://127.0.0.1:61170/1", redisUrl: "redis://127.0.0.1:61170/1" }).ownedRedisDb1).toBe(false);
    expect(diagnosticPreparedReaderOwnership({ ...valid, minioEndpoint: "http://127.0.0.1:61170" }).ownedStorage).toBe(false);
    expect(diagnosticPreparedReaderOwnership({ ...valid, databaseUrl: "postgresql://fixture:pass@127.0.0.2:61172/auto_tm_897_938_s1r1_tabcdef_w1" }).workerUrls).toBe(false);
    expect(diagnosticPreparedReaderOwnership({ ...valid, expectedDatabaseUrl: "postgresql://fixture:pass@127.0.0.1:61172/other_tabcdef_w1" }).ownedWorkerDatabase).toBe(false);
    expect(diagnosticPreparedReaderOwnership({ ...valid, expectedPostgresPort: undefined }).ownedWorkerDatabase).toBe(false);
    expect(diagnosticPreparedReaderOwnership({ ...valid, expectedRedisPort: undefined }).ownedRedisDb1).toBe(false);
    expect(diagnosticPreparedReaderOwnership({ ...valid, expectedMinioPort: undefined }).ownedStorage).toBe(false);
    expect(diagnosticPreparedReaderOwnership({ ...valid, redisUrl: "redis://127.0.0.1:61171/0", expectedRedisUrl: "redis://127.0.0.1:61171/0" }).ownedRedisDb1).toBe(false);
    expect(diagnosticPreparedReaderOwnership({ ...valid, bucket: "other-private" }).ownedStorage).toBe(false);
  });
});
