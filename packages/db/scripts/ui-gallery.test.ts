import { createHash } from "node:crypto";
import { cp, mkdtemp, readFile, readdir, rm, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { runInNewContext } from "node:vm";

import ts from "typescript";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { ES300H_GALLERY, type GalleryDefinition } from "./ui-fixtures/manifest";
import { verifyGallery } from "./ui-fixtures/verify";

beforeEach(() => {
  vi.stubGlobal("fetch", () => { throw new Error("Network forbidden during offline verification"); });
});
afterEach(() => vi.unstubAllGlobals());

const assetDir = join(__dirname, "ui-fixtures/es300h-shenzhen-2025-07-17/v1");

test("selects the immutable v1 Lexus pilot in the curated useful-view order", () => {
  expect(ES300H_GALLERY.scenarioKey).toBe("es300h-shenzhen-2025-07-17");
  expect(ES300H_GALLERY.version).toBe(1);
  expect(ES300H_GALLERY.purpose).toBe("ui");
  expect(ES300H_GALLERY.photos.map((photo) => photo.order)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  // v1 pins provenance and content as well as view order; changes need a new version.
  expect(createHash("sha256").update(JSON.stringify(ES300H_GALLERY)).digest("hex"))
    .toBe("c200e6a1db9426becae9b5333f844e93a491bcb9e1cdc35ecda0570d44dc651c");
  expect(ES300H_GALLERY.photos.map((photo) => photo.view)).toEqual([
    "cover-front-three-quarter", "rear-three-quarter", "dashboard-wide", "front-cabin", "rear-cabin",
    "boot-open", "center-controls", "gear-selector", "headlamp-detail", "taillamp-detail",
  ]);
});

test("explicitly decodes all ten local JPEGs and verifies the pinned acquisition bytes", async () => {
  expect((await readdir(assetDir)).filter((file) => file.endsWith(".jpg"))).toHaveLength(10);
  expect(await verifyGallery(assetDir, ES300H_GALLERY)).toEqual({
    scenarioKey: "es300h-shenzhen-2025-07-17", version: 1, photos: 10, bytes: 6060092,
  });
});

// Exercise filesystem failures against a private copy, preserving the curated inputs.
async function withCopy(check: (directory: string) => Promise<void>) {
  const directory = await mkdtemp("/tmp/carberk-gallery-");
  try { await cp(assetDir, directory, { recursive: true }); await check(directory); }
  finally { await rm(directory, { recursive: true, force: true }); }
}

function changedFirst(change: Partial<GalleryDefinition["photos"][number]>): GalleryDefinition {
  return { ...ES300H_GALLERY, photos: ES300H_GALLERY.photos.map((photo, index) => index === 0 ? { ...photo, ...change } : photo) };
}

test("reports a missing local file without trying to replace it", async () => {
  await withCopy(async (directory) => {
    await unlink(join(directory, "01-cover-front-three-quarter.jpg"));
    await expect(verifyGallery(directory, ES300H_GALLERY)).rejects.toThrow("01-cover-front-three-quarter.jpg): missing or unreadable local JPEG");
  });
});

test("rejects altered bytes even when the file length is unchanged", async () => {
  await withCopy(async (directory) => {
    const file = join(directory, "01-cover-front-three-quarter.jpg");
    const bytes = await readFile(file); bytes[100] = (bytes[100] ?? 0) ^ 1;
    await writeFile(file, bytes);
    await expect(verifyGallery(directory, ES300H_GALLERY)).rejects.toThrow("SHA256 mismatch");
  });
});

test("rejects wrong measured dimensions, byte count and digest", async () => {
  for (const [change, message] of [
    [{ width: 1919 }, "dimensions mismatch"], [{ height: 1470 }, "dimensions mismatch"],
    [{ bytes: 623867 }, "byte count mismatch"], [{ sha256: "0".repeat(64) }, "SHA256 mismatch"],
  ] as const) {
    await expect(verifyGallery(assetDir, changedFirst(change))).rejects.toThrow(message);
  }
});

test("decodes the pixels and rejects truncated JPEGs even with matching length and digest", async () => {
  await withCopy(async (directory) => {
    const file = join(directory, "01-cover-front-three-quarter.jpg");
    const bytes = (await readFile(file)).subarray(0, 30000);
    await writeFile(file, bytes);
    const gallery = changedFirst({ bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") });
    await expect(verifyGallery(directory, gallery)).rejects.toThrow("cannot decode complete JPEG");
  });
});

test("refuses a Commons source reused under another gallery filename or revision", async () => {
  const first = ES300H_GALLERY.photos[0];
  if (!first) throw new Error("Missing cover");
  for (const field of ["sourceFile", "sourcePage"] as const) {
    const duplicate = { ...ES300H_GALLERY, photos: ES300H_GALLERY.photos.map((photo, index) =>
      index === 1 ? { ...photo, [field]: first[field], sourceRevisionId: 1 } : photo) };
    await expect(verifyGallery(assetDir, duplicate)).rejects.toThrow("duplicate source identity");
  }
});

test("refuses duplicate actual content even under distinct filenames and source identities", async () => {
  await withCopy(async (directory) => {
    await cp(join(directory, "01-cover-front-three-quarter.jpg"), join(directory, "02-rear-three-quarter.jpg"));
    // Keep the second source identity distinct and make all claimed measurements match.
    const gallery = { ...ES300H_GALLERY, photos: ES300H_GALLERY.photos.map((photo, index) => index === 1 ? {
      ...photo, width: 1920, height: 1471, bytes: 623868,
      sha256: "bc42269d0b71af628ba36661649f1c88ec37d26ee3cf9cf8fccb2a30517ac4a6",
    } : photo) };
    await expect(verifyGallery(directory, gallery)).rejects.toThrow("duplicate content");
  });
});

test("imports only the frozen definition with environment, filesystem, network and device access denied", async () => {
  // Preload source/data like a module loader; no application I/O is allowed during evaluation.
  const source = await readFile(join(__dirname, "ui-fixtures/manifest.ts"), "utf8");
  const json = await readFile(join(assetDir, "photos.manifest.json"), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  const denied = () => { throw new Error("Definition attempted I/O"); };
  const exports: Record<string, GalleryDefinition> = {};
  runInNewContext(code, {
    exports, require: (id: string) => {
      if (id === "./es300h-shenzhen-2025-07-17/v1/photos.manifest.json") return JSON.parse(json) as unknown;
      return denied();
    },
    process: new Proxy({}, { get: denied }), fetch: denied, setTimeout: denied, setInterval: denied,
  }, { timeout: 1000 });
  const gallery = exports["ES300H_GALLERY"];
  if (!gallery) throw new Error("Definition export missing");
  expect(gallery.scenarioKey).toBe("es300h-shenzhen-2025-07-17");
  expect(gallery.photos).toHaveLength(10);
  expect(Object.isFrozen(gallery)).toBe(true);
  expect(Object.isFrozen(gallery.photos)).toBe(true);
  expect(gallery.photos.every(Object.isFrozen)).toBe(true);
});
