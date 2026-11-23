"use client";
import { useEffect, useRef, useState } from "react";
import type { HistoryOrderSchemas as H } from "@auto-tm/contracts";
import { Button } from "@auto-tm/ui/components";

import type { HistoryInboxResult } from "./actions";
import { ReportArtifactPanel } from "./ReportArtifactPanel";
import { historyFulfilmentAction } from "./fulfilment-actions";

import type { DeskLocale } from "@/lib/history-desk-copy";
import { fulfilmentCopy } from "@/lib/history-fulfilment-copy";
import { offerCopy } from "@/lib/history-offer-copy";

type Mutation = H.HistoryFulfilmentMutation;
type Source = Extract<Mutation, { kind: "start" }>["source"];
type Outcome = Extract<Mutation, { kind: "record" | "reconcile" }>["outcome"];
type Format = H.HistoryFulfilmentView["accepted"]["format"];
const control = "mt-2 min-h-11 w-full rounded-md border bg-background px-2";
const action = "h-auto min-h-11 w-full whitespace-normal";

export function FulfilmentPanel({ locale, id, version, scope, actorId, state, onOrder, invalidate }: {
  locale: DeskLocale; id: string; version: number; scope: string; actorId: string; state: H.HistoryOrderState;
  onOrder: (state: H.HistoryOrderState) => void; invalidate: (result: HistoryInboxResult) => void;
}) {
  const t = fulfilmentCopy[locale], o = offerCopy[locale];
  const [source, setSource] = useState<Source | "">("");
  const [phase, setPhase] = useState<"ready" | "saving" | "loading" | "conflict" | "capacity" | "unavailable" | "validation">("ready");
  const busy = useRef(false), alive = useRef(true);
  const panel = useRef<HTMLElement>(null), heading = useRef<HTMLHeadingElement>(null);
  const refresh = useRef<HTMLButtonElement>(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    if (phase === "saving" || phase === "loading" || document.activeElement !== heading.current) return;
    (panel.current?.querySelector<HTMLElement>("[data-fulfilment-next]") ?? refresh.current)?.focus();
  }, [phase]);
  if (state.status !== "payment_confirmed") return null;
  const view = state.fulfilment;
  const intent = view?.intent;
  const selectedSource = source && view?.sources.includes(source) ? source : "";
  const command = () => ({ orderId: id, expectedAssignmentVersion: version, expectedVersion: intent?.version ?? 0, attemptKey: crypto.randomUUID() });

  async function run(mutation?: Mutation) {
    if (busy.current) return;
    busy.current = true;
    if (panel.current?.contains(document.activeElement)) heading.current?.focus({ preventScroll: true });
    setPhase(mutation ? "saving" : "loading");
    try {
      const result = await historyFulfilmentAction(locale, { id, scope, expectedAssignmentVersion: version, mutation });
      if (!alive.current) return;
      switch (result.status) {
        case "expired": case "stale": case "denied":
          invalidate({ status: result.status }); return;
        case "ok":
          if (scope !== result.scope || actorId !== result.actorId) { invalidate({ status: "stale" }); return; }
          onOrder(result.data);
          setPhase("ready");
          return;
        default: setPhase(result.status);
      }
    } catch { if (alive.current) setPhase("unavailable"); }
    finally { busy.current = false; }
  }

  const reconcile = intent?.status === "uncertain";
  const canCorrect = intent?.status === "recovery" && intent.reason === "company_error";
  return <section ref={panel} className="space-y-3 border-t pt-4" aria-label={t.title}>
    <h5 ref={heading} tabIndex={-1} className="font-semibold">{t.title}</h5>
    {!view ? <p role="status">{state.fulfilmentUnavailable ? t[state.fulfilmentUnavailable] : t.empty}</p> : <>
      <dl className="space-y-1">
        <div><dt className="sr-only">VIN</dt><dd className="break-all font-mono">{view.accepted.vin}</dd></div>
        <div className="flex flex-wrap gap-x-2"><dt className="sr-only">{t.provider}</dt><dd>{view.accepted.provider}</dd>
          <dt className="sr-only">{o.format}</dt><dd>{o[view.accepted.format]}</dd></div>
        <div className="flex flex-wrap gap-x-2"><dt className="text-muted-foreground">{o.date}</dt>
          <dd>{(intent?.status === "obtained" ? intent.report.originalReportDate : view.accepted.originalReportDate) ?? o.unknown}</dd></div>
        {intent && <div className="flex flex-wrap gap-x-2"><dt className="text-muted-foreground">{t.source}</dt><dd>{t[intent.source]}</dd></div>}
      </dl>
      {intent?.funding === "company" && <p>{t.companyFunding}</p>}
      {intent && <p role="status">{intent.status === "recovery" ? `${t[intent.reason]} ${t.recoveryNext}` : t[intent.status]}</p>}
      {view.gate !== "ready" && (!intent || intent.status === "retry_ready" || canCorrect) && <p role="status">{t[view.gate]}</p>}
      {phase === "ready" && <>
        {!intent && view.gate === "ready" && <>
          <label className="block">{t.source}<select data-fulfilment-next className={control} value={selectedSource} onChange={(e) => setSource(e.target.value as typeof source)}>
            <option value="">{t.chooseSource}</option>{view.sources.map((value) => <option key={value} value={value}>{t[value]}</option>)}
          </select></label>
          <Button type="button" className={action} disabled={!selectedSource} onClick={() => {
            const { acceptedRevision, vin, provider, format } = view.accepted;
            if (selectedSource) void run({ ...command(), kind: "start", source: selectedSource, acceptedRevision, vin, provider, format });
          }}>{t.start}</Button>
        </>}
        {(intent?.status === "pending" || reconcile) && <OutcomeForm key={intent.version} locale={locale} reconcile={reconcile} newLookup={intent.source === "new_source"}
          onSave={(outcome) => {
            if (reconcile && outcome.kind !== "uncertain") void run({ ...command(), kind: "reconcile", outcome });
            if (!reconcile && outcome.kind !== "not_started") void run({ ...command(), kind: "record", outcome });
          }} />}
        {view.gate === "ready" && (intent?.status === "retry_ready" || canCorrect) && <Button data-fulfilment-next type="button" className={action}
          onClick={() => { void run({ ...command(), kind: canCorrect ? "company_correction" : "retry" }); }}>
          {canCorrect ? t.correct : t.retry}
        </Button>}
        {intent?.status === "obtained" && <Button type="button" className={action} variant="secondary"
          onClick={() => { void run({ ...command(), kind: "record", outcome: { kind: "company_error" } }); }}>{t.reportError}</Button>}
      </>}
    </>}
    {phase === "ready" && intent?.status === "obtained" && state.order && <ReportArtifactPanel
      key={`${state.order.id}:${intent.id}:${intent.version}`} locale={locale} id={id} scope={scope}
      orderId={state.order.id} version={version} intent={intent} invalidate={invalidate} />}
    {phase !== "ready" && <p role={phase === "saving" || phase === "loading" ? "status" : "alert"}>{t[phase]}</p>}
    {phase !== "saving" && phase !== "loading" && <Button ref={refresh} type="button" className={action} variant="secondary"
      onClick={() => { void run(); }}>{t.refresh}</Button>}
  </section>;
}

