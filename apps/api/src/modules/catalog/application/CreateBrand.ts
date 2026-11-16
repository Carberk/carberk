import { Inject, Injectable, ConflictException } from "@nestjs/common";

import type { Brand } from "../domain/Brand";
import {
  BRAND_REPOSITORY,
  type BrandRepository,
} from "../domain/ports/BrandRepository";
import { CATALOG_AUDIT_LOG, type CatalogAuditLog } from "./ports/CatalogAuditLog";
import { CatalogSearchIndex } from "./CatalogSearchIndex";

export interface CreateBrandInput {
  slug: string;
  nameRu: string;
  nameTk: string;
  nameEn: string;
}

@Injectable()
export class CreateBrand {
  constructor(
    @Inject(BRAND_REPOSITORY) private readonly brands: BrandRepository,
    @Inject(CATALOG_AUDIT_LOG) private readonly audit: CatalogAuditLog,
    @Inject(CatalogSearchIndex)
    private readonly searchIndex: CatalogSearchIndex,
  ) {}

  async execute(input: CreateBrandInput, actorUserId: string): Promise<Brand> {
    const existing = await this.brands.getBySlug(input.slug);
    if (existing) {
      throw new ConflictException("Brand with this slug already exists");
    }

    const brand = await this.brands.create(input);
    this.searchIndex.invalidate();

    await this.audit.record({
      actorId: actorUserId,
      action: "CATALOG_BRAND_CREATE",
      targetType: "Brand",
      targetId: brand.id,
      details: { slug: brand.slug, nameRu: brand.nameRu },
    });

    return brand;
  }
}
