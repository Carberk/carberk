import { Inject, Injectable, Logger, NotFoundException, ConflictException } from "@nestjs/common";

import {
  BRAND_REPOSITORY,
  type BrandRepository,
} from "../domain/ports/BrandRepository";
import { BRAND_LOGO_STORAGE, type BrandLogoStorage } from "../domain/ports/BrandLogoStorage";
import { CATALOG_AUDIT_LOG, type CatalogAuditLog } from "./ports/CatalogAuditLog";
import { CatalogSearchIndex } from "./CatalogSearchIndex";

export interface DeleteBrandInput {
  id: string;
}

@Injectable()
export class DeleteBrand {
  private readonly logger = new Logger(DeleteBrand.name);

  constructor(
    @Inject(BRAND_REPOSITORY) private readonly brands: BrandRepository,
    @Inject(CATALOG_AUDIT_LOG) private readonly audit: CatalogAuditLog,
    @Inject(CatalogSearchIndex)
    private readonly searchIndex: CatalogSearchIndex,
    @Inject(BRAND_LOGO_STORAGE) private readonly logoStorage: BrandLogoStorage,
  ) {}

  async execute(input: DeleteBrandInput, actorUserId: string): Promise<void> {
    const brand = await this.brands.getBrandById(input.id);
    if (!brand) {
      throw new NotFoundException("Brand not found");
    }

    let deleted: { logoKey: string | null } | null;
    try {
      deleted = await this.brands.delete(input.id);
    } catch (err: unknown) {
      if (
        err instanceof Error &&
        err.message.includes("foreign key constraint")
      ) {
        throw new ConflictException(
          "Cannot delete brand because it has associated models",
        );
      }
      throw err;
    }
    if (!deleted) {
      throw new NotFoundException("Brand not found");
    }
    this.searchIndex.invalidate();

    if (deleted.logoKey) {
      try {
        await this.logoStorage.deleteLogoVersion(deleted.logoKey);
      } catch (err) {
        this.logger.warn({ key: deleted.logoKey, err }, "Failed to delete brand logo version");
      }
    }

    await this.audit.record({
      actorId: actorUserId,
      action: "CATALOG_BRAND_DELETE",
      targetType: "Brand",
      targetId: brand.id,
      details: { slug: brand.slug, nameRu: brand.nameRu },
    });
  }
}
