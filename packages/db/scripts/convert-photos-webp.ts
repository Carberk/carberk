#!/usr/bin/env tsx
import "dotenv/config";

import { createHash, randomUUID } from "node:crypto";
import { readFile, writeFile, open } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { DeleteObjectCommand, GetBucketVersioningCommand, GetObjectCommand, HeadObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { Pool } from "pg";
import sharp from "sharp";

const BUCKETS = ["listing-photos", "chat-attachments"] as const;
const VARIANTS = [
  { name: "thumbnail", width: 200, height: 200, fit: "cover" },
  { name: "list", width: 600, height: 400, fit: "cover" },
  { name: "detail", width: 1200, height: 800, fit: "inside" },
  { name: "fullscreen", width: 2400, height: 1600, fit: "inside" },
] as const;

// Explicit photo-bearing columns. Identity, body text, dates and ownership never change.
const TABLES = [
  { table: "listing_media", id: "id", columns: ["key", "posterKey"] },
  { table: "users", id: "id", columns: ["avatarKey", "avatarUrl"] },
  { table: "messages", id: "id", columns: ["metadata"] },
  { table: "listing_drafts", id: "id", columns: ["payload"] },
  { table: "media_uploads", id: "id", columns: ["key", "objectKeys", "contentType", "sizeBytes"] },
  { table: "media_upload_cleanups", id: "uploadId", columns: ["key", "objectKeys"] },
  { table: "content_reports", id: "id", columns: ["messageContext"] },
  { table: "notification_history", id: "id", columns: ["data"] },
] as const;

type Stored = { bucket: string; key: string; etag: string };
type Row = { table: string; idColumn: string; id: string; before: Record<string, unknown>; after: Record<string, unknown> };
type Plan = { auditHistoryReferenceCount?: number; version: 1; endpoint: string; databaseFingerprint: string; objects: Stored[]; rows: Row[] };
type Event = { type: "prepared" | "written" | "deleted"; bucket: string; key: string; hash?: string; etag?: string };
const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const isJpeg = (key: string) => /\.(jpg|jpeg)$/i.test(key);
const webpKey = (key: string) => key.replace(/\.(jpg|jpeg)$/i, ".webp");
const canonical = (value: unknown): string => JSON.stringify(value, (_key, entry: unknown) => entry && typeof entry === "object" && !Array.isArray(entry) ? Object.fromEntries(Object.entries(entry).sort(([a], [b]) => a.localeCompare(b))) : entry);
const equal = (a: unknown, b: unknown) => canonical(a) === canonical(b);
const quote = (identifier: string) => `"${identifier}"`;

/** Rewrite exact storage keys and their URL suffixes, recursively through saved snapshots. */
export function rewriteReferences(value: unknown, mappings: ReadonlyMap<string, string>): unknown {
  if (typeof value === "string") {
    const boundary = value.search(/[?#]/);
    const path = boundary < 0 ? value : value.slice(0, boundary);
    const suffix = boundary < 0 ? "" : value.slice(boundary);
    const direct = mappings.get(path);
    if (direct) return direct + suffix;
    for (const [oldKey, newKey] of mappings) {
      if (path.endsWith(`/${oldKey}`)) return path.slice(0, -oldKey.length) + newKey + suffix;
    }
    return value;
  }
  if (Array.isArray(value)) return value.map((entry) => rewriteReferences(entry, mappings));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([name, entry]) => [name, rewriteReferences(entry, mappings)]));
  return value;
}

const PHOTO_FIELDS = new Set(["key", "posterKey", "avatarKey", "avatarUrl", "coverMediaKey", "photoKeys", "objectKeys", "thumbnail", "list", "detail", "fullscreen"]);
function assertReferencesInventoried(value: unknown, mappings: ReadonlyMap<string, string>, field = "") {
  if (typeof value === "string" && PHOTO_FIELDS.has(field) && /\.(jpg|jpeg)(?:[?#].*)?$/i.test(value) && rewriteReferences(value, mappings) === value) throw new Error(`JPEG reference has no inventoried object in field ${field}`);
  if (Array.isArray(value)) for (const entry of value) assertReferencesInventoried(entry, mappings, field);
  else if (value && typeof value === "object") for (const [name, entry] of Object.entries(value)) assertReferencesInventoried(entry, mappings, name);
}

function mappingsFor(objects: Stored[]) {
  const mappings = new Map<string, string>();
  for (const object of objects) if (isJpeg(object.key)) mappings.set(object.key, webpKey(object.key));
  return mappings;
}

async function inventory(s3: S3Client): Promise<Stored[]> {
  const objects: Stored[] = [];
  for (const bucket of BUCKETS) {
    let token: string | undefined;
    do {
      const page = await s3.send(new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: token }));
      for (const object of page.Contents ?? []) {
        if (!object.Key || !object.ETag) throw new Error(`Inventory lacks key/ETag in ${bucket}`);
        if (isJpeg(object.Key) || object.Key.endsWith(".webp")) objects.push({ bucket, key: object.Key, etag: object.ETag });
      }
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
      if (page.IsTruncated && !token) throw new Error("Truncated inventory lacks continuation token");
    } while (token);
  }
  return objects.sort((a, b) => `${a.bucket}/${a.key}`.localeCompare(`${b.bucket}/${b.key}`));
}

async function snapshotRows(pool: Pool, mappings: ReadonlyMap<string, string>, includeUploads = false): Promise<Row[]> {
  const rows: Row[] = [];
  for (const spec of TABLES) {
    const result = await pool.query(`SELECT ${[spec.id, ...spec.columns].map(quote).join(",")} FROM ${quote(spec.table)} ORDER BY ${quote(spec.id)}`);
    for (const row of result.rows as Record<string, unknown>[]) {
      const before = Object.fromEntries(spec.columns.map((column) => [column, row[column]]));
      assertReferencesInventoried(before, mappings);
      const after = rewriteReferences(before, mappings) as Record<string, unknown>;
      if (spec.table === "media_uploads" && String(after["key"]).endsWith(".webp")) after["contentType"] = "image/webp";
      if (Array.isArray(after["objectKeys"])) after["objectKeys"] = [...new Set(after["objectKeys"])];
      if (!equal(before, after) || (includeUploads && spec.table === "media_uploads" && String(after["key"]).endsWith(".webp"))) rows.push({ table: spec.table, idColumn: spec.id, id: String(row[spec.id]), before, after });
    }
  }
  return rows;
}

function validatePlan(plan: Plan) {
  if (plan.version !== 1 || !Array.isArray(plan.objects) || !Array.isArray(plan.rows)) throw new Error("Invalid photo conversion plan");
  for (const object of plan.objects) {
    if (!BUCKETS.some((bucket) => bucket === object.bucket) || typeof object.key !== "string" || !/\.(jpg|jpeg|webp)$/i.test(object.key) || typeof object.etag !== "string" || !object.etag) throw new Error("Invalid inventoried photo object");
  }
  const mappings = mappingsFor(plan.objects);
  for (const row of plan.rows) {
    const spec = TABLES.find((candidate) => candidate.table === row.table);
    if (!spec || row.idColumn !== spec.id || typeof row.id !== "string" || !row.before || !row.after || !equal(Object.keys(row.before).sort(), [...spec.columns].sort())) throw new Error("Invalid photo reference row in plan");
    const expected = rewriteReferences(row.before, mappings) as Record<string, unknown>;
    if (row.table === "media_uploads" && String(expected["key"]).endsWith(".webp")) expected["contentType"] = "image/webp";
    if (Array.isArray(expected["objectKeys"])) expected["objectKeys"] = [...new Set(expected["objectKeys"])];
    if (!equal(expected, row.after)) throw new Error("Plan changes data beyond photo references");
  }
}

async function auditHistoryReferenceCount(pool: Pool) {
  const result = await pool.query('SELECT "details" FROM "audit_logs"');
  return result.rows.filter((row: { details: unknown }) => /\.(jpg|jpeg)(?:["?#]|$)/i.test(JSON.stringify(row.details))).length;
}

async function readObject(s3: S3Client, bucket: string, key: string, etag?: string) {
  const object = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key, ...(etag ? { IfMatch: etag } : {}) }));
  if (!object.Body || !object.ETag) throw new Error(`Missing body/ETag for ${bucket}/${key}`);
  return { bytes: Buffer.from(await object.Body.transformToByteArray()), etag: object.ETag, contentType: object.ContentType };
}

async function readConversionSource(s3: S3Client, object: Stored, events: Event[]) {
  const prior = [...events].reverse().find((event) => (event.type === "written" || event.type === "prepared") && event.bucket === object.bucket && event.key === object.key);
  const source = await readObject(s3, object.bucket, object.key);
  if (source.etag !== object.etag && (!prior?.hash || hash(source.bytes) !== prior.hash)) throw new Error(`Original changed: ${object.key}`);
  return source;
}

async function existingEtag(s3: S3Client, bucket: string, key: string): Promise<string | undefined> {
  try {
    const object = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    if (!object.ETag) throw new Error(`No ETag for ${bucket}/${key}`);
    return object.ETag;
  } catch (error) {
    if ((error as { name?: string }).name === "NotFound" || (error as { name?: string }).name === "NoSuchKey") return undefined;
    throw error;
  }
}

async function journal(path: string, event: Event) {
  const file = await open(path, "a", 0o600);
  try { await file.writeFile(JSON.stringify(event) + "\n"); await file.sync(); } finally { await file.close(); }
}

async function loadEvents(path: string): Promise<Event[]> {
  try { return (await readFile(path, "utf8")).trim().split("\n").filter(Boolean).map((line) => JSON.parse(line) as Event); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
}

async function writeVerified(s3: S3Client, path: string, events: Event[], bucket: string, key: string, bytes: Buffer, expectedEtag?: string) {
  const digest = hash(bytes);
  const prior = [...events].reverse().find((event) => event.type === "written" && event.bucket === bucket && event.key === key);
  if (prior) {
    const stored = await readObject(s3, bucket, key);
    if (hash(stored.bytes) !== prior.hash || prior.hash !== digest) throw new Error(`Journal target changed: ${bucket}/${key}`);
    return;
  }
  const prepared = [...events].reverse().find((event) => event.type === "prepared" && event.bucket === bucket && event.key === key);
  const currentEtag = await existingEtag(s3, bucket, key);
  if (!prepared && currentEtag !== expectedEtag) throw new Error(`Target changed since inventory: ${key}`);
  const etag = prepared?.etag ?? expectedEtag;
  if (prepared && prepared.hash !== digest) throw new Error(`Prepared output differs: ${key}`);
  if (prepared && currentEtag !== prepared.etag) {
    const current = await readObject(s3, bucket, key);
    if (hash(current.bytes) !== digest) throw new Error(`Target changed after prepare: ${key}`);
    const event: Event = { type: "written", bucket, key, hash: digest, etag: current.etag };
    await journal(path, event); events.push(event); return;
  }
  if (!prepared) {
    const event: Event = { type: "prepared", bucket, key, hash: digest, ...(etag ? { etag } : {}) };
    await journal(path, event); events.push(event);
  }
  await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: bytes, ContentType: "image/webp", ...(etag ? { IfMatch: etag } : { IfNoneMatch: "*" }) }));
  const stored = await readObject(s3, bucket, key);
  const meta = await sharp(stored.bytes).metadata();
  if (hash(stored.bytes) !== digest || meta.format !== "webp" || stored.contentType !== "image/webp" || meta.exif || meta.xmp || meta.iptc) throw new Error(`Read-back failed: ${bucket}/${key}`);
  const event: Event = { type: "written", bucket, key, hash: digest, etag: stored.etag };
  await journal(path, event); events.push(event);
}

