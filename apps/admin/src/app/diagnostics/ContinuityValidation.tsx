"use client";
import { useId, useState } from "react";

type Check = { key: string; label: string; error: string | null };
/** Field state and error navigation shared by the capture, intake and decision forms. */
export function useContinuityValidation(checks: Check[]) {
 const prefix=useId(), [touched,setTouched]=useState<string[]>([]), [submitted,setSubmitted]=useState(false);
 const id=(key:string)=>`${prefix}-${key}`;
 const visible=(key:string)=>checks.find(check=>check.key===key)?.error && (submitted||touched.includes(key));
 return {
  valid:checks.every(check=>!check.error),
  props:(key:string,label?:string)=>({"aria-label":label,id:id(key),onBlur:()=>setTouched(previous=>[...new Set([...previous,key])]),"aria-invalid":visible(key)?true:undefined,"aria-describedby":`${id(key)}-help${visible(key)?` ${id(key)}-error`:""}`}),
  feedback:(key:string,help?:string)=> <><span id={`${id(key)}-help`} className="mt-1 block text-sm text-text-secondary">{help}</span>{visible(key)&&<span id={`${id(key)}-error`} className="block text-sm">{checks.find(check=>check.key===key)?.error}</span>}</>,
  validate:()=>{setSubmitted(true);const first=checks.find(check=>check.error);if(first)document.getElementById(id(first.key))?.focus();return !first;},
  reset:()=>{setTouched([]);setSubmitted(false);},
  summary:(label:string)=>submitted&&checks.some(check=>check.error)?<section role="region" aria-label={label} tabIndex={-1} className="space-y-2 border border-border p-4"><p>{label}</p><ol className="list-inside list-decimal">{checks.filter(check=>check.error).map(check=><li key={check.key}><a className="inline-flex min-h-11 items-center underline" href={`#${id(check.key)}`} onClick={event=>{event.preventDefault();document.getElementById(id(check.key))?.focus();}}>{check.label}: {check.error}</a></li>)}</ol></section>:null,
 };
}
