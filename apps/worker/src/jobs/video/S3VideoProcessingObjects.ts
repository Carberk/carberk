import { createReadStream, createWriteStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

import { GetObjectCommand, PutObjectCommand, type S3Client } from "@aws-sdk/client-s3";

import type { VideoProcessingLease, VideoProcessingObjects, VideoPublishedAsset } from "./VideoProcessingPorts";

const uuid = "[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const sourcePattern = new RegExp(`^video/v1/${uuid}/${uuid}/source\\.mp4$`);
const outputPattern = new RegExp(`^video/v1/${uuid}/${uuid}/(?:[0-9]+/)?[A-Za-z0-9_-]+\\.(?:m3u8|ts|jpg)$`);

/** Separate explicit private bucket. Never uses the photo bucket resolver. */
export class S3VideoProcessingObjects implements VideoProcessingObjects {
  constructor(private readonly client: S3Client, private readonly bucket: string, private readonly scratchRoot = tmpdir()) {
    if (!bucket) throw new Error("VIDEO_PRIVATE_BUCKET_REQUIRED");
  }
  async download(_lease: VideoProcessingLease): Promise<{path:string;dispose():Promise<void>}> { throw new Error("VIDEO_STORAGE_INACTIVE"); }
  async publish(_directory:string, _asset:VideoPublishedAsset): Promise<void> { throw new Error("VIDEO_STORAGE_INACTIVE"); }
  async verify(asset: VideoPublishedAsset): Promise<boolean> {
    this.validate(asset);
    const result = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: asset.key }), { abortSignal: AbortSignal.timeout(60_000) });
    const body = result.Body;
    if (!(body instanceof Readable)) return false;
    try {
      if (result.ContentLength !== asset.sizeBytes || result.ContentType !== asset.contentType) return false;
      let size = 0; const hash = createHash("sha256");
      const bounded = new Transform({ transform(bytes: Buffer, _encoding, done) {
        size += bytes.length;
        if (size > asset.sizeBytes) done(new Error("VIDEO_OUTPUT_LIMIT"));
        else { hash.update(bytes); done(); }
      } });
      await pipeline(body, bounded, { signal: AbortSignal.timeout(60_000) });
      return size === asset.sizeBytes && hash.digest("hex") === asset.sha256;
    } finally { body.destroy(); }
  }
  private validate(asset: VideoPublishedAsset) {
    if (!outputPattern.test(asset.key) || asset.path === "source.mp4" || !asset.key.endsWith(`/${asset.path}`) || !/^(?:[0-9]+\/)?[A-Za-z0-9_-]+\.(?:m3u8|ts|jpg)$/.test(asset.path) || !/^[a-f0-9]{64}$/.test(asset.sha256) || !Number.isInteger(asset.sizeBytes) || asset.sizeBytes < 1 || asset.sizeBytes > 100 * 1024 * 1024) throw new Error("VIDEO_OUTPUT_INVALID");
  }
}
