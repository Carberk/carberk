"use client";
import { useEffect, useRef, useState } from "react";
import type { DiagnosticSchemas as D } from "@auto-tm/contracts";

import * as actions from "./actions";
import { continuityCopy } from "./continuity-copy";
import { continuityButton as button, continuityField as field, continuityPrimary as primary, ContinuityMaterial, IdentityEvidenceDetails, VisitFacts } from "./ContinuityMaterial";
import { diagnosticCopy } from "./copy";

import { useAdminLocale } from "@/lib/i18n";

type Comparison = Extract<Awaited<ReturnType<typeof actions.diagnosticReinspectionComparison>>, { ok: true }>["data"];
type Attempt = { requestId: string; input: D.DiagnosticContinuityRequestExecute; pending: boolean };
export function DiagnosticContinuity({ context, handoff, denied, onDirty, onLock, onResult, returnToVisit }: { context: D.DiagnosticWorkspace; handoff?: string | undefined; denied(): void; onDirty(value: boolean): void; onLock(value: boolean): void; onResult(reportId: string): void; returnToVisit(): void }) {
 const { locale } = useAdminLocale(), c = continuityCopy[locale], base = diagnosticCopy[locale], order = context.order;
 const [busy, setBusy] = useState(false), [error, setError] = useState(false), [blocked, setBlocked] = useState(false), [uncertain, setUncertain] = useState(false);
 const [page, setPage] = useState<D.DiagnosticPredecessorPage | null>(null), [pair, setPair] = useState<Comparison | null>(null), [ack, setAck] = useState<string[]>([]), [technicians, setTechnicians] = useState<D.DiagnosticLinkingTechnicians["technicians"]>([]), [technician, setTechnician] = useState(""), [rationale, setRationale] = useState(""), [same, setSame] = useState(false), [review, setReview] = useState(false);
 const [handle, setHandle] = useState<D.DiagnosticContinuityHandoffs["handoffs"][number] | null>(null), [existing, setExisting] = useState<string | null>(null), [checked, setChecked] = useState(false), [reason, setReason] = useState(""), [reviewB, setReviewB] = useState(false);
 const [receipts, setReceipts] = useState<D.DiagnosticContinuityRequest[]>([]), [receiptCursor, setReceiptCursor] = useState<string | null>(null), [proof, setProof] = useState<D.DiagnosticContinuityProof | null>(null), [copyStatus, setCopyStatus] = useState<"copied" | "copyFailed" | null>(null), [retryReady, setRetryReady] = useState(false);
 const alive = useRef(true), fence = useRef(false), attempt = useRef<Attempt | null>(null), heading = useRef<HTMLHeadingElement>(null), inspectionButton = useRef<HTMLButtonElement | null>(null), searchCursors = useRef(new Set<string>()), handoffCursor=useRef<string|undefined>(undefined), handoffSeen=useRef(new Set<string>()), materialList=useRef<HTMLUListElement>(null), decisionHeading=useRef<HTMLHeadingElement>(null);
 const dualReviewer = context.capabilities.includes("diagnostics.reviewer");
 const material = pair ? [...new Set([pair.predecessor.identity, pair.candidate.identity].flatMap(identity => [identity.evidence, ...identity.corrections].flatMap(record => record?.provenance.map(item => item.id) ?? [])))] : [];
 const complete = !!pair && [pair.predecessor.identity, pair.candidate.identity].every(identity => {
  if (!identity.evidence) return false;
  for (const record of [identity.evidence, ...identity.corrections]) {
   if (!record.identifiers.length) return false;
   for (const item of record.identifiers) {
    if (!item.provenanceIds.length || item.provenanceIds.some(id => !record.provenance.some(image => image.id === id))) return false;
   }
  }
  return true;
 }) && material.length > 0;
 const normalized = (name: string) => name.normalize("NFKC").replace(/[\u200B-\u200D\uFEFF]/g, "").trim().replace(/\s+/g, " ").toLocaleLowerCase();
 const eligible = technicians.filter(item => item.userId !== context.actorId && normalized(item.name) && technicians.filter(other => normalized(other.name) === normalized(item.name)).length === 1);
 const collisions = [...new Map(technicians.filter(item => technicians.filter(other => normalized(other.name) === normalized(item.name)).length > 1).map(item => [normalized(item.name), item.name])).values()];
 useEffect(() => { onLock(busy || uncertain); }, [busy, uncertain, onLock]);
 useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
 useEffect(() => { onDirty(!!reason || !!rationale || !!attempt.current || uncertain); }, [reason, rationale, uncertain, onDirty]);
 function clearReview() { setPair(null); setAck([]); setTechnicians([]); setTechnician(""); setSame(false); setReview(false); setHandle(null); setReviewB(false); setProof(null); }
 async function read<T>(work: () => Promise<actions.DiagnosticResult<T>>): Promise<T | undefined> {
  if (fence.current || !alive.current) return; fence.current = true; setBusy(true); setError(false);
  try { const result = await work(); if (!alive.current) return;
   if (result.ok) return result.data;
   if (result.error === "denied") { alive.current = false; attempt.current = null; denied(); }
   else { setError(true); if (result.error === "conflict") { clearReview(); setBlocked(true); } }
  } catch { if (alive.current) setError(true); }
  finally { fence.current = false; if (alive.current) setBusy(false); }
  return undefined;
 }
 async function discover(cursor?: string) {
  if (cursor && searchCursors.current.has(cursor)) { setError(true); return; }
  const result = await read(() => actions.diagnosticPredecessors(order.id, cursor ? { cursor } : {}));
  if (result) { if (cursor) searchCursors.current.add(cursor); else searchCursors.current.clear(); setPage(result); }
 }
 async function compare(id: string) { clearReview(); const result = await read(() => actions.diagnosticReinspectionComparison(order.id, { predecessorId: id })); if (result) { setPair(result); heading.current?.focus(); } }
 async function loadTechnicians() { setTechnician(""); setAck([]); setSame(false); setReview(false); const result = await read(() => actions.diagnosticLinkingTechnicians(order.id)); if (result) setTechnicians(result.technicians); }
 async function checkHandoff() {
  if(checked){handoffCursor.current=undefined;handoffSeen.current.clear();}
  setHandle(null); setExisting(null); setChecked(false); setReviewB(false);
  const result = await read(async () => {
   let cursor = handoffCursor.current;
   while (alive.current) {
    const response = await actions.diagnosticContinuityHandoffs(order.id, cursor ? { cursor } : {});
    if (!response.ok) return response;
    if (response.data.result || !handoff) return response;
    const exact = response.data.handoffs.find(item => item.proofId === handoff);
    if (exact || response.data.nextCursor === null) return response;
    if (handoffSeen.current.has(response.data.nextCursor)) { handoffCursor.current=undefined;handoffSeen.current.clear();throw new Error("Repeated continuation"); }
    handoffSeen.current.add(response.data.nextCursor); cursor = response.data.nextCursor; handoffCursor.current=cursor;
   }
   throw new Error("Workspace closed");
  });
  if (result) { setChecked(true); if (result.result) setExisting(result.result.reportId); else setHandle(result.handoffs.find(item => item.proofId === handoff) ?? null); return true; }
  return false;
 }
 useEffect(() => { if (handoff) void checkHandoff(); /* Navigation performs reads only. */ }, []);
 function recorded(receipt: D.DiagnosticContinuityRequest) {
  setReceipts(previous => [receipt, ...previous.filter(item => item.requestId !== receipt.requestId)]);
  if (receipt.state === "completed") { attempt.current = null; setUncertain(false); setRetryReady(false); setRationale(""); setReason(""); setReview(false); setReviewB(false); setSame(false); setAck([]); if (receipt.kind === "consume") setExisting(receipt.result.reportId); }
 }
 async function execute() {
  const frozen = attempt.current; if (!frozen) return;
  setRetryReady(false); setUncertain(true);
  const result = await read(() => actions.diagnosticExecuteContinuityRequest(order.id, frozen.requestId, frozen.input));
  if (result) recorded(result);
 }
 async function start(input: D.DiagnosticContinuityRequestExecute) {
  if (attempt.current || uncertain || busy || blocked) return;
  // Freeze before prepare. A lost prepare reply never attaches this command to a discovered row.
  setUncertain(true);
  const result = await read(() => actions.diagnosticPrepareContinuityRequest(order.id, { kind: input.kind }));
  if (!result) return;
  attempt.current = { requestId: result.requestId, input: structuredClone(input), pending: true };
  await execute();
 }
 async function recover() {
  setRetryReady(false);
  if (attempt.current) { const frozen = attempt.current; const result = await read(() => actions.diagnosticRecoverContinuityRequest(order.id, frozen.requestId)); if (result) { recorded(result); if (result.state === "pending_input") setRetryReady(true); } }
  else { const result = await read(() => actions.diagnosticContinuityRequests(order.id, {})); if (result) { setReceipts(result.requests); setReceiptCursor(result.nextCursor); if (uncertain) { const currentResult=await checkHandoff(); if(alive.current&&currentResult)setUncertain(false); } } }
 }
 async function inspect(receipt: D.DiagnosticContinuityRequest, invoking: HTMLButtonElement) {
  if (!dualReviewer || receipt.state !== "completed" || receipt.kind !== "issue") return;
  setProof(null); setCopyStatus(null); inspectionButton.current = invoking;
  const result = await read(() => actions.diagnosticContinuityProof(order.id, receipt.proofId)); if (result) { setProof(result); heading.current?.focus(); }
 }
 const href = proof ? `/diagnostics?order=${proof.candidate.orderId}&handoff=${proof.proofId}` : "";
 const frozen = uncertain || !!attempt.current;
 return <section className="space-y-6 rounded-lg border border-border p-4 font-sans text-foreground md:p-6" aria-busy={busy}>
 <h2 ref={heading} tabIndex={-1} className="text-lg font-medium">{handoff ? c.handoff : c.link}</h2><p>{c.noForms}</p>
 {busy && <p role="status">{base.loading}</p>}{error && <p role="alert">{c.unavailable}</p>}{blocked && <p role="alert">{base.refresh}</p>}
 <section className="space-y-3"><h3>{c.operations}</h3><button className={button} disabled={busy} onClick={() => void recover()}>{c.status}</button>{uncertain && <p role="alert">{c.uncertain}</p>}{retryReady && <><button className={button} disabled={busy || blocked} onClick={() => void execute()}>{c.retryExact}</button><button className={button} disabled={busy} onClick={()=>{attempt.current=null;setUncertain(false);setRetryReady(false);clearReview();setReason("");setRationale("");}}>{c.edit}</button></>}
 <ul className="space-y-3">{receipts.map(receipt => <li key={receipt.requestId} className="min-h-14 space-y-2 border-b border-border py-3"><p>{receipt.kind === "issue" ? c.issue : c.consume}</p>{receipt.state === "pending_input" ? <p>{c.pending}</p> : receipt.kind === "issue" ? <><p>{c.recorded}</p>{dualReviewer && <button className={button} disabled={busy} onClick={e => void inspect(receipt, e.currentTarget)}>{c.inspect}</button>}</> : <button className={button} disabled={busy} onClick={() => onResult(receipt.result.reportId)}>{c.result}</button>}</li>)}</ul>
 {receiptCursor && <button className={button} disabled={busy} onClick={async () => { const result = await read(() => actions.diagnosticContinuityRequests(order.id, { cursor: receiptCursor })); if (result) { if (result.nextCursor === receiptCursor) { setError(true); return; } setReceipts(previous => [...previous.filter(item => !result.requests.some(next => next.requestId === item.requestId)), ...result.requests]); setReceiptCursor(result.nextCursor); } }}>{c.continue}</button>}
 {proof && <section className="space-y-3 border border-border p-4"><h3>{c.recorded}</h3><p>{new Date(proof.issuedAt).toLocaleString(locale, { timeZone: "UTC" })} UTC</p><p>{proof.method}</p><p className="whitespace-pre-wrap break-words">{proof.rationale}</p><pre className="whitespace-pre-wrap break-all">{JSON.stringify({ predecessor: proof.predecessor, candidate: proof.candidate, linkingTechnicianId: proof.linkingTechnicianId, provenanceRecordIds: proof.provenanceRecordIds }, null, 2)}</pre><button className={button} onClick={async () => { try { await navigator.clipboard.writeText(new URL(href, window.location.origin).href); if (alive.current) setCopyStatus("copied"); } catch { if (alive.current) setCopyStatus("copyFailed"); } }}>{c.copy}</button><a className={`${button} inline-flex items-center`} href={href}>{c.openLink}</a>{copyStatus && <p role="status">{c[copyStatus]}</p>}{copyStatus === "copyFailed" && <input className={field} aria-label={c.copy} readOnly value={new URL(href, window.location.origin).href} onFocus={e => e.currentTarget.select()}/>}<button className={button} onClick={() => { setProof(null); inspectionButton.current?.focus(); }}>{base.back}</button></section>}
 </section>
 <section className="space-y-4"><h3>{c.handoff}</h3>{!handoff && <p>{c.missing}</p>}<button className={button} disabled={busy || frozen} onClick={() => void checkHandoff()}>{c.check}</button>{existing ? <button className={button} disabled={busy} onClick={() => onResult(existing)}>{c.result}</button> : checked && !handle ? <p role="status">{c.missing}</p> : null}
 {handle && !existing && order.observedVehicle && order.physicalAuthorized && <><VisitFacts observation={order.observedVehicle} c={base} locale={locale}/><p>{base.template}: {context.template.definition.title[locale]} · {context.template.version}</p><p>{base.audience}: {base[order.audience]}</p><label className="block">{base.reason} · {c.required}<textarea className={field} aria-required="true" required maxLength={1000} disabled={busy || frozen} value={reason} onChange={e => { setReason(e.target.value); setReviewB(false); }}/></label>{!reviewB ? <button className={primary} disabled={busy || frozen || !reason.trim()} onClick={() => { setReviewB(true); heading.current?.focus(); }}>{c.reviewB}</button> : <section className="space-y-3 border border-border p-4"><h3>{c.reviewB}</h3><VisitFacts observation={order.observedVehicle} c={base} locale={locale}/><p>{base.template}: {context.template.definition.title[locale]} · {context.template.version}</p><p>{base.audience}: {base[order.audience]}</p><p className="whitespace-pre-wrap break-words">{reason}</p><p>{c.physicalCue}</p><button className={primary} disabled={busy || frozen} onClick={() => void start({ kind: "consume", command: { proofId: handle.proofId, reportId: crypto.randomUUID(), expectedOrderVersion: handle.expectedOrderVersion, reason } })}>{c.consume}</button><button className={button} disabled={busy || frozen} onClick={() => setReviewB(false)}>{c.edit}</button></section>}</>}
 <button className={button} disabled={busy || frozen} onClick={returnToVisit}>{c.return}</button></section>
 {!handoff && dualReviewer && !frozen && !blocked && <section className="space-y-4"><h3>{c.search}</h3><button className={button} disabled={busy} onClick={() => void discover()}>{c.search}</button>{page && <><ul>{page.candidates.map(candidate => <li className="min-h-14 space-y-2 border-b border-border py-3" key={candidate.reportId}><p>{new Date(candidate.observedAt).toLocaleString(locale, { timeZone: "UTC" })} UTC · {candidate.mileageKm.toLocaleString(locale)} km</p><button className={button} disabled={busy} onClick={() => void compare(candidate.reportId)}>{c.compare}</button></li>)}</ul>{page.nextCursor && <button className={button} disabled={busy} onClick={() => void discover(page.nextCursor ?? undefined)}>{c.continue}</button>}{page.exhausted && <p>{c.exhausted}</p>}</>}
 {pair && <><div className="grid gap-6 lg:grid-cols-2">{([['previous', pair.predecessor.identity], ['current', pair.candidate.identity]] as const).map(([side, identity]) => <section className="min-w-0 space-y-3" key={side}><h3 className="font-semibold">{c[side]}</h3><VisitFacts observation={identity.observation} c={base} locale={locale}/>{identity.evidence && <IdentityEvidenceDetails record={identity.evidence} c={c} base={base}/>}<ul>{identity.corrections.map(record => <li className="min-h-14" key={record.id}><IdentityEvidenceDetails record={record} c={c} base={base}/></li>)}</ul></section>)}</div>
 <h3>{c.materials} · {material.length}/40</h3>{material.length > 40 && <p role="status">{c.overCap}</p>}{!complete && <p role="alert">{c.unavailable}</p>}
 <ul ref={materialList}>{material.map((id, index) => <li key={id} className="min-h-14"><ContinuityMaterial src={`/diagnostics/orders/${order.id}/reinspection-comparison/provenance/${id}?predecessorId=${pair.predecessor.reportId}`} caption={`${c.materials} ${index + 1} · ${[pair.predecessor.identity, pair.candidate.identity].flatMap((identity, side) => [identity.evidence, ...identity.corrections].flatMap(record => record?.identifiers.filter(item => item.provenanceIds.includes(id)).map(item => `${side === 0 ? c.previous : c.current}: ${record.correction ? c.correction : c.root} · ${c[item.kind]} · ${item.location} · ${item.value}`) ?? [])).join('; ')}`} c={c} denied={denied} {...(complete && material.length <= 40 ? { checked: ack.includes(id), acknowledge: (value: boolean) => { setAck(previous => value ? [...new Set([...previous, id])] : previous.filter(item => item !== id)); setReview(false); } } : {})}/></li>)}</ul>
 {complete && material.length <= 40 && <section className="space-y-4"><p>{ack.length}/{material.length} · {c.ack}</p><button className={button} disabled={busy} onClick={()=>{const index=material.findIndex(id=>!ack.includes(id));if(index<0){decisionHeading.current?.focus();return;}materialList.current?.children[index]?.querySelector<HTMLButtonElement>("button")?.click();}}>{ack.length===material.length?c.decision:c.nextImage}</button><h3 ref={decisionHeading} tabIndex={-1}>{c.decision}</h3><p>{c.independence}</p><button className={button} disabled={busy} onClick={() => void loadTechnicians()}>{c.technicians}</button>{collisions.length > 0 && <p>{c.collision}</p>}<ul>{collisions.map(name => <li className="min-h-14" key={name}>{name} · {c.unavailable}</li>)}</ul><label className="block">{c.select} · {c.required}<select className={field} aria-required="true" required disabled={busy} value={technician} onChange={e => { setTechnician(e.target.value); setAck([]); setSame(false); setReview(false); }}><option value="">{c.select}</option>{eligible.map(item => <option key={item.userId} value={item.userId}>{item.name}</option>)}</select></label><label className="block">{base.reason} · {c.required}<textarea className={field} required aria-required="true" maxLength={1000} value={rationale} onChange={e => { setRationale(e.target.value); setAck([]); setReview(false); }}/></label><label className="flex min-h-12 items-center gap-3"><input type="checkbox" aria-required="true" checked={same} onChange={e => { setSame(e.target.checked); setReview(false); }}/>{c.same} · {c.required}</label>
 {!review ? <button className={primary} disabled={busy || !same || !rationale.trim() || !eligible.some(item => item.userId === technician) || ack.length !== material.length} onClick={() => { setReview(true); heading.current?.focus(); }}>{c.review}</button> : <section className="space-y-3 border border-border p-4"><h3>{c.review}</h3><p>{eligible.find(item => item.userId === technician)?.name}</p><p>comparative_attestation · {material.length}/40 · {ack.length}/{material.length}</p><p className="whitespace-pre-wrap break-words">{rationale}</p><p>{c.independence}</p><button className={primary} disabled={busy} onClick={() => void start({ kind: "issue", command: { predecessorId: pair.predecessor.reportId, expectedPredecessorVersion: pair.predecessor.reportVersion, expectedOrderVersion: pair.candidate.orderVersion, predecessorIdentityRecordId: pair.predecessor.identityRecordId, candidateIdentityRecordId: pair.candidate.identityRecordId, linkingTechnicianId: technician, method: "comparative_attestation", rationale, provenanceRecordIds: material } })}>{c.issue}</button><button className={button} disabled={busy} onClick={() => setReview(false)}>{c.edit}</button></section>}
 </section>}</>}
 </section>}
 </section>;
}
