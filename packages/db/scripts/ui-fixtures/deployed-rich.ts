import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

import type { RichExecutionTarget, RichQuery } from "./rich-execution";

const root = join(__dirname, "../..");
const hash = (value: unknown): string => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export const configurationHash = (env: NodeJS.ProcessEnv) => hash(Object.entries(env).sort(([a], [b]) => a.localeCompare(b)));
const refuse = (): never => { throw new Error("Deployed rich target refused; inspect private binding, compatibility, mapping or current plan. No configuration repair or automatic cleanup."); };
const id = (value: unknown): value is string => typeof value === "string" && /^[a-zA-Z0-9-]{1,80}$/.test(value);
const sha = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const fresh = (time: string, now: number) => Number.isFinite(Date.parse(time)) && now - Date.parse(time) >= 0 && now - Date.parse(time) <= 60 * 60 * 1000;

/** Private, operator-attested provider export bindings; never printed. */
export interface DeployedBinding {
  target: "staging" | "production";
  projectId: string; environmentId: string;
  services: { api: string; worker: string; database: string; storage: string; redis: string };
  apiConfigHash: string; workerConfigHash: string;
  resourceConfigHashes: { database: string; storage: string; redis: string };
  ownerId: string; viewerId: string;
  scenarioSet: RichExecutionTarget["scenarioSet"];
  component: "scenario" | "recovery-photos";
  compatibility: {
    apiCommit: string; workerCommit: string; behavior: string; schema: string;
    verifiedAt: string; ordinaryUploadAndPlayback: true;
  };
}
export interface DeployedPlan {
  target: "staging" | "production"; binding: string; behavior: string;
  version: string; scenarioSet: string; relevantState: string; executorPlan: string; planHash: string;
}
export interface StagingEvidence {
  target: "staging"; success: true; behavior: string; version: string; scenarioSet: string;
  binding: string; checkedAt: string; state: "installed"; writes: 0;
}
export interface BackupEvidence {
  target: "production"; binding: string; planHash: string; capturedAt: string; verifiedAt: string;
  database: true; photos: true; privateVideos: true; restoreVerified: true; receiptId: string;
}

/** Source bytes, not a manually bumped behavior label. No build or mutation. */
export async function deployedRichVersion() {
  const files = ["scripts/ui-fixtures/deployed-rich.ts", "scripts/ui-fixtures/rich-execution.ts", "scripts/ui-fixtures/rich-scenarios.ts", "scripts/ui-fixtures/rich-videos.ts",
    "scripts/ui-fixtures/manifest.ts", "scripts/ui-fixtures/verify.ts", "scripts/demo-inventory/photos.ts", "scripts/deployed-rich-scenarios.ts"];
  const migrations = await readdir(join(root, "prisma/migrations"));
  const schema = [];
  for (const name of migrations.sort()) if (name !== "migration_lock.toml") {
    const bytes = await readFile(join(root, "prisma/migrations", name, "migration.sql"));
    schema.push({ migration_name: name, checksum: createHash("sha256").update(bytes).digest("hex") });
  }
  return { behavior: hash(await Promise.all(files.map(async (file) => [file, (await readFile(join(root, file))).toString("base64")]))), schema, schemaHash: hash(schema) };
}

