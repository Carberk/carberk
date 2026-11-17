import type { Metadata } from "next";

import credits from "./credits.json";

import type { Locale } from "@/i18n/locales";
import { defaultLocale, locales } from "@/i18n/locales";









const copy: Record<Locale, { title: string; intro: string; by: string; licence: string }> = {
  ru: {
    title: "Авторы фотографий",
    intro:
      "Демонстрационные объявления Carberk показывают фотографии автомобилей из Wikimedia Commons. Ниже указаны автор, лицензия и исходный файл каждой фотографии. Фотографии уменьшены и обрезаны под формат объявления. Изменённые фотографии доступны на условиях той же лицензии, что и исходные.",
    by: "Автор",
    licence: "Лицензия",
  },
  tk: {
    title: "Suratlaryň awtorlary",
    intro:
      "Carberk-iň synag bildirişlerinde Wikimedia Commons-dan alnan awtoulag suratlary görkezilýär. Aşakda her suratyň awtory, ygtyýarnamasy we asyl faýly görkezilen. Suratlar bildirişiň ölçegine görä kiçeldildi we kesildi. Üýtgedilen suratlar asyl suratlaryň ygtyýarnamasynyň şertlerinde elýeterlidir.",
    by: "Awtor",
    licence: "Ygtyýarnama",
  },
  en: {
    title: "Photo credits",
    intro:
      "Carberk's demo listings show car photographs from Wikimedia Commons. Each photo's author, licence and source file is listed below. The photos were resized and cropped to fit a listing. The adapted photos are available under the same licence as their originals.",
    by: "Author",
    licence: "Licence",
  },
};

function resolvePageLocale(locale: string): Locale {
  return locales.includes(locale as Locale) ? (locale as Locale) : defaultLocale;
}

export async function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: `${copy[resolvePageLocale(locale)].title} — Carberk`,
    robots: { index: false, follow: false },
  };
}

export default async function DemoCreditsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const text = copy[resolvePageLocale(locale)];
  const linkClass =
    "font-medium text-foreground underline decoration-border underline-offset-4 transition-colors hover:text-brand-600 hover:decoration-brand-600";

  return (
    <main className="mx-auto max-w-5xl px-6 py-14 sm:px-8 md:py-20 lg:py-24">
      <header className="max-w-3xl pb-10 md:pb-12">
        <div className="mb-8 h-1 w-12 rounded-full bg-brand-500" aria-hidden="true" />
        <h1 className="text-4xl font-bold leading-tight tracking-tight text-foreground sm:text-5xl">
          {text.title}
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-8 text-muted-foreground">{text.intro}</p>
      </header>

      <ol className="border-y border-border">
        {credits.photos.map((photo) => (
          <li
            key={photo.sourceFile}
            className="border-b border-border py-4 text-sm leading-6 text-muted-foreground last:border-b-0"
          >
            <a href={photo.sourcePage} rel="noreferrer" className={`${linkClass} break-words`}>
              {photo.sourceFile}
            </a>
            <span className="block">
              {text.by}: {photo.author}. {text.licence}:{" "}
              {photo.licenseUrl ? (
                <a href={photo.licenseUrl} rel="noreferrer license" className={linkClass}>
                  {photo.license}
                </a>
              ) : (
                photo.license
              )}
              . Wikimedia Commons.
            </span>
          </li>
        ))}
      </ol>
    </main>
  );
}
