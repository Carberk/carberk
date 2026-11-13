import { parseArgs } from "node:util";
import { createHash } from "node:crypto";

/** Pure, before importing clients: no remote fallback or driver URL overrides. */
export function richTarget(args: string[], env: NodeJS.ProcessEnv, workerEnv = env) {
  const { values } = parseArgs({ args, options: {
    target: { type: "string" }, mode: { type: "string" }, "owner-id": { type: "string" },
    "plan-hash": { type: "string" }, "scenario-set": { type: "string", default: "photos" },
    "viewer-id": { type: "string" }, "retire-source-id": { type: "string" },
    "worker-env": { type: "string" },
  } });
  if (values.target !== "local" || !["check", "plan", "apply"].includes(values.mode ?? "")) {
    throw new Error("Require --target local --mode check|plan|apply");
  }
  if (!/^[a-zA-Z0-9-]{1,80}$/.test(values["owner-id"] ?? "")) throw new Error("Require explicit existing --owner-id");
  if (!["photos", "private-drafts", "videos", "video-recovery"].includes(values["scenario-set"] ?? "")) throw new Error("Require --scenario-set photos|private-drafts|videos|video-recovery");
  if (!["development", "test"].includes(env["APP_ENV"] ?? "") || !["development", "test"].includes(env["NODE_ENV"] ?? "") ||
      ["RAILWAY_ENVIRONMENT_ID", "RAILWAY_ENVIRONMENT_NAME", "RAILWAY_PROJECT_ID", "RAILWAY_SERVICE_ID"].some((key) => env[key])) {
    throw new Error("Rich scenarios require local development/test, outside Railway");
  }
  const local = (key: string, protocols: string[], bare: boolean, settings = env) => {
    let url: URL;
    try { url = new URL(settings[key] ?? ""); } catch { throw new Error(`${key}: require explicit loopback URL`); }
    if (!protocols.includes(url.protocol) || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.search || url.hash ||
        (bare && (url.username || url.password || url.pathname !== "/"))) throw new Error(`${key}: require unmodified loopback target`);
    if (url.hostname === "localhost") url.hostname = "127.0.0.1";
    return url.href;
  };
  const databaseUrl = local("DATABASE_URL", ["postgres:", "postgresql:"], false);
  const endpoint = local("MINIO_ENDPOINT", ["http:"], true);
  const publicUrl = local("MINIO_PUBLIC_URL", ["http:"], true);
  if (!env["MINIO_ACCESS_KEY"] || !env["MINIO_SECRET_KEY"]) throw new Error("Require local storage credentials");
  if (values.mode === "apply" && !/^[a-f0-9]{64}$/.test(values["plan-hash"] ?? "")) throw new Error("Apply requires --plan-hash from plan");
  let video;
  if (["videos", "video-recovery"].includes(values["scenario-set"] ?? "")) {
    if (env["LISTING_VIDEO_UPLOADS_ENABLED"] !== "true") throw new Error("Require existing LISTING_VIDEO_UPLOADS_ENABLED; no activation or config repair");
    const viewerId = values["viewer-id"] ?? "";
    if (!/^[a-zA-Z0-9-]{1,80}$/.test(viewerId) || viewerId === values["owner-id"]) throw new Error("Require explicit distinct existing --viewer-id");
    const includes = (key: string, id: string) => (env[key] ?? "").split(",").some((value) => value.trim() === id);
    if (!includes("LISTING_VIDEO_UPLOAD_TESTER_USER_IDS", values["owner-id"] ?? "") ||
        !includes("LISTING_VIDEO_VIEW_TESTER_USER_IDS", values["owner-id"] ?? "")) {
      throw new Error("Missing existing LISTING_VIDEO_UPLOAD_TESTER_USER_IDS/LISTING_VIDEO_VIEW_TESTER_USER_IDS mapping; never activate testers");
    }
    const dedicatedKeys = ["LISTING_VIDEO_BUCKET_ENDPOINT", "LISTING_VIDEO_BUCKET_NAME", "LISTING_VIDEO_BUCKET_ACCESS_KEY_ID", "LISTING_VIDEO_BUCKET_SECRET_ACCESS_KEY"];
    const dedicated = dedicatedKeys.every((key) => env[key]);
    if (!dedicated && dedicatedKeys.some((key) => env[key])) throw new Error("Partial LISTING_VIDEO_BUCKET_* configuration; API/worker fallback differs, refuse without repair");
    video = { viewerId, apiOrigin: local("LISTING_VIDEO_API_ORIGIN", ["http:"], true),
      redisUrl: local("REDIS_URL", ["redis:"], false), endpoint: dedicated ? local("LISTING_VIDEO_BUCKET_ENDPOINT", ["http:"], true) : endpoint,
      bucket: dedicated ? env["LISTING_VIDEO_BUCKET_NAME"] ?? "" : "listing-videos",
      accessKeyId: env[dedicated ? "LISTING_VIDEO_BUCKET_ACCESS_KEY_ID" : "MINIO_ACCESS_KEY"] ?? "",
      secretAccessKey: env[dedicated ? "LISTING_VIDEO_BUCKET_SECRET_ACCESS_KEY" : "MINIO_SECRET_KEY"] ?? "",
      region: env[dedicated ? "LISTING_VIDEO_BUCKET_REGION" : "MINIO_REGION"] || "us-east-1" };
    const workerEndpoint = local(workerEnv["LISTING_VIDEO_BUCKET_ENDPOINT"] ? "LISTING_VIDEO_BUCKET_ENDPOINT" : "MINIO_ENDPOINT", ["http:"], true, workerEnv);
    if (workerEndpoint !== video.endpoint || (workerEnv["LISTING_VIDEO_BUCKET_NAME"] || "listing-videos") !== video.bucket ||
        (workerEnv["LISTING_VIDEO_BUCKET_ACCESS_KEY_ID"] || workerEnv["MINIO_ACCESS_KEY"]) !== video.accessKeyId ||
        (workerEnv["LISTING_VIDEO_BUCKET_SECRET_ACCESS_KEY"] || workerEnv["MINIO_SECRET_KEY"]) !== video.secretAccessKey ||
        local("DATABASE_URL", ["postgres:", "postgresql:"], false, workerEnv) !== databaseUrl ||
        local("REDIS_URL", ["redis:"], false, workerEnv) !== video.redisUrl) throw new Error("API/worker target identity mismatch; no configuration repair");
  } else if (values["viewer-id"] || values["retire-source-id"]) throw new Error("Video options require a video scenario set");
  if (values["retire-source-id"] && (values["scenario-set"] !== "video-recovery" || !/^[a-f0-9-]{36}$/.test(values["retire-source-id"]))) {
    throw new Error("Retirement requires video-recovery and one exact --retire-source-id");
  }
  return { mode: values.mode as "check" | "plan" | "apply", ownerId: values["owner-id"] ?? "",
    scenarioSet: values["scenario-set"] as "photos" | "private-drafts" | "videos" | "video-recovery",
    video: video ? { ...video, workerRegion: workerEnv["LISTING_VIDEO_BUCKET_REGION"] || workerEnv["MINIO_REGION"] || "us-east-1",
      configFingerprint: createHash("sha256").update(JSON.stringify({ video, workerRegion: workerEnv["LISTING_VIDEO_BUCKET_REGION"] || workerEnv["MINIO_REGION"] || "us-east-1" })).digest("hex") } : undefined,
    retireSourceId: values["retire-source-id"],
    planHash: values["plan-hash"], databaseUrl, endpoint, publicUrl,
    accessKeyId: env["MINIO_ACCESS_KEY"], secretAccessKey: env["MINIO_SECRET_KEY"] };
}
