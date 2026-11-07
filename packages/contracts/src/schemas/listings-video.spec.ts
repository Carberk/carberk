import { describe, expect, it } from "vitest";

import { ReadyListingVideoSchema, PendingListingVideoSchema } from "./listings";

describe("Listing video read contracts", () => {
  it("carries generation-scoped cover members and only actual qualities beside photos", () => {
    const video = { id: "11111111-1111-4111-8111-111111111111", generationId: "22222222-2222-4222-8222-222222222222", galleryIndex: 1, durationMs: 8500, qualities: [240, 360], cover: { thumbnail: "cover:thumbnail", list: "cover:list", detail: "cover:detail", fullscreen: "cover:fullscreen" } };
    expect(ReadyListingVideoSchema.parse(video)).toEqual(video);
    expect(ReadyListingVideoSchema.safeParse({ ...video, qualities: [1080] }).success).toBe(false);
    expect(ReadyListingVideoSchema.safeParse({ ...video, galleryIndex: 0 }).success).toBe(false);
  });

  it("keeps preparing on the phone and distinguishes stored-source processing failures", () => {
    const pending = { id: "11111111-1111-4111-8111-111111111111", generationId: "22222222-2222-4222-8222-222222222222", sourceId: "33333333-3333-4333-8333-333333333333", sessionId: "33333333-3333-4333-8333-333333333333", status: "failed", failureType: "SOURCE_MISSING", canReprocess: false };
    expect(PendingListingVideoSchema.parse(pending)).toEqual(pending);
    expect(PendingListingVideoSchema.safeParse({ ...pending, status: "preparing" }).success).toBe(false);
    expect(PendingListingVideoSchema.safeParse({ ...pending, status: "Ready" }).success).toBe(false);
  });
});
