import { localeTag } from "../../i18n/resources";

/** When a Listing was published, as a large card says it: Today, Yesterday, "12 Sep", or "3 Mar 2025" for another year. */
export function formatListingDate(publishedAt: string, locale: string, t: (key: string) => string, now = new Date()): string {
  const published = new Date(publishedAt);
  const day = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (day(published) === day(now)) return t("resultsToday");
  if (day(published) === day(yesterday)) return t("resultsYesterday");
  const month = published.toLocaleDateString(localeTag(locale), { month: "short" });
  return `${published.getDate()} ${month}${published.getFullYear() !== now.getFullYear() ? ` ${published.getFullYear()}` : ""}`;
}
