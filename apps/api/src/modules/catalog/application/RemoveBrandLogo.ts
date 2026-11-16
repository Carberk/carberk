import { Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";

import {
  BRAND_LOGO_REPOSITORY,
  type BrandLogoRepository,
} from "../domain/ports/BrandLogoRepository";
import { BRAND_LOGO_STORAGE, type BrandLogoStorage } from "../domain/ports/BrandLogoStorage";
import { CATALOG_AUDIT_LOG, type CatalogAuditLog } from "./ports/CatalogAuditLog";

@Injectable()
export class RemoveBrandLogo {
  private readonly logger = new Logger(RemoveBrandLogo.name);

  constructor(
    @Inject(BRAND_LOGO_REPOSITORY) private readonly brands: BrandLogoRepository,
    @Inject(BRAND_LOGO_STORAGE) private readonly storage: BrandLogoStorage,
    @Inject(CATALOG_AUDIT_LOG) private readonly audit: CatalogAuditLog,
  ) {}

  async execute(input: { brandId: string }, actorUserId: string): Promise<void> {
    const brand = await this.brands.getBrandById(input.brandId);
    if (!brand) {
      throw new NotFoundException("Brand not found");
    }

    const replacement = await this.brands.replaceLogoKey(brand.id, null);
    if (!replacement.replaced) {
      throw new NotFoundException("Brand not found");
    }

    const previousKey = replacement.previousKey;
    if (!previousKey) return;

    try {
      await this.storage.deleteLogoVersion(previousKey);
    } catch (err) {
      this.logger.warn({ key: previousKey, err }, "Failed to delete brand logo version");
    }

    await this.audit.record({
      actorId: actorUserId,
      action: "CATALOG_BRAND_LOGO_REMOVE",
      targetType: "Brand",
      targetId: brand.id,
      details: { slug: brand.slug, previousLogoKey: previousKey },
    });
  }
}