/** No dotenv, ambient configuration, URL flags, or local helper reuse. */
export function deployedRichTarget(input: unknown, api: NodeJS.ProcessEnv, worker: NodeJS.ProcessEnv, resources: Partial<Record<"database" | "storage" | "redis", NodeJS.ProcessEnv>> = {}) {
  try {
    const binding = input as DeployedBinding;
    if (!binding || Object.keys(binding).sort().join() !== "apiConfigHash,compatibility,component,environmentId,ownerId,projectId,resourceConfigHashes,scenarioSet,services,target,viewerId,workerConfigHash" ||
        !["scenario", "recovery-photos"].includes(binding.component) || (binding.component === "recovery-photos" && binding.scenarioSet !== "video-recovery") || !["staging", "production"].includes(binding.target) || !id(binding.projectId) || !id(binding.environmentId) ||
        !binding.services || Object.keys(binding.services).sort().join() !== "api,database,redis,storage,worker" ||
        !Object.values(binding.services).every(id) || new Set(Object.values(binding.services)).size !== 5 ||
        !id(binding.ownerId) || !id(binding.viewerId) || binding.ownerId === binding.viewerId ||
        !["photos", "private-drafts", "videos", "video-recovery"].includes(binding.scenarioSet) ||
        !sha(binding.apiConfigHash) || !sha(binding.workerConfigHash) || !binding.resourceConfigHashes || !binding.compatibility) refuse();
    for (const [name, env] of [["api", api], ["worker", worker]] as const) {
      if (env["RAILWAY_PROJECT_ID"] !== binding.projectId || env["RAILWAY_ENVIRONMENT_ID"] !== binding.environmentId ||
          env["RAILWAY_ENVIRONMENT_NAME"] !== binding.target || env["APP_ENV"] !== binding.target || env["NODE_ENV"] !== "production" ||
          env["RAILWAY_SERVICE_ID"] !== binding.services[name] || configurationHash(env) !== binding[`${name}ConfigHash`]) refuse();
    }
    for (const name of ["database", "storage", "redis"] as const) {
      const env = resources[name];
      if (!env || env["RAILWAY_PROJECT_ID"] !== binding.projectId || env["RAILWAY_ENVIRONMENT_ID"] !== binding.environmentId ||
          env["RAILWAY_ENVIRONMENT_NAME"] !== binding.target || env["RAILWAY_SERVICE_ID"] !== binding.services[name] ||
          !sha(binding.resourceConfigHashes[name]) || configurationHash(env) !== binding.resourceConfigHashes[name]) refuse();
    }
    const database = resources.database ?? refuse();
    const storage = resources.storage ?? refuse();
    const redis = resources.redis ?? refuse();
    const url = (env: NodeJS.ProcessEnv, key: string, protocols: string[], bare = false) => {
      const parsed = new URL(env[key] ?? "");
      if (!protocols.includes(parsed.protocol) || parsed.search || parsed.hash || (bare && (parsed.username || parsed.password || parsed.pathname !== "/"))) refuse();
      return parsed.href;
    };
    const databaseUrl = url(api, "DATABASE_URL", ["postgres:", "postgresql:"]);
    const endpoint = url(api, "MINIO_ENDPOINT", ["http:", "https:"], true);
    const publicUrl = url(api, "MINIO_PUBLIC_URL", ["http:", "https:"], true);
    if (databaseUrl !== url(database, "DATABASE_URL", ["postgres:", "postgresql:"]) ||
        endpoint !== url(storage, "MINIO_ENDPOINT", ["http:", "https:"], true) ||
        publicUrl !== url(storage, "MINIO_PUBLIC_URL", ["http:", "https:"], true) ||
        api["MINIO_ACCESS_KEY"] !== storage["MINIO_ACCESS_KEY"] || api["MINIO_SECRET_KEY"] !== storage["MINIO_SECRET_KEY"] ||
        api["REDIS_URL"] !== redis["REDIS_URL"]) refuse();
    if (databaseUrl !== url(worker, "DATABASE_URL", ["postgres:", "postgresql:"]) || api["LISTING_VIDEO_UPLOADS_ENABLED"] !== "true") refuse();
    for (const [key, user] of [["LISTING_VIDEO_UPLOAD_TESTER_USER_IDS", binding.ownerId], ["LISTING_VIDEO_VIEW_TESTER_USER_IDS", binding.ownerId], ["LISTING_VIDEO_VIEW_TESTER_USER_IDS", binding.viewerId]]) {
      if (!(api[key ?? ""] ?? "").split(",").map((value) => value.trim()).includes(user ?? "")) refuse();
    }
    if (!api["MINIO_ACCESS_KEY"] || !api["MINIO_SECRET_KEY"]) refuse();
    const videoConfig = (env: NodeJS.ProcessEnv) => {
      const keys = ["LISTING_VIDEO_BUCKET_ENDPOINT", "LISTING_VIDEO_BUCKET_NAME", "LISTING_VIDEO_BUCKET_ACCESS_KEY_ID", "LISTING_VIDEO_BUCKET_SECRET_ACCESS_KEY"] as const;
      const dedicated = keys.every((key) => env[key]);
      if (!dedicated && keys.some((key) => env[key])) refuse();
      const value = { endpoint: url(env, dedicated ? keys[0] : "MINIO_ENDPOINT", ["http:", "https:"], true), bucket: dedicated ? (env[keys[1]] ?? refuse()) : "listing-videos",
        accessKeyId: (env[dedicated ? keys[2] : "MINIO_ACCESS_KEY"] ?? refuse()), secretAccessKey: (env[dedicated ? keys[3] : "MINIO_SECRET_KEY"] ?? refuse()) };
      if (!value.accessKeyId || !value.secretAccessKey || !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(value.bucket)) refuse();
      return value;
    };
    const video = videoConfig(api);
    if (hash(video) !== hash(videoConfig(worker)) || hash(video) !== hash(videoConfig(storage)) || api["REDIS_URL"] !== worker["REDIS_URL"]) refuse();
    const videoTarget = { ...video, viewerId: binding.viewerId, apiOrigin: url(api, "LISTING_VIDEO_API_ORIGIN", ["http:", "https:"], true),
      redisUrl: url(api, "REDIS_URL", ["redis:", "rediss:"]), region: api["LISTING_VIDEO_BUCKET_REGION"] || api["MINIO_REGION"] || "us-east-1",
      workerRegion: worker["LISTING_VIDEO_BUCKET_REGION"] || worker["MINIO_REGION"] || "us-east-1", configFingerprint: hash([binding.apiConfigHash, binding.workerConfigHash]) };
    const target: RichExecutionTarget = { mode: "check", scenarioSet: binding.scenarioSet, ownerId: binding.ownerId, databaseUrl, endpoint, publicUrl,
      accessKeyId: (api["MINIO_ACCESS_KEY"] ?? refuse()), secretAccessKey: (api["MINIO_SECRET_KEY"] ?? refuse()), planHash: undefined, retireSourceId: undefined,
      video: ["videos", "video-recovery"].includes(binding.scenarioSet) ? videoTarget : undefined };
    return { binding, bindingHash: hash(binding), target, api, worker, resources };
  } catch { return refuse(); }
}

