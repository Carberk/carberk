"use client";
import { useEffect,useRef,useState,type FormEvent } from "react";
import type { ImprovementSchemas } from "@auto-tm/contracts";

import { loadImprovement,openInvestigation } from "./actions";
import { ImprovementFixes } from "./ImprovementFixes";
import { MarketResearchPanel } from "./MarketResearchPanel";
import { improvementCopy } from "./copy";

import { useAdminLocale } from "@/lib/i18n";

type Load=Awaited<ReturnType<typeof loadImprovement>>;
type Detail=Extract<Awaited<ReturnType<typeof openInvestigation>>,{ok:true}>;
export function ImprovementWorkspace({canInvestigate}:{canInvestigate:boolean}) {
 const {locale}=useAdminLocale(),copy=improvementCopy[locale];
 const [period,setPeriod]=useState<ImprovementSchemas.ImprovementPeriod>("completed_week");
 const [tab,setTab]=useState<"overview"|"journeys"|"reliability">("overview");
 const [load,setLoad]=useState<Load|null>(null),[refresh,setRefresh]=useState(0);
 const [drawer,setDrawer]=useState(false),[reason,setReason]=useState(""),[detail,setDetail]=useState<Detail|null>(null),[detailError,setDetailError]=useState(false),[busy,setBusy]=useState(false);
 const panel=useRef<HTMLElement>(null),detailRequest=useRef(0);
 const number=new Intl.NumberFormat(locale==="tk"?"tk-TM":locale==="ru"?"ru-RU":"en-GB",{maximumFractionDigits:4});
 const format=(value:number|null|undefined)=>value===null||value===undefined?"—":number.format(value);
 const date=(value:string)=>new Intl.DateTimeFormat(locale==="tk"?"tk-TM":locale==="ru"?"ru-RU":"en-GB",{dateStyle:"medium",timeStyle:"short",timeZone:"UTC"}).format(new Date(value))+" UTC";
 useEffect(()=>{let alive=true;setLoad(null);setDetail(null);detailRequest.current++;setBusy(false);void loadImprovement(period).then(result=>{if(alive)setLoad(result);}).catch(()=>{if(alive)setLoad({ok:false,error:"error"});});return()=>{alive=false;};},[period,refresh]);
 useEffect(()=>{if(!detail)return;const expiry=Math.min(Date.parse(detail.receipt.expiresAt),Date.parse(detail.timeline.expiresAt));const timer=setTimeout(()=>setDetail(null),Math.max(0,Math.min(2147483647,expiry-Date.now())));return()=>clearTimeout(timer);},[detail]);
 useEffect(()=>{const timer=setInterval(()=>setRefresh(value=>value+1),60_000);return()=>clearInterval(timer);},[]);
 useEffect(()=>{
  if(!drawer) return;
  const previous=document.activeElement;
  const element=panel.current;
  element?.querySelector<HTMLButtonElement>("button")?.focus();
  const focusable=()=>Array.from(element?.querySelectorAll<HTMLElement>('button,input,textarea,a[href],select,[tabindex="0"]')??[]).filter(item=>!item.hasAttribute("disabled"));
  function keyboard(event:KeyboardEvent) {
   if(event.key==="Escape") {event.preventDefault();setDrawer(false);return;}
   if(event.key!=="Tab")return;
   const items=focusable(),first=items[0],last=items.at(-1);
   if(event.shiftKey && document.activeElement===first) {event.preventDefault();last?.focus();}
   if(!event.shiftKey && document.activeElement===last) {event.preventDefault();first?.focus();}
  }
  function contain(event:FocusEvent) {if(element && event.target instanceof Node && !element.contains(event.target)) focusable()[0]?.focus();}
  document.addEventListener("keydown",keyboard);document.addEventListener("focusin",contain);
  return()=>{document.removeEventListener("keydown",keyboard);document.removeEventListener("focusin",contain);if(previous instanceof HTMLElement)previous.focus();};
 },[drawer]);
 const snapshot=load?.ok?load.current:null,score=snapshot?.scorecard;
 const rate=(value:ImprovementSchemas.ImprovementRate|undefined)=>value?.state==="ready"?<><span>{format(value.numerator)} / {format(value.denominator)} · {new Intl.NumberFormat(locale,{style:"percent",maximumFractionDigits:1}).format(value.value??0)}</span>{value.smallSample&&<small className="mt-1 block text-neutral-600">{copy.small}</small>}</>:<span>{value?copy[value.state==="empty"?"zero":value.state]:copy.unavailable}</span>;
 async function investigate(event:FormEvent) {
  event.preventDefault();setDetailError(false);
  if(reason.trim().length<8) {setDetailError(true);return;}
  setBusy(true);const request=++detailRequest.current;
  try {
   const result=await openInvestigation({period,reason});
   if(request!==detailRequest.current)return;
   if(result.ok)setDetail(result);else {setDetail(null);setDetailError(true);}
  } catch {if(request===detailRequest.current){setDetail(null);setDetailError(true);}}
  finally {if(request===detailRequest.current)setBusy(false);}
 }
 const comparison=load?.ok?load.previous:null;
 const canCompare=snapshot?.state==="ready" && comparison?.state==="ready" && snapshot.inventoryAvailable && comparison.inventoryAvailable;
 return <div className="space-y-7">
  <header className="space-y-3"><h1 className="text-3xl font-semibold tracking-tight">{copy.title}</h1><p className="max-w-3xl text-sm text-neutral-600">{copy.scope}</p></header>
  <div className="flex flex-wrap items-end justify-between gap-4 border-b pb-5">
   <label className="grid gap-2 text-sm">{copy.period}<select value={period} onChange={event=>setPeriod(event.target.value as ImprovementSchemas.ImprovementPeriod)} className="min-h-11 rounded border bg-white px-3"><option value="completed_week">{copy.week}</option><option value="today">{copy.today}</option></select></label>
   <nav aria-label={copy.title} className="flex flex-wrap gap-2">{(["overview","journeys","reliability"] as const).map(item=><button key={item} type="button" aria-current={tab===item?"page":undefined} onClick={()=>setTab(item)} className={`min-h-11 border-b-2 px-3 text-sm ${tab===item?"border-neutral-950 font-semibold":"border-transparent text-neutral-600"}`}>{copy[item]}</button>)}</nav>
  </div>
  {!load?<p role="status">{copy.loading}</p>:!load.ok?<div role="alert"><p>{copy[load.error]}</p><button className="mt-3 min-h-11 underline" onClick={()=>setRefresh(value=>value+1)}>{copy.retry}</button></div>:<>
   <section className="flex flex-wrap items-start justify-between gap-4"><div><p role="status">{load.current.period==="today"?copy.todayWithheld:copy[load.current.state]}</p><p className="mt-2 text-sm text-neutral-600">{date(load.current.windowFrom)} – {date(load.current.windowTo)}</p></div><button onClick={()=>setDrawer(true)} className="min-h-11 rounded border px-4 text-sm font-medium">{copy.evidence}</button></section>
   {score?.disclosure?.suppressedMetrics.length? <p className="text-sm text-neutral-600">{copy.suppressed}</p>:null}
   {score&&tab==="overview"&&<>
    <section className="border-y py-6"><h2 className="text-sm text-neutral-600">{copy.contacts}</h2><p className="mt-2 text-5xl font-semibold tabular-nums">{format(score.contacts.perActiveListing)}</p>{!snapshot?.inventoryAvailable&&<p className="mt-3 max-w-2xl text-sm text-neutral-600">{copy.inventoryUnavailable}</p>}
     <dl className="mt-6 grid grid-cols-2 gap-5 md:grid-cols-5">{[[copy.calls,score.contacts.calls],[copy.conversations,score.contacts.conversations],[copy.firstMessages,score.firstBuyerMessages],[copy.inventory,score.inventory.averageActive],[copy.current,score.inventory.currentActive]].map(([label,value])=><div key={String(label)}><dt className="text-sm text-neutral-600">{label}</dt><dd className="mt-1 text-2xl tabular-nums">{format(value as number|null)}</dd></div>)}</dl>
    </section>
    <dl className="divide-y">{[[copy.publication,score.publication],[copy.replies,score.replies],[copy.upload,score.upload],[copy.signin,score.signIn]].map(([label,value])=><div key={String(label)} className="grid gap-2 py-4 md:grid-cols-2"><dt>{label as string}</dt><dd className="tabular-nums">{rate(value as ImprovementSchemas.ImprovementRate)}</dd></div>)}</dl>
    {period==="completed_week"&&<section className="border-t pt-5"><h2 className="font-medium">{copy.comparison}</h2><p className="mt-2 text-sm text-neutral-600">{canCompare?format(comparison?.scorecard?.contacts.perActiveListing):copy.withheld}</p></section>}
   </>}
   {score&&tab==="journeys"&&<div className="space-y-7">
    <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th className="py-3">{copy.step}</th><th>{copy.opened}</th><th>{copy.completed}</th></tr></thead><tbody>{score.steps.map(step=><tr key={step.step} className="border-t"><th className="py-3 font-normal">{copy[step.step]}</th><td>{format(step.opened)}</td><td>{format(step.completed)}</td></tr>)}</tbody></table></div>
    <dl className="grid gap-4 sm:grid-cols-3">{[[copy.discovery,score.discovery.opens],[copy.search,score.discovery.searches],[copy.detail,score.discovery.detailOpens]].map(([label,value])=><div key={String(label)}><dt>{label}</dt><dd className="text-2xl">{format(value as number)}</dd></div>)}</dl><div>{copy.zeroSearch} · {rate(score.zeroSearches)}</div>
    {(["accounts","guests"] as const).map(kind=><section key={kind}><h2 className="mb-3 font-medium">{kind==="accounts"?copy.accountReturns:copy.guestReturns}</h2><dl className="grid gap-5 sm:grid-cols-3">{(["d1","d7","d30"] as const).map(day=><div key={day}><dt>{day.toUpperCase()}</dt><dd className="mt-1">{rate(score.retention[kind][day])}</dd></div>)}</dl></section>)}
   </div>}
   {tab==="reliability"&&<div className="space-y-7"><section><h2 className="font-medium">{copy.freshness}</h2><p className="mt-2">{snapshot?.completeThrough?date(snapshot.completeThrough):copy.unavailable}</p><p className="mt-2">{copy.late} · {format(snapshot?.lateRecords)}</p></section>{score&&<dl className="divide-y">{[[copy.signin,score.signIn],[copy.upload,score.upload]].map(([label,value])=><div className="grid gap-2 py-4 md:grid-cols-2" key={String(label)}><dt>{label as string}</dt><dd>{rate(value as ImprovementSchemas.ImprovementRate)}</dd></div>)}</dl>}<ImprovementFixes locale={locale}/><MarketResearchPanel canInvestigate={canInvestigate}/></div>}
  </>}
  {drawer&&<div className="fixed inset-0 z-50"><button aria-label={copy.close} tabIndex={-1} className="absolute inset-0 bg-black/30" onClick={()=>setDrawer(false)}/><aside ref={panel} role="dialog" aria-modal="true" aria-labelledby="evidence-title" className="absolute inset-y-0 right-0 w-full max-w-xl overflow-y-auto bg-white p-6 shadow-xl"><div className="flex items-start justify-between gap-4"><h2 id="evidence-title" className="text-xl font-semibold">{copy.evidence}</h2><button className="min-h-11 underline" onClick={()=>setDrawer(false)}>{copy.close}</button></div><p className="mt-5 text-sm">{copy[period==="today"?"today":"week"]}</p><p className="mt-2 text-sm text-neutral-600">{copy.scope}</p>{canInvestigate&&<form onSubmit={investigate} className="mt-7 space-y-3"><label className="grid gap-2 text-sm">{copy.reason}<textarea minLength={8} maxLength={500} required value={reason} onChange={event=>setReason(event.target.value)} className="min-h-24 rounded border p-3"/></label><button disabled={busy} className="min-h-11 rounded bg-neutral-950 px-4 text-sm text-white disabled:opacity-50">{busy?copy.loading:copy.investigate}</button></form>}{detailError&&<p role="alert" className="mt-4">{reason.trim().length<8?copy.reasonRequired:copy.auditError}</p>}{detail&&<section className="mt-7 space-y-4"><h3 className="font-medium">{copy.timeline}</h3><p className="text-sm">{copy.expires} · {date(detail.receipt.expiresAt)}</p><a href={`/improvement/artifacts/${detail.receipt.id}/export?locale=${locale}`} className="inline-block min-h-11 underline">{copy.export}</a><ol className="divide-y">{detail.timeline.events.map((event,index)=><li key={index} className="space-y-1 py-3 text-sm"><p>{date(event.at)}</p><p><span>{event.subject}</span> · <code>{event.eventName}</code></p><p>{event.platform} · {event.release}</p></li>)}</ol></section>}</aside></div>}
 </div>;
}
