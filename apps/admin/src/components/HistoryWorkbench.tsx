"use client";
import type { ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { deskCopy, type DeskLocale } from "@/lib/history-desk-copy";
import { staffCopy } from "@/lib/history-staff-copy";

export function HistoryWorkbench({ locale, section, children }: { locale: DeskLocale; section: "desk" | "staff"; children: ReactNode }) {
  const t = deskCopy[locale];
  const query = useSearchParams().toString();
  return <div lang={locale} className="min-h-screen bg-muted/40">
    <a href="#history-content" className="sr-only focus:not-sr-only focus:block focus:p-4">{t.skip}</a>
    <div className="flex flex-wrap items-center justify-between gap-4 border-b bg-background px-5 py-4 sm:px-8">
      <span className="text-xl font-semibold tracking-tight">Carberk</span>
      <nav aria-label={t.language} className="flex gap-1">
        {(["tk", "ru", "en"] as const).map((language) => <a key={language} href={`/vehicle-history/${language}${section === "staff" ? "/staff" : ""}${query ? `?${query}` : ""}`} lang={language} aria-current={language === locale ? "page" : undefined} className="rounded-md px-3 py-2 text-sm font-medium hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring aria-[current=page]:bg-muted">{language.toUpperCase()}</a>)}
      </nav>
    </div>
    <div className="mx-auto grid max-w-screen-2xl md:min-h-[calc(100vh-77px)] md:grid-cols-[200px_1fr]">
      <nav aria-label={t.desk} className="border-b bg-background p-3 md:border-r md:border-b-0 md:py-6">
        {(["desk", "staff"] as const).map((item) => <a key={item} href={`/vehicle-history/${locale}${item === "staff" ? "/staff" : ""}`} aria-current={section === item ? "page" : undefined} className="block rounded-md px-4 py-3 text-sm font-semibold hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring aria-[current=page]:bg-muted">{item === "desk" ? t.title : staffCopy[locale].title}</a>)}
      </nav>
      <main id="history-content" tabIndex={-1} className="min-w-0 p-5 outline-none sm:p-8">{children}</main>
    </div>
  </div>;
}
