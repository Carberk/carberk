import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";

import * as simpleIcons from "simple-icons";
import type { SimpleIcon } from "simple-icons";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  ManifestError,
  compareWithCatalog,
  loadBrandLogoManifest,
  parseBrandLogoManifest,
  type BrandLogoManifest,
  type CommonsLogoEntry,
  type SimpleIconsLogoEntry,
} from "../scripts/brand-logos/manifest";
import {
  MasterIntegrityError,
  assertMasterFormat,
  createMasterProvider,
  sha256Hex,
  verifyMasterSha,
} from "../scripts/brand-logos/sources";

const SHA = "a".repeat(64);

const simpleIconsEntry = {
  slug: "toyota",
  tier: "A",
  source: "simple-icons",
  simpleIconsSlug: "toyota",
  simpleIconsVersion: "16.33.0",
  sourceUrl: "https://github.com/simple-icons/simple-icons/blob/16.33.0/icons/toyota.svg",
  upstreamSource: "https://www.toyota.com/brandguidelines/logo/",
  licence: "CC0-1.0",
  licenceUrl: "https://github.com/simple-icons/simple-icons/blob/develop/LICENSE.md",
  trademark: "Toyota Motor Corporation; used to identify the vehicle make only",
  retrievedAt: "2026-09-30",
  sha256Master: SHA,
  transform: "alpha",
} as const;

const commonsEntry = {
  slug: "zaz",
  tier: "C",
  source: "commons",
  commonsFile: "File:Zaz-logo.svg",
  pageRevisionId: 123456,
  sourceUrl: "https://commons.wikimedia.org/w/index.php?title=File:Zaz-logo.svg&oldid=123456",
  downloadUrl: "https://upload.wikimedia.org/wikipedia/commons/a/ab/Zaz-logo.svg",
  licence: "PD-textlogo",
  licenceUrl: "https://commons.wikimedia.org/wiki/Template:PD-textlogo",
  trademark: "ZAZ; used to identify the vehicle make only",
  retrievedAt: "2026-09-30",
  sha256Master: SHA,
  transform: "luminance",
} as const;

const noLogoEntry = {
  slug: "prisep",
  tier: "F",
  source: null,
  reason: "Not a brand; catalog clean-up is out of scope",
} as const;

function manifestOf(...entries: unknown[]): unknown {
  return { schemaVersion: 1, entries };
}

function problemsOf(input: unknown): string {
  try {
    parseBrandLogoManifest(input);
  } catch (err) {
    expect(err).toBeInstanceOf(ManifestError);
    return (err as ManifestError).problems.join("\n");
  }
  throw new Error("expected the manifest to be rejected");
}

