"use client";
import { useEffect, useRef, useState } from "react";
import type { ServiceMessagingSchemas as S } from "@auto-tm/contracts";

import { serviceAssign, serviceMarkRead, serviceQueue, serviceRead, serviceSend, serviceStage, serviceSupportCommand, type ServiceQueue } from "./actions";
import { HistoryWorkspace } from "./HistoryWorkspace";
import { serviceCopy } from "./copy";

import { useAdminLocale } from "@/lib/i18n";

export function ServiceWorkspace() {
 const { locale } = useAdminLocale(); const c = serviceCopy(locale);
 const [purpose, setPurpose] = useState<S.ServicePurpose>("support"), [queue, setQueue] = useState<ServiceQueue>([]), [conversation, setConversation] = useState<S.ServiceConversation | null>(null), [error, setError] = useState(""), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [body, setBody] = useState(""), [visibility, setVisibility] = useState<"customer" | "staff" | "request_information" | "notice">("customer"), [target, setTarget] = useState("");
 const [image, setImage] = useState<{ file: File; id?: string } | null>(null), [attachmentId, setAttachmentId] = useState<string | null>(null), [uploading, setUploading] = useState(false), [uploadFailed, setUploadFailed] = useState(false);
 const [reason, setReason] = useState("");
 const closeRetry = useRef<{ fingerprint: string; id: string } | null>(null);
 const retry = useRef<{ fingerprint: string; id: string } | null>(null); const generation = useRef(0);
 const readFence = useRef("");
 const renderedThrough = conversation?.messages.at(-1)?.sequence ?? 0;
 useEffect(() => {
  if (!conversation || renderedThrough <= conversation.readThrough) return;
  const fence = `${conversation.id}:${renderedThrough}`; if (readFence.current === fence) return; readFence.current = fence;
  const epoch = generation.current;
  void serviceMarkRead(conversation.id, renderedThrough).then(result => {
   if (epoch !== generation.current) return;
   if (!result.ok) { readFence.current = ""; if (result.error === "permission" || result.error === "conflict") { setConversation(null); setError(result.error); } }
  });
 }, [conversation?.id, conversation?.readThrough, renderedThrough]);
 async function refresh(next = purpose) {
  const epoch = ++generation.current; setLoading(true); setError(""); setConversation(null);
  try { const result = await serviceQueue(next); if (epoch !== generation.current) return;
   if (result.ok) setQueue(result.data); else { setQueue([]); setError(result.error); }
  } catch { if (epoch === generation.current) { setQueue([]); setError("error"); } } finally { if (epoch === generation.current) setLoading(false); }
 }
 useEffect(() => { void refresh(purpose); return () => { generation.current++; }; }, [purpose]);
 async function open(id: string) {
  const epoch = ++generation.current; setLoading(true); setError(""); setConversation(null); setBody(""); setImage(null); setAttachmentId(null); retry.current = null;
  try { const result = await serviceRead(id); if (epoch !== generation.current) return;
   if (result.ok) setConversation(result.data); else setError(result.error);
  } catch { if (epoch === generation.current) setError("error"); } finally { if (epoch === generation.current) setLoading(false); }
 }
 async function assign(id: string, version: number, next?: string) {
  setBusy(true); setError(""); try { const result = await serviceAssign(id, version, next);
   if (result.ok) { setTarget(""); await open(id); } else { setConversation(null); setError(result.error); }
  } catch { setError("error"); } finally { setBusy(false); }
 }
 async function command(value: S.SupportCommand) {
  if (!conversation || busy) return;
  const id = conversation.id, epoch = generation.current; setBusy(true); setError("");
  try { const result = await serviceSupportCommand(id, value); if (epoch !== generation.current) return;
   if (!result.ok) { setError(result.error); if (result.error === "permission" || result.error === "conflict") setConversation(null); return; }
  if (value.kind === "close_awaiting") { setBody(""); setReason(""); closeRetry.current = null; }
  const latest = await serviceRead(id); if (epoch !== generation.current) return;
   if (latest.ok) setConversation(latest.data); else { setConversation(null); setError(latest.error); }
  } catch { if (epoch === generation.current) setError("error"); } finally { if (epoch === generation.current) setBusy(false); }
 }
 function closeAwaiting() {
  if (!conversation) return;
  const fingerprint = JSON.stringify([conversation.id, body.trim(), reason.trim()]);
  if (closeRetry.current?.fingerprint !== fingerprint) closeRetry.current = { fingerprint, id: crypto.randomUUID() };
  void command({ kind: "close_awaiting", clientMessageId: closeRetry.current.id, reason, body });
 }
 async function send() {
  if (!conversation || (!body.trim() && !attachmentId) || busy) return;
  setBusy(true); setError(""); const fingerprint = JSON.stringify([conversation.id, body.trim(), visibility, attachmentId, reason]);
  if (retry.current?.fingerprint !== fingerprint) retry.current = { fingerprint, id: crypto.randomUUID() };
  try { const result = await serviceSend(conversation.id, { clientMessageId: retry.current.id, ...(body.trim() ? { body: body.trim() } : {}), ...(attachmentId ? { attachmentId } : {}), visibility: visibility === "staff" ? "staff" : "customer", ...(conversation.purpose === "support" && visibility !== "staff" ? { supportKind: visibility === "customer" ? "reply" : visibility, ...(visibility === "notice" ? { reason } : {}) } : {}) });
  if (result.ok) { setBody(""); setReason(""); setImage(null); setAttachmentId(null); retry.current = null; const latest = await serviceRead(conversation.id); if (latest.ok) setConversation(latest.data); else { setConversation(null); setError(latest.error); } }
  else { setError(result.error); if (result.error === "permission" || result.error === "conflict") setConversation(null); }
  } catch { setError("error"); } finally { setBusy(false); }
 }
 async function upload(file: File) {
  if (!conversation || uploading) return; const epoch = generation.current;
  setUploading(true); setUploadFailed(false);
  const selected = image?.file === file ? image : { file }; setImage(selected);
  try {
   if (!["image/jpeg", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024 || file.size <= 0) throw new Error("Invalid image");
   if (!selected.id) {
    const category = conversation.purpose === "support" ? "support_communication" : "history_communication";
    const stage = await serviceStage(conversation.id, { category, visibility: visibility === "staff" ? "staff" : "customer", contentType: file.type as "image/jpeg" | "image/webp", sizeBytes: file.size, filename: file.name, rights: { category, purpose: "Synthetic service workflow verification", basis: "Owned synthetic fixture", provenance: "Synthetic test image selected by admitted fixture", identifiability: "personal", use: ["service"], schedule: conversation.purpose === "support" ? { kind: "support_case", closedDays: 90, eraseOnAccountDeletion: true } : { kind: "until", until: new Date(Date.now() + 7 * 86400000).toISOString(), reason: "Bounded synthetic verification" }, supplierRestrictions: "", hold: null } });
    if (!stage.ok) throw new Error(stage.error); selected.id = stage.data.id;
   }
   const response = await fetch(`/services/files/${conversation.id}/${selected.id}`, { method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: await file.arrayBuffer() });
   if (!response.ok) throw new Error("Upload failed");
   if (epoch === generation.current) setAttachmentId(selected.id);
  } catch { if (epoch === generation.current) setUploadFailed(true); } finally { setUploading(false); }
 }
 async function more() {
  if (!conversation || busy) return; setBusy(true);
  const result = await serviceRead(conversation.id, conversation.messages.at(-1)?.sequence ?? 0); setBusy(false);
  if (result.ok) setConversation({ ...result.data, messages: [...conversation.messages, ...result.data.messages] }); else { setError(result.error); if (result.error === "permission") setConversation(null); }
 }
 const button = "min-h-11 rounded-lg border px-4 py-2 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2";
 return <main className="mx-auto max-w-7xl space-y-6 p-6"><h1 className="text-2xl font-semibold">{c.title}</h1>
  <div className="flex flex-wrap items-center gap-3"><label>{c.title}<select aria-label={c.title} value={purpose} onChange={event => { setBody(""); setPurpose(event.target.value as S.ServicePurpose); }} className="ml-3 min-h-11 rounded-lg border p-2"><option value="support">{c.support}</option><option value="history">{c.history}</option></select></label><button className={button} onClick={() => void refresh()}>{c.refresh}</button></div>
  {error ? <p role="alert">{c[error as "error"]}</p> : null}
  {loading ? <p role="status">{c.loading}</p> : null}
  <div className="grid gap-6 md:grid-cols-[18rem_1fr]"><aside aria-label={c.title} className="space-y-3">{!loading && queue.length === 0 ? <p>{c.empty}</p> : queue.map(row => <article key={row.id} className="space-y-2 rounded-xl border p-4"><p>{row.assigned ? c.assigned : c.unassigned}</p><p className="break-all text-xs">{row.resourceId}</p>{row.assigned ? <button className={button} onClick={() => void open(row.id)}>{c[purpose]}</button> : <button disabled={busy} className={button} onClick={() => void assign(row.id, row.assignmentVersion)}>{c.claim}</button>}</article>)}</aside>
   <section className="min-w-0 space-y-4 rounded-xl border p-5">{!conversation ? <p>{c.select}</p> : <><h2 className="text-xl font-semibold">{c[conversation.purpose]}</h2><p>{conversation.operatorName ?? c.carberk} · {c.unread}: {conversation.unread}</p><ol className="space-y-4" >{conversation.messages.length === 0 ? <li>{c.emptyMessages}</li> : conversation.messages.map(message => <li key={message.id} className="rounded-lg border p-3"><p className="text-sm font-medium">{message.operatorName ?? c[message.sender]}{message.visibility === "staff" ? ` · ${c.note}` : ""}</p><p className="whitespace-pre-wrap break-words">{message.body}</p>{message.sender !== "customer" && message.visibility === "customer" ? <p className="text-xs">{message.sequence <= (conversation.peerReadThrough ?? 0) ? c.seen : c.saved}</p> : null}{message.attachment ? <a className="underline" href={`/services/files/${conversation.id}/${message.attachment.id}`} target="_blank" rel="noopener noreferrer">{c.attachment}: {message.attachment.filename}</a> : null}</li>)}</ol>{conversation.hasMore ? <button className={button} disabled={busy} onClick={() => void more()}>{c.more}</button> : null}
    {conversation.purpose === "history" ? <HistoryWorkspace key={conversation.id} conversation={conversation} locale={locale} denied={() => { setConversation(null); setError("permission"); }}/> : null}
    <form onSubmit={event => { event.preventDefault(); void send(); }} className="space-y-3"><label className="block">{c.reply}<select disabled={!!image || uploading} aria-label={c.reply} value={visibility} onChange={event => setVisibility(event.target.value as "customer" | "staff")} className="ml-3 min-h-11 rounded-lg border p-2"><option value="customer">{c.reply}</option><option value="staff">{c.note}</option>{conversation.purpose === "support" ? <><option value="request_information">{c.askInformation}</option><option value="notice">{c.notice}</option></> : null}</select></label>{visibility === "staff" ? <p>{c.private}</p> : null}{visibility === "notice" ? <label className="block">{c.reason}<input aria-label={c.reason} value={reason} onChange={event => setReason(event.target.value)} maxLength={500} className="mt-2 min-h-11 w-full rounded-lg border p-2" required/></label> : null}<label className="block">{c.upload}<input aria-label={c.upload} type="file" accept="image/jpeg,image/webp" disabled={uploading || !!attachmentId} onChange={event => { const file = event.target.files?.[0]; if (file) void upload(file); }} className="mt-2 block"/></label>
    {uploadFailed ? <><p role="alert">{c.uploadFailed}</p><button type="button" className={button} onClick={() => { if (image) void upload(image.file); }}>{c.uploadRetry}</button></> : null}{attachmentId ? <p role="status">{c.attachmentReady}</p> : null}{image ? <button type="button" className={button} onClick={() => { setImage(null); setAttachmentId(null); setUploadFailed(false); }}>{c.remove}</button> : null}
    <label className="block">{c.body}<textarea aria-label={c.body} value={body} onChange={event => setBody(event.target.value)} maxLength={4000} className="mt-2 min-h-28 w-full rounded-lg border p-3"/></label><button disabled={busy || uploading || (visibility === "notice" && !reason.trim()) || (image !== null && !attachmentId) || (!body.trim() && !attachmentId)} className={button}>{busy ? c.sending : error ? c.retrySend : c.send}</button></form>
    {conversation.purpose === "support" ? <section className="space-y-3 border-t pt-4">
     {conversation.support ? <><p>{c.unanswered}: {conversation.support.unansweredSince ? new Date(conversation.support.unansweredSince).toLocaleString(locale) : "—"}</p><p>{c.staffedHours}: {(conversation.support.staffedElapsedMs / 3600000).toFixed(1)}</p>{conversation.support.overdue ? <p role="status">{c.overdue}</p> : null}<p>{c.awaitingCustomer}: {conversation.support.awaitingCustomerSince ? new Date(conversation.support.awaitingCustomerSince).toLocaleString(locale) : "—"}</p></> : null}
     <label className="block">{c.category}<select aria-label={c.category} disabled={busy} value={conversation.support?.category ?? "ordinary"} onChange={event => { void command({ kind: "category", category: event.target.value as "ordinary" | "account" | "exposure" }); }} className="ml-3 min-h-11 rounded-lg border p-2"><option value="exposure">{c.exposure}</option><option value="account">{c.account}</option><option value="ordinary">{c.ordinary}</option></select></label>
     <button className={button} disabled={busy} onClick={() => { void command({ kind: conversation.support?.investigation ? "investigation_done" : "investigate" }); }}>{conversation.support?.investigation ? c.investigationDone : c.investigate}</button>
     <button className={button} disabled={busy || !!conversation.support?.unansweredSince || conversation.support?.investigation === true} onClick={() => { void command({ kind: conversation.status === "closed" ? "reopen" : "close_resolved" }); }}>{conversation.status === "closed" ? c.reopen : c.closeResolved}</button>
     <label className="block">{c.closeAwaiting}: {c.reason}<input aria-label={`${c.closeAwaiting}: ${c.reason}`} value={reason} onChange={event => setReason(event.target.value)} maxLength={500} className="mt-2 min-h-11 w-full rounded-lg border p-2"/></label>
     <button className={button} disabled={busy || !reason.trim() || !body.trim() || !conversation.support?.awaitingCustomerSince || conversation.support?.investigation === true || !!conversation.support?.unansweredSince} onClick={closeAwaiting}>{c.closeAwaiting}</button>
    </section> : null}
    <form onSubmit={event => { event.preventDefault(); void assign(conversation.id, conversation.assignmentVersion, target.trim()); }} className="space-y-3 border-t pt-4"><label className="block">{c.target}<input aria-label={c.target} value={target} onChange={event => setTarget(event.target.value)} className="mt-2 min-h-11 w-full rounded-lg border p-2" required/></label><button disabled={busy || !target.trim()} className={button}>{c.handover}</button></form></> }</section>
  </div></main>;
}
