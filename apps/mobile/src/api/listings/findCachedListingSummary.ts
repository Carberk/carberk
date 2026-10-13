import type { InfiniteData, QueryClient, QueryKey } from "@tanstack/react-query";
import type { ListingsSchemas } from "@auto-tm/contracts";

import { queryKeys } from "../queryKeys";

type ListingSummary = ListingsSchemas.ListingSummary;
/** A cached card: Feed and Favorites items also carry the contact preferences. */
export type CachedListingSummary = ListingSummary &
  Partial<Pick<ListingsSchemas.FeedListingSummary, "allowCalls" | "allowChat" | "hasContactPhone">>;
type SummaryPages = InfiniteData<{ items: CachedListingSummary[] }>;

/**
 * Every infinite list whose cards open Listing detail: the Home feed and
 * Results (one key family, whatever the filters or viewer), Favorites, and the
 * owner's My listings. Each page item is a `ListingSummary` (Favorites adds
 * contact fields on top).
 */
const CARD_LIST_KEYS: QueryKey[] = [
  queryKeys.listings.lists(),
  queryKeys.favorites.lists(),
  queryKeys.listings.myListingsInfinite(),
];

/**
 * The card a buyer tapped, found by Listing ID in the caches that already hold
 * it, or `undefined` when none does (a deep link, or a card that was evicted).
 * Reads the cache only; it never starts a request.
 */
export function findCachedListingSummary(
  queryClient: QueryClient,
  listingId: string,
): CachedListingSummary | undefined {
  for (const queryKey of CARD_LIST_KEYS) {
    for (const [, data] of queryClient.getQueriesData<SummaryPages>({ queryKey })) {
      for (const page of data?.pages ?? []) {
        const found = page.items.find((item) => item.id === listingId);
        if (found) return found;
      }
    }
  }
  return undefined;
}
