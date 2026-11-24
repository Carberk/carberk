export function formatHistoryDeadline(value: string, language: string) {
  const date = new Date(value);
  return new Intl.DateTimeFormat(language === "tk" ? "en-GB" : language, {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Asia/Ashgabat",
    ...(date.getUTCSeconds() || date.getUTCMilliseconds() ? { second: "2-digit" } : {}),
  }).format(date);
}
