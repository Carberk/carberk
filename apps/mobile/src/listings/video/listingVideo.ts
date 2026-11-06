/** Listing video trim model. Mirrors the approved prototype model (ADR-0099). */

export const LISTING_VIDEO_MAX_S = 90;
export const LISTING_VIDEO_MIN_S = 3;
export const LISTING_VIDEO_COVER_COUNT = 4;

export interface ListingVideoSource {
  uri: string;
  durationS: number;
}

export interface ListingVideoDraft {
  source: ListingVideoSource;
  startS: number;
  endS: number;
  coverIndex: number;
}

/** What "Use video" hands to the preparation port. */
export interface ListingVideoSelection extends ListingVideoDraft {
  posterS: number;
}

export function formatMmss(totalSeconds: number): string {
  const safe = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function createListingVideoDraft(source: ListingVideoSource): ListingVideoDraft {
  const durationS = Math.max(0, source.durationS);
  return {
    source: { uri: source.uri, durationS },
    startS: 0,
    endS: Math.min(LISTING_VIDEO_MAX_S, durationS),
    coverIndex: 0,
  };
}

export function coverTimesFor(draft: ListingVideoDraft): number[] {
  return Array.from({ length: LISTING_VIDEO_COVER_COUNT }, (_, i) =>
    draft.startS + ((draft.endS - draft.startS) * (i + 0.5)) / LISTING_VIDEO_COVER_COUNT,
  );
}

export function posterSFor(draft: ListingVideoDraft): number {
  const times = coverTimesFor(draft);
  return times[draft.coverIndex] ?? times[0] ?? draft.startS;
}

export function toSelection(draft: ListingVideoDraft): ListingVideoSelection {
  return { ...draft, posterS: posterSFor(draft) };
}

function minLengthFor(durationS: number): number {
  return Math.min(LISTING_VIDEO_MIN_S, durationS);
}

export interface IntervalMove {
  draft: ListingVideoDraft;
  hitMax: boolean;
}

/** Move the start edge. Keeps the end fixed; the frame never exceeds the cap. */
export function withStart(draft: ListingVideoDraft, nextStartS: number): IntervalMove {
  const durationS = draft.source.durationS;
  const minS = minLengthFor(durationS);
  let startS = Math.round(nextStartS);
  let hitMax = false;
  startS = Math.max(0, Math.min(draft.endS - minS, startS));
  if (draft.endS - startS > LISTING_VIDEO_MAX_S) {
    startS = draft.endS - LISTING_VIDEO_MAX_S;
    hitMax = true;
  }
  return { draft: { ...draft, startS }, hitMax };
}

/** Move the end edge. Keeps the start fixed; the frame never exceeds the cap. */
export function withEnd(draft: ListingVideoDraft, nextEndS: number): IntervalMove {
  const durationS = draft.source.durationS;
  const minS = minLengthFor(durationS);
  let endS = Math.round(nextEndS);
  let hitMax = false;
  endS = Math.min(durationS, Math.max(draft.startS + minS, endS));
  if (endS - draft.startS > LISTING_VIDEO_MAX_S) {
    endS = draft.startS + LISTING_VIDEO_MAX_S;
    hitMax = true;
  }
  return { draft: { ...draft, endS }, hitMax };
}

/** Slide the whole frame, keeping its length. */
export function withWindow(draft: ListingVideoDraft, nextStartS: number): ListingVideoDraft {
  const durationS = draft.source.durationS;
  const length = draft.endS - draft.startS;
  const startS = Math.max(0, Math.min(durationS - length, Math.round(nextStartS)));
  return { ...draft, startS, endS: startS + length };
}

/** Tap on the timeline: move whichever edge is nearer to the tapped time. */
export function withTap(draft: ListingVideoDraft, timeS: number): IntervalMove {
  const tapped = Math.max(0, Math.min(draft.source.durationS, timeS));
  const toStart = Math.abs(tapped - draft.startS);
  const toEnd = Math.abs(tapped - draft.endS);
  return toStart <= toEnd ? withStart(draft, tapped) : withEnd(draft, tapped);
}

export function withCover(draft: ListingVideoDraft, index: number): ListingVideoDraft {
  const coverIndex = Math.max(0, Math.min(LISTING_VIDEO_COVER_COUNT - 1, Math.round(index) || 0));
  return { ...draft, coverIndex };
}

/** True when the source is longer than the cap, so the Use label names the part. */
export function isLongSource(draft: ListingVideoDraft): boolean {
  return draft.source.durationS > LISTING_VIDEO_MAX_S;
}
