import { DomainError, LISTING_ERROR_CODES, LOCKED_FIELDS } from "./types";
import type { Currency, ConditionDisclosure } from "./types";
import { canTransition, type ListingStatus } from "./ListingStatus";

export class Listing {
  private constructor(
    readonly id: string,
    readonly sellerId: string,
    readonly status: ListingStatus,
    readonly brandId: string,
    readonly modelId: string,
    readonly generationId: string | undefined,
    readonly year: number | undefined,
    readonly vin: string | undefined,
    readonly cityId: string,
    readonly regionId: string | undefined,
    readonly priceAmount: number,
    readonly priceCurrency: Currency,
    readonly contactPhone: string | undefined,
    readonly allowCalls: boolean,
    readonly allowChat: boolean,
    readonly publishedAt: Date,
    readonly soldAt: Date | undefined,
    readonly deletedAt: Date | undefined,
    readonly condition: "new" | "used" | undefined,
    readonly colorId: string | undefined,
    readonly bodyTypeId: string | undefined,
    readonly engineTypeId: string | undefined,
    readonly transmissionId: string | undefined,
    readonly driveTypeId: string | undefined,
    readonly enginePower: number | undefined,
    readonly mileageKm: number | undefined,
    readonly locationText: string | undefined,
    readonly description: string | undefined,
    readonly viewCount: number,
    readonly favoriteCount: number,
    readonly acceptsExchange: boolean,
    readonly installmentAvailable: boolean,
    readonly coverMediaKey: string | undefined,
    readonly conditionDisclosure: ConditionDisclosure | undefined,
    readonly createdAt: Date,
    readonly updatedAt: Date,
    readonly publicNumber: number,
    readonly businessId?: string,
  ) {
    if (!allowCalls && !allowChat) {
      throw new DomainError(
        LISTING_ERROR_CODES.CONTACT_METHOD_REQUIRED,
        "allowCalls OR allowChat must be true",
      );
    }
  }

  static create(data: {
    businessId?: string | undefined;
    id: string;
    publicNumber: number;
    sellerId: string;
    status: ListingStatus;
    brandId: string;
    modelId: string;
    generationId?: string;
    year?: number;
    vin?: string;
    cityId: string;
    regionId?: string;
    priceAmount: number;
    priceCurrency: Currency;
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
    coverMediaKey?: string;
    conditionDisclosure?: ConditionDisclosure;
    createdAt?: Date;
    updatedAt?: Date;
  }): Listing {
    return new Listing(
      data.id,
      data.sellerId,
      data.status,
      data.brandId,
      data.modelId,
      data.generationId,
      data.year,
      data.vin,
      data.cityId,
      data.regionId,
      data.priceAmount,
      data.priceCurrency,
      data.contactPhone,
      data.allowCalls,
      data.allowChat,
      data.publishedAt,
      data.soldAt,
      data.deletedAt,
      data.condition,
      data.colorId,
      data.bodyTypeId,
      data.engineTypeId,
      data.transmissionId,
      data.driveTypeId,
      data.enginePower,
      data.mileageKm,
      data.locationText,
      data.description,
      data.viewCount ?? 0,
      data.favoriteCount ?? 0,
      data.acceptsExchange ?? false,
      data.installmentAvailable ?? false,
      data.coverMediaKey,
      data.conditionDisclosure,
      data.createdAt ?? new Date(),
      data.updatedAt ?? new Date(),
      data.publicNumber,
      data.businessId,
    );
  }

  canEditField(field: string): boolean {
    return !LOCKED_FIELDS.includes(field as (typeof LOCKED_FIELDS)[number]);
  }

