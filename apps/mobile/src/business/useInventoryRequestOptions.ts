import { peekAuthSession } from "../auth/sessionSnapshot";
import { loadAuthSession } from "../auth/session";
import { ApiError } from "../api/client";

/** A queued save/upload cannot start or retry as a different signed-in User. */
export function useInventoryRequestOptions(businessId?: string) {
  const userId = peekAuthSession()?.user.id;
  const headers: Record<string, string> = businessId ? { "x-business-id": businessId } : {};
  return {
    headers,
    assertSession: async () => {
      const current = await loadAuthSession();
      if (!userId || current?.user.id !== userId) throw new ApiError("FORBIDDEN", 403, "Inventory session changed", { reason: "BUSINESS_CONTEXT_CHANGED" });
    },
  };
}
