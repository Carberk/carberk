import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LegalPage } from "./LegalPage";
import { postingRules, privacyPolicy, termsOfService } from "./content";

const environments = ["https://staging.autotm.bagtyyar.dev", "https://autotm.bagtyyar.dev"];
afterEach(() => vi.unstubAllEnvs());

describe.each(environments)("canonical links for %s", (baseUrl) => {
  it.each(["en", "ru", "tk"] as const)("renders configured privacy, terms and posting-rules URLs in %s", (locale) => {
    vi.stubEnv("WEB_BASE_URL", `${baseUrl}/`);
    const pages = [
      ["privacy", privacyPolicy[locale]],
      ["terms", termsOfService[locale]],
      ["posting-rules", postingRules[locale]],
    ] as const;
    for (const [kind, document] of pages) {
      const html = renderToStaticMarkup(createElement(LegalPage, { locale, document, canonicalPath: `/legal/${kind}` }));
      expect(html).toContain(`href="${baseUrl}/${locale}/legal/${kind}"`);
      expect(html).toContain(`>${baseUrl}/${locale}/legal/${kind}</a>`);
    }
  });
});
