"use client";
import { useEffect, useRef, useState } from "react";
import type { ServiceMessagingSchemas as S } from "@auto-tm/contracts";

import { serviceAssign, serviceQueue, serviceRead, serviceSend, type ServiceQueue } from "./actions";
import { serviceCopy } from "./copy";

import { useAdminLocale } from "@/lib/i18n";

export function ServiceWorkspace() {
 const { locale } = useAdminLocale(); const c = serviceCopy(locale);
 const [purpose, setPurpose] = useState<S.ServicePurpose>("support"), [queue, setQueue] = useState<ServiceQueue>([]), [conversation, setConversation] = useState<S.ServiceConversation | null>(null), [error, setError] = useState(""), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [body, setBody] = useState(""), [visibility, setVisibility] = useState<"customer" | "staff">("customer"), [target, setTarget] = useState("");
 const retry = useRef<{ fingerprint: string; id: string } | null>(null); const generation = useRef(0);
 async function refresh(next = purpose) {
  const epoch = ++generation.current; setLoading(true); setError(""); setConversation(null);
  const result = await serviceQueue(next); if (epoch !== generation.current) return;
  setLoading(false); if (result.ok) setQueue(result.data); else { setQueue([]); setError(result.error); }
 }
 useEffect(() => { void refresh(purpose); return () => { generation.current++; }; }, [purpose]);
 async function open(id: string) {
  const epoch = ++generation.current; setLoading(true); setError(""); setConversation(null); setBody(""); retry.current = null;
  const result = await serviceRead(id); if (epoch !== generation.current) return;
  setLoading(false); if (result.ok) setConversation(result.data); else setError(result.error);
 }
 async function assign(id: string, version: number, next?: string) {
  setBusy(true); setError(""); const result = await serviceAssign(id, version, next); setBusy(false);
  if (result.ok) { setTarget(""); await open(id); } else { setConversation(null); setError(result.error); }
 }
 async function send() {
  if (!conversation || !body.trim() || busy) return;
  setBusy(true); setError(""); const fingerprint = JSON.stringify([conversation.id, body.trim(), visibility]);
  if (retry.current?.fingerprint !== fingerprint) retry.current = { fingerprint, id: crypto.randomUUID() };
  const result = await serviceSend(conversation.id, { clientMessageId: retry.current.id, body: body.trim(), visibility }); setBusy(false);
  if (result.ok) { setBody(""); retry.current = null; const latest = await serviceRead(conversation.id); if (latest.ok) setConversation(latest.data); else { setConversation(null); setError(latest.error); } }
  else { setError(result.error); if (result.error === "permission" || result.error === "conflict") setConversation(null); }
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
   <section className="min-w-0 space-y-4 rounded-xl border p-5">{!conversation ? <p>{c.select}</p> : <><h2 className="text-xl font-semibold">{c[conversation.purpose]}</h2><p>{conversation.operatorName ?? c.carberk} · {c.unread}: {conversation.unread}</p><ol className="space-y-4" >{conversation.messages.length === 0 ? <li>{c.emptyMessages}</li> : conversation.messages.map(message => <li key={message.id} className="rounded-lg border p-3"><p className="text-sm font-medium">{message.operatorName ?? c[message.sender]}{message.visibility === "staff" ? ` · ${c.note}` : ""}</p><p className="whitespace-pre-wrap break-words">{message.body}</p>{message.attachment ? <a className="underline" href={`/services/files/${conversation.id}/${message.attachment.id}`} target="_blank" rel="noopener noreferrer">{c.attachment}: {message.attachment.filename}</a> : null}</li>)}</ol>{conversation.hasMore ? <button className={button} disabled={busy} onClick={() => void more()}>{c.more}</button> : null}
    <form onSubmit={event => { event.preventDefault(); void send(); }} className="space-y-3"><label className="block">{c.reply}<select aria-label={c.reply} value={visibility} onChange={event => setVisibility(event.target.value as "customer" | "staff")} className="ml-3 min-h-11 rounded-lg border p-2"><option value="customer">{c.reply}</option><option value="staff">{c.note}</option></select></label>{visibility === "staff" ? <p>{c.private}</p> : null}<label className="block">{c.body}<textarea aria-label={c.body} value={body} onChange={event => setBody(event.target.value)} maxLength={4000} className="mt-2 min-h-28 w-full rounded-lg border p-3"/></label><button disabled={busy || !body.trim()} className={button}>{busy ? c.sending : error ? c.retrySend : c.send}</button></form>
    <form onSubmit={event => { event.preventDefault(); void assign(conversation.id, conversation.assignmentVersion, target.trim()); }} className="space-y-3 border-t pt-4"><label className="block">{c.target}<input aria-label={c.target} value={target} onChange={event => setTarget(event.target.value)} className="mt-2 min-h-11 w-full rounded-lg border p-2" required/></label><button disabled={busy || !target.trim()} className={button}>{c.handover}</button></form></> }</section>
  </div></main>;
}
