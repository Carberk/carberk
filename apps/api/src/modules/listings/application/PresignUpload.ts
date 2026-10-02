import { Inject, Injectable, BadRequestException } from "@nestjs/common";
import { randomUUID } from "node:crypto";

import { UPLOAD_CAPS } from "../domain/MediaUpload";
import {
  MEDIA_STORAGE_PORT,
  type MediaStoragePort,
} from "../domain/ports/MediaStoragePort";
import {
  MEDIA_UPLOAD_REPOSITORY,
  type MediaUploadRepository,
} from "../domain/ports/MediaUploadRepository";

export interface PresignUploadInput {
  userId: string;
  kind: "image" | "video";
  contentType: string;
  sizeBytes: number;
}

export interface PresignUploadResult {
  uploadUrl: string;
  key: string;
  expiresIn: number;
  maxSizeBytes: number;
}

@Injectable()
export class PresignUpload {
  constructor(
    @Inject(MEDIA_STORAGE_PORT)
    private readonly storage: MediaStoragePort,
    @Inject(MEDIA_UPLOAD_REPOSITORY)
    private readonly uploads: MediaUploadRepository,
  ) {}

  async execute(input: PresignUploadInput): Promise<PresignUploadResult> {
    const cap = UPLOAD_CAPS[input.kind];
    if (!cap) {
      throw new BadRequestException("Invalid kind");
    }

    if (!cap.allowedTypes.includes(input.contentType)) {
      throw new BadRequestException(
        `Invalid content type for ${input.kind}. Allowed: ${cap.allowedTypes.join(", ")}`,
      );
    }

    if (input.sizeBytes > cap.maxSizeBytes) {
      throw new BadRequestException(
        `File too large. Max ${cap.maxSizeBytes} bytes for ${input.kind}`,
      );
    }

    const ext =
      input.contentType === "image/webp"
        ? "webp"
        : input.contentType === "video/mp4"
          ? "mp4"
          : "jpg";

    const key = `pending/${randomUUID()}/original.${ext}`;

    const { url } = await this.storage.presignUpload({
      key,
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
      expirySeconds: 600,
    });

    // The caller owns this key from the moment the URL exists. Only a recorded
    // upload can later be attached or published (ADR-0077).
    await this.uploads.record({
      id: randomUUID(),
      userId: input.userId,
      key,
      kind: input.kind,
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
      createdAt: new Date(),
    });

    return {
      uploadUrl: url,
      key,
      expiresIn: 600,
      maxSizeBytes: cap.maxSizeBytes,
    };
  }
}
