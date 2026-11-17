import { readFileSync } from "node:fs";

import sharp from "sharp";
import { siToyota } from "simple-icons";
import { describe, expect, it } from "vitest";

import { loadBrandLogoManifest } from "../scripts/brand-logos/manifest";
import { verifyMasterSha } from "../scripts/brand-logos/sources";
import { LOGO_SIZES, renderLogoMask, renderLogoMasks } from "../scripts/brand-logos/render";

const enc = (text: string) => new TextEncoder().encode(text);

async function pixels(png: Buffer) {
  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
  return { data, ...info };
}

interface Ink {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  covered: number;
  nonBlackInk: number;
}

async function inkOf(png: Buffer): Promise<Ink> {
  const { data, width, height, channels } = await pixels(png);
  const ink: Ink = { minX: width, maxX: -1, minY: height, maxY: -1, covered: 0, nonBlackInk: 0 };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * channels;
      const alpha = data[i + 3] as number;
      if (alpha === 0) continue;
      ink.covered += alpha / 255;
      if (alpha > 20) {
        ink.minX = Math.min(ink.minX, x);
        ink.maxX = Math.max(ink.maxX, x);
        ink.minY = Math.min(ink.minY, y);
        ink.maxY = Math.max(ink.maxY, y);
      }
      if (data[i] !== 0 || data[i + 1] !== 0 || data[i + 2] !== 0) ink.nonBlackInk++;
    }
  }
  return ink;
}

