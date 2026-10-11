import { createHash } from "node:crypto";
import { mkdir, readFile, realpath, rename, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import {
  COMMONS_DOWNLOAD_HOST,
  isBundledMasterName,
  type BundledLogoEntry,
  type CommonsLogoEntry,
  type SimpleIconsLogoEntry,
  type SourcedLogoEntry,
} from "./manifest";

/** Supplies the master file of a manifest entry. Implementations must not skip the checksum check. */
export interface MasterProvider {
  load(entry: SourcedLogoEntry): Promise<Uint8Array>;
}

export class MasterIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MasterIntegrityError";
  }
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Throws MasterIntegrityError unless the bytes hash to the entry's sha256Master. */
export function verifyMasterSha(entry: SourcedLogoEntry, bytes: Uint8Array): void {
  const actual = sha256Hex(bytes);
  if (actual !== entry.sha256Master) {
    throw new MasterIntegrityError(
      `${entry.slug}: sha256 of the master is ${actual}, but the manifest records ${entry.sha256Master}`,
    );
  }
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const SVG_START = /^(?:<\?xml|<svg|<!--|<!doctype\s+svg)/i;

/** Checks supported image signatures before decoding; rejects HTML error pages. */
export function assertMasterFormat(entry: SourcedLogoEntry, bytes: Uint8Array): void {
  if (bytes.byteLength === 0) {
    throw new MasterIntegrityError(`${entry.slug}: the master file is empty`);
  }
  if (PNG_SIGNATURE.every((byte, i) => bytes[i] === byte)) return;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return;
  if (bytes.byteLength >= 12 && new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" &&
    new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP") return;
  // TextDecoder drops a leading byte order mark, so it never hides the SVG start.
  const text = new TextDecoder("utf-8").decode(bytes).trimStart();
  if (SVG_START.test(text) && /<svg[\s>]/i.test(text)) return;
  throw new MasterIntegrityError(`${entry.slug}: the master file is not SVG, PNG, JPEG or WebP`);
}

export interface MasterProviderOptions {
  /** Gitignored directory where downloaded Commons files are cached. */
  cacheDir: string;
  /** Repository-pinned masters; injectable for local filesystem tests. */
  bundledDir?: string;
  /** Hosts a download may come from. Defaults to upload.wikimedia.org. */
  allowedHosts?: readonly string[];
  fetchFn?: typeof fetch;
}

const USER_AGENT =
  "AutoTM-logo-import/1.0 (https://github.com/bagtyyarkovusov/auto.tm-rewrite; operator script)";
const MAX_ATTEMPTS = 4;
const LOOPBACK_HOSTS = ["127.0.0.1", "localhost", "[::1]"];

const nodeRequire = createRequire(import.meta.url);
let simpleIconsCache: { version: string; svgBySlug: Map<string, string> } | undefined;

async function installedSimpleIcons() {
  if (simpleIconsCache) return simpleIconsCache;
  const entryPoint = nodeRequire.resolve("simple-icons");
  const { version } = JSON.parse(
    readFileSync(join(dirname(entryPoint), "package.json"), "utf-8"),
  ) as { version: string };
  const icons = (await import("simple-icons")) as Record<string, unknown>;
  const svgBySlug = new Map<string, string>();
  for (const value of Object.values(icons)) {
    if (typeof value === "object" && value !== null && "slug" in value && "svg" in value) {
      const icon = value as { slug: string; svg: string };
      svgBySlug.set(icon.slug, icon.svg);
    }
  }
  simpleIconsCache = { version, svgBySlug };
  return simpleIconsCache;
}

async function loadSimpleIcon(entry: SimpleIconsLogoEntry): Promise<Uint8Array> {
  const { version, svgBySlug } = await installedSimpleIcons();
  if (version !== entry.simpleIconsVersion) {
    throw new MasterIntegrityError(
      `${entry.slug}: the manifest pins simple-icons ${entry.simpleIconsVersion}, but ${version} is installed`,
    );
  }
  const svg = svgBySlug.get(entry.simpleIconsSlug);
  if (svg === undefined) {
    throw new MasterIntegrityError(
      `${entry.slug}: simple-icons ${version} has no icon "${entry.simpleIconsSlug}"`,
    );
  }
  return new TextEncoder().encode(svg);
}

function cacheFileName(entry: CommonsLogoEntry): string {
  const extension = /\.(svg|png)$/i.exec(new URL(entry.downloadUrl).pathname)?.[1]?.toLowerCase() ?? "bin";
  return `${entry.slug}-${entry.sha256Master.slice(0, 16)}.${extension}`;
}

async function download(entry: CommonsLogoEntry, fetchFn: typeof fetch): Promise<Uint8Array> {
  let lastStatus = 0;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    // A redirect would leave the allow-listed host unnoticed, so fail on it.
    const response = await fetchFn(entry.downloadUrl, {
      headers: { "User-Agent": USER_AGENT },
      redirect: "error",
    });
    lastStatus = response.status;
    if (response.ok) return new Uint8Array(await response.arrayBuffer());
    if (response.status !== 429 && response.status < 500) break;
    const wait = Number(response.headers.get("retry-after")) || 2 * attempt;
    await new Promise((resolve) => setTimeout(resolve, Math.min(wait, 30) * 1000));
  }
  throw new Error(`${entry.slug}: download of ${entry.downloadUrl} failed with HTTP ${lastStatus}`);
}

/**
 * Simple Icons masters come from the pinned npm package, so they need no
 * network. Commons masters are downloaded from an allow-listed host into the
 * cache, checked against the manifest's sha256, and re-used only while the
 * cached bytes still match it.
 */
export function createMasterProvider(options: MasterProviderOptions): MasterProvider {
  const allowedHosts = options.allowedHosts ?? [COMMONS_DOWNLOAD_HOST];
  const fetchFn = options.fetchFn ?? fetch;

  async function loadBundled(entry: BundledLogoEntry): Promise<Uint8Array> {
    if (!isBundledMasterName(entry.masterFile)) throw new MasterIntegrityError(`${entry.slug}: unsafe bundled masterFile`);
    const directory = await realpath(options.bundledDir ?? fileURLToPath(new URL("../../prisma/seed/brand-logo-masters", import.meta.url)));
    const file = await realpath(join(directory, entry.masterFile));
    if (relative(directory, file) !== entry.masterFile) throw new MasterIntegrityError(`${entry.slug}: bundled master leaves its directory`);
    return new Uint8Array(await readFile(file));
  }

  async function loadCommons(entry: CommonsLogoEntry): Promise<Uint8Array> {
    const url = new URL(entry.downloadUrl);
    if (!allowedHosts.includes(url.hostname)) {
      throw new Error(`${entry.slug}: host ${url.hostname} is not an allowed logo source`);
    }
    if (url.protocol !== "https:" && !LOOPBACK_HOSTS.includes(url.hostname)) {
      throw new Error(`${entry.slug}: logo downloads must use https`);
    }

    const cached = join(options.cacheDir, cacheFileName(entry));
    try {
      const bytes = new Uint8Array(await readFile(cached));
      if (sha256Hex(bytes) === entry.sha256Master) return bytes;
    } catch {
      // Not cached yet; download it.
    }

    const bytes = await download(entry, fetchFn);
    assertMasterFormat(entry, bytes);
    verifyMasterSha(entry, bytes);

    await mkdir(options.cacheDir, { recursive: true });
    const partial = `${cached}.${process.pid}.part`;
    await writeFile(partial, bytes);
    await rename(partial, cached);
    return bytes;
  }

  return {
    async load(entry) {
      const bytes = entry.source === "simple-icons" ? await loadSimpleIcon(entry)
        : entry.source === "bundled" ? await loadBundled(entry) : await loadCommons(entry);
      assertMasterFormat(entry, bytes);
      verifyMasterSha(entry, bytes);
      return bytes;
    },
  };
}
