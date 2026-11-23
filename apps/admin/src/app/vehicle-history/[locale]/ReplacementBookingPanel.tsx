"use client";
import { useEffect, useId, useRef, useState } from "react";
import type { HistoryOrderSchemas as H } from "@auto-tm/contracts";
import { Button } from "@auto-tm/ui/components";

import type { HistoryInboxResult } from "./actions";
import { historyReplacementAction } from "./replacement-actions";

import type { DeskLocale } from "@/lib/history-desk-copy";
import { offerCopy } from "@/lib/history-offer-copy";
import { replacementCopy } from "@/lib/history-replacement-copy";

export function ReplacementBookingPanel({ locale, id, version, scope, state, timestamp, invalidate, onOrder }: {
  locale: DeskLocale; id: string; version: number; scope: string; state: H.HistoryReplacementState;
  timestamp: (value: string) => string; invalidate: (result: HistoryInboxResult) => void;
  onOrder: (order: H.HistoryOrderState) => void;
}) {
  const t = replacementCopy[locale], offer = offerCopy[locale];
  const [from, setFrom] = useState(""), [by, setBy] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [issue, setIssue] = useState<"capacity" | "conflict" | "validation" | "unavailable" | null>(null);
  const [busy, setBusy] = useState(false);
  const help = useId(), error = useId();
  const current = useRef(false), pending = useRef(false);
  useEffect(() => { current.current = true; return () => { current.current = false; }; }, []);
  const closed = state.status === "accepted" || state.status === "refund_decision_pending";
  const needsRefresh = issue === "unavailable" || issue === "conflict";

  async function run(kind?: H.HistoryOperatorReplacement["kind"]) {
    if (pending.current || (kind && (closed || needsRefresh))) return;
    const intent = { orderId: id, expectedAssignmentVersion: version, expectedVersion: state.version };
    let mutation: H.HistoryOperatorReplacement | undefined;
    if (kind === "propose") {
      const start = new Date(`${from}+05:00`), end = new Date(`${by}+05:00`);
      if (!(start < end)) { setIssue("validation"); return; }
      mutation = { kind, ...intent, attemptKey: crypto.randomUUID(), deliveryFrom: start.toISOString(), deliveryBy: end.toISOString() };
    } else if (kind === "no_window") mutation = { kind, ...intent, attemptKey: crypto.randomUUID() };
    pending.current = true;
    setBusy(true); setIssue(null);
    try {
      const result = await historyReplacementAction(locale, { id, expectedAssignmentVersion: version, scope, ...(mutation ? { mutation } : {}) });
      if (!current.current) return;
      if (result.status === "ok") {
        onOrder(result.data);
        setConfirming(false);
      } else if (result.status === "expired" || result.status === "denied" || result.status === "stale") {
        invalidate({ status: result.status });
      } else if (result.status === "capacity" || result.status === "conflict" || result.status === "validation" || result.status === "unavailable") {
        setIssue(result.status);
      }
    } catch {
      if (current.current) setIssue("unavailable");
    } finally {
      pending.current = false;
      if (current.current) setBusy(false);
    }
  }

  return <section aria-label={t.title} className="space-y-3 border-t pt-4">
    <h5 className="font-semibold">{t.title}</h5>
    <div role="status" className="space-y-1">
      <p className="font-medium">{busy ? t.saving : t[state.status]}</p>
      {"window" in state && <p>{timestamp(state.window.deliveryFrom)} – {timestamp(state.window.deliveryBy)} · {t.timeZone}</p>}
      {state.status === "refund_decision_pending" && <p>{t[state.reason]}</p>}
    </div>
    {!closed && <>
      <p>{t.charge}</p>
      <form onSubmit={(event) => { event.preventDefault(); void run("propose"); }}>
        <fieldset className="min-w-0 space-y-3" disabled={busy || needsRefresh || confirming} aria-describedby={issue ? `${help} ${error}` : help}>
          <label className="block">{offer.fromLabel}
            <input className="mt-2 min-h-11 w-full rounded-md border bg-background px-2" type="datetime-local" required value={from} aria-invalid={issue === "validation" || undefined}
              onChange={(event) => { setFrom(event.target.value); if (!needsRefresh) setIssue(null); }} />
          </label>
          <label className="block">{offer.byLabel}
            <input className="mt-2 min-h-11 w-full rounded-md border bg-background px-2" type="datetime-local" required value={by} aria-invalid={issue === "validation" || undefined}
              onChange={(event) => { setBy(event.target.value); if (!needsRefresh) setIssue(null); }} />
          </label>
          <p id={help} className="text-muted-foreground">{offer.windowHelp}</p>
          <Button type="submit" className="h-auto min-h-11 w-full whitespace-normal" disabled={!from || !by || from >= by}>{t.propose}</Button>
        </fieldset>
      </form>
      {issue && <p id={error} role="alert" className="text-destructive">{t[issue]}</p>}
      {confirming && <p>{t.review}</p>}
      <div className="flex flex-wrap gap-2">
        {confirming ? <>
          <Button className="h-auto min-h-11 whitespace-normal" disabled={busy || needsRefresh} onClick={() => { void run("no_window"); }}>{t.escalate}</Button>
          <Button variant="secondary" className="min-h-11" disabled={busy} onClick={() => setConfirming(false)}>{t.cancel}</Button>
        </> : <Button variant="secondary" className="h-auto min-h-11 whitespace-normal" disabled={busy || needsRefresh} onClick={() => setConfirming(true)}>{t.noWindow}</Button>}
        <Button variant="secondary" className="min-h-11" disabled={busy} onClick={() => { void run(); }}>{t.refresh}</Button>
      </div>
    </>}
  </section>;
}
