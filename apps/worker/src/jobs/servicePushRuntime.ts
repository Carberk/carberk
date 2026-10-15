import { z } from "zod";

import type { ServicePushRuntime } from "./DeliverServicePush";

export function servicePushRuntime(env: Record<string, unknown>): ServicePushRuntime {
 let ids: string[] = [];
 try { ids = z.array(z.string().uuid()).max(50).parse((Array.isArray(env["SERVICE_SYNTHETIC_USER_IDS"]) ? env["SERVICE_SYNTHETIC_USER_IDS"] : JSON.parse(String(env["SERVICE_SYNTHETIC_USER_IDS"] ?? "[]")))); } catch { /* Disabled when admission cannot be proven. */ }
 const enabled = env["APP_ENV"] !== "production" && env["PUSH_TRANSPORT"] === "test" && (env["SERVICE_SYNTHETIC_ENABLED"] === true || env["SERVICE_SYNTHETIC_ENABLED"] === "true") && ids.length > 0;
 return { enabled: () => enabled, allowed: id => enabled && ids.includes(id) };
}
