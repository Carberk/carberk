"use client";
import { useParams } from "next/navigation";

import { ReaderShell } from "../marketplace/Reader";

import { diagnosticCopy,diagnosticLocale } from "./copy";

export function DiagnosticUnavailable() {
 const params=useParams<{locale:string}>(),locale=diagnosticLocale(params.locale),c=diagnosticCopy(locale);
 return <ReaderShell locale={locale}><h1 className="text-3xl font-semibold">{c.title}</h1><p className="my-5 max-w-prose leading-relaxed">{c.unavailable}</p><a className="inline-flex min-h-11 items-center underline underline-offset-4" href={`/${locale}`}>Carberk</a></ReaderShell>;
}
export function DiagnosticError({reset}:{reset:()=>void}) {
 const params=useParams<{locale:string}>(),locale=diagnosticLocale(params.locale),c=diagnosticCopy(locale);
 return <ReaderShell locale={locale}><p role="alert" className="mb-5 max-w-prose">{c.unavailable}</p><button className="min-h-11 rounded-lg border border-border px-5 py-3" onClick={reset}>{c.refresh}</button></ReaderShell>;
}
export function DiagnosticLoading() {
 const params=useParams<{locale:string}>(),locale=diagnosticLocale(params.locale);
 return <ReaderShell locale={locale}><p role="status">{diagnosticCopy(locale).loading}</p></ReaderShell>;
}
