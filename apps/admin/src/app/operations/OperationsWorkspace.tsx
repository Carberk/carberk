"use client";
import { useEffect, useState } from "react";
import type { OperationsSchemas } from "@auto-tm/contracts";

import { operationsHealth } from "./actions";
import { operationsCopy } from "./copy";

import { useAdminLocale } from "@/lib/i18n";

export function OperationsWorkspace() {
  const { locale } = useAdminLocale(), c = operationsCopy[locale];
  const [load, setLoad] = useState<Awaited<ReturnType<typeof operationsHealth>> | null>(null);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let cancelled = false;
    let expiry: ReturnType<typeof setTimeout> | undefined;
    setLoad(null);
    void operationsHealth().then(result => {
      if (cancelled) return;
      setLoad(result);
      if (result.ok && result.data.state === "available") {
        const remaining = 90_000 - (Date.now() - Date.parse(result.data.snapshot.observedAt));
        if (remaining <= 0) setLoad({ ok: true, data: { state: "unavailable", snapshot: null } });
        else expiry = setTimeout(() => setLoad({ ok: true, data: { state: "unavailable", snapshot: null } }), remaining);
      }
    });
    return () => { cancelled = true; if (expiry) clearTimeout(expiry); };
  }, [refresh]);
  const snapshot: OperationsSchemas.OperationsSnapshot | null = load?.ok && load.data.state === "available" ? load.data.snapshot : null;
  const date = (value: string) => new Date(value).toLocaleString(locale === "tk" ? "tk-TM" : locale === "ru" ? "ru-RU" : "en-GB", { timeZone: "UTC" }) + " UTC";
  return <div className="space-y-7"><header className="space-y-3"><h1 className="text-3xl font-semibold tracking-tight">{c.title}</h1><p className="max-w-3xl text-sm text-neutral-600">{c.scope}</p></header>
    <button className="min-h-11 rounded-md border border-neutral-400 px-4 py-2 text-sm hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2" onClick={() => setRefresh(value => value + 1)}>{c.refresh}</button>
    {!load ? <p role="status">{c.loading}</p> : !load.ok ? <p role="alert">{c[load.error]}</p> : !snapshot ? <p role="status">{c.unavailable}</p> : <>
      <p className="text-sm text-neutral-600">{c.observed}: {date(snapshot.observedAt)}</p>
      <dl className="divide-y">{(["api", "collector", "worker"] as const).map(key => <div key={key} className="grid gap-2 py-4 sm:grid-cols-2"><dt>{c[key]}</dt><dd>{c[snapshot[key]]}</dd></div>)}</dl>
      <section className="space-y-3"><h2 className="text-lg font-medium">{c.technical}</h2><p className="max-w-3xl text-sm text-neutral-600">{c.metricScope}</p><dl className="grid gap-4 sm:grid-cols-2"><div><dt>{c.errors}</dt><dd className="mt-1 tabular-nums">{snapshot.technical?.errors.rate === null || snapshot.technical?.errors.rate === undefined ? c.unknown : snapshot.technical.errors.rate.toLocaleString(locale, { style: "percent", maximumFractionDigits: 1 })}</dd>{snapshot.technical && <dd className="text-sm text-neutral-600">{c.denominator}: {snapshot.technical.errors.requests.toLocaleString(locale)}</dd>}</div><div><dt>{c.latency}</dt><dd className="mt-1 tabular-nums">{snapshot.technical?.latency.p95UpperMs === null || snapshot.technical?.latency.p95UpperMs === undefined ? c.unknown : `${snapshot.technical.latency.p95UpperMs.toLocaleString(locale)} ms`}</dd>{snapshot.technical && <dd className="text-sm text-neutral-600">{c.denominator}: {snapshot.technical.latency.requests.toLocaleString(locale)}</dd>}</div></dl></section>
      <section className="space-y-3"><h2 className="text-lg font-medium">{c.queues}</h2>{snapshot.queues.length === 0 ? <p>{c.noQueues}</p> : <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th className="py-3 pr-5">{c.queue}</th><th className="pr-5">{c.waiting}</th><th>{c.sustained}</th></tr></thead><tbody>{snapshot.queues.map(queue => <tr key={queue.name} className="border-t"><th className="py-3 pr-5 font-normal">{queue.name}</th><td className="pr-5 tabular-nums">{queue.waiting ?? c.unknown}</td><td>{queue.sustainedBacklog ? c.yes : c.no}</td></tr>)}</tbody></table></div>}</section>
      {snapshot.incident && <section className="space-y-3 border-t pt-5"><h2 className="text-lg font-medium">{c.incident}</h2><p>{c.opened}: {date(snapshot.incident.openedAt)}</p><p>{snapshot.incident.resolvedAt ? `${c.resolved}: ${date(snapshot.incident.resolvedAt)}` : c.ongoing}</p></section>}
    </>}
    {load?.ok && <><section className="space-y-3 border-t pt-5"><h2 className="text-lg font-medium">{c.budgets}</h2><p className="max-w-3xl text-sm text-neutral-600">{c.budgetScope}</p></section><section className="space-y-3 border-t pt-5"><h2 className="text-lg font-medium">{c.readiness}</h2><p className="max-w-3xl text-sm text-neutral-600">{c.readinessScope}</p></section></>}
  </div>;
}
