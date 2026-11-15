import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import type { UploadsSchemas } from "@auto-tm/contracts";

import { UPLOAD_CAPS } from "../domain/MediaUpload";
import { imageUploadObjectKeys } from "../domain/imageUploadObjectKeys";
import { MEDIA_STORAGE_PORT, type MediaStoragePort } from "../domain/ports/MediaStoragePort";
import { MEDIA_UPLOAD_REPOSITORY, type MediaUploadRepository } from "../domain/ports/MediaUploadRepository";
import type { PresignUploadResult } from "./PresignUpload";

const unavailable = () => new BadRequestException({ code: "UPLOAD_NOT_AVAILABLE", message: "Upload is no longer available" });

/** Renews only the recorded, still-empty issuance. It never adopts or recreates objects. */
@Injectable()
export class RenewPhotoUpload {
  constructor(
    @Inject(MEDIA_STORAGE_PORT) private readonly storage: MediaStoragePort,
    @Inject(MEDIA_UPLOAD_REPOSITORY) private readonly uploads: MediaUploadRepository,
  ) {}

  async execute(input: UploadsSchemas.RenewPhotoUploadRequest & { userId: string }): Promise<PresignUploadResult> {
    const family = imageUploadObjectKeys(input.key);
    const available = async () => {
      const [upload] = await this.uploads.findByKeys([input.key]);
      if (!upload || upload.userId !== input.userId || upload.state !== "AVAILABLE" || upload.adopted ||
        upload.kind !== "image" || upload.writeProtocol !== "conditional-v1" ||
        upload.contentType !== input.contentType || upload.sizeBytes !== input.sizeBytes ||
        upload.objectKeys?.length !== 5 || !family.every(key => upload.objectKeys?.includes(key))) throw unavailable();
      return upload;
    };
    const issued = await available();
    const signed = await this.storage.presignUpload({ key: issued.key, contentType: issued.contentType,
      sizeBytes: input.sizeBytes, expirySeconds: 600, writeProtocol: "conditional-v1", renew: true });
    // Storage I/O can overlap a claim/retirement. Recheck before releasing authority.
    if ((await available()).id !== issued.id || !signed.headers?.["if-match"] ||
      signed.objectKeys?.length !== 5 || !family.every(key => signed.objectKeys?.includes(key))) throw unavailable();
    return { uploadUrl: signed.url, key: issued.key, expiresIn: 600,
      maxSizeBytes: UPLOAD_CAPS.image.maxSizeBytes, headers: signed.headers };
  }
}
