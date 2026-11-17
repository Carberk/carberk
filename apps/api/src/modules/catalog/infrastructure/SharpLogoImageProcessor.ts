import { Injectable } from "@nestjs/common";
import sharp from "sharp";

import type { LogoImageProcessor } from "../domain/ports/LogoImageProcessor";

const LIMIT_INPUT_PIXELS = 4096 * 4096;
const DEFAULT_SVG_DENSITY = 72;
const MAX_SVG_DENSITY = 10_000;

@Injectable()
export class SharpLogoImageProcessor implements LogoImageProcessor {
  async probe(
    bytes: Uint8Array,
  ): Promise<{ format: string; width: number; height: number } | null> {
    try {
      const metadata = await sharp(bytes, { limitInputPixels: LIMIT_INPUT_PIXELS }).metadata();
      if (!metadata.format || !metadata.width || !metadata.height) return null;
      return { format: metadata.format, width: metadata.width, height: metadata.height };
    } catch {
      return null;
    }
  }

  async rasterizeSvg(bytes: Uint8Array, size: number): Promise<Uint8Array> {
    const { width = size, height = size } = await sharp(bytes).metadata();

    const density = Math.min(
      MAX_SVG_DENSITY,
      Math.ceil((DEFAULT_SVG_DENSITY * size) / Math.max(width, height)),
    );
    return sharp(bytes, { density, limitInputPixels: LIMIT_INPUT_PIXELS })
      .resize({
        width: size,
        height: size,
        fit: "inside",
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toBuffer();
  }
}
