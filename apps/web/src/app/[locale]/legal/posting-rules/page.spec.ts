import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { postingRules } from "../content";

import PostingRulesPage, { generateMetadata, generateStaticParams } from "./page";

import { locales } from "@/i18n/locales";

const baseUrl = "https://autotm.bagtyyar.dev";
afterEach(() => vi.unstubAllEnvs());

describe("posting rules page", () => {
  it("is generated for every locale", async () => {
    expect(await generateStaticParams()).toEqual(locales.map((locale) => ({ locale })));
  });

  it.each(locales)("renders the %s rules with the legal layout and its own canonical link", async (locale) => {
    vi.stubEnv("WEB_BASE_URL", baseUrl);
    const html = renderToStaticMarkup(await PostingRulesPage({ params: Promise.resolve({ locale }) }));
    const document = postingRules[locale];

    expect(html).toContain(`<h1 class="text-3xl font-bold tracking-tight text-foreground md:text-4xl print:text-2xl">${document.title}</h1>`);
    expect(html).toContain(`<time dateTime="${document.effectiveDateISO}">`);
    for (const section of document.sections) {
      expect(html).toContain(`>${section.title}</h2>`);
    }
    expect(html).toContain(`href="${baseUrl}/${locale}/legal/posting-rules"`);
  });

  it.each(locales)("titles the %s page after the rules", async (locale) => {
    const metadata = await generateMetadata({ params: Promise.resolve({ locale }) });
    expect(metadata.title).toBe(`${postingRules[locale].title} — AutoTM`);
    expect(metadata.description).toBeTruthy();
  });

  it("falls back to Russian for an unknown locale, like Terms", async () => {
    const html = renderToStaticMarkup(await PostingRulesPage({ params: Promise.resolve({ locale: "xx" }) }));
    expect(html).toContain(postingRules.ru.title);
  });
});
