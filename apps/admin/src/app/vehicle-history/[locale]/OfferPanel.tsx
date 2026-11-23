"use client";
import { useEffect, useId, useRef, useState } from "react";
import type { HistoryOrderSchemas as H, HistoryOfferSchemas as O } from "@auto-tm/contracts";
import { Button } from "@auto-tm/ui/components";

import { PaymentProofPanel } from "./PaymentProofPanel";
import { PaymentVerificationPanel } from "./PaymentVerificationPanel";
import { FulfilmentPanel } from "./FulfilmentPanel";
import { VinCorrectionPanel } from "./VinCorrectionPanel";
import { historyOfferAction } from "./offer-actions";
import type { HistoryInboxResult } from "./actions";

import { paymentCopy } from "@/lib/history-payment-copy";
import { offerCopy } from "@/lib/history-offer-copy";
import type { DeskLocale } from "@/lib/history-desk-copy";

export function OfferPanel({ locale, id, version, scope, actorId, revision, invalidate }: {
  locale: DeskLocale; id: string; version: number; scope: string; actorId: string; revision: number;
  invalidate: (result: HistoryInboxResult) => void;
}) {
  const t = offerCopy[locale];
  const [data, setData] = useState<O.HistoryOffer | null>(null);
  const [orderState, setOrderState] = useState<H.HistoryOrderState | null>(null);
  const [phase, setPhase] = useState<"loading" | "ready" | "pending" | "error">("loading");
  const [vin, setVin] = useState("");
  const [format, setFormat] = useState<"" | "pdf" | "link" | "both">("");
  const [from, setFrom] = useState(""), [by, setBy] = useState("");
  const [windowIssue, setWindowIssue] = useState<"invalid" | "capacity" | null>(null);
  const windowHelp = useId();
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
      if ((result.status === "validation" || result.status === "capacity") && mutation?.kind === "propose" && result.scope === scope) {
        setWindowIssue(result.status === "capacity" ? "capacity" : "invalid"); setPhase("ready");
        return;
      }
      if (result.status !== "ok") {
        setData(null); setPhase("error");
        if (result.status === "expired" || result.status === "denied" || result.status === "stale") invalidate({ status: result.status });
        return;
      }
      if (result.scope !== scope || result.actorId !== actorId) { setData(null); setPhase("error"); return; }
      setData(result.order.order?.acceptedOffer ?? result.data); setOrderState(result.order); setPhase("ready");
      if (mutation) setWindowIssue(null);
      if (!vin || mutation?.kind === "check") setVin(result.data.vin ?? "");
    } catch { if (alive.current && expected === currentBinding.current) { setData(null); setPhase("error"); } }
    finally { busy.current = false; }
  }
  load.current = () => { void run(); };
  useEffect(() => { load.current(); }, [binding, revision]);
  useEffect(() => {
    if (!orderState?.order || orderState.status !== "awaiting_synthetic_payment" || phase !== "ready") return;
    const remaining = new Date(orderState.order.holdExpiresAt).getTime() - new Date(orderState.serverNow).getTime();
    const timer = setTimeout(() => load.current(), Math.max(0, remaining));
    return () => clearTimeout(timer);
  }, [orderState, phase]);
  const accepted = orderState?.order;
  const available = data?.preflight?.status === "available";
  const proposal = data?.proposal;
  const timestamp = (value: string) => new Intl.DateTimeFormat(locale === "tk" ? "en-GB" : locale, {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Asia/Ashgabat",
  }).format(new Date(value));
  return <section aria-label={t.title} className="mt-6 space-y-4 border-t pt-5 text-sm">
    <h4 className="font-semibold">{accepted ? orderState?.status === "payment_confirmed" ? paymentCopy[locale].confirmed
      : orderState?.status === "payment_received_no_hold" ? paymentCopy[locale].noHold : orderState?.payment ? paymentCopy[locale].review
        : orderState?.status === "hold_expired" ? t.orderExpired : t.orderWaiting : t.title}</h4>
    <p className="text-muted-foreground">{t.synthetic}</p>
    {phase === "loading" ? <p role="status">{t.loading}</p> : phase === "error" ? <div role="alert">
      <p>{t.error}</p><Button className="mt-3" variant="secondary" onClick={() => { void run(); }}>{t.refresh}</Button>
    </div> : data && <>
      {!accepted && <><label className="block">{t.vin}<input className="mt-2 min-h-11 w-full rounded-md border bg-background px-3 font-mono" value={vin} maxLength={80}
        disabled={phase === "pending"} onChange={(event) => setVin(event.target.value)} autoCapitalize="characters" spellCheck={false} /></label>
      <Button className="h-auto min-h-11 w-full whitespace-normal" disabled={phase === "pending" || !vin.trim()} aria-busy={phase === "pending"}
        onClick={() => { void run({ kind: "check", vin, expectedVersion: data.version, expectedAssignmentVersion: version }); }}>{phase === "pending" ? t.pending : t.check}</Button></>}
      <p role="status" aria-live="polite">{data.preflight ? t[data.preflight.status] : data.vin ? t.unchecked : t.empty}</p>
      {data.vin && !proposal && <p className="break-all font-mono">VIN: {data.vin}</p>}
      {data.preflight?.status === "available" && !accepted && <>
        <p>{t.rule}</p>
        <dl className="space-y-2">{data.preflight.providers.map((provider) => <div key={provider.name}><dt className="font-medium">{provider.name} · {t.date}</dt><dd>{provider.originalReportDate ?? t.unknown}</dd></div>)}</dl>
        <p className="text-muted-foreground">{t.limits}</p>
      </>}
      {available && !accepted && <fieldset disabled={phase === "pending" || vin !== data.vin} className="space-y-4">
        <label className="block">{t.format}<select className="mt-2 min-h-11 w-full rounded-md border bg-background px-2" value={format}
          onChange={(event) => setFormat(event.target.value as typeof format)}>
          <option value="">{t.choose}</option>{(["pdf", "link", "both"] as const).map((value) => <option key={value} value={value}>{t[value]}</option>)}
        </select></label>
        <label className="block">{t.fromLabel}<input className="mt-2 min-h-11 w-full rounded-md border bg-background px-2" type="datetime-local" value={from}
          aria-invalid={!!windowIssue || undefined} aria-describedby={windowHelp} onChange={(event) => { setFrom(event.target.value); setWindowIssue(null); }} /></label>
        <label className="block">{t.byLabel}<input className="mt-2 min-h-11 w-full rounded-md border bg-background px-2" type="datetime-local" value={by}
          aria-invalid={!!windowIssue || undefined} aria-describedby={windowHelp} onChange={(event) => { setBy(event.target.value); setWindowIssue(null); }} /></label>
        <p key={windowIssue ?? "help"} id={windowHelp} role={windowIssue ? "alert" : undefined}
          className={windowIssue ? "text-destructive" : "text-muted-foreground"}>{windowIssue === "capacity" ? t.windowFull : t.windowHelp}</p>
        <Button className="h-auto min-h-11 w-full whitespace-normal" disabled={!format || !from || !by || from >= by} onClick={() => {
          if (!format) return;
          void run({ kind: "propose", format, expectedVersion: data.version, expectedAssignmentVersion: version,
            deliveryFrom: new Date(`${from}+05:00`).toISOString(), deliveryBy: new Date(`${by}+05:00`).toISOString() });
        }}>{t.propose}</Button>
      </fieldset>}
      {proposal && <div className="space-y-3 rounded-lg border p-4">
        <h5 className="font-semibold">{accepted ? t.orderSummary : t.preview}</h5><p className="break-all font-mono">{data.vin}</p>
        <p>{t.format}: {t[proposal.format]}</p><p>{t.window}: {timestamp(proposal.deliveryFrom)} – {timestamp(proposal.deliveryBy)}</p>
        {accepted ? <>
          <p>{t.orderAccepted}: {timestamp(accepted.acceptedAt)}</p><p>{t.orderHold}: {timestamp(accepted.holdExpiresAt)}</p>
          {orderState?.reportPlan && <p>{t.reservedReport} {orderState.reportPlan.primary}
            {orderState.reportPlan.second && <> · {t.spareReport} {orderState.reportPlan.second}</>}</p>}
          {!orderState?.payment && <p role="status">{orderState?.status === "hold_expired" ? t.orderExpiredNext : t.orderNext}</p>}
          {orderState?.wallet && phase === "ready" && <p className="break-all font-mono">{orderState.wallet}</p>}
          <PaymentProofPanel key={`${id}:${version}:${scope}:${actorId}`} {...{ locale, id, version, scope, actorId, revision, invalidate }} />
          <PaymentVerificationPanel key={`payment:${id}:${version}:${scope}:${actorId}`} {...{ locale, id, version, scope, actorId, revision, invalidate }} onOrder={setOrderState} />
          {orderState && <FulfilmentPanel key={`fulfilment:${id}:${version}:${scope}:${actorId}:${locale}`}
            {...{ locale, id, version, scope, actorId, invalidate }} state={orderState} onOrder={setOrderState} />}
          {orderState && <VinCorrectionPanel key={`correction:${id}:${version}:${scope}:${actorId}:${locale}`} {...{ locale, id, version, scope, actorId, invalidate }}
            state={orderState} onOrder={(state) => { setOrderState(state); if (state.order) setData(state.order.acceptedOffer); }} />}
          <details className="space-y-3"><summary className="cursor-pointer py-3 font-medium">{t.orderDetails}</summary>
            {data.preflight?.status === "available" && <><p>{t.rule}</p><dl className="space-y-2">{data.preflight.providers.map((provider) => <div key={provider.name}><dt>{provider.name} · {t.date}</dt><dd>{provider.originalReportDate ?? t.unknown}</dd></div>)}</dl><p>{t.limits}</p></>}
            {proposal.format !== "pdf" && <p>{t.links}</p>}<p>{t.rights}</p><p>{t.terms}</p>
          </details>
        </> : <>{proposal.format !== "pdf" && <p>{t.links}</p>}<p>{t.rights}</p><p>{t.terms}</p><p className="text-muted-foreground">{t.next}</p></>}
      </div>}
    </>}
  </section>;
}
