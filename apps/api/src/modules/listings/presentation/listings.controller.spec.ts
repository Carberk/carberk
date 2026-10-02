import { BadRequestException } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { describe, it, expect, beforeEach, vi } from "vitest";

import { ListingsController } from "./listings.controller";
import type { IdentityCheckPort } from "../../identity/identity.public";
import type { CountListings } from "../application/CountListings";
import type { CountListingModels } from "../application/CountListingModels";
import type { CountListingBrands } from "../application/CountListingBrands";
import type { ListFeed } from "../application/ListFeed";
import type { GetListingDetail } from "../application/GetListingDetail";
import type { PublishListing } from "../application/PublishListing";
import type { MarkSold } from "../application/MarkSold";
import type { ArchiveListing } from "../application/ArchiveListing";
import type { RepublishListing } from "../application/RepublishListing";
import type { DeleteListing } from "../application/DeleteListing";
import type { EditListing } from "../application/EditListing";
import type { AttachMedia } from "../application/AttachMedia";
import type { RemoveMedia } from "../application/RemoveMedia";
import type { ReorderMedia } from "../application/ReorderMedia";

function buildController(overrides: {
  countListings?: CountListings;
  countListingModels?: CountListingModels;
  countListingBrands?: CountListingBrands;
  listFeed?: ListFeed;
} = {}) {
  const identityCheck: IdentityCheckPort = {
    isSuspended: vi.fn().mockResolvedValue(false),
    isAdmin: vi.fn().mockResolvedValue(false),
    isInDealership: vi.fn().mockResolvedValue(false),
    isDeletionScheduled: vi.fn().mockResolvedValue(false),
  };

  return new ListingsController(
    {} as PublishListing,
    {} as MarkSold,
    {} as ArchiveListing,
    {} as RepublishListing,
    {} as DeleteListing,
    {} as EditListing,
    {} as AttachMedia,
    {} as RemoveMedia,
    {} as ReorderMedia,
    {} as GetListingDetail,
    overrides.listFeed ?? ({ execute: vi.fn() } as unknown as ListFeed),
    overrides.countListings ??
      ({ execute: vi.fn().mockResolvedValue({ totalMatching: 0 }) } as unknown as CountListings),
    overrides.countListingModels ??
      ({ execute: vi.fn().mockResolvedValue({ items: [] }) } as unknown as CountListingModels),
    overrides.countListingBrands ??
      ({ execute: vi.fn().mockResolvedValue({ items: [] }) } as unknown as CountListingBrands),
    identityCheck,
  );
}

