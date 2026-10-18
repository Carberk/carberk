"use client";
import { useParams } from "next/navigation";

import { marketplaceCopy, readerLocale } from "./copy";
import { ReaderShell } from "./Reader";
export function UnavailableReader() {
 const params = useParams<{ locale: string }>(); const locale = readerLocale(params.locale); const c = marketplaceCopy(locale);
 return <ReaderShell locale={locale}><h1 className="text-3xl font-semibold">{c.unavailable}</h1><p className="my-5 max-w-prose leading-relaxed">{c.unavailableHelp}</p><a className="underline underline-offset-4" href={`/${locale}`}>{c.home}</a></ReaderShell>;
}
export function ReaderError({ reset }: { reset: () => void }) {
 const params = useParams<{ locale: string }>(); const locale = readerLocale(params.locale); const c = marketplaceCopy(locale);
 return <ReaderShell locale={locale}><p role="alert" className="mb-5 max-w-prose">{c.error}</p><button className="rounded-lg bg-primary px-5 py-3 text-primary-foreground" onClick={reset}>{c.retry}</button></ReaderShell>;
}
export function ReaderLoading() {
 const params = useParams<{ locale: string }>(); const locale = readerLocale(params.locale);
 return <ReaderShell locale={locale}><p role="status">{marketplaceCopy(locale).loading}</p></ReaderShell>;
}
