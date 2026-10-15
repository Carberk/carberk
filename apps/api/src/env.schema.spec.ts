import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { EnvSchema } from "./env.schema";

const baseEnv = {
  NODE_ENV: "test",
  PORT: "3006",
  DATABASE_URL: "postgres://user:pass@localhost:5432/db",
  REDIS_URL: "redis://localhost:6379",
  JWT_ACCESS_SECRET: "a".repeat(32),
  JWT_REFRESH_SECRET: "b".repeat(32),
  TOTP_SECRET_ENCRYPTION_KEY: "MDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDA=",
};

describe("EnvSchema socket defaults", () => {
  it("defaults Socket.IO settings to single-node mode", () => {
    const env = EnvSchema.parse(baseEnv);

    expect(env.SOCKET_IO_NAMESPACE).toBe("/ws/chat");
    expect(env.SOCKET_IO_CORS_ORIGIN).toBe("*");
    expect(env.SOCKET_IO_REDIS_ADAPTER_ENABLED).toBe(false);
  });

  it("parses Redis adapter enabled flag", () => {
    const env = EnvSchema.parse({
      ...baseEnv,
      SOCKET_IO_REDIS_ADAPTER_ENABLED: "true",
    });

    expect(env.SOCKET_IO_REDIS_ADAPTER_ENABLED).toBe(true);
  });

  it("preserves REDIS_URL when the Redis adapter is enabled", () => {
    const env = EnvSchema.parse({
      ...baseEnv,
      SOCKET_IO_REDIS_ADAPTER_ENABLED: "true",
    });

    expect(env.REDIS_URL).toBe("redis://localhost:6379");
  });

  it("applies a custom Socket.IO namespace", () => {
    const env = EnvSchema.parse({
      ...baseEnv,
      SOCKET_IO_NAMESPACE: "/custom",
    });

    expect(env.SOCKET_IO_NAMESPACE).toBe("/custom");
  });
});

