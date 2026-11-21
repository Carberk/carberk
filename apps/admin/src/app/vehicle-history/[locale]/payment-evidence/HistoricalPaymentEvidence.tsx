"use client";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@auto-tm/ui/components";

import { historicalProofAction, type HistoricalProofResult } from "../proof-actions";

import { proofCopy } from "@/lib/history-proof-copy";
import type { DeskLocale } from "@/lib/history-desk-copy";

export function HistoricalPaymentEvidence({ locale }: { locale: DeskLocale }) {
  const t = proofCopy[locale];
  const [requestId, setRequest] = useState(""), [fileId, setFile] = useState(""), [reason, setReason] = useState("");
  const [result, setResult] = useState<HistoricalProofResult | null>(null), [pending, setPending] = useState(false);
  const alive = useRef(true), busy = useRef(false), generation = useRef(0);
  const help = useId();
  useEffect(() => {
    alive.current = true;
    const hide = () => { generation.current++; setResult(null); };
    window.addEventListener("blur", hide); document.addEventListener("visibilitychange", hide);
    return () => { alive.current = false; window.removeEventListener("blur", hide); document.removeEventListener("visibilitychange", hide); };
  }, []);
  const edit = (write: (value: string) => void, value: string) => { generation.current++; setResult(null); write(value); };
  return <>
    <h1 className="text-2xl font-semibold">{t.historical}</h1><p>{t.boundary}</p>
    <form className="space-y-4" onSubmit={(event) => {
      event.preventDefault(); if (busy.current) return;
      busy.current = true; setPending(true); setResult(null);
      const attempt = ++generation.current;
      void historicalProofAction(locale, { requestId, fileId, reason, purpose: "payment_evidence" }).then((response) => {
        if (alive.current && generation.current === attempt) setResult(response);
      }).catch(() => { if (alive.current && generation.current === attempt) setResult({ status: "unavailable" }); })
        .finally(() => { busy.current = false; if (alive.current) setPending(false); });
    }}>
      <label className="block">{t.requestId}<input name="requestId" value={requestId} required maxLength={36} disabled={pending} onChange={(event) => edit(setRequest, event.target.value)} className="mt-2 min-h-11 w-full rounded-md border bg-background px-3 font-mono" /></label>
      <label className="block">{t.fileId}<input name="fileId" value={fileId} required maxLength={36} disabled={pending} onChange={(event) => edit(setFile, event.target.value)} className="mt-2 min-h-11 w-full rounded-md border bg-background px-3 font-mono" /></label>
      <label className="block">{t.reason}<textarea name="reason" value={reason} required minLength={10} maxLength={500} disabled={pending} aria-describedby={help} onChange={(event) => edit(setReason, event.target.value)} className="mt-2 min-h-28 w-full rounded-md border bg-background p-3" /></label>
      <p id={help} className="text-sm text-muted-foreground">{t.reasonHelp}</p>
      <Button className="h-auto min-h-11 whitespace-normal" disabled={pending} aria-busy={pending}>{pending ? t.loading : t.read}</Button>
    </form>
    {result?.status === "ok" ? <div className="space-y-3"><p role="status">{t.audited}</p>
      <img src={`data:${result.content.file.contentType};base64,${result.content.dataBase64}`} alt={t.preview} className="max-h-[70vh] w-full object-contain" />
      <Button variant="secondary" className="min-h-11" onClick={() => setResult(null)}>{t.close}</Button>
    </div> : result && <div role="alert"><p>{result.status === "validation" ? t.validation : result.status === "expired" || result.status === "denied" ? t.denied : t.error}</p>
      {result.status === "expired" && <a className="inline-block min-h-11 py-3 underline" href={`/login?returnTo=${encodeURIComponent(`/vehicle-history/${locale}/payment-evidence`)}`}>{t.signIn}</a>}</div>}
  </>;
}
