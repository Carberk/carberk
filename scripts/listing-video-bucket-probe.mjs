#!/usr/bin/env node
/**
 * Probe an S3-compatible bucket for the Listing video storage contract (#1037).
 *
 * Checks, with disposable objects under one random prefix:
 * presigned upload/download, multipart upload (part retry + double completion),
 * byte-range reads, conditional writes/deletes, versioning, and cleanup.
 *
 * Credentials come only from the environment. Nothing secret, no signed URL,
 * no endpoint, no bucket name and no object content is ever printed.
 *
 * Required env: S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY
 * Optional env: S3_REGION (default "auto"), S3_URL_STYLE ("virtual-host" | "path")
 * Run: node scripts/listing-video-bucket-probe.mjs
 *
 * Exit code is 0 only when every core check passes and no probe object remains.
 */
import { createHash, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";

// Use the installed API SDK versions without adding root dependencies.
const require = createRequire(new URL("../apps/api/package.json", import.meta.url));
const {
  AbortMultipartUploadCommand,
  ListPartsCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetBucketVersioningCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListMultipartUploadsCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

const required = ["S3_ENDPOINT", "S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"];
for (const name of required) {
  if (!process.env[name]) {
    console.error(`missing env: ${name}`);
    process.exit(2);
  }
}

const bucket = process.env.S3_BUCKET;
const client = new S3Client({
  endpoint: process.env.S3_ENDPOINT,
  region: process.env.S3_REGION ?? "auto",
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
  },
  forcePathStyle: process.env.S3_URL_STYLE === "path",
  maxAttempts: 1,
  requestHandler: { requestTimeout: 300_000, connectionTimeout: 10_000 },
});

const fetchInit = (init = {}) => ({ ...init, signal: AbortSignal.timeout(60_000) });
// Only allowlisted categories are printed: raw error messages can embed
// endpoint hosts, bucket names, or signed URLs.
const errDetail = (err) => `${codeOf(err)} http=${statusOf(err) ?? "none"}`;
class ProbeAbort extends Error {}

const s3send = (command, timeoutMs = 60_000) => client.send(command, { abortSignal: AbortSignal.timeout(timeoutMs) });
const results = [];
function record(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}
function note(name, detail) {
  console.log(`NOTE ${name} — ${detail}`);
}

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
const fill = (size, seed) => {
  const buf = Buffer.alloc(size);
  for (let i = 0; i < size; i += 1) buf[i] = (i * 31 + seed) % 251;
  return buf;
};
const statusOf = (err) => err?.$metadata?.httpStatusCode;
const codeOf = (err) => {
  const raw = err?.name ?? err?.Code ?? "unknown";
  return ["AbortError", "TimeoutError", "ProbeAbort", "NoSuchKey", "NotFound", "NoSuchUpload",
    "PreconditionFailed", "ConditionalRequestConflict", "AccessDenied", "InvalidRequest", "InternalError"].includes(raw) ? raw : "error";
};
const isMissing = (err) => statusOf(err) === 404 || codeOf(err) === "NoSuchKey" || codeOf(err) === "NotFound";
const isRefusal = (err) => [404, 409, 412].includes(statusOf(err));

async function bodyBytes(body) {
  if (!body) return Buffer.alloc(0);
  if (typeof body.transformToByteArray === "function") return Buffer.from(await body.transformToByteArray());
  const chunks = [];
  for await (const chunk of body) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

async function interruptPart(url, body) {
  // Send only a prefix of the declared body, then close the connection. A
  // fully accepted PUT retried below also covers a lost acknowledgement.
  await new Promise((resolve, reject) => {
    let interrupted = false;
    const request = (url.startsWith("https:") ? httpsRequest : httpRequest)(url, {
      method: "PUT", headers: { "content-length": body.length },
      signal: AbortSignal.timeout(60_000),
    });
    request.on("response", (response) => {
      response.resume();
      reject(new ProbeAbort("partial upload unexpectedly returned a response"));
    });
    request.on("error", (error) => { if (!interrupted) reject(error); });
    request.on("close", () => { if (interrupted) resolve(); });
    request.write(body.subarray(0, 64 * 1024), () => {
      interrupted = true;
      request.destroy();
    });
  });
}

const prefix = `probe/1037/${randomUUID()}/`;
const smallKey = `${prefix}small.bin`;
const multiKey = `${prefix}multipart.bin`;
const condKey = `${prefix}conditional.bin`;
let uploadId;
let writesStarted = false;

async function listAllUploads() {
  const uploads = [];
  let keyMarker;
  let uploadIdMarker;
  do {
    const page = await s3send(new ListMultipartUploadsCommand({
      Bucket: bucket, Prefix: prefix, KeyMarker: keyMarker, UploadIdMarker: uploadIdMarker,
    }));
    uploads.push(...(page.Uploads ?? []));
    keyMarker = page.IsTruncated ? page.NextKeyMarker : undefined;
    uploadIdMarker = page.IsTruncated ? page.NextUploadIdMarker : undefined;
  } while (keyMarker);
  return uploads;
}

async function listAllObjects() {
  const keys = [];
  let token;
  do {
    const page = await s3send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }));
    keys.push(...(page.Contents ?? []).map((obj) => obj.Key));
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  return keys;
}

