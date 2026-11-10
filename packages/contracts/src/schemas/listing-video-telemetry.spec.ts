import { describe, expect, it } from "vitest";

import { ListingVideoTelemetryEventSchema } from "./listing-video-telemetry";

const VALID = [
  { event: "preparation_finished", outcome: "prepared", durationMs: 8_400, clipMs: 75_000, preparedBytes: 11_200_000 },
  { event: "preparation_finished", outcome: "failed", failure: "interrupted", durationMs: 2_100, clipMs: 60_000 },
  { event: "upload_interrupted", reason: "network", confirmedBytes: 5_242_880, totalBytes: 11_200_000 },
  { event: "upload_resumed", reason: "restart", confirmedBytes: 5_242_880, totalBytes: 11_200_000 },
  { event: "upload_failed", failure: "transfer", confirmedBytes: 0, totalBytes: 11_200_000 },
  { event: "playback_started", audience: "viewer", quality: "auto", startupMs: 1_850 },
  { event: "playback_buffering", audience: "viewer", stallCount: 2, stallMs: 3_100, watchedMs: 41_000 },
  { event: "playback_abandoned", audience: "owner-preview", waitedMs: 3_200 },
];

describe("Listing video telemetry contract", () => {
  it.each(VALID)("accepts a $event measurement made only of numbers and fixed reasons", (event) => {
    expect(ListingVideoTelemetryEventSchema.parse(event)).toEqual(event);
  });

  it.each([
    ["a grant URL", { url: "https://api.carberk.com/files/master.m3u8?grant=secret" }],
    ["a device file path", { fileUri: "file:///var/mobile/Containers/prepared.mp4" }],
    ["a bearer token", { accessToken: "eyJhbGciOi" }],
    ["a phone number", { phone: "+99365000901" }],
    ["a user id", { userId: "11111111-1111-4111-8111-111111111111" }],
    ["file contents", { body: "AAAAIGZ0eXBpc29t" }],
  ])("refuses an event that carries %s", (_label, extra) => {
    for (const event of VALID) {
      expect(ListingVideoTelemetryEventSchema.safeParse({ ...event, ...extra }).success).toBe(false);
    }
  });

  it("refuses free text where a fixed reason belongs", () => {
    expect(ListingVideoTelemetryEventSchema.safeParse({ ...VALID[2], reason: "lost wifi at +99365000901" }).success).toBe(false);
    expect(ListingVideoTelemetryEventSchema.safeParse({ ...VALID[5], startupMs: "1850" }).success).toBe(false);
    expect(ListingVideoTelemetryEventSchema.safeParse({ event: "playback_error", message: "x" }).success).toBe(false);
  });

  it("refuses sizes and times no real clip produces", () => {
    expect(ListingVideoTelemetryEventSchema.safeParse({ ...VALID[0], preparedBytes: 16 * 1024 * 1024 }).success).toBe(false);
    expect(ListingVideoTelemetryEventSchema.safeParse({ ...VALID[5], startupMs: -1 }).success).toBe(false);
    expect(ListingVideoTelemetryEventSchema.safeParse({ ...VALID[5], startupMs: 1.5 }).success).toBe(false);
  });
});
