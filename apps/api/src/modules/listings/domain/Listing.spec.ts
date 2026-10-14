import { describe, it, expect } from "vitest";
import { Listing } from "./Listing";
import { LISTING_ERROR_CODES } from "./types";

function makeListing(
  overrides: Partial<{
    id: string;
    sellerId: string;
    status: import("./ListingStatus").ListingStatus;
    brandId: string;
    modelId: string;
    generationId?: string;
    year?: number;
    vin?: string;
    cityId: string;
    regionId?: string;
    priceAmount: number;
    priceCurrency: import("./types").Currency;
    contactPhone?: string;
    allowCalls: boolean;
    allowChat: boolean;
    publishedAt: Date;
    soldAt?: Date;
    deletedAt?: Date;
    condition?: "new" | "used";
    colorId?: string;
    bodyTypeId?: string;
    engineTypeId?: string;
    transmissionId?: string;
    driveTypeId?: string;
    enginePower?: number;
    mileageKm?: number;
    locationText?: string;
    description?: string;
    viewCount?: number;
    favoriteCount?: number;
    acceptsExchange?: boolean;
    installmentAvailable?: boolean;
    createdAt?: Date;
    updatedAt?: Date;
  }> = {},
): Listing {
  return Listing.create({
    id: "listing-1",
    publicNumber: 1,
    sellerId: "user-1",
    status: "active",
    brandId: "brand-1",
    modelId: "model-1",
    cityId: "city-1",
    priceAmount: 100000,
    priceCurrency: "TMT",
    allowCalls: true,
    allowChat: true,
    publishedAt: new Date("2026-05-17T12:00:00Z"),
    ...overrides,
  });
}

