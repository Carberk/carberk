import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import { useIsFocused } from "expo-router";

import { apiClient } from "../../api/client";

import { listingViewInstallId, listingViewsEnabled } from "./listingViewIdentity";

/** Only the full detail route calls this, never a query, preview or contact CTA. */
export function useListingViewSignal(listingId: string | undefined, eligible: boolean) {
  const focused = useIsFocused();
  const visit = useRef({ listingId, sent: false });
  if (!focused || visit.current.listingId !== listingId) visit.current = { listingId, sent: false };

  useEffect(() => {
    if (!listingViewsEnabled() || !focused || !listingId || !eligible || visit.current.sent) return;
    let current = true;
    let epoch = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const cancel = () => { epoch += 1; current = false; clearTimeout(timer); };
    const start = () => {
      current = true;
      if (visit.current.sent) return;
      const started = epoch;
      timer = setTimeout(() => {
        void listingViewInstallId().then(async (id) => {
          if (!current || started !== epoch || visit.current.sent || AppState.currentState !== "active") return;
          visit.current.sent = true;
          await apiClient.post(`/listings/${listingId}/views`, undefined, undefined, {
            headers: { "x-app-install-id": id },
            // A token refresh must not send a signal after the reader has left.
            assertSession: async () => {
              if (!current || started !== epoch || AppState.currentState !== "active") throw new Error("View visit ended");
            },
          });
        }).catch(() => { /* Best effort. Reading never depends on counting. */ });
      }, 2000);
    };
    if (AppState.currentState === "active") start();
    const subscription = AppState.addEventListener("change", (state) => {
      cancel();
      if (state === "active") start();
    });
    return () => { cancel(); subscription.remove(); };
  }, [listingId, eligible, focused]);
}
