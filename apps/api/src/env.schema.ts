import { z } from "zod";

import { clientIpEnvShape } from "./common/client-ip";

const booleanFlag = z
  .string()
  .transform((v) => v === "true")
  .default("false");

const BaseSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  /**
   * Deployed-environment identity (independent of NODE_ENV): drives
   * fail-closed validation of endpoints and reviewer-era unsafe combinations.
   * Railway sets this explicitly per environment; local dev stays
   * "development".
   */
  APP_ENV: z
    .enum(["development", "staging", "production", "test"])
    .default("development"),
  /** Baked at image build from RAILWAY_GIT_COMMIT_SHA; surfaced by /healthz. */
  AUTOTM_COMMIT_SHA: z.string().min(1).default("unknown"),
  PORT: z.coerce.number().int().positive().default(3006),
  /** Operator-only startup mode: no business request handlers or queue consumers run. */
  PHOTO_CONVERSION_MAINTENANCE: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
  LOG_LEVEL: z.enum(["error", "warn", "info", "debug"]).default("info"),

  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),

  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_TTL: z.string().default("15m"),
  JWT_REFRESH_TTL: z.string().default("30d"),

  SMS_GATEWAY_URL: z.string().default("http://localhost:3090"),
  SMS_GATEWAY_TOKEN: z.string().default("replace_me_with_random_token"),
  SMS_DRIVER: z.enum(["mock", "test", "gateway"]).default("mock"),

  OTP_TEST_MODE: booleanFlag,
  OTP_TEST_CODE_RESPONSE: booleanFlag,

  REVIEW_DEMO_ACCOUNT_ENABLED: booleanFlag,
  REVIEW_DEMO_ACCOUNTS_JSON: z.string().default("[]"),
  TESTER_ACCOUNTS_JSON: z.string().default("[]"),

  RATE_LIMIT_GENERAL: z.coerce.number().int().positive().default(60),
  RATE_LIMIT_OTP_PHONE_DAILY: z.coerce.number().int().positive().default(5),
  RATE_LIMIT_OTP_IP_HOURLY: z.coerce.number().int().positive().default(10),
  ...clientIpEnvShape,

  TOTP_SECRET_ENCRYPTION_KEY: z.string().refine(
    (val) => {
      try {
        return Buffer.from(val, "base64").length === 32;
      } catch {
        return false;
      }
    },
    { message: "TOTP_SECRET_ENCRYPTION_KEY must be a 32-byte base64 string" },
  ),

  SOCKET_IO_NAMESPACE: z.string().min(1).default("/ws/chat"),
  SOCKET_IO_CORS_ORIGIN: z.string().min(1).default("*"),
  SOCKET_IO_REDIS_ADAPTER_ENABLED: booleanFlag,

  MINIO_ENDPOINT: z.string().default("http://localhost:9000"),
  MINIO_PUBLIC_URL: z.string().default("http://localhost:9000"),
  MINIO_ACCESS_KEY: z.string().default("minioadmin"),
  MINIO_SECRET_KEY: z.string().default("minioadmin"),
  MINIO_REGION: z.string().default("us-east-1"),

  REPORT_ENTRY_ENABLED: z
    .string()
    .transform((v) => v === "true")
    .default("true"),

  ADMIN_MODERATION_ACTIONS_ENABLED: z
    .string()
    .transform((v) => v === "true")
    .default("true"),

  INSPECTION_INTEREST_ENABLED: booleanFlag,
  SERVICE_SYNTHETIC_ENABLED: booleanFlag,
  MEASUREMENT_ENABLED: booleanFlag,
  MEASUREMENT_SYNTHETIC_CAPABILITY_HASH: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  MEASUREMENT_SYNTHETIC_CAPABILITY_EXPIRES_AT: z.string().datetime().optional(),
  MEASUREMENT_COLLECTOR_EPOCH: z.string().uuid().optional(),
  MEASUREMENT_EVIDENCE_REF: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/).optional(),
  // Only synthetic population is currently composable. Real activation needs its independent evidence gate.
  LISTING_VIEWS_ENABLED: booleanFlag,
  LISTING_VIEW_SALT_SECRET: z.string().min(32).optional(),
});

type BaseEnv = z.infer<typeof BaseSchema>;

const PLACEHOLDER_PATTERN = /replace_me/i;

