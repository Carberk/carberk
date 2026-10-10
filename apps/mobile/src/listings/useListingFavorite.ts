import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { ListingsSchemas } from "@auto-tm/contracts";
import { router } from "expo-router";
import { useState } from "react";

import { queryKeys } from "../api/queryKeys";
import { setFeedFavorited } from "../api/listings/setFeedFavorited";
import { useFavoriteListing } from "../api/listings/useFavoriteListing";
import { useUnfavoriteListing } from "../api/listings/useUnfavoriteListing";
import {
  type AuthHref,
  useAuthIntentStore,
  useReplayAuthAction,
} from "../auth/intentStore";

interface UseListingFavoriteOptions {
  listingId: string;
  isFavorited: boolean;
  /** `null` while the session is still loading; taps are ignored then. */
  isAuthenticated: boolean | null;
  /** The screen sign-in returns to before finishing the ♡. */
  returnTo: AuthHref;
  /**
   * Finish a pending Favorite for this Listing here after sign-in. Listing
   * detail sets it; feed cards leave it to `useFeedFavoriteReplay`, because a
   * card may not be mounted when sign-in returns.
   */
  replayAfterSignIn?: boolean;
}

/** Writes a ♡ state into every cached copy a card or detail reads it from. */
function writeFavorited(queryClient: QueryClient, listingId: string, isFavorited: boolean) {
  setFeedFavorited(queryClient, listingId, isFavorited, { viewerOnly: true });
  queryClient.setQueryData<ListingsSchemas.ListingDetail>(
    queryKeys.listings.detail(listingId),
    (detail) => (detail ? { ...detail, isFavorited } : detail),
  );
}

/** One Listing's ♡ requests, shared by every ♡ on it so they go out one at a time. */
interface FavoriteQueue {
  /** The last tapped state. */
  target: boolean;
  /** What the server last confirmed. */
  confirmed: boolean;
  /** Settles once the server holds `target`, or a request failed. */
  done: Promise<void>;
}

const queues = new WeakMap<QueryClient, Map<string, FavoriteQueue>>();

/** Sends until the server holds the last tap; a failure drops queued taps. */
async function drain(
  queryClient: QueryClient,
  listingId: string,
  queue: FavoriteQueue,
  send: (favorited: boolean) => Promise<unknown>,
) {
  try {
    while (queue.target !== queue.confirmed) {
      const want = queue.target;
      try {
        await send(want);
        queue.confirmed = want;
      } catch {
        break;
      }
    }
  } finally {
    queues.get(queryClient)?.delete(listingId);
    writeFavorited(queryClient, listingId, queue.confirmed);
  }
}

/**
 * The ♡ on a Listing, shared by feed cards and Listing detail. Signed in, a
 * tap shows at once and is written into the cached feed pages and detail, so
 * every card of the Listing agrees. Taps never wait: the requests from every
 * ♡ of the Listing go out one at a time until the server holds the last
 * tapped state, and a failure puts
 * back what the server last confirmed. The ♡ shows the cached `isFavorited`
 * whenever nothing is in flight, so a refetch always corrects it. Signed out,
 * it opens sign-in with a pending Favorite that returns to `returnTo`. Taps
 * are ignored while the session is still loading.
 */
export function useListingFavorite({
  listingId,
  isFavorited,
  isAuthenticated,
  returnTo,
  replayAfterSignIn = false,
}: UseListingFavoriteOptions) {
  const queryClient = useQueryClient();
  const { mutateAsync: add } = useFavoriteListing();
  const { mutateAsync: remove } = useUnfavoriteListing();
  // The tapped state while this Listing's requests are in flight; null shows the cache.
  const [shown, setShown] = useState<boolean | null>(null);
  const favorited = shown ?? isFavorited;

  // Also the replay body: it must not re-check `isAuthenticated`, which is
  // refreshed asynchronously and is still false for a beat after sign-in,
  // while the API client already sends the new token.
  const setFavorited = (next: boolean) => {
    setShown(next);
    writeFavorited(queryClient, listingId, next);
    let byListing = queues.get(queryClient);
    if (!byListing) queues.set(queryClient, (byListing = new Map()));
    let queue = byListing.get(listingId);
    if (queue) {
      queue.target = next;
    } else {
      queue = { target: next, confirmed: isFavorited, done: Promise.resolve() };
      byListing.set(listingId, queue);
      queue.done = drain(queryClient, listingId, queue, (want) => (want ? add(listingId) : remove(listingId)));
    }
    void queue.done.then(() => setShown(null));
  };

  useReplayAuthAction("favorite", replayAfterSignIn ? listingId : undefined, () => setFavorited(true));

  const toggle = () => {
    if (isAuthenticated === false) {
      useAuthIntentStore.getState().requireSignIn(router, {
        returnTo,
        action: { kind: "favorite", listingId },
      });
      return;
    }
    if (isAuthenticated !== true) return;
    setFavorited(!favorited);
  };

  return { favorited, toggle };
}
