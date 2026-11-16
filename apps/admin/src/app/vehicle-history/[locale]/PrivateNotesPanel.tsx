"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@auto-tm/ui/components";
import { IdentitySchemas, VehicleHistorySchemas as V } from "@auto-tm/contracts";

import { historyPrivateNoteAction, type HistoryInboxResult } from "./actions";

import { deskCopy, type DeskLocale } from "@/lib/history-desk-copy";

type Intent = { clientNoteId: string; text: string; revision: string };
type Draft = { text: string; revision: string; intent: Intent | null };
type Note = V.HistoryPrivateNote;
type LoadState = "loading" | "ready" | "error" | "offline" | "denied";
const empty = (): Draft => ({ text: "", revision: crypto.randomUUID(), intent: null });
function parseDraft(raw: string): Draft {
  const value = JSON.parse(raw) as Draft;
  if (!value || typeof value !== "object" || Object.keys(value).sort().join() !== "intent,revision,text" ||
    typeof value.text !== "string" || value.text.length > 4000 || !V.HistoryPrivateNoteSchema.shape.id.safeParse(value.revision).success ||
    value.intent !== null && (!value.intent || Object.keys(value.intent).sort().join() !== "clientNoteId,revision,text" ||
      !V.HistoryPrivateNoteSchema.shape.id.safeParse(value.intent.revision).success ||
      !V.AddHistoryPrivateNoteSchema.safeParse({ clientNoteId: value.intent.clientNoteId,
        text: value.intent.text, expectedAssignmentVersion: 1 }).success)) throw new Error("Invalid private note draft");
  return value;
}
function formatTime(value: string, locale: DeskLocale) {
  return new Intl.DateTimeFormat(locale === "tk" ? "en-GB" : locale, {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
    hourCycle: "h23", timeZone: "Asia/Ashgabat", timeZoneName: "short",
  }).format(new Date(value));
}

