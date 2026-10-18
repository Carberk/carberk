import { z } from "zod";

const probeUrl = z.string().url().refine(value => {
  const url = new URL(value);
  return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password && !url.hash;
}, "Expected a credential-free HTTP health endpoint");

const schema = z.object({
  OPERATIONS_ENABLED: z.enum(["true", "false"]).default("false"),
  OPERATIONS_SCOPE: z.string().regex(/^[a-z0-9-]{1,48}$/).default("development"),
  OPERATIONS_API_HEALTH_URL: probeUrl.optional(),
  OPERATIONS_COLLECTOR_HEALTH_URL: probeUrl.optional(),
  OPERATIONS_DISK_PATH: z.string().min(1).max(512).refine(value => value.startsWith("/") && !value.includes("\0"), "Expected an absolute monitored mount path").optional(),
  OPERATIONS_ALERTS_ENABLED: z.enum(["true", "false"]).default("false"),
  OPERATIONS_ALERT_SINK_URL: z.string().url().refine(value => {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash;
  }, "Expected a credential-free HTTPS alert sink").optional(),
  OPERATIONS_ALERT_SINK_SECRET: z.string().min(32).max(256).regex(/^[A-Za-z0-9_-]+$/).optional(),
  REDIS_URL: z.string().url().optional(),
});

export function operationsConfig(env: NodeJS.ProcessEnv) {
  const parsed = schema.parse(env);
  if (parsed.OPERATIONS_ENABLED === "true" && !parsed.REDIS_URL) throw new Error("Operational Redis configuration required");
  if (parsed.OPERATIONS_ALERTS_ENABLED === "true" && !parsed.OPERATIONS_ALERT_SINK_URL) throw new Error("Explicit controlled alert sink required");
  return {
    enabled: parsed.OPERATIONS_ENABLED === "true",
    prefix: `operations:${parsed.OPERATIONS_SCOPE}`,
    redisUrl: parsed.REDIS_URL,
    apiHealthUrl: parsed.OPERATIONS_API_HEALTH_URL,
    collectorHealthUrl: parsed.OPERATIONS_COLLECTOR_HEALTH_URL,
    diskPath: parsed.OPERATIONS_DISK_PATH,
    alertSinkUrl: parsed.OPERATIONS_ALERTS_ENABLED === "true" ? parsed.OPERATIONS_ALERT_SINK_URL : undefined,
    alertSinkSecret: parsed.OPERATIONS_ALERT_SINK_SECRET,
  };
}
