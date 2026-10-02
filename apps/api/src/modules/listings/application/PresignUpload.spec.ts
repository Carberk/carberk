import { describe, it, expect, beforeEach } from "vitest";
import { BadRequestException } from "@nestjs/common";
import { PresignUpload } from "./PresignUpload";
import type { MediaStoragePort } from "../domain/ports/MediaStoragePort";
import type { MediaUploadRepository } from "../domain/ports/MediaUploadRepository";
import type { NewMediaUpload } from "../domain/MediaUpload";

class FakeMediaUploadRepository implements MediaUploadRepository {
  recorded: NewMediaUpload[] = [];

  async record(upload: NewMediaUpload): Promise<void> {
    this.recorded.push(upload);
  }

  async findByKeys(): Promise<[]> {
    return [];
  }
}

class FakeMediaStorage implements MediaStoragePort {
  lastCall?: { key: string; contentType: string; sizeBytes: number; expirySeconds?: number };

  async presignUpload(data: {
    key: string;
    contentType: string;
    sizeBytes: number;
    expirySeconds?: number;
  }): Promise<{ url: string; key: string }> {
    this.lastCall = data;
    return { url: `https://media.auto.tm/presigned/${data.key}`, key: data.key };
  }

  resolvePublicUrl(_key: string): string {
    return `https://media.auto.tm/${_key}`;
  }

  async deleteObject(_key: string): Promise<void> {}
}

function makeUseCase(storage?: FakeMediaStorage, uploads?: FakeMediaUploadRepository) {
  return new PresignUpload(
    storage ?? new FakeMediaStorage(),
    uploads ?? new FakeMediaUploadRepository(),
  );
}

describe("PresignUpload", () => {
  let storage: FakeMediaStorage;

  beforeEach(() => {
    storage = new FakeMediaStorage();
  });

  it("returns presigned URL for a valid image request", async () => {
    const uc = makeUseCase(storage);
    const result = await uc.execute({
      userId: "user-1",
      kind: "image",
      contentType: "image/jpeg",
      sizeBytes: 1024,
    });

    expect(result.uploadUrl).toContain("presigned");
    expect(result.key).toContain("pending/");
    expect(result.key).toMatch(/original\.jpg$/);
    expect(result.expiresIn).toBe(600);
    expect(result.maxSizeBytes).toBe(5 * 1024 * 1024);
  });

  it("returns presigned URL for a valid video request", async () => {
    const uc = makeUseCase(storage);
    const result = await uc.execute({
      userId: "user-1",
      kind: "video",
      contentType: "video/mp4",
      sizeBytes: 1024,
    });

    expect(result.key).toMatch(/original\.mp4$/);
    expect(result.maxSizeBytes).toBe(10 * 1024 * 1024);
  });

  it("returns webp extension for image/webp", async () => {
    const uc = makeUseCase(storage);
    const result = await uc.execute({
      userId: "user-1",
      kind: "image",
      contentType: "image/webp",
      sizeBytes: 1024,
    });

    expect(result.key).toMatch(/original\.webp$/);
  });

  it("rejects unsupported content type", async () => {
    const uc = makeUseCase(storage);
    await expect(
      uc.execute({ userId: "user-1", kind: "image", contentType: "image/png", sizeBytes: 1024 }),
    ).rejects.toThrow(BadRequestException);
  });

  it("rejects oversized image", async () => {
    const uc = makeUseCase(storage);
    await expect(
      uc.execute({
        userId: "user-1",
        kind: "image",
        contentType: "image/jpeg",
        sizeBytes: 6 * 1024 * 1024,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it("rejects oversized video", async () => {
    const uc = makeUseCase(storage);
    await expect(
      uc.execute({
        userId: "user-1",
        kind: "video",
        contentType: "video/mp4",
        sizeBytes: 11 * 1024 * 1024,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it("passes correct parameters to storage port", async () => {
    const uc = makeUseCase(storage);
    await uc.execute({
      userId: "user-1",
      kind: "image",
      contentType: "image/jpeg",
      sizeBytes: 2048,
    });

    expect(storage.lastCall).toBeDefined();
    expect(storage.lastCall!.contentType).toBe("image/jpeg");
    expect(storage.lastCall!.sizeBytes).toBe(2048);
    expect(storage.lastCall!.expirySeconds).toBe(600);
  });

  it("records the upload for the calling User with the presigned key", async () => {
    const uploads = new FakeMediaUploadRepository();
    const uc = makeUseCase(storage, uploads);
    const result = await uc.execute({
      userId: "user-7",
      kind: "image",
      contentType: "image/webp",
      sizeBytes: 4096,
    });

    expect(uploads.recorded).toHaveLength(1);
    expect(uploads.recorded[0]).toMatchObject({
      userId: "user-7",
      key: result.key,
      kind: "image",
      contentType: "image/webp",
      sizeBytes: 4096,
    });
  });

  it("records nothing when the request is rejected", async () => {
    const uploads = new FakeMediaUploadRepository();
    const uc = makeUseCase(storage, uploads);
    await expect(
      uc.execute({ userId: "user-1", kind: "image", contentType: "image/png", sizeBytes: 1024 }),
    ).rejects.toThrow(BadRequestException);

    expect(uploads.recorded).toEqual([]);
  });
});