describe("API environment template", () => {
  it("documents the required TOTP secret encryption key", () => {
    const template = readFileSync(resolve(__dirname, "../.env.template"), "utf8");
    const match = template.match(/^TOTP_SECRET_ENCRYPTION_KEY=([^\s#]+)/m);

    expect(match?.[1]).toBeDefined();
    expect(Buffer.from(match?.[1] ?? "", "base64")).toHaveLength(32);
  });
});

const deployedEnv = {
  ...baseEnv,
  NODE_ENV: "production",
  APP_ENV: "production",
  DATABASE_URL: "postgres://user:pass@postgres.railway.internal:5432/railway",
  REDIS_URL: "redis://default:pass@redis.railway.internal:6379",
  MINIO_ENDPOINT: "http://minio.railway.internal:9000",
  MINIO_PUBLIC_URL: "https://minio-production.up.railway.app",
  MINIO_ACCESS_KEY: "deployed-key",
  MINIO_SECRET_KEY: "deployed-secret",
  JWT_ACCESS_SECRET: `a${"1".repeat(40)}`,
  JWT_REFRESH_SECRET: `b${"2".repeat(40)}`,
  SOCKET_IO_CORS_ORIGIN: "https://admin.auto.tm",
};

function reviewerDemoAccount(index: number): { phone: string; email: string; code: string } {
  return {
    phone: `+99365${String(index).padStart(6, "0")}`,
    email: `reviewer${index}@autotm.bagtyyar.dev`,
    code: String(index).repeat(6),
  };
}

describe("EnvSchema reviewer-era safety (fail-closed outside CI)", () => {
  it("allows OTP test mode and the test SMS driver only when NODE_ENV=test", () => {
    expect(() =>
      EnvSchema.parse({
        ...baseEnv,
        OTP_TEST_MODE: "true",
        OTP_TEST_CODE_RESPONSE: "true",
        SMS_DRIVER: "test",
      }),
    ).not.toThrow();
  });

  it("rejects OTP_TEST_MODE outside CI", () => {
    expect(() =>
      EnvSchema.parse({ ...baseEnv, NODE_ENV: "development", OTP_TEST_MODE: "true" }),
    ).toThrow(/OTP_TEST_MODE/);
    expect(() =>
      EnvSchema.parse({ ...deployedEnv, OTP_TEST_MODE: "true" }),
    ).toThrow(/OTP_TEST_MODE/);
  });

  it("rejects OTP_TEST_CODE_RESPONSE outside CI", () => {
    expect(() =>
      EnvSchema.parse({ ...deployedEnv, OTP_TEST_CODE_RESPONSE: "true" }),
    ).toThrow(/OTP_TEST_CODE_RESPONSE/);
  });

  it("rejects SMS_DRIVER=test outside CI", () => {
    expect(() =>
      EnvSchema.parse({ ...baseEnv, NODE_ENV: "development", SMS_DRIVER: "test" }),
    ).toThrow(/SMS_DRIVER/);
    expect(() => EnvSchema.parse({ ...deployedEnv, SMS_DRIVER: "test" })).toThrow(
      /SMS_DRIVER/,
    );
  });

  it("accepts SMS_DRIVER=mock in deployed environments", () => {
    expect(() =>
      EnvSchema.parse({ ...deployedEnv, SMS_DRIVER: "mock" }),
    ).not.toThrow();
  });

  it("defaults reviewer demo-account bypass off with no configured accounts", () => {
    const env = EnvSchema.parse(baseEnv);

    expect(env.REVIEW_DEMO_ACCOUNT_ENABLED).toBe(false);
    expect(env.REVIEW_DEMO_ACCOUNTS_JSON).toBe("[]");
  });

  it("requires 3 to 5 secret-managed reviewer demo accounts when enabled", () => {
    const accounts = JSON.stringify([
      reviewerDemoAccount(1),
      reviewerDemoAccount(2),
      reviewerDemoAccount(3),
    ]);

    expect(() =>
      EnvSchema.parse({
        ...deployedEnv,
        REVIEW_DEMO_ACCOUNT_ENABLED: "true",
        REVIEW_DEMO_ACCOUNTS_JSON: accounts,
      }),
    ).not.toThrow();
  });

  it("rejects enabled reviewer bypass with too few, too many, malformed, or duplicate accounts", () => {
    expect(() =>
      EnvSchema.parse({
        ...deployedEnv,
        REVIEW_DEMO_ACCOUNT_ENABLED: "true",
        REVIEW_DEMO_ACCOUNTS_JSON: JSON.stringify([
          reviewerDemoAccount(1),
          reviewerDemoAccount(2),
        ]),
      }),
    ).toThrow(/REVIEW_DEMO_ACCOUNTS_JSON/);

    expect(() =>
      EnvSchema.parse({
        ...deployedEnv,
        REVIEW_DEMO_ACCOUNT_ENABLED: "true",
        REVIEW_DEMO_ACCOUNTS_JSON: JSON.stringify([
          reviewerDemoAccount(1),
          reviewerDemoAccount(2),
          reviewerDemoAccount(3),
          reviewerDemoAccount(4),
          reviewerDemoAccount(5),
          reviewerDemoAccount(6),
        ]),
      }),
    ).toThrow(/REVIEW_DEMO_ACCOUNTS_JSON/);

    expect(() =>
      EnvSchema.parse({
        ...deployedEnv,
        REVIEW_DEMO_ACCOUNT_ENABLED: "true",
        REVIEW_DEMO_ACCOUNTS_JSON: "not-json",
      }),
    ).toThrow(/REVIEW_DEMO_ACCOUNTS_JSON/);

    // A reviewer code is an OTP code. OtpVerifyRequestSchema.code is /^\d{6}$/,
    // so anything else is accepted at boot and then rejected by the HTTP
    // contract before the bypass runs. Staging hit exactly this with 8-digit
    // codes: POST /auth/otp/verify answered 400 VALIDATION_FAILED.
    for (const code of ["12345", "1234567", "12345678"]) {
      expect(() =>
        EnvSchema.parse({
          ...deployedEnv,
          REVIEW_DEMO_ACCOUNT_ENABLED: "true",
          REVIEW_DEMO_ACCOUNTS_JSON: JSON.stringify([
            { ...reviewerDemoAccount(1), code },
            reviewerDemoAccount(2),
            reviewerDemoAccount(3),
          ]),
        }),
      ).toThrow(/exactly 6 digits/);
    }

    expect(() =>
      EnvSchema.parse({
        ...deployedEnv,
        REVIEW_DEMO_ACCOUNT_ENABLED: "true",
        REVIEW_DEMO_ACCOUNTS_JSON: JSON.stringify([
          reviewerDemoAccount(1),
          { ...reviewerDemoAccount(2), phone: reviewerDemoAccount(1).phone },
          reviewerDemoAccount(3),
        ]),
      }),
    ).toThrow(/REVIEW_DEMO_ACCOUNTS_JSON/);

    expect(() =>
      EnvSchema.parse({
        ...deployedEnv,
        REVIEW_DEMO_ACCOUNT_ENABLED: "true",
        REVIEW_DEMO_ACCOUNTS_JSON: JSON.stringify([
          reviewerDemoAccount(1),
          { ...reviewerDemoAccount(2), email: reviewerDemoAccount(1).email },
          reviewerDemoAccount(3),
        ]),
      }),
    ).toThrow(/REVIEW_DEMO_ACCOUNTS_JSON/);
  });
});

function testerAccount(index: number): { phone: string; email: string; code: string } {
  return {
    phone: `+99370${String(index).padStart(6, "0")}`,
    email: `tester${index}@example.com`,
    code: `9${String(index).padStart(5, "0")}`.slice(-6),
  };
}

describe("EnvSchema tester accounts (ADR-0086)", () => {
  it("defaults to an empty tester list", () => {
    const env = EnvSchema.parse(deployedEnv);

    expect(env.TESTER_ACCOUNTS_JSON).toBe("[]");
  });

  it("accepts 0 and 30 tester entries with the reviewer flag off", () => {
    expect(() =>
      EnvSchema.parse({ ...deployedEnv, TESTER_ACCOUNTS_JSON: "[]" }),
    ).not.toThrow();

    const thirty = JSON.stringify(
      Array.from({ length: 30 }, (_, index) => testerAccount(index + 1)),
    );
    expect(() =>
      EnvSchema.parse({ ...deployedEnv, TESTER_ACCOUNTS_JSON: thirty }),
    ).not.toThrow();
  });

  it("refuses 31 tester entries", () => {
    const thirtyOne = JSON.stringify(
      Array.from({ length: 31 }, (_, index) => testerAccount(index + 1)),
    );
    expect(() =>
      EnvSchema.parse({ ...deployedEnv, TESTER_ACCOUNTS_JSON: thirtyOne }),
    ).toThrow(/TESTER_ACCOUNTS_JSON/);
  });

  it("refuses a bad tester phone, email, or code", () => {
    const bad = [
      { ...testerAccount(1), phone: "+15551234567" },
      { ...testerAccount(1), email: "Tester1@Example.com" },
      { ...testerAccount(1), email: "not-an-email" },
      { ...testerAccount(1), code: "12345" },
      { ...testerAccount(1), code: "1234567" },
      { phone: testerAccount(1).phone, email: testerAccount(1).email },
    ];
    for (const entry of bad) {
      expect(() =>
        EnvSchema.parse({
          ...deployedEnv,
          TESTER_ACCOUNTS_JSON: JSON.stringify([entry]),
        }),
      ).toThrow(/TESTER_ACCOUNTS_JSON/);
    }
  });

  it("refuses a duplicate phone or email within the tester list", () => {
    expect(() =>
      EnvSchema.parse({
        ...deployedEnv,
        TESTER_ACCOUNTS_JSON: JSON.stringify([
          testerAccount(1),
          { ...testerAccount(2), phone: testerAccount(1).phone },
        ]),
      }),
    ).toThrow(/TESTER_ACCOUNTS_JSON/);

    expect(() =>
      EnvSchema.parse({
        ...deployedEnv,
        TESTER_ACCOUNTS_JSON: JSON.stringify([
          testerAccount(1),
          { ...testerAccount(2), email: testerAccount(1).email },
        ]),
      }),
    ).toThrow(/TESTER_ACCOUNTS_JSON/);
  });

  it("refuses a tester phone or email that repeats a reviewer account", () => {
    const reviewers = JSON.stringify([
      reviewerDemoAccount(1),
      reviewerDemoAccount(2),
      reviewerDemoAccount(3),
    ]);

    expect(() =>
      EnvSchema.parse({
        ...deployedEnv,
        REVIEW_DEMO_ACCOUNT_ENABLED: "true",
        REVIEW_DEMO_ACCOUNTS_JSON: reviewers,
        TESTER_ACCOUNTS_JSON: JSON.stringify([
          { ...testerAccount(1), phone: reviewerDemoAccount(1).phone },
        ]),
      }),
    ).toThrow(/TESTER_ACCOUNTS_JSON/);

    expect(() =>
      EnvSchema.parse({
        ...deployedEnv,
        REVIEW_DEMO_ACCOUNT_ENABLED: "true",
        REVIEW_DEMO_ACCOUNTS_JSON: reviewers,
        TESTER_ACCOUNTS_JSON: JSON.stringify([
          { ...testerAccount(1), email: reviewerDemoAccount(2).email },
        ]),
      }),
    ).toThrow(/TESTER_ACCOUNTS_JSON/);
  });

  it("refuses reviewer overlap while the reviewer flag is off", () => {
    expect(() => EnvSchema.parse({ ...deployedEnv, REVIEW_DEMO_ACCOUNT_ENABLED: "false", REVIEW_DEMO_ACCOUNTS_JSON: JSON.stringify([reviewerDemoAccount(1)]), TESTER_ACCOUNTS_JSON: JSON.stringify([{ ...testerAccount(1), email: reviewerDemoAccount(1).email }]) })).toThrow(/TESTER_ACCOUNTS_JSON/);
  });

  it("refuses non-JSON and non-array tester lists", () => {
    expect(() =>
      EnvSchema.parse({ ...deployedEnv, TESTER_ACCOUNTS_JSON: "not-json" }),
    ).toThrow(/TESTER_ACCOUNTS_JSON/);
    expect(() =>
      EnvSchema.parse({ ...deployedEnv, TESTER_ACCOUNTS_JSON: "{}" }),
    ).toThrow(/TESTER_ACCOUNTS_JSON/);
  });
});

describe("EnvSchema deployed-environment endpoint rules", () => {
  it("accepts a coherent production configuration", () => {
    const env = EnvSchema.parse(deployedEnv);
    expect(env.APP_ENV).toBe("production");
  });

  it("rejects loopback data endpoints in staging and production", () => {
    expect(() =>
      EnvSchema.parse({
        ...deployedEnv,
        DATABASE_URL: "postgres://user:pass@localhost:5432/db",
      }),
    ).toThrow(/DATABASE_URL/);
    expect(() =>
      EnvSchema.parse({
        ...deployedEnv,
        APP_ENV: "staging",
        REDIS_URL: "redis://127.0.0.1:6379",
      }),
    ).toThrow(/REDIS_URL/);
  });

  it("rejects staging hosts from production and production hosts from staging", () => {
    expect(() =>
      EnvSchema.parse({
        ...deployedEnv,
        DATABASE_URL: "postgres://u:p@postgres-staging.internal:5432/db",
      }),
    ).toThrow(/DATABASE_URL/);
    expect(() =>
      EnvSchema.parse({
        ...deployedEnv,
        APP_ENV: "staging",
        MINIO_PUBLIC_URL: "https://minio-production.up.railway.app",
      }),
    ).toThrow(/MINIO_PUBLIC_URL/);
  });

  it("requires distinct private and public MinIO endpoints in deployed environments", () => {
    expect(() =>
      EnvSchema.parse({
        ...deployedEnv,
        MINIO_ENDPOINT: "https://minio-production.up.railway.app",
        MINIO_PUBLIC_URL: "https://minio-production.up.railway.app",
      }),
    ).toThrow(/MINIO_PUBLIC_URL/);
  });

  it("rejects internal MinIO public URLs and non-HTTPS production media URLs", () => {
    expect(() =>
      EnvSchema.parse({
        ...deployedEnv,
        MINIO_PUBLIC_URL: "http://minio.railway.internal:9000",
      }),
    ).toThrow(/MINIO_PUBLIC_URL/);
    expect(() =>
      EnvSchema.parse({
        ...deployedEnv,
        MINIO_PUBLIC_URL: "http://minio-production.up.railway.app",
      }),
    ).toThrow(/MINIO_PUBLIC_URL/);
  });

  it("allows local development to use one MinIO endpoint for private and public access", () => {
    expect(() =>
      EnvSchema.parse({
        ...baseEnv,
        MINIO_ENDPOINT: "http://localhost:9000",
        MINIO_PUBLIC_URL: "http://localhost:9000",
      }),
    ).not.toThrow();
  });

  it("rejects default MinIO credentials and placeholder JWT secrets in deployed envs", () => {
    expect(() =>
      EnvSchema.parse({ ...deployedEnv, MINIO_SECRET_KEY: "minioadmin" }),
    ).toThrow(/MINIO_ACCESS_KEY/);
    expect(() =>
      EnvSchema.parse({
        ...deployedEnv,
        JWT_ACCESS_SECRET: "replace_me_with_64_char_random_string_padded",
      }),
    ).toThrow(/JWT_ACCESS_SECRET/);
  });

  it("rejects identical JWT secrets and wildcard Socket.IO CORS in production", () => {
    expect(() =>
      EnvSchema.parse({
        ...deployedEnv,
        JWT_REFRESH_SECRET: deployedEnv.JWT_ACCESS_SECRET,
      }),
    ).toThrow(/JWT_REFRESH_SECRET/);
    expect(() =>
      EnvSchema.parse({ ...deployedEnv, SOCKET_IO_CORS_ORIGIN: "*" }),
    ).toThrow(/SOCKET_IO_CORS_ORIGIN/);
  });

  it("allows loopback endpoints in development", () => {
    expect(() => EnvSchema.parse(baseEnv)).not.toThrow();
  });
});

describe("EnvSchema client IP trust", () => {
  it("trusts X-Real-IP with one hop by default", () => {
    const env = EnvSchema.parse(baseEnv);

    expect(env.CLIENT_IP_HEADER).toBe("x-real-ip");
    expect(env.CLIENT_IP_TRUSTED_HOPS).toBe(1);
  });

  it("normalizes a configured header and hop count", () => {
    const env = EnvSchema.parse({
      ...baseEnv,
      CLIENT_IP_HEADER: " X-Forwarded-For ",
      CLIENT_IP_TRUSTED_HOPS: "2",
    });

    expect(env.CLIENT_IP_HEADER).toBe("x-forwarded-for");
    expect(env.CLIENT_IP_TRUSTED_HOPS).toBe(2);
  });

  it("accepts none to trust no header", () => {
    expect(EnvSchema.parse({ ...baseEnv, CLIENT_IP_HEADER: "none" }).CLIENT_IP_HEADER).toBe(
      "none",
    );
  });

  it("rejects a header that is not an HTTP header name and a bad hop count", () => {
    expect(() => EnvSchema.parse({ ...baseEnv, CLIENT_IP_HEADER: "x real ip" })).toThrow(
      /CLIENT_IP_HEADER/,
    );
    expect(() => EnvSchema.parse({ ...baseEnv, CLIENT_IP_TRUSTED_HOPS: "0" })).toThrow(
      /CLIENT_IP_TRUSTED_HOPS/,
    );
  });
});

describe("EnvSchema deploy metadata", () => {
  it("defaults APP_ENV to development and AUTOTM_COMMIT_SHA to unknown", () => {
    const env = EnvSchema.parse(baseEnv);
    expect(env.APP_ENV).toBe("development");
    expect(env.AUTOTM_COMMIT_SHA).toBe("unknown");
  });
});


describe("photo conversion maintenance setting", () => {
  it("defaults off and accepts only explicit true or false", () => {
    expect(EnvSchema.parse(baseEnv).PHOTO_CONVERSION_MAINTENANCE).toBe(false);
    expect(EnvSchema.parse({ ...baseEnv, PHOTO_CONVERSION_MAINTENANCE: "true" }).PHOTO_CONVERSION_MAINTENANCE).toBe(true);
    expect(EnvSchema.safeParse({ ...baseEnv, PHOTO_CONVERSION_MAINTENANCE: "yes" }).success).toBe(false);
  });
});


describe("Listing-view collection activation", () => {
  it("rejects activation without a dedicated stable salt secret", () => {
    expect(EnvSchema.safeParse({ ...baseEnv, LISTING_VIEWS_ENABLED: "true" }).success).toBe(false);
  });
});

it("requires a long dedicated view salt only for enabled collection", () => {
  expect(EnvSchema.parse(baseEnv).LISTING_VIEWS_ENABLED).toBe(false);
  expect(EnvSchema.safeParse({ ...baseEnv, LISTING_VIEWS_ENABLED: "true", LISTING_VIEW_SALT_SECRET: "short" }).success).toBe(false);
  expect(EnvSchema.parse({ ...baseEnv, LISTING_VIEWS_ENABLED: "true", LISTING_VIEW_SALT_SECRET: "synthetic-listing-view-secret-long-enough" }).LISTING_VIEWS_ENABLED).toBe(true);
});
