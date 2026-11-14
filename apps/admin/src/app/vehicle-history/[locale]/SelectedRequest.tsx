"use client";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@auto-tm/ui/components";
import { IdentitySchemas, type VehicleHistorySchemas as V } from "@auto-tm/contracts";

import { historyInboxAction, type HistoryInboxResult } from "./actions";


import { deskCopy, type DeskLocale } from "@/lib/history-desk-copy";

type Row = Extract<HistoryInboxResult, { kind: "queue" }>["data"]["items"][number];
type Detail = Extract<HistoryInboxResult, { kind: "detail" | "claim" }>["data"];
export function SelectedRequest({ locale, id, version, row, scope, actor, refresh, invalidate, claimed }: {
  locale: DeskLocale; id: string; version: number; row: Row | undefined; scope: string; actor: V.HistoryDesk["actor"];
  refresh: (resetSelection?: boolean) => void; invalidate: (result: HistoryInboxResult) => void; claimed: (version: number) => void;
}) {
  const t = deskCopy[locale];
  const heading = useRef<HTMLHeadingElement>(null);
  const nextMessageFocus = useRef<string | null>(null);
  const lifecycle = useRef({ active: true, generation: 0 });
  const [detail, setDetail] = useState<Detail | null>(null);
  const [messages, setMessages] = useState<V.HistoryMessage[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [state, setState] = useState(row ? row.mine ? "loading" : "unclaimed" : version === 0 ? "missing" : "loading");
  async function run(kind: "claim" | "detail" | "transcript") {
    const generation = ++lifecycle.current.generation;
    const previous = messages;
    setMessages([]);
    setState("loading");
    const valid = () => lifecycle.current.active && generation === lifecycle.current.generation;
    const accept = (result: HistoryInboxResult) => {
      if (!valid()) return false;
      if (result.status !== "ok") {
        setDetail(null);
        setState(result.status);
        if (["stale", "expired", "denied"].includes(result.status)) invalidate(result);
        return false;
      }
      if (result.scope !== scope || result.actor.id !== actor.id) { invalidate({ status: "stale" }); return false; }
      return true;
    };
    try {
      const result = await historyInboxAction(locale, { kind, id, scope, expectedAssignmentVersion: version,
        ...(kind === "transcript" && cursor ? { cursor } : {}) });
      if (!accept(result) || result.status !== "ok") return;
      if (result.kind === "claim") { claimed(result.data.assignmentVersion); return; }
      if (result.kind === "detail") {
        setDetail(result.data);
        const page = await historyInboxAction(locale, { kind: "transcript", id, scope, expectedAssignmentVersion: version });
        if (!accept(page) || page.status !== "ok" || page.kind !== "transcript") return;
        setMessages(page.data.items);
        setCursor(page.data.nextCursor);
      } else if (result.kind === "transcript") {
        nextMessageFocus.current = result.data.items[0]?.id ?? null;
        setMessages([...previous, ...result.data.items]);
        setCursor(result.data.nextCursor);
      }
      setState("ready");
    } catch { if (valid()) { setDetail(null); setState(navigator.onLine ? "unavailable" : "offline"); } }
  }
  useEffect(() => {
    const current = lifecycle.current;
    current.active = true;
    heading.current?.focus();
    if (row?.mine || (!row && version > 0)) void run("detail");
    return () => { current.active = false; current.generation++; };
    // This component is keyed by the complete queue, selection and session context.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (state !== "ready" || !nextMessageFocus.current) return;
    document.getElementById(`history-message-${nextMessageFocus.current}`)?.focus();
    nextMessageFocus.current = null;
  }, [messages, state]);
  const selected = detail ?? row;
  const name = selected?.requester ? IdentitySchemas.formatDisplayName(selected.requester, locale) : t.unavailablePerson;
  return <>
    <section aria-labelledby="selected-enquiry" className="min-w-0">
      <header className="border-b p-5">
        <h2 ref={heading} id="selected-enquiry" tabIndex={-1} className="break-words text-lg font-semibold focus-visible:outline-2 focus-visible:outline-ring">{name}</h2>
        <p className="mt-2 break-all text-xs text-muted-foreground">{t.reference}: {id}</p>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
      <span className="rounded bg-muted px-2 py-1">{t.enquiry}</span>
          <span>{t.assignment}: {selected?.assignedOperator ? IdentitySchemas.formatDisplayName(selected.assignedOperator, locale) : t.unassigned}</span>
        </div>
      </header>
      {state === "unclaimed" ? <div className="space-y-4 p-5 text-sm">
      <p>{t.claimBody}</p>
      <Button onClick={() => void run("claim")}>{t.claim}</Button>
      </div>
        : state !== "ready" ? <InboxNotice locale={locale} state={state} retry={() => refresh(state === "conflict")} />
          : <div className="p-5">
            {!messages.length && <p role="status" className="py-8 text-sm text-muted-foreground">{t.noMessages}</p>}
            <ol aria-label={t.conversation} className="max-h-[30rem] space-y-4 overflow-y-auto pr-1">{messages.map((message) => <li key={message.id} id={`history-message-${message.id}`} tabIndex={-1}
              className={`max-w-[95%] break-words rounded-lg p-3 text-sm focus-visible:outline-2 focus-visible:outline-ring ${message.author.kind === "operator" ? "ml-auto bg-primary/10" : "bg-muted"}`}>
              <p className="mb-2 text-xs text-muted-foreground">{IdentitySchemas.formatDisplayName(message.author, locale)} · <time dateTime={message.createdAt}>{formatTime(message.createdAt, locale)}</time>
      </p>
              <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{message.text}</p>
            </li>)}</ol>
            {cursor && <Button className="mt-5" variant="secondary" onClick={() => void run("transcript")}>{t.moreMessages}</Button>}
          </div>}
    </section>
    <aside aria-label={t.context} className="min-w-0 border-t bg-muted/20 p-5 lg:col-span-2 xl:col-span-1 xl:border-t-0 xl:border-l">
      <h3 className="mb-4 text-base font-semibold">{t.context}</h3>
      {selected && <p className="mb-5 text-sm">
      <span className="block text-muted-foreground">{t.created}</span>
      <time dateTime={selected.createdAt}>{formatTime(selected.createdAt, locale)}</time>
      </p>}
      <h4 className="mb-2 text-sm font-medium">{t.source}</h4>
      <p className="break-all text-sm">{detail ? detail.sourceListingId ?? t.noSource : t.claimContext}</p>
      {detail?.sourceListingId && <p className="mt-3 text-sm text-muted-foreground">{t.sourceBody}</p>}
    </aside>
  </>;
}

export function InboxNotice({ locale, state, retry }: { locale: DeskLocale; state: string; retry: () => void }) {
  const t = deskCopy[locale];
  const query = useSearchParams().toString();
  const text = state === "expired" || state === "stale" ? t.denied : state === "loading" ? t.loading : state === "conflict" ? t.conflict
    : state === "denied" ? t.denied : state === "offline" ? t.offline : state === "validation" ? t.validation : state === "missing" ? t.missing : t.error;
  return <div role={state === "loading" ? "status" : "alert"} aria-busy={state === "loading"} className="p-6 text-sm">
    <p className="mb-4">{text}</p>{state !== "loading" && <Button variant="secondary" onClick={retry}>{state === "conflict" ? t.refresh : t.retry}</Button>}
    {["denied", "expired", "stale"].includes(state) && <a className="ml-4 underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring" href={`/login?returnTo=${encodeURIComponent(`/vehicle-history/${locale}${query ? `?${query}` : ""}`)}`}>{t.signIn}</a>}
  </div>;
}

function formatTime(value: string, locale: DeskLocale) {
  // Browser ICU can omit Turkmen; numeric day/month avoids English month/AM fallbacks.
  return new Intl.DateTimeFormat(locale === "tk" ? "en-GB" : locale, {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
    hourCycle: "h23", timeZone: "Asia/Ashgabat", timeZoneName: "short",
  }).format(new Date(value));
}