/** All checks execute inside the SAME transaction as the shared comparator. */
async function preflight(query: RichQuery, context: ReturnType<typeof deployedRichTarget>, version: Awaited<ReturnType<typeof deployedRichVersion>>, now: number) {
  const { binding, api, worker } = context;
  const compat = binding.compatibility;
  if (compat.behavior !== version.behavior || compat.schema !== version.schemaHash || !fresh(compat.verifiedAt, now) ||
      compat.ordinaryUploadAndPlayback !== true || !/^[a-f0-9]{40}$/.test(compat.apiCommit) || !/^[a-f0-9]{40}$/.test(compat.workerCommit) ||
      compat.apiCommit !== api["RAILWAY_GIT_COMMIT_SHA"] || compat.workerCommit !== worker["RAILWAY_GIT_COMMIT_SHA"]) refuse();
  const migrations = await query('SELECT migration_name,checksum FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name');
  if (hash(migrations) !== version.schemaHash || (await query('SELECT id FROM _prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL')).length) refuse();
  const people = await query('SELECT id,role,"suspendedAt","deletionScheduledAt",phone,"phoneVerifiedAt",email,"emailVerifiedAt","updatedAt" FROM users WHERE id=ANY($1::text[]) ORDER BY id', [[binding.ownerId, binding.viewerId]]);
  if (people.length !== 2 || people.some((row) => row["suspendedAt"] || row["deletionScheduledAt"] ||
      !(row["phone"] && row["phoneVerifiedAt"] || row["email"] && row["emailVerifiedAt"]) ||
      (row["id"] === binding.ownerId ? row["role"] !== "seller" : !["seller", "buyer"].includes(String(row["role"]))))) refuse();
  // Owned baseline drafts are compared by the shared executor. Everything else
  // is relevant capacity/state, never something the operator may evict.
  const ownDraftIds = binding.scenarioSet === "private-drafts" ? (await import("./rich-scenarios")).PRIVATE_DRAFT_SCENARIOS.map((row) => row.id) : [];
  const drafts = await query(`SELECT id,payload,"updatedAt" FROM listing_drafts WHERE "userId"=$1 AND NOT(id=ANY($2::text[])) ORDER BY id`, [binding.ownerId, ownDraftIds]);
  const inflight = await query(`SELECT g.id FROM video_generations g JOIN listing_videos v ON v.id=g."listingVideoId" WHERE v."ownerId"=$1 AND g.status IN ('Uploading','Processing')`, [binding.ownerId]);
  const imports = await query(`SELECT id FROM video_sources WHERE "userId"=$1 AND state IN ('OPEN','COMPLETING') UNION ALL SELECT id FROM media_uploads WHERE "userId"=$1 AND state='PREPARING'`, [binding.ownerId]);
  if (inflight.length || imports.length) refuse();
  return hash({ people, drafts, schema: version.schemaHash });
}

