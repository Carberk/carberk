import { describe, it, expect, beforeEach } from "vitest";
import { ConflictException, NotFoundException } from "@nestjs/common";

import type { Brand } from "../domain/Brand";
import type { Model } from "../domain/Model";
import type { BrandRepository } from "../domain/ports/BrandRepository";
import type { ModelRepository } from "../domain/ports/ModelRepository";

import { FakeCatalogAuditLog } from "./testing/FakeCatalogAuditLog";
import { UpdateModel } from "./UpdateModel";
import type { CatalogSearchIndex } from "./CatalogSearchIndex";

class FakeSearchIndex {
  invalidated = false;
  invalidate(): void {
    this.invalidated = true;
  }
}

class FakeBrandRepository implements BrandRepository {
  brands: Brand[] = [];

  async listBrands(): Promise<{ items: Brand[]; nextCursor?: { name: string; id: string } }> {
    return { items: this.brands };
  }

  async getBrandById(id: string): Promise<Brand | null> {
    return this.brands.find((b) => b.id === id) ?? null;
  }

  async listAllBrands(): Promise<Brand[]> {
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

  async listModelsByBrand(): Promise<{ items: Model[]; nextCursor?: { name: string; id: string } }> {
    return { items: this.models };
  }

  async getModelById(id: string): Promise<Model | null> {
    return this.models.find((m) => m.id === id) ?? null;
  }

  async listAllModels(): Promise<Model[]> {
    return this.models;
  }

  async getBySlug(): Promise<Model | null> {
    throw new Error("not implemented");
  }

  async getByBrandIdAndSlug(brandId: string, slug: string): Promise<Model | null> {
    return this.models.find((m) => m.brandId === brandId && m.slug === slug) ?? null;
  }

  async create(): Promise<Model> {
    throw new Error("not implemented");
  }

  async update(
    id: string,
    data: Partial<{ brandId: string; slug: string; nameRu: string; nameTk: string; nameEn: string }>,
  ): Promise<Model> {
    const model = this.models.find((m) => m.id === id);
    if (!model) throw new Error("not found");
    Object.assign(model, data, { updatedAt: new Date() });
    return model;
  }

  async delete(): Promise<void> {
    throw new Error("not implemented");
  }
}

function makeUseCase(
  modelRepo?: FakeModelRepository,
  brandRepo?: FakeBrandRepository,
  audit?: FakeCatalogAuditLog,
  searchIndex?: FakeSearchIndex,
) {
  return new UpdateModel(
    modelRepo ?? new FakeModelRepository(),
    brandRepo ?? new FakeBrandRepository(),
    audit ?? new FakeCatalogAuditLog(),
    (searchIndex ?? new FakeSearchIndex()) as unknown as CatalogSearchIndex,
  );
}

describe("UpdateModel", () => {
  let modelRepo: FakeModelRepository;
  let brandRepo: FakeBrandRepository;
  let audit: FakeCatalogAuditLog;

  beforeEach(() => {
    modelRepo = new FakeModelRepository();
    brandRepo = new FakeBrandRepository();
    audit = new FakeCatalogAuditLog();
  });

  it("updates a model when it exists", async () => {
    brandRepo.brands.push({
      id: "b1",
      slug: "toyota",
      nameRu: "Тойота",
      nameTk: "Toýota",
      nameEn: "Toyota",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    modelRepo.models.push({
      id: "m1",
      brandId: "b1",
      slug: "camry",
      nameRu: "Камри",
      nameTk: "Kamri",
      nameEn: "Camry",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const uc = makeUseCase(modelRepo, brandRepo, audit);
    const result = await uc.execute({ id: "m1", nameRu: "Камри Новая" }, "admin-1");

    expect(result.nameRu).toBe("Камри Новая");
    expect(result.slug).toBe("camry");
  });

  it("throws NotFoundException when model does not exist", async () => {
    const uc = makeUseCase(modelRepo, brandRepo, audit);
    await expect(uc.execute({ id: "m1", nameRu: "X" }, "admin-1")).rejects.toThrow(
      NotFoundException,
    );
  });

  it("throws NotFoundException when new brand does not exist", async () => {
    brandRepo.brands.push({
      id: "b1",
      slug: "toyota",
      nameRu: "Тойота",
      nameTk: "Toýota",
      nameEn: "Toyota",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    modelRepo.models.push({
      id: "m1",
      brandId: "b1",
      slug: "camry",
      nameRu: "Камри",
      nameTk: "Kamri",
      nameEn: "Camry",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const uc = makeUseCase(modelRepo, brandRepo, audit);
    await expect(
      uc.execute({ id: "m1", brandId: "b2" }, "admin-1"),
    ).rejects.toThrow(NotFoundException);
  });

  it("throws ConflictException when new slug collides with another model in the same brand", async () => {
    brandRepo.brands.push({
      id: "b1",
      slug: "toyota",
      nameRu: "Тойота",
      nameTk: "Toýota",
      nameEn: "Toyota",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    modelRepo.models.push(
      {
        id: "m1",
        brandId: "b1",
        slug: "camry",
        nameRu: "Камри",
        nameTk: "Kamri",
        nameEn: "Camry",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: "m2",
        brandId: "b1",
        slug: "corolla",
        nameRu: "Королла",
        nameTk: "Korolla",
        nameEn: "Corolla",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    );

    const uc = makeUseCase(modelRepo, brandRepo, audit);
    await expect(
      uc.execute({ id: "m1", slug: "corolla" }, "admin-1"),
    ).rejects.toThrow(ConflictException);
  });

  it("allows keeping the same slug and brandId", async () => {
    brandRepo.brands.push({
      id: "b1",
      slug: "toyota",
      nameRu: "Тойота",
      nameTk: "Toýota",
      nameEn: "Toyota",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    modelRepo.models.push({
      id: "m1",
      brandId: "b1",
      slug: "camry",
      nameRu: "Камри",
      nameTk: "Kamri",
      nameEn: "Camry",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const uc = makeUseCase(modelRepo, brandRepo, audit);
    const result = await uc.execute({ id: "m1", slug: "camry", nameRu: "New" }, "admin-1");

    expect(result.slug).toBe("camry");
  });

  it("writes an audit log entry", async () => {
    brandRepo.brands.push({
      id: "b1",
      slug: "toyota",
      nameRu: "Тойота",
      nameTk: "Toýота",
      nameEn: "Toyota",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    modelRepo.models.push({
      id: "m1",
      brandId: "b1",
      slug: "camry",
      nameRu: "Камри",
      nameTk: "Kamri",
      nameEn: "Camry",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const uc = makeUseCase(modelRepo, brandRepo, audit);
    await uc.execute({ id: "m1", nameRu: "Камри Новая" }, "admin-1");

    expect(audit.entries).toHaveLength(1);
    expect(audit.entries[0]).toMatchObject({
      actorId: "admin-1",
      action: "CATALOG_MODEL_UPDATE",
      targetType: "Model",
      targetId: "m1",
    });
  });

  it("invalidates the catalog search index", async () => {
    brandRepo.brands.push({
      id: "b1",
      slug: "toyota",
      nameRu: "Тойота",
      nameTk: "Toýota",
      nameEn: "Toyota",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    modelRepo.models.push({
      id: "m1",
      brandId: "b1",
      slug: "camry",
      nameRu: "Камри",
      nameTk: "Kamri",
      nameEn: "Camry",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const searchIndex = new FakeSearchIndex();
    const uc = makeUseCase(modelRepo, brandRepo, audit, searchIndex);
    await uc.execute({ id: "m1", nameRu: "Камри Новая" }, "admin-1");

    expect(searchIndex.invalidated).toBe(true);
  });
});
