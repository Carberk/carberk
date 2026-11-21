"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@auto-tm/ui/components";
import { IdentitySchemas, type VehicleHistorySchemas as V } from "@auto-tm/contracts";

import type { HistoryInboxResult } from "./actions";
import { PrivateNotesPanel } from "./PrivateNotesPanel";
import { ReminderControl } from "./ReminderControl";
import { ReplyComposer } from "./ReplyComposer";
import { useOperatorConversation } from "./useOperatorConversation";
import { SourceListing } from "./SourceListing";
import { OfferPanel } from "./OfferPanel";
import { HandoverControl } from "./HandoverControl";


import { deskCopy, type DeskLocale } from "@/lib/history-desk-copy";

type Row = Extract<HistoryInboxResult, { kind: "queue" }>["data"]["items"][number];
export function SelectedRequest({ locale, id, version, row, scope, actor, revision, refresh, invalidate, claimed, handedOver, listingOpen, listing, returnQuery }: {
  locale: DeskLocale; id: string; version: number; row: Row | undefined; scope: string; actor: V.HistoryDesk["actor"];
  revision: number; refresh: (resetSelection?: boolean) => void; invalidate: (result: HistoryInboxResult) => void; claimed: (version: number) => void;
  handedOver: (name: string) => void;
  listingOpen: boolean; listing: (open: boolean) => void; returnQuery: string;
}) {
  const t = deskCopy[locale];
  const heading = useRef<HTMLHeadingElement>(null);
  const pane = useRef<HTMLOListElement>(null);
  const pageFocus = useRef<Element | null>(null);
  const anchor = useRef<{ id: string; offset: number; top: number } | null>(null);
  const seen = useRef(new Set<string>());
  const sourceControl = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  const returnKey = `history-return:${scope}:${actor.id}:${id}:${version}`;
  const [saved] = useState(() => {
    try {
      const value: unknown = JSON.parse(sessionStorage.getItem(returnKey) ?? "null");
      if (!value || typeof value !== "object" || !("id" in value) || typeof value.id !== "string" ||
        !(value.id === "selected-enquiry" || /^history-message-[0-9a-f-]{36}$/.test(value.id)) || !("offset" in value) || typeof value.offset !== "number" ||
        !("top" in value) || typeof value.top !== "number" || !("queueTop" in value) || typeof value.queueTop !== "number" ||
        !("windowTop" in value) || typeof value.windowTop !== "number" ||
        ![value.offset, value.top, value.queueTop, value.windowTop].every(Number.isFinite)) return null;
      return { id: value.id, offset: value.offset, top: value.top, queueTop: value.queueTop, windowTop: value.windowTop };
    } catch { return null; }
  });
  const restoring = useRef(!!saved);
  const lost = !!row && version > 0 && (!row.mine || row.assignmentVersion !== version || row.assignedOperator?.id !== actor.id);
  const reader = useOperatorConversation({ locale, id, version, scope, actorId: actor.id, revision,
    entry: lost ? "conflict" : row ? row.mine ? "loading" : "unclaimed" : version === 0 ? "missing" : "loading", invalidate, claimed });
  const { detail, messages, cursor } = reader;
  const state = lost ? "conflict" : reader.state;
  const receiptFailed = reader.receiptState === "error";
  const { acknowledgeRead, notice } = reader;
  useEffect(() => {
    if (state !== "ready") return;
    let cancelled = false, timer: number | undefined;
    const started = new Map<string, number>();
    function eligible() {
      const node = pane.current;
      if (cancelled || listingOpen || !node || !navigator.onLine || !document.hasFocus() || document.visibilityState !== "visible"
        || receiptFailed || ["offline", "unavailable", "reconnecting"].includes(notice)) return [];
      const box = node.getBoundingClientRect(), viewport = window.visualViewport;
      const top = Math.max(box.top, viewport?.offsetTop ?? 0);
      const bottom = Math.min(box.bottom, (viewport?.offsetTop ?? 0) + (viewport?.height ?? window.innerHeight));
      const left = Math.max(box.left, viewport?.offsetLeft ?? 0);
      const right = Math.min(box.right, (viewport?.offsetLeft ?? 0) + (viewport?.width ?? window.innerWidth));
      if (bottom <= top || right <= left) return [];
      return messages.filter((message) => {
        const row = document.getElementById(`history-message-${message.id}`)?.getBoundingClientRect();
        if (!row || row.height <= 0 || row.left < left || row.right > right) return false;
        const visible = Math.min(row.bottom, bottom) - Math.max(row.top, top);
        return visible > 0 && (row.top >= top && row.bottom <= bottom || visible >= (bottom - top) / 2);
      }).map((message) => message.id);
    }
    function scan() {
      window.clearTimeout(timer);
      const visible = new Set(eligible()), now = performance.now();
      for (const id of started.keys()) if (!visible.has(id)) started.delete(id);
      const waits: number[] = [];
      for (const id of visible) {
        if (!started.has(id)) started.set(id, now);
        const elapsed = now - (started.get(id) ?? now);
        if (elapsed >= 300) seen.current.add(id);
        else waits.push(300 - elapsed);
      }
      let through: V.HistoryMessage | undefined;
      for (const message of messages) { if (!seen.current.has(message.id)) break; through = message; }
      if (through && visible.has(through.id) && now - (started.get(through.id) ?? now) >= 300) {
        const target = through;
        acknowledgeRead(target, () => !cancelled && eligible().includes(target.id)
          && performance.now() - (started.get(target.id) ?? performance.now()) >= 300);
      }
      if (waits.length) timer = window.setTimeout(scan, Math.min(...waits));
    }
    const node = pane.current;
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(scan);
    if (node) { observer?.observe(node); for (const child of node.children) observer?.observe(child); }
    const events = ["scroll", "resize", "focus", "blur", "online", "offline"];
    for (const event of events) window.addEventListener(event, scan, true);
    document.addEventListener("visibilitychange", scan);
    window.visualViewport?.addEventListener("resize", scan);
    window.visualViewport?.addEventListener("scroll", scan);
    scan();
    return () => {
      cancelled = true; window.clearTimeout(timer); observer?.disconnect();
      for (const event of events) window.removeEventListener(event, scan, true);
      document.removeEventListener("visibilitychange", scan);
      window.visualViewport?.removeEventListener("resize", scan);
      window.visualViewport?.removeEventListener("scroll", scan);
    };
  }, [messages, state, notice, receiptFailed, acknowledgeRead, listingOpen]);
  useLayoutEffect(() => {
    if (wasOpen.current && !listingOpen) (sourceControl.current ?? heading.current)?.focus({ preventScroll: true });
    wasOpen.current = listingOpen;
  }, [listingOpen]);
  const remember = useCallback(() => {
    const node = pane.current;
    if (!node || restoring.current) return;
    const top = node.getBoundingClientRect().top;
    const visible = [...node.children].find((child) => child.getBoundingClientRect().bottom > top);
    anchor.current = visible ? { id: visible.id, offset: visible.getBoundingClientRect().top - top, top: node.scrollTop }
      : { id: "selected-enquiry", offset: 0, top: node.scrollTop };
    if (anchor.current) {
      try { sessionStorage.setItem(returnKey, JSON.stringify({ ...anchor.current,
        queueTop: document.getElementById("history-queue")?.scrollTop ?? 0, windowTop: window.scrollY })); } catch { return; }
    }
  }, [returnKey]);
  useEffect(() => { heading.current?.focus(); }, []);
  useLayoutEffect(() => {
    const node = pane.current;
    if (!node) return;
    if (restoring.current && saved) {
      const target = document.getElementById(saved.id);
      if (!target && cursor && !reader.busy && !reader.notice) { reader.run("page"); return; }
      if (!target && cursor) return;
      anchor.current = saved;
      restoring.current = false;
      const queue = document.getElementById("history-queue");
      if (queue) queue.scrollTop = saved.queueTop;
      window.scrollTo({ top: saved.windowTop, behavior: "instant" });
      node.scrollTop = saved.top;
    }
  });
  useLayoutEffect(() => {
    const node = pane.current;
    if (!node || restoring.current) return;
    const position = anchor.current;
    if (position) {
      const row = document.getElementById(position.id);
      node.scrollTop += row && node.contains(row) ? row.getBoundingClientRect().top - node.getBoundingClientRect().top - position.offset : position.top - node.scrollTop;
    }
    if (reader.focusId && (document.activeElement === pageFocus.current || document.activeElement === document.body)) {
      document.getElementById(`history-message-${reader.focusId}`)?.focus({ preventScroll: true });
    } else if (pageFocus.current && !pageFocus.current.isConnected && document.activeElement === document.body) {
      node.focus({ preventScroll: true });
    }
    remember();
  }, [messages, reader.focusId, remember]);
  useEffect(() => {
    window.addEventListener("pagehide", remember);
    window.addEventListener("beforeunload", remember);
    return () => { window.removeEventListener("pagehide", remember); window.removeEventListener("beforeunload", remember); };
  }, [remember]);
  function more() { remember(); pageFocus.current = document.activeElement; reader.run("page"); }
  function recover() { remember(); pageFocus.current = document.activeElement; reader.run("refresh"); }
  const selected = detail ?? row;
  const other = reader.receipts.find((receipt) => receipt.assignmentVersion === 0 && receipt.participantId !== actor.id);
  const messageStatus = (message: V.HistoryMessage) => other && BigInt(other.readOrder) >= BigInt(message.order) ? t.read
    : other && BigInt(other.receivedOrder) >= BigInt(message.order) ? t.delivered : t.sent;
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
        {state === "ready" && <div className="mt-4"><HandoverControl locale={locale} id={id} version={version} scope={scope} actorId={actor.id}
          onSuccess={handedOver} onRefresh={() => refresh(true)} onInvalidate={(status) => invalidate({ status })} /></div>}
      </header>
      {state === "unclaimed" ? <div className="space-y-4 p-5 text-sm">
      <p>{t.claimBody}</p>
      <Button disabled={reader.busy} aria-busy={reader.busy} onClick={() => reader.run("claim")}>{t.claim}</Button>
      {["offline", "unavailable"].includes(reader.notice) && <InboxNotice locale={locale} state={reader.notice} retry={() => reader.run("claim")} />}
      </div>
        : state !== "ready" ? <InboxNotice locale={locale} state={lost ? "assignmentLost" : reader.notice === "unavailable" ? "conversationUnavailable" : reader.notice === "offline" ? "offline" : state}
          retry={() => reader.notice === "offline" || reader.notice === "unavailable" ? recover() : refresh(true)} />
          : <div className="p-5">
            {!messages.length && <p role="status" className="py-8 text-sm text-muted-foreground">{t.noMessages}</p>}
            <ol ref={pane} aria-label={t.conversation} tabIndex={0} onScroll={remember} className="max-h-[30rem] space-y-4 overflow-y-auto pr-1 [overflow-anchor:none] focus-visible:outline-2 focus-visible:outline-ring">{messages.map((message) => <li key={message.id} id={`history-message-${message.id}`} tabIndex={-1}
              className={`max-w-[95%] break-words rounded-lg p-3 text-sm focus-visible:outline-2 focus-visible:outline-ring ${message.author.kind === "operator" ? "ml-auto bg-primary/10" : "bg-muted"}`}>
              <p className="mb-2 text-xs text-muted-foreground">{IdentitySchemas.formatDisplayName(message.author, locale)} · <time dateTime={message.createdAt}>{formatTime(message.createdAt, locale)}</time>
      </p>
              <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{message.text}</p>
              {message.author.kind === "operator" && <p role="status" aria-live="polite" className="mt-2 text-xs text-foreground/80">{messageStatus(message)}</p>}
            </li>)}</ol>
            <div role="status" aria-live="polite" className="mb-3 text-sm text-muted-foreground">{reader.notice === "refreshing" ? t.refreshing
              : reader.notice === "reconnecting" ? t.reconnecting : reader.notice === "recovered" ? t.recovered
                : reader.receiptState === "loading" ? t.receiptUpdating : reader.receiptState === "updated" ? t.receiptUpdated : ""}</div>
            {receiptFailed && !["offline", "unavailable"].includes(reader.notice) && <div role="alert" className="mb-4 text-sm">
              <p className="mb-2">{t.receiptError}</p>
              <Button variant="secondary" onClick={recover}>{t.retry}</Button>
            </div>}
            {["offline", "unavailable"].includes(reader.notice) && <div role="alert" className="mb-4 text-sm">
              <p className="mb-2">{reader.notice === "offline" ? t.offline : t.readError}</p>
              <Button variant="secondary" onClick={recover}>{t.retry}</Button>
            </div>}
            {cursor && <Button className="mt-5" variant="secondary" disabled={reader.busy} onClick={more}>{t.moreMessages}</Button>}
            <ReplyComposer locale={locale} actorId={actor.id} id={id} version={version} messages={messages} send={reader.send} busy={reader.busy} offline={reader.notice === "offline"} />
            <ReminderControl locale={locale} actorId={actor.id} id={id} version={version} data={reader.reminder} error={reader.reminderError}
              busy={reader.busy} offline={reader.notice === "offline"} send={reader.remind} refresh={recover} />
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
      {state === "ready" && detail?.sourceListingId && <Button ref={sourceControl} type="button" size="lg" variant="secondary" className="mt-4 max-w-full whitespace-normal" onClick={() => { remember(); listing(true); }}>{t.viewListing}</Button>}
      {state === "ready" && <OfferPanel key={`${scope}:${actor.id}:${id}:${version}`} locale={locale} id={id} version={version} scope={scope} actorId={actor.id} revision={revision} invalidate={invalidate} />}
      {state === "ready" && <PrivateNotesPanel locale={locale} id={id} version={version} scope={scope} actorId={actor.id}
        revision={revision} invalidate={invalidate} />}
    </aside>
    {state === "ready" && <SourceListing key={detail?.sourceListingId ?? "absent"} open={listingOpen} locale={locale} id={id} scope={scope} actorId={actor.id}
      expectedAssignmentVersion={version} returnQuery={returnQuery} onClose={() => listing(false)}
      onInvalidate={(failure) => {
        if (failure.status === "stale" || failure.status === "expired") invalidate({ status: failure.status });
        else { recover(); }
      }} />}
  </>;
}

export function InboxNotice({ locale, state, retry }: { locale: DeskLocale; state: string; retry: () => void }) {
  const t = deskCopy[locale];
  const query = useSearchParams().toString();
  const text = state === "expired" || state === "stale" ? t.denied : state === "loading" ? t.loading : state === "conflict" ? t.conflict
    : state === "assignmentLost" ? t.assignmentLost
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
