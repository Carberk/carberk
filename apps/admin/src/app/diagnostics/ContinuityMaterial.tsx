"use client";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import type { DiagnosticSchemas as D } from "@auto-tm/contracts";

import type { ContinuityCopy } from "./continuity-copy";
import type * as Actions from "./actions";
import type { DiagnosticCopy } from "./copy";

import { useAdminLocale } from "@/lib/i18n";

export const continuityButton = "min-h-11 rounded-md border border-text-secondary bg-background px-4 py-2 text-sm disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900 dark:focus-visible:outline-neutral-100 hover:bg-accent hover:text-accent-foreground";
export const continuityPrimary = `${continuityButton} bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground`;
export const continuityField = "mt-2 min-h-12 w-full rounded-md border border-text-secondary bg-background px-3 py-2 text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900 dark:focus-visible:outline-neutral-100";
export function VisitFacts({ observation, c, locale }: { observation: NonNullable<D.DiagnosticOrder["observedVehicle"]>; c: DiagnosticCopy; locale: string }) {
 return <dl className="grid gap-2 break-words sm:grid-cols-[12rem_1fr]"><dt>{c.method}</dt><dd>{c[observation.method]}</dd><dt>{observation.method === "vin" ? c.vin : c.manualReference}</dt><dd className="break-all font-mono">{observation.method === "vin" ? observation.vin : observation.manualReference}</dd><dt>{c.observedAt}</dt><dd>{new Date(observation.observedAt).toLocaleString(locale==="tk"?"tk-TM":locale==="ru"?"ru-RU":"en-GB", { timeZone: "UTC" })} UTC</dd><dt>{c.mileage}</dt><dd>{observation.mileageKm.toLocaleString(locale)} km</dd></dl>;
}
export type ContinuityRecovery = { failed(): void; ready(): void; reload(): void; back(): void };
/** No original image URLs enter this component. Fetch only our protected same-origin proxy.
 * A failed read or decode revokes its object URL; pair recovery never reuses a cached image. */
