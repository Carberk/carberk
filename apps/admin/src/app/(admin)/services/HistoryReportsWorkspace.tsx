"use client";
import { useEffect, useRef, useState } from "react";
import type { ServiceMessagingSchemas as S } from "@auto-tm/contracts";

import { historyArtifactCommand, historyReports } from "./actions";
import { reportCopy } from "./reportCopy";

export function HistoryReportsWorkspace({ id, order, assignmentVersion, locale, denied, changed }: { id: string; order: NonNullable<S.HistorySnapshot["order"]>; assignmentVersion: number; locale: string; denied: () => void; changed: () => void }) {
 const c = reportCopy(locale), [data, setData] = useState<S.HistoryReports | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(false);
 const [provider, setProvider] = useState<"carfax" | "autocheck">("carfax"), [vin, setVin] = useState(""), [originalDate, setOriginalDate] = useState(""), [pages, setPages] = useState(""), [provenance, setProvenance] = useState(""), [supplier, setSupplier] = useState(""), [until, setUntil] = useState(""), [reuse, setReuse] = useState(false), [file, setFile] = useState<File | null>(null), [checked, setChecked] = useState<Record<string, boolean>>({}), [links, setLinks] = useState<Record<string, string>>({}), [linkChecks, setLinkChecks] = useState<Record<string, boolean>>({});
 const epoch = useRef(0), uploadRetry = useRef<{ fingerprint: string; id: string } | null>(null);
 async function refresh() { const version = ++epoch.current; const result = await historyReports(id); if (version !== epoch.current) return; if (result.ok) { setData(result.data); setError(false); } else { setError(true); setData(null); if (result.error === "permission" || result.error === "conflict") denied(); } }
 useEffect(() => { void refresh(); return () => { epoch.current++; }; }, [id, order.version, assignmentVersion]);
 async function command(value: S.HistoryArtifactCommand) { if (busy) return; const version = epoch.current; setBusy(true); const result = await historyArtifactCommand(id, value); if (version !== epoch.current) return; setBusy(false); if (!result.ok) { setError(true); if (result.error === "permission" || result.error === "conflict") { setData(null); denied(); } } else { await refresh(); changed(); } }
 async function upload() {
  if (!file || busy || file.type !== "application/pdf" || file.size <= 0 || file.size > 20*1024*1024) { setError(true); return; }
  const version = epoch.current; setBusy(true); setError(false);
  try {
   const bytes = await file.arrayBuffer(); const sha = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), value => value.toString(16).padStart(2,"0")).join("");
   if (version !== epoch.current) return;
   const fingerprint = JSON.stringify([sha, provider, vin, originalDate, pages, provenance, supplier, until, reuse]);
   if (uploadRetry.current?.fingerprint !== fingerprint) uploadRetry.current = { fingerprint, id: crypto.randomUUID() };
   const artifactId = uploadRetry.current.id;
   const result = await historyArtifactCommand(id, { kind: "stage", expectedAssignmentVersion: assignmentVersion, orderId: order.id, artifactId, provider, vin, originalDate, expectedPages: Number(pages), sizeBytes: bytes.byteLength, sha256: sha, provenance, rights: { category: "provider_artifact", purpose: "Synthetic original provider report", basis: "Owned synthetic fixture only", provenance, identifiability: "anonymous", use: reuse ? ["service", "archive", "redistribute"] : ["service", "redistribute"], schedule: { kind: "until", until, reason: "Explicit synthetic source schedule" }, supplierRestrictions: supplier, hold: null } });
   if (!result.ok) throw new Error(result.error);
   const response = await fetch(`/services/reports/${id}/${artifactId}`, { method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: bytes });
   if (!response.ok) throw new Error("UPLOAD_FAILED");
   if (version === epoch.current) { setFile(null); uploadRetry.current = null; setBusy(false); await refresh(); changed(); }
  } catch { if (version === epoch.current) setError(true); }
  finally { if (version === epoch.current) setBusy(false); }
 }
 const input = (label: string, value: string, change: (value: string) => void, type="text") => <label className="block">{label}<input aria-label={label} value={value} onChange={event => change(event.target.value)} type={type} className="min-h-11 w-full rounded border p-2"/></label>;
 const button = (label: string, run: () => void, disabled=false) => <button type="button" className="min-h-11 rounded border px-4 py-2 disabled:opacity-50" disabled={busy || disabled} onClick={run}>{label}</button>;
 const card = (report: S.HistoryReports["delivered"][number], archive: boolean) => <article key={report.id} className="space-y-3 rounded border p-3"><p>{report.provider === "carfax" ? "Carfax" : "AutoCheck"} / {report.vin} / {report.originalDate}</p>
  {!archive ? <a className="underline" href={`/services/reports/${id}/${report.id}`} target="_blank" rel="noopener noreferrer">{c.open}</a> : null}
  {archive ? button(c.archive, () => { void command({ kind: "archive", orderId: order.id, artifactId: report.id, expectedAssignmentVersion: assignmentVersion, expectedVersion: order.version }); }, order.state !== "paid") : <>
   {report.state === "staged" ? <><label className="block"><input type="checkbox" checked={checked[report.id] ?? false} onChange={event => setChecked(current => ({ ...current, [report.id]: event.target.checked }))}/>{c.attestation}</label>{button(c.verify, () => { void command({ kind: "verify", orderId: order.id, artifactId: report.id, expectedAssignmentVersion: assignmentVersion, vin: report.vin, originalDate: report.originalDate, readablePages: report.expectedPages, readable: true }); }, !checked[report.id])}</> : null}
   {report.state === "verified" && !report.deliveredAt ? <>{input(`${c.link} ${report.provider}`, links[report.id] ?? "", value => setLinks(current => ({ ...current, [report.id]: value })))}<label><input type="checkbox" checked={linkChecks[report.id] ?? false} onChange={event => setLinkChecks(current => ({ ...current, [report.id]: event.target.checked }))}/>{c.linkChecked}</label>{button(c.deliver, () => { void command({ kind: "deliver", orderId: order.id, artifactId: report.id, expectedAssignmentVersion: assignmentVersion, expectedVersion: order.version, sharedLink: links[report.id] ?? "", linkMatches: true, linkChecked: true }); }, !linkChecks[report.id] || !links[report.id])}</> : null}
  </>}
 </article>;
 return <section className="space-y-4 rounded border p-4"><h4>{c.title}</h4><p>{c.synthetic}</p><p>{c.noFreshness}</p>{error ? <p role="alert">{c.error} {c.failed}</p> : null}{button(c.refresh, () => { void refresh(); })}
  <label>{c.provider}<select aria-label={c.provider} value={provider} onChange={event => setProvider(event.target.value as typeof provider)}><option value="carfax">Carfax</option><option value="autocheck">AutoCheck</option></select></label>{input(c.vin, vin, setVin)}{input(c.originalDate, originalDate, setOriginalDate)}{input(c.pages, pages, setPages,"number")}{input(c.provenance, provenance, setProvenance)}{input(c.supplier, supplier, setSupplier)}{input(c.until, until, setUntil)}<label><input type="checkbox" checked={reuse} onChange={event => setReuse(event.target.checked)}/>{c.allowReuse}</label>
  <label>{c.upload}<input aria-label={c.upload} type="file" accept="application/pdf" onChange={event => setFile(event.target.files?.[0] ?? null)}/></label>{button(c.upload, () => { void upload(); }, !file || !vin || !originalDate || !pages || !provenance || !supplier || !until)}
  <h5>{c.staged}</h5>{data?.staged.map(report => card(report,false))}<h5>{c.permitted}</h5>{data?.archive.map(report => card(report,true))}<h5>{c.delivered}</h5>{data?.delivered.map(report => card(report,false))}
 </section>;
}