/** Returns only opaque binding/state hashes and fixed, public scenario IDs. */
export async function runDeployedRich(context: ReturnType<typeof deployedRichTarget>, request: {
  mode: "check" | "plan" | "apply"; plan?: DeployedPlan; staging?: StagingEvidence; backup?: BackupEvidence;
}, now = Date.now()) {
  try {
    if (!["check", "plan", "apply"].includes(request.mode)) refuse();
    const version = await deployedRichVersion();
    const expected = request.plan;
    if (request.mode === "apply") {
      if (!expected || expected.target !== context.binding.target || expected.binding !== context.bindingHash || expected.behavior !== version.behavior ||
          expected.scenarioSet !== context.binding.scenarioSet) refuse();
      if (context.binding.target === "production") {
        const staging = request.staging; const backup = request.backup;
        if (!staging || staging.target !== "staging" || staging.success !== true || staging.state !== "installed" || staging.writes !== 0 ||
            !sha(staging.binding) || staging.binding === context.bindingHash || staging.behavior !== version.behavior || staging.version !== expected?.version ||
            staging.scenarioSet !== context.binding.scenarioSet || !fresh(staging.checkedAt, now) || !backup || backup.target !== "production" ||
            backup.binding !== context.bindingHash || backup.planHash !== expected?.planHash || !id(backup.receiptId) ||
            !fresh(backup.capturedAt, now) || !fresh(backup.verifiedAt, now) || Date.parse(backup.verifiedAt) < Date.parse(backup.capturedAt) ||
            backup.database !== true || backup.photos !== true || backup.privateVideos !== true || backup.restoreVerified !== true) refuse();
      }
    }
    const { runRichScenarios, runRichPhotos } = await import("./rich-scenarios");
    const execute = context.binding.component === "recovery-photos" ? runRichPhotos : runRichScenarios;
    let plan: DeployedPlan | undefined;
    const authorize: RichExecutionTarget["authorize"] = async (report, query) => {
      const relevantState = await preflight(query, context, version, now);
      const payload = { target: context.binding.target, binding: context.bindingHash, behavior: version.behavior, version: report.version,
        scenarioSet: context.binding.scenarioSet, relevantState, executorPlan: report.planHash };
      plan = { ...payload, planHash: hash(payload) };
      if (request.mode !== "apply") return;
      const expected = request.plan;
      if (!expected) throw new Error();
      if (expected.planHash !== hash({ target: expected.target, binding: expected.binding, behavior: expected.behavior, version: expected.version,
        scenarioSet: expected.scenarioSet, relevantState: expected.relevantState, executorPlan: expected.executorPlan }) ||
        expected.target !== payload.target || expected.binding !== payload.binding || expected.behavior !== payload.behavior ||
        expected.version !== payload.version || expected.scenarioSet !== payload.scenarioSet || expected.relevantState !== payload.relevantState ||
        (report.state !== "installed" && expected.executorPlan !== report.planHash)) refuse();

    };
    // Derive the inner executor hash with a read-only pass. The apply callback
    // repeats authorization under the executor's existing locks, before writes.
    const selected = { ...context.target, mode: "plan" as const, authorize };
    let result = await execute(selected);
    if (request.mode === "apply") result = await execute({ ...selected, mode: "apply", planHash: result.planHash });
    if (!plan) throw new Error();
    return { target: context.binding.target, binding: context.bindingHash, behavior: version.behavior, version: result.version,
      scenarioSet: context.binding.scenarioSet, state: result.state, writes: result.writes, planned: result.planned,
      resourceIds: "scenarioIds" in result ? result.scenarioIds : result.resources.flatMap((row) => [row.targetId, row.slotId, row.sourceId, row.generationId]), plan,
      ...(request.mode === "check" && context.binding.target === "staging" && result.state === "installed" ? { stagingEvidence: { target: context.binding.target, success: true, behavior: version.behavior,
        version: result.version, scenarioSet: context.binding.scenarioSet, binding: context.bindingHash, checkedAt: new Date(now).toISOString(), state: "installed", writes: 0 } } : {}) };
  } catch { return refuse(); }
}
