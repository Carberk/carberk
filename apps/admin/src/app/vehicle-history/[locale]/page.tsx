import { Suspense } from "react";
import { notFound } from "next/navigation";
import { VehicleHistorySchemas as V } from "@auto-tm/contracts";

import { HistoryInbox } from "./HistoryInbox";
import { historyInboxAction } from "./actions";

import { HistoryWorkbench } from "@/components/HistoryWorkbench";
import { deskCopy, type DeskLocale } from "@/lib/history-desk-copy";

export default async function HistoryDeskPage({ params, searchParams }: {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  if (locale !== "tk" && locale !== "ru" && locale !== "en") notFound();
  return <HistoryWorkbench locale={locale} section="desk">
    <Suspense fallback={<p role="status">{deskCopy[locale].loading}</p>}>
      <AuthorizedInbox locale={locale} searchParams={searchParams} />
    </Suspense>
  </HistoryWorkbench>;
}

async function AuthorizedInbox({ locale, searchParams }: {
  locale: DeskLocale; searchParams: Promise<Record<string, string | string[] | undefined>> | undefined;
}) {
  const search = await searchParams ?? {};
  const values = Object.fromEntries(["filter", "queue", "search", "cursor"].flatMap((name) => {
    const value = search[name];
    const last = Array.isArray(value) ? value.at(-1) : value;
    return last === undefined ? [] : [[name, last]];
  }));
  const query = V.HistoryQueueQuerySchema.safeParse({ filter: "unassigned", queue: "enquiry", ...values });
  const initial = query.success
    ? await historyInboxAction(locale, { kind: "queue", query: query.data })
    : { status: "validation" } as const;
  return <HistoryInbox key={initial.status === "ok" ? initial.scope : initial.status} locale={locale} initial={initial} />;
}
