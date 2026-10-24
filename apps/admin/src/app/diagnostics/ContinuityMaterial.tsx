"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { DiagnosticSchemas as D } from "@auto-tm/contracts";

import type { ContinuityCopy } from "./continuity-copy";
import type { DiagnosticCopy } from "./copy";

import { useAdminLocale } from "@/lib/i18n";

export const continuityButton = "min-h-11 rounded-md border border-text-secondary bg-background px-4 py-2 text-sm disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground hover:bg-accent hover:text-accent-foreground";
export const continuityPrimary = `${continuityButton} bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground`;
export const continuityField = "mt-2 min-h-12 w-full rounded-md border border-text-secondary bg-background px-3 py-2 text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground";
export function VisitFacts({ observation, c, locale }: { observation: NonNullable<D.DiagnosticOrder["observedVehicle"]>; c: DiagnosticCopy; locale: string }) {
 return <dl className="grid gap-2 break-words sm:grid-cols-[12rem_1fr]"><dt>{c.method}</dt><dd>{c[observation.method]}</dd><dt>{observation.method === "vin" ? c.vin : c.manualReference}</dt><dd className="break-all font-mono">{observation.method === "vin" ? observation.vin : observation.manualReference}</dd><dt>{c.observedAt}</dt><dd>{new Date(observation.observedAt).toLocaleString(locale==="tk"?"tk-TM":locale==="ru"?"ru-RU":"en-GB", { timeZone: "UTC" })} UTC</dd><dt>{c.mileage}</dt><dd>{observation.mileageKm.toLocaleString(locale)} km</dd></dl>;
}
/** No original image URLs enter this component. Fetch only our protected same-origin proxy. */
export function ContinuityMaterial({ src, caption, c, denied, acknowledge, checked = false }: { src: string; caption: string; c: ContinuityCopy; denied(): void; acknowledge?(value: boolean): void; checked?: boolean }) {
 const [open, setOpen] = useState(false), [url, setUrl] = useState(""), [error, setError] = useState(false), [loading, setLoading] = useState(false), [decoded,setDecoded]=useState(false), [zoom, setZoom] = useState(100);
 const opener = useRef<HTMLButtonElement>(null), heading = useRef<HTMLHeadingElement>(null), epoch = useRef(0), objectUrl = useRef("");
 useEffect(() => () => { epoch.current++; if (objectUrl.current) URL.revokeObjectURL(objectUrl.current); }, []);
 useEffect(()=>{if(open)heading.current?.focus();},[open]);
 async function read() {
  if(url&&decoded&&!error){setOpen(true);return;}
  const generation = ++epoch.current; setOpen(true); setDecoded(false); setLoading(true); setError(false); setUrl(""); acknowledge?.(false);
  if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
  try {
   const response = await fetch(src, { cache: "no-store", redirect: "error", credentials: "same-origin" });
   if (generation !== epoch.current) return;
   if (response.status === 401 || response.status === 403) { denied(); return; }
   if (!response.ok || response.headers.get("content-type") !== "image/webp") throw new Error();
   const blob = await response.blob(); if (generation !== epoch.current) return;
   if (!blob.size || blob.size > 10 * 1024 * 1024) throw new Error();
   objectUrl.current = URL.createObjectURL(blob); setUrl(objectUrl.current);
  } catch { if (generation === epoch.current) setError(true); }
  finally { if (generation === epoch.current) setLoading(false); }
 }
 function close() { epoch.current++; setOpen(false); setLoading(false); setZoom(100); opener.current?.focus(); }
 return <div className="min-h-14 space-y-3 break-words border-b border-border py-3"><p>{caption}</p><button ref={opener} type="button" className={continuityButton} disabled={loading} onClick={() => void read()}>{c.reviewImage}</button>
 {acknowledge && <label className="flex min-h-12 items-center gap-3"><input aria-required="true" type="checkbox" checked={checked} disabled={!url || !decoded || error} onChange={e => acknowledge(e.target.checked)}/>{c.ack} · {c.required}</label>}
 {open && <section aria-label={caption} onKeyDown={e => { if (e.key === "Escape") { e.stopPropagation(); close(); } }} className="space-y-3 rounded-lg border border-border p-4"><h4 ref={heading} tabIndex={-1}>{caption}</h4>{loading && <p role="status">{c.reviewImage}…</p>}{error && <p role="alert">{c.unavailable}</p>}{url && <><div className="flex flex-wrap gap-2"><button className={continuityButton} onClick={() => setZoom(Math.min(400, zoom + 25))}>{c.zoomIn}</button><button className={continuityButton} onClick={() => setZoom(Math.max(100, zoom - 25))}>{c.zoomOut}</button><button className={continuityButton} onClick={() => setZoom(100)}>{c.resetZoom}</button><output>{zoom}%</output></div><div tabIndex={0} role="region" aria-label={caption} className="max-h-[32rem] overflow-auto border border-border bg-muted focus-visible:outline-2">{/* Retained sanitized evidence requires a native protected blob image. */}<img src={url} alt={caption} style={{ width: `${zoom}%`, maxWidth: "none" }} onLoad={()=>setDecoded(true)} onError={() => { setDecoded(false); setError(true); acknowledge?.(false); }}/></div></>}<button className={continuityButton} onClick={close}>{c.close}</button></section>}
 </div>;
}
export function IdentityEvidenceDetails({ record, c, base }: { record: D.DiagnosticIdentityEvidence; c: ContinuityCopy; base: DiagnosticCopy }) {
 const {locale}=useAdminLocale();
 return <details className="break-words"><summary className="min-h-11 cursor-pointer">{record.correction ? c.correction : c.root}</summary><div className="space-y-3 whitespace-pre-wrap"><VisitFacts observation={record.observation} c={base} locale={locale}/>{record.identifiers.map((item, index) => <dl key={index} className="border-l border-border pl-3"><dt>{c[item.kind]} · {item.location}</dt><dd className="break-all font-mono">{item.value}</dd><dd>{item.provenanceIds.join(", ")}</dd></dl>)}{record.correction && <p className="break-all">{record.correction.supersedesId} · {record.correction.explanation}</p>}<dl className="space-y-2"><dt>{c.rights}</dt><dd>{c.fixedRights}</dd><dt>{c.purpose}</dt><dd>{record.rights.purpose}</dd><dt>{c.basis}</dt><dd>{record.rights.basis}</dd><dt>{c.provenance}</dt><dd>{record.rights.provenance}</dd><dt>{c.identifiability}</dt><dd>{c[record.rights.identifiability]}</dd><dt>{c.until}</dt><dd>{record.rights.schedule.until}</dd><dt>{c.scheduleReason}</dt><dd>{record.rights.schedule.reason}</dd><dt>{c.restrictions}</dt><dd className="whitespace-pre-wrap">{record.rights.supplierRestrictions}</dd></dl><p>{new Date(record.recordedAt).toLocaleString(locale==="tk"?"tk-TM":locale==="ru"?"ru-RU":"en-GB",{timeZone:"UTC"})} UTC · {record.recordedBy ?? c.unavailable}</p><details><summary className="min-h-11">{base.currentActor}</summary><pre className="whitespace-pre-wrap break-all">{JSON.stringify({ id: record.id, identityRecordId: record.identityRecordId, recordHash: record.recordHash, observationHash: record.observationHash }, null, 2)}</pre></details></div></details>;
}

