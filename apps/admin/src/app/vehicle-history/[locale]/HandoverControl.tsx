"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@auto-tm/ui/components";
import { IdentitySchemas, type VehicleHistorySchemas as V } from "@auto-tm/contracts";

import { historyAssigneesAction, historyHandoverAction } from "./actions";

import { deskCopy, type DeskLocale } from "@/lib/history-desk-copy";

type Operator = V.HistoryDesk["actor"];
export function HandoverControl({ locale, id, version, scope, actorId, onSuccess, onRefresh }: {
  locale: DeskLocale; id: string; version: number; scope: string; actorId: string;
  onSuccess: (name: string) => void; onRefresh: () => void;
}) {
  const t = deskCopy[locale];
  const live = useRef(true);
  const generation = useRef(0);
  const sending = useRef(false);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [operators, setOperators] = useState<Operator[] | null>(null);
  const [targetId, setTargetId] = useState("");
  const [notice, setNotice] = useState<"load" | "lost" | "uncertain" | null>(null);
  const target = operators?.find((operator) => operator.id === targetId);
  const targetName = target ? IdentitySchemas.formatDisplayName(target, locale) : "";
  const selection = { id, scope, expectedAssignmentVersion: version };
  useEffect(() => { live.current = true; const current = generation; return () => { live.current = false; current.current++; }; }, []);
  async function load() {
    const current = ++generation.current;
    setLoading(true); setNotice(null);
    try {
      const result = await historyAssigneesAction(locale, selection);
      if (!live.current || current !== generation.current) return;
      if (result.status === "ok") { setOperators(result.data.items.filter((operator) => operator.id !== actorId)); setTargetId(""); }
      else setNotice(["conflict", "denied", "stale", "expired"].includes(result.status) ? "lost" : "load");
    } catch { if (live.current && current === generation.current) setNotice("load"); }
    finally { if (live.current && current === generation.current) setLoading(false); }
  }
  async function confirm() {
    if (!target || notice || sending.current || !live.current) return;
    sending.current = true; setBusy(true); setNotice(null);
    try {
      const result = await historyHandoverAction(locale, { ...selection, targetOperatorId: target.id });
      if (!live.current) return;
      if (result.status === "ok") onSuccess(targetName);
      else setNotice(["conflict", "stale"].includes(result.status) ? "lost" : "uncertain");
    } catch { if (live.current) setNotice("uncertain"); }
    finally { sending.current = false; if (live.current) setBusy(false); }
  }
  if (!open) return <Button type="button" size="lg" variant="secondary" onClick={() => { setOpen(true); void load(); }}>{t.handover}</Button>;
  return <div role="group" aria-label={t.handover} aria-busy={loading || busy} className="w-full max-w-md space-y-3 rounded-lg border p-4">
    {loading && <p role="status" className="text-sm">{t.loading}</p>}
    {operators && operators.length === 0 && <p role="status" className="text-sm">{t.handoverEmpty}</p>}
    {operators && operators.length > 0 && <>
      <label htmlFor="history-handover-target" className="block text-sm font-medium">{t.newOperator}</label>
      <select id="history-handover-target" className="min-h-11 w-full rounded-md border bg-background px-3 py-2 text-sm"
        disabled={busy} value={targetId} onChange={(event) => setTargetId(event.target.value)}>
        <option value="">{t.chooseOperator}</option>
        {operators.map((operator) => <option key={operator.id} value={operator.id}>{IdentitySchemas.formatDisplayName(operator, locale)}</option>)}
      </select>
      {target && <p className="text-sm">{t.handoverQuestion.replace("{name}", targetName)}</p>}
      <Button type="button" size="lg" disabled={!target || busy || !!notice} aria-busy={busy} onClick={() => void confirm()}>{t.confirmHandover}</Button>
    </>}
    {notice && <div role="alert" className="space-y-2 text-sm">
      <p>{notice === "load" ? t.handoverError : notice === "lost" ? t.assignmentLost : t.handoverUncertain}</p>
      <Button type="button" size="lg" variant="secondary" onClick={() => notice === "load" ? void load() : onRefresh()}>
        {notice === "load" ? t.retry : t.refresh}
      </Button>
    </div>}
    <Button type="button" size="lg" variant="secondary" disabled={busy} onClick={() => { generation.current++; setOpen(false); setNotice(null); }}>
      {t.cancelHandover}
    </Button>
  </div>;
}
