import { describe, it, expect, beforeEach } from "vitest";
import seededBrands from "../../../../../../packages/db/prisma/seed/brands.json";
import seededModels from "../../../../../../packages/db/prisma/seed/models.json";

import type { Brand } from "../domain/Brand";
import type { Model } from "../domain/Model";
import type { BrandRepository } from "../domain/ports/BrandRepository";
import type { ModelRepository } from "../domain/ports/ModelRepository";

import { CatalogSearchIndex } from "./CatalogSearchIndex";
import { SearchCatalog } from "./SearchCatalog";

function makeBrand(overrides: Partial<Brand> = {}): Brand {
  return {
    id: "brand-1",
    slug: "toyota",
    nameRu: "Тойота",
    nameTk: "Toýota",
    nameEn: "Toyota",
    createdAt: new Date("2026-05-14T12:00:00Z"),
    updatedAt: new Date("2026-05-14T12:00:00Z"),
    ...overrides,
  };
}

function makeModel(overrides: Partial<Model> = {}): Model {
  return {
    id: "model-1",
    brandId: "brand-1",
    slug: "camry",
    nameRu: "Камри",
    nameTk: "Kamri",
    nameEn: "Camry",
    createdAt: new Date("2026-05-14T12:00:00Z"),
    updatedAt: new Date("2026-05-14T12:00:00Z"),
    ...overrides,
  };
}

class FakeBrandRepository implements BrandRepository {
  brands: Brand[] = [];
  listAllCalls = 0;

  async listBrands(): Promise<{
    items: Brand[];
    nextCursor?: { name: string; id: string };
  }> {
    return { items: this.brands };
  }

  async getBrandById(id: string): Promise<Brand | null> {
    return this.brands.find((b) => b.id === id) ?? null;
  }

  async listAllBrands(): Promise<Brand[]> {
    this.listAllCalls += 1;
    return this.brands;
  }

  async getBySlug(): Promise<Brand | null> {
    throw new Error("not implemented");
  }

  async create(): Promise<Brand> {
    throw new Error("not implemented");
  }

  async update(): Promise<Brand> {
    throw new Error("not implemented");
  }

  async delete(): Promise<{ logoKey: string | null } | null> {
    throw new Error("not implemented");
  }
}

class FakeModelRepository implements ModelRepository {
  models: Model[] = [];
  listAllCalls = 0;

  async listModelsByBrand(): Promise<{
    items: Model[];
    nextCursor?: { name: string; id: string };
  }> {
    return { items: this.models };
  }

  async getModelById(id: string): Promise<Model | null> {
    return this.models.find((m) => m.id === id) ?? null;
  }

  async listAllModels(): Promise<Model[]> {
    this.listAllCalls += 1;
    return this.models;
  }

  async getBySlug(): Promise<Model | null> {
    throw new Error("not implemented");
  }

  async getByBrandIdAndSlug(): Promise<Model | null> {
    throw new Error("not implemented");
  }

  async create(): Promise<Model> {
    throw new Error("not implemented");
  }

  async update(): Promise<Model> {
    throw new Error("not implemented");
  }

  async delete(): Promise<void> {
    throw new Error("not implemented");
  }
}

