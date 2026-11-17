import { Inject, Injectable } from "@nestjs/common";

import type { Brand } from "../domain/Brand";
import type { Model } from "../domain/Model";
import {
  BRAND_REPOSITORY,
  type BrandRepository,
} from "../domain/ports/BrandRepository";
import {
  MODEL_REPOSITORY,
  type ModelRepository,
} from "../domain/ports/ModelRepository";

export interface CatalogSearchSnapshot {
  brands: Brand[];
  models: Model[];
}






@Injectable()
export class CatalogSearchIndex {
  private snapshot: CatalogSearchSnapshot | undefined;
  private loading: Promise<CatalogSearchSnapshot> | undefined;

  constructor(
    @Inject(BRAND_REPOSITORY) private readonly brands: BrandRepository,
    @Inject(MODEL_REPOSITORY) private readonly models: ModelRepository,
  ) {}

  async getSnapshot(): Promise<CatalogSearchSnapshot> {
    if (this.snapshot) return this.snapshot;
    this.loading ??= this.load();
    this.snapshot = await this.loading;
    this.loading = undefined;
    return this.snapshot;
  }

  invalidate(): void {
    this.snapshot = undefined;
  }

  private async load(): Promise<CatalogSearchSnapshot> {
    const [brands, models] = await Promise.all([
      this.brands.listAllBrands(),
      this.models.listAllModels(),
    ]);
    return { brands, models };
  }
}
