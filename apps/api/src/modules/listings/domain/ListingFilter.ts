import { DomainError, LISTING_ERROR_CODES, type ListingFilterCriteria } from "./types";

export class ListingFilter {
  private constructor(private readonly criteria: ListingFilterCriteria) {}

  static create(criteria: ListingFilterCriteria): ListingFilter {
    if (criteria.priceMin !== undefined && criteria.priceMax !== undefined && criteria.priceMin > criteria.priceMax) {
      throw new DomainError(
        LISTING_ERROR_CODES.INVALID_PRICE,
        "priceMin cannot be greater than priceMax",
      );
    }

    if (criteria.yearMin !== undefined && criteria.yearMax !== undefined && criteria.yearMin > criteria.yearMax) {
      throw new DomainError(
        LISTING_ERROR_CODES.INVALID_FILTER_RANGE,
        "yearMin cannot be greater than yearMax",
      );
    }

    if (criteria.condition !== undefined && criteria.condition !== "new" && criteria.condition !== "used") {
      throw new DomainError(
        LISTING_ERROR_CODES.INVALID_FILTER_RANGE,
        "condition must be 'new' or 'used'",
      );
    }

    if (criteria.modelId !== undefined && criteria.modelIds !== undefined && criteria.modelIds.length > 0) {
      throw new DomainError(
        LISTING_ERROR_CODES.INVALID_FILTER_RANGE,
        "Cannot specify both modelId and modelIds",
      );
    }

    if (criteria.modelIds !== undefined && criteria.modelIds.length > 0 && !criteria.brandId) {
      throw new DomainError(
        LISTING_ERROR_CODES.INVALID_FILTER_RANGE,
        "modelIds requires brandId",
      );
    }

    if (criteria.sellerType !== undefined && criteria.sellerType !== "personal" && criteria.sellerType !== "business") {
      throw new DomainError(LISTING_ERROR_CODES.INVALID_FILTER_RANGE, "sellerType must be personal or business");
    }
    return new ListingFilter({ ...criteria });
  }

  toCriteria(): ListingFilterCriteria {
    return { ...this.criteria };
  }

  isEmpty(): boolean {
    return (
      this.criteria.brandId === undefined &&
      this.criteria.modelId === undefined &&
      (this.criteria.modelIds === undefined || this.criteria.modelIds.length === 0) &&
      this.criteria.cityId === undefined &&
      this.criteria.priceMin === undefined &&
      this.criteria.priceMax === undefined &&
      this.criteria.yearMin === undefined &&
      this.criteria.yearMax === undefined &&
      this.criteria.sellerType === undefined &&
      this.criteria.condition === undefined
    );
  }
}
