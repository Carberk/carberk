import { randomUUID } from "node:crypto";

import { Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";

import {
  BRAND_LOGO_MAX_BYTES,
  BRAND_LOGO_RASTER_SIZE,
  brandLogoKey,
  checkBrandLogoFile,
  checkBrandLogoImage,
  checkBrandLogoSvgSafety,
  isPendingBrandLogoKey,
  newAdminLogoVersion,
  storedBrandLogoType,
  type BrandLogoContentType,
} from "../domain/BrandLogo";
import {
  BRAND_LOGO_REPOSITORY,
  type BrandLogoRepository,
  type LogoKeyReplacement,
} from "../domain/ports/BrandLogoRepository";
import { BRAND_LOGO_STORAGE, type BrandLogoStorage } from "../domain/ports/BrandLogoStorage";
import {
  LOGO_IMAGE_PROCESSOR,
  type LogoImageProcessor,
} from "../domain/ports/LogoImageProcessor";
import { rejectBrandLogo } from "./brandLogoRejection";

import { CATALOG_AUDIT_LOG, type CatalogAuditLog } from "./ports/CatalogAuditLog";
export interface SetBrandLogoInput {
  brandId: string;
  key: string;
}

export interface SetBrandLogoResult {
  id: string;
  logoUrl: string;
}

@Injectable()
export class SetBrandLogo {
  private readonly logger = new Logger(SetBrandLogo.name);

  constructor(
    @Inject(BRAND_LOGO_REPOSITORY) private readonly brands: BrandLogoRepository,
    @Inject(BRAND_LOGO_STORAGE) private readonly storage: BrandLogoStorage,
    @Inject(LOGO_IMAGE_PROCESSOR) private readonly images: LogoImageProcessor,
    @Inject(CATALOG_AUDIT_LOG) private readonly audit: CatalogAuditLog,
  ) {}

  async execute(input: SetBrandLogoInput, actorUserId: string): Promise<SetBrandLogoResult> {
    const brand = await this.brands.getBrandById(input.brandId);
    if (!brand) {
      throw new NotFoundException("Brand not found");
    }
    if (!isPendingBrandLogoKey(brand.slug, input.key)) {
      rejectBrandLogo("LOGO_UPLOAD_MISSING");
    }

    let stored: { bytes: Uint8Array; contentType: "image/png" | "image/webp" };
    try {
      stored = await this.readAndPrepare(input.key);
    } finally {
      await this.deleteQuietly(input.key);
    }

    const key = brandLogoKey(
      brand.slug,
      newAdminLogoVersion(Date.now(), randomUUID()),
      stored.contentType,
    );

    await this.storage.put(key, stored.bytes, stored.contentType);
    let replacement: LogoKeyReplacement;
    try {
      replacement = await this.brands.replaceLogoKey(brand.id, key);
    } catch (err) {
      this.logger.warn({ key, err }, "Brand logo swap outcome unknown; keeping the uploaded object");
      throw err;
    }
    if (!replacement.replaced) {
      await this.deleteQuietly(key);
      throw new NotFoundException("Brand not found");
    }

    const previousKey = replacement.previousKey;
    if (previousKey && previousKey !== key) {
      await this.deleteVersionQuietly(previousKey);
    }

    await this.audit.record({
      actorId: actorUserId,
      action: "CATALOG_BRAND_LOGO_SET",
      targetType: "Brand",
      targetId: brand.id,
      details: { slug: brand.slug, logoKey: key, previousLogoKey: previousKey },
    });

    return { id: brand.id, logoUrl: this.storage.publicUrl(key) };
  }

  private async readAndPrepare(
    pendingKey: string,
  ): Promise<{ bytes: Uint8Array; contentType: "image/png" | "image/webp" }> {
    const upload = await this.storage.get(pendingKey, BRAND_LOGO_MAX_BYTES);
    if (upload === "too-large") rejectBrandLogo("LOGO_TOO_LARGE");
    if (!upload) rejectBrandLogo("LOGO_UPLOAD_MISSING");

    const fileRejection = checkBrandLogoFile(upload.contentType, upload.bytes.byteLength);
    if (fileRejection) rejectBrandLogo(fileRejection);
    const contentType = upload.contentType as BrandLogoContentType;

    if (contentType === "image/svg+xml") {
      const svgRejection = checkBrandLogoSvgSafety(new TextDecoder().decode(upload.bytes));
      if (svgRejection) rejectBrandLogo(svgRejection);
    }

    const imageRejection = checkBrandLogoImage(contentType, await this.images.probe(upload.bytes));
    if (imageRejection) rejectBrandLogo(imageRejection);

    const storedType = storedBrandLogoType(contentType);
    const bytes =
      contentType === "image/svg+xml"
        ? await this.images.rasterizeSvg(upload.bytes, BRAND_LOGO_RASTER_SIZE)
        : upload.bytes;
    return { bytes, contentType: storedType };
  }

  private async deleteQuietly(key: string): Promise<void> {
    try {
      await this.storage.delete(key);
    } catch (err) {
      this.logger.warn({ key, err }, "Failed to delete brand logo object");
    }
  }

  private async deleteVersionQuietly(key: string): Promise<void> {
    try {
      await this.storage.deleteLogoVersion(key);
    } catch (err) {
      this.logger.warn({ key, err }, "Failed to delete previous brand logo version");
    }
  }
}
