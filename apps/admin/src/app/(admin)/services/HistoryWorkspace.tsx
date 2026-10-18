"use client";
import { useEffect, useRef, useState } from "react";
import type { ServiceMessagingSchemas as S } from "@auto-tm/contracts";

import { historyCommand, historyRead } from "./actions";
import { historyCopy } from "./historyCopy";

export function HistoryWorkspace({ conversation, locale, denied }: { conversation: S.ServiceConversation; locale: string; denied: () => void }) {
 const c = historyCopy(locale), [data, setData] = useState<S.HistorySnapshot | null>(null), [error, setError] = useState(false), [busy, setBusy] = useState(false);
 const [vin, setVin] = useState(""), [providers, setProviders] = useState<"carfax" | "autocheck" | "both">("carfax"), [evidence, setEvidence] = useState(""), [refundRule, setRefundRule] = useState(""), [windowStart, setWindowStart] = useState(""), [windowEnd, setWindowEnd] = useState(""), [feasible, setFeasible] = useState(false), [outcome, setOutcome] = useState<"available" | "malformed" | "unsupported" | "no_history" | "mismatch" | "temporary_failure">("available");
 const [reason, setReason] = useState(""), [reference, setReference] = useState(""), [paymentId, setPaymentId] = useState(""), [amount, setAmount] = useState(""), [received, setReceived] = useState(""), [funds, setFunds] = useState(false), [receiptEvidence, setReceiptEvidence] = useState("");
 const [day, setDay] = useState(""), [slots, setSlots] = useState(""), [morning, setMorning] = useState(""), [allowance, setAllowance] = useState(""), [consumed, setConsumed] = useState(""), [reset, setReset] = useState(""), [capacityEvidence, setCapacityEvidence] = useState("");
 const quoteRetry = useRef<{ fingerprint: string; id: string } | null>(null), generation = useRef(0);
 async function refresh() {
  const epoch = ++generation.current; const result = await historyRead(conversation.id);
  if (epoch !== generation.current) return;
  if (result.ok) { setData(result.data); setError(false); }
  else { setData(null); setError(true); if (result.error === "permission" || result.error === "conflict") denied(); }
 }
 useEffect(() => { void refresh(); return () => { generation.current++; }; }, [conversation.id, conversation.assignmentVersion]);
 async function command(value: S.HistoryCommand) {
  if (busy) return; const epoch = generation.current; setBusy(true); setError(false);
  const result = await historyCommand(conversation.id, value); if (epoch !== generation.current) return; setBusy(false);
  if (!result.ok) { setError(true); if (result.error === "permission" || result.error === "conflict") { setData(null); denied(); } return; }
  await refresh();
 }
 function offer() {
  const input = { vin, providers: providers === "both" ? ["carfax", "autocheck"] as const : [providers], preflightOutcome: outcome, preflightEvidence: evidence, refundRule, windowStart, windowEnd, feasible };
  const fingerprint = JSON.stringify(input);
  if (quoteRetry.current?.fingerprint !== fingerprint) quoteRetry.current = { fingerprint, id: crypto.randomUUID() };
  void command({ ...input, providers: [...input.providers], kind: "quote", quoteId: quoteRetry.current.id, expectedAssignmentVersion: conversation.assignmentVersion });
 }
 const order = data?.order;
 const input = (label: string, value: string, change: (value: string) => void, type = "text") => <label className="block">{label}<input aria-label={label} type={type} value={value} onChange={event => change(event.target.value)} maxLength={1000} className="mt-1 min-h-11 w-full rounded border p-2"/></label>;
 const button = (label: string, press: () => void, disabled = false) => <button type="button" disabled={busy || disabled} onClick={press} className="min-h-11 rounded border px-4 py-2 disabled:opacity-50">{label}</button>;
 const providerField = <label className="block">{c.providers}<select aria-label={c.providers} value={providers} onChange={event => setProviders(event.target.value as typeof providers)} className="min-h-11 rounded border p-2"><option value="carfax">Carfax</option><option value="autocheck">AutoCheck</option><option value="both">Carfax / AutoCheck</option></select></label>;
 return <section className="space-y-4 rounded border p-4"><h3>{c.title}</h3><p>{c.synthetic}</p>{error ? <p role="alert">{c.error}</p> : null}{button(c.refresh, () => { void refresh(); })}
  {!order ? <><p>{c.noOrder}</p>{input(c.vin, vin, setVin)}{providerField}<label>{c.outcome}<select aria-label={c.outcome} value={outcome} onChange={event => setOutcome(event.target.value as typeof outcome)}>{(["available", "malformed", "unsupported", "no_history", "mismatch", "temporary_failure"] as const).map(value => <option key={value} value={value}>{c[value]}</option>)}</select></label>{input(c.evidence, evidence, setEvidence)}{input(c.refundRule, refundRule, setRefundRule)}{input(c.windowStart, windowStart, setWindowStart)}{input(c.windowEnd, windowEnd, setWindowEnd)}<label className="block"><input aria-label={c.feasible} type="checkbox" checked={feasible} onChange={event => setFeasible(event.target.checked)}/>{c.feasible}</label>{button(c.offer, offer, !vin || !evidence || !refundRule || !windowStart || !windowEnd || (outcome === "available" && !feasible))}
  <details><summary>{c.capacity}</summary>{input(c.day, day, setDay)}{input(c.slots, slots, setSlots, "number")}{input(c.morning, morning, setMorning, "number")}{input(c.allowance, allowance, setAllowance, "number")}{input(c.consumed, consumed, setConsumed, "number")}{input(c.reset, reset, setReset)}{input(c.capacityEvidence, capacityEvidence, setCapacityEvidence)}{button(c.capacity, () => { void command({ kind: "capacity", expectedAssignmentVersion: conversation.assignmentVersion, day, slotLimit: Number(slots), morningLimit: Number(morning), evidence: capacityEvidence, providers: (providers === "both" ? ["carfax", "autocheck"] as const : [providers]).map(provider => ({ provider, allowance: Number(allowance), consumed: Number(consumed), resetAt: reset, evidence: capacityEvidence })) }); }, !day || !slots || !morning || !allowance || !consumed || !reset || !capacityEvidence)}</details>
  </> : <><p>{c.state}: {order.state}</p><p>{order.day} / {order.promiseAt}</p>
  <label>{c.select}<select aria-label={c.select} value={paymentId} onChange={event => setPaymentId(event.target.value)}><option value="">{c.select}</option>{data?.payments.map(payment => <option key={payment.id} value={payment.id}>{payment.claim} / {payment.state === "confirmed" ? c.verified : c.review}</option>)}</select></label>
  {input(c.amount, amount, setAmount, "number")}{input(c.received, received, setReceived)}{input(c.receiptEvidence, receiptEvidence, setReceiptEvidence)}<label><input aria-label={c.funds} type="checkbox" checked={funds} onChange={event => setFunds(event.target.checked)}/>{c.funds}</label>{button(c.verify, () => { void command({ kind: "verify", expectedAssignmentVersion: conversation.assignmentVersion, expectedVersion: order.version, orderId: order.id, paymentId, amount: Number(amount), receivedAt: received, verifiedFunds: funds, evidence: receiptEvidence }); }, !paymentId || !amount || !received || !receiptEvidence)}
  {input(c.reason, reason, setReason)}{input(c.reference, reference, setReference)}
  {(["purchase", "purchase_uncertain", "purchase_completed", "purchase_no_data", "missed", "refund_approve", "refund_execute"] as const).map(kind => <span key={kind}>{button(c[kind], () => { void command({ kind, expectedAssignmentVersion: conversation.assignmentVersion, expectedVersion: order.version, orderId: order.id, reason, ...(reference ? { reference } : {}) }); }, !reason || ((kind === "purchase_completed" || kind === "refund_execute") && !reference))}</span>)}
  </>}
 </section>;
}
