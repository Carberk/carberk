"use client";
import { useEffect, useRef, useState } from "react";
import { HistoryPaymentSchemas as P, type HistoryOrderSchemas as H } from "@auto-tm/contracts";
import { Button } from "@auto-tm/ui/components";

import { historyPaymentAction, type PaymentResult } from "./payment-actions";
import type { HistoryInboxResult } from "./actions";

import { paymentCopy } from "@/lib/history-payment-copy";
import type { DeskLocale } from "@/lib/history-desk-copy";

export function PaymentVerificationPanel({ locale, id, version, scope, actorId, revision, invalidate, onOrder }: {
  locale: DeskLocale; id: string; version: number; scope: string; actorId: string; revision: number;
  invalidate: (result: HistoryInboxResult) => void; onOrder: (order: H.HistoryOrderState) => void;
}) {
  const t = paymentCopy[locale];
  const [data, setData] = useState<Extract<PaymentResult, { status: "ok" }> | null>(null);
  const [phase, setPhase] = useState<"loading" | "ready" | "saving" | "error" | "denied">("loading");
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<P.HistoryPaymentCheckInput["outcome"]>("uncertain");
  const [amount, setAmount] = useState(""), [reference, setReference] = useState(""), [evidence, setEvidence] = useState("");
  const [received, setReceived] = useState(""), [receipt, setReceipt] = useState(""), [checked, setChecked] = useState(false);
  const [intent, setIntent] = useState<P.HistoryPaymentCheckInput | null>(null);
  const alive = useRef(true), busy = useRef(false), generation = useRef(0), queued = useRef(false);
  const binding = `${locale}:${id}:${version}:${scope}:${actorId}`;
  const current = useRef(binding); current.current = binding;
  const storageKey = `history-wallet-check:${scope}:${actorId}:${id}:${version}`;
  const load = useRef<() => void>(() => undefined);
  async function run(mutation?: P.HistoryPaymentCheckInput) {
    if (!alive.current) return;
    if (busy.current) { if (!mutation) queued.current = true; return; }
    busy.current = true;
    const expected = binding, attempt = ++generation.current;
    setPhase(mutation ? "saving" : "loading"); setError(null);
    try {
      const result = await historyPaymentAction(locale, { id, scope, expectedAssignmentVersion: version, ...(mutation ? { mutation } : {}) });
      if (!alive.current || current.current !== expected || generation.current !== attempt) return;
      if (result.status !== "ok") {
        const denied = ["denied", "expired", "stale"].includes(result.status);
        if (result.status === "validation" || result.status === "closed") { localStorage.removeItem(storageKey); setIntent(null); }
        setPhase(denied ? "denied" : "error"); setData(null);
        setError(denied ? t.denied : result.status === "validation" ? t.invalid : result.status === "conflict" ? t.conflict : result.status === "closed" ? t.closed : t.error);
        if (denied || result.status === "conflict") invalidate(result as HistoryInboxResult);
        return;
      }
      if (result.scope !== scope || result.actorId !== actorId) { setData(null); setPhase("denied"); setError(t.denied); return; }
      const retained = localStorage.getItem(storageKey);
      const parsed = retained ? P.HistoryPaymentCheckInputSchema.safeParse(JSON.parse(retained)) : null;
      if (parsed?.success && parsed.data.orderId === id && parsed.data.expectedAssignmentVersion === version) {
        if (result.data.checks.some((check) => check.input.attemptKey === parsed.data.attemptKey) || result.data.version !== parsed.data.expectedPaymentVersion) {
          localStorage.removeItem(storageKey); setIntent(null); setChecked(false);
        } else setIntent(parsed.data);
      } else { if (retained) localStorage.removeItem(storageKey); setIntent(null); }
      setData(result); setPhase("ready");
      onOrder(result.order);
    } catch {
      if (alive.current && current.current === expected && generation.current === attempt) { setData(null); setPhase("error"); setError(t.error); }
    } finally {
      busy.current = false;
      if (queued.current) { queued.current = false; queueMicrotask(() => load.current()); }
    }
  }
  load.current = () => { void run(); };
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { setData(null); setIntent(null); setChecked(false); load.current(); }, [binding, revision]);
  const confirmed = data?.data.checks.find((check) => check.confirmedAt);
  const timestamp = (value: string) => new Intl.DateTimeFormat(locale === "tk" ? "en-GB" : locale, {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Ashgabat", hourCycle: "h23",
  }).format(new Date(value));
  async function save() {
    if (!data || phase !== "ready") return;
    if (intent) { await run(intent); return; }
    const [major = "", minor = ""] = amount.trim().split(".");
    const amountMinor = /^\d+(?:\.\d{1,2})?$/.test(amount.trim()) ? Number(major) * 100 + Number(minor.padEnd(2, "0")) : -1;
    const parsed = P.HistoryPaymentCheckInputSchema.safeParse({ attemptKey: crypto.randomUUID(), orderId: id,
      expectedPaymentVersion: data.data.version, expectedAssignmentVersion: version, walletChecked: checked, outcome,
      amountMinor, reference, evidence, evidenceFileId: receipt || null,
      receivedAt: received && Number.isFinite(new Date(`${received}+05:00`).getTime()) ? new Date(`${received}+05:00`).toISOString() : null });
    if (!parsed.success) { setError(t.invalid); return; }
    try { localStorage.setItem(storageKey, JSON.stringify(parsed.data)); setIntent(parsed.data); }
    catch { setError(t.error); return; }
    await run(parsed.data);
  }
  return <section aria-label={t.title} className="space-y-4 border-t pt-4">
    <h5 className="font-semibold">{t.title}</h5>
    {phase === "loading" || phase === "saving" ? <p role="status">{phase === "saving" ? t.saving : t.loading}</p> : null}
    {error && <p id={`payment-error-${id}`} role="alert" className="text-destructive">{error}</p>}
    {data && <>
      <div role="status" aria-live="polite" className="space-y-2">
        <p className="font-medium">{confirmed ? confirmed.bookingCommitted ? t.confirmed : t.noHold
          : data.data.checks.length ? t.review : data.receipts.length ? t.receiptSubmitted : t.empty}</p>
        {(confirmed || data.data.checks.length > 0) && <p>{confirmed ? confirmed.bookingCommitted ? t.next : t.noHoldNext : t.reviewNext}</p>}
      </div>
      {!confirmed && <form onSubmit={(event) => { event.preventDefault(); void save(); }} className="space-y-4">
        <fieldset disabled={phase !== "ready" || !!intent} className="min-w-0 space-y-4" aria-describedby={error ? `payment-error-${id}` : undefined}>
          <label className="block">{t.outcome}<select className="mt-2 min-h-11 w-full min-w-0 max-w-full rounded-md border bg-background px-3" value={outcome} onChange={(event) => setOutcome(event.target.value as typeof outcome)}>
            {(["uncertain", "unmatched", "partial", "matched"] as const).map((value) => <option key={value} value={value}>{t[value]}</option>)}
          </select></label>
          <label className="block">{t.amount}<input required type="number" min="0" max="1000000" step="0.01" className="mt-2 min-h-11 w-full min-w-0 max-w-full rounded-md border bg-background px-3" value={amount} onChange={(event) => setAmount(event.target.value)} /></label>
          <label className="block">{t.reference}<input required maxLength={160} className="mt-2 min-h-11 w-full min-w-0 max-w-full rounded-md border bg-background px-3" value={reference} onChange={(event) => setReference(event.target.value)} /></label>
          <label className="block">{t.received}<input type="datetime-local" required={outcome === "matched" || outcome === "partial"} className="mt-2 min-h-11 w-full min-w-0 max-w-full rounded-md border bg-background px-3" value={received} onChange={(event) => setReceived(event.target.value)} /></label>
          <label className="block">{t.evidence}<textarea required maxLength={1000} rows={3} className="mt-2 min-h-11 w-full min-w-0 max-w-full rounded-md border bg-background px-3 py-2" value={evidence} onChange={(event) => setEvidence(event.target.value)} /></label>
          <label className="block">{t.receipt}<select className="mt-2 min-h-11 w-full min-w-0 max-w-full rounded-md border bg-background px-3" value={receipt} onChange={(event) => setReceipt(event.target.value)}>
            <option value="">{t.noReceipt}</option>{data.receipts.filter((file) => file.status === "submitted").map((file, index) => <option key={file.id} value={file.id}>{index + 1} · {timestamp(file.submittedAt ?? file.createdAt)}</option>)}
          </select></label>
          <label className="flex min-h-11 items-start gap-3 py-2"><input type="checkbox" checked={checked} className="mt-1 size-5 shrink-0" onChange={(event) => setChecked(event.target.checked)} /><span>{t.checked}</span></label>
        </fieldset>
        <Button type="submit" className="h-auto min-h-11 w-full whitespace-normal" disabled={phase !== "ready" || !intent && !checked}>{intent ? t.retry : t.save}</Button>
      </form>}
      {data.data.checks.length > 0 && <details><summary className="min-h-11 cursor-pointer py-3 font-medium">{t.history}</summary>
        <ol className="space-y-5">{data.data.checks.map((check) => <li key={check.input.attemptKey} className="space-y-2 break-words border-t pt-3">
          <p className="font-medium">{t[check.input.outcome]} · {new Intl.NumberFormat(locale === "tk" ? "en-GB" : locale).format(check.input.amountMinor / 100)} TMT</p>
          <p>{t.actor}: <span className="select-all break-all font-mono">{check.actorId}</span></p>
          <p>{t.reference}: {check.input.reference}</p><p>{t.evidence}: {check.input.evidence}</p>
          {check.input.receivedAt && <p>{t.received}: {timestamp(check.input.receivedAt)}</p>}
          <p>{t.checkedAt}: {timestamp(check.checkedAt)}</p>{check.confirmedAt && <p>{t.confirmedAt}: {timestamp(check.confirmedAt)}</p>}
        </li>)}</ol>
      </details>}
    </>}
    <Button variant="secondary" className="h-auto min-h-11 whitespace-normal" disabled={phase === "loading" || phase === "saving"} onClick={() => { void run(); }}>{t.refresh}</Button>
  </section>;
}