async function cleanup() {
  let verified = true;
  // Abort every upload under the prefix, including one whose creation
  // response was lost. A listing error means cleanup cannot be verified.
  const discovered = await listAllUploads().catch((err) => { note("cleanup list uploads", errDetail(err)); verified = false; return []; });
  if (uploadId && !discovered.some((u) => u.UploadId === uploadId)) discovered.push({ Key: multiKey, UploadId: uploadId });
  uploadId = undefined;
  for (const upload of discovered) {
    await s3send(new AbortMultipartUploadCommand({ Bucket: bucket, Key: upload.Key, UploadId: upload.UploadId })).catch(() => {});
  }
  const objectKeys = await listAllObjects().catch((err) => { note("cleanup list objects", errDetail(err)); verified = false; return []; });
  for (const key of new Set([...objectKeys, smallKey, multiKey, condKey])) {
    await s3send(new DeleteObjectCommand({ Bucket: bucket, Key: key })).catch(() => {});
  }
  const remaining = await listAllObjects().catch((err) => { note("cleanup re-list objects", errDetail(err)); verified = false; return null; });
  const open = await listAllUploads().catch((err) => { note("cleanup re-list uploads", errDetail(err)); verified = false; return null; });
  record("cleanup: no probe objects or multipart uploads remain",
    verified && remaining !== null && open !== null && remaining.length === 0 && open.length === 0,
    `remaining=${remaining?.length ?? "unverified"}, openUploads=${open?.length ?? "unverified"}`);
}

