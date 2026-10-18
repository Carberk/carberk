import { describe, expect, it, vi } from "vitest";
import { S3Client, CreateMultipartUploadCommand, ListPartsCommand, CompleteMultipartUploadCommand, UploadPartCommand, AbortMultipartUploadCommand, ListMultipartUploadsCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { S3VideoObjectStorage } from "./S3VideoObjectStorage";
import type { VideoStorageSession } from "../domain/ports/VideoObjectStorage";
const session: VideoStorageSession = { sessionId: "00000000-0000-4000-8000-000000000001", uploadId: "00000000-0000-4000-8000-000000000002", storageUploadId: "owned-storage-id", expectedBytes: 6 * 1024 * 1024, expiresAt: new Date("2026-10-17T01:00:00Z") };
const now = () => new Date("2026-10-17T00:00:00Z");
describe("owned video multipart storage", () => {
  it("recovers a lost initialization response only by its unique owned source key", async () => {
    const client = new S3Client({ region: "us-east-1" });
    vi.spyOn(client, "send").mockImplementation(async (command: unknown) => {
      if (!(command instanceof ListMultipartUploadsCommand) || command.input.Prefix !== `video/v1/${session.uploadId}/${session.sessionId}/source.mp4`) throw new Error("WRONG_STORAGE_SCOPE");
      return { Uploads: [{ Key: `video/v1/${session.uploadId}/${session.sessionId}/source.mp4`, UploadId: "recovered-storage-id" }, { Key: `video/v1/${session.uploadId}/${session.sessionId}/source.mp4-extra`, UploadId: "foreign" }] };
    });
    expect(await new S3VideoObjectStorage(client, "private-video", now).recoverInitialization(session.sessionId, session.uploadId)).toBe("recovered-storage-id");
  });
  it("reconciles lost completion only from exact size and server-created provenance", async () => {
    const client = new S3Client({ region: "us-east-1" }); let foreign = false;
    vi.spyOn(client, "send").mockImplementation(async (command: unknown) => {
      if (!(command instanceof HeadObjectCommand) || command.input.Bucket !== "private-video") throw new Error("WRONG_STORAGE_SCOPE");
      return { ContentLength: session.expectedBytes, Metadata: { "video-session": foreign ? "other" : session.sessionId, "video-upload": session.uploadId } };
    });
    const store = new S3VideoObjectStorage(client, "private-video", now);
    expect(await store.sourceCommitted(session)).toBe(true);
    foreign = true; expect(await store.sourceCommitted(session)).toBe(false);
  });
  it("derives private keys and exact lengths, caps credential expiry at session deadline", async () => {
    const client = new S3Client({ region: "us-east-1" });
    vi.spyOn(client, "send").mockImplementation(async (command: unknown) => {
      if (!(command instanceof CreateMultipartUploadCommand) || command.input.Bucket !== "private-video" || command.input.Key !== `video/v1/${session.uploadId}/${session.sessionId}/source.mp4`) throw new Error("WRONG_STORAGE_SCOPE");
      return { UploadId: "server-issued-storage-id" };
    });
    const signed: { command: unknown; expires: number }[] = [];
    const store = new S3VideoObjectStorage(client, "private-video", now, async (_client, command, options) => { signed.push({ command, expires: options.expiresIn }); return "https://owned-storage/credential"; });
    expect(await store.initialize(session.sessionId, session.uploadId)).toBe("server-issued-storage-id");
    const credential = await store.partCredential({ ...session, expiresAt: new Date("2026-10-17T00:02:00Z") }, 2);
    expect(credential.sizeBytes).toBe(1024 * 1024); expect(signed[0]?.expires).toBe(120);
    expect(signed[0]?.command).toBeInstanceOf(UploadPartCommand);
    expect((signed[0]?.command as UploadPartCommand).input).toMatchObject({ Bucket: "private-video", UploadId: "owned-storage-id", PartNumber: 2, ContentLength: 1024 * 1024 });
    await expect(store.partCredential(session, 3)).rejects.toThrow("VIDEO_PART_INVALID");
    await expect(store.partCredential({ ...session, expiresAt: now() }, 1)).rejects.toThrow("VIDEO_SESSION_UNAVAILABLE");
  });
  it("completes only storage-confirmed consecutive exact parts, never client ETags", async () => {
    const client = new S3Client({ region: "us-east-1" }); let completed: unknown;
    vi.spyOn(client, "send").mockImplementation(async (command: unknown) => {
      if (command instanceof ListPartsCommand) return { Parts: [{ PartNumber: 1, Size: 5 * 1024 * 1024, ETag: "opaque-1" }, { PartNumber: 2, Size: 1024 * 1024, ETag: "opaque-2" }] };
      if (command instanceof CompleteMultipartUploadCommand) { completed = command.input.MultipartUpload; return {}; }
      throw new Error("UNEXPECTED_COMMAND");
    });
    const store = new S3VideoObjectStorage(client, "private-video", now);
    await store.complete(session);
    expect(completed).toEqual({ Parts: [{ PartNumber: 1, ETag: "opaque-1" }, { PartNumber: 2, ETag: "opaque-2" }] });
  });
  it("refuses malformed storage parts and never completes a truncated upload", async () => {
    const client = new S3Client({ region: "us-east-1" });
    vi.spyOn(client, "send").mockImplementation(async () => ({ Parts: [{ PartNumber: 1, Size: 123, ETag: "wrong-size" }] }));
    await expect(new S3VideoObjectStorage(client, "private-video", now).complete(session)).rejects.toThrow("VIDEO_PARTS_INVALID");
  });
  it("reconciles paginated storage parts without assuming ETags are hashes", async () => {
    const client = new S3Client({ region: "us-east-1" });
    vi.spyOn(client, "send").mockImplementation(async (command: unknown) => {
      if (!(command instanceof ListPartsCommand)) throw new Error("UNEXPECTED_COMMAND");
      return command.input.PartNumberMarker === "1"
        ? { Parts: [{ PartNumber: 2, Size: 1024 * 1024, ETag: "not-a-hash" }] }
        : { IsTruncated: true, NextPartNumberMarker: "1", Parts: [{ PartNumber: 1, Size: 5 * 1024 * 1024, ETag: "opaque" }] };
    });
    expect(await new S3VideoObjectStorage(client, "private-video", now).listParts(session)).toEqual([{ partNumber: 1, sizeBytes: 5 * 1024 * 1024, etag: "opaque" }, { partNumber: 2, sizeBytes: 1024 * 1024, etag: "not-a-hash" }]);
  });
  it("allows abort after expiry but does not claim object deletion", async () => {
    const client = new S3Client({ region: "us-east-1" });
    vi.spyOn(client, "send").mockImplementation(async (command: unknown) => { if (!(command instanceof AbortMultipartUploadCommand) || command.input.UploadId !== session.storageUploadId) throw new Error("WRONG_ABORT_SCOPE"); return {}; });
    expect(await new S3VideoObjectStorage(client, "private-video", now).abort({ ...session, expiresAt: now() })).toBeUndefined();
    await expect(new S3VideoObjectStorage(client, "private-video", now).initialize("../other", session.uploadId)).rejects.toThrow("VIDEO_SESSION_UNAVAILABLE");
  });
});
