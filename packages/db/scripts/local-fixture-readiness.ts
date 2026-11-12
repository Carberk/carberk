/** Local readiness only. No seed, repair, services, authentication or device operations. */
import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";

import { HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { parse } from "dotenv";
import { Client } from "pg";

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
  const database = localUrl(env["DATABASE_URL"], "DATABASE_URL", ["postgresql:", "postgres:"]);
  const photoEndpoint = localUrl(env["MINIO_ENDPOINT"], "MINIO_ENDPOINT", ["http:"]);
  const videoEndpoint = localUrl(env["LISTING_VIDEO_BUCKET_ENDPOINT"] || env["MINIO_ENDPOINT"], "video endpoint", ["http:"]);
  if (env["MINIO_PUBLIC_URL"]) localUrl(env["MINIO_PUBLIC_URL"], "MINIO_PUBLIC_URL", ["http:"]);
  const videoOrigin = localUrl(env["LISTING_VIDEO_API_ORIGIN"] || `http://localhost:${env["PORT"] || 3006}`, "LISTING_VIDEO_API_ORIGIN", ["http:"]);
  if (videoOrigin.origin !== api.origin || String(env["PORT"] || 3006) !== (api.port || "80")) fail("API port and video origin must match --api-origin; select the running API config");
  for (const endpoint of [photoEndpoint, videoEndpoint]) {
    if (endpoint.username || endpoint.password || endpoint.pathname !== "/") fail("Media endpoints must be bare local origins");
  }

  let phase = "API readiness: verify the selected API is running; reuse its owner's process";
  const clients: S3Client[] = [];
  let db: Client | undefined;
  try {
    const response = await fetch(new URL("/readyz", api), { redirect: "error", signal: AbortSignal.timeout(5000) });
    const readiness = await response.json() as { status?: string; service?: string; environment?: string; checks?: Record<string, string> };
    if (!response.ok || readiness.status !== "ready" || readiness.service !== "api" || readiness.environment !== env["APP_ENV"] ||
      !["postgres", "redis", "minio"].every((key) => readiness.checks?.[key] === "ok")) fail("not ready");
    console.log(`API ready: ${api.origin}; Postgres/Redis/MinIO ok (${readiness.environment})`);

    phase = "Database check: verify this local database/schema belongs to the selected API; coordinate initial setup separately";
    db = new Client({ connectionString: database.href, connectionTimeoutMillis: 5000, query_timeout: 5000,
      options: "-c default_transaction_read_only=on -c statement_timeout=5000" });
    // Prevent asynchronous socket errors from dumping private connection details.
    db.on("error", () => undefined);
    await db.connect();
    await db.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const { UI_FIXTURE, VARIANTS } = await import("./ui-fixture");
    const { CLIPS } = await import("../../../scripts/local-video-fixture.cjs");
    const users = await db.query<{ id: string }>('SELECT id FROM users WHERE id = ANY($1::text[])', [UI_FIXTURE.userIds]);
    if (users.rows.length !== UI_FIXTURE.userIds.length) fail("Fixture Users missing; coordinate explicit initial setup (local-testing.md §1a)");
    const listings = await db.query<{ id: string; sellerId: string; status: string; deletedAt: unknown }>(
      'SELECT id, "sellerId", status, "deletedAt" FROM listings WHERE id = ANY($1::text[])', [UI_FIXTURE.listings.map((listing) => listing.id)]);
    const photos = await db.query<{ listingId: string; key: string; sortOrder: number; width: number; height: number }>(
      'SELECT "listingId", key, "sortOrder", width, height FROM listing_media WHERE kind = \'image\' AND "listingId" = ANY($1::text[]) ORDER BY "sortOrder"', [UI_FIXTURE.listings.map((listing) => listing.id)]);
    const conversations = await db.query<{ id: string }>('SELECT id FROM conversations WHERE id = ANY($1::text[])', [UI_FIXTURE.conversationIds]);
    if (conversations.rows.length !== UI_FIXTURE.conversationIds.length) fail("Fixture conversations missing; coordinate baseline repair explicitly");
    for (const expected of UI_FIXTURE.listings) {
      const listing = listings.rows.find((row) => row.id === expected.id);
      const media = photos.rows.filter((row) => row.listingId === expected.id);
      if (!listing || listing.sellerId !== expected.sellerId || listing.status !== "active" || listing.deletedAt ||
        media.length !== expected.photos.length || expected.photos.some((key, order) => media[order]?.key !== key || media[order]?.sortOrder !== order || !((media[order]?.width ?? 0) > 0 && (media[order]?.height ?? 0) > 0))) {
        fail(`Fixture Listing ${expected.id} missing/incompatible; preserve changes and coordinate baseline repair`);
      }
    }
    const videoTargets = UI_FIXTURE.listings.filter((listing) => listing.sellerId === UI_FIXTURE.sellerId).map((listing) => listing.id).sort().slice(0, CLIPS.length);
    const videos = await db.query<{ listingId: string; status: string; state: string; bucket: string; durationMs: number; width: number; height: number; manifest: Record<string, { key: string; sizeBytes: number }> }>(
      `SELECT v."listingId", g.status, s.state, s.bucket, g."durationMs", g.width, g.height, g.manifest
       FROM listing_videos v JOIN video_generations g ON g.id = v."activeGenerationId" AND g."listingVideoId" = v.id
       JOIN video_sources s ON s.id = g."sourceId" WHERE v."listingId" = ANY($1::text[])`, [videoTargets]);
    await db.query("ROLLBACK");
    const videoBucket = env["LISTING_VIDEO_BUCKET_NAME"] || "listing-videos";
    for (const id of videoTargets) {
      const video = videos.rows.find((row) => row.listingId === id);
      if (!video || video.status !== "Ready" || video.state !== "COMPLETED" || video.bucket !== videoBucket ||
        !(video.durationMs > 0 && video.width > 0 && video.height > 0) || !video.manifest ||
        !["master", ...VARIANTS.map((variant) => `cover:${variant}`)].every((member) => video.manifest[member]) ||
        !Object.keys(video.manifest).some((member) => member.startsWith("playlist:")) ||
        !Object.keys(video.manifest).some((member) => member.startsWith("segment:")) ||
        Object.values(video.manifest).some((entry) => !entry || typeof entry.key !== "string" || !entry.key || !Number.isSafeInteger(entry.sizeBytes) || entry.sizeBytes <= 0)) {
        fail(`Ready video missing/incompatible on ${id}; coordinate video:fixture separately, after any explicit UI reset`);
      }
    }
    console.log(`Baseline present: ${users.rows.length} Users, ${listings.rows.length} Listings, ${conversations.rows.length} conversations; database snapshot read-only`);
    function storage(endpoint: URL, video: boolean) {
      const client = new S3Client({ endpoint: endpoint.origin, forcePathStyle: true, maxAttempts: 1,
        region: (video && env["LISTING_VIDEO_BUCKET_REGION"]) || env["MINIO_REGION"] || "us-east-1",
        credentials: {
          accessKeyId: (video && env["LISTING_VIDEO_BUCKET_ACCESS_KEY_ID"]) || env["MINIO_ACCESS_KEY"] || "",
          secretAccessKey: (video && env["LISTING_VIDEO_BUCKET_SECRET_ACCESS_KEY"]) || env["MINIO_SECRET_KEY"] || "",
        },
      });
      clients.push(client);
      return client;
    }
    const photoStorage = storage(photoEndpoint, false);
    const videoStorage = storage(videoEndpoint, true);
    let objectCount = 0;
    async function head(client: S3Client, bucket: string, key: string, bytes?: number) {
      const result = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }), { abortSignal: AbortSignal.timeout(5000) });
      if (!(result.ContentLength && result.ContentLength > 0) || (bytes !== undefined && result.ContentLength !== bytes)) fail("missing or size mismatch");
      objectCount++;
    }
    phase = "Photo objects missing/unavailable: verify local storage credentials/objects; coordinate repair, do not reseed";
    for (const photo of photos.rows) for (const variant of ["original", ...VARIANTS]) {
      await head(photoStorage, "listing-photos", photo.key.replace(/original\.webp$/, `${variant}.webp`));
    }
    phase = "Ready-video objects missing/inconsistent: verify local bucket/manifest bytes; coordinate explicit video rebuild";
    for (const video of videos.rows) for (const entry of Object.values(video.manifest)) {
      await head(videoStorage, videoBucket, entry.key, entry.sizeBytes);
    }
    console.log(`Media available: ${photos.rows.length} photos, ${videos.rows.length} Ready videos; ${objectCount} nonempty objects verified with HEAD`);
    if (env["LISTING_VIDEO_UPLOADS_ENABLED"] !== "true" ||
      !env["LISTING_VIDEO_UPLOAD_TESTER_USER_IDS"]?.split(",").includes(UI_FIXTURE.sellerId) ||
      ![UI_FIXTURE.sellerId, UI_FIXTURE.buyerId].every((id) => env["LISTING_VIDEO_VIEW_TESTER_USER_IDS"]?.split(",").includes(id))) {
      fail("Ready video access configuration missing; coordinate the API tester settings and owner restart (local-testing.md §1a)");
    }
    console.log("READY (local environment only). No data/auth changed. Device sign-in and build/origin are unverified; follow local-testing.md and native:signin --reuse-only.");
  } catch (error) {
    // Only our own actionable messages may cross the CLI boundary.
    if (error instanceof Error && /^(Fixture |Ready video )/.test(error.message)) throw error;
    fail(phase);
  } finally {
    await db?.end().catch(() => undefined);
    for (const client of clients) client.destroy();
  }
}

void main().catch((error: unknown) => {
  // parseArgs and filesystem errors can contain caller-provided private values.
  const message = error instanceof Error && !["TypeError", "SyntaxError"].includes(error.name) && !("code" in error)
    ? error.message : "Invalid arguments or env file; use --api-origin http://127.0.0.1:<port> --env-file <API env file>";
  console.error(`NOT READY: ${message}`);
  process.exitCode = 1;
});
