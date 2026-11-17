import type { Metadata } from "next";

import { postingRules } from "../content";
import { LegalPage } from "../LegalPage";

import type { Locale } from "@/i18n/locales";
import { locales } from "@/i18n/locales";


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
    title: `${doc.title} — Carberk`,
    description:
      locale === "tk"
        ? "Carberk-de bildiriş ýerleşdirmegiň düzgünleri"
        : locale === "ru"
          ? "Правила размещения объявлений на Carberk"
          : "Rules for posting listings on Carberk",
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