function OutcomeForm({ locale, reconcile, newLookup, onSave }: {
  locale: DeskLocale; reconcile: boolean; newLookup: boolean; onSave: (outcome: Outcome) => void;
}) {
  const t = fulfilmentCopy[locale], o = offerCopy[locale];
  const [result, setResult] = useState<Outcome["kind"] | "">("");
  const [format, setFormat] = useState<Format | "">("");
  const [date, setDate] = useState("");
  const [rights, setRights] = useState("");
  const choices: Outcome["kind"][] = ["obtained"];
  if (!reconcile) choices.push("uncertain");
  if (reconcile && newLookup) choices.push("not_started");
  choices.push("no_history", "format_unavailable", "company_error");
  return <form className="space-y-3" onSubmit={(event) => {
    event.preventDefault();
    if (result === "obtained" && format && date && rights) onSave({ kind: result, format, originalReportDate: date, permittedUse: rights === "yes" });
    else if (result && result !== "obtained") onSave({ kind: result });
  }}>
    <label className="block">{t.outcome}<select data-fulfilment-next className={control} required value={result} onChange={(e) => setResult(e.target.value as typeof result)}>
      <option value="">{t.chooseOutcome}</option>{choices.map((choice) => <option key={choice} value={choice}>{t.outcomes[choice]}</option>)}
    </select></label>
    {result === "obtained" && <>
      <label className="block">{t.availableFormat}<select className={control} required value={format} onChange={(e) => setFormat(e.target.value as typeof format)}>
        <option value="">{o.choose}</option>{(["pdf", "link", "both"] as const).map((value) => <option key={value} value={value}>{o[value]}</option>)}
      </select></label>
      <label className="block">{o.date}<input className={control} type="date" required value={date} onChange={(e) => setDate(e.target.value)} /></label>
      <label className="block">{t.rights}<select className={control} required value={rights} onChange={(e) => setRights(e.target.value)}>
        <option value="">{t.chooseRights}</option><option value="yes">{t.yes}</option><option value="no">{t.no}</option>
      </select></label>
    </>}
    <Button className={action} type="submit" disabled={!result || result === "obtained" && (!format || !date || !rights)}>{reconcile ? t.reconcile : t.record}</Button>
  </form>;
}
