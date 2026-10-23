"use client";
import { useState } from "react";


import { businessAdminCopy } from "./copy";
import { prepareBusinessInvitation, type BusinessAdmissionResult } from "./actions";

import { useAdminLocale } from "@/lib/i18n";
export function BusinessAdmissionForm({ canAdmit, canRecover }: { canAdmit: boolean; canRecover: boolean }) {
 const { locale } = useAdminLocale();
 const c = businessAdminCopy[locale]; const [result, setResult] = useState<BusinessAdmissionResult | null>(null); const [pending, setPending] = useState(false);
 const inputClass = "mt-1 min-h-11 w-full rounded-md border border-neutral-300 bg-white px-3 text-neutral-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 disabled:opacity-50";
 async function submit(form: FormData) { setPending(true); setResult(null); try { setResult(await prepareBusinessInvitation(form)); } catch { setResult({ ok: false, error: "error" }); } finally { setPending(false); } }
 const field = (name: string, label: string, maxLength = 120) => <label className="block text-sm font-medium">{label}<input name={name} required maxLength={maxLength} disabled={pending} className={inputClass} /></label>;
 function form(recovery: boolean) {
  return <form action={submit} className="space-y-4 border-t border-neutral-200 pt-6"><h2 className="text-xl font-semibold">{recovery ? c.recovery : c.admission}</h2><input type="hidden" name="operation" value={recovery ? "recovery" : "admission"} />
   {recovery ? field("businessId", c.businessId, 36) : <>{field("name", c.name)}{field("slug", c.slug, 80)}<label className="block text-sm font-medium">{c.mode}<select name="mode" className={inputClass} disabled={pending} defaultValue="synthetic"><option value="synthetic">{c.synthetic}</option><option value="checked">{c.checked}</option></select></label><p className="text-sm text-neutral-600">{c.caution}</p></>}
   {field("ownerUserId", c.ownerUserId, 36)}<label className="block text-sm font-medium">{c.evidence}<textarea name="evidence" required minLength={3} maxLength={2000} disabled={pending} rows={3} className={`${inputClass} py-2`} /></label>{field("reason", c.reason, 1000)}
   <button type="submit" disabled={pending} className="min-h-11 rounded-md bg-red-600 px-4 py-2 font-medium text-white hover:bg-red-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 disabled:opacity-50">{pending ? c.working : recovery ? c.recover : c.admit}</button>
  </form>;
 }
 return <div className="space-y-8">{result ? result.ok ? <section aria-live="polite" className="space-y-3 rounded-md border border-neutral-300 p-5"><p>{c.receipt}</p><p>{c.bind}</p><p>{c.ready}: <code>{result.receipt.businessId}</code></p><p>{c.code}</p><code className="block break-all select-all rounded bg-neutral-100 p-3 text-sm">{result.receipt.token}</code><p>{c.expiry}: {new Date(result.receipt.expiresAt).toLocaleString(locale, { timeZone: "UTC" })} UTC</p></section> : <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-4 text-red-900">{c[result.error]}</p> : <p className="text-sm text-neutral-600">{c.empty}</p>}{canAdmit ? form(false) : null}{canRecover ? form(true) : null}</div>;
}

export function BusinessAdmissionPanel({ canAdmit, canRecover }: { canAdmit: boolean; canRecover: boolean }) {
 const { locale } = useAdminLocale(); const c = businessAdminCopy[locale];
 return <><h1 className="text-3xl font-semibold">{c.title}</h1><p className="max-w-prose text-neutral-600">{c.intro}</p>{!canAdmit && !canRecover ? <p role="alert">{c.permission}</p> : <BusinessAdmissionForm canAdmit={canAdmit} canRecover={canRecover}/>}</>;
}
