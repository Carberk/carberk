const appId = /^[A-Z0-9]{10}\.[A-Za-z0-9_.-]+$/;
type AndroidApp = { packageName: string; sha256CertFingerprints: string[] };
function validAndroidApps(value: unknown): value is AndroidApp[] {
 return Array.isArray(value) && value.length > 0 && value.every(item => item && typeof item === "object" && typeof item.packageName === "string" && /^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z0-9_]+)+$/.test(item.packageName) && Array.isArray(item.sha256CertFingerprints) && item.sha256CertFingerprints.length > 0 && item.sha256CertFingerprints.every((fingerprint: unknown) => typeof fingerprint === "string" && /^([A-Fa-f0-9]{2}:){31}[A-Fa-f0-9]{2}$/.test(fingerprint)));
}
const paths = ["tk", "ru", "en"].flatMap(locale => [`/${locale}/listings/*`, `/${locale}/showrooms/*`]);
export function marketplaceAssociations() {
 const ios = (process.env["MARKETPLACE_IOS_APP_IDS"] ?? "").split(",").map(value => value.trim()).filter(Boolean);
 let android: AndroidApp[] = [];
 try { const configured: unknown = JSON.parse(process.env["MARKETPLACE_ANDROID_ASSOCIATIONS"] ?? "[]"); if (validAndroidApps(configured)) android = configured; } catch { /* Missing or malformed public signing configuration remains disabled. */ }
 return {
  apple: ios.length && ios.every(value => appId.test(value)) ? { applinks: { apps: [], details: ios.map(value => ({ appID: value, paths })) } } : null,
  android: android.length ? android.map(value => ({ relation: ["delegate_permission/common.handle_all_urls"], target: { namespace: "android_app", package_name: value.packageName, sha256_cert_fingerprints: value.sha256CertFingerprints } })) : null,
 };
}
export function sharingEnabled() {
 const config = marketplaceAssociations();
 try {
  const origin = new URL(process.env["WEB_BASE_URL"] ?? "");
  return process.env["MARKETPLACE_LINKS_VERIFIED"] === "true" && !!config.apple && !!config.android && !!(process.env["API_BASE_URL"] ?? process.env["NEXT_PUBLIC_API_URL"]) && origin.protocol === "https:" && !origin.username && !origin.password && origin.pathname === "/";
 } catch { return false; }
}
