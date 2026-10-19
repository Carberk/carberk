import { Enums, type ListingsSchemas } from "@auto-tm/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as Linking from "expo-linking";

import { listingDetailQueryOptions } from "../../api/listings/useListingDetail";

/** The phone Listing detail's Call dials, or undefined when detail would not offer Call. */
export function callablePhone(detail: ListingsSchemas.ListingDetail): string | undefined {
  const closed = detail.status === Enums.ListingStatus.Sold || detail.status === Enums.ListingStatus.Archived;
  return detail.allowCalls && detail.contactPhone && !closed ? detail.contactPhone : undefined;
}

/**
 * Call on a Results card. A feed item never carries the contact phone, so a
 * tap reads it through the Listing detail query (same key and request as the
 * detail screen, which it warms) and then opens the dialer exactly as
 * detail's Call does. Like detail, Call needs no sign-in. If detail no longer
 * offers Call, nothing is dialled.
 */
export function useListingCall(listingId: string) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: async () => {
      const phone = callablePhone(await queryClient.fetchQuery(listingDetailQueryOptions(listingId)));
      if (!phone) return;
      const url = `tel:${phone}`;
      if (await Linking.canOpenURL(url)) await Linking.openURL(url);
    },
  });
  return {
    call: () => { if (!mutation.isPending) mutation.mutate(); },
    isPending: mutation.isPending,
    error: mutation.error,
    retry: () => mutation.mutate(),
  };
}
