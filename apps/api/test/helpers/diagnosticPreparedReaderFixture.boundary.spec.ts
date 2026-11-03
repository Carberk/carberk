import { afterEach, describe, expect, it } from "vitest";

import { expectedDiagnosticPostgresPort } from "./diagnosticPreparedReaderFixture";

const originalPort = process.env["DIAGNOSTIC_EXPECTED_POSTGRES_PORT"];

afterEach(() => {
  if (originalPort === undefined) {
    delete (process.env as { DIAGNOSTIC_EXPECTED_POSTGRES_PORT?: string }).DIAGNOSTIC_EXPECTED_POSTGRES_PORT;
  } else process.env["DIAGNOSTIC_EXPECTED_POSTGRES_PORT"] = originalPort;
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
});
