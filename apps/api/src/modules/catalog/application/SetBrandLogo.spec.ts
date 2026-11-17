import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BadRequestException, NotFoundException } from "@nestjs/common";

import type { Brand } from "../domain/Brand";
import type {
  BrandLogoRepository,
  LogoKeyReplacement,
} from "../domain/ports/BrandLogoRepository";
import type { LogoImageProcessor } from "../domain/ports/LogoImageProcessor";

import { FakeBrandLogoStorage as FakeStorage } from "./testing/FakeBrandLogoStorage";
import { FakeCatalogAuditLog } from "./testing/FakeCatalogAuditLog";
import { SetBrandLogo } from "./SetBrandLogo";

const PENDING = "pending/brands/toyota/0f8fad5b-d9cb-469f-a165-70867728950e";

class FakeBrands implements BrandLogoRepository {
  brands = new Map<string, Brand>();
  failNextSet = false;

  actualPreviousKey: string | null | undefined;

  vanishOnSet = false;
  swaps: Array<{ id: string; logoKey: string | null }> = [];

  async getBrandById(id: string): Promise<Brand | null> {
    return this.brands.get(id) ?? null;
  }

  async replaceLogoKey(id: string, logoKey: string | null): Promise<LogoKeyReplacement> {
    if (this.failNextSet) throw new Error("db down");
    const brand = this.brands.get(id);
    if (!brand || this.vanishOnSet) return { replaced: false, reason: "not-found" };
    this.swaps.push({ id, logoKey });
    const previousKey =
      this.actualPreviousKey === undefined ? (brand.logoKey ?? null) : this.actualPreviousKey;
    brand.logoKey = logoKey;
    return { replaced: true, previousKey };
  }
}

class FakeImages implements LogoImageProcessor {
  probed: { format: string; width: number; height: number } | null = {
    format: "png",
    width: 90,
    height: 90,
  };
  rasterized: number[] = [];

  async probe(): Promise<{ format: string; width: number; height: number } | null> {
    return this.probed;
  }

  async rasterizeSvg(_bytes: Uint8Array, size: number): Promise<Uint8Array> {
    this.rasterized.push(size);
    return new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
  }
}

const bytes = (n = 100) => new Uint8Array(n).fill(1);

