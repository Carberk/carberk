import { createRequire } from "node:module";
const require = createRequire(process.cwd() + "/apps/api/package.json");
const { S3Client, ListObjectsV2Command } = require("@aws-sdk/client-s3");
const endpoint = process.env.MINIO_ENDPOINT;
const accessKeyId = process.env.MINIO_ACCESS_KEY;
const secretAccessKey = process.env.MINIO_SECRET_KEY;
const bucket = process.env.DIAGNOSTIC_PRIVATE_BUCKET;
if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) throw new Error("MINIO_ENDPOINT, MINIO_ACCESS_KEY, MINIO_SECRET_KEY and DIAGNOSTIC_PRIVATE_BUCKET are required");
const client = new S3Client({ endpoint, region: process.env.MINIO_REGION ?? "us-east-1", forcePathStyle: true, credentials: { accessKeyId, secretAccessKey } });
try {
  let objects;
  try { objects = await client.send(new ListObjectsV2Command({ Bucket: bucket })); }
  catch (error) {
    if (process.env.ALLOW_MISSING_BUCKET === "1" && error?.name === "NoSuchBucket") { process.stdout.write(JSON.stringify({ bucket, absent: true, empty: true }) + "\n"); objects = { Contents: [], IsTruncated: false }; }
    else throw error;
  }
  const keys = (objects.Contents ?? []).map(object => object.Key).filter(Boolean);
  if (objects.IsTruncated || keys.length) throw new Error(JSON.stringify({ bucket, truncated: objects.IsTruncated ?? false, keys }));
  process.stdout.write(JSON.stringify({ bucket, truncated: false, keys, empty: true }) + "\n");
} finally {
  client.destroy();
}
