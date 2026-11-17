






export const BRAND_LOGO_MAX_BYTES = 200 * 1024;


export const BRAND_LOGO_MAX_ASPECT_RATIO = 1.25;


export const BRAND_LOGO_RASTER_SIZE = 256;

export const BRAND_LOGO_CONTENT_TYPES = [
  "image/svg+xml",
  "image/png",
  "image/webp",
] as const;
export type BrandLogoContentType = (typeof BRAND_LOGO_CONTENT_TYPES)[number];


export type StoredBrandLogoType = "image/png" | "image/webp";

const FORMAT_BY_CONTENT_TYPE: Record<BrandLogoContentType, string> = {
  "image/svg+xml": "svg",
  "image/png": "png",
  "image/webp": "webp",
};

export const BRAND_LOGO_REJECTIONS = [
  "LOGO_UNSUPPORTED_TYPE",
  "LOGO_TOO_LARGE",
  "LOGO_EMPTY",
  "LOGO_UNREADABLE",
  "LOGO_TYPE_MISMATCH",
  "LOGO_NOT_SQUARE",
  "LOGO_UNSAFE_SVG",
  "LOGO_UPLOAD_MISSING",
] as const;
export type BrandLogoRejection = (typeof BRAND_LOGO_REJECTIONS)[number];

export const BRAND_LOGO_REJECTION_MESSAGES: Record<BrandLogoRejection, string> = {
  LOGO_UNSUPPORTED_TYPE: "Logo must be an SVG, PNG, or WebP file",
  LOGO_TOO_LARGE: `Logo must be at most ${BRAND_LOGO_MAX_BYTES / 1024} KB`,
  LOGO_EMPTY: "Logo file is empty",
  LOGO_UNREADABLE: "Logo file could not be read as an image",
  LOGO_TYPE_MISMATCH: "Logo file content does not match its declared type",
  LOGO_NOT_SQUARE: "Logo must be roughly square (sides within 1:1.25)",
  LOGO_UNSAFE_SVG:
    "SVG logo contains a DOCTYPE, scripts, event handlers, prefixed elements, external references, or embedded content",
  LOGO_UPLOAD_MISSING: "Uploaded logo file was not found; upload it again",
};

export function isBrandLogoContentType(value: string): value is BrandLogoContentType {
  return (BRAND_LOGO_CONTENT_TYPES as readonly string[]).includes(value);
}


export function checkBrandLogoFile(
  contentType: string,
  sizeBytes: number,
): BrandLogoRejection | null {
  if (!isBrandLogoContentType(contentType)) return "LOGO_UNSUPPORTED_TYPE";
  if (sizeBytes === 0) return "LOGO_EMPTY";
  if (sizeBytes > BRAND_LOGO_MAX_BYTES) return "LOGO_TOO_LARGE";
  return null;
}


export function checkBrandLogoImage(
  contentType: BrandLogoContentType,
  image: { format: string; width: number; height: number } | null,
): BrandLogoRejection | null {
  if (!image || image.width <= 0 || image.height <= 0) return "LOGO_UNREADABLE";
  if (image.format !== FORMAT_BY_CONTENT_TYPE[contentType]) return "LOGO_TYPE_MISMATCH";
  const ratio = Math.max(image.width, image.height) / Math.min(image.width, image.height);
  if (ratio > BRAND_LOGO_MAX_ASPECT_RATIO) return "LOGO_NOT_SQUARE";
  return null;
}




const UNSAFE_SVG_PATTERNS: RegExp[] = [
  /<!DOCTYPE/i,
  /<!ENTITY/i,

  /<\s*\/?\s*[A-Za-z_][\w.-]*:[A-Za-z_]/,
  /<\s*script\b/i,
  /<\s*foreignObject\b/i,
  /<\s*(iframe|embed|object|image|animate\w*|set)\b/i,
  /\son[a-z]+\s*=/i,
  /javascript\s*:/i,

  /href\s*=\s*(?!\s|["']?\s*#)/i,
  /url\(\s*(?!\s|["']?\s*#)/i,
  /@import/i,

  /\\/,
];

export function checkBrandLogoSvgSafety(svgText: string): BrandLogoRejection | null {
  return UNSAFE_SVG_PATTERNS.some((pattern) => pattern.test(svgText))
    ? "LOGO_UNSAFE_SVG"
    : null;
}

export function storedBrandLogoType(contentType: BrandLogoContentType): StoredBrandLogoType {
  return contentType === "image/webp" ? "image/webp" : "image/png";
}





export function brandLogoKey(slug: string, version: string, type: StoredBrandLogoType): string {
  return `brands/${slug}/${version}/logo.${type === "image/webp" ? "webp" : "png"}`;
}

const UUID_PATTERN = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";






export function newAdminLogoVersion(nowMs: number, uniqueId: string): string {
  return `v${nowMs}-${uniqueId}`;
}



const STORED_LOGO_KEY = new RegExp(
  `^brands/([^/]+)/((imp-([0-9a-f]{12})|v\\d+)(?:-${UUID_PATTERN})?)/logo\\.(?:png|webp)$`,
);

export interface StoredBrandLogo {

  slug: string;

  version: string;
  owner: "imported" | "admin";

  directory: string;

  contentIdentity?: string;
}






export function parseStoredBrandLogoKey(key: string): StoredBrandLogo | null {
  const match = STORED_LOGO_KEY.exec(key);
  if (!match) return null;
  const slug = match[1] as string;


  if (slug === "." || slug === ".." || slug.includes("\\")) return null;
  const version = match[2] as string;
  const hash = match[4];
  const owner = hash === undefined ? "admin" : "imported";
  return {
    slug,
    version,
    owner,
    directory: `brands/${slug}/${version}/`,
    ...(hash === undefined ? {} : { contentIdentity: `imp-${hash}` }),
  };
}

export type BrandLogoCleanupTarget =
  | { kind: "directory"; prefix: string }
  | { kind: "object"; key: string };






export function brandLogoCleanupTarget(key: string): BrandLogoCleanupTarget {
  const stored = parseStoredBrandLogoKey(key);
  return stored ? { kind: "directory", prefix: stored.directory } : { kind: "object", key };
}


export function pendingBrandLogoKey(slug: string, uploadId: string): string {
  return `pending/brands/${slug}/${uploadId}`;
}

export function isPendingBrandLogoKey(slug: string, key: string): boolean {
  const prefix = `pending/brands/${slug}/`;
  return key.startsWith(prefix) && /^[0-9a-f-]{36}$/.test(key.slice(prefix.length));
}