export function ContinuityMaterial({ src, caption, alt = caption, c, denied, acknowledge, checked = false, recovery }: { src: string; caption: string; alt?: string; c: ContinuityCopy; denied(): void; acknowledge?(value: boolean): void; checked?: boolean; recovery?: ContinuityRecovery }) {
 const labelId = useId();
 const [open, setOpen] = useState(false), [url, setUrl] = useState(""), [error, setError] = useState(false), [loading, setLoading] = useState(false), [decoded,setDecoded]=useState(false), [zoom, setZoom] = useState(100), [ready, setReady] = useState(false);
 const opener = useRef<HTMLButtonElement>(null), heading = useRef<HTMLHeadingElement>(null), recoveryHeading = useRef<HTMLHeadingElement>(null), readyStatus = useRef<HTMLParagraphElement>(null), epoch = useRef(0), objectUrl = useRef("");
 function revoke() { if (objectUrl.current) URL.revokeObjectURL(objectUrl.current); objectUrl.current = ""; setUrl(""); setDecoded(false); }
 useEffect(() => () => { epoch.current++; if (objectUrl.current) URL.revokeObjectURL(objectUrl.current); objectUrl.current = ""; }, []);
 useEffect(()=>{if(open)heading.current?.focus();},[open]);
 useEffect(()=>{if(ready)readyStatus.current?.focus();},[ready]);
 useEffect(()=>{
  if(!error||!recovery)return;
  // Focus falls back to the recovery heading only when the focused preview or control was removed.
  const active=document.activeElement as HTMLElement|null;
  if(!active||active===document.body||!active.isConnected||(active as HTMLButtonElement).disabled)recoveryHeading.current?.focus();
 },[error]);
 function fail() { revoke(); setReady(false); setError(true); acknowledge?.(false); if (recovery) { setOpen(false); recovery.failed(); } }
 async function read(retry = false) {
  if(!retry&&url&&decoded&&!error){setOpen(true);return;}
  const generation = ++epoch.current; setReady(false); setOpen(true); setLoading(true); setError(false); revoke(); acknowledge?.(false);
  try {
   const response = await fetch(src, { cache: "no-store", redirect: "error", credentials: "same-origin" });
   if (generation !== epoch.current) return;
   if (response.status === 401 || response.status === 403) { denied(); return; }
   if (!response.ok || response.headers.get("content-type") !== "image/webp") throw new Error();
   const blob = await response.blob(); if (generation !== epoch.current) return;
   if (!blob.size || blob.size > 10 * 1024 * 1024) throw new Error();
   objectUrl.current = URL.createObjectURL(blob); setUrl(objectUrl.current);
   if (retry && recovery) { setReady(true); recovery.ready(); }
  } catch { if (generation === epoch.current) fail(); }
  finally { if (generation === epoch.current) setLoading(false); }
 }
 function close() { epoch.current++; setOpen(false); setLoading(false); setZoom(100); opener.current?.focus(); }
 return <div className="min-h-14 space-y-3 break-words border-b border-border py-3"><p id={`${labelId}-context`}>{caption}</p><button id={`${labelId}-open`} aria-labelledby={`${labelId}-open ${labelId}-context`} ref={opener} type="button" className={continuityButton} disabled={loading} onClick={() => void read()}>{c.reviewImage}</button>
 {acknowledge && <label className="flex min-h-12 items-center gap-3"><input aria-labelledby={`${labelId}-ack ${labelId}-context`} aria-required="true" type="checkbox" checked={checked} disabled={!url || !decoded || error} onChange={e => acknowledge(e.target.checked)}/><span id={`${labelId}-ack`}>{c.ack} · {c.required}</span></label>}
 {ready && <p ref={readyStatus} role="status" tabIndex={-1}>{c.imageReady}</p>}
 {error && recovery && <section aria-labelledby={`${labelId}-recovery`} className="space-y-3 rounded-lg border border-border p-4"><h4 id={`${labelId}-recovery`} ref={recoveryHeading} tabIndex={-1}>{c.comparisonRecovery}</h4><p role="alert">{c.imageFailed}</p><div className="flex flex-wrap gap-2"><button type="button" className={continuityButton} onClick={() => void read(true)}>{c.retryImage.replace("{image}", caption)}</button><button type="button" className={continuityButton} onClick={recovery.reload}>{c.reloadComparison}</button><button type="button" className={continuityButton} onClick={recovery.back}>{c.backCandidates}</button></div></section>}
 {open && <section aria-label={caption} onKeyDown={e => { if (e.key === "Escape") { e.stopPropagation(); close(); } }} className="space-y-3 rounded-lg border border-border p-4"><h4 ref={heading} tabIndex={-1}>{caption}</h4>{loading && <p role="status">{c.reviewImage}…</p>}{error && !recovery && <p role="alert">{c.unavailable}</p>}{url && <><div className="flex flex-wrap gap-2"><button className={continuityButton} onClick={() => setZoom(Math.min(400, zoom + 25))}>{c.zoomIn}</button><button className={continuityButton} onClick={() => setZoom(Math.max(100, zoom - 25))}>{c.zoomOut}</button><button className={continuityButton} onClick={() => setZoom(100)}>{c.resetZoom}</button><output>{zoom}%</output></div><div tabIndex={0} role="region" aria-label={caption} className="max-h-[32rem] overflow-auto border border-border bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900 dark:focus-visible:outline-neutral-100">{/* Retained sanitized evidence requires a native protected blob image. */}<img src={url} alt={alt} style={{ width: `${zoom}%`, maxWidth: "none" }} onLoad={()=>setDecoded(true)} onError={fail}/></div></>}<button className={continuityButton} onClick={close}>{c.close}</button></section>}
 </div>;
}
export function IdentityEvidenceDetails({ record, c, base }: { record: D.DiagnosticIdentityEvidence; c: ContinuityCopy; base: DiagnosticCopy }) {
 const {locale}=useAdminLocale();
 return <details className="break-words"><summary className="min-h-11 cursor-pointer">{record.correction ? c.correction : c.root}</summary><div className="space-y-3 whitespace-pre-wrap"><VisitFacts observation={record.observation} c={base} locale={locale}/>{record.identifiers.map((item, index) => <dl key={index} className="border-l border-border pl-3"><dt>{c[item.kind]} · {item.location}</dt><dd className="break-all font-mono">{item.value}</dd><dd>{item.provenanceIds.join(", ")}</dd></dl>)}{record.correction && <p className="break-all">{record.correction.supersedesId} · {record.correction.explanation}</p>}<dl className="space-y-2"><dt>{c.rights}</dt><dd>{c.fixedRights}</dd><dt>{c.purpose}</dt><dd>{record.rights.purpose}</dd><dt>{c.basis}</dt><dd>{record.rights.basis}</dd><dt>{c.provenance}</dt><dd>{record.rights.provenance}</dd><dt>{c.identifiability}</dt><dd>{c[record.rights.identifiability]}</dd><dt>{c.until}</dt><dd>{record.rights.schedule.until}</dd><dt>{c.scheduleReason}</dt><dd>{record.rights.schedule.reason}</dd><dt>{c.restrictions}</dt><dd className="whitespace-pre-wrap">{record.rights.supplierRestrictions}</dd></dl><p>{new Date(record.recordedAt).toLocaleString(locale==="tk"?"tk-TM":locale==="ru"?"ru-RU":"en-GB",{timeZone:"UTC"})} UTC · {record.recordedBy ?? c.unavailable}</p><details><summary className="min-h-11">{base.currentActor}</summary><pre className="whitespace-pre-wrap break-all">{JSON.stringify({ id: record.id, identityRecordId: record.identityRecordId, recordHash: record.recordHash, observationHash: record.observationHash }, null, 2)}</pre></details></div></details>;
}

