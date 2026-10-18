"use client";
import { useEffect,useRef,useState,type FormEvent } from "react";
import type { ImprovementSchemas } from "@auto-tm/contracts";

import { exportMarketResearch,loadMarketResearch } from "./actions";
import { improvementCopy } from "./copy";

import { useAdminLocale } from "@/lib/i18n";
type Load=Awaited<ReturnType<typeof loadMarketResearch>>;
type Receipt={id:string;expiresAt:string};
export function MarketResearchPanel({canInvestigate}:{canInvestigate:boolean}) {
 const {locale}=useAdminLocale(),copy=improvementCopy[locale];
 const [load,setLoad]=useState<Load|null>(null),[refresh,setRefresh]=useState(0),[reason,setReason]=useState("");
 const [receipts,setReceipts]=useState<Record<string,Receipt>>({}),[busy,setBusy]=useState<string|null>(null),[failed,setFailed]=useState(false);
 const request=useRef(0);
 useEffect(()=>{
  let alive=true;setLoad(null);setReceipts({});setBusy(null);request.current++;
  void loadMarketResearch().then(result=>{if(alive)setLoad(result);}).catch(()=>{if(alive)setLoad({ok:false,error:"error"});});
  return()=>{alive=false;};
 },[refresh]);
 useEffect(()=>{
  const timer=setInterval(()=>{setRefresh(value=>value+1);},60_000);
  const focus=()=>setRefresh(value=>value+1);
  window.addEventListener("focus",focus);
  return()=>{clearInterval(timer);window.removeEventListener("focus",focus);};
 },[]);
 async function prepare(event:FormEvent,id:string) {
  event.preventDefault();setFailed(false);
  if(reason.trim().length<8){setFailed(true);return;}
  const sequence=++request.current;setBusy(id);
  try {
   const result=await exportMarketResearch(id,reason);
   if(sequence!==request.current)return;
   if(result.ok)setReceipts(value=>({...value,[id]:result.receipt}));
   else {setReceipts({});setFailed(true);if(result.error==="denied")setLoad(result);}
  } catch {if(sequence===request.current){setReceipts({});setFailed(true);}}
  finally {if(sequence===request.current)setBusy(null);}
 }
 const format=new Intl.NumberFormat(locale),date=new Intl.DateTimeFormat(locale,{year:"numeric",month:"short",day:"numeric",hour:"2-digit",minute:"2-digit",timeZone:"UTC"});
 const receiptLink=(receipt:Receipt|undefined)=>receipt?<p className="mt-4 text-sm"><a className="min-h-11 underline" href={`/improvement/research-artifacts/${receipt.id}/export?locale=${locale}`}>{copy.export}</a><span className="ml-3">{copy.expires} · {date.format(new Date(receipt.expiresAt))} UTC</span></p>:null;
 const cellValue=(value:string)=>value==="unknown"?copy.unknown:value;
 const rows=(dataset:Extract<ImprovementSchemas.MarketKnowledgeView,{state:"qualified"}>)=><div className="overflow-x-auto"><table className="mt-4 w-full text-left text-sm"><caption className="sr-only">{copy.research}</caption><thead><tr>{[copy.market,copy.month,copy.vehicleClass,copy.priceBand,copy.ageBand,copy.residence,copy.observations].map(label=><th className="px-2 py-3" key={label}>{label}</th>)}</tr></thead><tbody>{dataset.dataset.cells.map((cell,index)=><tr className="border-t" key={index}><td className="px-2 py-3">{cell.market}</td><td className="px-2">{new Intl.DateTimeFormat(locale,{year:"numeric",month:"long",timeZone:"UTC"}).format(new Date(`${cell.period}-01T00:00:00Z`))}</td><td className="px-2">{copy[cell.vehicleClass]}</td><td className="px-2">{copy[cell.priceBand]}</td><td className="px-2">{cellValue(cell.ageBand)}</td><td className="px-2">{cellValue(cell.residence)}</td><td className="px-2 tabular-nums">{format.format(cell.observations)}</td></tr>)}</tbody></table></div>;
 return <section className="space-y-4 border-t pt-5"><h2 className="font-medium">{copy.research}</h2><p className="text-sm text-neutral-600">{copy.noDisclosure}</p>
 {!load?<p>{copy.researchLoading}</p>:!load.ok?<div role="alert"><p>{load.error==="denied"?copy.denied:copy.researchError}</p><button className="min-h-11 underline" onClick={()=>setRefresh(value=>value+1)}>{copy.retry}</button></div>:!load.datasets.length?<p>{copy.researchUnavailable}</p>:load.datasets.map((dataset,index)=>dataset.state!=="qualified"?<p key={index}>{dataset.state==="unavailable"?copy.researchUnavailable:copy[dataset.state]}</p>:<article className="border-t pt-4" key={dataset.dataset.id}><h3>{copy.qualified}</h3>{rows(dataset)}{canInvestigate&&<form className="mt-5 space-y-3" onSubmit={event=>void prepare(event,dataset.dataset.id)}><label className="grid gap-2 text-sm">{copy.reason}<textarea value={reason} onChange={event=>setReason(event.target.value)} minLength={8} maxLength={500} required className="min-h-24 rounded border p-3"/></label><button disabled={busy!==null} className="min-h-11 rounded border px-4">{busy===dataset.dataset.id?copy.researchLoading:copy.prepareExport}</button></form>}{receiptLink(receipts[dataset.dataset.id])}</article>)}
 {failed&&<p role="alert">{reason.trim().length<8?copy.reasonRequired:copy.auditError}</p>}
 </section>;
}
