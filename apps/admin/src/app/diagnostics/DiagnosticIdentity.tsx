"use client";
import { useEffect, useId, useRef, useState } from "react";
import { DiagnosticSchemas as D } from "@auto-tm/contracts";

import * as actions from "./actions";
import { continuityCopy } from "./continuity-copy";
import { continuityButton as button, continuityField as field, continuityPrimary as primary, ContinuityMaterial, IdentityEvidenceDetails, VisitFacts } from "./ContinuityMaterial";
import { useContinuityValidation } from "./ContinuityValidation";
import { diagnosticCopy } from "./copy";

import { useAdminLocale } from "@/lib/i18n";

type Kind = D.DiagnosticIdentityEvidenceCapture["identifiers"][number]["kind"];
type Identifier = Omit<D.DiagnosticIdentityEvidenceCapture["identifiers"][number], "kind"> & { kind: Kind | "" };
const emptyIdentifier = (): Identifier => ({ kind: "", location: "", value: "", provenanceIds: [] });
/** One local blank declaration. Image and record declarations never copy or default each other. */
type Declaration = { purpose: string; basis: string; provenance: string; identifiability: "" | "personal" | "pseudonymous"; until: string; scheduleReason: string; restrictions: string };
const blankDeclaration = (): Declaration => ({ purpose: "", basis: "", provenance: "", identifiability: "", until: "", scheduleReason: "", restrictions: "" });
const transportRights = (value: Declaration) => ({ category: "vehicle_observation" as const, purpose: value.purpose, basis: value.basis, provenance: value.provenance, identifiability: value.identifiability, use: ["service"] as ["service"], schedule: { kind: "until" as const, until: value.until ? `${value.until}:00.000Z` : "", reason: value.scheduleReason }, supplierRestrictions: value.restrictions, hold: null });
const declarationText = [{ key: "purpose", max: 300 }, { key: "basis", max: 500 }, { key: "provenance", max: 1000 }, { key: "scheduleReason", max: 500 }] as const;
export function DiagnosticIdentity({ context, denied, onDirty, onLock, onRecorded, focusRecord }: { context: D.DiagnosticWorkspace; denied(): void; onDirty(value: boolean): void; onLock(value: boolean): void; onRecorded(id:string): void; focusRecord?: string | undefined }) {
 const { locale } = useAdminLocale(), c = continuityCopy[locale], base = diagnosticCopy[locale], order = context.order;
 const [activity,setActivity]=useState<"staging"|"uploading"|"recording"|null>(null);
 const [records, setRecords] = useState<D.DiagnosticIdentityRecord[]>([]), [evidence, setEvidence] = useState<D.DiagnosticIdentityEvidence[]>([]), [loaded, setLoaded] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(false), [blocked, setBlocked] = useState(false), [invalid, setInvalid] = useState(false), [saved, setSaved] = useState(false);
 const [prerequisite, setPrerequisite] = useState<D.DiagnosticIdentityEvidence | null>(null), [replacementReview, setReplacementReview] = useState(false), [fileError, setFileError] = useState(false), [parent, setParent] = useState<D.DiagnosticIdentityEvidence | null>(null), [explanation, setExplanation] = useState(""), [identifiers, setIdentifiers] = useState<Identifier[]>([emptyIdentifier()]);
 const [imageDeclaration, setImageDeclaration] = useState(blankDeclaration), [recordDeclaration, setRecordDeclaration] = useState(blankDeclaration);
 const [file, setFile] = useState<File | null>(null), [verified, setVerified] = useState<{ id: string }[]>([]), [uncertain, setUncertain] = useState(false);
 const stageIntent = useRef<{ file: File; input: D.DiagnosticIdentityProvenanceStage } | null>(null), captureIntent = useRef<D.DiagnosticIdentityEvidenceCapture | null>(null), alive = useRef(true), fence = useRef(false), section = useRef<HTMLElement>(null), form = useRef<HTMLFormElement>(null), heading = useRef<HTMLHeadingElement>(null), prerequisiteHeading = useRef<HTMLHeadingElement>(null), correctionHeading = useRef<HTMLHeadingElement>(null), reviewHeading = useRef<HTMLHeadingElement>(null), identifierRegion = useRef<HTMLFieldSetElement>(null), addButton = useRef<HTMLButtonElement>(null), focusIdentifier = useRef<number | null>(null), picker = useRef<HTMLInputElement>(null);
 const dirty = !!file || !!explanation || [imageDeclaration, recordDeclaration].some(item => Object.values(item).some(Boolean)) || identifiers.some(item => !!item.kind || !!item.location || !!item.value || !!item.provenanceIds.length) || !!verified.length;
 useEffect(() => { onDirty(dirty || uncertain); }, [dirty, uncertain, onDirty]);
 useEffect(() => { onLock(busy || uncertain); }, [busy, uncertain, onLock]);
 useEffect(() => { alive.current = true; return () => { alive.current = false; stageIntent.current = null; captureIntent.current = null; }; }, []);
 const imageRights = transportRights(imageDeclaration), recordRights = transportRights(recordDeclaration);
 const imageRightsValid = D.DiagnosticIdentityRightsSchema.safeParse(imageRights).success, rightsValid = D.DiagnosticIdentityRightsSchema.safeParse(recordRights).success;
 // The fresh restricted read returns unerased raw only; its highest orderVersion binds new writes.
 const currentRaw = records.reduce<D.DiagnosticIdentityRecord | undefined>((best, record) => !best || record.orderVersion > best.orderVersion ? record : best, undefined);
 const support = [...new Map([...evidence.flatMap(record => record.provenance.map(item => ({ ...item, state: "verified" as const }))), ...verified].map(item => [item.id, item])).values()];
 const used = new Set(evidence.flatMap(record => record.provenance.map(item => item.id)));
 const hasUnused = identifiers.some(item => item.provenanceIds.some(id => verified.some(image => image.id === id) && !used.has(id)));
 const usableParent = !parent || !evidence.some(record => record.correction?.supersedesId === parent.id);
 const textError=(value:string,max:number)=>!value.trim()||value.trim().length>max?c.fieldError:null;
 const declarationChecks=(prefix:string,legend:string,value:Declaration)=>[
  ...declarationText.map(item=>({key:`${prefix}-${item.key}`,label:`${legend}: ${c[item.key]}`,error:textError(value[item.key],item.max)})),
  {key:`${prefix}-identifiability`,label:`${legend}: ${c.identifiability}`,error:value.identifiability?null:c.fieldError},
  {key:`${prefix}-until`,label:`${legend}: ${c.until}`,error:!value.until||!Number.isFinite(Date.parse(`${value.until}:00.000Z`))?c.fieldError:null},
  {key:`${prefix}-restrictions`,label:`${legend}: ${c.restrictions}`,error:value.restrictions.length>1000?c.fieldError:null},
 ];
 const imageValidation=useContinuityValidation(declarationChecks("image",c.imageRights,imageDeclaration));
 const checks=[
  ...(parent?[{key:"explanation",label:base.explanation,error:textError(explanation,1000)}]:[]),
  ...declarationChecks("record",c.recordRights,recordDeclaration),
  {key:"identifiers",label:c.identifier,error:identifiers.length===0?c.fieldError:null},
  ...identifiers.flatMap((item,index)=>[
   {key:`kind-${index}`,label:`${c.identifier} ${index+1}: ${c.kind}`,error:item.kind?null:c.fieldError},
   {key:`location-${index}`,label:`${c.identifier} ${index+1}: ${c.location}`,error:identifiers.some((other,at)=>at!==index&&!!item.kind&&other.kind===item.kind&&other.location.trim()===item.location.trim())&&item.location.trim()?c.duplicate:textError(item.location,300)},
   {key:`value-${index}`,label:`${c.identifier} ${index+1}: ${c.value}`,error:textError(item.value,500)},
   {key:`support-${index}`,label:`${c.identifier} ${index+1}: ${c.support}`,error:!item.provenanceIds.length||item.provenanceIds.length>20?c.fieldError:null},
  ]),
 ];
 const validation=useContinuityValidation(checks);
 const captureReady=identifiers.length>0&&!!currentRaw&&usableParent&&rightsValid&&validation.valid&&(!parent||hasUnused);
 useEffect(()=>{prerequisiteHeading.current?.focus();},[prerequisite]);
 useEffect(()=>{if(parent)correctionHeading.current?.focus();},[parent]);
 useEffect(()=>{if(replacementReview)reviewHeading.current?.focus();},[replacementReview]);
 useEffect(()=>{if(focusIdentifier.current!==null){if(focusIdentifier.current<0)addButton.current?.focus();else identifierRegion.current?.querySelectorAll<HTMLHeadingElement>("h4")[focusIdentifier.current]?.focus();focusIdentifier.current=null;}},[identifiers.length]);
 async function run<T>(work: () => Promise<actions.DiagnosticResult<T>>, activity: "staging"|"recording"|null=null): Promise<T | undefined> {
  if (fence.current || !alive.current) return; fence.current = true; setBusy(true); setActivity(activity); setError(false); setSaved(false);
  try { const result = await work(); if (!alive.current) return; if (result.ok) return result.data;
   if (result.error === "denied") { alive.current = false; stageIntent.current = null; captureIntent.current = null; denied(); }
   else { setError(true); if (result.error === "conflict") { setBlocked(true); setVerified([]); stageIntent.current = null; captureIntent.current = null; setUncertain(false); } }
  } catch { if (alive.current) setError(true); }
  finally { fence.current = false; if (alive.current) setBusy(false); }
  return undefined;
 }
 async function load() {
  const result = await run(async () => { const raw = await actions.diagnosticIdentityRecords(order.id); if (!raw.ok) return raw; if(!alive.current)throw new Error("Workspace closed"); const structured = await actions.diagnosticIdentityEvidence(order.id); if (!structured.ok) return structured; return { ok: true as const, data: { raw: raw.data, structured: structured.data } }; });
  if (result) { setRecords(result.raw); setEvidence(result.structured); setLoaded(true); }
 }
 async function upload() {
  if (!file || blocked || busy || captureIntent.current || (!stageIntent.current && (!imageRightsValid || !currentRaw))) { imageValidation.validate(); return; }
  if (!stageIntent.current) {
   const input = D.DiagnosticIdentityProvenanceStageSchema.safeParse({ id: crypto.randomUUID(), expectedOrderVersion: order.version, contentType: file.type, sizeBytes: file.size, rights: imageRights });
   if (!input.success) { setInvalid(true); return; } stageIntent.current = { file, input: input.data };
  }
  const intent = stageIntent.current; setUncertain(true);
  const result = await run(async () => {
   const staged = await actions.diagnosticStageIdentityProvenance(order.id, intent.input); if (!staged.ok) return staged;
   if(!alive.current)throw new Error("Workspace closed");
   // Only the classified, accepted intent is allowed to release selected bytes.
   if (staged.data.state === "verified") return { ok: true as const, data: { id: staged.data.id } };
   setActivity("uploading");const response = await fetch(`/diagnostics/orders/${order.id}/identity-provenance/${intent.input.id}?expectedOrderVersion=${intent.input.expectedOrderVersion}`, { method: "PUT", headers: { "Content-Type": "application/octet-stream", "X-Evidence-Type": intent.input.contentType }, body: intent.file, cache: "no-store", redirect: "error", credentials: "same-origin" });
   if (!response.ok) return { ok: false as const, error: response.status === 401 || response.status === 403 ? "denied" as const : response.status === 409 ? "conflict" as const : "error" as const, code: "PROTECTED_FILE_UNAVAILABLE" };
   return { ok: true as const, data: D.DiagnosticIdentityProvenanceSchema.parse(await response.json()) };
  },"staging");
  if (result) { setVerified(previous => [...previous.filter(item => item.id !== result.id), result]); stageIntent.current = null; setFile(null); if (picker.current) picker.current.value = ""; setUncertain(false); }
 }
 async function capture() {
  if (busy || blocked || (uncertain && !captureIntent.current)) return;
  if (!captureIntent.current && (!validation.validate() || !captureReady)) return;
  if (!captureIntent.current && !replacementReview) { setReplacementReview(true); return; }
  if (!captureIntent.current) {
   const input = D.DiagnosticIdentityEvidenceCaptureSchema.safeParse({ id: crypto.randomUUID(), expectedOrderVersion: order.version, identityRecordId: currentRaw?.id, identifiers, rights: recordRights, correction: parent ? { supersedesId: parent.id, explanation } : null });
   if (!input.success || !usableParent || (parent && !hasUnused)) { setInvalid(true); form.current?.querySelector<HTMLElement>(":invalid")?.focus(); return; }
   captureIntent.current = input.data;
  }
  const command=captureIntent.current; if(!command)return;
  setUncertain(true); const result = await run(() => actions.diagnosticAppendIdentityEvidence(order.id, command),"recording");
  if (result) { setEvidence(previous => [...previous.filter(item => item.id !== result.id), result]); captureIntent.current = null; setUncertain(false); setReplacementReview(false); validation.reset(); setSaved(true); setIdentifiers([emptyIdentifier()]); setVerified([]); setParent(null); setExplanation(""); setImageDeclaration(blankDeclaration()); setRecordDeclaration(blankDeclaration()); imageValidation.reset(); heading.current?.focus(); onRecorded(result.id); }
 }
 useEffect(()=>{if(focusRecord)void load();},[]);
 useEffect(()=>{if(loaded&&focusRecord)section.current?.querySelector<HTMLElement>(`[data-record="${focusRecord}"]`)?.focus();},[loaded,focusRecord]);
 const locked = busy || blocked || uncertain, pickerId = useId();
 function declaration(prefix: "image" | "record", legend: string, help: string, value: Declaration, set: (next: Declaration) => void, checks: ReturnType<typeof useContinuityValidation>) {
  const change = (next: Partial<Declaration>) => { set({ ...value, ...next }); setReplacementReview(false); };
  return <fieldset disabled={locked} className="space-y-4"><legend className="font-semibold">{legend}</legend><p>{help}</p><p>{c.fixedRights}</p>
  {declarationText.map(item => <label key={item.key} className="block">{c[item.key]} · {c.required}<textarea {...checks.props(`${prefix}-${item.key}`,`${c[item.key]} · ${c.required}`)} className={field} required aria-required="true" maxLength={item.max} value={value[item.key]} onChange={e => change({ [item.key]: e.target.value })}/>{checks.feedback(`${prefix}-${item.key}`,`${value[item.key].length}/${item.max}`)}</label>)}
  <label className="block">{c.identifiability} · {c.required}<select {...checks.props(`${prefix}-identifiability`,`${c.identifiability} · ${c.required}`)} className={field} required aria-required="true" value={value.identifiability} onChange={e => change({ identifiability: e.target.value as Declaration["identifiability"] })}><option value="">{c.choose}</option><option value="personal">{c.personal}</option><option value="pseudonymous">{c.pseudonymous}</option></select>{checks.feedback(`${prefix}-identifiability`)}</label>
  <label className="block">{c.until} · {c.required}<input {...checks.props(`${prefix}-until`,`${c.until} · ${c.required}`)} type="datetime-local" className={field} required aria-required="true" value={value.until} onChange={e => change({ until: e.target.value })}/>{checks.feedback(`${prefix}-until`)}</label>
  <label className="block">{c.restrictions}<textarea {...checks.props(`${prefix}-restrictions`,c.restrictions)} className={field} maxLength={1000} value={value.restrictions} onChange={e => change({ restrictions: e.target.value })}/>{checks.feedback(`${prefix}-restrictions`,`${value.restrictions.length}/1000`)}</label></fieldset>;
 }
 function update(index: number, change: Partial<Identifier>) { setIdentifiers(previous => previous.map((item, at) => at === index ? { ...item, ...change } : item)); setInvalid(false); setReplacementReview(false); }
 return <section ref={section} className="space-y-4 rounded-lg border border-border p-4 font-sans md:p-6"><h2 ref={heading} tabIndex={-1} className="text-lg font-medium">{c.identity}</h2><p>{c.noForms}</p><button className={button} disabled={busy} aria-disabled={dirty||uncertain} onClick={() => {if(dirty||uncertain)return;void load();}}>{c.loadIdentity}</button>{busy && <p role="status">{activity?c[activity]:base.loading}</p>}{error && <p role="alert">{c.unavailable}</p>}{saved && <p role="status">{c.evidenceRecorded}</p>}{blocked && <p role="alert">{base.refresh}</p>}
 {loaded && <><ol className="space-y-4">{records.map(record => <li className="min-h-14 space-y-2 border-b border-border py-3" key={record.id}><h3>{c.raw} · {record.orderVersion}</h3><VisitFacts observation={record.observation} c={base} locale={locale}/><details><summary className="min-h-11">{base.currentActor}</summary><p className="break-all">{record.id} · {record.observationHash} · {record.recordedAt} · {record.recordedBy ?? c.unavailable}</p></details></li>)}</ol><ol>{evidence.map(record => { const superseded = evidence.some(item => item.correction?.supersedesId === record.id); return <li key={record.id} className="min-h-14 space-y-3 border-b border-border py-3"><h3 data-record={record.id} tabIndex={-1}>{record.correction?c.correction:c.root}</h3><p>{superseded ? c.superseded : c.successorUnknown}</p><IdentityEvidenceDetails record={record} c={c} base={base}/>{context.capabilities.includes("diagnostics.technician") && !superseded && <button className={button} disabled={busy} aria-disabled={locked||dirty} onClick={() => {if(locked||dirty)return;setPrerequisite(record);}}>{c.correction}</button>}</li>; })}</ol>
 {prerequisite && <section role="region" aria-label={c.prerequisites} className="space-y-3 border border-border p-4"><h3 ref={prerequisiteHeading} tabIndex={-1}>{c.prerequisites}</h3><h4>{c.parent}</h4><IdentityEvidenceDetails record={prerequisite} c={c} base={base}/><h4>{c.currentRaw}</h4>{currentRaw&&<VisitFacts observation={currentRaw.observation} c={base} locale={locale}/>}<dl><dt>{c.parent}</dt><dd>{evidence.some(item=>item.correction?.supersedesId===prerequisite.id)?c.superseded:c.notEstablished}</dd><dt>{c.currentRaw}</dt><dd>{currentRaw?c.available:c.notEstablished}</dd><dt>{c.recordRights}</dt><dd>{rightsValid?c.available:c.notEstablished}</dd><dt>{c.support}</dt><dd>{c.notEstablished}</dd></dl><p>{c.successorUnknown}</p><p>{c.unused}</p><button type="button" className={button} disabled={busy} aria-disabled={!currentRaw||evidence.some(item=>item.correction?.supersedesId===prerequisite.id)} onClick={()=>{if(!currentRaw||evidence.some(item=>item.correction?.supersedesId===prerequisite.id))return;setParent(prerequisite);setPrerequisite(null);setIdentifiers([emptyIdentifier()]);setReplacementReview(false);validation.reset();}}>{c.replacement}</button></section>}
 {context.capabilities.includes("diagnostics.technician") && (parent || !evidence.some(record=>record.identityRecordId===currentRaw?.id)) && <form noValidate onKeyDown={event=>{if(event.key==="Enter"&&(event.target instanceof HTMLInputElement||event.target instanceof HTMLSelectElement))event.preventDefault();}} onChange={()=>setReplacementReview(false)} ref={form} className="space-y-6" onSubmit={e => { e.preventDefault(); void capture(); }}>
 <h3 ref={correctionHeading} tabIndex={-1} className="font-semibold">{parent ? c.correction : c.capture}</h3>{validation.summary(c.invalidFields)}{!currentRaw ? <p role="alert">{c.unavailable} · {c.raw}</p> : <div className="space-y-2 border border-border p-4"><h4>{c.raw}</h4><VisitFacts observation={currentRaw.observation} c={base} locale={locale}/><p className="break-all font-mono">{currentRaw.id}</p></div>}
 {parent && <div className="space-y-3"><IdentityEvidenceDetails record={parent} c={c} base={base}/><p>{c.unused}</p><label className="block">{base.explanation} · {c.required}<textarea {...validation.props("explanation",`${base.explanation} · ${c.required}`)} className={field} required aria-required="true" maxLength={1000} disabled={locked} value={explanation} onChange={e => setExplanation(e.target.value)}/>{validation.feedback("explanation",`${explanation.length}/1000`)}</label></div>}
 {declaration("image",c.imageRights,c.imageRightsHelp,imageDeclaration,setImageDeclaration,imageValidation)}
 <label className="block">{c.file} · {c.optional}<input ref={picker} className={field} type="file" accept="image/jpeg,image/png,image/webp" disabled={locked || !imageRightsValid} aria-describedby={imageRightsValid ? undefined : `${pickerId}-rights`} onChange={e => { const next = e.target.files?.[0]; if (!next) { setFile(null); return; } if (!["image/jpeg", "image/png", "image/webp"].includes(next.type) || next.size <= 0 || next.size > 10 * 1024 * 1024) { setFileError(true); setFile(null); e.target.value = ""; return; } setFileError(false); setFile(next); }}/></label>{!imageRightsValid&&<p id={`${pickerId}-rights`}>{c.rightsRequired}</p>}{fileError&&<p role="alert">{c.fileError}</p>}<button type="button" className={button} disabled={busy} aria-disabled={blocked || !!captureIntent.current || !file || !imageRightsValid || !currentRaw} onClick={() => void upload()}>{stageIntent.current ? c.retryStage : c.stage}</button>
 <ul>{support.map((image, index) => <li className="min-h-14" key={image.id}><ContinuityMaterial src={`/diagnostics/orders/${order.id}/identity-provenance/${image.id}`} caption={`${c.verified} ${index + 1}`} c={c} denied={denied}/></li>)}</ul>
 <fieldset {...validation.props("identifiers")} tabIndex={-1} ref={identifierRegion} disabled={locked} className="space-y-4"><legend>{c.identifier} · {identifiers.length}/20</legend>{identifiers.map((item, index) => <fieldset key={index} className="space-y-3 border border-border p-4"><legend>{c.identifier} {index + 1}</legend><h4 tabIndex={-1}>{c.identifier} {index+1}</h4><label className="block">{c.kind} · {c.required}<select {...validation.props(`kind-${index}`,`${c.kind} · ${c.required}`)} className={field} aria-required="true" required value={item.kind} onChange={e => update(index, { kind: e.target.value as Identifier["kind"] })}><option value="">{c.choose}</option>{(["vin_stamp", "chassis_stamp", "manufacturer_plate"] as const).map(kind => <option key={kind} value={kind}>{c[kind]}</option>)}</select>{validation.feedback(`kind-${index}`)}</label><label className="block">{c.location} · {c.required}<input {...validation.props(`location-${index}`,`${c.location} · ${c.required}`)} className={field} required aria-required="true" maxLength={300} value={item.location} onChange={e => update(index, { location: e.target.value })}/>{validation.feedback(`location-${index}`,`${item.location.length}/300`)}</label><label className="block">{c.value} · {c.required}<input {...validation.props(`value-${index}`,`${c.value} · ${c.required}`)} className={field} required aria-required="true" maxLength={500} value={item.value} onChange={e => update(index, { value: e.target.value })}/>{validation.feedback(`value-${index}`,`${item.value.length}/500`)}</label><fieldset {...validation.props(`support-${index}`)} tabIndex={-1}><legend>{c.support} · {item.provenanceIds.length}/20 · {c.required}</legend>{support.map((image, at) => <label className="flex min-h-12 items-center gap-3" key={image.id}><input type="checkbox" aria-required="true" checked={item.provenanceIds.includes(image.id)} disabled={item.provenanceIds.length >= 20 && !item.provenanceIds.includes(image.id)} onChange={e => update(index, { provenanceIds: e.target.checked ? [...item.provenanceIds, image.id] : item.provenanceIds.filter(id => id !== image.id) })}/>{c.verified} {at + 1}</label>)}{validation.feedback(`support-${index}`)}</fieldset><button className={button} type="button" onClick={() => { focusIdentifier.current=index-1; setIdentifiers(previous => previous.filter((_, at) => at !== index)); validation.reset(); setReplacementReview(false); }}>{c.remove}</button></fieldset>)}<button ref={addButton} className={button} type="button" aria-disabled={identifiers.length >= 20} onClick={() => {if(identifiers.length>=20)return;focusIdentifier.current=identifiers.length;setIdentifiers(previous => [...previous, emptyIdentifier()]);}}>{c.add}</button><p>{c.limit}</p>{validation.feedback("identifiers")}</fieldset>
 {declaration("record",c.recordRights,c.recordRightsHelp,recordDeclaration,setRecordDeclaration,validation)}
 {invalid && <p role="alert">{c.invalidFields}</p>}{uncertain && <p role="alert">{c.uncertain}</p>}<button type="submit" className={primary} disabled={busy} aria-disabled={blocked || !captureReady || (uncertain&&!captureIntent.current)}>{captureIntent.current ? c.retryAppend : c.capture}</button>
 {replacementReview&&<section role="region" aria-label={c.reviewCorrection} className="space-y-3 border border-border p-4"><h3 ref={reviewHeading} tabIndex={-1}>{c.reviewCorrection}</h3>{parent&&<><h4>{c.parent}</h4><IdentityEvidenceDetails record={parent} c={c} base={base}/></>}<h4>{c.currentRaw}</h4>{currentRaw&&<VisitFacts observation={currentRaw.observation} c={base} locale={locale}/>}<dl>{identifiers.map((item,index)=><div key={index}><dt>{item.kind ? c[item.kind] : c.choose} · {item.location}</dt><dd>{item.value}</dd><dd>{item.provenanceIds.join(", ")}</dd></div>)}</dl><p className="whitespace-pre-wrap">{explanation}</p><h4>{c.recordRights}</h4><dl>{[[c.purpose,recordDeclaration.purpose],[c.basis,recordDeclaration.basis],[c.provenance,recordDeclaration.provenance],[c.identifiability,recordDeclaration.identifiability?c[recordDeclaration.identifiability]:c.choose],[c.until,recordDeclaration.until],[c.scheduleReason,recordDeclaration.scheduleReason],[c.restrictions,recordDeclaration.restrictions]].map(([label,value])=><div key={label}><dt>{label}</dt><dd className="whitespace-pre-wrap">{value}</dd></div>)}</dl><p>{c.fixedRights}</p><p>{c.unused}</p><button type="button" className={primary} disabled={busy} aria-disabled={!captureReady||blocked} onClick={()=>void capture()}>{c.reviewCorrection}</button><button type="button" className={button} disabled={busy} onClick={()=>{setReplacementReview(false);form.current?.querySelector<HTMLElement>("textarea")?.focus();}}>{base.back}</button></section>}
 </form>}</>}
 </section>;
}
