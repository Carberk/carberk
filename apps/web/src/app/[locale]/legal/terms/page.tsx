import type { Metadata } from "next";

import { termsOfService } from "../content";
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
  const doc = termsOfService[locale as Locale] ?? termsOfService.ru;
  return {
    title: `${doc.title} — Carberk`,
    description:
      locale === "tk"
        ? "Carberk ulanyş şertleri"
        : locale === "ru"
          ? "Условия использования Carberk"
          : "Carberk Terms of Service",
  };
}

export default async function TermsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const doc = termsOfService[locale as Locale] ?? termsOfService.ru;

  return <LegalPage locale={locale as Locale} document={doc} canonicalPath="/legal/terms" />;
}
