"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@auto-tm/ui/components";
import { VehicleHistorySchemas as V } from "@auto-tm/contracts";

import type { HistoryMessageResult } from "./actions";
import type { ReplyIntent } from "./useOperatorConversation";

import { deskCopy, type DeskLocale } from "@/lib/history-desk-copy";

type Intent = ReplyIntent & { revision: string };
type Draft = { text: string; revision: string; intent: Intent | null };
function parseDraft(raw: string): Draft {
  const value = JSON.parse(raw) as Draft;
  if (!value || typeof value !== "object" || Object.keys(value).sort().join() !== "intent,revision,text" ||
    typeof value.text !== "string" || value.text.length > 4000 || !V.HistoryMessageSchema.shape.id.safeParse(value.revision).success ||
    value.intent !== null && (!value.intent || Object.keys(value.intent).sort().join() !== "clientMessageId,revision,text" ||
      !V.HistoryMessageSchema.shape.id.safeParse(value.intent.revision).success ||
      !V.SendHistoryTextSchema.safeParse({ clientMessageId: value.intent.clientMessageId, text: value.intent.text }).success)) throw new Error("Invalid reply draft");
  return value;
}

export function ReplyComposer({ locale, actorId, id, version, messages, send, busy, offline,
  storage = () => window.localStorage, newId = () => crypto.randomUUID(),
}: {
  locale: DeskLocale; actorId: string; id: string; version: number; messages: V.HistoryMessage[];
  send: (body: ReplyIntent, complete: (result: HistoryMessageResult) => void) => boolean; busy: boolean; offline: boolean;
  storage?: () => Storage; newId?: () => string;
}) {
  const t = deskCopy[locale];
  const key = `carberk.history.public-reply.v1:${actorId}:${id}:${version}`;
  const [draft, setDraft] = useState<Draft>({ text: "", revision: "", intent: null });
  const ports = useRef({ storage, newId });
  const [loaded, setLoaded] = useState(false);
  const [storageError, setStorageError] = useState<"" | "load" | "save" | "corrupt">("");
  const [saved, setSaved] = useState(false);
  const [phase, setPhase] = useState<"" | "pending" | "uncertain">("");
  const [confirmed, setConfirmed] = useState<V.HistoryMessage[]>([]);
  const current = useRef(draft);
  const active = useRef(false);
  const load = useCallback(() => {
    if (!active.current) return;
    try {
      const raw = ports.current.storage().getItem(key);
      let restored: Draft;
      try { restored = raw ? parseDraft(raw) : { text: "", revision: ports.current.newId(), intent: null }; }
      catch { setSaved(false); setStorageError("corrupt"); return; }
      current.current = restored; setDraft(restored); setSaved(true); setLoaded(true); setStorageError("");
      setPhase(restored.intent ? "uncertain" : "");
    } catch { setSaved(false); setStorageError("load"); }
  }, [key]);
  useEffect(() => {
    active.current = true;
    load();
    return () => { active.current = false; };
  }, [load]);
  function reset() {
    if (!active.current) return;
    try { ports.current.storage().removeItem(key); load(); }
    catch { setSaved(false); setStorageError("corrupt"); }
  }
  const save = useCallback((next: Draft) => {
    if (!active.current) return false;
    current.current = next; setDraft(next);
    try { ports.current.storage().setItem(key, JSON.stringify(next)); setSaved(true); setStorageError(""); return true; }
    catch { setSaved(false); setStorageError("save"); return false; }
  }, [key]);
  const acknowledge = useCallback((message: V.HistoryMessage) => {
    if (!active.current) return;
    const latest = current.current, intent = latest.intent;
    if (!intent || message.clientMessageId !== intent.clientMessageId || message.text !== intent.text || message.author.id !== actorId) return;
    save({ text: latest.revision === intent.revision ? "" : latest.text, revision: latest.revision, intent: null });
    setPhase(""); setConfirmed((previous) => [...previous.filter((item) => item.id !== message.id), message]);
  }, [actorId, save]);
  useEffect(() => {
    const intent = current.current.intent;
    const found = intent && messages.find((message) => message.clientMessageId === intent.clientMessageId && message.author.kind === "operator");
    if (found) acknowledge(found);
  }, [messages, acknowledge]);
  function submit() {
    if (!active.current || busy || offline || phase === "pending" || !saved) return;
    const latest = current.current;
    const intent = latest.intent ?? { clientMessageId: ports.current.newId(), text: latest.text, revision: latest.revision };
    if (!V.SendHistoryTextSchema.safeParse({ clientMessageId: intent.clientMessageId, text: intent.text }).success) return;
    if (!save({ ...latest, intent })) return;
    setPhase("pending");
    const admitted = send({ clientMessageId: intent.clientMessageId, text: intent.text }, (result) => {
      if (!active.current) return;
      if (result.status === "ok" && result.kind === "send") acknowledge(result.data);
      else setPhase("uncertain");
    });
    if (!admitted) setPhase("uncertain");
  }
  const visibleConfirmed = confirmed.filter((item) => !messages.some((message) => message.id === item.id));
  return <div className="mt-5 border-t pt-5">
    {visibleConfirmed.map((message) => <div key={message.id} className="mb-4 ml-auto max-w-[95%] rounded-lg bg-primary/10 p-3 text-sm">
      <p role="region" aria-label={t.replyText} tabIndex={0} className="max-h-60 overflow-y-auto whitespace-pre-wrap [overflow-wrap:anywhere] focus-visible:outline-2 focus-visible:outline-ring">{message.text}</p>
      <p role="status" aria-live="polite" className="mt-2 text-xs">{t.sent}</p>
    </div>)}
    {draft.intent && <div className="mb-4 ml-auto max-w-[95%] rounded-lg bg-primary/10 p-3 text-sm">
      <p role="region" aria-label={t.replyText} tabIndex={0} className="max-h-60 overflow-y-auto whitespace-pre-wrap [overflow-wrap:anywhere] focus-visible:outline-2 focus-visible:outline-ring">{draft.intent.text}</p>
      <p role="status" aria-live="polite" className="mt-2 text-xs">{phase === "pending" ? t.pending : t.sendUncertain}</p>
      {draft.intent && phase !== "pending" && <Button className="mt-3" variant="secondary" disabled={busy || offline || !saved} onClick={submit}>{t.retryReply}</Button>}
    </div>}
    {storageError && <div id="reply-storage-error" role="alert" className="mb-4 space-y-2 text-sm">
      <p>{storageError === "corrupt" ? t.draftCorrupt : storageError === "load" ? t.draftLoadError : t.draftSaveError}</p>
      <Button variant="secondary" onClick={() => storageError === "corrupt" ? reset() : storageError === "load" ? load() : save(current.current)}>{storageError === "corrupt" ? t.newDraft : storageError === "load" ? t.retryDraftLoad : t.retryDraftSave}</Button>
    </div>}
    <form onSubmit={(event) => { event.preventDefault(); submit(); }}>
      <label htmlFor="history-reply" className="mb-2 block text-sm font-medium">{t.reply}</label>
      <textarea id="history-reply" aria-describedby={storageError ? "reply-storage-error" : "reply-draft-status"} disabled={!loaded} value={draft.text} onChange={(event) => save({ ...current.current, text: event.target.value, revision: ports.current.newId() })}
        rows={4} maxLength={4000} className="w-full resize-y rounded-md border bg-background p-3 text-sm focus-visible:outline-2 focus-visible:outline-ring" />
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p id="reply-draft-status" role="status" aria-live="polite" className="text-sm text-muted-foreground">{saved && draft.text ? t.draftSaved : ""}</p>
        <Button type="submit" disabled={busy || offline || !saved || !!draft.intent || !draft.text.trim()}>{t.sendReply}</Button>
      </div>
    </form>
  </div>;
}
