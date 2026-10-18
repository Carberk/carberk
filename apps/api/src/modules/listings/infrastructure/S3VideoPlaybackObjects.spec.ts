import { Readable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { S3VideoPlaybackObjects } from "./S3VideoPlaybackObjects";
import type { VideoPlaybackAsset } from "../application/VideoPlaybackPorts";
const asset: VideoPlaybackAsset = { path: "240/seg.ts", key: "video/v1/00000000-0000-4000-8000-000000000001/00000000-0000-4000-8000-000000000002/240/seg.ts", purpose: "playback", contentType: "video/mp2t", sizeBytes: 8 };
describe("private S3 video streaming", () => {
  it("streams exact ranges from the explicit private bucket", async () => {
    const client = new S3Client({ region: "us-east-1" });
    vi.spyOn(client, "send").mockImplementation(async (command: unknown) => {
      if (!(command instanceof GetObjectCommand) || command.input.Bucket !== "private-video" || command.input.Key !== asset.key || command.input.Range !== "bytes=2-4") throw new Error("WRONG_OBJECT_SCOPE");
      return { Body: Readable.from([Buffer.from("345")]), ContentLength: 3, ContentRange: "bytes 2-4/8" };
    });
    const stream = await new S3VideoPlaybackObjects(client, "private-video").open(asset, { start: 2, end: 4 }, new AbortController().signal);
    const chunks: Buffer[] = []; for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    expect(Buffer.concat(chunks).toString()).toBe("345");
  });
  it("rejects raw source reads and storage range mismatches", async () => {
    const client = new S3Client({ region: "us-east-1" });
    vi.spyOn(client, "send").mockImplementation(async () => ({ Body: Readable.from([Buffer.from("12345678")]), ContentLength: 8 }));
    const objects = new S3VideoPlaybackObjects(client, "private-video");
    await expect(objects.open({ ...asset, key: asset.key.replace("240/seg.ts", "source.mp4") }, undefined, new AbortController().signal)).rejects.toThrow("VIDEO_ASSET_DENIED");
    await expect(objects.open(asset, { start: 2, end: 4 }, new AbortController().signal)).rejects.toThrow("VIDEO_ASSET_UNAVAILABLE");
  });
});