describe("ListingsController filter validation", () => {
  it("accepts modelIds with brandId", async () => {
    const countListings = {
      execute: vi.fn().mockResolvedValue({ totalMatching: 7 }),
    } as unknown as CountListings;
    const controller = buildController({ countListings });

    const result = await controller.countListings({
      brandId: "550e8400-e29b-41d4-a716-446655440000",
      modelIds: [
        "550e8400-e29b-41d4-a716-446655440001",
        "550e8400-e29b-41d4-a716-446655440002",
      ],
    });

    expect(result.totalMatching).toBe(7);
    expect(countListings.execute).toHaveBeenCalledWith({
      filters: {
        brandId: "550e8400-e29b-41d4-a716-446655440000",
        modelIds: [
          "550e8400-e29b-41d4-a716-446655440001",
          "550e8400-e29b-41d4-a716-446655440002",
        ],
      },
    });
  });

  it("rejects modelIds without brandId", async () => {
    const controller = buildController();

    await expect(
      controller.countListings({
        modelIds: ["550e8400-e29b-41d4-a716-446655440001"],
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it("rejects both modelId and modelIds", async () => {
    const controller = buildController();

    await expect(
      controller.countListings({
        brandId: "550e8400-e29b-41d4-a716-446655440000",
        modelId: "550e8400-e29b-41d4-a716-446655440001",
        modelIds: ["550e8400-e29b-41d4-a716-446655440002"],
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it("forwards modelIds to the feed use-case", async () => {
    const listFeed = {
      execute: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
    } as unknown as ListFeed;
    const controller = buildController({ listFeed });

    await controller.listFeed(
      {
        brandId: "550e8400-e29b-41d4-a716-446655440000",
        modelIds: ["550e8400-e29b-41d4-a716-446655440001"],
      },
      {} as FastifyRequest,
    );

    expect(listFeed.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        filters: {
          brandId: "550e8400-e29b-41d4-a716-446655440000",
          modelIds: ["550e8400-e29b-41d4-a716-446655440001"],
        },
      }),
    );
    expect(listFeed.execute).toHaveBeenCalledWith(
      expect.not.objectContaining({ viewerId: expect.anything() }),
    );
  });

  it("forwards the signed-in viewer to the feed use-case", async () => {
    const listFeed = {
      execute: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
    } as unknown as ListFeed;
    const controller = buildController({ listFeed });

    await controller.listFeed({}, { user: { sub: "viewer-1" } } as unknown as FastifyRequest);

    expect(listFeed.execute).toHaveBeenCalledWith(
      expect.objectContaining({ viewerId: "viewer-1" }),
    );
  });
});

describe("ListingsController sort", () => {
  function feedSpy() {
    return {
      execute: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
    } as unknown as ListFeed;
  }

  it("defaults the feed to the newest order", async () => {
    const listFeed = feedSpy();
    await buildController({ listFeed }).listFeed({}, {} as FastifyRequest);

    expect(listFeed.execute).toHaveBeenCalledWith(expect.objectContaining({ sort: "newest" }));
  });

  it("forwards the requested order", async () => {
    const listFeed = feedSpy();
    await buildController({ listFeed }).listFeed({ sort: "price_desc" }, {} as FastifyRequest);

    expect(listFeed.execute).toHaveBeenCalledWith(
      expect.objectContaining({ sort: "price_desc" }),
    );
  });

  it("rejects an unknown feed order with a 400", async () => {
    await expect(
      buildController().listFeed({ sort: "best_deal" }, {} as FastifyRequest),
    ).rejects.toThrow(BadRequestException);
  });

  it("accepts sort on the count without passing it on as a filter", async () => {
    const countListings = {
      execute: vi.fn().mockResolvedValue({ totalMatching: 0, priceMinTmt: null, priceMaxTmt: null }),
    } as unknown as CountListings;
    await buildController({ countListings }).countListings({ sort: "year_asc" });

    expect(countListings.execute).toHaveBeenCalledWith({});
    await expect(
      buildController({ countListings }).countListings({ sort: "relevance" }),
    ).rejects.toThrow(BadRequestException);
  });
});

describe("ListingsController filter-options/brands", () => {
  it("calls CountListingBrands with scalar filters", async () => {
    const countListingBrands = {
      execute: vi.fn().mockResolvedValue({ items: [{ brandId: "b1", totalMatching: 4 }] }),
    } as unknown as CountListingBrands;
    const controller = buildController({ countListingBrands });

    const result = await controller.countBrands({
      cityId: "550e8400-e29b-41d4-a716-446655440010",
      yearMin: "2015",
    });

    expect(result).toEqual({ items: [{ brandId: "b1", totalMatching: 4 }] });
    expect(countListingBrands.execute).toHaveBeenCalledWith({
      filters: { cityId: "550e8400-e29b-41d4-a716-446655440010", yearMin: 2015 },
    });
  });

  it("rejects brand and model filters in the brand-count query", async () => {
    const controller = buildController();

    await expect(
      controller.countBrands({ brandId: "550e8400-e29b-41d4-a716-446655440000" }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      controller.countBrands({ modelId: "550e8400-e29b-41d4-a716-446655440001" }),
    ).rejects.toThrow(BadRequestException);
  });
});

describe("ListingsController filter-options/models", () => {
  it("calls CountListingModels with brandId and scalar filters", async () => {
    const countListingModels = {
      execute: vi.fn().mockResolvedValue({ items: [{ modelId: "m1", totalMatching: 3 }] }),
    } as unknown as CountListingModels;
    const controller = buildController({ countListingModels });

    const result = await controller.countModels({
      brandId: "550e8400-e29b-41d4-a716-446655440000",
      cityId: "550e8400-e29b-41d4-a716-446655440010",
      priceMin: "50000",
    });

    expect(result).toEqual({ items: [{ modelId: "m1", totalMatching: 3 }] });
    expect(countListingModels.execute).toHaveBeenCalledWith({
      brandId: "550e8400-e29b-41d4-a716-446655440000",
      filters: {
        brandId: "550e8400-e29b-41d4-a716-446655440000",
        cityId: "550e8400-e29b-41d4-a716-446655440010",
        priceMin: 50000,
      },
    });
  });

  it("rejects modelId in model-count query", async () => {
    const controller = buildController();

    await expect(
      controller.countModels({
        brandId: "550e8400-e29b-41d4-a716-446655440000",
        modelId: "550e8400-e29b-41d4-a716-446655440001",
      }),
    ).rejects.toThrow(BadRequestException);
  });
});
