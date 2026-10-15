import { randomUUID } from "node:crypto";
import type { ConfigService } from "@nestjs/config";
import { z } from "zod";
import type { DiagnosticRuntime } from "../domain/ports/DiagnosticIntakePort";

export function diagnosticRuntime(config: ConfigService): DiagnosticRuntime {
  const enabled = config.get<boolean>("DIAGNOSTIC_SYNTHETIC_ENABLED", false);
  const environment = config.get<string>("APP_ENV", "development");
  const values = z.array(z.string().uuid()).max(100).parse(JSON.parse(config.get<string>("DIAGNOSTIC_SYNTHETIC_USER_IDS", "[]")) as unknown);
  if (enabled && !["test", "staging"].includes(environment)) throw new Error("Synthetic diagnostic intake requires a test environment");
  const users = new Set(values);
  return { now: () => new Date(), id: randomUUID, syntheticAllowed: subject => enabled && users.has(subject.userId) };
}
