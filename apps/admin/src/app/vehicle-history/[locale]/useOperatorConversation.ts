"use client";
import { useEffect, useRef, useState } from "react";
import type { VehicleHistorySchemas as V } from "@auto-tm/contracts";

import { historyInboxAction, type HistoryInboxResult } from "./actions";

import type { DeskLocale } from "@/lib/history-desk-copy";

type Detail = Extract<HistoryInboxResult, { kind: "detail" | "claim" }>["data"];
type Work = "refresh" | "page" | "claim";
type Reader = { detail: Detail | null; messages: V.HistoryMessage[]; cursor: string | null;
  state: string; notice: string; busy: boolean; focusId: string | null };

/** The keyed selection owns one HTTP lane. Scope correlates the stable session;
 * every production action independently checks current authority on both sides. */
export function useOperatorConversation({ locale, id, version, scope, actorId, entry, revision, invalidate, claimed }: {
  locale: DeskLocale; id: string; version: number; scope: string; actorId: string;
  entry: "loading" | "unclaimed" | "missing" | "conflict"; revision: number;
  invalidate: (result: HistoryInboxResult) => void; claimed: (version: number) => void;
}) {
  const [reader, setReader] = useState<Reader>({ detail: null, messages: [], cursor: null,
    state: entry, notice: "", busy: false, focusId: null });
  const driver = useRef<(work: Work) => void>(() => {});
  const callbacks = useRef({ invalidate, claimed });
  useEffect(() => { callbacks.current = { invalidate, claimed }; });
  useEffect(() => {
    let active = true, busy = false, refused = false, pendingRefresh = false;
    let current: Reader = { detail: null, messages: [], cursor: null, state: entry, notice: "", busy: false, focusId: null };
    const valid = () => active && !refused;
    function publish(patch: Partial<Reader>) {
      if (!valid()) return;
      current = { ...current, ...patch };
      setReader(current);
    }
    function accept(result: HistoryInboxResult) {
      if (!valid()) return false;
      const failure = result.status !== "ok" ? result.status
        : result.scope !== scope || result.actor.id !== actorId ? "stale" : null;
      if (failure && failure !== "unavailable") {
        publish({ detail: null, messages: [], cursor: null, state: failure, notice: "", busy: false });
        refused = true;
        pendingRefresh = false;
        if (["stale", "expired", "denied"].includes(failure)) callbacks.current.invalidate({ status: failure as "stale" | "expired" | "denied" });
        return false;
      }
      if (failure || !navigator.onLine) throw new Error("Recoverable read failure");
      return true;
    }
    async function run(work: Work) {
      if (!valid()) return;
      if (busy) { if (work === "refresh") pendingRefresh = true; return; }
      if (!navigator.onLine) { publish({ notice: "offline" }); return; }
      busy = true;
      const recovering = ["offline", "unavailable", "reconnecting"].includes(current.notice);
      const recovered = current.notice === "recovered";
      publish({ busy: true, notice: recovering ? "reconnecting" : recovered ? "recovered" : "refreshing", focusId: null });
      try {
        const selection = { id, scope, expectedAssignmentVersion: version };
        const result = await historyInboxAction(locale, { ...selection, kind: work === "claim" ? "claim" : "detail" });
        if (!accept(result) || result.status !== "ok") return;
        if (result.kind === "claim") { callbacks.current.claimed(result.data.assignmentVersion); return; }
        if (result.kind !== "detail") throw new Error("Unexpected detail result");
        const last = current.messages.at(-1);
        const cursor = work === "page" ? current.cursor : last?.id;
        const page = await historyInboxAction(locale, { ...selection, kind: "transcript", ...(cursor ? { cursor } : {}) });
        if (!accept(page) || page.status !== "ok") return;
        if (page.kind !== "transcript") throw new Error("Unexpected transcript result");
        let order = last ? BigInt(last.order) : 0n;
        const ids = new Set(current.messages.map((message) => message.id));
        for (const message of page.data.items) {
          if (ids.has(message.id) || BigInt(message.order) !== order + 1n) throw new Error("Noncontiguous transcript");
          ids.add(message.id);
          order = BigInt(message.order);
        }
        if (page.data.nextCursor && page.data.nextCursor !== page.data.items.at(-1)?.id) throw new Error("Invalid page frontier");
        publish({ detail: result.data, messages: [...current.messages, ...page.data.items], cursor: page.data.nextCursor,
          state: "ready", notice: recovering || recovered ? "recovered" : "", focusId: work === "page" ? page.data.items[0]?.id ?? null : null });
      } catch {
        publish({ notice: navigator.onLine ? "unavailable" : "offline" });
      } finally {
        busy = false;
        publish({ busy: false });
        if (valid() && pendingRefresh) { pendingRefresh = false; void run("refresh"); }
      }
    }
    driver.current = (work) => { void run(work); };
    if (!navigator.onLine) publish({ notice: "offline" });
    if (entry === "loading") void run("refresh");
    const reconcile = () => {
      if (!navigator.onLine) publish({ notice: "offline" });
      else if (entry !== "loading") publish({ notice: "" });
      else if (document.visibilityState !== "hidden") void run("refresh");
    };
    window.addEventListener("focus", reconcile);
    window.addEventListener("online", reconcile);
    window.addEventListener("offline", reconcile);
    document.addEventListener("visibilitychange", reconcile);
    const poll = window.setInterval(reconcile, 30_000);
    return () => {
      active = false;
      driver.current = () => {};
      window.clearInterval(poll);
      window.removeEventListener("focus", reconcile);
      window.removeEventListener("online", reconcile);
      window.removeEventListener("offline", reconcile);
      document.removeEventListener("visibilitychange", reconcile);
    };
    // A selection is keyed by locale, request, assignment and stable-session scope.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const previousRevision = useRef(revision);
  useEffect(() => {
    if (previousRevision.current !== revision && entry === "loading") driver.current("refresh");
    previousRevision.current = revision;
  }, [revision, entry]);
  return { ...reader, run: (work: Work) => driver.current(work) };
}
