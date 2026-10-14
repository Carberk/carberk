import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { formatListingDate } from "./formatListingDate";

const t = (key: string) => ({ resultsToday: "Today", resultsYesterday: "Yesterday" })[key] ?? key;

// Ashgabat is UTC+5 with no DST, so its midnight is 19:00 UTC. The device's
// own time zone must not move a Listing across that day boundary.
describe.each(["UTC", "America/Chicago", "Asia/Tokyo"])("formatListingDate on a device in %s", (zone) => {
  const deviceZone = process.env["TZ"];
  beforeEach(() => {
    process.env["TZ"] = zone;
  });
  afterEach(() => {
    if (deviceZone === undefined) delete process.env["TZ"];
    else process.env["TZ"] = deviceZone;
  });

  const ashgabatMidnight = new Date("2026-10-14T19:00:00Z");

  it("says Today from Ashgabat midnight, 19:00 UTC", () => {
    expect(formatListingDate("2026-10-14T19:00:00Z", "en", t, ashgabatMidnight)).toBe("Today");
  });

  it("says Yesterday for a Listing published one second before Ashgabat midnight", () => {
    expect(formatListingDate("2026-10-14T18:59:59Z", "en", t, ashgabatMidnight)).toBe("Yesterday");
  });

  it("still says Today one second before Ashgabat midnight", () => {
    expect(formatListingDate("2026-10-13T19:00:00Z", "en", t, new Date("2026-10-14T18:59:59Z"))).toBe("Today");
  });

  it("dates a Listing from two Ashgabat days ago by its Ashgabat calendar day", () => {
    expect(formatListingDate("2026-10-13T18:59:59Z", "en", t, ashgabatMidnight)).toBe("13 Oct");
    expect(formatListingDate("2026-10-12T19:00:00Z", "en", t, ashgabatMidnight)).toBe("13 Oct");
  });

  it("reads the year in Ashgabat, so 19:30 UTC on 31 December is 1 January of the next year", () => {
    expect(formatListingDate("2025-12-31T19:30:00Z", "en", t, new Date("2026-03-01T12:00:00Z"))).toBe("1 Jan");
    expect(formatListingDate("2025-12-31T18:30:00Z", "en", t, new Date("2026-03-01T12:00:00Z"))).toBe("31 Dec 2025");
  });
});
