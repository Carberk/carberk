import type { ListingsSchemas } from "@auto-tm/contracts";

import { localeTag } from "../../i18n/resources";
import { ashgabatWallClock } from "../ashgabatTime";

import type { CatalogMaps } from "./useCatalogMaps";

export function listingTitle(
  listing: ListingsSchemas.ListingDetail,
  maps: CatalogMaps,
  generation = true,
) {
  const name = [
    maps.brandName(listing.brandId),
    maps.modelName(listing.modelId),
    generation && listing.generationId
      ? maps.generationName(listing.generationId)
      : undefined,
  ]
    .filter(Boolean)
    .join(" ");
  return [name, listing.year].filter(Boolean).join(", ");
}

/** A Listing date on detail, "12 Sep" or "3 Mar 2025" for another year, on the Ashgabat calendar. */
export function detailDate(iso: string | undefined, locale: string) {
  if (!iso) return undefined;
  const instant = new Date(iso);
  if (Number.isNaN(instant.getTime())) return undefined;
  const date = ashgabatWallClock(instant);
  const parts = new Intl.DateTimeFormat(localeTag(locale), {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
    ...(date.getUTCFullYear() !== ashgabatWallClock(new Date()).getUTCFullYear()
      ? ({ year: "numeric" } as const)
      : {}),
  }).formatToParts(date);
  return ["day", "month", "year"]
    .map((type) => parts.find((part) => part.type === type)?.value)
    .filter(Boolean)
    .join(" ");
}
