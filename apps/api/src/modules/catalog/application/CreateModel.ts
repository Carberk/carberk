import { Inject, Injectable, ConflictException, NotFoundException } from "@nestjs/common";

import type { Model } from "../domain/Model";
import {
  MODEL_REPOSITORY,
  type ModelRepository,
} from "../domain/ports/ModelRepository";
import {
  BRAND_REPOSITORY,
  type BrandRepository,
} from "../domain/ports/BrandRepository";
import { CATALOG_AUDIT_LOG, type CatalogAuditLog } from "./ports/CatalogAuditLog";
import { CatalogSearchIndex } from "./CatalogSearchIndex";

export interface CreateModelInput {
  brandId: string;
  slug: string;
  nameRu: string;
  nameTk: string;
  nameEn: string;
}

@Injectable()
export class CreateModel {
  constructor(
    @Inject(MODEL_REPOSITORY) private readonly models: ModelRepository,
    @Inject(BRAND_REPOSITORY) private readonly brands: BrandRepository,
    @Inject(CATALOG_AUDIT_LOG) private readonly audit: CatalogAuditLog,
    @Inject(CatalogSearchIndex)
    private readonly searchIndex: CatalogSearchIndex,
  ) {}

  async execute(input: CreateModelInput, actorUserId: string): Promise<Model> {
    const brand = await this.brands.getBrandById(input.brandId);
    if (!brand) {
      throw new NotFoundException("Brand not found");
    }

    const existing = await this.models.getByBrandIdAndSlug(
      input.brandId,
      input.slug,
    );
    if (existing) {
      throw new ConflictException(
        "Model with this slug already exists for this brand",
      );
    }

    const model = await this.models.create(input);
    this.searchIndex.invalidate();

    await this.audit.record({
      actorId: actorUserId,
      action: "CATALOG_MODEL_CREATE",
      targetType: "Model",
      targetId: model.id,
      details: { slug: model.slug, nameRu: model.nameRu, brandId: model.brandId },
    });

    return model;
  }
}
