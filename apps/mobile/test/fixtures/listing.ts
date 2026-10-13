import type { ListingsSchemas } from "@auto-tm/contracts";

import type { CatalogMaps } from "../../src/listings/detail/useCatalogMaps";

export const maps: CatalogMaps = {
  brandName: () => "Toyota",
  modelName: () => "Camry",
  generationName: () => "XV70",
  colorName: () => "White",
  bodyTypeName: () => "Sedan",
  transmissionName: () => "Automatic",
  driveTypeName: () => "Front wheel",
  engineTypeName: () => "Petrol",
  regionName: () => "Ahal",
  cityName: () => "Ashgabat",
};
/** `count` photos in `sortOrder`, with the variants the media service returns. */
export const mediaFixture = (count: number): ListingsSchemas.ListingMedia[] =>
  Array.from({ length: count }, (_, index) => ({
    id: `00000000-0000-4000-8000-0000000003${String(index).padStart(2, "0")}`,
    kind: "image" as const,
    key: `listing-${index}/original.webp`,
    sortOrder: index,
    variants: {
      thumbnail: `https://media.test/${index}/thumbnail.webp?v=webp-natural-1`,
      list: `https://media.test/${index}/list.webp?v=webp-natural-1`,
      detail: `https://media.test/${index}/detail.webp?v=webp-natural-1`,
      fullscreen: `https://media.test/${index}/fullscreen.webp?v=webp-natural-1`,
    },
  }));

/** What a feed, Results, or Favorites card holds: the cached ListingSummary. */
export const summaryFixture = (
  updates: Partial<ListingsSchemas.ListingSummary> = {},
): ListingsSchemas.ListingSummary => ({
  id: "00000000-0000-4000-8000-000000000373",
  sellerId: "00000000-0000-4000-8000-000000000002",
  status: "active",
  brandId: "brand",
  modelId: "model",
  year: 2020,
  priceAmount: 10000,
  priceCurrency: "USD",
  displayPriceTmt: 35000,
  coverMediaKey: "listing-0/original.webp",
  photoKeys: ["listing-0/original.webp", "listing-1/original.webp"],
  photoCount: 12,
  mileageKm: 12000,
  condition: "used",
  transmissionId: "transmission",
  engineTypeId: "engine",
  cityId: "city",
  publishedAt: "2026-09-20T00:00:00Z",
  ...updates,
});

export const fixture = (
  updates: Partial<ListingsSchemas.ListingDetail> = {},
): ListingsSchemas.ListingDetail => ({
  id: "00000000-0000-4000-8000-000000000373",
  publicNumber: 373,
  sellerId: "00000000-0000-4000-8000-000000000002",
  seller: {
    displayName: "Merdan",
    nameNumber: 2057,
    avatarIndex: 7,
    avatarKey: null,
    deleted: false,
    memberSince: "2024-01-01T00:00:00Z",
  },
  status: "active",
  brandId: "brand",
  modelId: "model",
  generationId: "generation",
  year: 2020,
  regionId: "region",
  cityId: "city",
  priceAmount: 10000,
  priceCurrency: "USD",
  displayPriceTmt: 35000,
  allowCalls: true,
  allowChat: true,
  contactPhone: "+99361000000",
  acceptsExchange: false,
  installmentAvailable: false,
  media: [],
  viewCount: 19,
  favoriteCount: 4,
  publishedAt: "2026-09-20T00:00:00Z",
  createdAt: "2026-09-20T00:00:00Z",
  updatedAt: "2026-09-22T00:00:00Z",
  description: "One owner. Regular service. Ready for viewing.",
  conditionDisclosure: { damaged: false, knownIssuesText: "Small scratch" },
  ...updates,
});
