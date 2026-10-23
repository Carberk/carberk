import { Readable } from "node:stream";
import { GetObjectCommand, type S3Client } from "@aws-sdk/client-s3";
import type { VideoPlaybackObjects, VideoPlaybackAsset } from "../application/VideoPlaybackPorts";

/** Only receives an exact-manifest asset after current request authorization.
 * Bucket policy and endpoint have no public/CDN fallback. Never buffers video. */
export class S3VideoPlaybackObjects implements VideoPlaybackObjects {
  constructor(private readonly client: S3Client, private readonly bucket: string) {}
  onModuleDestroy(): void { this.client.destroy(); }

  async open(asset: VideoPlaybackAsset, range: { start: number; end: number } | undefined, signal: AbortSignal): Promise<Readable> {
    if (!/^video\/v1\/[a-f0-9-]{36}\/[a-f0-9-]{36}\/[A-Za-z0-9_./-]+$/.test(asset.key) || asset.key.split("/").some((part) => part === "." || part === "..") || asset.key.endsWith("/source.mp4")) throw new Error("VIDEO_ASSET_DENIED");
    const response = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: asset.key, ...(range ? { Range: `bytes=${range.start}-${range.end}` } : {}) }), { abortSignal: signal });
    const expected = range ? range.end - range.start + 1 : asset.sizeBytes;
    if (!(response.Body instanceof Readable) || response.ContentLength !== expected || (range && response.ContentRange !== `bytes ${range.start}-${range.end}/${asset.sizeBytes}`)) {
      if (response.Body instanceof Readable) response.Body.destroy();
      throw new Error("VIDEO_ASSET_UNAVAILABLE");
    }
    return response.Body;
  }
}
