import { CatalogSchemas, ListingsSchemas } from "@auto-tm/contracts";

import { ApiError, apiPublicGet } from "./api-client";
import type { HistoryReadContinuation, HistorySourceListing } from "./history-source-listing";

type References = Pick<HistorySourceListing,
  "brandId" | "modelId" | "generationId" | "regionId" | "cityId" | "bodyTypeId" |
  "colorId" | "engineTypeId" | "transmissionId" | "driveTypeId">;
export type HistoryListingLabels = Partial<Record<
  "brand" | "model" | "generation" | "region" | "city" | "bodyType" |
  "color" | "engineType" | "transmission" | "driveType", string>>;

const id = ListingsSchemas.ListingDetailSchema.shape.id;
const cursorSchema = CatalogSchemas.BrandSummarySchema.pick({ id: true, name: true }).extend({ id });
const pagination = CatalogSchemas.BrandSummaryListResponseSchema.pick({ nextCursor: true, hasMore: true });

/** Missing references stay absent for localized caller fallback, never raw IDs. */
export async function resolveHistoryListingCatalog(
  listing: References,
  locale: "tk" | "ru" | "en",
  afterRead: HistoryReadContinuation,
): Promise<HistoryListingLabels> {
  const families = [
    ["brand", listing.brandId, "brands", CatalogSchemas.BrandSummarySchema.extend({ id }), true, undefined],
    ["model", listing.modelId, `brands/${listing.brandId}/models`, CatalogSchemas.ModelSummarySchema.extend({ id, brandId: id }), true, listing.brandId],
    ["generation", listing.generationId, `models/${listing.modelId}/generations`, CatalogSchemas.GenerationSummarySchema.extend({ id, modelId: id }), false, listing.modelId],
    ["region", listing.regionId, "regions", CatalogSchemas.RegionSummarySchema.extend({ id }), false, undefined],
    ["city", listing.cityId, `regions/${listing.regionId}/cities`, CatalogSchemas.CitySummarySchema.extend({ id, regionId: id }), true, listing.regionId],
    ["bodyType", listing.bodyTypeId, "body-types", CatalogSchemas.BodyTypeSummarySchema.extend({ id }), false, undefined],
    ["color", listing.colorId, "colors", CatalogSchemas.ColorSummarySchema.extend({ id }), false, undefined],
    ["engineType", listing.engineTypeId, "engine-types", CatalogSchemas.EngineTypeSummarySchema.extend({ id }), false, undefined],
    ["transmission", listing.transmissionId, "transmissions", CatalogSchemas.TransmissionSummarySchema.extend({ id }), false, undefined],
    ["driveType", listing.driveTypeId, "drive-types", CatalogSchemas.DriveTypeSummarySchema.extend({ id }), false, undefined],
  ] as const;
  const labels: HistoryListingLabels = {};
  for (const [field, target, path, schema, paged, parent] of families) {
    if (!target) continue;
    const items = new Map<string, string>();
    const cursors = new Set<string>();
    let cursor: string | null = null;
    do {
      const query = new URLSearchParams({ locale });
      if (paged) query.set("limit", "100");
      if (cursor) query.set("cursor", cursor);
      let value: unknown;
      try {
        value = await apiPublicGet(`/catalog/${path}?${query}`, locale);
      } finally {
        // Reauthorize every success, transport error and page before continuing.
        await afterRead();
      }
      try {
        if (!value || typeof value !== "object" || !("items" in value) || !Array.isArray(value.items)) throw new Error();
        const page = value.items.map((item) => schema.parse(item));
        for (const item of page) {
          const itemParent = "brandId" in item ? item.brandId : "modelId" in item ? item.modelId : "regionId" in item ? item.regionId : undefined;
          if (itemParent !== parent || items.has(item.id)) throw new Error();
          items.set(item.id, item.name.trim());
        }
        cursor = null;
        if (paged) {
          const result = pagination.parse(value);
          if (result.hasMore !== (result.nextCursor !== null)) throw new Error();
          cursor = result.nextCursor;
          if (cursor !== null) {
            const decoded = cursorSchema.parse(JSON.parse(Buffer.from(cursor, "base64").toString("utf8")));
            // API cursors identify the last row. New encodings of an old ID cannot advance.
            if (page.at(-1)?.id !== decoded.id || cursors.has(decoded.id)) throw new Error();
            cursors.add(decoded.id);
          }
        }
      } catch {
        throw new ApiError(502, "INVALID_PUBLIC_CATALOG", null, "Catalog unavailable");
      }
    } while (cursor !== null);
    const name = items.get(target);
    if (name && name !== target) labels[field] = name;
  }
  return labels;
}
