/**
 * The date a scheduled account deletion takes effect, written in the app
 * language for the restore prompt. The prompt's copy puts it before a full
 * stop, and some locales (Russian: "26 октября 2026 г.") end the date with
 * their own, so that one is dropped to avoid a doubled period. Copy that puts
 * the date mid-sentence passes `midSentence` to keep it ("2026 г. ваш…").
 */
export function formatDeletionDate(
  iso: string,
  locale: string,
  { midSentence = false }: { midSentence?: boolean } = {},
): string {
  const date = new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(iso));
  return midSentence ? date : date.replace(/\.$/, "");
}

const GRACE_PERIOD_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * The date an account deleted now would be erased: today plus the 30-day grace
 * period (ADR-0032). The API does not return it, so the app works it out.
 */
export function formatDeletionDateFromNow(
  locale: string,
  options?: { midSentence?: boolean },
): string {
  return formatDeletionDate(new Date(Date.now() + GRACE_PERIOD_MS).toISOString(), locale, options);
}
