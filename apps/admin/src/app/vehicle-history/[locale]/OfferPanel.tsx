"use client";
import { useEffect, useRef, useState } from "react";
import type { HistoryOfferSchemas as O } from "@auto-tm/contracts";
import { Button } from "@auto-tm/ui/components";

import { historyOfferAction } from "./offer-actions";
import type { HistoryInboxResult } from "./actions";

import { offerCopy } from "@/lib/history-offer-copy";
import type { DeskLocale } from "@/lib/history-desk-copy";

export function OfferPanel({ locale, id, version, scope, actorId, revision, invalidate }: {
  locale: DeskLocale; id: string; version: number; scope: string; actorId: string; revision: number;
  invalidate: (result: HistoryInboxResult) => void;
}) {
  const t = offerCopy[locale];
  const [data, setData] = useState<O.HistoryOffer | null>(null);
  const [phase, setPhase] = useState<"loading" | "ready" | "pending" | "error">("loading");
  const [vin, setVin] = useState("");
  const [format, setFormat] = useState<"" | "pdf" | "link" | "both">("");
  const [from, setFrom] = useState(""), [by, setBy] = useState("");
  const alive = useRef(true), busy = useRef(false), generation = useRef(0);
  const binding = `${id}:${version}:${scope}:${actorId}:${locale}`;
  const currentBinding = useRef(binding); currentBinding.current = binding;
  const load = useRef<() => void>(() => {});
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  async function run(mutation?: O.HistoryOperatorOfferMutation) {
    if (busy.current || !alive.current) return;
    busy.current = true;
    const attempt = ++generation.current, expected = binding;
    setPhase(mutation ? "pending" : "loading");
    try {
      const result = await historyOfferAction(locale, { id, scope, expectedAssignmentVersion: version, ...(mutation ? { mutation } : {}) });
      if (!alive.current || expected !== currentBinding.current || attempt !== generation.current) return;
      if (result.status !== "ok") {
        setData(null); setPhase("error");
        if (["expired", "denied", "stale"].includes(result.status)) invalidate({ status: result.status });
        return;
      }
      if (result.scope !== scope || result.actorId !== actorId) { setData(null); setPhase("error"); return; }
      setData(result.data); setPhase("ready");
      if (!vin || mutation?.kind === "check") setVin(result.data.vin ?? "");
    } catch { if (alive.current && expected === currentBinding.current) { setData(null); setPhase("error"); } }
    finally { busy.current = false; }
  }
  load.current = () => { void run(); };
  useEffect(() => { load.current(); }, [binding, revision]);
  const available = data?.preflight?.status === "available";
  const proposal = data?.proposal;
  const timestamp = (value: string) => new Intl.DateTimeFormat(locale === "tk" ? "en-GB" : locale, {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Asia/Ashgabat",
  }).format(new Date(value));
  return <section aria-label={t.title} className="mt-6 space-y-4 border-t pt-5 text-sm">
    <h4 className="font-semibold">{t.title}</h4>
    <p className="text-muted-foreground">{t.synthetic}</p>
    {phase === "loading" ? <p role="status">{t.loading}</p> : phase === "error" ? <div role="alert">
      <p>{t.error}</p><Button className="mt-3" variant="secondary" onClick={() => { void run(); }}>{t.refresh}</Button>
    </div> : data && <>
      <label className="block">{t.vin}<input className="mt-2 min-h-11 w-full rounded-md border bg-background px-3 font-mono" value={vin} maxLength={80}
        disabled={phase === "pending"} onChange={(event) => setVin(event.target.value)} autoCapitalize="characters" spellCheck={false} /></label>
      <Button className="h-auto min-h-11 w-full whitespace-normal" disabled={phase === "pending" || !vin.trim()} aria-busy={phase === "pending"}
        onClick={() => { void run({ kind: "check", vin, expectedVersion: data.version, expectedAssignmentVersion: version }); }}>{phase === "pending" ? t.pending : t.check}</Button>
      <p role="status" aria-live="polite">{data.preflight ? t[data.preflight.status] : data.vin ? t.unchecked : t.empty}</p>
      {data.vin && !proposal && <p className="break-all font-mono">VIN: {data.vin}</p>}
      {data.preflight?.status === "available" && <>
        <p>{t.rule}</p>
        <dl className="space-y-2">{data.preflight.providers.map((provider) => <div key={provider.name}><dt className="font-medium">{provider.name} · {t.date}</dt><dd>{provider.originalReportDate ?? t.unknown}</dd></div>)}</dl>
        <p className="text-muted-foreground">{t.limits}</p>
      </>}
      {available && <fieldset disabled={phase === "pending" || vin !== data.vin} className="space-y-4">
        <label className="block">{t.format}<select className="mt-2 min-h-11 w-full rounded-md border bg-background px-2" value={format}
          onChange={(event) => setFormat(event.target.value as typeof format)}>
          <option value="">{t.choose}</option>{(["pdf", "link", "both"] as const).map((value) => <option key={value} value={value}>{t[value]}</option>)}
        </select></label>
        <label className="block">{t.fromLabel}<input className="mt-2 min-h-11 w-full rounded-md border bg-background px-2" type="datetime-local" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
        <label className="block">{t.byLabel}<input className="mt-2 min-h-11 w-full rounded-md border bg-background px-2" type="datetime-local" value={by} onChange={(event) => setBy(event.target.value)} /></label>
        <Button className="h-auto min-h-11 w-full whitespace-normal" disabled={!format || !from || !by || from >= by} onClick={() => {
          if (!format) return;
          void run({ kind: "propose", format, expectedVersion: data.version, expectedAssignmentVersion: version,
            deliveryFrom: new Date(`${from}+05:00`).toISOString(), deliveryBy: new Date(`${by}+05:00`).toISOString() });
        }}>{t.propose}</Button>
      </fieldset>}
      {proposal && <div className="space-y-3 rounded-lg border p-4">
        <h5 className="font-semibold">{t.preview}</h5><p className="break-all font-mono">{data.vin}</p>
        <p>{t.format}: {t[proposal.format]}</p><p>{t.window}: {timestamp(proposal.deliveryFrom)} – {timestamp(proposal.deliveryBy)}</p>
        {proposal.format !== "pdf" && <p>{t.links}</p>}<p>{t.rights}</p><p>{t.terms}</p><p className="text-muted-foreground">{t.next}</p>
      </div>}
    </>}
  </section>;
}
