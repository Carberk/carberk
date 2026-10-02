import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { legalPageUrl } from "./publicWebUrl";

const eas = JSON.parse(readFileSync(resolve(__dirname, "../../eas.json"), "utf8"));
const profiles = [
  ["staging", "https://staging.autotm.bagtyyar.dev"],
  ["production-smoke", "https://autotm.bagtyyar.dev"],
  ["production", "https://autotm.bagtyyar.dev"],
] as const;
afterEach(() => vi.unstubAllEnvs());

describe.each(profiles)("%s public URLs", (profile, baseUrl) => {
  it.each(["en", "ru", "tk"])("uses the build profile for privacy, terms, posting rules and deletion in %s", (locale) => {
    vi.stubEnv("EXPO_PUBLIC_WEB_URL", eas.build[profile].env.EXPO_PUBLIC_WEB_URL);
    expect(legalPageUrl(locale, "privacy")).toBe(`${baseUrl}/${locale}/legal/privacy`);
    expect(legalPageUrl(locale, "terms")).toBe(`${baseUrl}/${locale}/legal/terms`);
    expect(legalPageUrl(locale, "posting-rules")).toBe(`${baseUrl}/${locale}/legal/posting-rules`);
    expect(legalPageUrl(locale, "deletion")).toBe(`${baseUrl}/${locale}/account/delete`);
  });
});
