import { ListingsSchemas } from "@auto-tm/contracts";

import type { ListingFilter } from "./useListingFilters";

export const RESULTS_FILTER_KEYS = ["brandId", "modelIds", "modelId", "cityId", "priceMin", "priceMax", "yearMin", "yearMax", "condition", "sellerType", "sort"] as const;
export type ResultsRouteState = Partial<Record<typeof RESULTS_FILTER_KEYS[number], string | string[]>>;
const one = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;

/** Route search parameters persist the applied Results search across Back and links. */
export function readResultsRouteState(params: ResultsRouteState): ListingFilter {
  const filters: ListingFilter = { sort: ListingsSchemas.FeedSortSchema.safeParse(one(params.sort)).data ?? "newest" };
  for (const key of ["brandId", "cityId"] as const) {
    const value = one(params[key]);
    if (value) filters[key] = value;
  }
  if (filters.brandId) {
    const modelIds = (one(params.modelIds) ?? one(params.modelId) ?? "").split(",").filter(Boolean);
    if (modelIds.length) filters.modelIds = [...new Set(modelIds)];
  }
  for (const key of ["priceMin", "priceMax", "yearMin", "yearMax"] as const) {
    const raw = one(params[key]);
    const number = Number(raw);
    if (raw && Number.isFinite(number) && number > 0 && (!key.startsWith("year") || (Number.isInteger(number) && number >= 1900 && number <= 2100))) filters[key] = number;
  }
  const sellerType = one(params.sellerType);
  if (sellerType === "personal" || sellerType === "business") filters.sellerType = sellerType;
  const condition = one(params.condition);
  if (condition === "new" || condition === "used") filters.condition = condition;
  return filters;
}

export function writeResultsRouteState(filters: ListingFilter): Record<string, string | undefined> {
  return Object.fromEntries(RESULTS_FILTER_KEYS.map((key) => {
    const value = key === "sort" ? filters.sort ?? "newest" : filters[key];
    return [key, Array.isArray(value) ? value.join(",") : value == null ? undefined : String(value)];
  }));
}

/** Public Results origin carried by picker routes. Ignore malformed/deferred inputs. */
export function readPickerResultsFilters(params: { returnToResults?: string | string[]; resultsState?: string | string[] }): ListingFilter | undefined {
  if (one(params.returnToResults) !== "1") return undefined;
  try {
    const raw: unknown = JSON.parse(one(params.resultsState) ?? "{}");
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
    const strings = Object.fromEntries(Object.entries(raw).filter(([, value]) => typeof value === "string"));
    return readResultsRouteState(strings);
  } catch { return undefined; }
}
