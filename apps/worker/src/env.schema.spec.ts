import { describe, expect, it } from "vitest";

import { EnvSchema } from "./env.schema";

const baseEnv = {
  NODE_ENV: "test",
  DATABASE_URL: "postgres://user:pass@localhost:5432/db",
  REDIS_URL: "redis://localhost:6379",
  MINIO_ENDPOINT: "http://localhost:9000",
  MINIO_ACCESS_KEY: "minioadmin",
  MINIO_SECRET_KEY: "minioadmin",
};

const deployedEnv = {
  ...baseEnv,
  NODE_ENV: "production",
  APP_ENV: "production",
  DATABASE_URL: "postgres://user:pass@postgres.railway.internal:5432/railway",
  REDIS_URL: "redis://default:pass@redis.railway.internal:6379",
  MINIO_ENDPOINT: "http://minio.railway.internal:9000",
  MINIO_ACCESS_KEY: "deployed-key",
  MINIO_SECRET_KEY: "deployed-secret",
};

const fullPushCredentials = {
  FCM_PROJECT_ID: "autotm-prod",
  FCM_CLIENT_EMAIL: "firebase@autotm-prod.iam.gserviceaccount.com",
  FCM_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----\\n",
  APNS_KEY_ID: "ABCD1234",
  APNS_TEAM_ID: "TEAM1234",
  APNS_BUNDLE_ID: "tm.auto.app",
  APNS_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\\nxyz\\n-----END PRIVATE KEY-----\\n",
  APNS_PRODUCTION: "true",
};

