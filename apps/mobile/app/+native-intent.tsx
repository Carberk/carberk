/** HTTPS readers use locale and display slugs; native targets keep stable IDs. */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
 try {
  const configured = process.env.EXPO_PUBLIC_WEB_URL;
  const url = new URL(path, "autotm://app");
  if (url.protocol === "https:" || url.protocol === "http:") {
   if (!configured || url.origin !== new URL(configured).origin || url.protocol !== "https:") return "/";
  } else if (url.protocol !== "autotm:") return "/";
  const target = url.pathname.match(/^\/(tk|ru|en)\/(listings|showrooms)\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})(?:\/.*)?$/i);
  if (target) return `/${target[2]}/${target[3]}`;
  return url.protocol === "autotm:" ? path : "/";
 } catch { return "/"; }
}
