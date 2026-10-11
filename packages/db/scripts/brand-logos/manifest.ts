import { readFileSync } from "node:fs";

/**
 * The provenance manifest for brand logos: one entry per catalog brand.
 *
 * Source records establish which identifying artwork was selected and pin
 * its bytes. Recorded license categories are descriptive metadata, not a
 * coverage gate. Bundled masters allow additional verified manufacturer art
 * without introducing third-party logo services into the app.
 */

export const LOGO_TIERS = ["A", "B", "C", "D", "E", "F"] as const;
export type LogoTier = (typeof LOGO_TIERS)[number];

/**
 * How a master becomes a black-on-transparent mask.
 * - `alpha`: the shape is the master's alpha channel; colour is ignored.
 * - `luminance`: the shape is alpha times darkness, so light areas become
 *   holes. For full-colour logos that sit on a white or coloured field.
 */
export const LOGO_TRANSFORMS = ["alpha", "luminance"] as const;
export type LogoTransform = (typeof LOGO_TRANSFORMS)[number];

interface EntryBase {
  slug: string;
  tier: LogoTier;
}

interface SourcedEntryBase extends EntryBase {
  /** Where a person can check the file: the icon on GitHub, or a pinned Commons file page. */
  sourceUrl: string;
  licence?: string;
  licenceUrl?: string;
  /** Manufacturer identity, or the explicit identity of a category illustration. */
  trademark: string;
  /** ISO date the file was checked. */
  retrievedAt: string;
  /** sha256 of the master file exactly as delivered by the source. */
  sha256Master: string;
  transform: LogoTransform;
}

export interface SimpleIconsLogoEntry extends SourcedEntryBase {
  source: "simple-icons";
  simpleIconsSlug: string;
  simpleIconsVersion: string;
  /** The brand's own page, as recorded by Simple Icons. */
  upstreamSource: string | null;
}

export interface CommonsLogoEntry extends SourcedEntryBase {
  source: "commons";
  commonsFile: string;
  /** Revision of the file page used for the source record. */
  pageRevisionId: number;
  downloadUrl: string;
}

export interface BundledLogoEntry extends SourcedEntryBase {
  source: "bundled";
  /** A plain filename under the repository's brand-logo-masters directory. */
  masterFile: string;
}

export interface NoLogoEntry extends EntryBase {
  source: null;
  reason: string;
}

export type SourcedLogoEntry = SimpleIconsLogoEntry | CommonsLogoEntry | BundledLogoEntry;
export type ManifestEntry = SourcedLogoEntry | NoLogoEntry;

export interface BrandLogoManifest {
  schemaVersion: 1;
  entries: ManifestEntry[];
}

export class ManifestError extends Error {
  constructor(readonly problems: string[]) {
    super(`Invalid brand logo manifest:\n- ${problems.join("\n- ")}`);
    this.name = "ManifestError";
  }
}

export const MANIFEST_PATH = new URL("../../prisma/seed/brand-logos.manifest.json", import.meta.url)
  .pathname;

export const COMMONS_DOWNLOAD_HOST = "upload.wikimedia.org";
const COMMONS_PAGE_HOST = "commons.wikimedia.org";

const SHA256 = /^[0-9a-f]{64}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const OBJECT_KEY_SLUG = /^[\p{Ll}\p{Lo}0-9]+(?:-[\p{Ll}\p{Lo}0-9]+)*$/u;

export function isBundledMasterName(value: unknown): value is string {
  return typeof value === "string" && /^[\p{Ll}\p{Lo}0-9-]+\.(?:svg|png|jpe?g|webp)$/u.test(value);
}

type Json = Record<string, unknown>;

