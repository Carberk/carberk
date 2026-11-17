import { randomUUID } from "node:crypto";

import { Inject, Injectable, NotFoundException } from "@nestjs/common";

import { checkBrandLogoFile, pendingBrandLogoKey } from "../domain/BrandLogo";
import {
  BRAND_LOGO_REPOSITORY,
  type BrandLogoRepository,
} from "../domain/ports/BrandLogoRepository";
import { BRAND_LOGO_STORAGE, type BrandLogoStorage } from "../domain/ports/BrandLogoStorage";
import { rejectBrandLogo } from "./brandLogoRejection";

const UPLOAD_EXPIRY_SECONDS = 600;

export interface PresignBrandLogoUploadResult {
  uploadUrl: string;
  key: string;
  expiresIn: number;
  headers: Record<string, string>;
}


@Injectable()
export class PresignBrandLogoUpload {
  constructor(
    @Inject(BRAND_LOGO_REPOSITORY) private readonly brands: BrandLogoRepository,
    @Inject(BRAND_LOGO_STORAGE) private readonly storage: BrandLogoStorage,
  ) {}

  async execute(input: {
    brandId: string;
    contentType: string;
    sizeBytes: number;
  }): Promise<PresignBrandLogoUploadResult> {
    const brand = await this.brands.getBrandById(input.brandId);
    if (!brand) {
      throw new NotFoundException("Brand not found");
    }

    const rejection = checkBrandLogoFile(input.contentType, input.sizeBytes);
    if (rejection) rejectBrandLogo(rejection);

    const key = pendingBrandLogoKey(brand.slug, randomUUID());
    const { url, headers } = await this.storage.presignUpload(
      key,
      input.contentType,
      UPLOAD_EXPIRY_SECONDS,
      input.sizeBytes,
    );
    return { uploadUrl: url, key, expiresIn: UPLOAD_EXPIRY_SECONDS, headers };
  }
}
