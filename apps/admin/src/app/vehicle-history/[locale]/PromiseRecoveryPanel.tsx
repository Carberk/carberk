"use client";
import { useEffect, useRef, useState } from "react";
import type { HistoryOrderSchemas as H } from "@auto-tm/contracts";
import { Button } from "@auto-tm/ui/components";

import { historyFulfilmentAction } from "./fulfilment-actions";
import type { HistoryInboxResult } from "./actions";

import type { DeskLocale } from "@/lib/history-desk-copy";
import { offerCopy } from "@/lib/history-offer-copy";
import { promiseRecoveryCopy } from "@/lib/history-promise-recovery-copy";

type Recovery = H.HistoryRecoveryState;
type Format = Recovery["originalFormat"];
type Action = { kind: "propose_format"; format: Format } | { kind: "company_error_refund" };

export function PromiseRecoveryPanel({ locale, id, version, scope, actorId, recovery, intent, delivered, onOrder, invalidate, timestamp }: {
  locale: DeskLocale; id: string; version: number; scope: string; actorId: string; recovery: Recovery;
  intent?: H.HistoryFulfilmentIntent | null | undefined; delivered: boolean;
  onOrder: (state: H.HistoryOrderState) => void; invalidate: (result: HistoryInboxResult) => void; timestamp: (value: string) => string;
}) {
  const t = promiseRecoveryCopy[locale], format = offerCopy[locale];
  const [phase, setPhase] = useState<"ready" | "saving" | "loading" | "conflict" | "unavailable">("ready");
  const busy = useRef(false), alive = useRef(true);
  const attempt = useRef<H.HistoryOperatorRecovery | null>(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const offered = !delivered && recovery.status === "offered";
  const pending = recovery.status === "refund_decision_pending";
  const report = intent && "report" in intent ? intent.report : null;
  const choices = !delivered && (offered || recovery.status === "agreed") && !recovery.agreedFormat &&
    (recovery.failure === "file_delivery" || recovery.failure === "format_unavailable") && report
    ? (["pdf", "link", "both"] as const).filter((candidate) => candidate !== recovery.originalFormat && candidate !== recovery.proposedFormat &&
      (candidate === report.format || report.format === "both")) : [];
  const canEscalate = !pending && !delivered && intent?.status === "recovery" && intent.reason === "company_error";
  const saving = phase === "saving" || phase === "loading";
  async function run(choice?: Action) {
    if (busy.current) return;
    busy.current = true;
    setPhase(choice ? "saving" : "loading");
    let command: H.HistoryOperatorRecovery | undefined;
    if (choice) {
      const previous = attempt.current;
      const retry = previous?.kind === choice.kind && previous.expectedVersion === recovery.version &&
        (choice.kind !== "propose_format" || previous.kind === "propose_format" && previous.format === choice.format);
      command = { ...choice, orderId: id, expectedAssignmentVersion: version, expectedVersion: recovery.version,
        attemptKey: retry ? previous.attemptKey : crypto.randomUUID() };
      attempt.current = command;
    }
    try {
      const result = await historyFulfilmentAction(locale, { id, scope, expectedAssignmentVersion: version, ...(command ? { recovery: command } : {}) });
      if (!alive.current) return;
      if (result.status === "expired" || result.status === "stale" || result.status === "denied") { invalidate({ status: result.status }); return; }
      if (result.status !== "ok") { setPhase(result.status === "conflict" ? "conflict" : "unavailable"); return; }
      if (result.scope !== scope || result.actorId !== actorId) { invalidate({ status: "stale" }); return; }
      if (command) attempt.current = null;
      onOrder(result.data);
      setPhase("ready");
    } catch { if (alive.current) setPhase("unavailable"); }
    finally { busy.current = false; }
  }
  const button = "h-auto min-h-11 max-w-full whitespace-normal text-left";
  const revised = !delivered && !pending && !recovery.agreedFormat && recovery.proposedFormat;
  return <section id="history-delivery-recovery" tabIndex={-1} className="space-y-3 rounded-md border p-3" aria-busy={saving}>
    <h5 className="font-semibold"><span role="status">{delivered ? t.delivered : t[recovery.status]}</span></h5>
    <dl className="space-y-1">
      <div><dt>{format.orderHold}</dt><dd>{timestamp(recovery.paymentHoldExpiresAt)}</dd></div>
      <div><dt>{t.original}</dt><dd>{timestamp(recovery.originalPromiseBy)} · {t.zone}</dd></div>
      <div><dt>{t.acceptedFormat}</dt><dd>{format[recovery.originalFormat]}</dd></div>
      {recovery.agreedDeadline ? <div><dt>{t.agreedDeadline}</dt><dd>{timestamp(recovery.agreedDeadline)} · {t.zone}</dd></div>
        : offered && recovery.offeredDeadline && <div><dt>{t.offeredDeadline}</dt><dd>{timestamp(recovery.offeredDeadline)} · {t.zone}</dd></div>}
      {revised && <div><dt>{t.proposedFormat}</dt><dd>{format[revised]}</dd></div>}
      {recovery.agreedFormat && <div><dt>{t.agreedFormat}</dt><dd>{format[recovery.agreedFormat]}</dd></div>}
    </dl>
    {!delivered && recovery.failure && <p>{t[recovery.failure]}</p>}
    {!delivered && recovery.status === "attention" && recovery.failure === "file_delivery" && <p>{t.deliveryAttention}</p>}
    {offered && <p>{t.customerChoice}</p>}
    {pending && <>
      {recovery.pendingReason && recovery.pendingReason !== recovery.failure && <p>{t[recovery.pendingReason]}</p>}
      <p>{t.pendingBody}</p>
    </>}
    {phase === "ready" && <div className="flex flex-wrap gap-2">
      {choices.map((value) => <Button key={value} variant="secondary" className={button} onClick={() => void run({ kind: "propose_format", format: value })}>
        {t.propose} · {format[value]}</Button>)}
      {canEscalate && <Button variant="secondary" className={button} onClick={() => void run({ kind: "company_error_refund" })}>{t.escalate}</Button>}
    </div>}
    {phase !== "ready" && <p role={saving ? "status" : "alert"}>{t[phase]}</p>}
    {!saving && phase !== "ready" && <Button variant="secondary" className={button} onClick={() => void run()}>{t.refresh}</Button>}
  </section>;
}
