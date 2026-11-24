import { createRequire } from "node:module";
import { dirname, join, sep } from "node:path";
import { workerData } from "node:worker_threads";
import { getDocument, VerbosityLevel } from "pdfjs-dist/legacy/build/pdf.mjs";

const { bytes, pages } = workerData;
const require = createRequire(import.meta.url);
const assets = dirname(require.resolve("pdfjs-dist/package.json"));
const rendering = getDocument({
  data: bytes, stopAtErrors: true, verbosity: VerbosityLevel.WARNINGS, isEvalSupported: false, useSystemFonts: false,
  useWorkerFetch: false, enableXfa: false, isImageDecoderSupported: false, maxImageSize: 4_000_000,
  standardFontDataUrl: join(assets, "standard_fonts") + sep,
  cMapUrl: join(assets, "cmaps") + sep, cMapPacked: true,
});

try {
  const report = await rendering.promise;
  const canvas = report.canvasFactory;
  if (report.numPages !== pages) throw new Error();
  for (let number = 1; number <= pages; number++) {
    const page = await report.getPage(number);
    const dimensions = page.getViewport({ scale: 1 });
    const extent = Math.max(dimensions.width, dimensions.height);
    if (!Number.isFinite(extent) || extent <= 0 || Math.min(dimensions.width, dimensions.height) <= 0) throw new Error();
    const viewport = page.getViewport({ scale: 256 / extent });
    const width = Math.ceil(viewport.width), height = Math.ceil(viewport.height);
    const surface = canvas.create(width, height);
    try {
      await page.render({ canvas: surface.canvas, canvasContext: surface.context, viewport, background: "#ffffff" }).promise;
      for (const objects of [page.objs, page.commonObjs]) {
        for (const [, resource] of objects) {
          if (resource === null || typeof resource === "string") throw new Error();
        }
      }
      const pixels = surface.context.getImageData(0, 0, width, height).data;
      const histogram = new Uint32Array(256);
      for (let i = 0; i < pixels.length; i += 4) {
        const luminance = Math.round(0.2126 * (pixels[i] ?? 0) + 0.7152 * (pixels[i + 1] ?? 0) + 0.0722 * (pixels[i + 2] ?? 0));
        histogram[luminance] = (histogram[luminance] ?? 0) + 1;
      }
      const darkest = histogram.findIndex((count) => count >= 8);
      const lightest = histogram.findLastIndex((count) => count >= 8);
      if (darkest < 0 || lightest - darkest < 24) throw new Error();
    } finally {
      canvas.destroy(surface);
      page.cleanup();
    }
  }
} finally {
  await rendering.destroy();
}