  markSold(at: Date): Listing {
    if (!canTransition(this.status, "sold")) {
      throw new DomainError(
        LISTING_ERROR_CODES.INVALID_TRANSITION,
        `Cannot mark sold from ${this.status}`,
      );
    }
    return new Listing(
      this.id,
      this.sellerId,
      "sold",
      this.brandId,
      this.modelId,
      this.generationId,
      this.year,
      this.vin,
      this.cityId,
      this.regionId,
      this.priceAmount,
      this.priceCurrency,
      this.contactPhone,
      this.allowCalls,
      this.allowChat,
      this.publishedAt,
      at,
      this.deletedAt,
      this.condition,
      this.colorId,
      this.bodyTypeId,
      this.engineTypeId,
      this.transmissionId,
      this.driveTypeId,
      this.enginePower,
      this.mileageKm,
      this.locationText,
      this.description,
      this.viewCount,
      this.favoriteCount,
      this.acceptsExchange,
      this.installmentAvailable,
      this.coverMediaKey,
      this.conditionDisclosure,
      this.createdAt,
      new Date(),
      this.publicNumber,
      this.businessId,
    );
  }

  archive(): Listing {
    if (!canTransition(this.status, "archived")) {
      throw new DomainError(
        LISTING_ERROR_CODES.INVALID_TRANSITION,
        `Cannot archive from ${this.status}`,
      );
    }
    return new Listing(
      this.id,
      this.sellerId,
      "archived",
      this.brandId,
      this.modelId,
      this.generationId,
      this.year,
      this.vin,
      this.cityId,
      this.regionId,
      this.priceAmount,
      this.priceCurrency,
      this.contactPhone,
      this.allowCalls,
      this.allowChat,
      this.publishedAt,
      this.soldAt,
      this.deletedAt,
      this.condition,
      this.colorId,
      this.bodyTypeId,
      this.engineTypeId,
      this.transmissionId,
      this.driveTypeId,
      this.enginePower,
      this.mileageKm,
      this.locationText,
      this.description,
      this.viewCount,
      this.favoriteCount,
      this.acceptsExchange,
      this.installmentAvailable,
      this.coverMediaKey,
      this.conditionDisclosure,
      this.createdAt,
      new Date(),
      this.publicNumber,
      this.businessId,
    );
  }

  /**
   * Puts a removed Listing back on sale. It keeps its first `publishedAt`, so
   * relisting returns it to where that date places it in Newest instead of
   * bumping it to the top (#871); `at` becomes its `updatedAt`.
   */
  republish(at: Date): Listing {
    if (!canTransition(this.status, "active")) {
      throw new DomainError(
        LISTING_ERROR_CODES.INVALID_TRANSITION,
        `Cannot republish from ${this.status}`,
      );
    }
    return new Listing(
      this.id,
      this.sellerId,
      "active",
      this.brandId,
      this.modelId,
      this.generationId,
      this.year,
      this.vin,
      this.cityId,
      this.regionId,
      this.priceAmount,
      this.priceCurrency,
      this.contactPhone,
      this.allowCalls,
      this.allowChat,
      this.publishedAt,
      undefined,
      this.deletedAt,
      this.condition,
      this.colorId,
      this.bodyTypeId,
      this.engineTypeId,
      this.transmissionId,
      this.driveTypeId,
      this.enginePower,
      this.mileageKm,
      this.locationText,
      this.description,
      this.viewCount,
      this.favoriteCount,
      this.acceptsExchange,
      this.installmentAvailable,
      this.coverMediaKey,
      this.conditionDisclosure,
      this.createdAt,
      at,
      this.publicNumber,
      this.businessId,
    );
  }

  softDelete(at: Date): Listing {
    return new Listing(
      this.id,
      this.sellerId,
      this.status,
      this.brandId,
      this.modelId,
      this.generationId,
      this.year,
      this.vin,
      this.cityId,
      this.regionId,
      this.priceAmount,
      this.priceCurrency,
      this.contactPhone,
      this.allowCalls,
      this.allowChat,
      this.publishedAt,
      this.soldAt,
      at,
      this.condition,
      this.colorId,
      this.bodyTypeId,
      this.engineTypeId,
      this.transmissionId,
      this.driveTypeId,
      this.enginePower,
      this.mileageKm,
      this.locationText,
      this.description,
      this.viewCount,
      this.favoriteCount,
      this.acceptsExchange,
      this.installmentAvailable,
      this.coverMediaKey,
      this.conditionDisclosure,
      this.createdAt,
      new Date(),
      this.publicNumber,
      this.businessId,
    );
  }
}
