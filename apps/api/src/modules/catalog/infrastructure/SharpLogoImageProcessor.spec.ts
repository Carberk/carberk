import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { SharpLogoImageProcessor } from "./SharpLogoImageProcessor";



describe("SharpLogoImageProcessor", () => {
  const processor = new SharpLogoImageProcessor();
  let dir: string;
  let redPng: string;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "brand-logo-"));
    redPng = join(dir, "red.png");
    const red = await sharp({
      create: { width: 16, height: 16, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 1 } },
    })
      .png()
      .toBuffer();
    await writeFile(redPng, red);
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  async function maxAlpha(png: Uint8Array): Promise<number> {
    const stats = await sharp(png).stats();
    return stats.channels[3]?.max ?? 255;
  }

  it("renders an SVG to a PNG of the target size", async () => {
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="#00f"/></svg>',
    );
    const png = await processor.rasterizeSvg(svg, 256);
    const meta = await sharp(png).metadata();
    expect(meta).toMatchObject({ format: "png", width: 256, height: 256 });
    expect(await maxAlpha(png)).toBe(255);
  });

  function imageSvg(href: string): Buffer {
    return Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><image href="${href}" width="32" height="32"/></svg>`,
    );
  }

  it("renders an embedded data: image, so the image path works", async () => {
    const red = await readFile(redPng);
    const png = await processor.rasterizeSvg(
      imageSvg(`data:image/png;base64,${red.toString("base64")}`),
      64,
    );
    expect(await maxAlpha(png)).toBe(255);
  });

  it("does not load the same image from a file: URL", async () => {
    const png = await processor.rasterizeSvg(imageSvg(`file://${redPng}`), 64);
    expect(await maxAlpha(png)).toBe(0);
  });
});