/** Each field group keeps A and B adjacent at every viewport. Edges, never array position, define history. */
export function IdentityComparison({predecessor,candidate,c,base}:{predecessor:D.DiagnosticComparisonIdentity;candidate:D.DiagnosticComparisonIdentity;c:ContinuityCopy;base:DiagnosticCopy}) {
 const {locale}=useAdminLocale();
 function paired(label:string,a:ReactNode,b:ReactNode,key=label){return <section key={key} className="space-y-3"><h4 className="font-semibold">{label}</h4><div className="grid min-w-0 gap-6 lg:grid-cols-2">{[[c.previous,a],[c.current,b]].map(([side,value],index)=><dl key={index} className="min-w-0 space-y-2 [overflow-wrap:anywhere]"><dt className="font-medium">{side}</dt><dd className="whitespace-pre-wrap">{value??c.unavailable}</dd></dl>)}</div></section>;}
 function history(identity:D.DiagnosticComparisonIdentity) {
  const all=[...new Map([identity.evidence,...identity.corrections].filter((record):record is D.DiagnosticIdentityEvidence=>!!record).map(record=>[record.id,record])).values()];
  const ordered:D.DiagnosticIdentityEvidence[]=[],seen=new Set<string>();
  function visit(record:D.DiagnosticIdentityEvidence){if(seen.has(record.id))return;seen.add(record.id);const parent=all.find(item=>item.id===record.correction?.supersedesId);if(parent)visit(parent);ordered.push(record);}
  all.forEach(visit);return ordered;
 }
 const sides=[history(predecessor),history(candidate)];
 const format=(date:string)=>`${new Date(date).toLocaleString(locale==="tk"?"tk-TM":locale==="ru"?"ru-RU":"en-GB",{timeZone:"UTC"})} UTC`;
 const observationFields=[
  {label:base.method,value:(o:D.DiagnosticComparisonIdentity["observation"])=>base[o.method]},
  {label:base.vin,value:(o:D.DiagnosticComparisonIdentity["observation"])=>o.vin},
  {label:base.manualReference,value:(o:D.DiagnosticComparisonIdentity["observation"])=>o.manualReference},
  {label:base.observedAt,value:(o:D.DiagnosticComparisonIdentity["observation"])=>format(o.observedAt)},
  {label:base.mileage,value:(o:D.DiagnosticComparisonIdentity["observation"])=>`${o.mileageKm.toLocaleString(locale)} km`},
 ];
 const recordFields:{label:string;value:(record:D.DiagnosticIdentityEvidence)=>ReactNode}[]=[
  {label:c.identifier,value:record=><ol className="space-y-3">{record.identifiers.map((item,index)=><li key={index}><dl><dt>{c.kind}</dt><dd>{c[item.kind]}</dd><dt>{c.location}</dt><dd>{item.location}</dd><dt>{c.value}</dt><dd>{item.value}</dd><dt>{c.support}</dt><dd>{item.provenanceIds.join(", ")}</dd></dl></li>)}</ol>},
  {label:c.rights,value:()=>c.fixedRights},
  {label:c.purpose,value:r=>r.rights.purpose},{label:c.basis,value:r=>r.rights.basis},{label:c.provenance,value:r=>r.rights.provenance},
  {label:c.identifiability,value:r=>c[r.rights.identifiability]},{label:c.until,value:r=>format(r.rights.schedule.until)},
  {label:c.scheduleReason,value:r=>r.rights.schedule.reason},{label:c.restrictions,value:r=>r.rights.supplierRestrictions},
  {label:base.explanation,value:r=>r.correction?.explanation??null},
  {label:base.currentActor,value:r=><details><summary className="min-h-11">{base.currentActor}</summary><pre className="whitespace-pre-wrap break-all">{JSON.stringify({id:r.id,supersedesId:r.correction?.supersedesId??null,identityRecordId:r.identityRecordId,recordHash:r.recordHash,recordedBy:r.recordedBy,recordedAt:r.recordedAt,provenance:r.provenance},null,2)}</pre></details>},
 ];
 return <div className="space-y-6"><h3>{c.raw}</h3><p>{c.previous} · {c.pinnedRaw}</p><p>{c.current} · {c.currentRaw}</p>{observationFields.map(item=>paired(item.label,item.value(predecessor.observation),item.value(candidate.observation)))}
 {paired(c.pinnedEvidence,predecessor.evidence?.id,candidate.evidence?.id)}
 {Array.from({length:Math.max(...sides.map(side=>side.length))},(_,index)=>{
  const a=sides[0]?.[index],b=sides[1]?.[index];
  function role(record:D.DiagnosticIdentityEvidence|undefined,side:D.DiagnosticIdentityEvidence[],pin:string|undefined,previous=false){return record?<div><p>{record.correction?c.correction:c.root}</p><p>{side.some(item=>item.correction?.supersedesId===record.id)?c.superseded:c.currentLeaf}</p>{record.id===pin&&<p>{previous?c.pinnedPrevious:c.pinnedEvidence}</p>}<p className="font-mono">{record.id}{record.correction&&<> ← {record.correction.supersedesId}</>}</p></div>:null;}
  return <section key={index} className="space-y-4 border-t border-border pt-4">{paired(c.identity,role(a,sides[0]??[],predecessor.evidence?.id,true),role(b,sides[1]??[],candidate.evidence?.id))}{observationFields.map(item=>paired(item.label,a?item.value(a.observation):null,b?item.value(b.observation):null))}{recordFields.map(item=>paired(item.label,a?item.value(a):null,b?item.value(b):null))}</section>;
 })}</div>;
}