try {
  // Versioning: the conditional-write contract expects an unversioned bucket.
  const versioning = await s3send(new GetBucketVersioningCommand({ Bucket: bucket }));
  note("versioning", versioning.Status ? `status=${versioning.Status}` : "unversioned (no status returned)");
  record("versioning: bucket is unversioned", versioning.Status === undefined,
    versioning.Status ? `status=${versioning.Status}` : "no status");
  // Plain deletes cannot prove removal on a versioned bucket (delete markers
  // hide retained versions), so stop before creating any object.
  if (versioning.Status !== undefined) throw new ProbeAbort("versioned bucket");
  writesStarted = true;

  // Presigned upload + download.
  const small = fill(256 * 1024, 7);
  const putUrl = await getSignedUrl(client, new PutObjectCommand({
    Bucket: bucket, Key: smallKey, ContentType: "video/mp4", ContentLength: small.length,
  }), { expiresIn: 600 });
  const putRes = await fetch(putUrl, fetchInit({ method: "PUT", headers: { "content-type": "video/mp4" }, body: small }));
  record("presigned upload (PUT)", putRes.ok, `http=${putRes.status}`);
  await putRes.arrayBuffer().catch(() => {});

  const getUrl = await getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: smallKey }), { expiresIn: 600 });
  const getRes = await fetch(getUrl, fetchInit());
  const downloaded = Buffer.from(await getRes.arrayBuffer());
  record("presigned download (GET)", getRes.ok && sha256(downloaded) === sha256(small),
    `http=${getRes.status}, bytes=${downloaded.length}`);

  // Byte-range reads: direct and through a presigned URL.
  const start = 1000;
  const end = 4999;
  const ranged = await s3send(new GetObjectCommand({ Bucket: bucket, Key: smallKey, Range: `bytes=${start}-${end}` }));
  const rangedBytes = await bodyBytes(ranged.Body);
  record("range read (SDK)", ranged.$metadata.httpStatusCode === 206
    && ranged.ContentRange === `bytes ${start}-${end}/${small.length}`
    && ranged.AcceptRanges === "bytes" && Boolean(ranged.ETag)
    && ranged.ContentLength === end - start + 1
    && rangedBytes.equals(small.subarray(start, end + 1)),
  `http=${ranged.$metadata.httpStatusCode}, content-range=${ranged.ContentRange ?? "none"}, accept-ranges=${ranged.AcceptRanges ?? "none"}, etag=${ranged.ETag ? "present" : "missing"}`);

  const rangedUrlRes = await fetch(getUrl, fetchInit({ headers: { Range: `bytes=${start}-${end}` } }));
  const rangedUrlBytes = Buffer.from(await rangedUrlRes.arrayBuffer());
  record("range read (presigned URL)", rangedUrlRes.status === 206
    && rangedUrlRes.headers.get("content-range") === `bytes ${start}-${end}/${small.length}`
    && rangedUrlRes.headers.get("accept-ranges") === "bytes"
    && rangedUrlRes.headers.get("content-length") === String(end - start + 1)
    && Boolean(rangedUrlRes.headers.get("etag"))
    && rangedUrlBytes.equals(small.subarray(start, end + 1)),
  `http=${rangedUrlRes.status}, content-range=${rangedUrlRes.headers.get("content-range") ?? "none"}, accept-ranges=${rangedUrlRes.headers.get("accept-ranges") ?? "none"}, content-length=${rangedUrlRes.headers.get("content-length") ?? "none"}`);

  // Multipart: part 1 direct, part 2 via presigned URL uploaded twice (retry),
  // then completion attempted twice.
  const part1 = fill(5 * 1024 * 1024, 11);
  const part2 = fill(1024 * 1024, 23);
  const whole = Buffer.concat([part1, part2]);
  const created = await s3send(new CreateMultipartUploadCommand({
    Bucket: bucket, Key: multiKey, ContentType: "video/mp4",
  }));
  uploadId = created.UploadId;
  await s3send(new UploadPartCommand({
    Bucket: bucket, Key: multiKey, UploadId: uploadId, PartNumber: 1, Body: part1,
  }), 300_000);
  const part2Url = await getSignedUrl(client, new UploadPartCommand({
    Bucket: bucket, Key: multiKey, UploadId: uploadId, PartNumber: 2,
  }), { expiresIn: 600 });
  await interruptPart(part2Url, part2);
  let part2ETag;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const res = await fetch(part2Url, fetchInit({ method: "PUT", body: part2 }));
    part2ETag = res.headers.get("etag") ?? part2ETag;
    if (!res.ok) throw new Error(`presigned part upload attempt ${attempt}: http=${res.status}`);
    await res.arrayBuffer().catch(() => {});
  }
  record("multipart: presigned part retried after interruption", Boolean(part2ETag), "partial request disconnected; full part uploaded twice");

  const listedParts = await s3send(new ListPartsCommand({
    Bucket: bucket, Key: multiKey, UploadId: uploadId,
  }), 300_000);
  const parts = (listedParts.Parts ?? []).map((part) => ({ PartNumber: part.PartNumber, ETag: part.ETag }));
  if (parts.length !== 2 || parts.some((part, index) => part.PartNumber !== index + 1 || !part.ETag)) {
    throw new ProbeAbort("expected two server-listed parts with ETags");
  }
  await s3send(new CompleteMultipartUploadCommand({
    Bucket: bucket, Key: multiKey, UploadId: uploadId, MultipartUpload: { Parts: parts },
  }), 300_000);
  let secondComplete = "succeeded";
  let secondCompleteSafe = true;
  try {
    await s3send(new CompleteMultipartUploadCommand({
      Bucket: bucket, Key: multiKey, UploadId: uploadId, MultipartUpload: { Parts: parts },
    }), 300_000);
  } catch (err) {
    secondComplete = `refused (${codeOf(err)}, http=${statusOf(err) ?? "none"})`;
    secondCompleteSafe = statusOf(err) === 404 && codeOf(err) === "NoSuchUpload";
  }
  uploadId = undefined; // completed or consumed; cleanup re-checks open uploads
  const multiHead = await s3send(new HeadObjectCommand({ Bucket: bucket, Key: multiKey }));
  const multiGet = await s3send(new GetObjectCommand({ Bucket: bucket, Key: multiKey }), 300_000);
  const multiBytes = await bodyBytes(multiGet.Body);
  record("multipart: completing twice is safe", secondCompleteSafe && sha256(multiBytes) === sha256(whole) && multiHead.ContentLength === whole.length,
    `second completion ${secondComplete}; object intact afterwards`);

  // Conditional writes, mirroring ConditionalImageStorage expectations.
  const c1 = await s3send(new PutObjectCommand({
    Bucket: bucket, Key: condKey, Body: Buffer.from("probe-v1"), IfNoneMatch: "*",
  }));
  if (!c1.ETag) throw new ProbeAbort("initial conditional write has no ETag");
  let refused = 0;
  try {
    await s3send(new PutObjectCommand({ Bucket: bucket, Key: condKey, Body: Buffer.from("wrong"), IfNoneMatch: "*" }));
  } catch (err) { if (isRefusal(err)) refused += 1; }
  try {
    await s3send(new PutObjectCommand({ Bucket: bucket, Key: condKey, Body: Buffer.from("wrong"), IfMatch: '"not-the-current-etag"' }));
  } catch (err) { if (isRefusal(err)) refused += 1; }
  const unchanged = await s3send(new GetObjectCommand({ Bucket: bucket, Key: condKey }));
  record("conditional writes: If-None-Match * and wrong If-Match refused", refused === 2
    && (await bodyBytes(unchanged.Body)).equals(Buffer.from("probe-v1")), `refusals=${refused}/2; original bytes checked`);

  const c2 = await s3send(new PutObjectCommand({
    Bucket: bucket, Key: condKey, Body: Buffer.from("probe-v2"), IfMatch: c1.ETag,
  }));
  const updated = await s3send(new GetObjectCommand({ Bucket: bucket, Key: condKey }));
  record("conditional writes: correct If-Match accepted", Boolean(c2.ETag) && c2.ETag !== c1.ETag
    && (await bodyBytes(updated.Body)).equals(Buffer.from("probe-v2")), "etag and updated bytes checked");
  if (!c2.ETag) throw new ProbeAbort("updated conditional write has no ETag");

  // Conditional delete is informational: S3 delete conditions are newer than
  // the write contract the storage code relies on today.
  let condDelete = "not attempted";
  try {
    await s3send(new DeleteObjectCommand({ Bucket: bucket, Key: condKey, IfMatch: '"not-the-current-etag"' }));
    const stillThere = await s3send(new HeadObjectCommand({ Bucket: bucket, Key: condKey })).then(() => true, () => false);
    condDelete = stillThere ? "refused (object intact)" : "ignored (object deleted despite wrong If-Match)";
  } catch (err) {
    condDelete = `refused (${codeOf(err)}, http=${statusOf(err) ?? "none"})`;
  }
  note("conditional delete with wrong If-Match", condDelete);

  // Delete, then a late conditional write must not recreate the object.
  await s3send(new DeleteObjectCommand({ Bucket: bucket, Key: condKey }));
  const unreadable = await s3send(new GetObjectCommand({ Bucket: bucket, Key: condKey }))
    .then(async (result) => { await bodyBytes(result.Body); return false; }, isMissing);
  let lateRefused = false;
  try {
    await s3send(new PutObjectCommand({ Bucket: bucket, Key: condKey, Body: Buffer.from("late"), IfMatch: c2.ETag }));
  } catch (err) { lateRefused = isRefusal(err) || isMissing(err); }
  const gone = await s3send(new GetObjectCommand({ Bucket: bucket, Key: condKey }))
    .then(async (result) => { await bodyBytes(result.Body); return false; }, isMissing);
  record("delete: object unreadable and late conditional write cannot recreate it", unreadable && gone && lateRefused,
    `get-after-delete=${unreadable && gone ? "404" : "not missing"}, late-write-refused=${lateRefused}`);
} catch (err) {
  record("probe completed without unexpected errors", false, errDetail(err));
} finally {
  if (writesStarted) await cleanup().catch((err) => record("cleanup: no probe objects or multipart uploads remain", false, codeOf(err)));
  else record("cleanup: no probe objects or multipart uploads remain", true, "no probe writes attempted");
  client.destroy();
}

const failed = results.filter((r) => !r.ok);
console.log(`RESULT ${failed.length === 0 ? "compatible" : "incompatible"} (${results.length - failed.length}/${results.length} core checks passed)`);
process.exit(failed.length === 0 ? 0 : 1);
