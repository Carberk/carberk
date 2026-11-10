import { describe, expect, it } from "vitest";

import { parseMasterPlaylist, qualityOptions, variantUrlFor } from "./videoPlayback";

const MASTER = "http://localhost:3006/api/v1/listings/video-files/viewer/v1/g1/bWFzdGVy.m3u8?grant=tok";
const V240 = "http://localhost:3006/files/240.m3u8?grant=tok";
const V360 = "http://localhost:3006/files/360.m3u8?grant=tok";
const V720 = "http://localhost:3006/files/720.m3u8?grant=tok";
const PLAYLIST = [
  "#EXTM3U",
  "#EXT-X-VERSION:6",
  `#EXT-X-STREAM-INF:BANDWIDTH=400000,RESOLUTION=426x240`,
  V240,
  `#EXT-X-STREAM-INF:BANDWIDTH=900000,RESOLUTION=640x360`,
  V360,
  `#EXT-X-STREAM-INF:BANDWIDTH=2500000,RESOLUTION=1280x720`,
  V720,
].join("\n");

describe("qualityOptions", () => {
  it("lists Auto, Data saver, then only the renditions this video has, highest first", () => {
    expect(qualityOptions([240, 720])).toEqual([
      { choice: "auto" },
      { choice: "data-saver" },
      { choice: 720, height: 720 },
      { choice: 240, height: 240 },
    ]);
  });

  it("keeps Auto and Data saver when the video has a single rendition", () => {
    expect(qualityOptions([360])).toEqual([
      { choice: "auto" },
      { choice: "data-saver" },
      { choice: 360, height: 360 },
    ]);
  });
});

describe("parseMasterPlaylist", () => {
  it("maps each variant playlist URL to its rendition height", () => {
    const variants = parseMasterPlaylist(PLAYLIST);
    expect(variants.get(240)).toBe(V240);
    expect(variants.get(360)).toBe(V360);
    expect(variants.get(720)).toBe(V720);
  });
});

describe("variantUrlFor", () => {
  const variants = parseMasterPlaylist(PLAYLIST);

  it("keeps the master URL for Auto so the native player adapts", () => {
    expect(variantUrlFor("auto", MASTER, variants)).toBe(MASTER);
  });

  it("caps Data saver at 360p", () => {
    expect(variantUrlFor("data-saver", MASTER, variants)).toBe(V360);
  });

  it("falls back to the lowest rendition for Data saver when nothing fits the cap", () => {
    expect(variantUrlFor("data-saver", MASTER, new Map([[720, V720]]))).toBe(V720);
  });

  it("loads the chosen rendition and falls back to the master when it is missing", () => {
    expect(variantUrlFor(720, MASTER, variants)).toBe(V720);
    expect(variantUrlFor(720, MASTER, new Map())).toBe(MASTER);
  });
});