async function assertConditionalStorage(s3: S3Client) {
  for (const bucket of BUCKETS) {
    const versioning = await s3.send(new GetBucketVersioningCommand({ Bucket: bucket }));
    if (versioning.Status !== undefined) throw new Error(`Conversion requires an unversioned bucket: ${bucket}`);
    const key = `.webp-conversion-probe/${randomUUID()}`;
    const initial = await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: Buffer.from("probe"), IfNoneMatch: "*" }));
    if (!initial.ETag) throw new Error("Probe returned no ETag");
    try {
      for (const command of [
        new PutObjectCommand({ Bucket: bucket, Key: key, Body: Buffer.from("wrong"), IfMatch: '"wrong"' }),
        new PutObjectCommand({ Bucket: bucket, Key: key, Body: Buffer.from("wrong"), IfNoneMatch: "*" }),
        new DeleteObjectCommand({ Bucket: bucket, Key: key, IfMatch: '"wrong"' }),
      ]) {
        try { await s3.send(command); }
        catch (error) { if ((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 412) continue; throw error; }
        throw new Error(`Store ignores conditional writes/deletes: ${bucket}`);
      }
    } finally { await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key, IfMatch: initial.ETag })); }
  }
}

async function convertObjects(s3: S3Client, plan: Plan, path: string, events: Event[]) {
  const expected = (bucket: string, key: string) => plan.objects.find((object) => object.bucket === bucket && object.key === key)?.etag;
  const originals = plan.objects.filter((object) => /\/original\.(jpg|jpeg|webp)$/i.test(object.key));
  const generated = new Set<string>();
  for (const original of originals) {
    // A journaled WebP original was replaced in place; use the unchanged content for resume.
    const source = await readConversionSource(s3, original, events);
    const meta = await sharp(source.bytes).metadata();
    const cleanWebp = meta.format === "webp" && !meta.exif && !meta.xmp && !meta.iptc && !meta.orientation;
    const bytes = cleanWebp ? source.bytes : await sharp(source.bytes).autoOrient().webp({ quality: 80 }).toBuffer();
    const key = webpKey(original.key);
    await writeVerified(s3, path, events, original.bucket, key, bytes, expected(original.bucket, key));
    generated.add(`${original.bucket}/${key}`);
    if (original.bucket === "listing-photos") for (const variant of VARIANTS) {
      const target = key.replace(/original\.webp$/, `${variant.name}.webp`);
      const output = await sharp(bytes).resize(variant.width, variant.height, { fit: variant.fit, withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
      await writeVerified(s3, path, events, original.bucket, target, output, expected(original.bucket, target));
      generated.add(`${original.bucket}/${target}`);
    }
  }
  // Legacy chat attachments and standalone photos may not use original/<variant> naming.
  for (const object of plan.objects) {
    const key = webpKey(object.key);
    if (generated.has(`${object.bucket}/${key}`)) continue;
    if (/\/(detail|fullscreen)\.(jpg|jpeg|webp)$/i.test(object.key)) throw new Error(`Cannot regenerate padded derivative without original: ${object.key}`);
    const source = await readConversionSource(s3, object, events);
    const meta = await sharp(source.bytes).metadata();
    const output = meta.format === "webp" && !meta.exif && !meta.xmp && !meta.iptc && !meta.orientation ? source.bytes : await sharp(source.bytes).autoOrient().webp({ quality: 80 }).toBuffer();
    await writeVerified(s3, path, events, object.bucket, key, output, expected(object.bucket, key));
  }
}

async function updateRows(pool: Pool, plan: Plan, s3: S3Client) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const row of plan.rows) {
      if (row.table === "media_uploads" && String(row.after["key"]).endsWith(".webp")) {
        const object = await readObject(s3, "listing-photos", String(row.after["key"]));
        row.after["sizeBytes"] = object.bytes.length;
      }
      const columns = Object.keys(row.before);
      const current = await client.query(`SELECT ${columns.map(quote).join(",")} FROM ${quote(row.table)} WHERE ${quote(row.idColumn)}=$1 FOR UPDATE`, [row.id]);
      if (current.rowCount !== 1) throw new Error(`Missing ${row.table}/${row.id}`);
      if (equal(current.rows[0], row.after)) continue;
      if (!equal(current.rows[0], row.before)) throw new Error(`Concurrent change: ${row.table}/${row.id}`);
      const values = columns.map((column) => row.after[column]);
      const sets = columns.map((column, index) => `${quote(column)}=$${index + 1}`).join(",");
      await client.query(`UPDATE ${quote(row.table)} SET ${sets} WHERE ${quote(row.idColumn)}=$${values.length + 1}`, [...values.map((value) => value && !Array.isArray(value) && typeof value === "object" ? JSON.stringify(value) : value), row.id]);
    }
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}

