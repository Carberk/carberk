import { Suspense } from "react";
import { notFound, unstable_rethrow } from "next/navigation";
import { Button } from "@auto-tm/ui/components";
import { VehicleHistorySchemas, IdentitySchemas } from "@auto-tm/contracts";
import { Inbox, Loader2, ShieldAlert, WifiOff } from "lucide-react";

import { apiFetchOptional, ApiError } from "@/lib/api-client";
import { deskCopy, type DeskLocale } from "@/lib/history-desk-copy";

type DeskState = "empty" | "loading" | "denied" | "error";

function DeskContent({ locale, state, actor }: { locale: DeskLocale; state: DeskState; actor?: VehicleHistorySchemas.HistoryDesk["actor"] }) {
  const t = deskCopy[locale];
  const Icon = { empty: Inbox, loading: Loader2, denied: ShieldAlert, error: WifiOff }[state];
  return (
    <>
      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t.title}</h1>
          {actor && <p className="mt-2 break-words text-sm text-muted-foreground">{t.actor}: <span className="font-medium text-foreground">{IdentitySchemas.formatDisplayName(actor, locale)}</span></p>}
        </div>
        <span className="rounded-md bg-muted px-3 py-2 text-sm font-medium">{t.synthetic}</span>
      </header>
      <section aria-labelledby="requests-heading" className="overflow-hidden rounded-lg border bg-background">
        <h2 id="requests-heading" className="border-b px-5 py-4 text-base font-semibold sm:px-6">{t.requests}</h2>
        <div role={state === "denied" || state === "error" ? "alert" : "status"} aria-busy={state === "loading"} className="mx-auto flex min-h-80 max-w-xl flex-col items-center px-5 py-12 text-center sm:px-8">
          <Icon aria-hidden="true" className="mb-5 size-7 text-muted-foreground" />
          <h3 className="text-lg font-semibold">{t[state]}</h3>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">{t[`${state}Body`]}</p>
          {state !== "loading" && <form action={`/vehicle-history/${locale}`} className="mt-6"><Button type="submit" variant={state === "empty" ? "secondary" : "primary"}>{state === "empty" ? t.refresh : t.retry}</Button></form>}
          {state === "denied" && <a className="mt-4 rounded-sm p-2 text-sm underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring" href={`/login?reason=history-access&returnTo=${encodeURIComponent(`/vehicle-history/${locale}`)}`}>{t.signIn}</a>}
        </div>
      </section>
    </>
  );
}

async function AuthorizedDesk({ locale }: { locale: DeskLocale }) {
  try {
    const response = await apiFetchOptional<unknown>("/vehicle-history/desk", { cache: "no-store", headers: { "Accept-Language": locale } });
    if (!response) return <DeskContent locale={locale} state="denied" />;
    const desk = VehicleHistorySchemas.HistoryDeskSchema.parse(response);
    return <DeskContent locale={locale} state="empty" actor={desk.actor} />;
  } catch (error) {
    unstable_rethrow(error);
    return <DeskContent locale={locale} state={error instanceof ApiError && error.status === 403 ? "denied" : "error"} />;
  }
}

export default async function HistoryDeskPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (locale !== "tk" && locale !== "ru" && locale !== "en") notFound();
  const t = deskCopy[locale];
  return (
    <div lang={locale} className="min-h-screen bg-muted/40">
      <a href="#history-content" className="sr-only focus:not-sr-only focus:block focus:p-4">{t.skip}</a>
      <div className="flex flex-wrap items-center justify-between gap-4 border-b bg-background px-5 py-4 sm:px-8">
        <span className="text-xl font-semibold tracking-tight">Carberk</span>
        <nav aria-label={t.language} className="flex gap-1">
          {(["tk", "ru", "en"] as const).map((language) => <a key={language} href={`/vehicle-history/${language}`} lang={language} aria-current={language === locale ? "page" : undefined} className="rounded-md px-3 py-2 text-sm font-medium hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring aria-[current=page]:bg-muted">{language.toUpperCase()}</a>)}
        </nav>
      </div>
      <div className="mx-auto grid max-w-screen-2xl md:min-h-[calc(100vh-77px)] md:grid-cols-[200px_1fr]">
        <nav aria-label={t.desk} className="border-b bg-background p-3 md:border-r md:border-b-0 md:py-6">
          <a href={`/vehicle-history/${locale}`} aria-current="page" className="block rounded-md bg-muted px-4 py-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-ring">{t.title}</a>
        </nav>
        <main id="history-content" tabIndex={-1} className="min-w-0 p-5 outline-none sm:p-8">
          <Suspense fallback={<DeskContent locale={locale} state="loading" />}><AuthorizedDesk locale={locale} /></Suspense>
        </main>
      </div>
    </div>
  );
}
