"use client";
import { useEffect, useLayoutEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@auto-tm/ui/components";
import { IdentitySchemas, type VehicleHistorySchemas as V } from "@auto-tm/contracts";

import type { HistoryInboxResult } from "./actions";
import { useOperatorConversation } from "./useOperatorConversation";


import { deskCopy, type DeskLocale } from "@/lib/history-desk-copy";

type Row = Extract<HistoryInboxResult, { kind: "queue" }>["data"]["items"][number];
export function SelectedRequest({ locale, id, version, row, scope, actor, revision, refresh, invalidate, claimed }: {
  locale: DeskLocale; id: string; version: number; row: Row | undefined; scope: string; actor: V.HistoryDesk["actor"];
  revision: number; refresh: (resetSelection?: boolean) => void; invalidate: (result: HistoryInboxResult) => void; claimed: (version: number) => void;
}) {
  const t = deskCopy[locale];
  const heading = useRef<HTMLHeadingElement>(null);
  const pane = useRef<HTMLOListElement>(null);
  const pageFocus = useRef<Element | null>(null);
  const anchor = useRef<{ id: string; offset: number; top: number } | null>(null);
  const lost = !!row && version > 0 && (!row.mine || row.assignmentVersion !== version || row.assignedOperator?.id !== actor.id);
  const reader = useOperatorConversation({ locale, id, version, scope, actorId: actor.id, revision,
    entry: lost ? "conflict" : row ? row.mine ? "loading" : "unclaimed" : version === 0 ? "missing" : "loading", invalidate, claimed });
  const { detail, messages, cursor } = reader;
  const state = lost ? "conflict" : reader.state;
  function remember() {
    const node = pane.current;
    if (!node) return;
    const top = node.getBoundingClientRect().top;
    const visible = [...node.children].find((child) => child.getBoundingClientRect().bottom > top);
    anchor.current = visible ? { id: visible.id, offset: visible.getBoundingClientRect().top - top, top: node.scrollTop } : null;
  }
  useEffect(() => { heading.current?.focus(); }, []);
  useLayoutEffect(() => {
    const node = pane.current, saved = anchor.current;
    if (!node) return;
    if (saved) {
      const row = document.getElementById(saved.id);
      node.scrollTop += row ? row.getBoundingClientRect().top - node.getBoundingClientRect().top - saved.offset : saved.top - node.scrollTop;
    }
    if (reader.focusId && (document.activeElement === pageFocus.current || document.activeElement === document.body)) {
      document.getElementById(`history-message-${reader.focusId}`)?.focus({ preventScroll: true });
    }
    remember();
  }, [messages, reader.focusId]);
  function more() { remember(); pageFocus.current = document.activeElement; reader.run("page"); }
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
      <Button disabled={reader.busy} aria-busy={reader.busy} onClick={() => reader.run("claim")}>{t.claim}</Button>
      {["offline", "unavailable"].includes(reader.notice) && <InboxNotice locale={locale} state={reader.notice} retry={() => reader.run("claim")} />}
      </div>
        : state !== "ready" ? <InboxNotice locale={locale} state={reader.notice === "unavailable" ? "conversationUnavailable" : reader.notice === "offline" ? "offline" : state}
          retry={() => reader.notice === "offline" || reader.notice === "unavailable" ? reader.run("refresh") : refresh(true)} />
          : <div className="p-5">
            {!messages.length && <p role="status" className="py-8 text-sm text-muted-foreground">{t.noMessages}</p>}
            <ol ref={pane} aria-label={t.conversation} tabIndex={0} onScroll={remember} className="max-h-[30rem] space-y-4 overflow-y-auto pr-1 [overflow-anchor:none] focus-visible:outline-2 focus-visible:outline-ring">{messages.map((message) => <li key={message.id} id={`history-message-${message.id}`} tabIndex={-1}
              className={`max-w-[95%] break-words rounded-lg p-3 text-sm focus-visible:outline-2 focus-visible:outline-ring ${message.author.kind === "operator" ? "ml-auto bg-primary/10" : "bg-muted"}`}>
              <p className="mb-2 text-xs text-muted-foreground">{IdentitySchemas.formatDisplayName(message.author, locale)} · <time dateTime={message.createdAt}>{formatTime(message.createdAt, locale)}</time>
      </p>
              <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{message.text}</p>
            </li>)}</ol>
            <div role="status" aria-live="polite" className="mb-3 text-sm text-muted-foreground">{reader.notice === "refreshing" ? t.refreshing
              : reader.notice === "reconnecting" ? t.reconnecting : reader.notice === "recovered" ? t.recovered : ""}</div>
            {["offline", "unavailable"].includes(reader.notice) && <div role="alert" className="mb-4 text-sm">
              <p className="mb-2">{reader.notice === "offline" ? t.offline : t.readError}</p>
              <Button variant="secondary" onClick={() => reader.run("refresh")}>{t.retry}</Button>
            </div>}
            {cursor && <Button className="mt-5" variant="secondary" disabled={reader.busy} onClick={more}>{t.moreMessages}</Button>}
          </div>}
    </section>
    <aside aria-label={t.context} className="min-w-0 border-t bg-muted/20 p-5 lg:col-span-2 xl:col-span-1 xl:border-t-0 xl:border-l">
      <h3 className="mb-4 text-base font-semibold">{t.context}</h3>
      {selected && <p className="mb-5 text-sm">
      <span className="block text-muted-foreground">{t.created}</span>
      <time dateTime={selected.createdAt}>{formatTime(selected.createdAt, locale)}</time>
      </p>}
      <h4 className="mb-2 text-sm font-medium">{t.source}</h4>
      {state !== "loading" && <p className="break-all text-sm">{detail ? detail.sourceListingId ?? t.noSource : state === "unclaimed" ? t.claimContext : t.contextUnavailable}</p>}
      {detail?.sourceListingId && <p className="mt-3 text-sm text-muted-foreground">{t.sourceBody}</p>}
    </aside>
  </>;
}

export function InboxNotice({ locale, state, retry }: { locale: DeskLocale; state: string; retry: () => void }) {
  const t = deskCopy[locale];
  const query = useSearchParams().toString();
  const text = state === "expired" || state === "stale" ? t.denied : state === "loading" ? t.loading : state === "conflict" ? t.conflict
    : state === "denied" ? t.denied : state === "offline" ? t.offline : state === "validation" ? t.validation : state === "missing" ? t.missing
      : state === "conversationUnavailable" ? t.conversationError : t.error;
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
