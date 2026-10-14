import { localeTag } from "../../i18n/resources";
import { ashgabatDayNumber, ashgabatWallClock } from "../ashgabatTime";

/**
 * When a Listing was published, as a large card says it: Today, Yesterday, "12 Sep", or "3 Mar 2025" for another year.
 * Days and years are Ashgabat's, not the device's.
 */
export function formatListingDate(publishedAt: string, locale: string, t: (key: string) => string, now = new Date()): string {
  const published = new Date(publishedAt);
  const daysAgo = ashgabatDayNumber(now) - ashgabatDayNumber(published);
  if (daysAgo === 0) return t("resultsToday");
  if (daysAgo === 1) return t("resultsYesterday");
  const day = ashgabatWallClock(published);
  const year = day.getUTCFullYear();
  const month = day.toLocaleDateString(localeTag(locale), { month: "short", timeZone: "UTC" });
  return `${day.getUTCDate()} ${month}${year !== ashgabatWallClock(now).getUTCFullYear() ? ` ${year}` : ""}`;
}
