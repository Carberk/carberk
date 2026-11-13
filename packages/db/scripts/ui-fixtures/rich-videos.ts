import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { isDeepStrictEqual, promisify } from "node:util";

import { CompleteMultipartUploadCommand, CreateMultipartUploadCommand, GetBucketPolicyCommand, GetBucketVersioningCommand, GetObjectCommand, ListObjectsV2Command, S3Client, UploadPartCommand } from "@aws-sdk/client-s3";
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient, type Prisma } from "../../generated/prisma/client/client";
import { retireVideoGenerations } from "../../src/listing-video";

import { PRIVATE_DRAFT_SCENARIOS, RICH_SCENARIOS, runRichPhotos, VIDEO_RECOVERY_SCENARIO } from "./rich-scenarios";
import type { richTarget } from "./rich-target";
import pack from "./synthetic-video/v1/manifest.json";

const hash = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");
const exec = promisify(execFile);
const directory = join(__dirname, "synthetic-video/v1");
const recoveryId = VIDEO_RECOVERY_SCENARIO.id;
const coverOffsetMs = 500;
const definitions = [
  { targetId: RICH_SCENARIOS[0].id, type: "listing", clip: "portrait.mp4", expected: "Ready" },
  { targetId: RICH_SCENARIOS[1].id, type: "listing", clip: "landscape.mp4", expected: "Ready" },
  { targetId: PRIVATE_DRAFT_SCENARIOS[2]?.id ?? "", type: "draft", clip: "portrait.mp4", expected: "Ready" },
  { targetId: PRIVATE_DRAFT_SCENARIOS[1]?.id ?? "", type: "draft", clip: "invalid.mp4", expected: "Failed" },
  { targetId: recoveryId, type: "listing", clip: "invalid.mp4", expected: "Failed" },
].map((entry, index) => ({ ...entry,
  slotId: `b1131100-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
  sourceId: `b1131200-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
  generationId: `b1131300-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
}));
type Target = ReturnType<typeof richTarget>;
type Definition = typeof definitions[number];
type Manifest = Record<string, { key: string; sizeBytes: number; etag: string }>;
class Refusal extends Error {}
function refuse(message: string): never { throw new Refusal(message); }
export interface VideoReport {
  version: string; planHash: string; state: string; writes: number; creditsUrl: string;
  planned: Record<string, unknown>; resources: (Definition & { objectKey: string })[];
  outputHashes: Record<string, string>; verification: string;
  retirement?: { sourceId: string; generationId: string; slotId: string; state: string; objectKey: string };
  cleanup?: string;
  photoCopy?: Awaited<ReturnType<typeof runRichPhotos>>;
  inputs?: typeof pack;
}

/** Decode/probe immutable inputs before any connection. This never encodes media. */
async function inputs() {
  const clips = [];
  for (const entry of pack.clips) {
    const body = await readFile(join(directory, entry.file));
    if (body.length !== entry.bytes || hash(body) !== entry.sha256) refuse(`Changed offline input ${entry.file}`);
    if (entry.orientation !== "invalid") {
      const { stdout } = await exec("ffprobe", ["-v", "error", "-show_format", "-show_streams", "-of", "json", join(directory, entry.file)], { timeout: 10_000, maxBuffer: 100_000 });
      const probe = JSON.parse(stdout) as { format: { duration: string }; streams: { codec_type: string; codec_name: string; width?: number; height?: number; r_frame_rate?: string }[] };
      const video = probe.streams.find((stream) => stream.codec_type === "video");
      if (video?.width !== entry.width || video.height !== entry.height || video.codec_name !== "h264" || video.r_frame_rate !== "25/1" ||
          Math.round(Number(probe.format.duration) * 1000) !== entry.durationMs || !probe.streams.some((stream) => stream.codec_name === "aac")) refuse(`Probe mismatch ${entry.file}`);
      await exec("ffmpeg", ["-v", "error", "-threads", "1", "-i", join(directory, entry.file), "-f", "null", "-"], { timeout: 20_000, maxBuffer: 100_000 });
    }
    clips.push({ ...entry, body });
  }
  return clips;
}

/** Add Processing imports only. The running scheduler/worker owns all promotion/failure. */
export async function runRichVideos(target: Target): Promise<VideoReport> {
  const config = target.video ?? refuse("Video target/config mapping required");
  const selected = definitions.filter((entry) => (entry.targetId === recoveryId) === (target.scenarioSet === "video-recovery"));
  const resources = selected.map((entry) => ({ ...entry, objectKey: `video-sources/${entry.sourceId}/source.mp4` }));
  const createdObjects: string[] = [];
  const multipartUploads: { key: string; uploadId: string }[] = [];
  let attemptedObject: string | undefined;
  let phase = "immutable input verification";
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: target.databaseUrl }) });
  const storage = new S3Client({ endpoint: config.endpoint, region: config.region, forcePathStyle: true, maxAttempts: 1,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey } });
  try {
    const clips = await inputs();
    const version = hash(JSON.stringify({ pack, definitions, coverOffsetMs }));
    phase = "read-only retained photo baseline verification";
    const base = await runRichPhotos({ ...target, scenarioSet: "photos", mode: "check" });
    if (base.state !== "installed") refuse("Install the separately planned rich photo baseline first");
    if (target.scenarioSet === "videos") {
      const drafts = await runRichPhotos({ ...target, scenarioSet: "private-drafts", mode: "check" });
      if (drafts.state !== "installed") refuse("Install the separately planned private photo baseline first");
    }
    // The same executor plans the optional copy. No draft or stable Listing is consumed.
    const photoPlan = target.scenarioSet === "video-recovery" ? await runRichPhotos({ ...target, mode: "plan" }) : undefined;
    phase = "owner/target locks and exact generation inventory";
    const result = await db.$transaction(async (tx) => {
      if (target.mode !== "apply") await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
      else await tx.$queryRaw`SELECT pg_advisory_xact_lock(1126,1)::text`;
      const people = await tx.$queryRawUnsafe<{ id: string }[]>(`SELECT id FROM users WHERE id=ANY($1::text[]) AND "suspendedAt" IS NULL AND "deletionScheduledAt" IS NULL
        AND ((phone IS NOT NULL AND "phoneVerifiedAt" IS NOT NULL) OR (email IS NOT NULL AND "emailVerifiedAt" IS NOT NULL))${target.mode === "apply" ? " ORDER BY id FOR UPDATE" : ""}`, [target.ownerId, config.viewerId]);
      if (people.length !== 2 || !(await tx.user.findFirst({ where: { id: target.ownerId, role: "seller" } })) ||
          !(await tx.user.findFirst({ where: { id: config.viewerId, role: { in: ["buyer", "seller"] } } }))) refuse("Existing eligible nonprivileged owner/viewer mapping missing; no provisioning");
      const targets = [];
      for (const entry of selected) {
        const table = entry.type === "listing" ? "listings" : "listing_drafts";
        const rows = await tx.$queryRawUnsafe<Record<string, unknown>[]>(`SELECT * FROM ${table} WHERE id=$1${target.mode === "apply" ? " FOR UPDATE" : ""}`, entry.targetId);
        const row = rows[0];
        if (!row && entry.targetId === recoveryId && photoPlan?.state === "absent") continue;
        if (!row || row[entry.type === "listing" ? "sellerId" : "userId"] !== target.ownerId || (entry.type === "listing" && (row["deletedAt"] || row["status"] !== "active"))) refuse(`Modified/foreign target ${entry.targetId}`);
        targets.push(row);
      }
      const ids = selected.map((entry) => entry.slotId);
      if (target.mode === "apply") await tx.$queryRawUnsafe('SELECT id FROM listing_videos WHERE id=ANY($1::text[]) ORDER BY id FOR UPDATE', ids);
      if (target.mode === "apply") {
        await tx.$queryRawUnsafe('SELECT id FROM video_sources WHERE "listingVideoId"=ANY($1::text[]) ORDER BY id FOR UPDATE', ids);
        await tx.$queryRawUnsafe('SELECT id FROM video_generations WHERE "listingVideoId"=ANY($1::text[]) ORDER BY id FOR UPDATE', ids);
      }
      const slots = await tx.listingVideo.findMany({ where: { OR: [{ id: { in: ids } }, { listingId: { in: selected.map((entry) => entry.targetId) } }, { draftId: { in: selected.map((entry) => entry.targetId) } }] }, include: { sources: true, generations: true }, orderBy: { id: "asc" } });
      const foreignIds = await tx.videoSource.count({ where: { OR: [{ id: { in: selected.map((entry) => entry.sourceId) }, listingVideoId: { notIn: ids } }, { objectKey: { in: resources.map((entry) => entry.objectKey) }, listingVideoId: { notIn: ids } }] } });
      const foreignGenerations = await tx.videoGeneration.count({ where: { id: { in: selected.map((entry) => entry.generationId) }, listingVideoId: { notIn: ids } } });
      if (foreignIds || foreignGenerations || (slots.length !== 0 && (slots.length !== selected.length || selected.some((entry) => !slots.some((slot) => slot.id === entry.slotId))))) refuse("Partial/colliding slot/source inventory; no adoption or replacement");
      const versioning = await storage.send(new GetBucketVersioningCommand({ Bucket: config.bucket }));
      if (versioning.Status) refuse("Versioned video bucket; existing lifecycle cannot prove byte deletion");
      try {
        const policy = await storage.send(new GetBucketPolicyCommand({ Bucket: config.bucket }));
        if (policy.Policy && JSON.parse(policy.Policy).Statement?.some((row: { Effect?: string; Principal?: unknown }) => row.Effect === "Allow" && JSON.stringify(row.Principal).includes("*"))) refuse("Public video bucket policy; refuse without policy changes");
      } catch (error) { if ((error as { name?: string }).name !== "NoSuchBucketPolicy") throw error; }
      const outputHashes: Record<string, string> = {};
      for (const entry of resources) {
        const slot = slots.find((row) => row.id === entry.slotId);
        const keys = await list(storage, config.bucket, `video-sources/${entry.sourceId}/`);
        const cleanup = await tx.videoUploadCleanup.findUnique({ where: { sourceId: entry.sourceId } });
        const reservations = await tx.videoOutputReservation.findMany({ where: { sourceId: entry.sourceId }, orderBy: { key: "asc" } });
        if (!slot) { if (keys.length || cleanup || reservations.length) refuse(`Partial/occupied source ${entry.sourceId}`); continue; }
        if (slot.ownerId !== target.ownerId || slot[entry.type === "listing" ? "listingId" : "draftId"] !== entry.targetId) refuse(`Foreign/changed slot ${entry.slotId}`);
        if (target.retireSourceId) continue; // Exact current recovery ownership is rechecked below under the same locks.
        if (cleanup || slot.sources.length !== 1 || slot.generations.length !== 1) refuse(`Modified/consumed generation ${entry.generationId}`);
        const source = slot.sources[0] ?? refuse("Source missing"); const generation = slot.generations[0] ?? refuse("Generation missing");
        const clip = clips.find((row) => row.file === entry.clip) ?? refuse("Missing input definition");
        if (!source || !generation || source.id !== entry.sourceId || source.userId !== target.ownerId || source.objectKey !== entry.objectKey || source.bucket !== config.bucket ||
            source.state !== "COMPLETED" || source.contentType !== "video/mp4" || source.sizeBytes !== clip.bytes || source.coverOffsetMs !== coverOffsetMs ||
            source.openIdempotencyKey !== `rich-ui-v1:${version}:${entry.sourceId}` || !source.multipartUploadId || generation.id !== entry.generationId || generation.sourceId !== source.id || generation.coverOffsetMs !== coverOffsetMs) refuse(`Modified/foreign source/generation ${entry.sourceId}`);
        const actual = await get(storage, config.bucket, entry.objectKey);
        if (hash(actual.body) !== clip.sha256) refuse(`Modified stored source ${entry.sourceId}`);
        if (generation.status === "Processing" || generation.status === "Uploading") refuse(`In-flight generation ${generation.id}; wait for existing scheduler/worker, then check; no retry/import/cleanup`);
        if (generation.status !== entry.expected || generation.processingAttempt !== 1 || generation.processingRetryCount !== 0 || generation.nextRetryAt) refuse(`Replaced/modified generation ${generation.id}`);
        if (entry.expected === "Failed") {
          if (generation.failureType !== "SOURCE_INVALID" || generation.manifest !== null || slot.activeGenerationId || slot.pendingGenerationId !== generation.id || keys.length !== 1 || reservations.length) refuse(`Partial/modified invalid-source failure ${generation.id}`);
        } else {
          if (slot.activeGenerationId !== generation.id || slot.pendingGenerationId || generation.width !== clip.width || generation.height !== clip.height || generation.durationMs !== clip.durationMs || generation.videoCodec !== "h264" || generation.audioCodec !== "aac" || generation.failureType || !generation.completedAt) refuse(`Modified Ready generation ${generation.id}`);
          Object.assign(outputHashes, await verifyOutputs(storage, config.endpoint, config.bucket, entry, generation.manifest, keys, reservations));
        }
      }
      const installed = slots.length === selected.length;
      let retirement;
      if (target.retireSourceId) {
        if (target.scenarioSet !== "video-recovery" || slots.length !== 1) refuse("Retirement requires the exact existing optional recovery slot");
        const slot = slots[0] ?? refuse("Recovery slot missing");
        const generation = slot.generations.find((row) => row.sourceId === target.retireSourceId) ?? refuse("Exact generation missing");
        const source = slot.sources.find((row) => row.id === target.retireSourceId) ?? refuse("Exact source missing");
        if (!generation || !source || source.userId !== target.ownerId || source.bucket !== config.bucket || source.objectKey !== `video-sources/${source.id}/source.mp4` ||
            ![slot.pendingGenerationId, slot.activeGenerationId].includes(generation.id) || slot.generations.some((row) => row.id !== generation.id && row.status !== "Retired")) refuse("Replaced/foreign recovery source or another live generation; refuse exact retirement");
        retirement = { sourceId: source.id, generationId: generation.id, slotId: slot.id, state: generation.status, objectKey: source.objectKey };
      }
      const planHash = hash(JSON.stringify({ version, database: target.databaseUrl, photoEndpoint: target.endpoint, endpoint: config.endpoint, bucket: config.bucket,
        api: config.apiOrigin, redis: config.redisUrl, configFingerprint: config.configFingerprint, ownerId: target.ownerId, viewerId: config.viewerId, resources, targets: photoPlan ? photoPlan.planHash : targets, slots, outputHashes, retirement, photoPlan: photoPlan?.planHash }));
      if (target.mode === "apply" && target.planHash !== planHash) refuse("Plan changed; rerun plan against exact current target/version/ownership");
      const report = { version, planHash, state: installed ? "installed" : "absent", writes: 0,
        planned: { slots: installed ? 0 : selected.length, sources: installed ? 0 : selected.length, generations: installed ? 0 : selected.length, drafts: 0,
          objects: installed ? 0 : selected.length, ...(photoPlan ? { photos: photoPlan.planned } : {}), ...(retirement ? { retireSource: retirement.sourceId } : {}) },
        resources, outputHashes, retirement, photoCopy: photoPlan, inputs: pack, creditsUrl: base.creditsUrl,
        verification: "deep source hashes/probe and worker manifest objects; authenticated native playback is separate required proof" };
      if (target.mode !== "apply") return report;
      if (retirement) {
        // Same domain primitive used by Remove/Delete; never delete bytes/reservations here.
        await retireVideoGenerations(tx, retirement.slotId, [retirement.generationId], new Date());
        return { ...report, state: "retired", writes: 1, cleanup: "Existing video cleanup ledger/sweeper owns exact source-prefix deletion; use normal DeleteListing for the temporary Listing after verification" };
      }
      if (installed) return report;
      if (photoPlan?.state === "absent") return { ...report, state: "awaiting-photo-copy" };
      phase = "conditional source import";
      for (const entry of resources) {
        const clip = clips.find((row) => row.file === entry.clip) ?? refuse("Missing input definition");
        attemptedObject = entry.objectKey;
        const upload = await storage.send(new CreateMultipartUploadCommand({ Bucket: config.bucket, Key: entry.objectKey, ContentType: "video/mp4" }));
        const uploadId = upload.UploadId ?? refuse(`Storage returned no multipart ID for ${entry.sourceId}`);
        multipartUploads.push({ key: entry.objectKey, uploadId });
        const part = await storage.send(new UploadPartCommand({ Bucket: config.bucket, Key: entry.objectKey, UploadId: uploadId, PartNumber: 1, Body: clip.body }));
        await storage.send(new CompleteMultipartUploadCommand({ Bucket: config.bucket, Key: entry.objectKey, UploadId: uploadId,
          MultipartUpload: { Parts: [{ ETag: part.ETag, PartNumber: 1 }] }, IfNoneMatch: "*" }));
        createdObjects.push(entry.objectKey); attemptedObject = undefined;
        if (hash((await get(storage, config.bucket, entry.objectKey)).body) !== clip.sha256) refuse(`Source changed after upload ${entry.sourceId}`);
        await tx.listingVideo.create({ data: { id: entry.slotId, ownerId: target.ownerId, [entry.type === "listing" ? "listingId" : "draftId"]: entry.targetId } });
        await tx.videoSource.create({ data: { id: entry.sourceId, userId: target.ownerId, listingVideoId: entry.slotId, bucket: config.bucket, objectKey: entry.objectKey,
          multipartUploadId: uploadId, openIdempotencyKey: `rich-ui-v1:${version}:${entry.sourceId}`, contentType: "video/mp4", sizeBytes: clip.bytes, partSizeBytes: clip.bytes, partCount: 1, state: "COMPLETED",
          coverOffsetMs, expiresAt: new Date(), completedAt: new Date() } });
        await tx.videoGeneration.create({ data: { id: entry.generationId, listingVideoId: entry.slotId, sourceId: entry.sourceId, status: "Processing", coverOffsetMs, processingStartedAt: new Date() } });
        await tx.listingVideo.update({ where: { id: entry.slotId }, data: { pendingGenerationId: entry.generationId } });
      }
      return { ...report, state: "processing", writes: selected.length * 5 };
    }, { timeout: 120_000, isolationLevel: target.mode === "apply" ? "ReadCommitted" : "RepeatableRead" });
    if (result.state === "awaiting-photo-copy" && photoPlan) {
      const copied = await runRichPhotos({ ...target, mode: "apply", planHash: photoPlan.planHash });
      const imported = await runRichVideos(target);
      return { ...imported, writes: imported.writes + copied.writes };
    }
    return result;
  } catch (error) {
    const reason = error instanceof Refusal ? error.message : `Rich video scenarios failed at ${phase}`;
    throw new Error(`${reason}. Recovery: ${JSON.stringify({ resources, createdObjects, attemptedObject, multipartUploads,
      action: "No resources deleted. Inspect only these exact IDs/keys; retain partial state. Never reset, overwrite, replace an active generation or run legacy fixtures." })}`);
  } finally { await db.$disconnect(); storage.destroy(); }
}

async function get(storage: S3Client, bucket: string, key: string) {
  const response = await storage.send(new GetObjectCommand({ Bucket: bucket, Key: key }), { abortSignal: AbortSignal.timeout(5000) }).catch(() => refuse(`Unreadable/missing stored object ${key}; retain exact source and generation, no repair`));
  if (!response.Body || (response.ContentLength ?? 0) > 15 * 1024 * 1024) refuse(`Invalid stored object ${key}`);
  return { body: Buffer.from(await response.Body.transformToByteArray()), etag: response.ETag, contentType: response.ContentType };
}
async function list(storage: S3Client, bucket: string, prefix: string) {
  const keys: string[] = []; let token: string | undefined;
  do {
    const response = await storage.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }), { abortSignal: AbortSignal.timeout(5000) });
    keys.push(...(response.Contents ?? []).map((row) => row.Key ?? refuse("Unnamed video object")));
    if (keys.length > 1000) refuse(`Unbounded source prefix ${prefix}`);
    token = response.IsTruncated ? response.NextContinuationToken : undefined;
  } while (token);
  return keys.sort();
}
async function verifyOutputs(storage: S3Client, endpoint: string, bucket: string, entry: Definition, value: Prisma.JsonValue, keys: string[], reservations: { key: string; generationId: string; attempt: number; started: boolean; settled: boolean }[]) {
  if (!value || Array.isArray(value) || typeof value !== "object") refuse(`Missing manifest ${entry.generationId}`);
  const manifest = value as unknown as Manifest;
  const prefix = `video-sources/${entry.sourceId}/processing/1/`;
  const required = ["master", ...["thumbnail", "list", "detail", "fullscreen"].map((name) => `cover:${name}`), "playlist:240", "playlist:360"];
  if (required.some((name) => !manifest[name]) || [240, 360].some((tier) => !Object.keys(manifest).some((name) => name.startsWith(`segment:${tier}:`)))) refuse(`Incomplete HLS/covers ${entry.generationId}`);
  const records = Object.values(manifest);
  const expectedKeys = [`video-sources/${entry.sourceId}/source.mp4`, ...records.map((row) => row.key)].sort();
  if (new Set(records.map((row) => row.key)).size !== records.length || !isDeepStrictEqual(keys, expectedKeys) ||
      reservations.length !== records.length || reservations.some((row) => !row.started || !row.settled || row.attempt !== 1 || row.generationId !== entry.generationId || !records.some((record) => record.key === row.key))) refuse(`Partial/foreign output inventory ${entry.generationId}; missing=${JSON.stringify(expectedKeys.filter((key) => !keys.includes(key)))}; extra=${JSON.stringify(keys.filter((key) => !expectedKeys.includes(key)))}`);
  const hashes: Record<string, string> = {};
  for (const [name, record] of Object.entries(manifest)) {
    if (!record.key?.startsWith(prefix) || !Number.isSafeInteger(record.sizeBytes) || record.sizeBytes <= 0 || !record.etag) refuse(`Invalid manifest member ${entry.generationId}`);
    const object = await get(storage, bucket, record.key);
    if (object.body.length !== record.sizeBytes || object.etag !== record.etag) refuse(`Modified output ${record.key}`);
    if (name === "master" || name.startsWith("playlist:")) {
      const uris = object.body.toString("utf8").split(/\r?\n/).filter((line) => line && !line.startsWith("#"));
      if (!uris.length || uris.some((uri) => !records.some((row) => row.key === uri))) refuse(`Incomplete playlist ${record.key}`);
    }
    hashes[record.key] = hash(object.body);
  }
  // A known existing private object must not be anonymously readable.
  const anonymous = await fetch(new URL(`${bucket}/${encodeURIComponent(`video-sources/${entry.sourceId}/source.mp4`).replaceAll("%2F", "/")}`, endpoint), { method: "HEAD", redirect: "error", signal: AbortSignal.timeout(5000) });
  if (![401, 403].includes(anonymous.status)) refuse(`Private bucket denial failed for ${entry.sourceId}`);
  return hashes;
}
