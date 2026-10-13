import { describe, it, expect } from "vitest";

import {
  CARD_GALLERY_KEY_LIMIT,
  CARD_PHOTO_KEY_LIMIT,
  toCardPhotos,
  toCardPhotosFromFirstMedia,
} from "./CardPhotos";

describe("toCardPhotos", () => {
  it("returns an empty array and 0 when the Listing has no media", () => {
    expect(toCardPhotos([])).toEqual({ photoKeys: [], galleryKeys: [], photoCount: 0 });
  });

  it("returns the first two photo keys in order and the total photo count", () => {
    const media = ["a", "b", "c", "d"].map((key) => ({ key, kind: "image" as const }));

    const result = toCardPhotos(media);

    expect(CARD_PHOTO_KEY_LIMIT).toBe(2);
    expect(result.photoKeys).toEqual(["a", "b"]);
    expect(result.photoCount).toBe(4);
    expect(result.coverMediaKey).toBe("a");
  });

  it("skips video media for photo keys and count but keeps it as the cover", () => {
    const result = toCardPhotos([
      { key: "clip", kind: "video" },
      { key: "p1", kind: "image" },
    ]);

    expect(result.coverMediaKey).toBe("clip");
    expect(result.photoKeys).toEqual(["p1"]);
    expect(result.photoCount).toBe(1);
  });

  it("gives the Results strip the first eight photo keys of a Listing with more", () => {
    const media = Array.from({ length: 11 }, (_, i) => ({ key: `p${i}`, kind: "image" as const }));

    const result = toCardPhotos(media);

    expect(CARD_GALLERY_KEY_LIMIT).toBe(8);
    expect(result.galleryKeys).toEqual(["p0", "p1", "p2", "p3", "p4", "p5", "p6", "p7"]);
    expect(result.photoKeys).toEqual(["p0", "p1"]);
    expect(result.photoCount).toBe(11);
  });

  it("gives the strip every photo and no video when a Listing has fewer than eight", () => {
    const result = toCardPhotos([
      { key: "p1", kind: "image" },
      { key: "clip", kind: "video" },
      { key: "p2", kind: "image" },
    ]);

    expect(result.galleryKeys).toEqual(["p1", "p2"]);
  });

});

describe("toCardPhotosFromFirstMedia", () => {
  it("reports the Listing's photo total, not the number of photos it was given", () => {
    const firstEight = Array.from({ length: 8 }, (_, i) => ({ key: `p${i}`, kind: "image" as const }));

    const result = toCardPhotosFromFirstMedia([{ key: "clip", kind: "video" }, ...firstEight], 20);

    expect(result).toEqual({
      coverMediaKey: "clip",
      photoKeys: ["p0", "p1"],
      galleryKeys: ["p0", "p1", "p2", "p3", "p4", "p5", "p6", "p7"],
      photoCount: 20,
    });
  });

  it("reports no photos for a Listing whose only media is a video", () => {
    expect(toCardPhotosFromFirstMedia([{ key: "clip", kind: "video" }], 0)).toEqual({
      coverMediaKey: "clip",
      photoKeys: [],
      galleryKeys: [],
      photoCount: 0,
    });
  });
});

describe("card photo ThumbHashes", () => {
  it("gives each card photo its ThumbHash in key order, null where a photo has none yet", () => {
    const result = toCardPhotos([
      { key: "clip", kind: "video", thumbHash: null },
      { key: "p1", kind: "image", thumbHash: "1fsDBYCIiIiHiIdweIeHh4d4cIgH" },
      { key: "p2", kind: "image", thumbHash: null },
      { key: "p3", kind: "image", thumbHash: "2yMBBYCIh4iHiHeAiId4dXh3f4f4" },
    ]);

    expect(result).toEqual({
      coverMediaKey: "clip",
      photoKeys: ["p1", "p2"],
      photoThumbHashes: ["1fsDBYCIiIiHiIdweIeHh4d4cIgH", null],
      galleryKeys: ["p1", "p2", "p3"],
      galleryThumbHashes: ["1fsDBYCIiIiHiIdweIeHh4d4cIgH", null, "2yMBBYCIh4iHiHeAiId4dXh3f4f4"],
      photoCount: 3,
    });
  });

  it("sends no ThumbHash lists while none of the card photos has a hash", () => {
    const result = toCardPhotos([
      { key: "p1", kind: "image", thumbHash: null },
      { key: "p2", kind: "image" },
    ]);

    expect(result).toEqual({ coverMediaKey: "p1", photoKeys: ["p1", "p2"], galleryKeys: ["p1", "p2"], photoCount: 2 });
  });

  it("keeps the two-photo list without hashes when only a later gallery photo has one", () => {
    const result = toCardPhotos([
      { key: "p1", kind: "image" },
      { key: "p2", kind: "image" },
      { key: "p3", kind: "image", thumbHash: "2yMBBYCIh4iHiHeAiId4dXh3f4f4" },
    ]);

    expect(result.photoThumbHashes).toBeUndefined();
    expect(result.galleryThumbHashes).toEqual([null, null, "2yMBBYCIh4iHiHeAiId4dXh3f4f4"]);
  });
});