function hostnameOf(rawUrl: string): string | null {
  try {
    return new URL(rawUrl).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function isLoopbackHost(host: string): boolean {
  return (
    host === "localhost" ||
    host === "::1" ||
    host === "[::1]" ||
    host === "0.0.0.0" ||
    host.startsWith("127.")
  );
}

/**
 * Heuristic cross-environment guard: a production service must never point
 * at staging data stores and vice versa. Railway-generated hosts and human
 * runbooks both name environments, so the environment token appearing in a
 * data-endpoint host is treated as a misconfiguration.
 */
function referencesOtherEnvironment(host: string, appEnv: string): boolean {
  if (appEnv === "production") {
    return host.includes("staging");
  }
  if (appEnv === "staging") {
    return (
      host.includes("production") || /(^|[^a-z])prod([-.]|$)/.test(host)
    );
  }
  return false;
}

const DEPLOYED_ENVS = new Set(["staging", "production"]);

function validateEndpoints(env: BaseEnv, add: (path: string, message: string) => void): void {
  if (!DEPLOYED_ENVS.has(env.APP_ENV)) return;

  const endpoints: Array<[string, string]> = [
    ["DATABASE_URL", env.DATABASE_URL],
    ["REDIS_URL", env.REDIS_URL],
    ["MINIO_ENDPOINT", env.MINIO_ENDPOINT],
    ["MINIO_PUBLIC_URL", env.MINIO_PUBLIC_URL],
  ];
  if (env.SMS_DRIVER === "gateway") {
    endpoints.push(["SMS_GATEWAY_URL", env.SMS_GATEWAY_URL]);
  }

  for (const [name, rawUrl] of endpoints) {
    const host = hostnameOf(rawUrl);
    if (host === null) {
      add(name, `${name} must be a valid URL in ${env.APP_ENV}`);
      continue;
    }
    if (isLoopbackHost(host)) {
      add(name, `${name} must not point at a loopback host in ${env.APP_ENV}`);
    }
    if (referencesOtherEnvironment(host, env.APP_ENV)) {
      add(
        name,
        `${name} appears to reference a different environment than APP_ENV=${env.APP_ENV}`,
      );
    }
  }

  const minioPrivateHost = hostnameOf(env.MINIO_ENDPOINT);
  const minioPublicHost = hostnameOf(env.MINIO_PUBLIC_URL);
  if (minioPrivateHost !== null && minioPublicHost !== null) {
    if (minioPrivateHost === minioPublicHost) {
      add(
        "MINIO_PUBLIC_URL",
        "MINIO_PUBLIC_URL must be a distinct public S3 endpoint; MINIO_ENDPOINT stays private",
      );
    }
    if (
      minioPublicHost.endsWith(".railway.internal") ||
      minioPublicHost.includes("internal")
    ) {
      add("MINIO_PUBLIC_URL", "MINIO_PUBLIC_URL must not use a private/internal host");
    }
    if (env.APP_ENV === "production" && new URL(env.MINIO_PUBLIC_URL).protocol !== "https:") {
      add("MINIO_PUBLIC_URL", "MINIO_PUBLIC_URL must use HTTPS in production");
    }
  }
}

function validateSecrets(env: BaseEnv, add: (path: string, message: string) => void): void {
  if (!DEPLOYED_ENVS.has(env.APP_ENV)) return;

  if (env.JWT_ACCESS_SECRET === env.JWT_REFRESH_SECRET) {
    add("JWT_REFRESH_SECRET", "JWT access and refresh secrets must differ");
  }
  if (PLACEHOLDER_PATTERN.test(env.JWT_ACCESS_SECRET)) {
    add("JWT_ACCESS_SECRET", "JWT_ACCESS_SECRET still holds a placeholder value");
  }
  if (PLACEHOLDER_PATTERN.test(env.JWT_REFRESH_SECRET)) {
    add("JWT_REFRESH_SECRET", "JWT_REFRESH_SECRET still holds a placeholder value");
  }
  if (
    env.MINIO_ACCESS_KEY === "minioadmin" ||
    env.MINIO_SECRET_KEY === "minioadmin"
  ) {
    add("MINIO_ACCESS_KEY", "default MinIO credentials are forbidden outside development");
  }
  if (env.SMS_DRIVER === "gateway" && PLACEHOLDER_PATTERN.test(env.SMS_GATEWAY_TOKEN)) {
    add("SMS_GATEWAY_TOKEN", "SMS_DRIVER=gateway requires a real SMS_GATEWAY_TOKEN");
  }
  if (env.APP_ENV === "production" && env.SOCKET_IO_CORS_ORIGIN === "*") {
    add("SOCKET_IO_CORS_ORIGIN", "wildcard Socket.IO CORS origin is forbidden in production");
  }
}

/**
 * Reviewer-era fail-closed rules (ADR-0039 / Sprint 11): response-embedded
 * OTP codes and the `test` SMS driver exist only so CI can assert OTP flows;
 * they must be impossible to enable in any real environment.
 */
function validateReviewerSafety(env: BaseEnv, add: (path: string, message: string) => void): void {
  if (env.NODE_ENV === "test") return;

  if (env.SMS_DRIVER === "test") {
    add("SMS_DRIVER", "SMS_DRIVER=test is only allowed in CI (NODE_ENV=test)");
  }
  if (env.OTP_TEST_MODE) {
    add("OTP_TEST_MODE", "OTP_TEST_MODE is only allowed in CI (NODE_ENV=test)");
  }
  if (env.OTP_TEST_CODE_RESPONSE) {
    add(
      "OTP_TEST_CODE_RESPONSE",
      "OTP_TEST_CODE_RESPONSE is only allowed in CI (NODE_ENV=test)",
    );
  }

  validateReviewerDemoAccounts(env, add);
  validateTesterAccounts(env, add);
}

interface FixedCodeAccountFields {
  phone?: unknown;
  email?: unknown;
  code?: unknown;
}

function asFixedCodeAccount(entry: unknown): { phone: string; email: string; code: string } | null {
  if (
    typeof entry !== "object" ||
    entry === null ||
    typeof (entry as FixedCodeAccountFields).phone !== "string" ||
    typeof (entry as FixedCodeAccountFields).email !== "string" ||
    typeof (entry as FixedCodeAccountFields).code !== "string"
  ) {
    return null;
  }
  return entry as { phone: string; email: string; code: string };
}

function validateTesterAccounts(
  env: BaseEnv,
  add: (path: string, message: string) => void,
): void {
  let parsed: unknown;
  try {
    parsed = JSON.parse(env.TESTER_ACCOUNTS_JSON);
  } catch {
    add("TESTER_ACCOUNTS_JSON", "TESTER_ACCOUNTS_JSON must be valid JSON");
    return;
  }

  if (!Array.isArray(parsed)) {
    add("TESTER_ACCOUNTS_JSON", "TESTER_ACCOUNTS_JSON must be a JSON array");
    return;
  }

  // ADR-0086 caps the temporary tester list at 30 accounts.
  if (parsed.length > 30) {
    add("TESTER_ACCOUNTS_JSON", "TESTER_ACCOUNTS_JSON holds at most 30 tester accounts");
    return;
  }

  const phones = new Set<string>();
  const emails = new Set<string>();
  for (const entry of parsed) {
    const account = asFixedCodeAccount(entry);
    if (account === null) {
      add(
        "TESTER_ACCOUNTS_JSON",
        "Each tester account must include string phone, email, and code fields",
      );
      return;
    }
    if (!/^\+993\d{8}$/.test(account.phone)) {
      add("TESTER_ACCOUNTS_JSON", "Tester account phones must be +993 E.164 numbers");
      return;
    }
    if (!/^\d{6}$/.test(account.code)) {
      add("TESTER_ACCOUNTS_JSON", "Tester account codes must be exactly 6 digits");
      return;
    }
    if (
      account.email !== account.email.trim().toLowerCase() ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(account.email) ||
      account.email.length > 254
    ) {
      add(
        "TESTER_ACCOUNTS_JSON",
        "Tester account emails must be normalized valid addresses",
      );
      return;
    }
    if (phones.has(account.phone)) {
      add("TESTER_ACCOUNTS_JSON", "Tester account phones must be unique");
      return;
    }
    phones.add(account.phone);
    if (emails.has(account.email)) {
      add("TESTER_ACCOUNTS_JSON", "Tester account emails must be unique");
      return;
    }
    emails.add(account.email);
  }

  // A tester never shares a phone or email with a reviewer account
  // (ADR-0086), so the two fixed-code lists stay disjoint.
  let reviewerParsed: unknown;
  try {
    reviewerParsed = JSON.parse(env.REVIEW_DEMO_ACCOUNTS_JSON);
  } catch {
    return;
  }
  if (!Array.isArray(reviewerParsed)) return;
  for (const entry of reviewerParsed) {
    const reviewer = asFixedCodeAccount(entry);
    if (reviewer === null) continue;
    if (phones.has(reviewer.phone) || emails.has(reviewer.email)) {
      add(
        "TESTER_ACCOUNTS_JSON",
        "Tester accounts must not repeat a reviewer account phone or email",
      );
      return;
    }
  }
}

function validateReviewerDemoAccounts(
  env: BaseEnv,
  add: (path: string, message: string) => void,
): void {
  let parsed: unknown;
  try {
    parsed = JSON.parse(env.REVIEW_DEMO_ACCOUNTS_JSON);
  } catch {
    add("REVIEW_DEMO_ACCOUNTS_JSON", "REVIEW_DEMO_ACCOUNTS_JSON must be valid JSON");
    return;
  }

  if (!Array.isArray(parsed)) {
    add("REVIEW_DEMO_ACCOUNTS_JSON", "REVIEW_DEMO_ACCOUNTS_JSON must be a JSON array");
    return;
  }

  if (!env.REVIEW_DEMO_ACCOUNT_ENABLED) {
    return;
  }

  if (parsed.length < 3 || parsed.length > 5) {
    add(
      "REVIEW_DEMO_ACCOUNTS_JSON",
      "REVIEW_DEMO_ACCOUNT_ENABLED requires 3 to 5 reviewer demo accounts",
    );
    return;
  }

  const phones = new Set<string>();
  const emails = new Set<string>();
  for (const entry of parsed) {
    if (
      typeof entry !== "object" ||
      entry === null ||
      typeof (entry as { phone?: unknown }).phone !== "string" ||
      typeof (entry as { email?: unknown }).email !== "string" ||
      typeof (entry as { code?: unknown }).code !== "string"
    ) {
      add(
        "REVIEW_DEMO_ACCOUNTS_JSON",
        "Each reviewer demo account must include string phone, email, and code fields",
      );
      return;
    }

    const { phone, email, code } = entry as {
      phone: string;
      email: string;
      code: string;
    };
    if (!/^\+993\d{8}$/.test(phone)) {
      add("REVIEW_DEMO_ACCOUNTS_JSON", "Reviewer demo account phones must be +993 E.164 numbers");
      return;
    }
    // Exactly six digits, because a reviewer code is an OTP code: it is
    // submitted to POST /auth/otp/verify, whose contract
    // (`OtpVerifyRequestSchema.code` in @auto-tm/contracts) is /^\d{6}$/. A
    // wider rule here accepts a code at boot that the HTTP layer then rejects
    // with VALIDATION_FAILED before the bypass is ever consulted, which reads
    // as "wrong code" and is undebuggable from the reviewer's side.
    if (!/^\d{6}$/.test(code)) {
      add("REVIEW_DEMO_ACCOUNTS_JSON", "Reviewer demo account codes must be exactly 6 digits");
      return;
    }
    if (
      email !== email.trim().toLowerCase() ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      email.length > 254
    ) {
      add(
        "REVIEW_DEMO_ACCOUNTS_JSON",
        "Reviewer demo account emails must be normalized valid addresses",
      );
      return;
    }
    if (phones.has(phone)) {
      add("REVIEW_DEMO_ACCOUNTS_JSON", "Reviewer demo account phones must be unique");
      return;
    }
    phones.add(phone);
    if (emails.has(email)) {
      add("REVIEW_DEMO_ACCOUNTS_JSON", "Reviewer demo account emails must be unique");
      return;
    }
    emails.add(email);
  }
}

export const EnvSchema = BaseSchema.superRefine((env, ctx) => {
  const add = (path: string, message: string) =>
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });

  if (env.LISTING_VIEWS_ENABLED && !env.LISTING_VIEW_SALT_SECRET) {
    add("LISTING_VIEW_SALT_SECRET", "Listing views require a dedicated stable salt secret");
  }
  if (env.MEASUREMENT_ENABLED && (!env.MEASUREMENT_COLLECTOR_EPOCH || !env.MEASUREMENT_EVIDENCE_REF)) {
    add("MEASUREMENT_ENABLED", "Measurement requires externally provisioned collector epoch and admitted evidence");
  }
  validateEndpoints(env, add);
  validateSecrets(env, add);
  validateReviewerSafety(env, add);
});

export type Env = z.infer<typeof EnvSchema>;

export function parseEnv(config: Record<string, unknown>): Env {
  const result = EnvSchema.safeParse(config);
  if (result.success) {
    return result.data;
  }

  const details = result.error.issues
    .map((issue) => `${issue.path.join(".") || "<root>"}: ${issue.message}`)
    .join("; ");
  throw new Error(`Invalid API environment: ${details}`);
}