describe("logo masks", () => {
  it("renders the 1x, 2x and 3x sizes of the 30 px picker icon", async () => {
    expect(LOGO_SIZES).toEqual([30, 60, 90]);
    const rendered = await renderLogoMasks(enc(siToyota.svg), "alpha");
    expect(rendered.map((r) => r.size)).toEqual([30, 60, 90]);
    for (const { size, png } of rendered) {
      const meta = await sharp(png).metadata();
      expect(meta.format).toBe("png");
      expect(meta.width).toBe(size);
      expect(meta.height).toBe(size);
      expect(meta.hasAlpha).toBe(true);
    }
  });

  it.each([30, 60, 90])("is a monochrome, transparent mask at %i px", async (size) => {
    const png = await renderLogoMask(enc(siToyota.svg), "alpha", size);
    const { data, width, height, channels } = await pixels(png);
    expect(channels).toBe(4);
    // A transparent corner: the logo does not fill the tile.
    expect(data[3]).toBe(0);
    const ink = await inkOf(png);
    // Every visible pixel is pure black; only alpha carries the shape, so the app can tint it.
    expect(ink.nonBlackInk).toBe(0);
    // The logo covers a real share of the tile but leaves it mostly transparent.
    const share = ink.covered / (width * height);
    expect(share).toBeGreaterThan(0.08);
    expect(share).toBeLessThan(0.6);
    // Padding keeps the mark off the edge.
    expect(ink.minX).toBeGreaterThanOrEqual(1);
    expect(ink.minY).toBeGreaterThanOrEqual(1);
    expect(ink.maxX).toBeLessThanOrEqual(width - 2);
    expect(ink.maxY).toBeLessThanOrEqual(height - 2);
  });

  it("ignores the colour of the source when the mask comes from alpha", async () => {
    const white = enc(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="5" fill="#ffffff"/></svg>',
    );
    const png = await renderLogoMask(white, "alpha", 90);
    const { data, width, height, channels } = await pixels(png);
    const centre = ((height >> 1) * width + (width >> 1)) * channels;
    expect(data[centre + 3]).toBe(255);
    expect(data[centre]).toBe(0);
  });

  it("turns light areas into holes and dark areas into ink when the mask comes from luminance", async () => {
    const svg = enc(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 12">' +
        '<rect width="8" height="12" fill="#000000"/>' +
        '<rect x="8" width="8" height="12" fill="#808080"/>' +
        '<rect x="16" width="8" height="12" fill="#ffffff"/>' +
        "</svg>",
    );
    const png = await renderLogoMask(svg, "luminance", 90);
    const { data, width, height, channels } = await pixels(png);
    const alphaAt = (fx: number) =>
      data[(height >> 1) * width * channels + Math.round(fx * width) * channels + 3] as number;
    // The 2:1 source is fitted inside the padded square, so three equal bands span x = 8%..92%.
    expect(alphaAt(0.2)).toBeGreaterThan(240);
    expect(alphaAt(0.5)).toBeGreaterThan(115);
    expect(alphaAt(0.5)).toBeLessThan(140);
    expect(alphaAt(0.8)).toBeLessThan(10);
    expect((await inkOf(png)).nonBlackInk).toBe(0);
  });

  it("keeps a transparent background transparent under the luminance transform", async () => {
    const png = await renderLogoMask(
      enc(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" fill="#000000"/></svg>',
      ),
      "luminance",
      60,
    );
    const { data } = await pixels(png);
    expect(data[3]).toBe(0);
  });

  it("renders a PNG master as well as an SVG one", async () => {
    const master = await sharp({
      create: { width: 40, height: 40, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .composite([
        {
          input: await sharp({
            create: { width: 20, height: 20, channels: 4, background: { r: 200, g: 0, b: 0, alpha: 1 } },
          })
            .png()
            .toBuffer(),
          left: 10,
          top: 10,
        },
      ])
      .png()
      .toBuffer();
    const png = await renderLogoMask(master, "alpha", 60);
    const ink = await inkOf(png);
    expect(ink.nonBlackInk).toBe(0);
    expect(ink.covered).toBeGreaterThan(200);
  });

  it("renders an SVG sized in millimetres at every size (a Commons file once rendered to nothing at 30 px)", async () => {
    const svg = enc(
      '<svg xmlns="http://www.w3.org/2000/svg" width="296.88791mm" height="72.167114mm" viewBox="0 0 296.88791 72.167114"><rect width="296.88791" height="72.167114"/></svg>',
    );
    for (const size of LOGO_SIZES) {
      const png = await renderLogoMask(svg, "alpha", size);
      expect((await inkOf(png)).covered).toBeGreaterThan(size / 3);
    }
  });

  it("keeps a wide manufacturer wordmark instead of replacing it with a letter", async () => {
    const wordmark = enc(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 60"><rect width="1000" height="60"/></svg>',
    );
    const rendered = await renderLogoMasks(wordmark, "alpha");
    expect(rendered.map((logo) => logo.size)).toEqual([30, 60, 90]);
    for (const logo of rendered) expect((await inkOf(logo.png)).covered).toBeGreaterThan(0);
  });

  it("renders the pinned IH emblem as visible picker masks at every density", async () => {
    const entry = loadBrandLogoManifest().entries.find((logo) => logo.slug === "international-harvester");
    expect(entry?.source).toBe("commons");
    if (!entry || entry.source === null) throw new Error("International Harvester has no sourced logo");
    const master = readFileSync(new URL("./fixtures/international-harvester.svg", import.meta.url));
    verifyMasterSha(entry, master);
    const rendered = await renderLogoMasks(master, entry.transform);
    expect(rendered.map((logo) => logo.size)).toEqual([30, 60, 90]);
    for (const { size, png } of rendered) {
      const ink = await inkOf(png);
      expect(ink.nonBlackInk).toBe(0);
      expect(ink.covered).toBeGreaterThan(size);
      expect(ink.minX).toBeGreaterThanOrEqual(1);
      expect(ink.minY).toBeGreaterThanOrEqual(1);
      expect(ink.maxX).toBeLessThan(size - 1);
      expect(ink.maxY).toBeLessThan(size - 1);
    }
  });

  it("refuses a master that renders to nothing", async () => {
    const empty = enc('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"/>');
    await expect(renderLogoMasks(empty, "alpha")).rejects.toThrow(/empty|no ink|blank/i);
  });
});