async function verify(s3: S3Client, pool: Pool, plan: Plan, events: Event[]) {
  for (const source of plan.objects) {
    if (!events.some((event) => event.type === "written" && event.bucket === source.bucket && event.key === webpKey(source.key))) throw new Error(`Replacement has not been written: ${source.key}`);
  }
  for (const event of events.filter((entry) => entry.type === "written")) {
    const stored = await readObject(s3, event.bucket, event.key, event.etag);
    if (hash(stored.bytes) !== event.hash || (await sharp(stored.bytes).metadata()).format !== "webp") throw new Error(`Target verification failed: ${event.key}`);
  }
  const remaining = await snapshotRows(pool, mappingsFor(plan.objects));
  if (remaining.length) throw new Error(`${remaining.length} rows still contain old photo references`);
  // Compare every touched row after the transaction, including the nested snapshot content.
  for (const row of plan.rows) {
    if (row.table === "media_uploads" && String(row.after["key"]).endsWith(".webp")) row.after["sizeBytes"] = (await readObject(s3, "listing-photos", String(row.after["key"]))).bytes.length;
    const result = await pool.query(`SELECT ${Object.keys(row.after).map(quote).join(",")} FROM ${quote(row.table)} WHERE ${quote(row.idColumn)}=$1`, [row.id]);
    if (!equal(result.rows[0], row.after)) throw new Error(`Read-back mismatch: ${row.table}/${row.id}`);
  }
}

