import { describe, expect, it } from "vitest";

import { coverTimesFor, createListingVideoDraft, formatMmss, type ListingVideoDraft } from "./listingVideo";

describe("listing video cover frames", () => {
  it("keeps every cover frame inside a fractional short source", () => {
    const draft = createListingVideoDraft({ uri: "short.mp4", durationS: 1.8 });

    expect(coverTimesFor(draft)).toEqual([0.225, 0.675, 1.125, 1.575]);
    expect(coverTimesFor(draft).every((time) => time >= draft.startS && time <= draft.endS)).toBe(true);
    expect(coverTimesFor(draft).map(formatMmss)).toEqual(["0:00", "0:01", "0:01", "0:02"]);
  });

  it("keeps midpoint frames inside a fractional selected end", () => {
    const draft: ListingVideoDraft = {
      ...createListingVideoDraft({ uri: "fractional.mp4", durationS: 8.75 }),
      startS: 2.15,
      endS: 7.35,
    };
    const times = coverTimesFor(draft);

    expect(times).toEqual([2.8, 4.1, 5.4, 6.7].map((time) => expect.closeTo(time, 10)));
    expect(times.every((time) => time >= draft.startS && time <= draft.endS)).toBe(true);
  });
});
