/** Local readiness only. No seed, repair, services, authentication or device operations. */
import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";

import { parse } from "dotenv";

import { richTarget } from "./ui-fixtures/rich-target";

const fail = (message: string): never => { throw new Error(message); };
const localEnvs = ["development", "test"];
function localUrl(value: string | undefined, name: string, protocols: string[]): URL {
  let url: URL;
  try { url = new URL(value ?? ""); } catch { return fail(`${name} must be an explicit local URL`); }
  if (!protocols.includes(url.protocol) || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
    return fail(`${name} must use loopback (${protocols.join("/")})`);
  }
  if (url.search || url.hash) return fail(`${name} must not contain query options or fragments`);
  // Pin localhost rather than trusting a machine-specific DNS entry.
  if (url.hostname === "localhost") url.hostname = "127.0.0.1";
  return url;
}

async function main(): Promise<void> {
  const { values } = parseArgs({ options: {
    "api-origin": { type: "string" }, "env-file": { type: "string" },
    "owner-id": { type: "string" }, "viewer-id": { type: "string" }, "worker-env": { type: "string" },
  } });
  const api = localUrl(values["api-origin"], "--api-origin", ["http:"]);
  if (api.username || api.password || api.pathname !== "/") fail("--api-origin must be a bare local origin");
  const envFile = values["env-file"];
  if (!envFile) return fail("--env-file must select the running API's env file");
  const env = { ...parse(await readFile(envFile, "utf8")), ...process.env };
  if (!localEnvs.includes(env["APP_ENV"] ?? "") || !localEnvs.includes(env["NODE_ENV"] ?? "")) {
    fail("APP_ENV and NODE_ENV must explicitly be development/test");
  }
  if (["RAILWAY_ENVIRONMENT_ID", "RAILWAY_ENVIRONMENT_NAME", "RAILWAY_PROJECT_ID", "RAILWAY_SERVICE_ID"].some((key) => env[key])) fail("Railway targets are outside this local check");
  localUrl(env["DATABASE_URL"], "DATABASE_URL", ["postgresql:", "postgres:"]);
  localUrl(env["REDIS_URL"], "REDIS_URL", ["redis:", "rediss:"]);
  const photoEndpoint = localUrl(env["MINIO_ENDPOINT"], "MINIO_ENDPOINT", ["http:"]);
  const videoEndpoint = localUrl(env["LISTING_VIDEO_BUCKET_ENDPOINT"] || env["MINIO_ENDPOINT"], "video endpoint", ["http:"]);
  if (env["MINIO_PUBLIC_URL"]) localUrl(env["MINIO_PUBLIC_URL"], "MINIO_PUBLIC_URL", ["http:"]);
  const videoOrigin = localUrl(env["LISTING_VIDEO_API_ORIGIN"] || `http://localhost:${env["PORT"] || 3006}`, "LISTING_VIDEO_API_ORIGIN", ["http:"]);
  if (videoOrigin.origin !== api.origin || String(env["PORT"] || 3006) !== (api.port || "80")) fail("API port and video origin must match --api-origin; select the running API config");
  for (const endpoint of [photoEndpoint, videoEndpoint]) {
    if (endpoint.username || endpoint.password || endpoint.pathname !== "/") fail("Media endpoints must be bare local origins");
  }

  if (!/^[a-zA-Z0-9-]{1,80}$/.test(values["owner-id"] ?? "")) fail("Require explicit existing --owner-id");
  if (!/^[a-zA-Z0-9-]{1,80}$/.test(values["viewer-id"] ?? "") || values["viewer-id"] === values["owner-id"]) fail("Require distinct existing --viewer-id");
  const workerFile = values["worker-env"];
  if (!workerFile) return fail("Require --worker-env for the selected local worker config");
  const worker = parse(await readFile(workerFile, "utf8"));
  if (!localEnvs.includes(worker["APP_ENV"] ?? "") || !localEnvs.includes(worker["NODE_ENV"] ?? "")) fail("Worker APP_ENV and NODE_ENV must explicitly be development/test");
  if (["RAILWAY_ENVIRONMENT_ID", "RAILWAY_ENVIRONMENT_NAME", "RAILWAY_PROJECT_ID", "RAILWAY_SERVICE_ID"].some((key) => worker[key])) fail("Railway targets are outside this local check");
  const target = richTarget(["--target", "local", "--mode", "check", "--scenario-set", "videos",
    "--owner-id", values["owner-id"] ?? "", "--viewer-id", values["viewer-id"] ?? ""], env, worker);

  // All target, mapping and capability guards precede requests/client loading.
  try {
    const response = await fetch(new URL("/readyz", api), { redirect: "error", signal: AbortSignal.timeout(5000) });
    const readiness = await response.json() as { status?: string; service?: string; environment?: string; checks?: Record<string, string> };
    if (!response.ok || readiness.status !== "ready" || readiness.service !== "api" || readiness.environment !== env["APP_ENV"] ||
      !["postgres", "redis", "minio"].every((key) => readiness.checks?.[key] === "ok")) fail("not ready");
    console.log(`API ready: ${api.origin}; Postgres/Redis/MinIO ok (${readiness.environment})`);
  } catch {
    fail("API readiness: verify the selected API is running; reuse its owner's process");
  }
  const { runRichScenarios } = await import("./ui-fixtures/rich-scenarios");
  // The video comparator includes the retained photo and private-draft checks.
  // Never call an apply path, synthesize a fallback, or duplicate its manifest.
  const report = await runRichScenarios(target);
  console.log(JSON.stringify({ target: "local", apiOrigin: api.origin, ownerId: target.ownerId,
    viewerId: target.video?.viewerId, ...report }, null, 2));
  if (report.state !== "installed" || report.writes !== 0) fail("Rich baseline absent/incompatible; coordinate explicit rich:scenarios plan/apply for the reported scenarios; no automatic repair");
  console.log("READY (local environment only). No data/auth changed. Device sign-in and build/origin are unverified; follow local-testing.md and native:signin --reuse-only.");
}

void main().catch((error: unknown) => {
  // parseArgs and filesystem errors can contain caller-provided private values.
  const message = error instanceof Error && !["TypeError", "SyntaxError"].includes(error.name) && !("code" in error)
    ? error.message : "Invalid arguments or env file; use --api-origin http://127.0.0.1:<port> --env-file <API env file>";
  console.error(`NOT READY: ${message}`);
  process.exitCode = 1;
});
