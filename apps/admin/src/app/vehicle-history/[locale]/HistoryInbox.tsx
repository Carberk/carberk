"use client";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button, Input } from "@auto-tm/ui/components";
import { IdentitySchemas, VehicleHistorySchemas as V } from "@auto-tm/contracts";

import { historyInboxAction, type HistoryInboxResult } from "./actions";
import { SelectedRequest, InboxNotice } from "./SelectedRequest";

import { deskCopy, type DeskLocale } from "@/lib/history-desk-copy";

export function HistoryInbox({ locale, initial }: { locale: DeskLocale; initial?: HistoryInboxResult }) {
  const params = useSearchParams();
  const [localUrl, setLocalUrl] = useState<string | null>(null);
  const openedHere = useRef(false);
  const raw = localUrl ?? params.toString();
  const url = new URLSearchParams(raw);
  const query = V.HistoryQueueQuerySchema.safeParse({ filter: "unassigned",
    ...Object.fromEntries([...url].filter(([name]) => ["filter", "search", "cursor"].includes(name))) });
  const id = V.HistoryRequestSchema.shape.id.safeParse(url.get("selected"));
  const version = V.ClaimHistoryRequestSchema.shape.expectedAssignmentVersion.safeParse(Number(url.get("v") ?? 0));
  const [revision, setRevision] = useState(0);
  const [readerRevision, setReaderRevision] = useState(0);
  const queueGeneration = useRef(0);
  const queueUrl = new URLSearchParams([...url].filter(([name]) => ["filter", "search", "cursor", "selected", "v"].includes(name))).toString();
  const key = `${locale}?${queueUrl}`;
  const [queue, setQueue] = useState<{ key: string; source: HistoryInboxResult | undefined; result: HistoryInboxResult } | null>(
    initial ? { key, source: initial, result: initial } : null,
  );
  const [offline, setOffline] = useState(false);
  const [failure, setFailure] = useState<{ key: string; state: string } | null>(null);
  const [handoverNotice, setHandoverNotice] = useState<string | null>(null);
  const t = deskCopy[locale];
  const current = queue?.key === key && queue.source === initial ? queue.result : null;
  function navigate(changes: Record<string, string | null>, replace = false) {
    const next = new URLSearchParams(raw);
    for (const [name, value] of Object.entries(changes)) { if (value === null) next.delete(name); else next.set(name, value); }
    if ("selected" in changes || "filter" in changes || "search" in changes || "cursor" in changes) next.delete("source");
    const safe = new URLSearchParams([...next].filter(([name, value]) => ["filter", "search", "cursor", "selected", "v"].includes(name) || name === "source" && value === "listing"));
    window.history[replace ? "replaceState" : "pushState"](null, "", `/vehicle-history/${locale}?${safe}${window.location.hash}`);
    setLocalUrl(safe.toString());
  }
  function listing(open: boolean) {
    if (open) { openedHere.current = true; navigate({ source: "listing" }); }
    else if (openedHere.current) { openedHere.current = false; window.history.back(); }
    else navigate({ source: null }, true);
  }
  function refresh(resetSelection = false) {
    if (resetSelection) navigate({ selected: null, v: null }, true);
    setRevision((value) => value + 1);
    setReaderRevision((value) => value + 1);
  }
  useEffect(() => {
    const back = () => { openedHere.current = false; setLocalUrl(window.location.search.slice(1)); setRevision((value) => value + 1); };
    const revalidate = () => {
      setOffline(!navigator.onLine);
      if (navigator.onLine && document.visibilityState !== "hidden") setRevision((value) => value + 1);
    };
    window.addEventListener("popstate", back);
    window.addEventListener("focus", revalidate);
    window.addEventListener("online", revalidate);
    window.addEventListener("offline", revalidate);
    document.addEventListener("visibilitychange", revalidate);
    return () => {
      window.removeEventListener("popstate", back);
      window.removeEventListener("focus", revalidate);
      window.removeEventListener("online", revalidate);
      window.removeEventListener("offline", revalidate);
      document.removeEventListener("visibilitychange", revalidate);
    };
  }, []);
  useEffect(() => {
    let active = true;
    const generation = ++queueGeneration.current;
    const valid = () => active && generation === queueGeneration.current;
    const parsed = V.HistoryQueueQuerySchema.safeParse({ filter: "unassigned",
      ...Object.fromEntries([...new URLSearchParams(queueUrl)].filter(([name]) => ["filter", "search", "cursor"].includes(name))) });
    if (!parsed.success || offline) return;
    void historyInboxAction(locale, { kind: "queue", query: parsed.data,
      ...(initial?.status === "ok" ? { scope: initial.scope } : {}),
    }).then((result) => {
      if (!valid()) return;
      setFailure(result.status === "unavailable" ? { key, state: "unavailable" } : null);
      setQueue((previous) => !valid() || result.status === "unavailable" && previous?.key === key && previous.source === initial && previous.result.status === "ok"
        ? previous : { key, source: initial, result });
    }).catch(() => { if (valid()) setFailure({ key, state: "unavailable" }); });
    return () => { active = false; };
  }, [key, locale, queueUrl, revision, offline, initial]);
  const admitted = current?.status === "ok" && current.kind === "queue" ? current : null;
  const selectedRow = admitted?.data.items.find((row) => id.success && row.id === id.data);
  const assignmentLost = selectedRow && version.success && version.data > 0 &&
    (!selectedRow.mine || selectedRow.assignmentVersion !== version.data || selectedRow.assignedOperator?.id !== admitted?.actor.id);
  return <>
    <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
      <h1 className="text-2xl font-semibold tracking-tight">{t.title}</h1>
        {admitted && <p className="mt-2 text-sm text-muted-foreground">{t.actor}: <span className="font-medium text-foreground">{IdentitySchemas.formatDisplayName(admitted.actor, locale)}</span>
      </p>}</div>
      <span className="rounded-md bg-muted px-3 py-2 text-sm">{t.synthetic}</span>
    </header>
    {handoverNotice && <p role="status" aria-live="polite" className="mb-5 rounded-md border p-3 text-sm">{handoverNotice}</p>}
    <div className="mb-5 flex flex-wrap items-end gap-3">
      <div className="flex flex-wrap gap-2" aria-label={t.filter}>
        {(["unassigned", "mine"] as const).map((filter) => <Button key={filter} variant={query.success && query.data.filter === filter ? "primary" : "secondary"}
          aria-pressed={query.success && query.data.filter === filter} onClick={() => navigate({ filter, cursor: null, selected: null, v: null })}>{t[filter]}</Button>)}
      </div>
      <form className="w-full min-w-0 sm:min-w-72 sm:max-w-md sm:flex-1" onSubmit={(event) => {
        event.preventDefault(); const search = String(new FormData(event.currentTarget).get("search") ?? "").trim();
        navigate({ search: search || null, cursor: null, selected: null, v: null });
      }}>
      <label htmlFor="history-search" className="mb-1 block text-sm font-medium">{t.search}</label>
        <div className="flex gap-2">
      <Input id="history-search" name="search" type="search" className="min-w-0 flex-1" maxLength={64} defaultValue={query.success ? query.data.search : ""} key={query.success ? query.data.search : ""} />
      <Button type="submit" variant="secondary">{t.find}</Button>
      </div>
      </form>
      <Button variant="secondary" onClick={() => refresh()}>{t.refresh}</Button>
    </div>
    {admitted && !id.success && (offline || failure?.key === key) && <InboxNotice locale={locale} state={offline ? "offline" : "unavailable"} retry={() => refresh()} />}
    {!query.success ? <InboxNotice locale={locale} state="validation" retry={() => navigate({ filter: "unassigned", search: null, cursor: null, selected: null, v: null }, true)} />
      : !admitted ? <InboxNotice locale={locale} state={offline ? "offline" : current?.status ?? (failure?.key === key ? failure.state : "loading")} retry={() => refresh()} />
        : <div className="grid min-h-[34rem] overflow-hidden rounded-lg border bg-background lg:grid-cols-[15rem_minmax(0,1fr)] xl:grid-cols-[15rem_minmax(0,1fr)_22rem]">
          <section aria-labelledby="enquiry-queue" className="min-w-0 border-b p-3 lg:border-r lg:border-b-0">
            <h2 id="enquiry-queue" className="mb-3 px-2 text-base font-semibold">{t.requests}</h2>
            {!admitted.data.items.length && <p role="status" className="px-2 py-8 text-sm text-muted-foreground">{query.data.search ? t.noResults : query.data.cursor ? t.emptyPage : t.empty}</p>}
            <ul id="history-queue" className="max-h-[30rem] space-y-1 overflow-y-auto">{admitted.data.items.map((row) => <li key={row.id}>
              <a href={`/vehicle-history/${locale}?${new URLSearchParams({ ...Object.fromEntries(Object.entries(query.data).filter((entry): entry is [string, string] => typeof entry[1] === "string")), selected: row.id, v: String(row.assignmentVersion) })}`}
                aria-current={id.success && id.data === row.id ? "true" : undefined} onClick={(event) => {
                  if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                  event.preventDefault(); navigate({ selected: row.id, v: String(row.assignmentVersion) });
                }} className="block break-words rounded-md p-3 text-sm hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring aria-[current=true]:bg-primary/10">
                <strong className="block">{row.requester ? IdentitySchemas.formatDisplayName(row.requester, locale) : t.unavailablePerson}</strong>
                <span className="mt-1 block break-all text-xs text-muted-foreground">{row.id}</span>
                <span className="mt-2 block text-xs">{row.assignedOperator ? IdentitySchemas.formatDisplayName(row.assignedOperator, locale) : t.unassigned}</span>
              </a>
      </li>)}</ul>
            <div className="mt-4 flex flex-wrap gap-2">
              {query.data.cursor && <Button variant="secondary" onClick={() => navigate({ cursor: null, selected: null, v: null })}>{t.firstPage}</Button>}
              {admitted.data.nextCursor && <Button variant="secondary" onClick={() => navigate({ cursor: admitted.data.nextCursor, selected: null, v: null })}>{t.nextPage}</Button>}
            </div>
          </section>
          {id.success && version.success ? <SelectedRequest key={`${locale}:${id.data}:${version.data}:${admitted.scope}:${admitted.actor.id}:${!!assignmentLost}`} locale={locale} id={id.data} version={version.data} revision={readerRevision}
            row={selectedRow} scope={admitted.scope} actor={admitted.actor}
            listingOpen={url.get("source") === "listing"} listing={listing} returnQuery={raw}
            refresh={refresh} invalidate={(result) => { queueGeneration.current++; setQueue({ key, source: initial, result }); }}
            claimed={(assignmentVersion) => navigate({ selected: id.data, v: String(assignmentVersion) }, true)}
            handedOver={(name) => { refresh(true); setHandoverNotice(t.handoverComplete.replace("{name}", name)); }} />
            : <p className="p-6 text-sm text-muted-foreground lg:col-span-1 xl:col-span-2">{t.select}</p>}
        </div>}
  </>;
}
