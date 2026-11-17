import type { Metadata } from "next";
import Link from "next/link";

import { AccountDeletionForm } from "./AccountDeletionForm";
import { accountDeletionCopy } from "./content";

import type { Locale } from "@/i18n/locales";
import { defaultLocale, locales } from "@/i18n/locales";

function resolvePageLocale(locale: string): Locale {
  return locales.includes(locale as Locale) ? (locale as Locale) : defaultLocale;
}

const linkClass =
  "font-medium text-foreground underline decoration-border underline-offset-4 transition-colors hover:text-brand-600 hover:decoration-brand-600";

export async function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const copy = accountDeletionCopy[resolvePageLocale(locale)];
  return {
    title: `${copy.title} — Carberk`,
    description: copy.metaDescription,
  };
}





export default async function AccountDeletionPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const pageLocale = resolvePageLocale(locale);
  const copy = accountDeletionCopy[pageLocale];

  return (
    <main className="mx-auto w-full max-w-xl px-6 py-14 sm:px-8 md:py-20">
      <header className="pb-8">
        <div className="mb-8 h-1 w-12 rounded-full bg-brand-500" aria-hidden="true" />
        <h1 className="text-3xl font-bold leading-tight tracking-tight text-foreground sm:text-4xl">
          {copy.title}
        </h1>
        <p className="mt-4 text-base leading-7 text-muted-foreground md:text-lg md:leading-8">
          {copy.intro}
        </p>
      </header>

      <AccountDeletionForm locale={pageLocale} />

      <section className="mt-10">
        <h2 className="text-lg font-semibold text-foreground">{copy.consequencesTitle}</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-base leading-7 text-muted-foreground">
          {copy.consequences.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <footer className="mt-10 flex flex-col gap-3 border-t border-border pt-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <p>
          {copy.privacyPrefix}
          <Link href={`/${pageLocale}/legal/privacy`} className={linkClass}>
            {copy.privacyLink}
          </Link>
        </p>
        <p>
          <Link href={`/${pageLocale}`} className={linkClass}>
            {copy.backHome}
          </Link>
        </p>
      </footer>
    </main>
  );
}
