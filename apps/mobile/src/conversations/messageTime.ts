import type { TFunction } from "i18next";

import { localeTag } from "../i18n/resources";

/** Hours and minutes in the app language, as the bubble footer shows them. */
export function formatMessageTime(iso: string, language: string): string {
  return new Date(iso).toLocaleTimeString(localeTag(language), {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function isSameLocalDay(a: string, b: string): boolean {
  return new Date(a).toDateString() === new Date(b).toDateString();
}

/** "Today", "Yesterday", or the date; the year only when it is not this year. */
export function formatMessageDay(
  iso: string,
  language: string,
  t: TFunction,
  now = new Date(),
): string {
  const day = new Date(iso);
  if (day.toDateString() === now.toDateString()) return t("conversations:dayToday");
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (day.toDateString() === yesterday.toDateString()) {
    return t("conversations:dayYesterday");
  }
  return day.toLocaleDateString(localeTag(language), {
    day: "numeric",
    month: "long",
    ...(day.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  });
}
