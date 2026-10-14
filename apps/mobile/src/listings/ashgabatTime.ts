/**
 * Listing dates are read in Asia/Ashgabat, whatever the device's own zone, so
 * a Listing's card and its detail agree on which day it was published (#872).
 * Ashgabat is UTC+5 with no DST, so the offset is fixed rather than looked up
 * through `Intl`'s `timeZone`, which Hermes leaves to each platform's own
 * time zone support. Stored timestamps stay UTC; only display shifts.
 */
const ASHGABAT_UTC_OFFSET_MS = 5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The instant moved so that its UTC fields (`getUTCDate`, `getUTCFullYear`)
 * read the Ashgabat wall clock. Format it with `timeZone: "UTC"`.
 */
export function ashgabatWallClock(date: Date): Date {
  return new Date(date.getTime() + ASHGABAT_UTC_OFFSET_MS);
}

/** Days since the epoch on the Ashgabat calendar; equal numbers are the same Ashgabat day. */
export function ashgabatDayNumber(date: Date): number {
  return Math.floor(ashgabatWallClock(date).getTime() / DAY_MS);
}
