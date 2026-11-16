import { describe, it, expect, beforeEach } from "vitest";
import { ConflictException } from "@nestjs/common";

import type { Brand } from "../domain/Brand";
import type { BrandRepository } from "../domain/ports/BrandRepository";

import { FakeCatalogAuditLog } from "./testing/FakeCatalogAuditLog";
import { CreateBrand } from "./CreateBrand";
import type { CatalogSearchIndex } from "./CatalogSearchIndex";

class FakeSearchIndex {
  invalidated = false;
  invalidate(): void {
    this.invalidated = true;
  }
}

class FakeBrandRepository implements BrandRepository {
  brands: Brand[] = [];
  nextId = 1;

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

  async create(data: { slug: string; nameRu: string; nameTk: string; nameEn: string }): Promise<Brand> {
    const brand: Brand = {
      id: `brand-${this.nextId++}`,
      ...data,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.brands.push(brand);
    return brand;
  }

  async update(): Promise<Brand> {
    throw new Error("not implemented");
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
  return new CreateBrand(
    brandRepo ?? new FakeBrandRepository(),
    audit ?? new FakeCatalogAuditLog(),
    (searchIndex ?? new FakeSearchIndex()) as unknown as CatalogSearchIndex,
  );
}

describe("CreateBrand", () => {
  let brandRepo: FakeBrandRepository;
  let audit: FakeCatalogAuditLog;

  beforeEach(() => {
    brandRepo = new FakeBrandRepository();
    audit = new FakeCatalogAuditLog();
  });

  it("creates a brand when slug is unique", async () => {
    const uc = makeUseCase(brandRepo, audit);
    const result = await uc.execute(
      { slug: "toyota", nameRu: "Тойота", nameTk: "Toýota", nameEn: "Toyota" },
      "admin-1",
    );

    expect(result.slug).toBe("toyota");
    expect(result.nameRu).toBe("Тойота");
    expect(brandRepo.brands).toHaveLength(1);
  });

  it("throws ConflictException when slug already exists", async () => {
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
    await expect(
      uc.execute(
        { slug: "toyota", nameRu: "Тойота", nameTk: "Toýota", nameEn: "Toyota" },
        "admin-1",
      ),
    ).rejects.toThrow(ConflictException);
  });

  it("writes an audit log entry", async () => {
    const uc = makeUseCase(brandRepo, audit);
    const result = await uc.execute(
      { slug: "toyota", nameRu: "Тойота", nameTk: "Toýota", nameEn: "Toyota" },
      "admin-1",
    );

    expect(audit.entries).toHaveLength(1);
    expect(audit.entries[0]).toMatchObject({
      actorId: "admin-1",
      action: "CATALOG_BRAND_CREATE",
      targetType: "Brand",
      targetId: result.id,
    });
  });

  it("invalidates the catalog search index", async () => {
    const searchIndex = new FakeSearchIndex();
    const uc = makeUseCase(brandRepo, audit, searchIndex);
    await uc.execute(
      { slug: "toyota", nameRu: "Тойота", nameTk: "Toýota", nameEn: "Toyota" },
      "admin-1",
    );

    expect(searchIndex.invalidated).toBe(true);
  });
});