function isRecord(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function httpsUrl(value: unknown): URL | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

function isHttpUrl(value: unknown): boolean {
  if (typeof value !== "string") return false;
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isRealDate(value: unknown): boolean {
  if (typeof value !== "string" || !ISO_DATE.test(value)) return false;
  return !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

function checkSourcedFields(raw: Json, at: string, problems: string[]): void {
  if (httpsUrl(raw["sourceUrl"]) === null) problems.push(`${at}: sourceUrl must be an https URL`);
  if (!nonEmpty(raw["trademark"])) problems.push(`${at}: trademark must name the mark's owner`);
  if (!isRealDate(raw["retrievedAt"])) problems.push(`${at}: retrievedAt must be a YYYY-MM-DD date`);
  if (typeof raw["sha256Master"] !== "string" || !SHA256.test(raw["sha256Master"])) {
    problems.push(`${at}: sha256Master must be 64 lowercase hex characters`);
  }
  if (!(LOGO_TRANSFORMS as readonly unknown[]).includes(raw["transform"])) {
    problems.push(`${at}: transform must be one of ${LOGO_TRANSFORMS.join(", ")}`);
  }
  if (typeof raw["slug"] === "string" && !OBJECT_KEY_SLUG.test(raw["slug"])) {
    problems.push(`${at}: slug must be lowercase letters, digits and hyphens to be used in an object key`);
  }
}

function checkSimpleIcons(raw: Json, at: string, problems: string[]): void {
  if (typeof raw["simpleIconsSlug"] !== "string" || !/^[a-z0-9]+$/.test(raw["simpleIconsSlug"])) {
    problems.push(`${at}: simpleIconsSlug must be a Simple Icons slug`);
  }
  if (typeof raw["simpleIconsVersion"] !== "string" || !/^\d+\.\d+\.\d+$/.test(raw["simpleIconsVersion"])) {
    problems.push(`${at}: simpleIconsVersion must be an exact version such as 16.33.0`);
  }
  const source = httpsUrl(raw["sourceUrl"]);
  if (source?.hostname !== "github.com" || !source.pathname.startsWith("/simple-icons/simple-icons/")) {
    problems.push(`${at}: sourceUrl must point into github.com/simple-icons/simple-icons`);
  }
  const upstream = raw["upstreamSource"];
  if (upstream !== null && !isHttpUrl(upstream)) {
    problems.push(`${at}: upstreamSource must be a URL or null`);
  }
  checkSourcedFields(raw, at, problems);
}

function checkCommons(raw: Json, at: string, problems: string[]): void {
  if (typeof raw["commonsFile"] !== "string" || !raw["commonsFile"].startsWith("File:")) {
    problems.push(`${at}: commonsFile must be a "File:..." title`);
  }
  if (!Number.isInteger(raw["pageRevisionId"]) || (raw["pageRevisionId"] as number) <= 0) {
    problems.push(`${at}: pageRevisionId must be the file page revision the licence was verified on`);
  }
  if (httpsUrl(raw["sourceUrl"])?.hostname !== COMMONS_PAGE_HOST) {
    problems.push(`${at}: sourceUrl must be a file page on ${COMMONS_PAGE_HOST}`);
  }
  if (httpsUrl(raw["downloadUrl"])?.hostname !== COMMONS_DOWNLOAD_HOST) {
    problems.push(`${at}: downloadUrl must be an https URL on ${COMMONS_DOWNLOAD_HOST}`);
  }
  checkSourcedFields(raw, at, problems);
}

export function parseBrandLogoManifest(input: unknown): BrandLogoManifest {
  const problems: string[] = [];
  if (!isRecord(input)) throw new ManifestError(["manifest must be an object"]);
  if (input["schemaVersion"] !== 1) problems.push("schemaVersion must be 1");
  const entries = input["entries"];
  if (!Array.isArray(entries)) {
    throw new ManifestError([...problems, "entries must be an array"]);
  }

  const seen = new Set<string>();
  entries.forEach((raw: unknown, index) => {
    if (!isRecord(raw)) {
      problems.push(`entries[${index}] must be an object`);
      return;
    }
    const slug = raw["slug"];
    const at = `entries[${index}]${typeof slug === "string" ? ` (${slug})` : ""}`;
    if (!nonEmpty(slug)) problems.push(`${at}: slug is required`);
    else if (seen.has(slug)) problems.push(`${at}: duplicate slug`);
    else seen.add(slug);
    if (!(LOGO_TIERS as readonly unknown[]).includes(raw["tier"])) {
      problems.push(`${at}: tier must be one of ${LOGO_TIERS.join(", ")}`);
    }

    switch (raw["source"]) {
      case "simple-icons":
        checkSimpleIcons(raw, at, problems);
        break;
      case "commons":
        checkCommons(raw, at, problems);
        break;
      case "bundled":
        checkSourcedFields(raw, at, problems);
        if (!isBundledMasterName(raw["masterFile"])) problems.push(`${at}: masterFile must be a plain supported-image filename`);
        break;
      case null:
        if (!nonEmpty(raw["reason"])) problems.push(`${at}: an entry with no source needs a reason`);
        break;
      default:
        problems.push(`${at}: source must be "simple-icons", "commons", "bundled" or null`);
    }
  });

  if (problems.length > 0) throw new ManifestError(problems);
  return input as unknown as BrandLogoManifest;
}

export function loadBrandLogoManifest(path: string = MANIFEST_PATH): BrandLogoManifest {
  return parseBrandLogoManifest(JSON.parse(readFileSync(path, "utf-8")) as unknown);
}

/** Every catalog brand must be listed, so coverage is explicit; nothing else may be. */
export function compareWithCatalog(
  manifest: BrandLogoManifest,
  catalogSlugs: readonly string[],
): { missing: string[]; unknown: string[] } {
  const listed = new Set(manifest.entries.map((e) => e.slug));
  const catalog = new Set(catalogSlugs);
  return {
    missing: [...catalog].filter((slug) => !listed.has(slug)).sort(),
    unknown: [...listed].filter((slug) => !catalog.has(slug)).sort(),
  };
}