describe("SearchCatalog", () => {
  let brandRepo: FakeBrandRepository;
  let modelRepo: FakeModelRepository;
  let index: CatalogSearchIndex;
  let uc: SearchCatalog;

  beforeEach(() => {
    brandRepo = new FakeBrandRepository();
    modelRepo = new FakeModelRepository();
    brandRepo.brands = [
      makeBrand(),
      makeBrand({
        id: "brand-2",
        slug: "lexus",
        nameRu: "Лексус",
        nameTk: "Lexus",
        nameEn: "Lexus",
      }),
    ];
    modelRepo.models = [
      makeModel(),
      makeModel({
        id: "model-2",
        brandId: "brand-1",
        slug: "corolla",
        nameRu: "Королла",
        nameTk: "Korolla",
        nameEn: "Corolla",
      }),
    ];
    index = new CatalogSearchIndex(brandRepo, modelRepo);
    uc = new SearchCatalog(index);
  });

  it("finds Toyota first for Russian, English, Turkmen and one-typo spellings", async () => {
    for (const q of ["тойота", "toyota", "Тойота", "toyta"]) {
      const result = await uc.execute({ query: q, locale: "ru" });
      expect(result.results[0]).toMatchObject({
        kind: "brand",
        brandId: "brand-1",
        label: "Тойота",
      });
    }
  });

  it("returns Camry as a model result with its brand for Russian and English spellings", async () => {
    for (const q of ["камри", "camry"]) {
      const result = await uc.execute({ query: q, locale: "en" });
      const camry = result.results.find((r) => r.modelId === "model-1");
      expect(camry).toMatchObject({
        kind: "model",
        brandId: "brand-1",
        label: "Camry",
        brandLabel: "Toyota",
      });
    }
  });

  it("finds Cyrillic Camry against the production catalog's Latin-only model names", async () => {
    const productionCamry = seededModels.find(
      (model) => model.brandSlug === "toyota" && model.slug === "camry",
    );
    expect(productionCamry).toMatchObject({
      nameRu: "Camry", nameTk: "Camry", nameEn: "Camry",
    });
    modelRepo.models = [makeModel(productionCamry)];
    index.invalidate();

    for (const query of ["камри", "камри 2018", "тойота камри"]) {
      const result = await uc.execute({ query, locale: "ru" });
      expect(result.results[0]).toMatchObject({
        kind: "model", modelId: "model-1", brandId: "brand-1",
        label: "Camry", brandLabel: "Тойота",
      });
      if (query.endsWith("2018")) {
        expect(result.yearFrom).toBe(2018);
        expect(result.yearTo).toBe(2018);
      }
    }
  });

  it.each(["ru", "tk", "en"] as const)(
    "finds seeded International Harvester machinery separately from Navistar in %s",
    async (locale) => {
      brandRepo.brands = seededBrands.map((brand) =>
        makeBrand({ ...brand, id: brand.slug }),
      );
      modelRepo.models = seededModels.map((model) =>
        makeModel({ ...model, id: `${model.brandSlug}/${model.slug}`, brandId: model.brandSlug }),
      );
      index.invalidate();

      const brand = await uc.execute({ query: "International Harvester", locale });
      expect(brand.results[0]).toMatchObject({
        kind: "brand", brandId: "international-harvester", label: "International Harvester",
      });
      for (const [query, slug, label] of [
        ["584", "584", "584"],
        ["744", "744", "744"],
        ["844", "844", "844"],
        ["955", "955", "955"],
        ["1055", "1055", "1055"],
        ["Farmall DED 3", "farmall-ded-3", "Farmall DED 3"],
      ] as const) {
        const tractor = await uc.execute({ query, locale });
        expect(tractor.results).toContainEqual(expect.objectContaining({
          kind: "model", brandId: "international-harvester",
          modelId: `international-harvester/${slug}`, label,
          brandLabel: "International Harvester",
        }));
      }
      for (const query of ["1055 1982", "International Harvester 1055 1982"]) {
        const tractor = await uc.execute({ query, locale });
        expect(tractor.results[0]).toMatchObject({
          kind: "model", modelId: "international-harvester/1055", label: "1055",
        });
        expect(tractor.yearFrom).toBe(1982);
        expect(tractor.yearTo).toBe(1982);
      }
      // PPM 2007 and YTO 2004 are catalog models, but valid year-only queries stay years.
      for (const [query, year] of [["2007", 2007], ["2004", 2004]] as const) {
        expect(await uc.execute({ query, locale })).toEqual({
          results: [], yearFrom: year, yearTo: year,
        });
      }
      for (const query of ["Camry 1800", "Camry 2500", "Camry 2.0", "Camry 0000"]) {
        const camry = await uc.execute({ query, locale });
        if (query === "Camry 2.0") {
          expect(camry.results).toEqual([]);
        } else {
          expect(camry.results).toContainEqual(expect.objectContaining({
            kind: "model", modelId: "toyota/camry",
          }));
        }
        expect(camry.results.some((result) => result.modelId === "chevrolet/2500")).toBe(false);
        expect(camry.yearFrom).toBeUndefined();
        expect(camry.yearTo).toBeUndefined();
      }
      const navistar = await uc.execute({ query: "ProStar", locale });
      expect(navistar.results[0]).toMatchObject({
        kind: "model", brandId: "international", label: "ProStar",
      });
      const modernCase = await uc.execute({ query: "STX375", locale });
      expect(modernCase.results[0]).toMatchObject({
        kind: "model", brandId: "case", label: "STX375 Quadtrac",
      });
    },
  );

  it.each(["ru", "tk", "en"] as const)(
    "finds existing numeric catalog models by ordinary model query in %s",
    async (locale) => {
      brandRepo.brands = seededBrands.map((brand) => makeBrand({ ...brand, id: brand.slug }));
      modelRepo.models = seededModels.map((model) =>
        makeModel({ ...model, id: `${model.brandSlug}/${model.slug}`, brandId: model.brandSlug }),
      );
      index.invalidate();
      for (const [query, brandId, modelId] of [
        ["1500", "chevrolet", "chevrolet/1500"],
        ["2106", "lada", "lada/2106"],
        ["9000", "saab", "saab/9000"],
      ] as const) {
        const result = await uc.execute({ query, locale });
        expect(result.results).toContainEqual(expect.objectContaining({ kind: "model", brandId, modelId }));
        expect(result.yearFrom).toBeUndefined();
        expect(result.yearTo).toBeUndefined();
      }
    },
  );

  it("returns brand and model results together in one list", async () => {
    const result = await uc.execute({ query: "toyota", locale: "en" });
    const kinds = result.results.map((r) => r.kind);
    expect(kinds).toContain("brand");
    expect(kinds).toContain("model");
    expect(result.results[0]!.kind).toBe("brand");
  });

  it("caps results at 20", async () => {
    modelRepo.models = Array.from({ length: 30 }, (_, i) =>
      makeModel({
        id: `model-${i + 1}`,
        slug: `camry-${i + 1}`,
        nameEn: `Camry ${i + 1}`,
        nameRu: `Камри ${i + 1}`,
        nameTk: `Kamri ${i + 1}`,
      }),
    );
    index.invalidate();

    const result = await uc.execute({ query: "camry", locale: "en" });
    expect(result.results.length).toBeLessThanOrEqual(20);
  });

  it("parses a single year after the model name", async () => {
    const result = await uc.execute({ query: "camry 2018", locale: "en" });
    expect(result.results[0]).toMatchObject({
      kind: "model",
      modelId: "model-1",
    });
    expect(result.yearFrom).toBe(2018);
    expect(result.yearTo).toBe(2018);
  });

  it("parses a year range after a Russian brand name", async () => {
    const result = await uc.execute({
      query: "лексус 2014-2019",
      locale: "ru",
    });
    expect(result.results[0]).toMatchObject({
      kind: "brand",
      brandId: "brand-2",
      label: "Лексус",
    });
    expect(result.yearFrom).toBe(2014);
    expect(result.yearTo).toBe(2019);
  });

  it("returns only the year range for a bare year query", async () => {
    const result = await uc.execute({ query: "2018", locale: "ru" });
    expect(result.results).toEqual([]);
    expect(result.yearFrom).toBe(2018);
    expect(result.yearTo).toBe(2018);
  });

  it("ignores years outside the valid range", async () => {
    const result = await uc.execute({ query: "camry 1800", locale: "en" });
    expect(result.yearFrom).toBeUndefined();
    expect(result.yearTo).toBeUndefined();
    expect(result.results.length).toBeGreaterThan(0);
  });

  it("returns an empty list for an empty or one-character query", async () => {
    for (const q of ["", " ", "т"]) {
      const result = await uc.execute({ query: q, locale: "ru" });
      expect(result.results).toEqual([]);
      expect(result.yearFrom).toBeUndefined();
    }
  });

  it("localizes labels with the existing en → ru → tk fallback", async () => {
    brandRepo.brands = [
      makeBrand({ nameTk: "", nameRu: "", nameEn: "Toyota" }),
    ];
    modelRepo.models = [];
    index.invalidate();

    const result = await uc.execute({ query: "toyota", locale: "tk" });
    expect(result.results[0]).toMatchObject({
      label: "Toyota",
      localeFallback: "en",
    });
  });

  it("caches the snapshot per process and reloads after invalidation", async () => {
    await uc.execute({ query: "toyota", locale: "en" });
    await uc.execute({ query: "camry", locale: "en" });
    expect(brandRepo.listAllCalls).toBe(1);
    expect(modelRepo.listAllCalls).toBe(1);

    index.invalidate();
    await uc.execute({ query: "toyota", locale: "en" });
    expect(brandRepo.listAllCalls).toBe(2);
    expect(modelRepo.listAllCalls).toBe(2);
  });
});
