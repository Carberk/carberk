import { z } from "zod";

import { DEFAULT_EMAIL_DAILY_CAP } from "./email/domain/types";
import { normalizePrivateKey } from "./shared/pem";

const BaseSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  /**
   * Deployed-environment identity (independent of NODE_ENV): drives
   * fail-closed validation of endpoints and push-transport combinations.
   */
  APP_ENV: z
    .enum(["development", "staging", "production", "test"])
    .default("development"),
  /** Baked at image build from RAILWAY_GIT_COMMIT_SHA; used in boot logs. */
  AUTOTM_COMMIT_SHA: z.string().min(1).default("unknown"),
  LOG_LEVEL: z.enum(["error", "warn", "info", "debug"]).default("info"),

  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),

  MINIO_ENDPOINT: z.string().url(),
  MINIO_ACCESS_KEY: z.string().min(1),
  MINIO_SECRET_KEY: z.string().min(1),
  /** Same default as the API. Retired upload cleanup signs its storage requests with it. */
  MINIO_REGION: z.string().default("us-east-1"),

  PUSH_TRANSPORT: z
    .enum(["test", "fcm", "fcm-apns", "ntfy"])
    .default("test"),
  FCM_PROJECT_ID: z.string().optional(),
  FCM_CLIENT_EMAIL: z.string().optional(),
  FCM_PRIVATE_KEY: z.string().optional(),
  APNS_KEY_ID: z.string().optional(),
  APNS_TEAM_ID: z.string().optional(),
  APNS_BUNDLE_ID: z.string().optional(),
  APNS_PRIVATE_KEY: z.string().optional(),
  /**
   * Selects the APNS host explicitly. Not derived from APP_ENV: EAS `internal`
   * distribution signs iOS with production entitlements, so staging can hold
   * production APNS tokens. The wrong host answers `BadDeviceToken`, which
   * would deactivate healthy devices.
   */
  APNS_PRODUCTION: z.enum(["true", "false"]).optional(),

  /** ADR-0055. `mock` delivers nothing and needs no key; `resend` sends for real. */
  EMAIL_DRIVER: z.enum(["mock", "resend"]).default("mock"),
  /** e.g. `AutoTM <no-reply@autotm.bagtyyar.dev>`. Required for `resend`. */
  EMAIL_FROM: z.string().optional(),
  /** Sends allowed per UTC day, counted in Redis. 80 stays under Resend Free's 100. */
  EMAIL_DAILY_CAP: z.coerce.number().int().positive().default(DEFAULT_EMAIL_DAILY_CAP),
  RESEND_API_KEY: z.string().optional(),
});

type BaseEnv = z.infer<typeof BaseSchema>;

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

const FCM_REQUIRED_VARS = [
  "FCM_PROJECT_ID",
  "FCM_CLIENT_EMAIL",
  "FCM_PRIVATE_KEY",
] as const;

const APNS_REQUIRED_VARS = [
  "APNS_KEY_ID",
  "APNS_TEAM_ID",
  "APNS_BUNDLE_ID",
  "APNS_PRIVATE_KEY",
  "APNS_PRODUCTION",
] as const;

/**
 * Credentials each delivering transport needs to boot. `fcm` (ADR-0047) carries
 * the Android-first launch window and deliberately requires no Apple value;
 * `fcm-apns` requires both sets.
 */
const REQUIRED_VARS_BY_TRANSPORT = {
  fcm: FCM_REQUIRED_VARS,
  "fcm-apns": [...FCM_REQUIRED_VARS, ...APNS_REQUIRED_VARS],
} as const satisfies Record<string, readonly (keyof BaseEnv)[]>;

const PRIVATE_KEY_VARS: readonly string[] = [
  "FCM_PRIVATE_KEY",
  "APNS_PRIVATE_KEY",
];

function validateEndpoints(env: BaseEnv, add: (path: string, message: string) => void): void {
  if (!DEPLOYED_ENVS.has(env.APP_ENV)) return;

  const endpoints: Array<[string, string]> = [
    ["DATABASE_URL", env.DATABASE_URL],
    ["REDIS_URL", env.REDIS_URL],
    ["MINIO_ENDPOINT", env.MINIO_ENDPOINT],
  ];

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

  if (
    env.MINIO_ACCESS_KEY === "minioadmin" ||
    env.MINIO_SECRET_KEY === "minioadmin"
  ) {
    add("MINIO_ACCESS_KEY", "default MinIO credentials are forbidden outside development");
  }
}

/**
 * Push contract (Sprint 11): the `test` transport records sends in memory and
 * delivers nothing, so it must be impossible to boot production with it. The
 * delivering transports reach real providers, so booting one with a partial or
 * unparseable credential set is also forbidden — the worker must fail visibly
 * at boot rather than silently drop pushes. Each transport is checked against
 * its own required set, so `fcm` does not inherit `fcm-apns`'s Apple values.
 */
function validatePushContract(env: BaseEnv, add: (path: string, message: string) => void): void {
  if (env.APP_ENV === "production" && env.PUSH_TRANSPORT === "test") {
    add(
      "PUSH_TRANSPORT",
      "PUSH_TRANSPORT=test delivers nothing and is forbidden in production",
    );
  }

  const required = REQUIRED_VARS_BY_TRANSPORT[
    env.PUSH_TRANSPORT as keyof typeof REQUIRED_VARS_BY_TRANSPORT
  ] as readonly (keyof BaseEnv)[] | undefined;
  if (required === undefined) return;

  for (const name of required) {
    const value = env[name];
    if (typeof value !== "string" || value.trim() === "") {
      add(
        name,
        `${name} is required when PUSH_TRANSPORT=${env.PUSH_TRANSPORT} (incomplete push credentials)`,
      );
    }
  }

  // Provider private keys arrive escaped and shell-quoted. Parsing them at boot
  // turns a malformed secret into a startup failure instead of a silent
  // per-message delivery failure. Only keys this transport actually uses are
  // parsed, so a stray APNS value cannot crash an `fcm` worker. The key value
  // is never echoed.
  for (const name of required) {
    if (!PRIVATE_KEY_VARS.includes(name)) continue;
    const value = env[name];
    if (typeof value !== "string" || value.trim() === "") continue;
    try {
      normalizePrivateKey(name, value);
    } catch {
      add(name, `${name} is not a parseable PEM private key`);
    }
  }
}

/**
 * Email contract (ADR-0055): `resend` reaches a real provider, so it must boot
 * with a sending key and a From address, or not at all. The key is never
 * echoed.
 */
function validateEmailContract(env: BaseEnv, add: (path: string, message: string) => void): void {
  if (env.EMAIL_DRIVER !== "resend") return;

  for (const name of ["RESEND_API_KEY", "EMAIL_FROM"] as const) {
    const value = env[name];
    if (typeof value !== "string" || value.trim() === "") {
      add(name, `${name} is required when EMAIL_DRIVER=resend`);
    }
  }
}

export const EnvSchema = BaseSchema.superRefine((env, ctx) => {
  const add = (path: string, message: string) =>
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });

  validateEndpoints(env, add);
  validatePushContract(env, add);
  validateEmailContract(env, add);
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
  throw new Error(`Invalid worker environment: ${details}`);
}
