"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { VehicleHistorySchemas as V } from "@auto-tm/contracts";
import { VehicleHistorySchemas } from "@auto-tm/contracts";
import { Button } from "@auto-tm/ui/components";

import type { HistoryReminderResult } from "./actions";

import { deskCopy, type DeskLocale } from "@/lib/history-desk-copy";

type Intent = { clientMessageId: string; expectedWaitingVersion: number };
export function ReminderControl({ locale, actorId, id, version, data, error, busy, offline, send, refresh }: {
  locale: DeskLocale; actorId: string; id: string; version: number; data: V.HistoryReminder | null;
  error: boolean; busy: boolean; offline: boolean; refresh: () => void;
  send: (intent: Intent, complete: (result: HistoryReminderResult) => void) => boolean;
}) {
  const t = deskCopy[locale];
  const key = `carberk.history.reminder.v1:${actorId}:${id}:${version}`;
  const intent = useRef<Intent | null>(null);
  const live = useRef(false), sending = useRef(false);
  const [phase, setPhase] = useState<"loading" | "ready" | "pending" | "uncertain" | "storage" | "changed">("loading");
  const load = useCallback(() => {
    try {
      const raw = localStorage.getItem(key);
      const parsed = raw ? VehicleHistorySchemas.SendHistoryReminderSchema.parse({ ...JSON.parse(raw), expectedAssignmentVersion: version }) : null;
      intent.current = parsed ? { clientMessageId: parsed.clientMessageId, expectedWaitingVersion: parsed.expectedWaitingVersion } : null;
      setPhase(parsed ? "uncertain" : "ready");
    } catch { setPhase("storage"); }
  }, [key, version]);
  useEffect(() => { live.current = true; load(); return () => { live.current = false; }; }, [load]);
  function settle() {
    localStorage.removeItem(key); intent.current = null;
  }
  function submit() {
    if (sending.current || busy || offline || error || !data || !intent.current && !data.eligible) return;
    const attempt = intent.current ?? { clientMessageId: crypto.randomUUID(), expectedWaitingVersion: data.version };
    try { localStorage.setItem(key, JSON.stringify(attempt)); } catch { setPhase("storage"); return; }
    intent.current = attempt; sending.current = true; setPhase("pending");
    const admitted = send(attempt, (result) => {
      if (!live.current) return;
      sending.current = false;
      if (result.status !== "ok") { setPhase("uncertain"); return; }
      try { settle(); setPhase(result.refused && result.data.eligible ? "changed" : "ready"); }
      catch { setPhase("storage"); }
    });
    if (!admitted) { sending.current = false; setPhase("uncertain"); }
  }
  const status = offline ? t.reminderOffline : phase === "storage" ? t.reminderStorage : phase === "pending" ? t.pending
    : phase === "uncertain" ? t.reminderUncertain : error ? t.reminderError : !data ? t.loading
      : phase === "changed" ? t.reminderChanged : data.ineligibleReason ? t.reminderState[data.ineligibleReason] : t.reminderEligible;
  return <section aria-label={t.reminder} className="mt-5 space-y-3 border-t pt-4 text-sm">
    <h3 className="font-medium">{t.reminder}</h3>
    <p role="status" aria-live="polite">{status}</p>
    <div className="flex flex-wrap gap-3">
      <Button variant="secondary" disabled={busy || offline || error || !data || ["loading", "pending", "storage"].includes(phase) || !intent.current && !data.eligible}
        aria-busy={phase === "pending"} onClick={submit}>{intent.current ? t.retryReminder : t.sendReminder}</Button>
      {(error || phase === "storage" || !data) && <Button variant="secondary" disabled={busy || offline} onClick={() => { load(); refresh(); }}>{t.retry}</Button>}
    </div>
  </section>;
}
