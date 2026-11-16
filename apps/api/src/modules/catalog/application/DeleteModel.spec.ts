import { describe, it, expect, beforeEach } from "vitest";
import { NotFoundException, ConflictException } from "@nestjs/common";

import type { Model } from "../domain/Model";
import type { ModelRepository } from "../domain/ports/ModelRepository";

import { FakeCatalogAuditLog } from "./testing/FakeCatalogAuditLog";
import { DeleteModel } from "./DeleteModel";
import type { CatalogSearchIndex } from "./CatalogSearchIndex";

class FakeSearchIndex {
  invalidated = false;
  invalidate(): void {
    this.invalidated = true;
  }
}

class FakeModelRepository implements ModelRepository {
  models: Model[] = [];
  shouldThrowFkOnDelete = false;

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
    if (this.shouldThrowFkOnDelete) {
      throw new Error("foreign key constraint violated");
    }
  }
}

function makeUseCase(
  modelRepo?: FakeModelRepository,
  audit?: FakeCatalogAuditLog,
  searchIndex?: FakeSearchIndex,
) {
  return new DeleteModel(
    modelRepo ?? new FakeModelRepository(),
    audit ?? new FakeCatalogAuditLog(),
    (searchIndex ?? new FakeSearchIndex()) as unknown as CatalogSearchIndex,
  );
}

describe("DeleteModel", () => {
  let modelRepo: FakeModelRepository;
  let audit: FakeCatalogAuditLog;

  beforeEach(() => {
    modelRepo = new FakeModelRepository();
    audit = new FakeCatalogAuditLog();
  });

  it("deletes a model when it exists", async () => {
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

    const uc = makeUseCase(modelRepo, audit);
    await uc.execute({ id: "m1" }, "admin-1");

    expect(audit.entries).toHaveLength(1);
    expect(audit.entries[0]).toMatchObject({
      actorId: "admin-1",
      action: "CATALOG_MODEL_DELETE",
      targetType: "Model",
      targetId: "m1",
    });
  });

  it("throws NotFoundException when model does not exist", async () => {
    const uc = makeUseCase(modelRepo, audit);
    await expect(uc.execute({ id: "m1" }, "admin-1")).rejects.toThrow(
      NotFoundException,
    );
  });

  it("throws ConflictException when FK constraint prevents deletion", async () => {
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
    modelRepo.shouldThrowFkOnDelete = true;

    const uc = makeUseCase(modelRepo, audit);
    await expect(uc.execute({ id: "m1" }, "admin-1")).rejects.toThrow(
      ConflictException,
    );
  });

  it("invalidates the catalog search index after deletion", async () => {
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
    const uc = makeUseCase(modelRepo, audit, searchIndex);
    await uc.execute({ id: "m1" }, "admin-1");

    expect(searchIndex.invalidated).toBe(true);
  });
});
