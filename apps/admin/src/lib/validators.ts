export const ADMIN_RETURN_TO_HEADER = "x-admin-return-to";

/**
 * Validates a returnTo URL parameter.
 * Accepts only relative internal admin paths.
 * Rejects absolute URLs, protocol-relative URLs, cross-host redirects,
 * and paths with dangerous characters.
 */
export function validateReturnTo(
  url: string | null | undefined,
): string | null {
  if (!url) return null;

  // Must start with /
  if (!url.startsWith("/")) return null;

  // Reject protocol-relative
  if (url.startsWith("//")) return null;

  // Reject absolute URLs
  if (url.includes("://")) return null;

  // Reject javascript:, data:, vbscript:, etc.
  if (/^\/[a-zA-Z][a-zA-Z0-9+\-.]*:/.test(url)) return null;

  // Allow only safe characters in the path
  if (!/^\/[a-zA-Z0-9_\-/.?&=%]*$/.test(url)) return null;

  const path = url.split("?")[0] ?? "";
  const allowedPrefixes = ["/reports", "/audit", "/listings", "/users", "/catalog", "/workspace", "/business-admission", "/services", "/diagnostics", "/improvement", "/operations"];
  const isAdminPath = path === "/" || allowedPrefixes.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
  if (!isAdminPath) return null;

  return url;
}

const DEFAULT_ADMIN_ORIGIN = process.env["ADMIN_ORIGIN"];

/**
 * Validates the Origin header of a request against the configured admin origin.
 * No Referer fallback.
 */
export function validateOrigin(
  request: Request,
  configuredOrigin?: string,
): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;

  const expected = configuredOrigin ?? DEFAULT_ADMIN_ORIGIN;
  if (!expected) {
    // If no origin is configured, derive from the request URL as a fallback
    try {
      const url = new URL(request.url);
      const derived = `${url.protocol}//${url.host}`;
      return origin === derived;
    } catch {
      return false;
    }
  }

  return origin === expected;
}
