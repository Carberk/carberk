import { z } from "zod";
import type { DiagnosticAdmission } from "../application/SyntheticDiagnosticRelay";

const schema = z.object({
 APP_ENV: z.string().default("development"),
 DIAGNOSTIC_TELEMETRY_ENABLED: z.enum(["true", "false"]).default("false"),
 DIAGNOSTIC_SYNTHETIC_SESSION_IDS: z.string().max(400).optional(),
 DIAGNOSTIC_SYNTHETIC_EXPIRES_AT: z.string().datetime().optional(),
 DIAGNOSTIC_RELEASE: z.string().regex(/^[A-Za-z0-9._-]{1,64}$/).optional(),
 DIAGNOSTIC_BUILD: z.string().regex(/^[A-Za-z0-9._-]{1,64}$/).optional(),
 DIAGNOSTIC_COLLECTOR_STORE_URL: z.string().url().optional(),
 DIAGNOSTIC_COLLECTOR_PUBLIC_KEY: z.string().regex(/^[a-f0-9]{32}$/).optional(),
 DIAGNOSTIC_BUILD_FILES: z.string().max(20_000).optional(),
});
export interface DiagnosticTelemetryConfig extends DiagnosticAdmission { endpoint: string | null; publicKey: string | null }
export function diagnosticTelemetryConfig(env: NodeJS.ProcessEnv): DiagnosticTelemetryConfig {
 const value = schema.parse(env), enabled = value.DIAGNOSTIC_TELEMETRY_ENABLED === "true";
 if (!enabled) return { enabled: false, sessionIds: [], expiresAt: "1970-01-01T00:00:00.000Z", release: "disabled", build: "disabled", files: [], endpoint: null, publicKey: null };
 if (!["staging", "test"].includes(value.APP_ENV) || !value.DIAGNOSTIC_SYNTHETIC_SESSION_IDS || !value.DIAGNOSTIC_SYNTHETIC_EXPIRES_AT || !value.DIAGNOSTIC_RELEASE || !value.DIAGNOSTIC_BUILD || !value.DIAGNOSTIC_COLLECTOR_STORE_URL || !value.DIAGNOSTIC_COLLECTOR_PUBLIC_KEY) throw new Error("Synthetic diagnostic admission incomplete");
 const sessionIds = z.array(z.string().uuid()).min(1).max(10).parse(value.DIAGNOSTIC_SYNTHETIC_SESSION_IDS.split(","));
 let raw: unknown; try { raw = JSON.parse(value.DIAGNOSTIC_BUILD_FILES ?? "[]"); } catch { throw new Error("Diagnostic build manifest invalid"); }
 const files = z.array(z.string().regex(/^app:\/\/[A-Za-z0-9/_.-]{1,160}$/)).max(100).parse(raw);
 return { enabled, sessionIds, expiresAt: value.DIAGNOSTIC_SYNTHETIC_EXPIRES_AT, release: value.DIAGNOSTIC_RELEASE, build: value.DIAGNOSTIC_BUILD, files,
  endpoint: value.DIAGNOSTIC_COLLECTOR_STORE_URL, publicKey: value.DIAGNOSTIC_COLLECTOR_PUBLIC_KEY };
}