describe("brand logo manifest schema", () => {
  it("accepts a Simple Icons entry, a Commons entry, and an entry with no source", () => {
    const manifest = parseBrandLogoManifest(
      manifestOf(simpleIconsEntry, commonsEntry, noLogoEntry),
    );
    expect(manifest.entries.map((e) => e.source)).toEqual(["simple-icons", "commons", null]);
  });

  it.each([
    ["carlogos", "carlogos.org"],
    ["logo-cdn", "logo.clearbit.com"],
    ["press-kit", "manufacturer press kit"],
    ["flutter-uploads", "uploads/brand"],
  ])("rejects the forbidden source %s", (source) => {
    expect(problemsOf(manifestOf({ ...simpleIconsEntry, source }))).toMatch(/source/);
  });

  it("accepts identifying artwork independently of recorded license categories", () => {
    for (const licence of ["CC BY-SA 4.0", "CC0", "PD-ineligible", "manufacturer artwork"]) {
      expect(() => parseBrandLogoManifest(manifestOf({ ...commonsEntry, licence }))).not.toThrow();
    }
  });

  it("accepts bundled artwork with pinned provenance and no license metadata", () => {
    expect(() => parseBrandLogoManifest(manifestOf({
      slug: "genesis", tier: "A", source: "bundled", masterFile: "genesis.svg",
      sourceUrl: "https://www.genesis.com/logo", trademark: "Genesis Motor",
      retrievedAt: "2026-10-11", sha256Master: SHA, transform: "alpha",
    }))).not.toThrow();
  });

  it.each(["../genesis.svg", "/genesis.svg", "sub/genesis.svg", "genesis.svg?x"])(
    "refuses the unsafe bundled master path %s", (masterFile) => {
      expect(problemsOf(manifestOf({ ...commonsEntry, source: "bundled", masterFile }))).toMatch(/masterFile/);
    },
  );

  it("accepts PD-shape", () => {
    expect(() =>
      parseBrandLogoManifest(manifestOf({ ...commonsEntry, licence: "PD-shape" })),
    ).not.toThrow();
  });

  it("does not use the recorded Simple Icons license as a coverage gate", () => {
    expect(() => parseBrandLogoManifest(manifestOf({ ...simpleIconsEntry, licence: "manufacturer artwork" }))).not.toThrow();
  });

  it("rejects a Commons download that is not from upload.wikimedia.org", () => {
    for (const downloadUrl of [
      "https://www.carlogos.org/logo/Zaz.png",
      "http://upload.wikimedia.org/a/Zaz-logo.svg",
      "https://upload.wikimedia.org.evil.example/Zaz-logo.svg",
      "https://raw.githubusercontent.com/filippofilip95/car-logos-dataset/master/logos/zaz.png",
    ]) {
      expect(problemsOf(manifestOf({ ...commonsEntry, downloadUrl }))).toMatch(/downloadUrl/);
    }
  });

  it("rejects a Commons file page that is not on commons.wikimedia.org", () => {
    expect(
      problemsOf(manifestOf({ ...commonsEntry, sourceUrl: "https://example.com/File:Zaz-logo.svg" })),
    ).toMatch(/sourceUrl/);
  });

  it("requires a well-formed sha256 of the master", () => {
    for (const sha256Master of ["", "abc", "A".repeat(64), "g".repeat(64), "a".repeat(63)]) {
      expect(problemsOf(manifestOf({ ...simpleIconsEntry, sha256Master }))).toMatch(/sha256Master/);
    }
  });

  it("requires a reason when there is no source", () => {
    expect(problemsOf(manifestOf({ slug: "kuba", tier: "F", source: null }))).toMatch(/reason/);
    expect(problemsOf(manifestOf({ slug: "kuba", tier: "F", source: null, reason: "  " }))).toMatch(
      /reason/,
    );
  });

  it("rejects an unknown tier, a bad date, an unknown transform, and duplicate slugs", () => {
    expect(problemsOf(manifestOf({ ...simpleIconsEntry, tier: "Z" }))).toMatch(/tier/);
    expect(problemsOf(manifestOf({ ...simpleIconsEntry, retrievedAt: "30/09/2026" }))).toMatch(
      /retrievedAt/,
    );
    expect(problemsOf(manifestOf({ ...simpleIconsEntry, transform: "recolour" }))).toMatch(
      /transform/,
    );
    expect(problemsOf(manifestOf(noLogoEntry, noLogoEntry))).toMatch(/duplicate/i);
  });

  it.each(["iž", "москвич", "паз", "tofaş"])(
    "accepts the catalog slug %s for a lawful sourced logo",
    (slug) => {
      expect(() => parseBrandLogoManifest(manifestOf({ ...commonsEntry, slug }))).not.toThrow();
    },
  );

  it("rejects a slug that cannot be a plain object-key segment when a logo is imported", () => {
    for (const slug of ["Toyota", "toyota/../x", "toyota%2F..%2Fx", "..", "a?b", "a#b", "то́йота", "a b"]) {
      expect(problemsOf(manifestOf({ ...simpleIconsEntry, slug }))).toMatch(/slug/);
    }
  });

  it("rejects the wrong schema version and non-objects", () => {
    expect(problemsOf({ schemaVersion: 2, entries: [] })).toMatch(/schemaVersion/);
    expect(problemsOf(null)).toMatch(/object/);
    expect(problemsOf({ schemaVersion: 1, entries: "nope" })).toMatch(/entries/);
  });

  it("reports every problem at once", () => {
    const problems = problemsOf(
      manifestOf({ ...simpleIconsEntry, tier: "Z", sha256Master: "x" }, { ...commonsEntry, downloadUrl: "http://example.com/logo.svg" }),
    );
    expect(problems).toMatch(/tier/);
    expect(problems).toMatch(/sha256Master/);
    expect(problems).toMatch(/downloadUrl/);
  });
});