describe("SetBrandLogo", () => {
  let brands: FakeBrands;
  let storage: FakeStorage;
  let images: FakeImages;
  let audit: FakeCatalogAuditLog;
  let useCase: SetBrandLogo;

  const upload = (contentType: string, data: Uint8Array = bytes()) =>
    storage.objects.set(PENDING, { bytes: data, contentType });

  const logoObjects = () => [...storage.objects.keys()].filter((k) => k.startsWith("brands/"));

  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    brands = new FakeBrands();
    storage = new FakeStorage();
    images = new FakeImages();
    audit = new FakeCatalogAuditLog();
    brands.brands.set("b1", {
      id: "b1",
      slug: "toyota",
      nameRu: "Тойота",
      nameTk: "Toýota",
      nameEn: "Toyota",
      logoKey: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    useCase = new SetBrandLogo(
      brands,
      storage,
      images,
      audit,
    );
  });

  it("stores the upload under a versioned key, points the brand at it, and audits", async () => {
    upload("image/png");

    const result = await useCase.execute({ brandId: "b1", key: PENDING }, "admin-1");

    const key = brands.brands.get("b1")!.logoKey!;
    expect(key).toMatch(/^brands\/toyota\/v\d+-[0-9a-f-]{36}\/logo\.png$/);
    expect(storage.objects.get(key)?.contentType).toBe("image/png");
    expect(storage.objects.has(PENDING)).toBe(false);
    expect(result).toEqual({ id: "b1", logoUrl: `https://media.example/catalog-assets/${key}` });
    expect(audit.entries[0]).toMatchObject({ action: "CATALOG_BRAND_LOGO_SET", targetId: "b1" });
  });

  it("keeps WebP as WebP", async () => {
    images.probed = { format: "webp", width: 60, height: 60 };
    upload("image/webp");

    await useCase.execute({ brandId: "b1", key: PENDING }, "admin-1");

    expect(brands.brands.get("b1")!.logoKey).toMatch(/logo\.webp$/);
  });

  it("renders an SVG to PNG so no SVG is stored", async () => {
    images.probed = { format: "svg", width: 24, height: 24 };
    upload("image/svg+xml", new TextEncoder().encode('<svg><path d="M0 0h1v1z"/></svg>'));

    await useCase.execute({ brandId: "b1", key: PENDING }, "admin-1");

    const key = brands.brands.get("b1")!.logoKey!;
    expect(key).toMatch(/logo\.png$/);
    expect(storage.objects.get(key)?.contentType).toBe("image/png");
    expect(images.rasterized).toEqual([256]);
  });

  it("gives two uploads in the same millisecond distinct activation directories", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_790_000_000_000);
    upload("image/png");
    await useCase.execute({ brandId: "b1", key: PENDING }, "admin-1");
    const first = brands.brands.get("b1")!.logoKey!;
    upload("image/png");
    await useCase.execute({ brandId: "b1", key: PENDING }, "admin-1");
    const second = brands.brands.get("b1")!.logoKey!;

    expect(first).toMatch(/^brands\/toyota\/v1790000000000-[0-9a-f-]{36}\/logo\.png$/);
    expect(second).toMatch(/^brands\/toyota\/v1790000000000-[0-9a-f-]{36}\/logo\.png$/);
    expect(second).not.toBe(first);
  });

  it("deletes the whole previous version directory when replacing a logo", async () => {
    const previous = "brands/toyota/imp-0123456789ab-0f8fad5b-d9cb-469f-a165-70867728950e/logo.png";
    brands.brands.get("b1")!.logoKey = previous;
    for (const file of ["logo.png", "mono@1x.png", "mono@2x.png", "mono@3x.png"]) {
      storage.objects.set(previous.replace("logo.png", file), { bytes: bytes(), contentType: "image/png" });
    }
    storage.objects.set("brands/toyota/imp-ffffffffffff/logo.png", { bytes: bytes(), contentType: "image/png" });
    upload("image/png");

    await useCase.execute({ brandId: "b1", key: PENDING }, "admin-1");

    expect(storage.deletedVersions).toEqual([previous]);
    expect([...storage.objects.keys()].filter((k) => k.includes("imp-0123456789ab"))).toEqual([]);
    expect(storage.objects.has("brands/toyota/imp-ffffffffffff/logo.png")).toBe(true);
    expect(logoObjects()).toHaveLength(2);
  });

  it("cleans the key the atomic swap returned, not the one read earlier", async () => {
    brands.brands.get("b1")!.logoKey = "brands/toyota/v1/logo.png";
    brands.actualPreviousKey = "brands/toyota/v2-0f8fad5b-d9cb-469f-a165-70867728950e/logo.png";
    upload("image/png");

    await useCase.execute({ brandId: "b1", key: PENDING }, "admin-1");

    expect(storage.deletedVersions).toEqual([brands.actualPreviousKey]);
  });

  it("cleans nothing when the swap found no previous logo", async () => {
    brands.brands.get("b1")!.logoKey = "brands/toyota/v1/logo.png";
    brands.actualPreviousKey = null;
    upload("image/png");

    await useCase.execute({ brandId: "b1", key: PENDING }, "admin-1");

    expect(storage.deletedVersions).toEqual([]);
  });

  it("keeps the new logo when deleting the previous directory fails", async () => {
    brands.brands.get("b1")!.logoKey = "brands/toyota/v1/logo.png";
    upload("image/png");
    storage.failDeleteVersion = true;

    await useCase.execute({ brandId: "b1", key: PENDING }, "admin-1");

    expect(brands.brands.get("b1")!.logoKey).not.toBe("brands/toyota/v1/logo.png");
    expect(audit.entries).toHaveLength(1);
  });

  it("retains the uploaded logo and the previous directory when the swap outcome is unknown", async () => {
    brands.brands.get("b1")!.logoKey = "brands/toyota/v1/logo.png";
    storage.objects.set("brands/toyota/v1/logo.png", { bytes: bytes(), contentType: "image/png" });
    upload("image/png");
    brands.failNextSet = true;

    await expect(useCase.execute({ brandId: "b1", key: PENDING }, "admin-1")).rejects.toThrow(
      "db down",
    );


    expect(logoObjects().filter((k) => !k.endsWith("/v1/logo.png"))).toHaveLength(1);
    expect(storage.deletedVersions).toEqual([]);
    expect(storage.objects.has("brands/toyota/v1/logo.png")).toBe(true);
  });

  it("deletes the uploaded logo only when the repository reports the brand was not updated", async () => {
    upload("image/png");
    brands.vanishOnSet = true;

    await expect(useCase.execute({ brandId: "b1", key: PENDING }, "admin-1")).rejects.toThrow(
      NotFoundException,
    );

    expect(logoObjects()).toEqual([]);
    expect(audit.entries).toEqual([]);
  });

  it("throws NotFoundException for an unknown brand", async () => {
    await expect(useCase.execute({ brandId: "nope", key: PENDING }, "admin-1")).rejects.toThrow(
      NotFoundException,
    );
  });

  it.each([
    ["a key outside the brand's pending area", "brands/toyota/v1/logo.png", null, "LOGO_UPLOAD_MISSING"],
    ["another brand's pending key", "pending/brands/bmw/0f8fad5b-d9cb-469f-a165-70867728950e", null, "LOGO_UPLOAD_MISSING"],
  ])("rejects %s", async (_name, key, _unused, reason) => {
    const error = await useCase.execute({ brandId: "b1", key }, "admin-1").catch((e: unknown) => e);
    expect((error as BadRequestException).getResponse()).toMatchObject({
      code: "VALIDATION_FAILED",
      details: { reason },
    });
  });

  it.each([
    ["a missing upload", null, null, null, "LOGO_UPLOAD_MISSING"],
    ["an oversized upload", "image/png", bytes(200 * 1024 + 1), null, "LOGO_TOO_LARGE"],
    ["an unsupported type", "image/jpeg", bytes(), null, "LOGO_UNSUPPORTED_TYPE"],
    ["an empty file", "image/png", bytes(0), null, "LOGO_EMPTY"],
    ["undecodable bytes", "image/png", bytes(), "unreadable", "LOGO_UNREADABLE"],
    ["a mismatched type", "image/webp", bytes(), { format: "png", width: 90, height: 90 }, "LOGO_TYPE_MISMATCH"],
    ["an elongated image", "image/png", bytes(), { format: "png", width: 300, height: 90 }, "LOGO_NOT_SQUARE"],
    [
      "an unsafe SVG",
      "image/svg+xml",
      new TextEncoder().encode('<svg xmlns:s="http://www.w3.org/2000/svg"><s:script>alert(1)</s:script></svg>'),
      { format: "svg", width: 24, height: 24 },
      "LOGO_UNSAFE_SVG",
    ],
  ] as const)("rejects %s and deletes the pending upload", async (_name, type, data, probed, reason) => {
    if (type && data) upload(type, data);
    if (probed === "unreadable") images.probed = null;
    else if (probed) images.probed = { ...probed };

    const error = await useCase
      .execute({ brandId: "b1", key: PENDING }, "admin-1")
      .catch((err: unknown) => err);

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toMatchObject({
      code: "VALIDATION_FAILED",
      details: { reason },
    });
    expect(storage.objects.size).toBe(0);
    expect(brands.brands.get("b1")!.logoKey).toBeNull();
    expect(images.rasterized).toEqual([]);
  });
});
