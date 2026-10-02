export function publicWebUrl(path: string): string {
  // Dot notation is required for Expo to inline this public build setting.
  const baseUrl = process.env.EXPO_PUBLIC_WEB_URL ?? "http://localhost:3002";
  return `${baseUrl.replace(/\/+$/, "")}${path}`;
}

export function legalPageUrl(locale: string, kind: "privacy" | "terms" | "posting-rules" | "deletion"): string {
  return publicWebUrl(`/${locale}/${kind === "deletion" ? "account/delete" : `legal/${kind}`}`);
}
