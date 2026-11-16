import { describe, it, expect, beforeEach } from "vitest";
import { ConflictException, NotFoundException } from "@nestjs/common";

import type { Brand } from "../domain/Brand";
import type { BrandRepository } from "../domain/ports/BrandRepository";

import { FakeCatalogAuditLog } from "./testing/FakeCatalogAuditLog";
import { UpdateBrand } from "./UpdateBrand";
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

  async getBySlug(slug: string): Promise<Brand | null> {
    return this.brands.find((b) => b.slug === slug) ?? null;
  }

  async create(): Promise<Brand> {
    throw new Error("not implemented");
  }

  async update(
    id: string,
    data: Partial<{ slug: string; nameRu: string; nameTk: string; nameEn: string }>,
  ): Promise<Brand> {
    const brand = this.brands.find((b) => b.id === id);
    if (!brand) throw new Error("not found");
    Object.assign(brand, data, { updatedAt: new Date() });
    return brand;
  }

  async delete(): Promise<{ logoKey: string | null } | null> {
    throw new Error("not implemented");
  }
}

function makeUseCase(
  brandRepo?: FakeBrandRepository,
  audit?: FakeCatalogAuditLog,
  searchIndex?: FakeSearchIndex,
) {
  return new UpdateBrand(
    brandRepo ?? new FakeBrandRepository(),
    audit ?? new FakeCatalogAuditLog(),
    (searchIndex ?? new FakeSearchIndex()) as unknown as CatalogSearchIndex,
  );
}

describe("UpdateBrand", () => {
  let brandRepo: FakeBrandRepository;
  let audit: FakeCatalogAuditLog;

  beforeEach(() => {
    brandRepo = new FakeBrandRepository();
    audit = new FakeCatalogAuditLog();
  });

  it("updates a brand when it exists", async () => {
    brandRepo.brands.push({
      id: "b1",
      slug: "toyota",
      nameRu: "Тойота",
      nameTk: "Toýota",
      nameEn: "Toyota",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const uc = makeUseCase(brandRepo, audit);
    const result = await uc.execute({ id: "b1", nameRu: "Тойота Мотор" }, "admin-1");

    expect(result.nameRu).toBe("Тойота Мотор");
    expect(result.slug).toBe("toyota");
  });

  it("throws NotFoundException when brand does not exist", async () => {
    const uc = makeUseCase(brandRepo, audit);
    await expect(uc.execute({ id: "b1", nameRu: "X" }, "admin-1")).rejects.toThrow(
      NotFoundException,
    );
  });

  it("throws ConflictException when new slug collides with another brand", async () => {
    brandRepo.brands.push(
      {
        id: "b1",
        slug: "toyota",
        nameRu: "Тойота",
        nameTk: "Toýota",
        nameEn: "Toyota",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: "b2",
        slug: "bmw",
        nameRu: "БМВ",
        nameTk: "BMW",
        nameEn: "BMW",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    );

    const uc = makeUseCase(brandRepo, audit);
    await expect(
      uc.execute({ id: "b1", slug: "bmw" }, "admin-1"),
    ).rejects.toThrow(ConflictException);
  });

  it("allows keeping the same slug", async () => {
    brandRepo.brands.push({
      id: "b1",
      slug: "toyota",
      nameRu: "Тойота",
      nameTk: "Toýota",
      nameEn: "Toyota",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const uc = makeUseCase(brandRepo, audit);
    const result = await uc.execute({ id: "b1", slug: "toyota", nameRu: "New" }, "admin-1");

    expect(result.slug).toBe("toyota");
  });

  it("writes an audit log entry", async () => {
    brandRepo.brands.push({
      id: "b1",
      slug: "toyota",
      nameRu: "Тойота",
      nameTk: "Toýota",
      nameEn: "Toyota",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const uc = makeUseCase(brandRepo, audit);
    await uc.execute({ id: "b1", nameRu: "Тойота Мотор" }, "admin-1");

    expect(audit.entries).toHaveLength(1);
    expect(audit.entries[0]).toMatchObject({
      actorId: "admin-1",
      action: "CATALOG_BRAND_UPDATE",
      targetType: "Brand",
      targetId: "b1",
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

    const searchIndex = new FakeSearchIndex();
    const uc = makeUseCase(brandRepo, audit, searchIndex);
    await uc.execute({ id: "b1", nameRu: "Тойота Мотор" }, "admin-1");

    expect(searchIndex.invalidated).toBe(true);
  });
});
