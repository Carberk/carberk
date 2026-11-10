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

  it("offers Data saver only when a rendition fits its 360p cap", () => {
    expect(qualityOptions([720])).toEqual([
      { choice: "auto" },
      { choice: 720, height: 720 },
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
    const variants = parseMasterPlaylist(PLAYLIST, [240, 360, 720]);
    expect(variants.get(240)).toBe(V240);
    expect(variants.get(360)).toBe(V360);
    expect(variants.get(720)).toBe(V720);
  });

  it("keys a portrait variant by its short side, as the worker scales it", () => {
    const portrait = [
      "#EXTM3U",
      "#EXT-X-STREAM-INF:BANDWIDTH=400000,RESOLUTION=240x426",
      V240,
      "#EXT-X-STREAM-INF:BANDWIDTH=900000,RESOLUTION=360x640",
      V360,
      "#EXT-X-STREAM-INF:BANDWIDTH=2500000,RESOLUTION=720x1280",
      V720,
    ].join("\n");
    const variants = parseMasterPlaylist(portrait, [720, 240, 360]);
    expect([...variants.keys()].sort((a, b) => a - b)).toEqual([240, 360, 720]);
    expect(variantUrlFor("data-saver", MASTER, variants)).toBe(V360);
  });

  it("maps a rotated iPhone portrait clip by tier order, not by its odd sizes", () => {
    // Stored 1920x1080 with a rotate flag, the worker currently outputs
    // 202x360 and 404x720; the master still lists tiers in ascending order.
    const rotated = [
      "#EXTM3U",
      "#EXT-X-STREAM-INF:BANDWIDTH=400000,RESOLUTION=134x240",
      V240,
      "#EXT-X-STREAM-INF:BANDWIDTH=900000,RESOLUTION=202x360",
      V360,
      "#EXT-X-STREAM-INF:BANDWIDTH=2500000,RESOLUTION=404x720",
      V720,
    ].join("\n");
    const variants = parseMasterPlaylist(rotated, [240, 360, 720]);
    expect(variants.get(240)).toBe(V240);
    expect(variants.get(360)).toBe(V360);
    expect(variants.get(720)).toBe(V720);
  });

  it("maps nothing when the playlist and the granted qualities disagree", () => {
    expect(parseMasterPlaylist(PLAYLIST, [360, 720]).size).toBe(0);
  });
});

describe("variantUrlFor", () => {
  const variants = parseMasterPlaylist(PLAYLIST, [240, 360, 720]);

  it("keeps the master URL for Auto so the native player adapts", () => {
    expect(variantUrlFor("auto", MASTER, variants)).toBe(MASTER);
  });

  it("caps Data saver at 360p", () => {
    expect(variantUrlFor("data-saver", MASTER, variants)).toBe(V360);
  });

  it("has no Data saver URL when nothing fits the cap", () => {
    expect(variantUrlFor("data-saver", MASTER, new Map([[720, V720]]))).toBeUndefined();
  });

  it("loads the chosen rendition and never falls back to the master", () => {
    expect(variantUrlFor(720, MASTER, variants)).toBe(V720);
    expect(variantUrlFor(720, MASTER, new Map())).toBeUndefined();
  });
});
