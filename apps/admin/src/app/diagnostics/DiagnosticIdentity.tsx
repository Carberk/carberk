"use client";
import { useEffect, useRef, useState } from "react";
import { DiagnosticSchemas as D } from "@auto-tm/contracts";

import * as actions from "./actions";
import { continuityCopy } from "./continuity-copy";
import { continuityButton as button, continuityField as field, continuityPrimary as primary, ContinuityMaterial, IdentityEvidenceDetails, VisitFacts } from "./ContinuityMaterial";
import { diagnosticCopy } from "./copy";

import { useAdminLocale } from "@/lib/i18n";

type Identifier = D.DiagnosticIdentityEvidenceCapture["identifiers"][number];
const emptyIdentifier = (): Identifier => ({ kind: "vin_stamp", location: "", value: "", provenanceIds: [] });
export function DiagnosticIdentity({ context, denied, onDirty, onLock, onRecorded }: { context: D.DiagnosticWorkspace; denied(): void; onDirty(value: boolean): void; onLock(value: boolean): void; onRecorded(): void }) {
 const { locale } = useAdminLocale(), c = continuityCopy[locale], base = diagnosticCopy[locale], order = context.order;
 const [records, setRecords] = useState<D.DiagnosticIdentityRecord[]>([]), [evidence, setEvidence] = useState<D.DiagnosticIdentityEvidence[]>([]), [loaded, setLoaded] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(false), [blocked, setBlocked] = useState(false), [invalid, setInvalid] = useState(false), [saved, setSaved] = useState(false);
 const [parent, setParent] = useState<D.DiagnosticIdentityEvidence | null>(null), [explanation, setExplanation] = useState(""), [identifiers, setIdentifiers] = useState<Identifier[]>([emptyIdentifier()]);
 const [purpose, setPurpose] = useState(""), [basis, setBasis] = useState(""), [provenance, setProvenance] = useState(""), [identifiability, setIdentifiability] = useState<"personal" | "pseudonymous">("personal"), [until, setUntil] = useState(""), [scheduleReason, setScheduleReason] = useState(""), [restrictions, setRestrictions] = useState("");
 const [file, setFile] = useState<File | null>(null), [verified, setVerified] = useState<{ id: string }[]>([]), [uncertain, setUncertain] = useState(false);
 const stageIntent = useRef<{ file: File; input: D.DiagnosticIdentityProvenanceStage } | null>(null), captureIntent = useRef<D.DiagnosticIdentityEvidenceCapture | null>(null), alive = useRef(true), fence = useRef(false), form = useRef<HTMLFormElement>(null), heading = useRef<HTMLHeadingElement>(null), picker = useRef<HTMLInputElement>(null);
 const dirty = !!file || !!purpose || !!basis || !!provenance || !!explanation || identifiers.some(item => !!item.location || !!item.value || !!item.provenanceIds.length) || !!verified.length;
 useEffect(() => { onDirty(dirty || uncertain); }, [dirty, uncertain, onDirty]);
 useEffect(() => { onLock(busy || uncertain); }, [busy, uncertain, onLock]);
 useEffect(() => { alive.current = true; return () => { alive.current = false; stageIntent.current = null; captureIntent.current = null; }; }, []);
 const rights = { category: "vehicle_observation" as const, purpose, basis, provenance, identifiability, use: ["service"] as ["service"], schedule: { kind: "until" as const, until: until ? `${until}:00.000Z` : "", reason: scheduleReason }, supplierRestrictions: restrictions, hold: null };
 const rightsValid = D.DiagnosticIdentityRightsSchema.safeParse(rights).success;
 const currentRaw = records.filter(record => order.observedVehicle && record.observation.observedAt === order.observedVehicle.observedAt && record.observation.mileageKm === order.observedVehicle.mileageKm && record.observation.method === order.observedVehicle.method && record.observation.vin === order.observedVehicle.vin && record.observation.manualReference === order.observedVehicle.manualReference).sort((a, b) => b.orderVersion - a.orderVersion)[0];
 const support = [...new Map([...evidence.flatMap(record => record.provenance.map(item => ({ ...item, state: "verified" as const }))), ...verified].map(item => [item.id, item])).values()];
 const used = new Set(evidence.flatMap(record => record.provenance.map(item => item.id)));
 const hasUnused = identifiers.some(item => item.provenanceIds.some(id => verified.some(image => image.id === id) && !used.has(id)));
 const usableParent = !parent || !evidence.some(record => record.correction?.supersedesId === parent.id);
 async function run<T>(work: () => Promise<actions.DiagnosticResult<T>>): Promise<T | undefined> {
  if (fence.current || !alive.current) return; fence.current = true; setBusy(true); setError(false); setSaved(false);
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
  if (!file || blocked) return;
  if (!stageIntent.current) {
   const input = D.DiagnosticIdentityProvenanceStageSchema.safeParse({ id: crypto.randomUUID(), expectedOrderVersion: order.version, contentType: file.type, sizeBytes: file.size, rights });
   if (!input.success) { setInvalid(true); return; } stageIntent.current = { file, input: input.data };
  }
  const intent = stageIntent.current; setUncertain(true);
  const result = await run(async () => {
   const staged = await actions.diagnosticStageIdentityProvenance(order.id, intent.input); if (!staged.ok) return staged;
   if(!alive.current)throw new Error("Workspace closed");
   // Only the classified, accepted intent is allowed to release selected bytes.
   if (staged.data.state === "verified") return { ok: true as const, data: { id: staged.data.id } };
   const response = await fetch(`/diagnostics/orders/${order.id}/identity-provenance/${intent.input.id}?expectedOrderVersion=${intent.input.expectedOrderVersion}`, { method: "PUT", headers: { "Content-Type": "application/octet-stream", "X-Evidence-Type": intent.input.contentType }, body: intent.file, cache: "no-store", redirect: "error", credentials: "same-origin" });
   if (!response.ok) return { ok: false as const, error: response.status === 401 || response.status === 403 ? "denied" as const : response.status === 409 ? "conflict" as const : "error" as const, code: "PROTECTED_FILE_UNAVAILABLE" };
   return { ok: true as const, data: D.DiagnosticIdentityProvenanceSchema.parse(await response.json()) };
  });
  if (result) { setVerified(previous => [...previous.filter(item => item.id !== result.id), result]); stageIntent.current = null; setFile(null); if (picker.current) picker.current.value = ""; setUncertain(false); }
 }
 async function capture() {
  if (!captureIntent.current) {
   const input = D.DiagnosticIdentityEvidenceCaptureSchema.safeParse({ id: crypto.randomUUID(), expectedOrderVersion: order.version, identityRecordId: currentRaw?.id, identifiers, rights, correction: parent ? { supersedesId: parent.id, explanation } : null });
   if (!input.success || !usableParent || (parent && !hasUnused)) { setInvalid(true); form.current?.querySelector<HTMLElement>(":invalid")?.focus(); return; }
   captureIntent.current = input.data;
  }
  const command=captureIntent.current; if(!command)return;
  setUncertain(true); const result = await run(() => actions.diagnosticAppendIdentityEvidence(order.id, command));
  if (result) { setEvidence(previous => [...previous.filter(item => item.id !== result.id), result]); captureIntent.current = null; setUncertain(false); setSaved(true); setIdentifiers([emptyIdentifier()]); setVerified([]); setParent(null); setExplanation(""); setPurpose(""); setBasis(""); setProvenance(""); setUntil(""); setScheduleReason(""); setRestrictions(""); heading.current?.focus(); onRecorded(); }
 }
 const locked = busy || blocked || uncertain;
 function update(index: number, change: Partial<Identifier>) { setIdentifiers(previous => previous.map((item, at) => at === index ? { ...item, ...change } : item)); setInvalid(false); }
 return <section className="space-y-4 rounded-lg border border-border p-4 font-sans md:p-6"><h2 ref={heading} tabIndex={-1} className="text-lg font-medium">{c.identity}</h2><p>{c.noForms}</p><button className={button} disabled={busy || dirty || uncertain} onClick={() => void load()}>{c.loadIdentity}</button>{busy && <p role="status">{base.loading}</p>}{error && <p role="alert">{c.unavailable}</p>}{saved && <p role="status">{base.saved}</p>}{blocked && <p role="alert">{base.refresh}</p>}
 {loaded && <><ol className="space-y-4">{records.map(record => <li className="min-h-14 space-y-2 border-b border-border py-3" key={record.id}><h3>{c.raw} · {record.orderVersion}</h3><VisitFacts observation={record.observation} c={base} locale={locale}/><details><summary className="min-h-11">{base.currentActor}</summary><p className="break-all">{record.id} · {record.observationHash} · {record.recordedAt} · {record.recordedBy ?? c.unavailable}</p></details></li>)}</ol><ol>{evidence.map(record => { const superseded = evidence.some(item => item.correction?.supersedesId === record.id); return <li key={record.id} className="min-h-14 space-y-3 border-b border-border py-3"><p>{superseded ? c.superseded : c.currentLeaf}</p><IdentityEvidenceDetails record={record} c={c} base={base}/>{context.capabilities.includes("diagnostics.technician") && !superseded && <button className={button} disabled={locked || dirty} onClick={() => { setParent(record); setIdentifiers([emptyIdentifier()]); heading.current?.focus(); }}>{c.correction}</button>}</li>; })}</ol>
 {context.capabilities.includes("diagnostics.technician") && (parent || !evidence.some(record=>record.identityRecordId===currentRaw?.id)) && <form ref={form} className="space-y-6" onSubmit={e => { e.preventDefault(); void capture(); }}>
 <h3 className="font-semibold">{parent ? c.correction : c.capture}</h3>{!currentRaw ? <p role="alert">{c.unavailable} · {c.raw}</p> : <div className="space-y-2 border border-border p-4"><h4>{c.raw}</h4><VisitFacts observation={currentRaw.observation} c={base} locale={locale}/><p className="break-all font-mono">{currentRaw.id}</p></div>}
 {parent && <div className="space-y-3"><IdentityEvidenceDetails record={parent} c={c} base={base}/><p>{c.unused}</p><label className="block">{base.explanation} · {c.required}<textarea className={field} required aria-required="true" maxLength={1000} disabled={locked} value={explanation} onChange={e => setExplanation(e.target.value)}/></label></div>}
 <fieldset disabled={locked} className="space-y-4"><legend className="font-semibold">{c.rights}</legend><p>{c.fixedRights}</p>{([{ label: c.purpose, value: purpose, set: setPurpose, max: 300 }, { label: c.basis, value: basis, set: setBasis, max: 500 }, { label: c.provenance, value: provenance, set: setProvenance, max: 1000 }, { label: c.scheduleReason, value: scheduleReason, set: setScheduleReason, max: 500 }] as const).map(item => <label key={item.label} className="block">{item.label} · {c.required}<textarea className={field} required aria-required="true" maxLength={item.max} value={item.value} onChange={e => item.set(e.target.value)}/></label>)}<label className="block">{c.identifiability} · {c.required}<select className={field} required aria-required="true" value={identifiability} onChange={e => setIdentifiability(e.target.value as typeof identifiability)}><option value="personal">{c.personal}</option><option value="pseudonymous">{c.pseudonymous}</option></select></label><label className="block">{c.until} · {c.required}<input type="datetime-local" className={field} required aria-required="true" value={until} onChange={e => setUntil(e.target.value)}/></label><label className="block">{c.restrictions}<textarea className={field} maxLength={1000} value={restrictions} onChange={e => setRestrictions(e.target.value)}/></label></fieldset>
 <label className="block">{c.file}<input ref={picker} className={field} type="file" accept="image/jpeg,image/png,image/webp" disabled={locked} onChange={e => { const next = e.target.files?.[0]; if (!next) { setFile(null); return; } if (!["image/jpeg", "image/png", "image/webp"].includes(next.type) || next.size <= 0 || next.size > 10 * 1024 * 1024) { setInvalid(true); e.target.value = ""; return; } setFile(next); }}/></label><button type="button" className={button} disabled={busy || blocked || !!captureIntent.current || !file || !rightsValid || !currentRaw} onClick={() => void upload()}>{uncertain ? base.retry : c.stage}</button>
 <ul>{support.map((image, index) => <li className="min-h-14" key={image.id}><ContinuityMaterial src={`/diagnostics/orders/${order.id}/identity-provenance/${image.id}`} caption={`${c.verified} ${index + 1}`} c={c} denied={denied}/></li>)}</ul>
 <fieldset disabled={locked} className="space-y-4"><legend>{c.identifier} · {identifiers.length}/20</legend>{identifiers.map((item, index) => <fieldset key={index} className="space-y-3 border border-border p-4"><legend>{c.identifier} {index + 1}</legend><label className="block">{c.kind} · {c.required}<select className={field} aria-required="true" required value={item.kind} onChange={e => update(index, { kind: e.target.value as Identifier["kind"] })}>{(["vin_stamp", "chassis_stamp", "manufacturer_plate"] as const).map(kind => <option key={kind} value={kind}>{c[kind]}</option>)}</select></label><label className="block">{c.location} · {c.required}<input className={field} required aria-required="true" maxLength={300} value={item.location} onChange={e => update(index, { location: e.target.value })}/></label><label className="block">{c.value} · {c.required}<input className={field} required aria-required="true" maxLength={500} value={item.value} onChange={e => update(index, { value: e.target.value })}/></label><fieldset><legend>{c.support} · {item.provenanceIds.length}/20 · {c.required}</legend>{support.map((image, at) => <label className="flex min-h-12 items-center gap-3" key={image.id}><input type="checkbox" checked={item.provenanceIds.includes(image.id)} disabled={item.provenanceIds.length >= 20 && !item.provenanceIds.includes(image.id)} onChange={e => update(index, { provenanceIds: e.target.checked ? [...item.provenanceIds, image.id] : item.provenanceIds.filter(id => id !== image.id) })}/>{c.verified} {at + 1}</label>)}</fieldset><button className={button} type="button" disabled={identifiers.length === 1} onClick={() => { setIdentifiers(previous => previous.filter((_, at) => at !== index)); heading.current?.focus(); }}>{c.remove}</button></fieldset>)}<button className={button} type="button" disabled={identifiers.length >= 20} onClick={() => setIdentifiers(previous => [...previous, emptyIdentifier()])}>{c.add}</button></fieldset>
 {invalid && <p role="alert">{c.invalidFields}</p>}{uncertain && <p role="alert">{c.uncertain}</p>}<button type="submit" className={primary} disabled={busy || blocked || !currentRaw || !usableParent || !rightsValid || (uncertain && !captureIntent.current) || (!!parent && (!hasUnused || !explanation.trim()))}>{captureIntent.current ? base.retry : c.capture}</button>
 </form>}</>}
 </section>;
}
