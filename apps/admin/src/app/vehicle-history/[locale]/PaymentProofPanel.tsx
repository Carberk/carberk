"use client";
import { useEffect, useRef, useState } from "react";
import type { HistoryPaymentProofSchemas as P } from "@auto-tm/contracts";
import { Button } from "@auto-tm/ui/components";

import { PaymentProofViewer } from "./PaymentProofViewer";
import { historyProofAction } from "./proof-actions";
import type { HistoryInboxResult } from "./actions";

import { proofCopy } from "@/lib/history-proof-copy";
import type { DeskLocale } from "@/lib/history-desk-copy";

export function PaymentProofPanel({ locale, id, version, scope, actorId, revision, invalidate }: {
  locale: DeskLocale; id: string; version: number; scope: string; actorId: string; revision: number; invalidate: (result: HistoryInboxResult) => void;
}) {
  const t = proofCopy[locale];
  const [items, setItems] = useState<P.PaymentProof[]>([]);
  const [content, setContent] = useState<{ file: P.PaymentProof; dataBase64: string } | null>(null);
  const [phase, setPhase] = useState<"loading" | "ready" | "denied" | "error">("loading");
  const section = useRef<HTMLElement>(null), openedFile = useRef<string | null>(null);
  const queued = useRef(false);
  const alive = useRef(true), busy = useRef(false), generation = useRef(0);
  const binding = `${locale}:${id}:${version}:${scope}:${actorId}`;
  const current = useRef(binding); current.current = binding;
  const load = useRef<() => void>(() => undefined);
  async function run(fileId?: string) {
    if (!alive.current) return;
    if (busy.current) { queued.current = true; return; }
    busy.current = true; setContent(null); setPhase("loading");
    const expected = binding, attempt = ++generation.current;
    try {
      const result = await historyProofAction(locale, { id, scope, expectedAssignmentVersion: version, ...(fileId ? { fileId } : {}) });
      if (!alive.current || current.current !== expected || generation.current !== attempt) return;
      if (result.status !== "ok") {
        setItems([]); setPhase(["denied", "stale", "conflict", "expired"].includes(result.status) ? "denied" : "error");
        if (["denied", "stale", "conflict", "expired"].includes(result.status)) invalidate(result);
        return;
      }
      if (result.scope !== scope || result.actorId !== actorId) { setItems([]); setPhase("denied"); return; }
      if (!fileId) setItems(result.items);
      setContent(result.content); setPhase("ready");
    } catch { if (alive.current && current.current === expected) { setItems([]); setPhase("error"); } }
    finally { busy.current = false; if (queued.current) { queued.current = false; queueMicrotask(() => load.current()); } }
  }
  load.current = () => { void run(); };
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { setContent(null); setItems([]); load.current(); }, [binding, revision]);
  useEffect(() => {
    const hide = () => { if (document.hidden || !document.hasFocus()) { generation.current++; setContent(null); } };
    window.addEventListener("blur", hide); document.addEventListener("visibilitychange", hide);
    return () => { window.removeEventListener("blur", hide); document.removeEventListener("visibilitychange", hide); };
  }, []);
  return <section ref={section} aria-label={t.title} className="space-y-3 border-t pt-4">
    <h5 className="font-semibold">{t.title}</h5>
    {phase === "loading" ? <p role="status">{t.loading}</p> : phase === "error" || phase === "denied" ? <p role="alert">{phase === "denied" ? t.denied : t.error}</p>
      : <><p>{items.length ? t.review : t.empty}</p>
        {items.map((item, index) => <Button key={item.id} data-proof-id={item.id} variant="secondary" className="min-h-11" onClick={() => { openedFile.current = item.id; void run(item.id); }}>{t.view}{items.length > 1 ? ` ${index + 1}` : ""}</Button>)}
        {content && <PaymentProofViewer locale={locale} content={content} close={() => setContent(null)} restoreFocus={() => section.current?.querySelector<HTMLButtonElement>(`button[data-proof-id="${openedFile.current}"]`)?.focus()} />}
      </>}
    <Button variant="secondary" className="min-h-11" disabled={phase === "loading"} onClick={() => { void run(); }}>{t.refresh}</Button>
  </section>;
}
