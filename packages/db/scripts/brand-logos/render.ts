import sharp from "sharp";

import type { LogoTransform } from "./manifest";

/** 1x, 2x and 3x of the 30 px picker icon. */
export const LOGO_SIZES = [30, 60, 90] as const;
export type LogoSize = (typeof LOGO_SIZES)[number];

export interface RenderedLogo {
  size: LogoSize;
  png: Buffer;
}

/** Empty margin kept on every side, as a share of the tile. */
const PADDING = 0.08;
/** Pixels with less alpha than this do not count as ink when measuring the mark. */
const INK_ALPHA = 20;
const LIMIT_INPUT_PIXELS = 4096 * 4096;
const DEFAULT_SVG_DENSITY = 72;
const MAX_SVG_DENSITY = 10_000;
const MIN_WORKING_SIZE = 512;

/**
 * Renders a master (SVG or PNG) to a square, black-on-transparent PNG mask.
 * Only alpha carries the shape, so the app can tint one asset for light and
 * dark themes. The mark is fitted inside the tile with a margin.
 */
export async function renderLogoMask(
  master: Uint8Array,
  transform: LogoTransform,
  size: number,
): Promise<Buffer> {
  const input = Buffer.from(master);
  const inner = Math.max(1, Math.round(size * (1 - 2 * PADDING)));

  const { width = inner, height = inner, format } = await sharp(input, {
    limitInputPixels: LIMIT_INPUT_PIXELS,
  }).metadata();
  // Rasterize a vector well above the target size, then shrink it: a very low density
  // can round an SVG down to nothing, and shrinking a large render keeps edges crisp.
  const working = Math.max(inner * 4, MIN_WORKING_SIZE);
  const density =
    format === "svg"
      ? Math.min(
          MAX_SVG_DENSITY,
          Math.max(1, Math.ceil((DEFAULT_SVG_DENSITY * working) / Math.max(width, height))),
        )
      : undefined;

  const { data, info } = await sharp(input, { density, limitInputPixels: LIMIT_INPUT_PIXELS })
    .resize({ width: inner, height: inner, fit: "inside" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const mask = Buffer.alloc(info.width * info.height * 4);
  for (let i = 0; i < data.length; i += 4) {
    let alpha = data[i + 3] as number;
    if (transform === "luminance") {
      const luminance =
        (0.2126 * (data[i] as number) + 0.7152 * (data[i + 1] as number) + 0.0722 * (data[i + 2] as number)) /
        255;
      alpha = Math.round(alpha * (1 - luminance));
    }
    mask[i + 3] = alpha;
  }

  const left = Math.floor((size - info.width) / 2);
  const top = Math.floor((size - info.height) / 2);
  return sharp(mask, { raw: { width: info.width, height: info.height, channels: 4 } })
    .extend({
      top,
      bottom: size - info.height - top,
      left,
      right: size - info.width - left,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

export interface Ink {
  width: number;
  height: number;
  /** Total alpha as a share of the tile. */
  coverage: number;
}

export async function measureInk(png: Buffer): Promise<Ink> {
  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
  let minX = info.width;
  let maxX = -1;
  let minY = info.height;
  let maxY = -1;
  let total = 0;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const alpha = data[(y * info.width + x) * info.channels + 3] as number;
      total += alpha;
      if (alpha > INK_ALPHA) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    }
  }
  const inked = maxX >= 0;
  return {
    width: inked ? maxX - minX + 1 : 0,
    height: inked ? maxY - minY + 1 : 0,
    coverage: total / 255 / (info.width * info.height),
  };
}

/** Renders all three sizes and refuses a master that would not make a usable icon. */
export async function renderLogoMasks(
  master: Uint8Array,
  transform: LogoTransform,
): Promise<RenderedLogo[]> {
  const rendered: RenderedLogo[] = [];
  for (const size of LOGO_SIZES) {
    rendered.push({ size, png: await renderLogoMask(master, transform, size) });
  }

  const largest = rendered[rendered.length - 1] as RenderedLogo;
  const ink = await measureInk(largest.png);
  if (ink.width === 0) {
    throw new Error("the master renders as an empty mask (no ink)");
  }
  return rendered;
}