describe("worker EnvSchema push contract", () => {
  it("defaults PUSH_TRANSPORT to test outside production", () => {
    const env = EnvSchema.parse(baseEnv);
    expect(env.PUSH_TRANSPORT).toBe("test");
  });

  it("rejects the test push transport in production", () => {
    expect(() =>
      EnvSchema.parse({ ...deployedEnv, PUSH_TRANSPORT: "test" }),
    ).toThrow(/PUSH_TRANSPORT/);
  });

  it("still allows the test push transport in staging", () => {
    expect(() =>
      EnvSchema.parse({
        ...deployedEnv,
        APP_ENV: "staging",
        MINIO_ENDPOINT: "http://minio-staging.internal:9000",
        PUSH_TRANSPORT: "test",
      }),
    ).not.toThrow();
  });

  it("accepts fcm-apns in production with complete credentials", () => {
    const env = EnvSchema.parse({
      ...deployedEnv,
      PUSH_TRANSPORT: "fcm-apns",
      ...fullPushCredentials,
    });
    expect(env.PUSH_TRANSPORT).toBe("fcm-apns");
  });

  it.each([
    "FCM_PROJECT_ID",
    "FCM_CLIENT_EMAIL",
    "FCM_PRIVATE_KEY",
    "APNS_KEY_ID",
    "APNS_TEAM_ID",
    "APNS_BUNDLE_ID",
    "APNS_PRIVATE_KEY",
    "APNS_PRODUCTION",
  ])("fails boot when %s is missing for fcm-apns", (missing) => {
    const credentials = { ...fullPushCredentials } as Record<string, string>;
    Reflect.deleteProperty(credentials, missing);

    expect(() =>
      EnvSchema.parse({
        ...deployedEnv,
        PUSH_TRANSPORT: "fcm-apns",
        ...credentials,
      }),
    ).toThrow(new RegExp(missing));
  });

  it("accepts fcm in production with only the FCM credentials (ADR-0047)", () => {
    const env = EnvSchema.parse({
      ...deployedEnv,
      PUSH_TRANSPORT: "fcm",
      FCM_PROJECT_ID: fullPushCredentials.FCM_PROJECT_ID,
      FCM_CLIENT_EMAIL: fullPushCredentials.FCM_CLIENT_EMAIL,
      FCM_PRIVATE_KEY: fullPushCredentials.FCM_PRIVATE_KEY,
    });
    expect(env.PUSH_TRANSPORT).toBe("fcm");
  });

  it.each(["APNS_KEY_ID", "APNS_TEAM_ID", "APNS_PRIVATE_KEY"])(
    "does not require %s for fcm",
    (apnsVar) => {
      // The whole point of ADR-0047: these three are Apple-issued and cannot
      // exist before the 2026-10-12 enrolment, so `fcm` must boot without them.
      expect(() =>
        EnvSchema.parse({
          ...deployedEnv,
          PUSH_TRANSPORT: "fcm",
          ...fullPushCredentials,
          [apnsVar]: undefined,
        }),
      ).not.toThrow();
    },
  );

  it.each(["FCM_PROJECT_ID", "FCM_CLIENT_EMAIL", "FCM_PRIVATE_KEY"])(
    "fails boot when %s is missing for fcm",
    (missing) => {
      const credentials = { ...fullPushCredentials } as Record<string, string>;
      Reflect.deleteProperty(credentials, missing);

      expect(() =>
        EnvSchema.parse({
          ...deployedEnv,
          PUSH_TRANSPORT: "fcm",
          ...credentials,
        }),
      ).toThrow(new RegExp(`${missing} is required when PUSH_TRANSPORT=fcm `));
    },
  );

  it("rejects an unparseable FCM private key under fcm", () => {
    expect(() =>
      EnvSchema.parse({
        ...deployedEnv,
        PUSH_TRANSPORT: "fcm",
        ...fullPushCredentials,
        FCM_PRIVATE_KEY: "not-a-pem-block",
      }),
    ).toThrow(/FCM_PRIVATE_KEY is not a parseable PEM private key/);
  });

  it("ignores a malformed APNS key under fcm, which never reads it", () => {
    expect(() =>
      EnvSchema.parse({
        ...deployedEnv,
        PUSH_TRANSPORT: "fcm",
        ...fullPushCredentials,
        APNS_PRIVATE_KEY: "not-a-pem-block",
      }),
    ).not.toThrow();
  });

  it("requires APNS_PRODUCTION to be an explicit boolean string", () => {
    expect(() =>
      EnvSchema.parse({
        ...deployedEnv,
        PUSH_TRANSPORT: "fcm-apns",
        ...fullPushCredentials,
        APNS_PRODUCTION: "yes",
      }),
    ).toThrow(/APNS_PRODUCTION/);
  });

  it("rejects an unparseable FCM private key", () => {
    expect(() =>
      EnvSchema.parse({
        ...deployedEnv,
        PUSH_TRANSPORT: "fcm-apns",
        ...fullPushCredentials,
        FCM_PRIVATE_KEY: "not-a-pem-block",
      }),
    ).toThrow(/FCM_PRIVATE_KEY is not a parseable PEM private key/);
  });

  it("rejects an unparseable APNS private key", () => {
    expect(() =>
      EnvSchema.parse({
        ...deployedEnv,
        PUSH_TRANSPORT: "fcm-apns",
        ...fullPushCredentials,
        APNS_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----",
      }),
    ).toThrow(/APNS_PRIVATE_KEY is not a parseable PEM private key/);
  });

  it("accepts a shell-quoted escaped private key", () => {
    expect(() =>
      EnvSchema.parse({
        ...deployedEnv,
        PUSH_TRANSPORT: "fcm-apns",
        ...fullPushCredentials,
        FCM_PRIVATE_KEY:
          '"-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----"',
      }),
    ).not.toThrow();
  });

  it("never echoes private key material in the validation error", () => {
    try {
      EnvSchema.parse({
        ...deployedEnv,
        PUSH_TRANSPORT: "fcm-apns",
        ...fullPushCredentials,
        APNS_PRIVATE_KEY: "leaked-secret-material",
      });
      expect.unreachable("expected the malformed key to fail validation");
    } catch (error) {
      expect(String(error)).not.toContain("leaked-secret-material");
      expect(String(error)).toContain("APNS_PRIVATE_KEY");
    }
  });

  it("ignores push credentials entirely when the transport is test", () => {
    expect(() =>
      EnvSchema.parse({ ...baseEnv, FCM_PRIVATE_KEY: "garbage" }),
    ).not.toThrow();
  });

  it("rejects blank credential values for fcm-apns", () => {
    expect(() =>
      EnvSchema.parse({
        ...deployedEnv,
        PUSH_TRANSPORT: "fcm-apns",
        ...fullPushCredentials,
        APNS_PRIVATE_KEY: "   ",
      }),
    ).toThrow(/APNS_PRIVATE_KEY/);
  });
});

