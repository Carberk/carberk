import { randomUUID } from "node:crypto";

import { Suspense } from "react";
import { notFound } from "next/navigation";
import { Button } from "@auto-tm/ui/components";

import { readRefund, recordRefund, type RefundMode } from "./actions";
import { RefundCaseError, RefundCasePanel } from "./RefundCasePanel";

import { HistoryWorkbench } from "@/components/HistoryWorkbench";
import type { DeskLocale } from "@/lib/history-desk-copy";
import { refundCopy } from "@/lib/history-refund-copy";

export default async function RefundsPage({ params, searchParams }: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ request?: string; mode?: string }>;
}) {
  const { locale } = await params;
  if (locale !== "en" && locale !== "ru" && locale !== "tk") notFound();
  const query = await searchParams;
  const id = typeof query.request === "string" ? query.request.trim().slice(0, 37) : "";
  const mode = query.mode === "execution" ? "execution" : "decision";
  const route = `/vehicle-history/${locale}/refunds`;
  const t = refundCopy[locale];
  const url = (next: RefundMode) => route + "?" + new URLSearchParams({ ...(id ? { request: id } : {}), mode: next });
  return <HistoryWorkbench locale={locale} section="refunds">
    <div className="max-w-3xl space-y-4">
      <h1 className="text-2xl font-semibold">{t.title}</h1>
      <nav aria-label={t.title} className="flex flex-wrap gap-3 border-b pb-2">
        {(["decision", "execution"] as const).map((choice) => <a key={choice} href={url(choice)}
          aria-current={mode === choice ? "page" : undefined}
          className="rounded-md px-3 py-2 font-medium underline aria-[current=page]:bg-muted">{t[choice]}</a>)}
      </nav>
      <form method="get" className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="mode" value={mode} />
        <label className="w-full max-w-sm font-medium">{t.request}
          <input name="request" defaultValue={id} required maxLength={36} spellCheck={false}
            className="mt-1 block min-h-11 w-full rounded-md border bg-background px-3 font-mono" />
        </label>
        <Button variant="secondary" type="submit" className="min-h-11">{t.open}</Button>
      </form>
      {id && <Suspense fallback={<p role="status">{t.loading}</p>}>
        <AuthorizedCase locale={locale} id={id} mode={mode} href={url(mode)} />
      </Suspense>}
    </div>
  </HistoryWorkbench>;
}

async function AuthorizedCase({ locale, id, mode, href }: { locale: DeskLocale; id: string; mode: RefundMode; href: string }) {
  const result = await readRefund({ locale, id, mode });
  if (result.status !== "ok") return <RefundCaseError {...{ locale, href }} status={result.status} />;
  const { order, payment } = result.data;
  const action = recordRefund.bind(null, { locale, id, mode, scope: result.scope, orderId: order.id, amountMinor: payment.amountMinor,
    attemptKey: randomUUID() });
  return <RefundCasePanel key={`${result.scope}:${id}:${mode}:${locale}`} {...{ locale, mode, href, action }} initial={result.data} />;
}
