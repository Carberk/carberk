"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { VehicleHistorySchemas as V } from "@auto-tm/contracts";

import { historyInboxAction, historyMessageAction, type HistoryInboxResult, type HistoryMessageResult } from "./actions";

import type { DeskLocale } from "@/lib/history-desk-copy";

type Detail = Extract<HistoryInboxResult, { kind: "detail" | "claim" }>["data"];
type Read = { message: V.HistoryMessage; eligible: () => boolean };
export type ReplyIntent = { clientMessageId: string; text: string };
type Send = { body: ReplyIntent; complete: (result: HistoryMessageResult) => void };
type Work = "refresh" | "page" | "claim" | Read | Send;
type Reader = { detail: Detail | null; messages: V.HistoryMessage[]; cursor: string | null;
  receipts: ReturnType<typeof V.HistoryReceiptsSchema.parse>["items"]; receiptState: "" | "loading" | "error" | "updated";
  state: string; notice: string; busy: boolean; focusId: string | null };

/** The keyed selection owns one HTTP lane. Scope correlates the stable session;
 * every production action independently checks current authority on both sides. */
export function useOperatorConversation({ locale, id, version, scope, actorId, entry, revision, invalidate, claimed }: {
  locale: DeskLocale; id: string; version: number; scope: string; actorId: string;
  entry: "loading" | "unclaimed" | "missing" | "conflict"; revision: number;
  invalidate: (result: HistoryInboxResult) => void; claimed: (version: number) => void;
}) {
  const [reader, setReader] = useState<Reader>({ detail: null, messages: [], cursor: null,
    receipts: [], receiptState: "", state: entry, notice: "", busy: false, focusId: null });
  const driver = useRef<(work: Work) => boolean>(() => false);
  const callbacks = useRef({ invalidate, claimed });
  useEffect(() => { callbacks.current = { invalidate, claimed }; });
  useEffect(() => {
    let active = true, busy = false, refused = false, pendingRefresh = false;
    let received = 0n, read = 0n, pendingRead: Read | null = null;
    let current: Reader = { detail: null, messages: [], cursor: null, receipts: [], receiptState: "", state: entry, notice: "", busy: false, focusId: null };
    const valid = () => active && !refused;
    function publish(patch: Partial<Reader>) {
      if (!valid()) return;
      current = { ...current, ...patch };
      setReader(current);
    }
    function accept(result: HistoryInboxResult | HistoryMessageResult) {
      if (!valid()) return false;
      const failure = result.status !== "ok" ? result.status
        : result.scope !== scope || result.actor.id !== actorId ? "stale" : null;
      if (failure && failure !== "unavailable") {
        publish({ detail: null, messages: [], receipts: [], receiptState: "", cursor: null, state: failure, notice: "", busy: false });
        refused = true;
        pendingRefresh = false;
        if (["stale", "expired", "denied"].includes(failure)) callbacks.current.invalidate({ status: failure as "stale" | "expired" | "denied" });
        return false;
      }
      if (failure || !navigator.onLine) throw new Error("Recoverable read failure");
      return true;
    }
    async function acknowledge(message: V.HistoryMessage, kind: "received" | "read", eligible = () => true) {
      if (!valid() || !eligible()) return false;
      const result = await historyMessageAction(locale, { id, scope, expectedAssignmentVersion: version,
        kind: "ack", throughOrder: message.order, body: { cursor: message.id, kind } });
      if (!accept(result) || result.status !== "ok") return false;
      if (result.kind !== "ack") throw new Error("Unexpected acknowledgement result");
      return eligible();
    }
    async function run(work: Work) {
      if (!valid()) return;
      if (busy) { if (work === "refresh") pendingRefresh = true; else if (typeof work === "object" && "message" in work) pendingRead = work; return; }
      if (!navigator.onLine) { publish({ notice: "offline" }); return; }
      if (typeof work === "object" && "message" in work && (!work.eligible() || !current.detail || current.receiptState === "error" || ["offline", "unavailable", "reconnecting"].includes(current.notice)
        || !current.messages.some((message) => message.id === work.message.id && message.order === work.message.order)
        || BigInt(work.message.order) > received || BigInt(work.message.order) <= read)) return;
      busy = true;
      const recovering = ["offline", "unavailable", "reconnecting"].includes(current.notice);
      const recovered = current.notice === "recovered";
      let receiptWork = typeof work === "object" && "message" in work;
      publish({ busy: true, ...(typeof work === "object" ? {} : { notice: recovering ? "reconnecting" : recovered ? "recovered" : "refreshing", focusId: null }) });
      try {
        if (typeof work === "object" && "body" in work) {
          const result = await historyMessageAction(locale, { id, scope, expectedAssignmentVersion: version, kind: "send", body: work.body });
          if (!accept(result)) return;
          work.complete(result);
          if (result.status === "ok") pendingRefresh = true;
          return;
        }
        if (typeof work === "object") {
          publish({ receiptState: "loading" });
          if (await acknowledge(work.message, "read", work.eligible)) {
            read = BigInt(work.message.order);
            publish({ receiptState: "updated" });
          } else publish({ receiptState: "" });
          return;
        }
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
        receiptWork = true;
        publish({ receiptState: "loading" });
        const receipts = await historyMessageAction(locale, { ...selection, kind: "receipts" });
        if (!accept(receipts) || receipts.status !== "ok") return;
        if (receipts.kind !== "receipts") throw new Error("Unexpected receipt result");
        publish({ receipts: receipts.data.items });
        const tail = current.messages.at(-1);
        if (tail && BigInt(tail.order) > received && await acknowledge(tail, "received")) received = BigInt(tail.order);
        publish({ receiptState: "updated" });
      } catch {
        if (typeof work === "object" && "body" in work) {
          if (valid()) work.complete({ status: "unavailable" });
          if (!navigator.onLine) publish({ notice: "offline" });
          return;
        }
        publish(receiptWork ? { receiptState: "error", ...(!navigator.onLine ? { notice: "offline" } : {}) }
          : { notice: navigator.onLine ? "unavailable" : "offline" });
      } finally {
        busy = false;
        publish({ busy: false });
        if (valid() && pendingRefresh) { pendingRefresh = false; void run("refresh"); }
        else if (valid() && pendingRead) { const next = pendingRead; pendingRead = null; void run(next); }
      }
    }
    driver.current = (work) => {
      if (!valid() || typeof work === "object" && "body" in work && (busy || !navigator.onLine || current.state !== "ready")) return false;
      void run(work);
      return true;
    };
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
      driver.current = () => false;
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
  const acknowledgeRead = useCallback((message: V.HistoryMessage, eligible: () => boolean) => driver.current({ message, eligible }), []);
  const send = useCallback((body: ReplyIntent, complete: Send["complete"]) => driver.current({ body, complete }), []);
  return { ...reader, acknowledgeRead, send, run: (work: Work) => driver.current(work) };
}
