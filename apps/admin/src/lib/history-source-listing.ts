import { ListingsSchemas } from "@auto-tm/contracts";

import { ApiError, apiPublicGet } from "./api-client";

/** The caller reauthorizes its current request; throwing discards the result. */
export type HistoryReadContinuation = () => Promise<void>;

const detail = ListingsSchemas.ListingDetailSchema;
const photo = ListingsSchemas.ListingMediaSchema;
const photoUrl = ListingsSchemas.MediaVariantSchema.shape.thumbnail.url().refine((value) => {
  if (!URL.canParse(value)) return false;
  const url = new URL(value);
  return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password;
});
const publicListing = detail.pick({
  id: true, publicNumber: true, status: true, brandId: true, modelId: true, generationId: true,
  year: true, vin: true, condition: true, mileageKm: true, colorId: true, bodyTypeId: true,
  transmissionId: true, driveTypeId: true, engineTypeId: true, enginePower: true,
  priceAmount: true, priceCurrency: true, displayPriceTmt: true, description: true,
  regionId: true, cityId: true, locationText: true, acceptsExchange: true, installmentAvailable: true,
  publishedAt: true, soldAt: true, createdAt: true, updatedAt: true,
}).extend({
  seller: detail.shape.seller.pick({
    displayName: true, nameNumber: true, avatarIndex: true, avatarKey: true, deleted: true, memberSince: true,
  }),
  media: photo.pick({
    id: true, kind: true, key: true, width: true, height: true, sortOrder: true, thumbHash: true,
  }).extend({
    kind: photo.shape.kind.refine((kind) => kind === "image"),
    key: photo.shape.key.min(1),
    variants: ListingsSchemas.MediaVariantSchema.pick({ thumbnail: true, list: true, detail: true, fullscreen: true })
      .extend({ thumbnail: photoUrl, list: photoUrl, detail: photoUrl, fullscreen: photoUrl }),
  }).array(),
  conditionDisclosure: ListingsSchemas.ConditionDisclosureSchema.pick({ damaged: true, knownIssuesText: true }).optional(),
  // Both decoder variants are explicit contract allowlists and strip extras.
  vinHistory: ListingsSchemas.VinHistorySchema.optional(),
});

export type HistorySourceListing = ReturnType<typeof publicListing.parse>;

/** Internal server reader only. A source ID conveys no History/private authority. */
export async function readHistorySourceListing(
  sourceId: string,
  afterRead: HistoryReadContinuation,
): Promise<HistorySourceListing> {
  if (!detail.shape.id.safeParse(sourceId).success) {
    throw new ApiError(400, "INVALID_SOURCE_LISTING", null, "Invalid source Listing");
  }
  let value: unknown;
  try {
    value = await apiPublicGet(`/listings/${sourceId}`);
  } finally {
    await afterRead();
  }
  const parsed = publicListing.safeParse(value);
  if (!parsed.success || parsed.data.id !== sourceId || !["active", "sold", "archived"].includes(parsed.data.status) ||
    new Set(parsed.data.media.map((item) => item.id)).size !== parsed.data.media.length) {
    throw new ApiError(502, "INVALID_PUBLIC_LISTING", null, "Public Listing unavailable");
  }
  return parsed.data;
}
