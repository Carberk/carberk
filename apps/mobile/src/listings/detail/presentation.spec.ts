import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { detailDate } from "./presentation";

// Ashgabat is UTC+5 with no DST, so its midnight is 19:00 UTC. Listing detail
// dates the Listing by its Ashgabat calendar day, whatever the device's zone.
describe.each(["UTC", "America/Chicago", "Asia/Tokyo"])("detailDate on a device in %s", (zone) => {
  beforeEach(() => {
    vi.stubEnv("TZ", zone);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-14T19:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("moves to the next day at Ashgabat midnight, 19:00 UTC", () => {
    expect(detailDate("2026-10-14T18:59:59Z", "en")).toBe("14 Oct");
    expect(detailDate("2026-10-14T19:00:00Z", "en")).toBe("15 Oct");
  });

  it("reads the year in Ashgabat, so 19:30 UTC on 31 December is 1 January of the next year", () => {
    vi.setSystemTime(new Date("2026-03-01T12:00:00Z"));
    expect(detailDate("2025-12-31T19:30:00Z", "en")).toBe("1 Jan");
    expect(detailDate("2025-12-31T18:30:00Z", "en")).toBe("31 Dec 2025");
  });

  it("shows the year when the Ashgabat year has turned but the UTC year has not", () => {
    vi.setSystemTime(new Date("2026-12-31T19:30:00Z"));
    expect(detailDate("2026-12-31T12:00:00Z", "en")).toBe("31 Dec 2026");
  });

  it("keeps an empty or unreadable date empty", () => {
    expect(detailDate(undefined, "en")).toBeUndefined();
    expect(detailDate("not a date", "en")).toBeUndefined();
  });
});
