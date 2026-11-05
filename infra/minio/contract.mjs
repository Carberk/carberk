import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

import {
  CreateBucketCommand,
  DeleteBucketPolicyCommand,
  GetBucketPolicyCommand,
  GetObjectCommand,
  HeadBucketCommand,
  ListObjectsV2Command,
  PutBucketPolicyCommand,
  PutBucketLifecycleConfigurationCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

export const MEDIA_BUCKETS = [
  "listing-photos",
  "listing-videos",
  "chat-attachments",
  "catalog-assets",
];

export function publicReadPolicy(bucket) {
  return {
    Version: "2012-10-17",
    Statement: [
      {
        Sid: "AllowAnonymousReadOnlyObjectAccess",
        Effect: "Allow",
        Principal: { AWS: ["*"] },
        Action: ["s3:GetObject"],
        Resource: [publicReadResource(bucket)],
      },
    ],
  };
}

function publicReadResource(bucket) {
  return `arn:aws:s3:::${bucket}/${bucket === "catalog-assets" ? "brands/" : ""}*`;
}

export function assertPublicReadOnlyPolicy(policy, bucket) {
  const parsed = typeof policy === "string" ? JSON.parse(policy) : policy;
  const statements = Array.isArray(parsed.Statement)
    ? parsed.Statement
    : [parsed.Statement].filter(Boolean);
  let grantsRead = false;
  for (const statement of statements) {
    if (statement?.Effect !== "Allow") continue;
    const isAnonymous = statement.Principal === "*" ||
      statement.Principal?.AWS === "*" || statement.Principal?.AWS?.includes?.("*");
    if (!isAnonymous) continue;
    const actions = Array.isArray(statement.Action) ? statement.Action : [statement.Action];
    const resources = Array.isArray(statement.Resource) ? statement.Resource : [statement.Resource];
    // Backup/restore accept only the repository-owned anonymous grant. Checking
    // every anonymous statement also catches broad grants and narrower writes.
    if (!actions.length || actions.some((action) => action !== "s3:GetObject") ||
        !resources.length || resources.some((resource) => resource !== publicReadResource(bucket))) {
      throw new Error(`Bucket ${bucket} policy must grant anonymous s3:GetObject only on ${publicReadResource(bucket)}`);
    }
    grantsRead = true;
  }
  if (!grantsRead) {
    throw new Error(`Bucket ${bucket} policy must grant anonymous s3:GetObject only on ${publicReadResource(bucket)}`);
  }
}

export function catalogPendingLifecycle() {
  return { Rules: [{
    ID: "ExpirePendingBrandLogos",
    Status: "Enabled",
    Filter: { Prefix: "pending/" },
    Expiration: { Days: 1 },
  }] };
}

export function createMinioClientFromEnv(env = process.env) {
  const endpoint = required(env.MINIO_ENDPOINT, "MINIO_ENDPOINT");
  const accessKeyId = required(env.MINIO_ACCESS_KEY, "MINIO_ACCESS_KEY");
  const secretAccessKey = required(env.MINIO_SECRET_KEY, "MINIO_SECRET_KEY");
  const region = env.MINIO_REGION || "us-east-1";

  return new S3Client({
    endpoint,
    region,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: true,
  });
}

export async function bootstrapBuckets(client, buckets = MEDIA_BUCKETS) {
  const results = [];

  for (const bucket of buckets) {
    let created = false;
    try {
      await client.send(new HeadBucketCommand({ Bucket: bucket }));
    } catch {
      await client.send(new CreateBucketCommand({ Bucket: bucket }));
      created = true;
    }

    if (bucket === "listing-videos") {
      // Reconcile existing public buckets too; retaining bytes grants no serving access.
      await client.send(new DeleteBucketPolicyCommand({ Bucket: bucket }));
    } else {
      const policy = publicReadPolicy(bucket);
      await client.send(new PutBucketPolicyCommand({ Bucket: bucket, Policy: JSON.stringify(policy) }));
      assertPublicReadOnlyPolicy(policy, bucket);
    }
    if (bucket === "catalog-assets") {
      await client.send(new PutBucketLifecycleConfigurationCommand({
        Bucket: bucket,
        LifecycleConfiguration: catalogPendingLifecycle(),
      }));
    }
    results.push({ bucket, created });
  }

  return results;
}

export async function backupBuckets(client, outputDir, buckets = MEDIA_BUCKETS) {
  const manifest = {
    format: "autotm-minio-backup-v1",
    createdAt: new Date().toISOString(),
    buckets: [],
  };

  await mkdir(join(outputDir, "objects"), { recursive: true });
  await mkdir(join(outputDir, "policies"), { recursive: true });

  for (const bucket of buckets) {
    let policy = JSON.stringify(bucket === "listing-videos" ? null : publicReadPolicy(bucket), null, 2);
    try {
      const response = await client.send(new GetBucketPolicyCommand({ Bucket: bucket }));
      if (response.Policy) {
        if (bucket === "listing-videos") {
          throw new Error("Bucket listing-videos must have no bucket policy during the video hold; re-bootstrap before backup");
        }
        assertPublicReadOnlyPolicy(response.Policy, bucket);
        policy = JSON.stringify(JSON.parse(response.Policy), null, 2);
      }
    } catch (error) {
      if (error?.name !== "NoSuchBucketPolicy") throw error;
    }

    await writeFile(join(outputDir, "policies", `${bucket}.json`), `${policy}\n`);

    const objects = [];
    for await (const object of listBucketObjects(client, bucket)) {
      const key = object.Key;
      if (!key) continue;

      const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      const destination = join(outputDir, "objects", bucket, key);
      await mkdir(dirname(destination), { recursive: true });
      const sha256 = await writeBodyWithSha256(response.Body, destination);
      objects.push({ key, size: object.Size ?? null, sha256 });
    }

    objects.sort((a, b) => a.key.localeCompare(b.key));
    manifest.buckets.push({ name: bucket, policyFile: `policies/${bucket}.json`, objects });
  }

  manifest.buckets.sort((a, b) => a.name.localeCompare(b.name));
  await writeFile(join(outputDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

export async function restoreBuckets(client, backupDir) {
  const manifest = JSON.parse(await readFile(join(backupDir, "manifest.json"), "utf8"));
  if (manifest.format !== "autotm-minio-backup-v1") {
    throw new Error(`Unsupported MinIO backup format: ${manifest.format ?? "<missing>"}`);
  }

  const results = [];
  for (const bucket of manifest.buckets) {
    await bootstrapBuckets(client, [bucket.name]);

    const policy = await readFile(join(backupDir, bucket.policyFile), "utf8");
    // Historical video backups contain an anonymous grant. Restore their bytes
    // under today's private contract, never the captured public policy.
    if (bucket.name !== "listing-videos") {
      assertPublicReadOnlyPolicy(policy, bucket.name);
      await client.send(new PutBucketPolicyCommand({ Bucket: bucket.name, Policy: policy }));
    }

    for (const object of bucket.objects) {
      const source = join(backupDir, "objects", bucket.name, object.key);
      const sha256 = await fileSha256(source);
      if (sha256 !== object.sha256) {
        throw new Error(
          `Checksum mismatch before restore for ${bucket.name}/${object.key}: expected ${object.sha256}, got ${sha256}`,
        );
      }

      await client.send(
        new PutObjectCommand({
          Bucket: bucket.name,
          Key: object.key,
          Body: createReadStream(source),
        }),
      );

      const restored = await client.send(
        new GetObjectCommand({ Bucket: bucket.name, Key: object.key }),
      );
      const restoredSha256 = await bodySha256(restored.Body);
      if (restoredSha256 !== object.sha256) {
        throw new Error(
          `Checksum mismatch after restore for ${bucket.name}/${object.key}: expected ${object.sha256}, got ${restoredSha256}`,
        );
      }
    }

    results.push({ bucket: bucket.name, objects: bucket.objects.length });
  }

  return results;
}

export async function listLocalBackupObjects(backupDir) {
  const root = join(backupDir, "objects");
  try {
    await stat(root);
  } catch {
    return [];
  }
  return walkFiles(root);
}

async function* listBucketObjects(client, bucket) {
  let ContinuationToken;
  do {
    const response = await client.send(
      new ListObjectsV2Command({ Bucket: bucket, ContinuationToken }),
    );
    for (const object of response.Contents ?? []) {
      yield object;
    }
    ContinuationToken = response.NextContinuationToken;
  } while (ContinuationToken);
}

async function writeBodyWithSha256(body, destination) {
  const hash = createHash("sha256");
  const source = await bodyToReadable(body);
  source.on("data", (chunk) => hash.update(chunk));
  await pipeline(source, createWriteStream(destination));
  return hash.digest("hex");
}

async function bodySha256(body) {
  const hash = createHash("sha256");
  const source = await bodyToReadable(body);
  for await (const chunk of source) {
    hash.update(chunk);
  }
  return hash.digest("hex");
}

async function fileSha256(path) {
  const hash = createHash("sha256");
  const source = createReadStream(path);
  for await (const chunk of source) {
    hash.update(chunk);
  }
  return hash.digest("hex");
}

async function bodyToReadable(body) {
  if (body instanceof Readable) return body;
  if (body?.transformToByteArray) {
    return Readable.from(await body.transformToByteArray());
  }
  if (body?.[Symbol.asyncIterator]) return Readable.from(body);
  throw new Error("S3 response body is not readable");
}

async function walkFiles(root) {
  const found = [];
  const entries = await readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      found.push(...(await walkFiles(path)));
    } else {
      found.push(relative(root, path));
    }
  }
  return found.sort();
}

function required(value, name) {
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}
