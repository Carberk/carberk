"use client";
import { useEffect, useRef, useState } from "react";
import { DiagnosticSchemas as D } from "@auto-tm/contracts";

import { diagnosticAbandon, diagnosticSave, type DiagnosticResult } from "./actions";
import type { DiagnosticCopy } from "./copy";

type Draft = Omit<D.DiagnosticFinding,"assessment"> & {assessment:D.DiagnosticFinding["assessment"]|""};
const field="mt-1 min-h-11 w-full rounded-md border border-neutral-400 bg-white px-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900 dark:focus-visible:outline-neutral-100 py-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900 dark:focus-visible:outline-neutral-100";
const button="min-h-11 rounded-md border border-neutral-400 px-4 py-2 text-sm hover:bg-neutral-100 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900 dark:focus-visible:outline-neutral-100";
export type DiagnosticPerform = (work:()=>Promise<DiagnosticResult<unknown>>) => Promise<boolean>;
export function DiagnosticAuthoring({report,c,locale,editable,busy,conflict,perform,denied,onDirty}:{report:D.DiagnosticReportRecord;c:DiagnosticCopy;locale:"tk"|"ru"|"en";editable:boolean;busy:boolean;conflict:boolean;perform:DiagnosticPerform;denied:()=>void;onDirty:(value:boolean)=>void}) {
 const [draft,setDraft]=useState<Draft|null>(null),[message,setMessage]=useState<"noChanges"|"uploadError"|"invalidImage"|"error"|null>(null),[upload,setUpload]=useState<{file:File;id:string;failed:boolean}|null>(null),[uploading,setUploading]=useState(false);
 const generation=useRef(0),uploaded=useRef(new Set<string>());
 useEffect(()=>()=>{generation.current++;},[]);
 useEffect(()=>{onDirty(!!draft||!!upload);},[draft,upload,onDirty]);
 const location=draft?.location;
 const check=report.template.checks.find(item=>item.id===draft?.checkId),panel=report.template.panels.find(item=>item.id===draft?.checkId);
 const assessed=!!draft?.assessment && !["not_checked","not_applicable"].includes(draft.assessment);
 const evidenceMissing=!!draft && (["note","fault"].includes(draft.assessment)||(assessed&&(check?.evidenceRequired||panel?.evidenceRequired))) && draft.evidenceIds.length===0;
 const explanationMissing=!!draft?.assessment && draft.assessment!=="normal" && !draft.explanation?.trim();
 const measurementMissing=assessed&&!!check?.measurement&&(!draft?.measurement||!Number.isFinite(draft.measurement.value)||!draft.measurement.method.trim()||!draft.measurement.uncertainty.trim());
 const choose=(checkId:string)=>{
  if(draft){setMessage("noChanges");return;}
  const prior=report.findings.find(item=>item.checkId===checkId);
  setDraft(prior?structuredClone(prior):{id:crypto.randomUUID(),checkId,assessment:"",explanation:null,evidenceIds:[],kind:null,source:null,measurement:null,location:null});setMessage(null);
 };
 const update=(values:Partial<Draft>)=>setDraft(prior=>prior?{...prior,...values}:null);
 const uploadImage=async(pending:{file:File;id:string;failed:boolean})=>{
  if(!draft)return;const epoch=generation.current;setUploading(true);setMessage(null);
  try {
   const response=await fetch(`/diagnostics/evidence/${report.id}/${pending.id}?findingId=${draft.id}&expectedVersion=${report.version}`,{method:"PUT",headers:{"Content-Type":"application/octet-stream","X-Evidence-Type":pending.file.type},body:pending.file,cache:"no-store"});
   if(epoch!==generation.current)return;
   if(response.status===403){denied();return;}
   if(!response.ok)throw new Error("upload");
   const value=await response.json() as {id?:string};if(value.id!==pending.id)throw new Error("upload");
   uploaded.current.add(pending.id);setDraft(prior=>prior?{...prior,evidenceIds:[...new Set([...prior.evidenceIds,pending.id])]}:null);setUpload(null);
  }catch{if(epoch===generation.current){setUpload({...pending,failed:true});setMessage("uploadError");}}
  finally{if(epoch===generation.current)setUploading(false);}
 };
 const measurement=(values:Partial<NonNullable<D.DiagnosticFinding["measurement"]>>)=>update({measurement:{value:Number.NaN,unit:check?.measurement?.unit??"",method:"",uncertainty:"",...draft?.measurement,...values}});
 return <section className="space-y-5"><ul className="divide-y border-y">{[...report.template.checks,...report.template.panels].map(item=>{const finding=report.findings.find(row=>row.checkId===item.id);const n=finding?report.findings.indexOf(finding)+1:null;return <li key={item.id} className="py-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><h4 className="font-medium">{n?`${n}. `:""}{item.label[locale]}</h4><p className="mt-1 text-sm">{finding?c[finding.assessment]:c.unassessed}{"required" in item && item.required?` · ${c.required}`:""}{item.evidenceRequired?` · ${c.evidenceRequired}`:""}</p></div>{editable&&<button className={button} disabled={busy||uploading} onClick={()=>choose(item.id)}>{c.finding}</button>}</div>{!finding?<p className="mt-2 text-sm text-neutral-600">{c.unchecked}</p>:<div className="mt-2 space-y-2 text-sm">{finding.assessment==="normal"&&"views" in item&&<p>{c.zero}</p>}<p className="whitespace-pre-wrap">{finding.explanation}</p>{finding.kind&&<p>{c[finding.kind]}{finding.source?` · ${finding.source}`:""}</p>}{finding.measurement&&<p>{finding.measurement.value} {finding.measurement.unit} · {finding.measurement.method} · {c.uncertainty}: {finding.measurement.uncertainty}</p>}{finding.location&&<p>{c[finding.location.view]} · {finding.location.x*100}% / {finding.location.y*100}%</p>}<div className="flex flex-wrap gap-3">{finding.evidenceIds.map(id=><a key={id} href={`/diagnostics/evidence/${report.id}/${id}`} target="_blank" rel="noreferrer" className="underline">{c.preview} · {id.slice(0,8)}</a>)}</div></div>}</li>})}</ul>
 {message&&<p role="alert">{c[message]}</p>}
 {draft&&editable&&<fieldset disabled={busy||uploading} className="space-y-4 border-y py-5"><legend className="font-semibold">{c.local} · {check?.label[locale]??panel?.label[locale]}</legend>
 <p className="text-sm">{c.compare}: {(()=>{const prior=report.findings.find(item=>item.checkId===draft.checkId);return prior?`${c[prior.assessment]} · ${prior.explanation??""}`:c.unassessed;})()}</p>
 <label className="block">{c.finding}<select className={field} value={draft.assessment} onChange={e=>update({assessment:e.target.value as Draft["assessment"]})}><option value="">{c.unassessed}</option>{D.DiagnosticAssessmentSchema.options.map(value=><option key={value} value={value}>{c[value]}</option>)}</select></label>
 <label className="block">{c.explanation}<textarea className={field} rows={4} maxLength={5000} value={draft.explanation??""} onChange={e=>update({explanation:e.target.value||null})}/></label>
 <label className="block">{c.kind}<select className={field} value={draft.kind??""} onChange={e=>update({kind:(e.target.value||null) as Draft["kind"]})}><option value="">{c.none}</option>{(["observed_damage","observed_repair","source_history"] as const).map(kind=><option key={kind} value={kind}>{c[kind]}</option>)}</select></label>
 {draft.kind==="source_history"&&<label className="block">{c.source}<textarea className={field} maxLength={1000} value={draft.source??""} onChange={e=>update({source:e.target.value||null})}/></label>}
 {check?.measurement&&<div className="grid gap-4 sm:grid-cols-2"><label>{c.value}<input className={field} type="number" step="any" value={Number.isFinite(draft.measurement?.value)?draft.measurement?.value:""} onChange={e=>measurement({value:e.target.value===""?Number.NaN:Number(e.target.value)})}/></label><label>{c.unit}<input className={field} readOnly value={check.measurement.unit}/></label><label>{c.measurementMethod}<input className={field} maxLength={1000} value={draft.measurement?.method??""} placeholder={check.measurement.method[locale]} onChange={e=>measurement({method:e.target.value})}/></label><label>{c.uncertainty}<input className={field} maxLength={1000} value={draft.measurement?.uncertainty??""} onChange={e=>measurement({uncertainty:e.target.value})}/></label></div>}
 {panel&&<div className="space-y-3"><label className="flex items-center gap-2"><input type="checkbox" checked={!!draft.location} onChange={e=>update({location:e.target.checked?{panelId:panel.id,view:panel.views[0]??"front",x:.5,y:.5}:null})}/>{c.location}</label>{location&&<div className="grid gap-4 sm:grid-cols-3"><label>{c.view}<select className={field} value={location.view} onChange={e=>update({location:{...location,view:e.target.value as NonNullable<Draft["location"]>["view"]}})}>{panel.views.map(view=><option key={view} value={view}>{c[view]}</option>)}</select></label>{(["x","y"] as const).map(axis=><label key={axis}>{c[axis]}<input className={field} type="number" min="0" max="100" value={Math.round(location[axis]*100)} onChange={e=>update({location:{...location,[axis]:Number(e.target.value)/100}})}/></label>)}</div>}</div>}
 <div className="space-y-3"><h4 className="font-medium">{c.evidence}</h4><ul className="space-y-2">{draft.evidenceIds.map(id=><li key={id} className="flex flex-wrap items-center gap-3"><a href={`/diagnostics/evidence/${report.id}/${id}`} target="_blank" rel="noreferrer" className="underline">{c.preview} · {id.slice(0,8)}</a><button className={button} onClick={()=>{void(async()=>{if(uploaded.current.has(id)&&!await perform(()=>diagnosticAbandon(report.id,id)))return;update({evidenceIds:draft.evidenceIds.filter(value=>value!==id)});})();}}>{c.removeEvidence}</button></li>)}</ul><label className="block">{c.addEvidence}<input className={field} type="file" accept="image/jpeg,image/png,image/webp" disabled={!!upload} onChange={event=>{const file=event.target.files?.[0];event.target.value="";if(!file)return;if(!["image/jpeg","image/png","image/webp"].includes(file.type)||file.size>10*1024*1024||!file.size){setMessage("invalidImage");return;}const pending={file,id:crypto.randomUUID(),failed:false};setUpload(pending);void uploadImage(pending);}}/></label></div>
 {upload&&<div><p role="status">{uploading?c.uploading:upload.failed?c.uploadError:upload.file.name}</p>{upload.failed&&<button className={button} onClick={()=>void uploadImage(upload)}>{c.uploadRetry}</button>}{!uploading&&<button className={button} onClick={()=>{void(async()=>{await perform(()=>diagnosticAbandon(report.id,upload.id));setUpload(null);})();}}>{c.cancelUpload}</button>}</div>}
 {evidenceMissing&&<p role="status">{c.evidenceRequired}</p>}
 <div className="flex flex-wrap gap-3"><button className={button} disabled={!draft.assessment||!!upload||conflict||evidenceMissing||explanationMissing||measurementMissing||(draft.kind==="source_history"&&!draft.source?.trim())} onClick={()=>{const parsed=D.DiagnosticFindingSchema.safeParse(draft);if(!parsed.success){setMessage("error");return;}void perform(()=>diagnosticSave(report.id,{expectedVersion:report.version,finding:parsed.data})).then(ok=>{if(ok){setDraft(null);uploaded.current.clear();setMessage(null);}});}}>{c.save}</button><button className={button} disabled={!!upload} onClick={()=>{void(async()=>{for(const id of uploaded.current){if(!await perform(()=>diagnosticAbandon(report.id,id)))return;}uploaded.current.clear();setDraft(null);setMessage(null);})();}}>{c.clear}</button></div></fieldset>}
 </section>;
}
