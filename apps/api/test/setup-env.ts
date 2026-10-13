import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { inject } from "vitest";

import { workerUrls } from "./helpers/testDatabases";

const hadOtpTestMode = "OTP_TEST_MODE" in process.env;

const envPath = resolve(__dirname, "../.env");
if (existsSync(envPath)) {
  process.loadEnvFile(envPath);
}

// Tests expect OTP_TEST_MODE to be unset by default (the first describe block
// asserts testCode is undefined). If it came from .env rather than the shell,
// remove it so the suite runs clean. Tests that need test mode explicitly set
// it in their beforeAll.
if (!hadOtpTestMode) {
  delete process.env["OTP_TEST_MODE"];
}

// Tests that instantiate IdentityModule (and therefore AesGcmTotpSecretCipher)
// need a valid 32-byte base64 encryption key.
if (!process.env["TOTP_SECRET_ENCRYPTION_KEY"]) {
  process.env["TOTP_SECRET_ENCRYPTION_KEY"] =
    "MDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDA=";
}

// Spec files run in parallel, each worker on its own Postgres database and
// Redis logical database (test/globalSetup.ts). PrismaService, BullMQ and the
// Redis clients read these when constructed, after this file has run.
const databases = inject("apiTestDatabases");
if (databases) {
  const urls = workerUrls(databases, Number(process.env["VITEST_POOL_ID"]));
  process.env["DATABASE_URL"] = urls.databaseUrl;
  process.env["REDIS_URL"] = urls.redisUrl;
}