export function PrivateNotesPanel({ locale, id, version, scope, actorId, revision, invalidate }: {
  locale: DeskLocale; id: string; version: number; scope: string; actorId: string; revision: number;
  invalidate: (result: HistoryInboxResult) => void;
}) {
  const t = deskCopy[locale];
  const key = `carberk.history.private-note.v1:${actorId}:${id}:${version}`;
  const selection = useMemo(() => ({ id, scope, expectedAssignmentVersion: version }), [id, scope, version]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState<Draft>({ text: "", revision: "", intent: null });
  const [draftReady, setDraftReady] = useState(false);
  const [saved, setSaved] = useState(false);
  const [storageError, setStorageError] = useState<"" | "load" | "save" | "corrupt">("");
  const [phase, setPhase] = useState<"" | "pending" | "uncertain">("");
  const current = useRef(draft);
  const active = useRef(false);
  const request = useRef(0);
  const busy = useRef(false);
  const callbacks = useRef({ invalidate });
  useEffect(() => { callbacks.current = { invalidate }; });
  const loadDraft = useCallback(() => {
    if (!active.current) return;
    try {
      const raw = localStorage.getItem(key);
      let restored: Draft;
      try { restored = raw ? parseDraft(raw) : empty(); }
      catch { setSaved(false); setStorageError("corrupt"); return; }
      current.current = restored; setDraft(restored); setDraftReady(true); setSaved(true); setStorageError("");
      setPhase(restored.intent ? "uncertain" : "");
    } catch { setSaved(false); setStorageError("load"); }
  }, [key]);
  const save = useCallback((next: Draft) => {
    if (!active.current) return false;
    current.current = next; setDraft(next);
    try { localStorage.setItem(key, JSON.stringify(next)); setSaved(true); setStorageError(""); return true; }
    catch { setSaved(false); setStorageError("save"); return false; }
  }, [key]);
  const acknowledge = useCallback((note: Note) => {
    const latest = current.current, intent = latest.intent;
    if (!active.current || !intent || note.clientNoteId !== intent.clientNoteId || note.text !== intent.text || note.author.id !== actorId) return;
    save({ text: latest.revision === intent.revision ? "" : latest.text, revision: latest.revision, intent: null });
    setPhase("");
  }, [actorId, save]);
  const read = useCallback(async (next?: string) => {
    if (!active.current || busy.current) return;
    if (!navigator.onLine) { setLoadState("offline"); return; }
    busy.current = true; setLoading(true);
    const generation = ++request.current;
    let result: Awaited<ReturnType<typeof historyPrivateNoteAction>>;
    try { result = await historyPrivateNoteAction(locale, { ...selection, kind: "page", ...(next ? { cursor: next } : {}) }); }
    catch {
      if (active.current && generation === request.current) {
        busy.current = false; setLoading(false); setLoadState(navigator.onLine ? "error" : "offline");
      }
      return;
    }
    if (!active.current || generation !== request.current) return;
    busy.current = false; setLoading(false);
    if (result.status !== "ok" || result.scope !== scope || result.actor.id !== actorId) {
      if (result.status === "unavailable") { setLoadState("error"); return; }
      setLoadState("denied"); callbacks.current.invalidate(result.status === "ok" ? { status: "stale" } : result);
      return;
    }
    if (result.kind !== "page") { setLoadState("error"); return; }
    setNotes((existing) => {
      const merged = next ? [...existing, ...result.data.items] : result.data.items;
      const unique = new Map(merged.map((note) => [note.id, note]));
      return [...unique.values()];
    });
    setCursor(result.data.nextCursor); setLoadState("ready");
    const intent = current.current.intent;
    const confirmed = intent && result.data.items.find((note) => note.clientNoteId === intent.clientNoteId);
    if (confirmed) acknowledge(confirmed);
  }, [locale, selection, scope, actorId, acknowledge]);
  useEffect(() => {
    active.current = true;
    loadDraft();
    const pending = request;
    return () => { active.current = false; pending.current++; busy.current = false; };
  }, [loadDraft]);
  useEffect(() => {
    const pending = request;
    void read();
    return () => { pending.current++; busy.current = false; };
  }, [read, revision]);
  useEffect(() => {
    const offline = () => { if (active.current) setLoadState("offline"); };
    window.addEventListener("offline", offline);
    return () => window.removeEventListener("offline", offline);
  }, []);
  function reset() {
    try { localStorage.removeItem(key); loadDraft(); }
    catch { setSaved(false); setStorageError("corrupt"); }
  }
  async function submit() {
    if (!active.current || busy.current || phase === "pending" || !draftReady || !saved || loadState !== "ready" || !navigator.onLine) return;
    const latest = current.current;
    const intent = latest.intent ?? { clientNoteId: crypto.randomUUID(), text: latest.text, revision: latest.revision };
    if (!V.AddHistoryPrivateNoteSchema.safeParse({ clientNoteId: intent.clientNoteId, text: intent.text,
      expectedAssignmentVersion: version }).success || !save({ ...latest, intent })) return;
    busy.current = true; setPhase("pending");
    const generation = request.current;
    let result: Awaited<ReturnType<typeof historyPrivateNoteAction>>;
    try {
      result = await historyPrivateNoteAction(locale, { ...selection, kind: "add", body: {
        clientNoteId: intent.clientNoteId, text: intent.text, expectedAssignmentVersion: version,
      } });
    } catch {
      if (active.current && generation === request.current) {
        busy.current = false; setPhase("uncertain");
        if (!navigator.onLine) setLoadState("offline");
      }
      return;
    }
    if (!active.current || generation !== request.current) return;
    busy.current = false;
    if (result.status !== "ok" || result.scope !== scope || result.actor.id !== actorId) {
      setPhase("uncertain");
      if (result.status !== "unavailable") {
        setLoadState("denied"); callbacks.current.invalidate(result.status === "ok" ? { status: "stale" } : result);
      }
      return;
    }
    if (result.kind !== "add") { setPhase("uncertain"); return; }
    setNotes((existing) => existing.some((note) => note.id === result.data.id) ? existing : [...existing, result.data]);
    acknowledge(result.data);
  }
  return <section role="region" aria-label={t.privateNotes} className="mt-6 min-w-0 border-t pt-5">
    <h4 className="text-sm font-semibold">{t.privateNotes}</h4>
    <p className="mt-1 text-xs text-muted-foreground">{t.privateNotesHint}</p>
    {loadState === "loading" && <p role="status" className="mt-4 text-sm">{t.notesLoading}</p>}
    {loadState === "ready" && !notes.length && <p className="mt-4 text-sm text-muted-foreground">{t.noNotes}</p>}
    {!!notes.length && <ol aria-label={t.privateNotes} className="mt-4 max-h-72 space-y-3 overflow-y-auto pr-1">
      {notes.map((note) => <li key={note.id} className="min-w-0 rounded-md border bg-background p-3 text-sm">
        <p className="mb-2 text-xs text-muted-foreground">{IdentitySchemas.formatDisplayName(note.author, locale)} · <time dateTime={note.createdAt}>{formatTime(note.createdAt, locale)}</time></p>
        <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{note.text}</p>
      </li>)}
    </ol>}
    {cursor && loadState === "ready" && <Button className="mt-3" variant="secondary" disabled={loading} onClick={() => void read(cursor)}>{t.moreNotes}</Button>}
    {["error", "offline", "denied"].includes(loadState) && <div role="alert" className="mt-4 text-sm">
      <p>{loadState === "offline" ? t.notesOffline : loadState === "denied" ? t.denied : t.notesError}</p>
      {loadState !== "denied" && <Button className="mt-2" variant="secondary" onClick={() => void read()}>{t.retryNotes}</Button>}
    </div>}
    {draft.intent && <div className="mt-4 rounded-md border bg-background p-3 text-sm">
      <p role="region" aria-label={t.pendingNoteText} tabIndex={0} className="max-h-60 overflow-y-auto whitespace-pre-wrap [overflow-wrap:anywhere] focus-visible:outline-2 focus-visible:outline-ring">{draft.intent.text}</p>
      <p role="status" aria-live="polite" className="mt-2 text-xs">{phase === "pending" ? t.pending : t.noteUncertain}</p>
      {phase !== "pending" && <Button className="mt-2" variant="secondary" disabled={!saved || loading || loadState !== "ready"} onClick={() => void submit()}>{t.retryNote}</Button>}
    </div>}
    {storageError && <div id="note-storage-error" role="alert" className="mt-4 text-sm">
      <p>{storageError === "corrupt" ? t.noteDraftCorrupt : storageError === "load" ? t.noteDraftLoadError : t.noteDraftSaveError}</p>
      <Button className="mt-2" variant="secondary" onClick={() => storageError === "corrupt" ? reset() : storageError === "load" ? loadDraft() : save(current.current)}>
        {storageError === "corrupt" ? t.newNoteDraft : storageError === "load" ? t.retryNoteDraftLoad : t.retryNoteDraftSave}
      </Button>
    </div>}
    <form className="mt-4" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
      <label htmlFor="history-private-note" className="mb-2 block text-sm font-medium">{t.internalNote}</label>
      <textarea id="history-private-note" aria-describedby={storageError ? "note-storage-error" : "note-draft-status"} disabled={!draftReady || loadState === "denied"}
        value={draft.text} onChange={(event) => save({ ...current.current, text: event.target.value, revision: crypto.randomUUID() })}
        rows={4} maxLength={4000} className="w-full resize-y rounded-md border bg-background p-3 text-sm focus-visible:outline-2 focus-visible:outline-ring" />
      <p id="note-draft-status" role="status" aria-live="polite" className="mt-2 text-xs text-muted-foreground">{saved && draft.text ? t.draftSaved : ""}</p>
      <Button className="mt-3" type="submit" disabled={!saved || !draftReady || !!draft.intent || !draft.text.trim() || loading || loadState !== "ready"}>{t.addPrivateNote}</Button>
    </form>
  </section>;
}