describe("Listing", () => {
  describe("constructor invariants", () => {
    it("throws CONTACT_METHOD_REQUIRED when both allowCalls and allowChat are false", () => {
      expect(() =>
        makeListing({ allowCalls: false, allowChat: false }),
      ).toThrowError(LISTING_ERROR_CODES.CONTACT_METHOD_REQUIRED);
    });

    it("allows creation when allowCalls is true and allowChat is false", () => {
      const listing = makeListing({ allowCalls: true, allowChat: false });
      expect(listing.allowCalls).toBe(true);
      expect(listing.allowChat).toBe(false);
    });

    it("allows creation when allowCalls is false and allowChat is true", () => {
      const listing = makeListing({ allowCalls: false, allowChat: true });
      expect(listing.allowCalls).toBe(false);
      expect(listing.allowChat).toBe(true);
    });
  });

  describe("canEditField", () => {
    it("returns false for locked fields", () => {
      const listing = makeListing();
      expect(listing.canEditField("brandId")).toBe(false);
      expect(listing.canEditField("modelId")).toBe(false);
      expect(listing.canEditField("generationId")).toBe(false);
      expect(listing.canEditField("year")).toBe(false);
      expect(listing.canEditField("vin")).toBe(false);
    });

    it("returns true for unlocked fields", () => {
      const listing = makeListing();
      expect(listing.canEditField("priceAmount")).toBe(true);
      expect(listing.canEditField("description")).toBe(true);
      expect(listing.canEditField("contactPhone")).toBe(true);
      expect(listing.canEditField("allowCalls")).toBe(true);
    });
  });

  describe("markSold", () => {
    it("transitions active → sold and sets soldAt", () => {
      const listing = makeListing({ status: "active" });
      const soldAt = new Date("2026-05-18T10:00:00Z");
      const sold = listing.markSold(soldAt);

      expect(sold.status).toBe("sold");
      expect(sold.soldAt).toEqual(soldAt);
      expect(sold.id).toBe(listing.id);
    });

    it("throws INVALID_TRANSITION when transitioning from sold", () => {
      const listing = makeListing({ status: "sold", soldAt: new Date() });
      expect(() => listing.markSold(new Date())).toThrowError(
        LISTING_ERROR_CODES.INVALID_TRANSITION,
      );
    });

    it("throws INVALID_TRANSITION when transitioning from archived", () => {
      const listing = makeListing({ status: "archived" });
      expect(() => listing.markSold(new Date())).toThrowError(
        LISTING_ERROR_CODES.INVALID_TRANSITION,
      );
    });
  });

  describe("archive", () => {
    it("transitions active → archived", () => {
      const listing = makeListing({ status: "active" });
      const archived = listing.archive();
      expect(archived.status).toBe("archived");
    });

    it("transitions sold → archived", () => {
      const listing = makeListing({ status: "sold", soldAt: new Date() });
      const archived = listing.archive();
      expect(archived.status).toBe("archived");
    });

    it("throws INVALID_TRANSITION when transitioning from archived", () => {
      const listing = makeListing({ status: "archived" });
      expect(() => listing.archive()).toThrowError(
        LISTING_ERROR_CODES.INVALID_TRANSITION,
      );
    });
  });

  describe("republish", () => {
    it("transitions archived → active and keeps the original publishedAt (#871)", () => {
      const firstPublishedAt = new Date("2026-05-01T08:00:00Z");
      const listing = makeListing({ status: "archived", publishedAt: firstPublishedAt });
      const relistedAt = new Date("2026-05-20T08:00:00Z");
      const republished = listing.republish(relistedAt);

      expect(republished.status).toBe("active");
      expect(republished.publishedAt).toEqual(firstPublishedAt);
      expect(republished.updatedAt).toEqual(relistedAt);
      expect(republished.soldAt).toBeUndefined();
    });

    it("throws INVALID_TRANSITION when transitioning from active", () => {
      const listing = makeListing({ status: "active" });
      expect(() => listing.republish(new Date())).toThrowError(
        LISTING_ERROR_CODES.INVALID_TRANSITION,
      );
    });

    it("throws INVALID_TRANSITION when transitioning from sold", () => {
      const listing = makeListing({ status: "sold", soldAt: new Date() });
      expect(() => listing.republish(new Date())).toThrowError(
        LISTING_ERROR_CODES.INVALID_TRANSITION,
      );
    });
  });

  describe("softDelete", () => {
    it("sets deletedAt while preserving status", () => {
      const listing = makeListing({ status: "active" });
      const deletedAt = new Date("2026-05-21T14:00:00Z");
      const deleted = listing.softDelete(deletedAt);

      expect(deleted.status).toBe("active");
      expect(deleted.deletedAt).toEqual(deletedAt);
    });
  });

  describe("banned status", () => {
    it("allows creation with banned status", () => {
      const listing = makeListing({ status: "banned" });
      expect(listing.status).toBe("banned");
    });

    it("throws INVALID_TRANSITION when markSold from banned", () => {
      const listing = makeListing({ status: "banned" });
      expect(() => listing.markSold(new Date())).toThrowError(
        LISTING_ERROR_CODES.INVALID_TRANSITION,
      );
    });

    it("throws INVALID_TRANSITION when archive from banned", () => {
      const listing = makeListing({ status: "banned" });
      expect(() => listing.archive()).toThrowError(
        LISTING_ERROR_CODES.INVALID_TRANSITION,
      );
    });

    it("throws INVALID_TRANSITION when republish from banned", () => {
      const listing = makeListing({ status: "banned" });
      expect(() => listing.republish(new Date())).toThrowError(
        LISTING_ERROR_CODES.INVALID_TRANSITION,
      );
    });
  });

  describe("immutability", () => {
    it("returns a new instance on markSold", () => {
      const listing = makeListing();
      const sold = listing.markSold(new Date());
      expect(sold).not.toBe(listing);
    });

    it("returns a new instance on archive", () => {
      const listing = makeListing();
      const archived = listing.archive();
      expect(archived).not.toBe(listing);
    });

    it("returns a new instance on republish", () => {
      const listing = makeListing({ status: "archived" });
      const republished = listing.republish(new Date());
      expect(republished).not.toBe(listing);
    });
  });
});