/** A then B, each a complete independent chain. Explicit correction edges, never array position or row alignment, define history. */
export function IdentityComparison({comparison,c,base}:{comparison:Extract<Awaited<ReturnType<typeof Actions.diagnosticReinspectionComparison>>,{ok:true}>["data"];c:ContinuityCopy;base:DiagnosticCopy}) {
 const {locale}=useAdminLocale();
 function history(identity:D.DiagnosticComparisonIdentity) {
  const all=[...new Map([identity.evidence,...identity.corrections].filter((record):record is D.DiagnosticIdentityEvidence=>!!record).map(record=>[record.id,record])).values()];
  const ordered:D.DiagnosticIdentityEvidence[]=[],seen=new Set<string>();
  function visit(record:D.DiagnosticIdentityEvidence){if(seen.has(record.id))return;seen.add(record.id);const parent=all.find(item=>item.id===record.correction?.supersedesId);if(parent)visit(parent);ordered.push(record);}
  all.forEach(visit);return ordered;
 }
 const format=(date:string)=>`${new Date(date).toLocaleString(locale==="tk"?"tk-TM":locale==="ru"?"ru-RU":"en-GB",{timeZone:"UTC"})} UTC`;
 function facts(items:[string,ReactNode][]){return <dl className="grid min-w-0 gap-2 sm:grid-cols-[12rem_1fr]">{items.map(([label,value])=><div key={label} className="contents"><dt className="font-medium">{label}</dt><dd className="whitespace-pre-wrap">{value??c.unavailable}</dd></div>)}</dl>;}
 return <div className="grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-2">{([[comparison.predecessor,c.previous,true],[comparison.candidate,c.current,false]] as const).map(([side,label,previous])=>{
  const {identity,...bindings}=side,records=history(identity),headingId=`continuity-side-${previous?"a":"b"}`;
  return <section key={label} aria-labelledby={headingId} className="min-w-0 space-y-4 [overflow-wrap:anywhere]">
   <h4 id={headingId} className="font-semibold">{label}</h4>
   <details><summary className="min-h-11">{c.audit}</summary><pre className="whitespace-pre-wrap break-all">{JSON.stringify({...bindings,evidenceGeneration:identity.evidenceGeneration,correctionHeadHash:identity.correctionHeadHash,evidenceId:identity.evidence?.id??null},null,2)}</pre></details>
   <h5>{c.raw}</h5><p>{previous?c.pinnedRaw:c.currentRaw}</p>
   {facts([[base.method,base[identity.observation.method]],[base.vin,identity.observation.vin],[base.manualReference,identity.observation.manualReference],[base.observedAt,format(identity.observation.observedAt)],[base.mileage,`${identity.observation.mileageKm.toLocaleString(locale)} km`]])}
   {facts([[c.pinnedEvidence,identity.evidence?.id]])}
   <ol aria-label={`${label} · ${c.identity}`} className="space-y-6">{records.map(record=><li key={record.id} data-record={record.id} aria-label={`${label} · ${record.correction?c.correction:c.root}`} className="space-y-3 border-t border-border pt-4">
    <p className="font-medium">{record.correction?c.correction:c.root}</p>
    <p>{records.some(item=>item.correction?.supersedesId===record.id)?c.superseded:c.successorUnknown}</p>
    {record.id===identity.evidence?.id&&<p>{previous?c.pinnedPrevious:c.pinnedEvidence}</p>}
    <p className="break-all font-mono">{record.id}{record.correction&&<> ← {record.correction.supersedesId}</>}</p>
    {facts([[base.observedAt,format(record.observation.observedAt)],[base.mileage,`${record.observation.mileageKm.toLocaleString(locale)} km`],[record.observation.method==="vin"?base.vin:base.manualReference,record.observation.method==="vin"?record.observation.vin:record.observation.manualReference]])}
    <ol className="space-y-3">{record.identifiers.map((item,index)=><li key={index}>{facts([[c.kind,c[item.kind]],[c.location,item.location],[c.value,item.value],[c.support,item.provenanceIds.join(", ")]])}</li>)}</ol>
    {facts([[c.rights,c.fixedRights],[c.purpose,record.rights.purpose],[c.basis,record.rights.basis],[c.provenance,record.rights.provenance],[c.identifiability,c[record.rights.identifiability]],[c.until,format(record.rights.schedule.until)],[c.scheduleReason,record.rights.schedule.reason],[c.restrictions,record.rights.supplierRestrictions],[base.explanation,record.correction?.explanation]])}
    <details><summary className="min-h-11">{base.currentActor}</summary><pre className="whitespace-pre-wrap break-all">{JSON.stringify({id:record.id,orderId:record.orderId,orderVersion:record.orderVersion,observationHash:record.observationHash,supersedesId:record.correction?.supersedesId??null,identityRecordId:record.identityRecordId,recordHash:record.recordHash,recordedBy:record.recordedBy,recordedAt:record.recordedAt,provenance:record.provenance},null,2)}</pre></details>
   </li>)}</ol>
  </section>;
 })}</div>;
}
