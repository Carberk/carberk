import { randomUUID } from "node:crypto";
import type { ConfigService } from "@nestjs/config";
import { z } from "zod";
import type { DiagnosticRuntime } from "../domain/ports/DiagnosticIntakePort";

export function diagnosticRuntime(config: ConfigService): DiagnosticRuntime {
  const enabled = [true, "true"].includes(config.get<unknown>("DIAGNOSTIC_SYNTHETIC_ENABLED", false) as boolean | string);
  const environment = config.get<string>("APP_ENV", "development");
  const configured = config.get<unknown>("DIAGNOSTIC_SYNTHETIC_USER_IDS", []);
  const values = z.array(z.string().uuid()).max(100).parse(typeof configured === "string" ? JSON.parse(configured) as unknown : configured);
  if (enabled && !["test", "staging"].includes(environment)) throw new Error("Synthetic diagnostic intake requires a test environment");
  const users = new Set(values);
  return { now: () => new Date(), id: randomUUID, syntheticAllowed: subject => enabled && users.has(subject.userId) };
}
