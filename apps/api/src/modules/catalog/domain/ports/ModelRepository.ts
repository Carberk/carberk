import type { Model } from "../Model";

export interface ModelRepository {
  listModelsByBrand(opts: {
    brandId: string;
    locale: "tk" | "ru" | "en";
    cursor?: { name: string; id: string };
    limit?: number;
  }): Promise<{ items: Model[]; nextCursor?: { name: string; id: string } | undefined }>;

  getModelById(id: string): Promise<Model | null>;


  listAllModels(): Promise<Model[]>;

  getBySlug(slug: string): Promise<Model | null>;

  getByBrandIdAndSlug(brandId: string, slug: string): Promise<Model | null>;

  create(data: {
    brandId: string;
    slug: string;
    nameRu: string;
    nameTk: string;
    nameEn: string;
  }): Promise<Model>;

  update(
    id: string,
    data: {
      brandId?: string | undefined;
      slug?: string | undefined;
      nameRu?: string | undefined;
      nameTk?: string | undefined;
      nameEn?: string | undefined;
    },
  ): Promise<Model>;

  delete(id: string): Promise<void>;
}

export const MODEL_REPOSITORY = Symbol("ModelRepository");
