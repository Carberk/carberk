import { describe, it, expect } from "vitest";
import { ListingMedia } from "./ListingMedia";
import { LISTING_ERROR_CODES } from "./types";

describe("ListingMedia", () => {
  it("creates image media", () => {
    const media = ListingMedia.create({
      id: "media-1",
      listingId: "listing-1",
      kind: "image",
      key: "listings/listing-1/media-1/original.webp",
      sortOrder: 0,
      width: 1920,
      height: 1080,
    });
    expect(media.kind).toBe("image");
    expect(media.width).toBe(1920);
  });

  it("creates video media with posterKey and durationMs", () => {
    const media = ListingMedia.create({
      id: "media-2",
      listingId: "listing-1",
      kind: "video",
      key: "listings/listing-1/media-2/original.mp4",
      sortOrder: 1,
      durationMs: 30000,
      posterKey: "listings/listing-1/media-2/poster.webp",
    });
    expect(media.kind).toBe("video");
    expect(media.durationMs).toBe(30000);
    expect(media.posterKey).toBe("listings/listing-1/media-2/poster.webp");
  });

  it("rejects posterKey on image media", () => {
    expect(() =>
      ListingMedia.create({
        id: "media-1",
        listingId: "listing-1",
        kind: "image",
        key: "key",
        sortOrder: 0,
        posterKey: "poster.webp",
      }),
    ).toThrowError(LISTING_ERROR_CODES.INVALID_TRANSITION);
  });

  it("rejects durationMs on image media", () => {
    expect(() =>
      ListingMedia.create({
        id: "media-1",
        listingId: "listing-1",
        kind: "image",
        key: "key",
        sortOrder: 0,
        durationMs: 5000,
      }),
    ).toThrowError(LISTING_ERROR_CODES.INVALID_TRANSITION);
  });
});
