import { beforeEach, describe, expect, it } from "vitest";
import { NotFoundException } from "@nestjs/common";

import type { Brand } from "../domain/Brand";
import type {
  BrandLogoRepository,
  LogoKeyReplacement,
} from "../domain/ports/BrandLogoRepository";

import { FakeBrandLogoStorage as FakeStorage } from "./testing/FakeBrandLogoStorage";
import { FakeCatalogAuditLog } from "./testing/FakeCatalogAuditLog";
import { RemoveBrandLogo } from "./RemoveBrandLogo";

class FakeBrands implements BrandLogoRepository {
  brands = new Map<string, Brand>();

  actualPreviousKey: string | null | undefined;
  vanishOnSwap = false;
  failNextSwap = false;

  async getBrandById(id: string): Promise<Brand | null> {
    return this.brands.get(id) ?? null;
  }

  async replaceLogoKey(id: string, logoKey: string | null): Promise<LogoKeyReplacement> {
    if (this.failNextSwap) throw new Error("db timeout");
    const brand = this.brands.get(id);
    if (!brand || this.vanishOnSwap) return { replaced: false, reason: "not-found" };
    const previousKey =
      this.actualPreviousKey === undefined ? (brand.logoKey ?? null) : this.actualPreviousKey;
    brand.logoKey = logoKey;
    return { replaced: true, previousKey };
  }
}

describe("RemoveBrandLogo", () => {
  let brands: FakeBrands;
  let storage: FakeStorage;
  let audit: FakeCatalogAuditLog;
  let useCase: RemoveBrandLogo;

  beforeEach(() => {
    brands = new FakeBrands();
    storage = new FakeStorage();
    audit = new FakeCatalogAuditLog();
    brands.brands.set("b1", {
      id: "b1",
      slug: "toyota",
      nameRu: "Тойота",
      nameTk: "Toýota",
      nameEn: "Toyota",
      logoKey: "brands/toyota/v1/logo.png",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    useCase = new RemoveBrandLogo(
      brands,
      storage,
      audit,
    );
  });

  it("clears the key, deletes the version directory, and audits", async () => {
    await useCase.execute({ brandId: "b1" }, "admin-1");

    expect(brands.brands.get("b1")!.logoKey).toBeNull();
    expect(storage.deletedVersions).toEqual(["brands/toyota/v1/logo.png"]);
    expect(storage.deleted).toEqual([]);
    expect(audit.entries[0]).toMatchObject({
      action: "CATALOG_BRAND_LOGO_REMOVE",
      targetId: "b1",
    });
  });

  it("cleans the imported version directory the atomic swap returned", async () => {
    const imported = "brands/toyota/imp-0123456789ab-0f8fad5b-d9cb-469f-a165-70867728950e/logo.png";
    brands.actualPreviousKey = imported;

    await useCase.execute({ brandId: "b1" }, "admin-1");

    expect(storage.deletedVersions).toEqual([imported]);
    expect(audit.entries[0]).toMatchObject({
      details: { previousLogoKey: imported },
    });
  });

  it("does nothing when a concurrent removal already cleared the logo", async () => {
    brands.actualPreviousKey = null;

    await useCase.execute({ brandId: "b1" }, "admin-1");

    expect(storage.deletedVersions).toEqual([]);
    expect(audit.entries).toEqual([]);
  });

  it("keeps the removal when storage cleanup fails", async () => {
    storage.failDeleteVersion = true;

    await useCase.execute({ brandId: "b1" }, "admin-1");

    expect(brands.brands.get("b1")!.logoKey).toBeNull();
    expect(audit.entries).toHaveLength(1);
  });

  it("deletes nothing when the swap outcome is unknown", async () => {
    brands.failNextSwap = true;

    await expect(useCase.execute({ brandId: "b1" }, "admin-1")).rejects.toThrow("db timeout");

    expect(storage.deletedVersions).toEqual([]);
    expect(storage.deleted).toEqual([]);
  });

  it("throws NotFoundException when the brand disappears before the swap", async () => {
    brands.vanishOnSwap = true;

    await expect(useCase.execute({ brandId: "b1" }, "admin-1")).rejects.toThrow(NotFoundException);
    expect(storage.deletedVersions).toEqual([]);
  });

  it("does nothing when the brand has no logo", async () => {
    brands.brands.get("b1")!.logoKey = null;
    await useCase.execute({ brandId: "b1" }, "admin-1");

    expect(storage.deleted).toEqual([]);
    expect(storage.deletedVersions).toEqual([]);
    expect(audit.entries).toEqual([]);
  });

  it("throws NotFoundException for an unknown brand", async () => {
    await expect(useCase.execute({ brandId: "nope" }, "admin-1")).rejects.toThrow(
      NotFoundException,
    );
  });
});