export async function main(args = process.argv.slice(2)) {
  const mode = args[0] ?? "dry-run";
  const path = resolve(args[1] ?? "photo-webp-plan.json");
  if (!["dry-run", "apply", "verify", "delete-jpeg"].includes(mode)) throw new Error("Usage: convert-photos-webp.ts dry-run|apply|verify|delete-jpeg PLAN.json");
  const required = (name: string) => { const value = process.env[name]; if (!value) throw new Error(`Missing ${name}`); return value; };
  const endpoint = required("MINIO_ENDPOINT");
  const database = required("DATABASE_URL");
  if (mode !== "dry-run" && process.env["PHOTO_CONVERSION_WRITERS_PAUSED"] !== "yes") throw new Error("Pause API upload and cleanup writers, then set PHOTO_CONVERSION_WRITERS_PAUSED=yes");
  const s3 = new S3Client({ endpoint, region: process.env["MINIO_REGION"] ?? "us-east-1", forcePathStyle: true, credentials: { accessKeyId: required("MINIO_ACCESS_KEY"), secretAccessKey: required("MINIO_SECRET_KEY") } });
  const pool = new Pool({ connectionString: database });
  try {
    if (mode === "dry-run") {
      const objects = await inventory(s3);
      const plan: Plan = { auditHistoryReferenceCount: await auditHistoryReferenceCount(pool), version: 1, endpoint, databaseFingerprint: hash(database), objects, rows: await snapshotRows(pool, mappingsFor(objects), true) };
      await writeFile(path, JSON.stringify(plan, null, 2), { flag: "wx", mode: 0o600 });
      console.log(`Inventory only: ${objects.length} source objects, ${plan.rows.length} reference rows. Plan ${path}; ${plan.auditHistoryReferenceCount} audit snapshots preserved unchanged`);
      return;
    }
    const plan = JSON.parse(await readFile(path, "utf8")) as Plan;
    validatePlan(plan);
    if (plan.endpoint !== endpoint || plan.databaseFingerprint !== hash(database)) throw new Error("Plan belongs to a different store/database");
    const journalPath = `${path}.journal.jsonl`;
    const events = await loadEvents(journalPath);
    if (mode === "apply" || mode === "delete-jpeg") await assertConditionalStorage(s3);
    if (mode === "apply") { await convertObjects(s3, plan, journalPath, events); await updateRows(pool, plan, s3); }
    await verify(s3, pool, plan, events);
    if (mode === "delete-jpeg") {
      for (const object of plan.objects.filter((candidate) => isJpeg(candidate.key))) {
        if (events.some((event) => event.type === "deleted" && event.bucket === object.bucket && event.key === object.key)) continue;
        if (!events.some((event) => event.type === "written" && event.bucket === object.bucket && event.key === webpKey(object.key))) throw new Error(`No verified replacement for ${object.key}`);
        const current = await existingEtag(s3, object.bucket, object.key);
        if (current !== undefined && current !== object.etag) throw new Error(`Source changed before deletion: ${object.key}`);
        if (current) await s3.send(new DeleteObjectCommand({ Bucket: object.bucket, Key: object.key, IfMatch: object.etag }));
        await journal(journalPath, { type: "deleted", bucket: object.bucket, key: object.key });
      }
      const remaining = (await inventory(s3)).filter((object) => isJpeg(object.key));
      if (remaining.length) throw new Error(`${remaining.length} JPEG objects remain; create another inventory`);
    }
    console.log(`${mode} completed with read-back verification. JPEG deletion is a separate operator step.`);
  } finally { await pool.end(); s3.destroy(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : "Conversion failed"); process.exitCode = 1; });