describe("worker EnvSchema deployed-environment endpoint rules", () => {
  it("accepts a coherent production configuration", () => {
    expect(() =>
      EnvSchema.parse({
        ...deployedEnv,
        PUSH_TRANSPORT: "fcm-apns",
        ...fullPushCredentials,
      }),
    ).not.toThrow();
  });

  it("rejects loopback data endpoints in deployed environments", () => {
    expect(() =>
      EnvSchema.parse({
        ...deployedEnv,
        DATABASE_URL: "postgres://user:pass@localhost:5432/db",
        PUSH_TRANSPORT: "fcm-apns",
        ...fullPushCredentials,
      }),
    ).toThrow(/DATABASE_URL/);
  });

  it("rejects staging data stores from production", () => {
    expect(() =>
      EnvSchema.parse({
        ...deployedEnv,
        REDIS_URL: "redis://default:pass@redis-staging.internal:6379",
        PUSH_TRANSPORT: "fcm-apns",
        ...fullPushCredentials,
      }),
    ).toThrow(/REDIS_URL/);
  });

  it("rejects default MinIO credentials in deployed environments", () => {
    expect(() =>
      EnvSchema.parse({
        ...deployedEnv,
        MINIO_ACCESS_KEY: "minioadmin",
        PUSH_TRANSPORT: "fcm-apns",
        ...fullPushCredentials,
      }),
    ).toThrow(/MINIO_ACCESS_KEY/);
  });
});

describe("worker EnvSchema deploy metadata", () => {
  it("defaults APP_ENV to development and AUTOTM_COMMIT_SHA to unknown", () => {
    const env = EnvSchema.parse(baseEnv);
    expect(env.APP_ENV).toBe("development");
    expect(env.AUTOTM_COMMIT_SHA).toBe("unknown");
  });
});

describe("worker EnvSchema email contract (ADR-0055)", () => {
  it("defaults to the mock driver and a daily cap of 80", () => {
    const env = EnvSchema.parse(baseEnv);
    expect(env.EMAIL_DRIVER).toBe("mock");
    expect(env.EMAIL_DAILY_CAP).toBe(80);
  });

  it("reads EMAIL_DAILY_CAP from a string", () => {
    expect(EnvSchema.parse({ ...baseEnv, EMAIL_DAILY_CAP: "40" }).EMAIL_DAILY_CAP).toBe(40);
  });

  it("rejects a zero daily cap", () => {
    expect(EnvSchema.safeParse({ ...baseEnv, EMAIL_DAILY_CAP: "0" }).success).toBe(false);
  });

  it("requires RESEND_API_KEY and EMAIL_FROM for the resend driver", () => {
    const result = EnvSchema.safeParse({ ...baseEnv, EMAIL_DRIVER: "resend", RESEND_API_KEY: " " });
    expect(result.success).toBe(false);
    const paths = result.success ? [] : result.error.issues.map((issue) => issue.path[0]);
    expect(paths).toEqual(expect.arrayContaining(["RESEND_API_KEY", "EMAIL_FROM"]));
  });

  it("accepts the resend driver with a key and a From address", () => {
    const env = EnvSchema.parse({
      ...baseEnv,
      EMAIL_DRIVER: "resend",
      RESEND_API_KEY: "re_test_key",
      EMAIL_FROM: "Carberk <no-reply@autotm.bagtyyar.dev>",
    });
    expect(env.EMAIL_DRIVER).toBe("resend");
  });
});


describe("photo conversion maintenance setting", () => {
  it("defaults off and accepts only explicit true or false", () => {
    expect(EnvSchema.parse(baseEnv).PHOTO_CONVERSION_MAINTENANCE).toBe(false);
    expect(EnvSchema.parse({ ...baseEnv, PHOTO_CONVERSION_MAINTENANCE: "true" }).PHOTO_CONVERSION_MAINTENANCE).toBe(true);
    expect(EnvSchema.safeParse({ ...baseEnv, PHOTO_CONVERSION_MAINTENANCE: "yes" }).success).toBe(false);
  });
});
