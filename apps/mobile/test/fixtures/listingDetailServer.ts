import { http, HttpResponse } from "msw";
import type { ListingsSchemas } from "@auto-tm/contracts";

import { server } from "../msw";

import { fixture, mediaFixture, summaryFixture } from "./listing";

// Unlike component-only fixtures, HTTP payloads pass the shared UUID schemas.
const id = (suffix: number) => `00000000-0000-4000-8000-${String(suffix).padStart(12, "0")}`;
export const catalogIds = {
  brandId: id(101), modelId: id(102), generationId: id(103), regionId: id(104), cityId: id(105),
  transmissionId: id(106), engineTypeId: id(107), driveTypeId: id(108), bodyTypeId: id(109), colorId: id(110),
};

export function detailPayload(updates: Partial<ListingsSchemas.ListingDetail> = {}) {
  return fixture({
    ...catalogIds, media: mediaFixture(3), mileageKm: 12000, condition: "used", enginePower: 150,
    acceptsExchange: true, installmentAvailable: true, vin: "JTDKB20U793456789", ...updates,
  });
}

export function cardPayload(updates: Partial<ListingsSchemas.FeedListingSummary> = {}): ListingsSchemas.FeedListingSummary {
  return {
    ...summaryFixture(), ...catalogIds, photoCount: 3, enginePower: 150, hasVin: true,
    acceptsExchange: true, installmentAvailable: true, allowCalls: true, allowChat: true, hasContactPhone: true,
    ...updates,
  };
}

/** One MSW boundary for the feed card, delayed detail and its catalog names. */
export function listingDetailServer(card: ListingsSchemas.FeedListingSummary, detail: ListingsSchemas.ListingDetail) {
  let releaseDetail!: () => void;
  const ready = new Promise<void>((resolve) => { releaseDetail = resolve; });
  const page = (items: unknown[]) => HttpResponse.json({ items, nextCursor: null, hasMore: false });
  server.use(
    http.get("*/listings", () => HttpResponse.json({ items: [card], nextCursor: null })),
    http.get("*/listings/:id", async () => { await ready; return HttpResponse.json(detail); }),
    http.get("*/config", () => HttpResponse.json({ reportEntryEnabled: true, adminModerationActionsEnabled: false, inspectionInterestEnabled: false })),
    http.get("*/public-diagnostics/listings", () => HttpResponse.json([])),
    http.get("*/catalog/brands", () => page([{ id: catalogIds.brandId, name: "Toyota", slug: "toyota" }])),
    http.get(`*/catalog/brands/${catalogIds.brandId}/models`, () => page([{ id: catalogIds.modelId, name: "Camry", slug: "camry", brandId: catalogIds.brandId }])),
    http.get(`*/catalog/models/${catalogIds.modelId}/generations`, () => page([{ id: catalogIds.generationId, name: "XV70", modelId: catalogIds.modelId }])),
    http.get("*/catalog/regions", () => page([{ id: catalogIds.regionId, name: "Ahal", slug: "ahal" }])),
    http.get(`*/catalog/regions/${catalogIds.regionId}/cities`, () => page([{ id: catalogIds.cityId, name: "Ashgabat", slug: "ashgabat", regionId: catalogIds.regionId }])),
    ...([
      ["transmissions", catalogIds.transmissionId, "Automatic"],
      ["engine-types", catalogIds.engineTypeId, "Petrol"],
      ["drive-types", catalogIds.driveTypeId, "Front wheel"],
      ["body-types", catalogIds.bodyTypeId, "Sedan"],
      ["colors", catalogIds.colorId, "White"],
    ] as const).map(([path, key, name]) => http.get(`*/catalog/${path}`, () => page([{ id: key, name }]))),
  );
  return { releaseDetail };
}
