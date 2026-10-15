import { randomUUID } from "node:crypto";
import type { ConfigService } from "@nestjs/config";
import { z } from "zod";
import type { ServiceRuntime } from "../domain/ports/ServiceMessagingPort";

export function serviceRuntime(config: ConfigService): ServiceRuntime {
 const enabled = () => config.get("SERVICE_SYNTHETIC_ENABLED") === true || config.get("SERVICE_SYNTHETIC_ENABLED") === "true";
 const admitted = () => {
  const value: unknown = config.get("SERVICE_SYNTHETIC_USER_IDS", "[]");
  try { return z.array(z.string().uuid()).parse(typeof value === "string" ? JSON.parse(value) : value); } catch { return []; }
 };
 return { now: () => new Date(), id: randomUUID, syntheticEnabled: enabled,
  syntheticSubjectAllowed: subject => enabled() && admitted().includes(subject.userId) };
}
