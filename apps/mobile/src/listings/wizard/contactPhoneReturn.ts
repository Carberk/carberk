import type { Href } from "expo-router";

const EDIT_PATH = /^\/listings\/([^/]+)\/edit$/;
const DETAIL_PATH = /^\/\(public\)\/listings\/([^/]+)$/;

/**
 * Where the contact-phone number and code screens hand control back. The
 * caller names its own screen in the `returnPathname` route param; a route
 * param is free text, so only the screens that start the flow are accepted:
 * the Sell wizard, My listings, a Listing's edit screen and Listing detail.
 * Anything else falls back to My listings for a relist and the Sell wizard
 * otherwise.
 */
export function contactPhoneReturnHref(
  returnPathname: string | undefined,
  purpose: "relist" | "listing",
  params: Record<string, string> = {},
): Href {
  const editId = returnPathname?.match(EDIT_PATH)?.[1];
  if (editId) {
    return { pathname: "/listings/[id]/edit", params: { id: editId, ...params } };
  }
  const detailId = returnPathname?.match(DETAIL_PATH)?.[1];
  if (detailId) {
    return {
      pathname: "/(public)/listings/[id]",
      params: { id: detailId, ...params },
    };
  }
  const pathname =
    returnPathname === "/listings/manage" || returnPathname === "/(tabs)/sell" || returnPathname === "/business"
      ? returnPathname
      : purpose === "relist"
        ? "/listings/manage"
        : "/(tabs)/sell";
  return Object.keys(params).length > 0 ? { pathname, params } : pathname;
}
