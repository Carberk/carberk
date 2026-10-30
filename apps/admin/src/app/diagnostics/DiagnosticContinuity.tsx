"use client";
import { useEffect, useRef, useState } from "react";
import type { DiagnosticSchemas as D } from "@auto-tm/contracts";

import * as actions from "./actions";
import { continuityCopy } from "./continuity-copy";
import { continuityButton as button, continuityField as field, continuityPrimary as primary, ContinuityMaterial, IdentityComparison, VisitFacts } from "./ContinuityMaterial";
import { useContinuityValidation } from "./ContinuityValidation";
import { diagnosticCopy } from "./copy";

import { useAdminLocale } from "@/lib/i18n";

type Comparison = Extract<Awaited<ReturnType<typeof actions.diagnosticReinspectionComparison>>, { ok: true }>["data"];
type Attempt = { requestId: string; input: D.DiagnosticContinuityRequestExecute; pending: boolean };
type Method = D.DiagnosticContinuityProofIssuance["method"];
type Handoff = D.DiagnosticContinuityHandoffs["handoffs"][number];
export function DiagnosticContinuity({ context, handoff, denied, onDirty, onLock, onResult, returnToVisit, refreshB, coordinateAssignments }: { context: D.DiagnosticWorkspace; handoff?: string | undefined; denied(): void; onDirty(value: boolean): void; onLock(value: boolean): void; onResult(reportId: string): void; returnToVisit(): void; refreshB(): void; coordinateAssignments?: (()=>void) | undefined }) {
 const { locale } = useAdminLocale(), c = continuityCopy[locale], base = diagnosticCopy[locale], order = context.order;
 const [activity,setActivity]=useState<"preparing"|"issuing"|"creating"|null>(null);
 const [busy, setBusy] = useState(false), [error, setError] = useState(false), [blocked, setBlocked] = useState(false), [uncertain, setUncertain] = useState(false);
 const [namesLoaded,setNamesLoaded]=useState(false);
 const [page, setPage] = useState<D.DiagnosticPredecessorPage | null>(null), [pair, setPair] = useState<Comparison | null>(null), [ack, setAck] = useState<string[]>([]), [technicians, setTechnicians] = useState<D.DiagnosticLinkingTechnicians["technicians"]>([]), [technician, setTechnician] = useState(""), [rationale, setRationale] = useState(""), [same, setSame] = useState(false), [review, setReview] = useState(false), [method, setMethod] = useState<Method | "">(""), [failed, setFailed] = useState<string[]>([]);
 const [handles, setHandles] = useState<Handoff[]>([]), [chosen, setChosen] = useState<string | null>(null), [handoffNext, setHandoffNext] = useState<string | null>(null), [existing, setExisting] = useState<string | null>(null), [checked, setChecked] = useState(false), [reason, setReason] = useState(""), [reviewB, setReviewB] = useState(false);
 const [receipts, setReceipts] = useState<D.DiagnosticContinuityRequest[]>([]), [receiptCursor, setReceiptCursor] = useState<string | null>(null), [proof, setProof] = useState<D.DiagnosticContinuityProof | null>(null), [copyStatus, setCopyStatus] = useState<"copied" | "copyFailed" | null>(null), [retryReady, setRetryReady] = useState(false), [statusRead,setStatusRead]=useState(false), [inspecting,setInspecting]=useState<string|null>(null), [inspectionError,setInspectionError]=useState<string|null>(null);
 const alive = useRef(true), fence = useRef(false), attempt = useRef<Attempt | null>(null), heading = useRef<HTMLHeadingElement>(null), handoffHeading = useRef<HTMLHeadingElement>(null), inspectionButton = useRef<HTMLButtonElement | null>(null), searchCursors = useRef(new Set<string>()), handoffSeen=useRef(new Set<string>()), materialList=useRef<HTMLUListElement>(null), decisionHeading=useRef<HTMLHeadingElement>(null), pairHeading=useRef<HTMLHeadingElement>(null), pageHeading=useRef<HTMLHeadingElement>(null), reviewHeading=useRef<HTMLHeadingElement>(null), reviewBHeading=useRef<HTMLHeadingElement>(null), proofHeading=useRef<HTMLHeadingElement>(null), receiptSeen=useRef(new Set<string>()), compareInvoker=useRef<HTMLButtonElement|null>(null);
 const canConsume = context.capabilities.includes("diagnostics.technician");
 const handle = handles.find(item => item.proofId === chosen) ?? null;
 // A discovered pending request is re-entered under its own requestId; no replacement preparation.
 const reentry = useRef<{ kind: D.DiagnosticContinuityRequestExecute["kind"]; requestId: string } | null>(null);
 const lostPrepareKind = useRef<D.DiagnosticContinuityRequestExecute["kind"] | null>(null);
 const dualReviewer = context.capabilities.includes("diagnostics.reviewer");
 // Deterministic internal ordering, frozen into the command once by start().
 const material = pair ? [...new Set([pair.predecessor.identity, pair.candidate.identity].flatMap(identity => [identity.evidence, ...identity.corrections].flatMap(record => record?.provenance.map(item => item.id) ?? [])))].sort() : [];
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
 function clearReview() { setPair(null); setAck([]); setFailed([]); setTechnicians([]); setNamesLoaded(false); setTechnician(""); setMethod(""); setSame(false); setReview(false); setHandles([]); setChosen(null); setHandoffNext(null); setReviewB(false); setProof(null); setCopyStatus(null); }
 async function read<T>(work: () => Promise<actions.DiagnosticResult<T>>, activity: "preparing"|"issuing"|"creating"|null=null): Promise<T | undefined> {
  if (fence.current || !alive.current) return; fence.current = true; setBusy(true); setActivity(activity); setError(false);
  try { const result = await work(); if (!alive.current) return;
   if (result.ok) return result.data;
   if (result.error === "denied") { alive.current = false; attempt.current = null; reentry.current = null; denied(); }
   else { setError(true); if (result.error === "conflict") {
    // Unarm review, but keep the frozen exact command and its requestId separately: a conflict may
    // mean an earlier execute committed, so only a GET of that same request can resolve it.
    clearReview(); setRetryReady(false);
    if (attempt.current) setUncertain(true); else { setUncertain(false); setBlocked(true); }
   } }
  } catch { if (alive.current) setError(true); }
  finally { fence.current = false; if (alive.current) setBusy(false); }
  return undefined;
 }
 async function discover(cursor?: string) {
  if (cursor && searchCursors.current.has(cursor)) { setError(true); return; }
  const result = await read(() => actions.diagnosticPredecessors(order.id, cursor ? { cursor } : {}));
  if (result) { if (cursor) searchCursors.current.add(cursor); else searchCursors.current.clear(); setPage(result); requestAnimationFrame(()=>{if(alive.current)pageHeading.current?.focus();}); }
 }
 async function compare(id: string, invoker = true) { if (invoker) compareInvoker.current=document.activeElement as HTMLButtonElement; clearReview(); const result = await read(() => actions.diagnosticReinspectionComparison(order.id, { predecessorId: id })); if (result) { setPair(result); } }
 function backToCandidates() { clearReview(); pageHeading.current?.focus(); }
 async function loadTechnicians() { setNamesLoaded(false); setTechnician(""); setAck([]); setSame(false); setReview(false); const result = await read(() => actions.diagnosticLinkingTechnicians(order.id)); if (result){setTechnicians(result.technicians);setNamesLoaded(true);} }
 /** B-owned usable opaque handles only. Local ordinals carry no chronology, preference or preselection. */
 function accept(page: D.DiagnosticContinuityHandoffs, first: boolean) {
  setChecked(true); if (page.result) setExisting(page.result.reportId);
  setHandles(previous => { const rows = first ? [] : [...previous]; for (const item of page.handoffs) if (!rows.some(row => row.proofId === item.proofId)) rows.push(item); return rows; });
  if (page.nextCursor !== null && handoffSeen.current.has(page.nextCursor)) { handoffSeen.current.clear(); setHandoffNext(null); setError(true); return; }
  if (page.nextCursor !== null) handoffSeen.current.add(page.nextCursor); setHandoffNext(page.nextCursor);
 }
 async function checkHandoff() {
  if (!canConsume) return false;
  handoffSeen.current.clear(); setHandles([]); setChosen(null); setHandoffNext(null); setExisting(null); setChecked(false); setReviewB(false);
  const result = await read(() => actions.diagnosticContinuityHandoffs(order.id, {}));
  if (result) { accept(result, true); return true; }
  return false;
 }
 async function moreHandoffs() {
  const cursor = handoffNext; if (!cursor || !canConsume) return;
  const result = await read(() => actions.diagnosticContinuityHandoffs(order.id, { cursor }));
  if (result) accept(result, false);
 }
 useEffect(() => { if (handoff && canConsume) void checkHandoff(); /* Navigation performs reads only. */ }, []);
 function recorded(receipt: D.DiagnosticContinuityRequest) {
  setReceipts(previous => [receipt, ...previous.filter(item => item.requestId !== receipt.requestId)]);
  if (receipt.state === "completed") { attempt.current = null; reentry.current = null; setUncertain(false); setRetryReady(false); setRationale(""); setReason(""); setReview(false); setReviewB(false); setSame(false); setAck([]); if (receipt.kind === "consume") setExisting(receipt.result.reportId); }
 }
 async function execute() {
  const frozen = attempt.current; if (!frozen) return;
  setRetryReady(false); setUncertain(true);
  const result = await read(() => actions.diagnosticExecuteContinuityRequest(order.id, frozen.requestId, frozen.input),frozen.input.kind==="issue"?"issuing":"creating");
  if (result) recorded(result);
 }
 async function start(input: D.DiagnosticContinuityRequestExecute) {
  if (attempt.current || uncertain || busy || blocked) return;
  const pending = reentry.current;
  if (pending && pending.kind === input.kind) { reentry.current = null; attempt.current = { requestId: pending.requestId, input: structuredClone(input), pending: true }; await execute(); return; }
  // Freeze before prepare. A lost prepare reply never attaches this command to a discovered row.
  const frozenInput=structuredClone(input);lostPrepareKind.current=input.kind;setUncertain(true);
  const result = await read(() => actions.diagnosticPrepareContinuityRequest(order.id, { kind: input.kind }),"preparing");
  if (!result) return;
  lostPrepareKind.current = null;
  attempt.current = { requestId: result.requestId, input: frozenInput, pending: true };
  await execute();
 }
 async function recover() {
  if(busy)return;
  setRetryReady(false);
  if (attempt.current) { const frozen = attempt.current; const result = await read(() => actions.diagnosticRecoverContinuityRequest(order.id, frozen.requestId)); if (result) { recorded(result); if (result.state === "pending_input") setRetryReady(true); } }
  else {
   const result=await read(async()=>{
    const requests:D.DiagnosticContinuityRequest[]=[],seen=new Set<string>();let cursor:string|undefined,nextCursor:string|null=null;
    while(alive.current){
     const response=await actions.diagnosticContinuityRequests(order.id,cursor?{cursor}:{});if(!response.ok)return response;
     requests.push(...response.data.requests);nextCursor=response.data.nextCursor;
     if(!uncertain||nextCursor===null)break;
     if(seen.has(nextCursor))throw new Error("Repeated receipt continuation");
     seen.add(nextCursor);cursor=nextCursor;
    }
    if(!alive.current)throw new Error("Workspace closed");
    // The recovery read already owns the fence. Dispatch the reviewer-authorized recheck directly.
    const workspace=uncertain&&lostPrepareKind.current==="issue"&&dualReviewer?await actions.diagnosticWorkspace(order.id):null;
    if(workspace&&!workspace.ok)return workspace;
    return {ok:true as const,data:{requests,nextCursor,workspace:workspace?.data}};
   });
   if(result){setReceipts(result.requests);setStatusRead(true);receiptSeen.current.clear();if(result.nextCursor)receiptSeen.current.add(result.nextCursor);setReceiptCursor(result.nextCursor);
    if(uncertain){
     // Never attach unsent input to a discovered preparation, even of the same kind.
     const kind=lostPrepareKind.current;
     let currentResult=false;
     if(kind==="consume" && canConsume) currentResult=await checkHandoff();
     else if(kind==="issue" && dualReviewer && result.workspace){
      const workspace=result.workspace;
      if(workspace.context.actorId!==context.actorId || workspace.context.order.id!==order.id || !workspace.context.capabilities.includes("diagnostics.reviewer")){alive.current=false;lostPrepareKind.current=null;denied();return;}
      if(workspace.context.order.version!==order.version || workspace.reports.length){clearReview();setBlocked(true);}
      currentResult=true;
     }
     if(alive.current&&currentResult){lostPrepareKind.current=null;setUncertain(false);setReview(false);setReviewB(false);setAck([]);setSame(false);}
    }
   }
  }
 }
 async function inspect(receipt: D.DiagnosticContinuityRequest, invoking: HTMLButtonElement) {
  if (!dualReviewer || receipt.state !== "completed" || receipt.kind !== "issue") return;
  setProof(null); setCopyStatus(null); setInspectionError(null); setInspecting(receipt.requestId); inspectionButton.current = invoking;
  const result = await read(() => actions.diagnosticContinuityProof(order.id, receipt.proofId)); if(alive.current){setInspecting(null);if(result)setProof(result);else setInspectionError(receipt.requestId);}
 }
 const decisionValidation=useContinuityValidation([
  {key:"material",label:c.materials,error:ack.length===material.length?null:c.fieldError},
  {key:"technician",label:c.select,error:eligible.some(item=>item.userId===technician)?null:c.fieldError},
  {key:"method",label:c.method,error:method?null:c.fieldError},
  {key:"rationale",label:base.reason,error:rationale.trim().length<1||rationale.trim().length>1000?c.fieldError:null},
  {key:"same",label:c.same,error:same?null:c.fieldError},
 ]);
 const reasonValidation=useContinuityValidation([{key:"reason",label:base.reason,error:reason.trim().length<1||reason.trim().length>1000?c.fieldError:null}]);
 const issueReady=complete&&material.length<=40&&failed.length===0&&decisionValidation.valid;
 useEffect(()=>{if(pair)pairHeading.current?.focus();},[pair]);
 useEffect(()=>{if(existing)handoffHeading.current?.focus();},[existing]);
 useEffect(()=>{if(review)reviewHeading.current?.focus();},[review]);
 useEffect(()=>{if(reviewB)reviewBHeading.current?.focus();},[reviewB]);
 useEffect(()=>{if(proof)proofHeading.current?.focus();},[proof]);
 function restart(kind:"issue"|"consume",requestId:string) {
  if(busy||blocked||uncertain||attempt.current||(kind==="consume"?!canConsume:!dualReviewer))return;
  clearReview();reentry.current={kind,requestId};setReason("");setRationale("");decisionValidation.reset();reasonValidation.reset();
  if(kind==="consume")void checkHandoff();else {setBlocked(false);void discover();}
 }
 const href = proof ? `/diagnostics?order=${proof.candidate.orderId}&handoff=${proof.proofId}` : "";
 const frozen = uncertain || !!attempt.current;
 /** Accessible image context: authorized visit role, identifier kind and location only. */
 const imageLabel = (id: string) => pair ? [...new Set([pair.predecessor.identity, pair.candidate.identity].flatMap((identity, side) => [identity.evidence, ...identity.corrections].flatMap(record => record?.identifiers.filter(item => item.provenanceIds.includes(id)).map(item => c.imageLabel.replace("{visit}", side === 0 ? c.previous : c.current).replace("{kind}", c[item.kind]).replace("{location}", item.location)) ?? [])))].join("; ") : "";
 return <section className="space-y-6 rounded-lg border border-border p-4 font-sans text-foreground md:p-6" aria-busy={busy}>
 <h2 ref={heading} tabIndex={-1} className="text-lg font-medium">{handoff ? c.handoff : c.link}</h2><p>{c.noForms}</p>
 {busy && <p role="status">{activity?c[activity]:base.loading}</p>}{error && <p role="alert">{c.unavailable}</p>}{blocked && <p role="alert">{base.refresh}</p>}
 <section className="space-y-3"><h3>{c.operations}</h3><button className={button} disabled={busy} onClick={() => void recover()}>{c.status}</button>{uncertain && <p role="alert">{c.uncertain}</p>}{retryReady && <><button className={button} disabled={busy || blocked} onClick={() => void execute()}>{c.retryExact}</button><button className={button} disabled={busy} onClick={()=>{const frozen=attempt.current;if(!frozen)return;reentry.current={kind:frozen.input.kind,requestId:frozen.requestId};attempt.current=null;setUncertain(false);setRetryReady(false);clearReview();setReason("");setRationale("");}}>{c.edit}</button></>}
 <p>{c.sessionAbsence}</p>{statusRead&&!receipts.length&&<p role="status">{c.noOperations}</p>}<ul className="space-y-3">{receipts.map(receipt => <li key={receipt.requestId} aria-label={`${receipt.kind==="issue"?c.issue:c.consume} · ${receipt.state==="pending_input"?c.pending:receipt.kind==="issue"?c.recorded:c.reportAvailable} · ${c.current}`} className="min-h-14 space-y-2 border-b border-border py-3"><p>{receipt.kind === "issue" ? c.issue : c.consume}</p>{receipt.state === "pending_input" ? <><p>{c.pending}</p><button className={button} disabled={busy||blocked||frozen||(receipt.kind==="consume"?!canConsume:!dualReviewer)} onClick={()=>restart(receipt.kind,receipt.requestId)}>{receipt.kind==="issue"?c.restartComparison:c.restartHandoff}</button><button className={button} disabled={busy||frozen} onClick={returnToVisit}>{c.return}</button></> : receipt.kind === "issue" ? <><p>{c.recorded}</p>{dualReviewer && <button className={button} disabled={busy} onClick={e => void inspect(receipt, e.currentTarget)}>{c.inspect}</button>}{inspecting===receipt.requestId&&<p role="status">{base.loading}</p>}{inspectionError===receipt.requestId&&<p role="alert">{c.unavailable}</p>}</> : <><p>{c.reportAvailable}</p><button className={button} disabled={busy} onClick={() => onResult(receipt.result.reportId)}>{c.result}</button></>}</li>)}</ul>
 {receiptCursor && <button className={button} disabled={busy} onClick={async () => { const result = await read(() => actions.diagnosticContinuityRequests(order.id, { cursor: receiptCursor })); if (result) { if (result.nextCursor && receiptSeen.current.has(result.nextCursor)) { setError(true); setReceiptCursor(null); return; } if(result.nextCursor)receiptSeen.current.add(result.nextCursor); setReceipts(previous => [...previous.filter(item => !result.requests.some(next => next.requestId === item.requestId)), ...result.requests]); setReceiptCursor(result.nextCursor); } }}>{c.continueOperations}</button>}
 {proof && <section role="region" aria-label={c.recorded} className="space-y-3 border border-border p-4"><h3 ref={proofHeading} tabIndex={-1}>{c.recorded}</h3><p>{new Date(proof.issuedAt).toLocaleString(locale==="tk"?"tk-TM":locale==="ru"?"ru-RU":"en-GB", { timeZone: "UTC" })} UTC</p><p>{proof.method==="comparative_attestation"?c.comparative:c.automatic}</p><p className="whitespace-pre-wrap break-words">{proof.rationale}</p><pre className="whitespace-pre-wrap break-all">{JSON.stringify({ predecessor: proof.predecessor, candidate: proof.candidate, linkingTechnicianId: proof.linkingTechnicianId, provenanceRecordIds: proof.provenanceRecordIds }, null, 2)}</pre><button className={button} onClick={async () => { try { await navigator.clipboard.writeText(new URL(href, window.location.origin).href); if (alive.current) setCopyStatus("copied"); } catch { if (alive.current) setCopyStatus("copyFailed"); } }}>{c.copy}</button><a className={`${button} inline-flex items-center`} href={href}>{c.openLink}</a>{copyStatus && <p role="status">{c[copyStatus]}</p>}{copyStatus === "copyFailed" && <input className={field} aria-label={c.completeLink} readOnly value={new URL(href, window.location.origin).href} onFocus={e => e.currentTarget.select()}/>}<button className={button} onClick={() => { setProof(null); inspectionButton.current?.focus(); }}>{base.back}</button></section>}
 </section>
 {canConsume && <section className="space-y-4"><h3 ref={handoffHeading} tabIndex={-1} data-focus-target="b-handoff-heading">{c.handoff}</h3><button className={button} disabled={busy || frozen} onClick={() => void checkHandoff()}>{c.check}</button>{existing ? <button className={button} disabled={busy} onClick={() => onResult(existing)}>{c.result}</button> : checked && !handles.length && !handoffNext ? <p role="status">{c.noUsable}</p> : null}
 {!existing && handles.length > 0 && <ul className="space-y-2">{handles.map((item, index) => <li key={item.proofId}><button type="button" className={button} aria-pressed={chosen === item.proofId} disabled={busy || frozen} onClick={() => { setChosen(item.proofId); setReviewB(false); }}>{c.usable.replace("{n}", String(index + 1))}</button></li>)}</ul>}
 {!existing && handoffNext && <button className={button} disabled={busy || frozen} onClick={() => void moreHandoffs()}>{c.moreHandoffs}</button>}
 {handle && !existing && order.observedVehicle && order.physicalAuthorized && <><VisitFacts observation={order.observedVehicle} c={base} locale={locale}/><p>{base.template}: {context.template.definition.title[locale]} · {context.template.version}</p><p>{base.audience}: {base[order.audience]}</p><label className="block">{base.reason} · {c.required}<textarea {...reasonValidation.props("reason",`${base.reason} · ${c.required}`)} className={field} aria-required="true" required maxLength={1000} disabled={busy || frozen} value={reason} onChange={e => { setReason(e.target.value); setReviewB(false); }}/>{reasonValidation.feedback("reason",`${reason.length}/1000`)}</label>{reasonValidation.summary(c.invalidFields)}{!reviewB ? <button className={primary} disabled={busy} aria-disabled={frozen||blocked||!reasonValidation.valid} onClick={() => { if(frozen||blocked||!reasonValidation.validate())return;setReviewB(true); }}>{c.reviewB}</button> : <section role="region" aria-label={c.reviewB} className="space-y-3 border border-border p-4"><h3 ref={reviewBHeading} tabIndex={-1}>{c.reviewB}</h3><VisitFacts observation={order.observedVehicle} c={base} locale={locale}/><p>{base.template}: {context.template.definition.title[locale]} · {context.template.version}</p><p>{base.audience}: {base[order.audience]}</p><p className="whitespace-pre-wrap break-words">{reason}</p><p>{c.physicalCue}</p><button className={primary} disabled={busy || frozen} onClick={() => {if(!reasonValidation.valid||!reviewB)return;void start({ kind: "consume", command: { proofId: handle.proofId, reportId: crypto.randomUUID(), expectedOrderVersion: handle.expectedOrderVersion, reason } });}}>{c.consume}</button><button className={button} disabled={busy || frozen} onClick={() => {setReviewB(false);document.getElementById(reasonValidation.props("reason",`${base.reason} · ${c.required}`).id)?.focus();}}>{c.edit}</button></section>}</>}
 {handles.length > 0 && !existing && (!order.observedVehicle || !order.physicalAuthorized) && <><p role="alert">{c.bUnavailable}</p><button className={button} disabled={busy || frozen} onClick={refreshB}>{c.refreshB}</button></>}
 <button className={button} disabled={busy || frozen} onClick={returnToVisit}>{c.return}</button></section>}
 {!handoff && dualReviewer && !frozen && !blocked && <section className="space-y-4"><h3 ref={pageHeading} tabIndex={-1}>{c.search}</h3><button className={button} disabled={busy} onClick={() => void discover()}>{c.search}</button>{page && <><ul>{page.candidates.map(candidate => <li className="min-h-14 space-y-2 border-b border-border py-3" key={candidate.reportId}><p>{new Date(candidate.observedAt).toLocaleString(locale==="tk"?"tk-TM":locale==="ru"?"ru-RU":"en-GB", { timeZone: "UTC" })} UTC · {candidate.mileageKm.toLocaleString(locale)} km</p><button className={button} disabled={busy} onClick={() => void compare(candidate.reportId)}>{c.compare}</button></li>)}</ul>{page.nextCursor && <button className={button} disabled={busy} onClick={() => void discover(page.nextCursor ?? undefined)}>{c.continue}</button>}{page.exhausted && <p>{c.exhausted}</p>}</>}
 {pair && <><h3 ref={pairHeading} tabIndex={-1}>{c.compare}</h3><button className={button} disabled={busy} onClick={()=>{clearReview();if(compareInvoker.current?.isConnected)compareInvoker.current.focus();else pageHeading.current?.focus();}}>{base.back}</button><IdentityComparison comparison={pair} c={c} base={base}/>

 <h3>{c.materials} · {material.length}/40</h3>{material.length > 40 && <p role="status">{c.overCap}</p>}{!complete && <p role="alert">{c.unavailable}</p>}
 <ul ref={materialList}>{material.map((id, index) => <li key={id} className="min-h-14"><ContinuityMaterial src={`/diagnostics/orders/${order.id}/reinspection-comparison/provenance/${id}?predecessorId=${pair.predecessor.reportId}`} caption={`${c.materials} ${index + 1} · ${imageLabel(id)}`} alt={imageLabel(id)} c={c} denied={denied} recovery={{ failed: () => { setFailed(previous => [...new Set([...previous, id])]); setAck([]); setReview(false); }, ready: () => { setFailed(previous => previous.filter(item => item !== id)); setAck([]); setSame(false); setReview(false); }, reload: () => void compare(pair.predecessor.reportId, false), back: backToCandidates }} {...(complete && material.length <= 40 ? { checked: ack.includes(id), acknowledge: (value: boolean) => { setAck(previous => value ? [...new Set([...previous, id])] : previous.filter(item => item !== id)); setReview(false); } } : {})}/></li>)}</ul>
 {complete && material.length <= 40 && <section className="space-y-4"><div {...decisionValidation.props("material")} tabIndex={-1}>{decisionValidation.feedback("material")}<p>{ack.length}/{material.length} · {c.ack}</p></div><button className={button} disabled={busy} onClick={()=>{const index=material.findIndex(id=>!ack.includes(id));if(index<0){decisionHeading.current?.focus();return;}materialList.current?.children[index]?.querySelector<HTMLButtonElement>("button")?.click();}}>{ack.length===material.length?c.decision:c.nextImage}</button><h3 ref={decisionHeading} tabIndex={-1}>{c.decision}</h3>{decisionValidation.summary(c.invalidFields)}<p>{c.independence}</p><button className={button} disabled={busy} onClick={() => void loadTechnicians()}>{c.technicians}</button>{namesLoaded&&eligible.length===0&&<><p>{c.noTechnician}</p>{coordinateAssignments&&<button className={button} disabled={busy} onClick={coordinateAssignments}>{c.coordinate}</button>}<button className={button} disabled={busy} onClick={returnToVisit}>{c.return}</button></>}{collisions.length > 0 && <p>{c.collision}</p>}<ul>{collisions.map(name => <li className="min-h-14" key={name}>{name} · {c.unavailable}</li>)}</ul><label className="block">{c.select} · {c.required}<select {...decisionValidation.props("technician",`${c.select} · ${c.required}`)} className={field} aria-required="true" required disabled={busy} value={technician} onChange={e => { setTechnician(e.target.value); setAck([]); setSame(false); setReview(false); }}><option value="">{c.select}</option>{eligible.map(item => <option key={item.userId} value={item.userId}>{item.name}</option>)}</select>{decisionValidation.feedback("technician")}</label><fieldset className="space-y-2"><legend>{c.method}</legend><label className="block">{c.method} · {c.required}<select {...decisionValidation.props("method",`${c.method} · ${c.required}`)} className={field} aria-required="true" required disabled={busy} value={method} onChange={e => { setMethod(e.target.value as Method | ""); setReview(false); }}><option value="">{c.choose}</option><option value="comparative_attestation">{c.comparative}</option><option value="automatic_normalized_vin">{c.automaticRequest}</option></select>{decisionValidation.feedback("method",c.methodHelp)}</label></fieldset><label className="block">{base.reason} · {c.required}<textarea {...decisionValidation.props("rationale",`${base.reason} · ${c.required}`)} className={field} required aria-required="true" maxLength={1000} value={rationale} onChange={e => { setRationale(e.target.value); setAck([]); setReview(false); }}/>{decisionValidation.feedback("rationale",`${rationale.length}/1000`)}</label><label className="flex min-h-12 items-center gap-3"><input {...decisionValidation.props("same",`${c.same} · ${c.required}`)} type="checkbox" aria-required="true" checked={same} onChange={e => { setSame(e.target.checked); setReview(false); }}/>{c.same} · {c.required}</label>{decisionValidation.feedback("same")}
 {!review ? <button className={primary} disabled={busy} aria-disabled={!issueReady} onClick={() => {if(!decisionValidation.validate()||!issueReady)return;setReview(true);}}>{c.review}</button> : <section role="region" aria-label={c.review} className="space-y-3 border border-border p-4"><h3 ref={reviewHeading} tabIndex={-1}>{c.review}</h3><h4>{c.previous}</h4><VisitFacts observation={pair.predecessor.identity.observation} c={base} locale={locale}/><h4>{c.current}</h4><VisitFacts observation={pair.candidate.identity.observation} c={base} locale={locale}/><p>{eligible.find(item => item.userId === technician)?.name}</p><p>{method==="automatic_normalized_vin"?c.automaticRequest:c.comparative} · {material.length}/40 · {ack.length}/{material.length}</p><p className="whitespace-pre-wrap break-words">{rationale}</p><p>{c.independence}</p><button className={primary} disabled={busy} aria-disabled={!issueReady} onClick={() => {if(!issueReady||!review||!method)return;void start({ kind: "issue", command: { predecessorId: pair.predecessor.reportId, expectedPredecessorVersion: pair.predecessor.reportVersion, expectedOrderVersion: pair.candidate.orderVersion, predecessorIdentityRecordId: pair.predecessor.identityRecordId, candidateIdentityRecordId: pair.candidate.identityRecordId, linkingTechnicianId: technician, method, rationale, provenanceRecordIds: material } });}}>{c.issue}</button><button className={button} disabled={busy} onClick={() => {setReview(false);setAck([]);setSame(false);document.getElementById(decisionValidation.props("rationale",`${base.reason} · ${c.required}`).id)?.focus();}}>{c.edit}</button></section>}
 </section>}</>}
 </section>}
 </section>;
}
