// Operator script (#824): fills the ThumbHash of every existing Listing photo
// and image Message that has none, from the stored WebP original, and the
// cover ThumbHash of Listing-reference Messages from their Listing's photo. Runbook:
// backfill-thumbhashes.md. Run only after the WebP conversion has completed.
import "dotenv/config";

import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { GetObjectCommand, ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import { Pool } from "pg";
import sharp from "sharp";
import { rgbaToThumbHash } from "thumbhash";

const LISTING_BUCKET = "listing-photos";
const CHAT_BUCKET = "chat-attachments";
const JPEG = /\.jpe?g$/i;
/** Standard padded base64, as the contracts' ThumbHashSchema accepts. */
const CANONICAL_BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

type MediaRow = { id: string; listingId: string; kind: string; key: string; posterKey: string | null; thumbHash: string | null };
type MessageRow = { id: string; kind: string; metadata: Record<string, unknown> | null; deletedAt: Date | null };
type Candidate = { table: "listing_media" | "messages"; id: string; bucket: string; key: string };
type CoverCandidate = { id: string; coverMediaKey: string; thumbHash: string | null };

/**
 * The same encoding as the API's `computeThumbHash`: a 100 px downscale of
 * the upright stored image, encoded by thumbhash@0.1.1 as standard padded base64.
 */
export async function thumbHashOf(image: Buffer): Promise<string> {
  const { data, info } = await sharp(image)
    .resize(100, 100, { fit: "inside" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return Buffer.from(rgbaToThumbHash(info.width, info.height, data)).toString("base64");
}

function isThumbHash(value: unknown): boolean {
  if (typeof value !== "string" || !CANONICAL_BASE64.test(value)) return false;
  const bytes = Buffer.from(value, "base64").length;
  return bytes >= 17 && bytes <= 25;
}

const metadataKey = (row: MessageRow) => (typeof row.metadata?.["key"] === "string" ? row.metadata["key"] : undefined);
const isLiveImage = (row: MessageRow) => row.kind === "image" && row.deletedAt === null && metadataKey(row) !== undefined;

async function readState(pool: Pool) {
  const media = (await pool.query(
    `SELECT "id", "listingId", "kind"::text AS "kind", "key", "posterKey", "thumbHash" FROM "listing_media" ORDER BY "id"`,
  )).rows as MediaRow[];
  const messages = (await pool.query(
    `SELECT "id", "kind"::text AS "kind", "metadata", "deletedAt" FROM "messages" WHERE "metadata" IS NOT NULL ORDER BY "id"`,
  )).rows as MessageRow[];
  const users = (await pool.query(`SELECT "avatarKey", "avatarUrl" FROM "users"`)).rows as { avatarKey: string | null; avatarUrl: string | null }[];
  return { media, messages, users };
}

/** Every key still ending in .jpg/.jpeg in either photo bucket. */
async function jpegObjects(s3: S3Client): Promise<string[]> {
  const found: string[] = [];
  for (const bucket of [LISTING_BUCKET, CHAT_BUCKET]) {
    let token: string | undefined;
    do {
      const page = await s3.send(new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: token }));
      for (const object of page.Contents ?? []) if (object.Key && JPEG.test(object.Key)) found.push(`${bucket}/${object.Key}`);
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
      if (page.IsTruncated && !token) throw new Error("Truncated listing lacks a continuation token");
    } while (token);
  }
  return found;
}

/**
 * The WebP conversion is complete only when no live row references a JPEG
 * and no JPEG object is stored. The converter deletes JPEG objects only after
 * its own `verify` passes, so an empty JPEG inventory is that proof.
 */
async function conversionGate(s3: S3Client, state: Awaited<ReturnType<typeof readState>>): Promise<string[]> {
  const references = [
    ...state.media.filter((row) => JPEG.test(row.key) || JPEG.test(row.posterKey ?? "")).map((row) => `listing_media/${row.id}`),
    ...state.messages.filter((row) => /\.jpe?g"/i.test(JSON.stringify(row.metadata))).map((row) => `messages/${row.id}`),
    ...state.users.filter((row) => JPEG.test(row.avatarKey ?? "") || JPEG.test(row.avatarUrl ?? "")).map(() => "users"),
  ];
  return [...references, ...(await jpegObjects(s3))];
}

function candidates(state: Awaited<ReturnType<typeof readState>>): Candidate[] {
  return [
    ...state.media
      .filter((row) => row.kind === "image" && row.thumbHash === null)
      .map((row): Candidate => ({ table: "listing_media", id: row.id, bucket: LISTING_BUCKET, key: row.key })),
    ...state.messages
      .filter((row) => isLiveImage(row) && !("thumbHash" in (row.metadata ?? {})))
      .map((row): Candidate => ({ table: "messages", id: row.id, bucket: CHAT_BUCKET, key: metadataKey(row) as string })),
  ];
}

/**
 * Listing-reference Messages whose snapshot names a cover photo of its Listing
 * but carries no cover hash. A video cover has no photo row, so it never needs one.
 */
function coverCandidates(state: Awaited<ReturnType<typeof readState>>): CoverCandidate[] {
  const photos = new Map(state.media.filter((row) => row.kind === "image").map((row) => [`${row.listingId}/${row.key}`, row]));
  return state.messages.flatMap((row) => {
    const listingId = row.metadata?.["listingId"];
    const coverMediaKey = row.metadata?.["coverMediaKey"];
    if (row.kind !== "post_ref" || row.deletedAt !== null || typeof coverMediaKey !== "string" || "coverThumbHash" in (row.metadata ?? {})) return [];
    const photo = photos.get(`${String(listingId)}/${coverMediaKey}`);
    return photo ? [{ id: row.id, coverMediaKey, thumbHash: photo.thumbHash }] : [];
  });
}

const counts = (list: Candidate[], covers: CoverCandidate[]) =>
  `${list.filter((c) => c.table === "listing_media").length} Listing photos, ${list.filter((c) => c.table === "messages").length} image Messages and ${covers.length} Listing-reference Messages`;

/** Whether the row still exists, is live and still names this key; a row deleted mid-run is not repair work. */
async function stillReferenced(pool: Pool, candidate: Candidate): Promise<boolean> {
  const result = candidate.table === "listing_media"
    ? await pool.query(`SELECT "id" FROM "listing_media" WHERE "id" = $1 AND "key" = $2`, [candidate.id, candidate.key])
    : await pool.query(`SELECT "id" FROM "messages" WHERE "id" = $1 AND "deletedAt" IS NULL AND "metadata"->>'key' = $2`, [candidate.id, candidate.key]);
  return result.rows.length > 0;
}

async function fill(s3: S3Client, pool: Pool, candidate: Candidate): Promise<boolean> {
  const object = await s3.send(new GetObjectCommand({ Bucket: candidate.bucket, Key: candidate.key }));
  if (!object.Body) throw new Error("empty body");
  const hash = await thumbHashOf(Buffer.from(await object.Body.transformToByteArray()));
  // Conditional on the row still holding this key and no hash, so a rerun,
  // a concurrent API write or a changed row is left as it is.
  const result = candidate.table === "listing_media"
    ? await pool.query(
      `UPDATE "listing_media" SET "thumbHash" = $1 WHERE "id" = $2 AND "key" = $3 AND "thumbHash" IS NULL`,
      [hash, candidate.id, candidate.key],
    )
    : await pool.query(
      `UPDATE "messages" SET "metadata" = jsonb_set("metadata", '{thumbHash}', to_jsonb($1::text)) WHERE "id" = $2 AND "metadata"->>'key' = $3 AND NOT ("metadata" ? 'thumbHash')`,
      [hash, candidate.id, candidate.key],
    );
  return (result.rowCount ?? 0) > 0;
}

function verify(state: Awaited<ReturnType<typeof readState>>) {
  const missing = candidates(state);
  const covers = coverCandidates(state);
  if (missing.length || covers.length) throw new Error(`${counts(missing, covers)} still lack a ThumbHash`);
  const malformed = [
    ...state.media.filter((row) => row.thumbHash !== null && !isThumbHash(row.thumbHash)).map((row) => `listing_media/${row.id}`),
    ...state.messages.filter((row) => isLiveImage(row) && !isThumbHash(row.metadata?.["thumbHash"])).map((row) => `messages/${row.id}`),
  ];
  if (malformed.length) throw new Error(`Malformed ThumbHash: ${malformed.join(", ")}`);
}

export async function main(args = process.argv.slice(2)) {
  const mode = args[0] ?? "dry-run";
  if (!["dry-run", "apply", "verify"].includes(mode)) throw new Error("Usage: backfill-thumbhashes.ts dry-run|apply|verify");
  const required = (name: string) => { const value = process.env[name]; if (!value) throw new Error(`Missing ${name}`); return value; };
  const s3 = new S3Client({
    endpoint: required("MINIO_ENDPOINT"),
    region: process.env["MINIO_REGION"] ?? "us-east-1",
    forcePathStyle: true,
    credentials: { accessKeyId: required("MINIO_ACCESS_KEY"), secretAccessKey: required("MINIO_SECRET_KEY") },
  });
  const pool = new Pool({ connectionString: required("DATABASE_URL") });
  try {
    const state = await readState(pool);
    const jpeg = await conversionGate(s3, state);
    const pending = candidates(state);
    if (mode === "dry-run") {
      console.log(`Dry run, nothing written: ${counts(pending, coverCandidates(state))} need a ThumbHash.`);
      console.log(jpeg.length
        ? `Apply will refuse: ${jpeg.length} JPEG references or objects remain; finish the WebP conversion first.`
        : "WebP conversion complete: no JPEG reference or object remains.");
      return;
    }
    if (jpeg.length) {
      throw new Error(`Refusing: the WebP conversion is not complete (${jpeg.length} JPEG references or objects remain, e.g. ${jpeg.slice(0, 3).join(", ")}). Run convert-photos-webp verify and delete-jpeg first.`);
    }
    if (mode === "verify") {
      verify(state);
      console.log("Verified: every Listing photo and image Message has a well-formed ThumbHash.");
      return;
    }
    const failures: string[] = [];
    let filled = 0;
    let gone = 0;
    for (const candidate of pending) {
      try {
        if (await fill(s3, pool, candidate)) filled += 1;
      } catch (error) {
        if (!(await stillReferenced(pool, candidate))) { gone += 1; continue; }
        failures.push(`${candidate.table}/${candidate.id} (${candidate.bucket}/${candidate.key}): ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    // Cover hashes come from the Listing photos, so they follow the photo pass.
    let covers = 0;
    for (const cover of coverCandidates(await readState(pool))) {
      if (cover.thumbHash === null) continue; // its photo failed above and is listed there
      const result = await pool.query(
        `UPDATE "messages" SET "metadata" = jsonb_set("metadata", '{coverThumbHash}', to_jsonb($1::text)) WHERE "id" = $2 AND "metadata"->>'coverMediaKey' = $3 AND NOT ("metadata" ? 'coverThumbHash')`,
        [cover.thumbHash, cover.id, cover.coverMediaKey],
      );
      if ((result.rowCount ?? 0) > 0) covers += 1;
    }
    console.log(`Filled ${filled} of ${pending.length} missing ThumbHashes and ${covers} Listing-reference cover hashes; skipped ${gone} rows deleted during the run.`);
    if (failures.length) throw new Error(`${failures.length} photos could not be hashed; repair them and rerun apply:\n${failures.join("\n")}`);
  } finally {
    await pool.end();
    s3.destroy();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : "Backfill failed"); process.exitCode = 1; });
}
