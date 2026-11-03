import { afterEach, describe, expect, it } from "vitest";

import { expectedDiagnosticPostgresPort } from "./diagnosticPreparedReaderFixture";

const PORT_ENV = "DIAGNOSTIC_EXPECTED_POSTGRES_PORT";
const originalPort = process.env[PORT_ENV];

afterEach(() => {
  if (originalPort === undefined) delete process.env[PORT_ENV];
  else process.env[PORT_ENV] = originalPort;
});

describe("diagnostic prepared reader expected PostgreSQL port", () => {
  it("keeps the historical port when no override is configured", () => {
    delete process.env[PORT_ENV];

    expect(expectedDiagnosticPostgresPort()).toBe(61169);
  });

  it("accepts a strict decimal TCP port override", () => {
    process.env[PORT_ENV] = "61172";

    expect(expectedDiagnosticPostgresPort()).toBe(61172);
  });

  it.each(["", "61169.0", " 61169", "+61169", "1e4", "0", "65536", "-1"])(
    "rejects malformed or out-of-range override %j",
    value => {
      process.env[PORT_ENV] = value;

      expect(expectedDiagnosticPostgresPort()).toBeUndefined();
    },
  );
});
