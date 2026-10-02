import type { Metadata } from "next";

import { postingRules } from "../content";
import { LegalPage } from "../LegalPage";

import type { Locale } from "@/i18n/locales";
import { locales } from "@/i18n/locales";

// Canonical links read WEB_BASE_URL from the deployed environment.
export const dynamic = "force-dynamic";

export async function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const doc = postingRules[locale as Locale] ?? postingRules.ru;
  return {
    title: `${doc.title} — AutoTM`,
    description:
      locale === "tk"
        ? "AutoTM-de bildiriş ýerleşdirmegiň düzgünleri"
        : locale === "ru"
          ? "Правила размещения объявлений на AutoTM"
          : "Rules for posting listings on AutoTM",
  };
}

export default async function PostingRulesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const doc = postingRules[locale as Locale] ?? postingRules.ru;

  return <LegalPage locale={locale as Locale} document={doc} canonicalPath="/legal/posting-rules" />;
}
