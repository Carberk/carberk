"use client";
import { useEffect, useRef, useState } from "react";
import { DiagnosticSchemas as D } from "@auto-tm/contracts";

import { diagnosticAssigned, diagnosticCorrect, diagnosticCreateDraft, diagnosticTransition, diagnosticWorkspace } from "./actions";
import { DiagnosticAuthoring, type DiagnosticPerform } from "./DiagnosticAuthoring";
import { DiagnosticBodyMap } from "./DiagnosticBodyMap";
import { DiagnosticIntake } from "./DiagnosticIntake";
import { diagnosticCopy } from "./copy";

import { useAdminLocale } from "@/lib/i18n";

const button="min-h-11 rounded-md border border-neutral-400 px-4 py-2 text-sm hover:bg-neutral-100 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2";
export function DiagnosticWorkspace() {
 const {locale}=useAdminLocale(),c=diagnosticCopy[locale];
 const [queue,setQueue]=useState<D.DiagnosticOrder[]>([]),[context,setContext]=useState<D.DiagnosticWorkspace|null>(null),[reports,setReports]=useState<D.DiagnosticReportRecord[]>([]),[reportId,setReportId]=useState(""),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState<"denied"|"conflict"|"error"|null>(null),[saved,setSaved]=useState(false),[needsRefresh,setNeedsRefresh]=useState(false),[reason,setReason]=useState(""),[selfReview,setSelfReview]=useState(false),[dirty,setDirty]=useState(false);
 const epoch=useRef(0),busyFence=useRef(false),draftKey=useRef<{orderId:string;id:string}|null>(null),correctionKey=useRef<{fingerprint:string;id:string}|null>(null);
 const report=reports.find(item=>item.id===reportId)??reports.at(-1);
 function deny(){epoch.current++;setContext(null);setReports([]);setQueue([]);setError("denied");setReason("");setDirty(false);setLoading(false);}
 async function list(){const current=++epoch.current;setLoading(true);setError(null);try {const result=await diagnosticAssigned();if(current!==epoch.current)return;if(result.ok)setQueue(result.data);else{setError(result.error);if(result.error==="denied")deny();}}catch{if(current===epoch.current)setError("error");}finally{if(current===epoch.current)setLoading(false);}}
 async function open(id:string){const current=++epoch.current;setLoading(true);setError(null);try {const result=await diagnosticWorkspace(id);if(current!==epoch.current)return;if(result.ok){setContext(result.data.context);setReports(result.data.reports);setNeedsRefresh(false);}else if(result.error==="denied")deny();else setError(result.error);}catch{if(current===epoch.current)setError("error");}finally{if(current===epoch.current)setLoading(false);}}
 useEffect(()=>{void list();return()=>{epoch.current++;};},[]);
 const perform:DiagnosticPerform=async work=>{
  if(busyFence.current)return false;busyFence.current=true;setBusy(true);setSaved(false);setError(null);const current=epoch.current;
  try {
   const result=await work();if(current!==epoch.current)return false;
   if(!result.ok){if(result.error==="denied")deny();else {setError(result.error);if(result.error==="conflict")setNeedsRefresh(true);}return false;}
   const parsed=D.DiagnosticReportSchema.safeParse(result.data);if(parsed.success)setReportId(parsed.data.id);
   setSaved(true);if(context)await open(context.order.id);return true;
  }catch{if(current===epoch.current)setError("error");return false;}finally{busyFence.current=false;setBusy(false);}
 };
 const has=(capability:D.DiagnosticCapability)=>context?.capabilities.includes(capability)??false;
 const author=report?.authorId===context?.actorId,editable=!!report&&author&&has("diagnostics.technician")&&["draft","returned"].includes(report.status);
 return <div className="space-y-6"><header className="space-y-2"><h1 className="text-2xl font-semibold">{c.title}</h1><p className="max-w-prose text-sm text-neutral-600">{c.scope}</p></header>
 {loading&&<p role="status">{c.loading}</p>}{error&&<div className="space-y-3" role="alert"><p>{c[error]}</p>{error!=="denied"&&<button className={button} disabled={busy||loading} onClick={()=>void(context?open(context.order.id):list())}>{error==="conflict"?c.refresh:c.retry}</button>}</div>}{saved&&!error&&<p role="status">{c.saved}</p>}
 {!context?<section className="space-y-4"><h2 className="text-lg font-medium">{c.queue}</h2>{!loading&&!error&&!queue.length&&<p role="status">{c.empty}</p>}<ul className="divide-y">{queue.map(order=><li key={order.id} className="flex flex-wrap items-center justify-between gap-3 py-4"><div><p>{c[order.audience]} · {c[order.status]}</p><p className="mt-1 break-all text-sm text-neutral-600">{order.id}</p></div><button className={button} disabled={loading} onClick={()=>void open(order.id)}>{c.open}</button></li>)}</ul><button className={button} disabled={loading} onClick={()=>void list()}>{c.refresh}</button></section>:<>
 <div className="flex flex-wrap gap-3"><button className={button} disabled={busy||dirty||loading} onClick={()=>{epoch.current++;setContext(null);setReports([]);setReportId("");setReason("");void list();}}>{c.back}</button><button className={button} disabled={busy||loading} onClick={()=>void open(context.order.id)}>{c.refresh}</button></div>
 <DiagnosticIntake context={context} c={c} busy={busy||loading||needsRefresh} run={async work=>{await perform(work);}}/>
 <section className="space-y-4"><h2 className="text-lg font-medium">{c.reports}</h2>{reports.length>0&&<label className="block max-w-2xl">{c.selectReport}<select className="mt-1 min-h-11 w-full rounded-md border border-neutral-400 bg-white px-3" disabled={busy||dirty||loading} value={report?.id??""} onChange={e=>{setReportId(e.target.value);setReason("");setSelfReview(false);}}>{reports.map(item=><option key={item.id} value={item.id}>{c[item.status]} · {item.id}</option>)}</select></label>}
 {!reports.length&&has("diagnostics.technician")&&<button className={button} disabled={busy||loading||needsRefresh||!context.order.observedVehicle||!context.order.physicalAuthorized||context.order.status!=="arrived"} onClick={()=>{if(draftKey.current?.orderId!==context.order.id)draftKey.current={orderId:context.order.id,id:crypto.randomUUID()};const retryId=draftKey.current.id;void perform(()=>diagnosticCreateDraft(context.order.id,{reportId:retryId,expectedOrderVersion:context.order.version}));}}>{c.create}</button>}
 {report&&<div className="space-y-6"><dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[12rem_1fr]"><dt>{c.status}</dt><dd>{c[report.status]}</dd><dt>{c.observedAt}</dt><dd>{new Date(report.observedAt).toLocaleString(locale==="tk"?"tk-TM":locale==="ru"?"ru-RU":"en-GB",{timeZone:"UTC"})} UTC</dd><dt>{c.mileage}</dt><dd>{report.mileageKm.toLocaleString()}</dd><dt>{c.author}</dt><dd className="break-all">{report.authorId??"—"}</dd><dt>{c.reviewer}</dt><dd className="break-all">{report.reviewerId??"—"}</dd>{report.successorOf&&<><dt>{c.history}</dt><dd className="break-all">{report.successorOf}</dd></>}</dl>
 {report.returnReason&&<p className="border-y py-4" role="status">{c.return}: {report.returnReason}</p>}{report.correctionReason&&<p>{c.correct}: {report.correctionReason}</p>}{report.withdrawalReason&&<p>{c.withdraw}: {report.withdrawalReason}</p>}
 <section><h3 className="font-medium">{c.limits}</h3><p className="mt-2 max-w-prose whitespace-pre-wrap text-sm">{report.template.limitations[locale]}</p><p className="mt-2 max-w-prose text-sm">{report.template.syntheticNotice[locale]}</p></section>
 {report.template.panels.length>0&&<DiagnosticBodyMap report={report} c={c}/>}
 <DiagnosticAuthoring key={report.id} report={report} c={c} locale={locale} editable={editable} busy={busy||loading} conflict={needsRefresh} perform={perform} denied={deny} onDirty={setDirty}/>
 <section className="space-y-4 border-t pt-5"><p className="max-w-prose text-sm">{c.reviewNotice}</p><p className="max-w-prose text-sm">{c.releaseWarning}</p>{(has("diagnostics.reviewer")||has("diagnostics.technician"))&&<label className="block">{c.reason}<textarea className="mt-1 w-full rounded-md border border-neutral-400 bg-white p-3" rows={3} maxLength={1000} value={reason} onChange={e=>setReason(e.target.value)}/></label>}
 {report.audience==="buyer_private"&&author&&has("diagnostics.reviewer")&&report.status==="submitted"&&<label className="flex items-center gap-3"><input type="checkbox" checked={selfReview} onChange={e=>setSelfReview(e.target.checked)}/>{c.selfReview}</label>}
 <div className="flex flex-wrap gap-3">{editable&&<button className={button} disabled={busy||loading||dirty||needsRefresh} onClick={()=>void perform(()=>diagnosticTransition(report.id,{expectedVersion:report.version,action:"submit"}))}>{c.submit}</button>}
 {report.status==="submitted"&&has("diagnostics.reviewer")&&<><button className={button} disabled={busy||loading||dirty||needsRefresh||!reason.trim()||(author&&(report.audience!=="buyer_private"||!selfReview))} onClick={()=>void perform(()=>diagnosticTransition(report.id,{expectedVersion:report.version,action:"return",reason,...(author?{privateSelfReview:true}:{})}))}>{c.return}</button><button className={button} disabled={busy||loading||dirty||needsRefresh||(author&&(report.audience!=="buyer_private"||!selfReview||!reason.trim()))} onClick={()=>void perform(()=>diagnosticTransition(report.id,{expectedVersion:report.version,action:"finalize",...(author?{privateSelfReview:true,reason}:{})}))}>{c.finalize}</button></>}
 {report.status==="finalized"&&<>{has("diagnostics.reviewer")&&<button className={button} disabled={busy||loading||dirty||needsRefresh||!reason.trim()} onClick={()=>void perform(()=>diagnosticTransition(report.id,{expectedVersion:report.version,action:"withdraw",reason}))}>{c.withdraw}</button>}{has("diagnostics.technician")&&<button className={button} disabled={busy||loading||dirty||needsRefresh||!reason.trim()} onClick={()=>{const fingerprint=`${report.id}:${reason}`;if(correctionKey.current?.fingerprint!==fingerprint)correctionKey.current={fingerprint,id:crypto.randomUUID()};const retryId=correctionKey.current.id;void perform(()=>diagnosticCorrect(report.id,{expectedVersion:report.version,successorId:retryId,reason}));}}>{c.correct}</button>}</>}
 </div><p className="max-w-prose text-sm text-neutral-600">{c.correctionNotice}</p><p className="max-w-prose text-sm text-neutral-600">{c.newInspection}</p></section>
 </div>}
 </section></>}
 </div>;
}