describe("master checksum and format", () => {
  const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"/>');
  const entryFor = (bytes: Uint8Array): CommonsLogoEntry => ({
    ...(commonsEntry as unknown as CommonsLogoEntry),
    sha256Master: sha256Hex(bytes),
  });

  it("hashes with sha256", () => {
    expect(sha256Hex(new TextEncoder().encode("abc"))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("accepts a master whose sha256 matches and rejects one that does not", () => {
    expect(() => verifyMasterSha(entryFor(svg), svg)).not.toThrow();
    const tampered = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>');
    expect(() => verifyMasterSha(entryFor(svg), tampered)).toThrow(MasterIntegrityError);
  });

  it("accepts SVG (with an XML prolog or BOM) and PNG, and rejects HTML saved as an image", () => {
    const entry = entryFor(svg);
    const prolog = new TextEncoder().encode('﻿<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg"/>');
    const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    const html = new TextEncoder().encode("<!DOCTYPE html><html><body>429 Too Many Requests</body></html>");
    expect(() => assertMasterFormat(entry, svg)).not.toThrow();
    expect(() => assertMasterFormat(entry, prolog)).not.toThrow();
    expect(() => assertMasterFormat(entry, png)).not.toThrow();
    expect(() => assertMasterFormat(entry, html)).toThrow(MasterIntegrityError);
    expect(() => assertMasterFormat(entry, new Uint8Array())).toThrow(MasterIntegrityError);
  });

  it("accepts JPEG and WebP manufacturer artwork", () => {
    const entry = entryFor(svg);
    expect(() => assertMasterFormat(entry, Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]))).not.toThrow();
    const webp = new TextEncoder().encode("RIFFxxxxWEBPVP8 ");
    expect(() => assertMasterFormat(entry, webp)).not.toThrow();
    expect(() => assertMasterFormat(entry, new TextEncoder().encode("RIFFxxxxWAVE"))).toThrow(MasterIntegrityError);
  });
});

describe("bundled manufacturer artwork", () => {
  it("reads the pinned master locally and refuses altered bytes", async () => {
    const dir = await mkdtemp(join(tmpdir(), "brand-logo-bundled-"));
    const bytes = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>');
    const entry = {
      ...commonsEntry, source: "bundled", masterFile: "genesis.svg", sha256Master: sha256Hex(bytes),
    } as unknown as Parameters<ReturnType<typeof createMasterProvider>["load"]>[0];
    try {
      await writeFile(join(dir, "genesis.svg"), bytes);
      const provider = createMasterProvider({ cacheDir: dir, bundledDir: dir });
      expect(Buffer.from(await provider.load(entry))).toEqual(Buffer.from(bytes));
      await writeFile(join(dir, "genesis.svg"), new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>'));
      await expect(provider.load(entry)).rejects.toThrow(MasterIntegrityError);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("Commons master downloads", () => {
  let server: Server;
  let origin: string;
  let cacheDir: string;
  const hits: string[] = [];
  const good = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><rect width="1" height="1"/></svg>');

  beforeAll(async () => {
    server = createServer((req, res) => {
      hits.push(req.url ?? "");
      if (req.url === "/good.svg") {
        res.writeHead(200, { "content-type": "image/svg+xml" }).end(good);
      } else if (req.url === "/html.svg") {
        res.writeHead(200, { "content-type": "image/svg+xml" }).end("<html>rate limited</html>");
      } else {
        res.writeHead(404).end();
      }
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    cacheDir = await mkdtemp(join(tmpdir(), "brand-logo-cache-"));
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
    await rm(cacheDir, { recursive: true, force: true });
  });

  const entryAt = (path: string, sha256Master: string): CommonsLogoEntry => ({
    ...(commonsEntry as unknown as CommonsLogoEntry),
    downloadUrl: `${origin}${path}`,
    sha256Master,
  });

  it("downloads once, verifies the checksum, and serves later loads from the cache", async () => {
    const provider = createMasterProvider({ cacheDir, allowedHosts: ["127.0.0.1"] });
    const entry = entryAt("/good.svg", sha256Hex(good));
    expect(Buffer.from(await provider.load(entry))).toEqual(Buffer.from(good));
    expect(Buffer.from(await provider.load(entry))).toEqual(Buffer.from(good));
    expect(hits.filter((h) => h === "/good.svg")).toHaveLength(1);
    expect((await readdir(cacheDir)).length).toBe(1);
  });

  it("rejects a download whose checksum differs and does not cache it", async () => {
    const dir = await mkdtemp(join(tmpdir(), "brand-logo-cache-"));
    const provider = createMasterProvider({ cacheDir: dir, allowedHosts: ["127.0.0.1"] });
    await expect(provider.load(entryAt("/good.svg", SHA))).rejects.toThrow(MasterIntegrityError);
    expect(await readdir(dir)).toEqual([]);
    await rm(dir, { recursive: true, force: true });
  });

  it("rejects an HTML error page served as an image", async () => {
    const dir = await mkdtemp(join(tmpdir(), "brand-logo-cache-"));
    const provider = createMasterProvider({ cacheDir: dir, allowedHosts: ["127.0.0.1"] });
    const html = new TextEncoder().encode("<html>rate limited</html>");
    await expect(provider.load(entryAt("/html.svg", sha256Hex(html)))).rejects.toThrow(
      MasterIntegrityError,
    );
    await rm(dir, { recursive: true, force: true });
  });

  it("refuses a host outside the allow-list before any request is made", async () => {
    const before = hits.length;
    const provider = createMasterProvider({ cacheDir, allowedHosts: ["upload.wikimedia.org"] });
    await expect(provider.load(entryAt("/good.svg", sha256Hex(good)))).rejects.toThrow(/host/i);
    expect(hits.length).toBe(before);
  });

  it("re-downloads when the cached file no longer matches the checksum", async () => {
    const dir = await mkdtemp(join(tmpdir(), "brand-logo-cache-"));
    const provider = createMasterProvider({ cacheDir: dir, allowedHosts: ["127.0.0.1"] });
    const entry = entryAt("/good.svg", sha256Hex(good));
    await provider.load(entry);
    const [file] = await readdir(dir);
    const { writeFile } = await import("node:fs/promises");
    await writeFile(join(dir, file as string), "corrupted");
    const before = hits.length;
    expect(Buffer.from(await provider.load(entry))).toEqual(Buffer.from(good));
    expect(hits.length).toBe(before + 1);
    await rm(dir, { recursive: true, force: true });
  });
});

describe("committed brand logo manifest", () => {
  let manifest: BrandLogoManifest;
  const brands = JSON.parse(
    readFileSync(new URL("../prisma/seed/brands.json", import.meta.url), "utf-8"),
  ) as { slug: string }[];
  const catalogSlugs = brands.map((b) => b.slug);

  beforeAll(() => {
    manifest = loadBrandLogoManifest();
  });

  it("lists every catalog brand exactly once, so coverage is explicit", () => {
    const { missing, unknown } = compareWithCatalog(manifest, catalogSlugs);
    expect({ missing, unknown }).toEqual({ missing: [], unknown: [] });
    expect(manifest.entries).toHaveLength(catalogSlugs.length);
  });

  it("records a source and checksum for selected artwork, or an explicit unresolved identity", () => {
    for (const entry of manifest.entries) {
      if (entry.source === null) {
        expect(entry.reason.trim().length).toBeGreaterThan(0);
      } else {
        expect(entry.sourceUrl).toMatch(/^https:\/\//);
        expect(entry.sha256Master).toMatch(/^[0-9a-f]{64}$/);
        if (entry.source === "bundled") expect(entry.masterFile).toMatch(/\.(svg|png|jpe?g|webp)$/);
      }
    }
    expect(manifest.entries.some((e) => e.source === "simple-icons")).toBe(true);
  });

  it("loads all 54 added identifying masters from the repository with matching checksums", async () => {
    const provider = createMasterProvider({ cacheDir: join(tmpdir(), "unused-bundled-logo-cache") });
    const bundled = manifest.entries.filter((entry) => entry.source === "bundled");
    expect(bundled).toHaveLength(54);
    expect(manifest.entries.filter((entry) => entry.source === null)).toEqual([]);
    for (const entry of bundled) {
      const master = await provider.load(entry);
      expect(sha256Hex(master), entry.slug).toBe(entry.sha256Master);
    }
  });

  it("pins authored category artwork to durable commit URLs with matching source hashes", () => {
    const recorded = JSON.parse(readFileSync(new URL("../prisma/seed/brand-logos.manifest.json", import.meta.url), "utf8")) as {
      entries: { artworkKind?: string; sourceUrl: string; upstreamSource: string; upstreamSha256: string; sha256Master: string }[];
    };
    const categories = recorded.entries.filter(entry => entry.artworkKind === "category");
    expect(categories).toHaveLength(2);
    for (const entry of categories) {
      expect(entry.sourceUrl).toMatch(/\/blob\/[0-9a-f]{40}\//);
      expect(entry.upstreamSource).toBe(entry.sourceUrl);
      expect(entry.upstreamSha256).toBe(entry.sha256Master);
    }
  });

  it("pins every Simple Icons entry to the installed package: same icon, source and bytes", () => {
    const installed = JSON.parse(
      readFileSync(new URL("../node_modules/simple-icons/package.json", import.meta.url), "utf-8"),
    ) as { version: string };
    const icons = new Map(
      Object.values(simpleIcons)
        .filter((v): v is SimpleIcon => typeof v === "object" && v !== null && "slug" in v)
        .map((icon) => [icon.slug, icon]),
    );
    const entries = manifest.entries.filter(
      (e): e is SimpleIconsLogoEntry => e.source === "simple-icons",
    );
    expect(entries.length).toBeGreaterThan(30);
    for (const entry of entries) {
      const icon = icons.get(entry.simpleIconsSlug);
      expect(icon, `${entry.slug}: Simple Icons has no ${entry.simpleIconsSlug}`).toBeDefined();
      expect(entry.simpleIconsVersion).toBe(installed.version);
      expect(entry.upstreamSource).toBe(icon?.source ?? null);
      expect(entry.sha256Master, entry.slug).toBe(sha256Hex(new TextEncoder().encode(icon?.svg)));
    }
  });
});
