import { Inject, Injectable, ConflictException, NotFoundException } from "@nestjs/common";

import type { Brand } from "../domain/Brand";
import {
  BRAND_REPOSITORY,
  type BrandRepository,
} from "../domain/ports/BrandRepository";
import { CATALOG_AUDIT_LOG, type CatalogAuditLog } from "./ports/CatalogAuditLog";
import { CatalogSearchIndex } from "./CatalogSearchIndex";

export interface UpdateBrandInput {
  id: string;
  slug?: string | undefined;
  nameRu?: string | undefined;
  nameTk?: string | undefined;
  nameEn?: string | undefined;
}

@Injectable()
export class UpdateBrand {
  constructor(
    @Inject(BRAND_REPOSITORY) private readonly brands: BrandRepository,
    @Inject(CATALOG_AUDIT_LOG) private readonly audit: CatalogAuditLog,
    @Inject(CatalogSearchIndex)
    private readonly searchIndex: CatalogSearchIndex,
  ) {}

  async execute(input: UpdateBrandInput, actorUserId: string): Promise<Brand> {
    const brand = await this.brands.getBrandById(input.id);
    if (!brand) {
      throw new NotFoundException("Brand not found");
    }

    if (input.slug && input.slug !== brand.slug) {
      const existing = await this.brands.getBySlug(input.slug);
      if (existing) {
        throw new ConflictException("Brand with this slug already exists");
      }
    }

    const updated = await this.brands.update(input.id, {
      ...(input.slug !== undefined && { slug: input.slug }),
      ...(input.nameRu !== undefined && { nameRu: input.nameRu }),
      ...(input.nameTk !== undefined && { nameTk: input.nameTk }),
      ...(input.nameEn !== undefined && { nameEn: input.nameEn }),
    });
    this.searchIndex.invalidate();

    await this.audit.record({
      actorId: actorUserId,
      action: "CATALOG_BRAND_UPDATE",
      targetType: "Brand",
      targetId: updated.id,
      details: { slug: updated.slug, nameRu: updated.nameRu },
    });

    return updated;
  }
}
