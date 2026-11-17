import { describe, it, expect, beforeEach } from "vitest";
import { NotFoundException, ConflictException } from "@nestjs/common";

import type { Brand } from "../domain/Brand";
import type { BrandRepository } from "../domain/ports/BrandRepository";

import { FakeBrandLogoStorage as FakeLogoStorage } from "./testing/FakeBrandLogoStorage";
import { FakeCatalogAuditLog } from "./testing/FakeCatalogAuditLog";
import { DeleteBrand } from "./DeleteBrand";
import type { CatalogSearchIndex } from "./CatalogSearchIndex";

class FakeSearchIndex {
  invalidated = false;
  invalidate(): void {
    this.invalidated = true;
  }
}

class FakeBrandRepository implements BrandRepository {
  brands: Brand[] = [];
  shouldThrowFkOnDelete = false;

  deletedLogoKey: string | null | undefined;
  vanishOnDelete = false;

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

  async delete(id: string): Promise<{ logoKey: string | null } | null> {
    if (this.shouldThrowFkOnDelete) {
      throw new Error("foreign key constraint violated");
    }
    const brand = this.brands.find((b) => b.id === id);
    if (!brand || this.vanishOnDelete) return null;
    return {
      logoKey: this.deletedLogoKey === undefined ? (brand.logoKey ?? null) : this.deletedLogoKey,
    };
  }
}

function makeUseCase(
  brandRepo?: FakeBrandRepository,
  audit?: FakeCatalogAuditLog,
  searchIndex?: FakeSearchIndex,
  logoStorage?: FakeLogoStorage,
) {
  return new DeleteBrand(
    brandRepo ?? new FakeBrandRepository(),
    audit ?? new FakeCatalogAuditLog(),
    (searchIndex ?? new FakeSearchIndex()) as unknown as CatalogSearchIndex,
    logoStorage ?? new FakeLogoStorage(),
  );
}

describe("DeleteBrand", () => {
  let brandRepo: FakeBrandRepository;
  let audit: FakeCatalogAuditLog;

  beforeEach(() => {
    brandRepo = new FakeBrandRepository();
    audit = new FakeCatalogAuditLog();
  });

  it("deletes a brand when it exists", async () => {
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
    await uc.execute({ id: "b1" }, "admin-1");

    expect(audit.entries).toHaveLength(1);
    expect(audit.entries[0]).toMatchObject({
      actorId: "admin-1",
      action: "CATALOG_BRAND_DELETE",
      targetType: "Brand",
      targetId: "b1",
    });
  });

  it("deletes the brand's logo version directory", async () => {
    brandRepo.brands.push({
      id: "b1",
      slug: "toyota",
      nameRu: "Тойота",
      nameTk: "Toýota",
      nameEn: "Toyota",
      logoKey: "brands/toyota/v1/logo.png",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const logoStorage = new FakeLogoStorage();

    await makeUseCase(brandRepo, audit, undefined, logoStorage).execute({ id: "b1" }, "admin-1");

    expect(logoStorage.deletedVersions).toEqual(["brands/toyota/v1/logo.png"]);
    expect(logoStorage.deleted).toEqual([]);
  });

  it("cleans the logo of the row the delete actually removed, not the earlier read", async () => {
    brandRepo.brands.push({
      id: "b1",
      slug: "toyota",
      nameRu: "Тойота",
      nameTk: "Toýota",
      nameEn: "Toyota",
      logoKey: "brands/toyota/v1/logo.png",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const concurrent = "brands/toyota/imp-0123456789ab-0f8fad5b-d9cb-469f-a165-70867728950e/logo.png";
    brandRepo.deletedLogoKey = concurrent;
    const logoStorage = new FakeLogoStorage();

    await makeUseCase(brandRepo, audit, undefined, logoStorage).execute({ id: "b1" }, "admin-1");

    expect(logoStorage.deletedVersions).toEqual([concurrent]);
  });

  it("cleans nothing when the deleted row had no logo", async () => {
    brandRepo.brands.push({
      id: "b1",
      slug: "toyota",
      nameRu: "Тойота",
      nameTk: "Toýota",
      nameEn: "Toyota",
      logoKey: "brands/toyota/v1/logo.png",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    brandRepo.deletedLogoKey = null;
    const logoStorage = new FakeLogoStorage();

    await makeUseCase(brandRepo, audit, undefined, logoStorage).execute({ id: "b1" }, "admin-1");

    expect(logoStorage.deletedVersions).toEqual([]);
  });

  it("keeps the deletion and its audit entry when storage cleanup fails", async () => {
    brandRepo.brands.push({
      id: "b1",
      slug: "toyota",
      nameRu: "Тойота",
      nameTk: "Toýota",
      nameEn: "Toyota",
      logoKey: "brands/toyota/v1/logo.png",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const logoStorage = new FakeLogoStorage();
    logoStorage.failDeleteVersion = true;

    await makeUseCase(brandRepo, audit, undefined, logoStorage).execute({ id: "b1" }, "admin-1");

    expect(audit.entries).toHaveLength(1);
  });

  it("throws NotFoundException and cleans nothing when the brand vanishes before the delete", async () => {
    brandRepo.brands.push({
      id: "b1",
      slug: "toyota",
      nameRu: "Тойота",
      nameTk: "Toýota",
      nameEn: "Toyota",
      logoKey: "brands/toyota/v1/logo.png",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    brandRepo.vanishOnDelete = true;
    const logoStorage = new FakeLogoStorage();

    await expect(
      makeUseCase(brandRepo, audit, undefined, logoStorage).execute({ id: "b1" }, "admin-1"),
    ).rejects.toThrow(NotFoundException);
    expect(logoStorage.deletedVersions).toEqual([]);
  });

  it("cleans nothing when a foreign key blocks the delete", async () => {
    brandRepo.brands.push({
      id: "b1",
      slug: "toyota",
      nameRu: "Тойота",
      nameTk: "Toýota",
      nameEn: "Toyota",
      logoKey: "brands/toyota/v1/logo.png",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    brandRepo.shouldThrowFkOnDelete = true;
    const logoStorage = new FakeLogoStorage();

    await expect(
      makeUseCase(brandRepo, audit, undefined, logoStorage).execute({ id: "b1" }, "admin-1"),
    ).rejects.toThrow(ConflictException);
    expect(logoStorage.deletedVersions).toEqual([]);
    expect(logoStorage.deleted).toEqual([]);
  });

  it("throws NotFoundException when brand does not exist", async () => {
    const uc = makeUseCase(brandRepo, audit);
    await expect(uc.execute({ id: "b1" }, "admin-1")).rejects.toThrow(
      NotFoundException,
    );
  });

  it("throws ConflictException when FK constraint prevents deletion", async () => {
    brandRepo.brands.push({
      id: "b1",
      slug: "toyota",
      nameRu: "Тойота",
      nameTk: "Toýota",
      nameEn: "Toyota",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    brandRepo.shouldThrowFkOnDelete = true;

    const uc = makeUseCase(brandRepo, audit);
    await expect(uc.execute({ id: "b1" }, "admin-1")).rejects.toThrow(
      ConflictException,
    );
  });

  it("invalidates the catalog search index after deletion", async () => {
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
    await uc.execute({ id: "b1" }, "admin-1");

    expect(searchIndex.invalidated).toBe(true);
  });
});
