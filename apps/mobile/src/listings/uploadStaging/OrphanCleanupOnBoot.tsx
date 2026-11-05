import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { ListingsSchemas } from "@auto-tm/contracts";
import type { ZodSchema } from "zod";

import { apiClient } from "../../api/client";
import { queryKeys } from "../../api/queryKeys";
import { loadAuthSession } from "../../auth/session";
import { useAuth } from "../../auth/useAuth";

import { cleanupOrphanDraftDirs } from "./orphanCleanup";

type OwnerPage = { items: { id: string }[]; nextCursor: string | null };

async function allOwnerIds(path: string, schema: ZodSchema<OwnerPage>, assertSession: () => Promise<void>) {
  const ids = new Set<string>();
  const seenCursors = new Set<string>();
  let cursor: string | null = null;
  do {
    const params = new URLSearchParams({ limit: "50" });
    if (cursor !== null) params.set("cursor", cursor);
    const page = await apiClient.get(`${path}?${params}`, schema, { assertSession });
    page.items.forEach(item => ids.add(item.id));
    cursor = page.nextCursor;
    if (cursor !== null) {
      if (seenCursors.has(cursor)) throw new Error("Incomplete staging-owner pagination");
      seenCursors.add(cursor);
    }
  } while (cursor !== null);
  return ids;
}

function AuthenticatedOrphanCleanup({ userId }: { userId: string }) {
  const owners = useQuery({
    queryKey: queryKeys.listings.stagingOwners(userId),
    queryFn: async () => {
      const assertSession = async () => {
        if ((await loadAuthSession())?.user.id !== userId) throw new Error("Staging cleanup session changed");
      };
      const [draftIds, listingIds] = await Promise.all([
        allOwnerIds("/me/drafts", ListingsSchemas.MyDraftsResponseSchema, assertSession),
        allOwnerIds("/me/listings", ListingsSchemas.MyListingsResponseSchema, assertSession),
      ]);
      return { draftIds, listingIds };
    },
    retry: false,
    staleTime: 0,
    gcTime: 0,
  });
  const cleanupRan = useRef(false);

  useEffect(() => {
    if (cleanupRan.current || !owners.isSuccess || owners.isFetching) return;
    cleanupRan.current = true;
    const { draftIds, listingIds } = owners.data;
    void (async () => {
      if ((await loadAuthSession())?.user.id !== userId) return;
      await cleanupOrphanDraftDirs(draftIds, listingIds);
    })().catch((error) => {
      console.warn("Failed to clean listing staging dirs", error);
    });
  }, [owners.data, owners.isSuccess, owners.isFetching, userId]);

  return null;
}

export function OrphanCleanupOnBoot() {
  const { isAuthenticated, userId } = useAuth();
  if (isAuthenticated !== true || userId === null) return null;
  return <AuthenticatedOrphanCleanup key={userId} userId={userId} />;
}
