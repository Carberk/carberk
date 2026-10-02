import type { Href } from "expo-router";

/**
 * Help (#522), the release's only support entry. The code screen links to it
 * only at the daily Sign-in Code limit (#353 founder decision). The cast
 * covers branches where the Help route is not yet in the typed route list;
 * drop it once `/help` is.
 */
export const HELP_HREF = "/help" as Href;
