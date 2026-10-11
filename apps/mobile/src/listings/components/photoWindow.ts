/**
 * How many photos on each side of the one on screen a gallery loads ahead. On
 * a slow connection every other photo would compete with the one the buyer is
 * looking at, so the rest load only as the buyer swipes towards them.
 */
export const PHOTOS_AHEAD = 1;

/** Whether the photo at `index` loads while the photo at `current` is on screen. */
export function isNearPhoto(index: number, current: number): boolean {
  return Math.abs(index - current) <= PHOTOS_AHEAD;
}
