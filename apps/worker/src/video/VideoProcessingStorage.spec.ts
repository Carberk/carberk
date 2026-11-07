import { Readable } from "node:stream";

import type { S3Client } from "@aws-sdk/client-s3";
import { afterEach, describe, expect, it, vi } from "vitest";

import { S3VideoProcessingStorage } from "./VideoProcessingStorage";

afterEach(() => vi.useRealTimers());

describe("S3VideoProcessingStorage", () => {
  it("stops a stalled response body at the request deadline", async () => {
    vi.useFakeTimers();
    const body = new Readable({ read() {} });
    body.push(Buffer.from("partial"));
    const s3 = { send: async () => ({ Body: body }) } as unknown as S3Client;
    const result = new S3VideoProcessingStorage(s3, "videos").get("source.mp4");
    const rejected = expect(result).rejects.toThrow(/timed out/i);
    await vi.advanceTimersByTimeAsync(30_000);
    await rejected;
    expect(body.destroyed).toBe(true);
  });

  it("rejects an oversized stream before retaining its bytes", async () => {
    const body = Readable.from([Buffer.alloc(15 * 1024 * 1024), Buffer.from("overflow")]);
    const s3 = { send: async () => ({ Body: body }) } as unknown as S3Client;
    await expect(new S3VideoProcessingStorage(s3, "videos").get("source.mp4")).rejects.toThrow("maximum body size");
    expect(body.destroyed).toBe(true);
  });
});
