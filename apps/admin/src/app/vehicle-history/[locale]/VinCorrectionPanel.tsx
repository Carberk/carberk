"use client";
import { useEffect, useRef, useState } from "react";
import { HistoryOrderSchemas as H } from "@auto-tm/contracts";
import { Button } from "@auto-tm/ui/components";

import { historyCorrectionAction } from "./correction-actions";
import type { HistoryInboxResult } from "./actions";

import { correctionCopy } from "@/lib/history-correction-copy";
import { offerCopy } from "@/lib/history-offer-copy";
import type { DeskLocale } from "@/lib/history-desk-copy";

export function VinCorrectionPanel({ locale, id, version, scope, actorId, state, onOrder, invalidate }: {
  locale: DeskLocale; id: string; version: number; scope: string; actorId: string; state: H.HistoryOrderState;
  onOrder: (state: H.HistoryOrderState) => void; invalidate: (result: HistoryInboxResult) => void;
}) {
  const t = correctionCopy[locale], o = offerCopy[locale];
  const [cause, setCause] = useState<"" | "customer_correction" | "company_error">("");
  const [format, setFormat] = useState(state.order?.acceptedOffer.proposal.format ?? "pdf");
  const [phase, setPhase] = useState("loading");
  const alive = useRef(true), busy = useRef(false), intent = useRef<H.HistoryOperatorCorrectionMutation | null>(null);
  const key = `carberk.history.vin-review.v1:${actorId}:${id}:${version}`;
  const binding = `${id}:${version}:${scope}:${actorId}:${locale}`;
  const latest = useRef(binding); latest.current = binding;
  useEffect(() => {
    alive.current = true;
    try { const raw = localStorage.getItem(key); intent.current = raw ? H.HistoryOperatorCorrectionMutationSchema.parse(JSON.parse(raw)) : null;
      setPhase(raw ? "uncertain" : "");
    } catch { setPhase("storage"); }
    return () => { alive.current = false; };
  }, [key]);
  const agreement = state.agreement;
  const pending = agreement?.pending, review = pending?.review;
  async function run(reviewing = false) {
    if (busy.current || !alive.current || phase === "storage") return;
    if (reviewing && !intent.current && !cause) return;
    const mutation = reviewing ? intent.current ?? { kind: "review" as const, attemptKey: crypto.randomUUID(), expectedAssignmentVersion: version,
      expectedVersion: agreement?.version ?? 0, cause: cause as "customer_correction" | "company_error", format } : undefined;
    busy.current = true; setPhase("pending");
    const expected = binding;
    const owns = () => alive.current && expected === latest.current;
    try {
      if (mutation) { localStorage.setItem(key, JSON.stringify(mutation)); intent.current = mutation; }
      const result = await historyCorrectionAction(locale, { id, scope, expectedAssignmentVersion: version, ...(mutation ? { mutation } : {}) });
      if (!owns()) return;
      if (result.status !== "ok") {
        setPhase(result.status);
        if (["denied", "expired", "stale"].includes(result.status)) invalidate({ status: result.status as "denied" | "expired" | "stale" });
        return;
      }
      if (result.scope !== scope || result.actorId !== actorId) { invalidate({ status: "stale" }); return; }
      onOrder(result.order);
      if (mutation || phase === "conflict" || phase === "closed" || phase === "validation" || phase === "capacity") {
        localStorage.removeItem(key); intent.current = null;
      }
      setPhase(intent.current ? "uncertain" : "");
    } catch { if (owns()) setPhase("unavailable"); }
    finally { busy.current = false; }
  }
  const timestamp = (value: string) => new Intl.DateTimeFormat(locale === "tk" ? "en-GB" : locale, {
    dateStyle: "short", timeStyle: "short", timeZone: "Asia/Ashgabat", hourCycle: "h23",
  }).format(new Date(value));
  function facts(offer: H.HistoryAcceptedOrder["acceptedOffer"]) {
    return <dl className="space-y-2">
      <div><dt>VIN</dt><dd className="break-all font-mono">{offer.vin}</dd></div>
      <div><dt>{t.Price}</dt><dd>{offer.proposal.priceTmt} TMT</dd></div>
      <div><dt>{o.format}</dt><dd>{o[offer.proposal.format]}</dd></div>
      {offer.preflight.providers.map((p) => <div key={p.name}><dt>{p.name} · {o.date}</dt><dd>{p.originalReportDate ?? o.unknown}</dd></div>)}
      <div><dt>{o.window}</dt><dd>{timestamp(offer.proposal.deliveryFrom)} – {timestamp(offer.proposal.deliveryBy)}</dd></div>
    </dl>;
  }
  if (!state.order) return null;
  return <section aria-label={t.Title} className="mt-5 space-y-4 border-t pt-5">
    <h5 className="font-semibold">{agreement?.handoff ? t.Closed : pending ? review ? t.Reviewed : t.Waiting : t.Title}</h5>
    {!agreement?.handoff && <p className="text-muted-foreground">{t.Policy}</p>}
    {pending && <>
      <h6 className="font-semibold">{t.Current}</h6>{facts(state.order.acceptedOffer)}
      <h6 className="font-semibold">{t.Proposed}</h6>{!review?.offer.proposal && <p className="break-all font-mono">{pending.vin}</p>}
      {review && <><p>{review.cause === "company_error" ? t.Company : t.Customer}</p>
        <p role="status">{review.offer.preflight ? o[review.offer.preflight.status] : o.unchecked}</p>
        {H.AcceptedHistoryOfferSchema.safeParse(review.offer).success && facts(H.AcceptedHistoryOfferSchema.parse(review.offer))}</>}
      <fieldset disabled={phase !== ""} className="space-y-4">
        <label className="block">{t.Cause}<select className="mt-2 min-h-11 w-full rounded-md border bg-background px-2" value={cause}
          onChange={(e) => setCause(e.target.value as typeof cause)}><option value="">{t.Choose}</option>
          <option value="customer_correction">{t.Customer}</option><option value="company_error">{t.Company}</option></select></label>
        <label className="block">{o.format}<select className="mt-2 min-h-11 w-full rounded-md border bg-background px-2" value={format}
          onChange={(e) => setFormat(e.target.value as typeof format)}>{(["pdf", "link", "both"] as const).map((f) => <option key={f} value={f}>{o[f]}</option>)}</select></label>
        <Button className="h-auto min-h-11 w-full whitespace-normal" disabled={!cause} onClick={() => { void run(true); }}>{t.Review}</Button>
      </fieldset>
    </>}
    {phase && phase !== "loading" && <p role={phase === "pending" ? "status" : "alert"}>{phase === "pending" ? t.Saving : phase === "storage" ? t.Storage
      : phase === "capacity" ? t.Capacity : phase === "closed" ? t.Closed : phase === "conflict" || phase === "validation" ? t.Changed : t.Error}</p>}
    {intent.current && !["pending", "conflict", "capacity", "closed", "validation"].includes(phase) && <Button variant="secondary" className="h-auto min-h-11 w-full whitespace-normal"
      onClick={() => { void run(true); }}>{t.Retry}</Button>}
    <Button variant="secondary" className="h-auto min-h-11 w-full whitespace-normal" disabled={phase === "pending" || phase === "storage"}
      onClick={() => { void run(); }}>{t.Refresh}</Button>
    {(agreement?.accepted.length ?? 0) > 1 && <details className="space-y-3"><summary className="min-h-11 cursor-pointer py-3 font-medium">{t.History}</summary>
      {agreement?.accepted.map((revision) => <div key={revision.revision} className="space-y-2 border-t pt-3"><p>{timestamp(revision.acceptedAt)}</p>
        {revision.cause && <p>{revision.cause === "company_error" ? t.Company : t.Customer}</p>}{facts(revision.offer)}</div>)}
    </details>}
  </section>;
}
