import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { router, useIsFocused } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";

import { createHistoryRequest } from "../api/vehicle-history/requests";
import { queryKeys } from "../api/queryKeys";
import { useAuthIntentStore, type PendingAction } from "../auth/intentStore";
import { subscribeAuthSession } from "../auth/session";

import { vehicleHistoryAvailable } from "./availability";
import { currentHistoryViewer, historySessionCurrent, useHistoryViewer, type HistoryViewer } from "./session";

type HistoryAction = Extract<PendingAction, { kind: "history" }>;
type Attempt = {
  action: HistoryAction;
  viewer: HistoryViewer | null;
  controller: AbortController;
  running: boolean;
  auth: boolean;
  requestId?: string;
};

function attemptKey() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    return (c === "x" ? r : (r & 3) | 8).toString(16);
  });
}

/** A retry retains its attempt even if a response was lost or its caller lost focus. */
export function useHistoryContact(listingId?: string, fromHistory = false) {
  const viewer = useHistoryViewer();
  const focused = useIsFocused();
  const queryClient = useQueryClient();
  const replay = useAuthIntentStore((state) => state.replayAction);
  const attempt = useRef<Attempt | null>(null);
  const scope = useMemo(() => ({ listingId, fromHistory, mounted: true, focused: true }), [listingId, fromHistory]);
  scope.focused = focused;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    scope.mounted = true;
    const owns = (action: PendingAction | null | undefined) => action?.kind === "history" && action.attemptKey === attempt.current?.action.attemptKey;
    const discard = () => {
      const key = attempt.current?.action.attemptKey;
      attempt.current?.controller.abort();
      attempt.current = null;
      const store = useAuthIntentStore.getState();
      // Only drop this caller's work; other marketplace/auth callers keep theirs.
      if (store.intent?.action?.kind === "history" && store.intent.action.attemptKey === key) store.cancelSignIn();
      if (store.replayAction?.kind === "history" && store.replayAction.attemptKey === key) store.clearReplayAction();
      if (scope.mounted) {
        setBusy(false);
        setError(null);
        setStarted(false);
      }
    };
    const unsubscribeSession = subscribeAuthSession(() => {
      const current = attempt.current;
      if (!current) return;
      if (current.viewer && !historySessionCurrent(current.viewer)) discard();
      else if (!current.viewer && current.auth && owns(useAuthIntentStore.getState().intent?.action)) {
        // Bind the first genuine sign-in synchronously, before completeSignIn publishes replay.
        current.viewer = currentHistoryViewer();
      }
    });
    const unsubscribeIntent = useAuthIntentStore.subscribe((store) => {
      if (attempt.current?.auth && !owns(store.intent?.action) && !owns(store.replayAction)) discard();
    });
    return () => {
      scope.mounted = false;
      unsubscribeSession();
      unsubscribeIntent();
      discard();
    };
  }, [listingId, scope]);

  useEffect(() => {
    const current = attempt.current;
    if (!focused && current && !current.auth) {
      current.controller.abort();
      current.running = false;
      setBusy(false);
    }
  }, [focused]);

  const send = useCallback(async (current: Attempt) => {
    const owner = current.viewer;
    if (!owner || !historySessionCurrent(owner) || current.running || !scope.mounted || !scope.focused) return;
    if (current.controller.signal.aborted) current.controller = new AbortController();
    const controller = current.controller;
    const valid = () => scope.mounted && scope.focused && vehicleHistoryAvailable() && attempt.current === current
      && current.controller === controller && !controller.signal.aborted && historySessionCurrent(owner);
    current.running = true;
    setBusy(true);
    setError(null);
    try {
      if (!current.requestId) {
        const request = await createHistoryRequest({ attemptKey: current.action.attemptKey, sourceListingId: current.action.sourceListingId }, owner, controller.signal);
        if (!valid()) return;
        current.requestId = request.id;
        queryClient.setQueryData(queryKeys.vehicleHistory.detail(owner.userId, owner.sessionId, request.id), request);
        if (!valid()) return;
        void queryClient.invalidateQueries({ queryKey: queryKeys.vehicleHistory.list(owner.userId, owner.sessionId) });
      }
      if (valid()) router.push({ pathname: "/vehicle-history/requests/[id]", params: { id: current.requestId } });
    } catch (failure) {
      if (valid()) setError(failure);
    } finally {
      if (current.controller === controller) current.running = false;
      if (valid()) setBusy(false);
    }
  }, [queryClient, scope]);

  useEffect(() => {
    const current = attempt.current;
    if (!focused || !viewer || !current?.auth || replay?.kind !== "history" || replay.attemptKey !== current.action.attemptKey) return;
    if (!current.viewer || !historySessionCurrent(current.viewer)) return;
    current.auth = false;
    useAuthIntentStore.getState().clearReplayAction();
    void send(current);
  }, [focused, viewer, replay, send]);

  const contact = (fresh = false) => {
    if (!scope.mounted || !scope.focused || !vehicleHistoryAvailable() || viewer === undefined
      || (viewer ? !historySessionCurrent(viewer) : !!currentHistoryViewer()) || attempt.current?.running) return;
    if (attempt.current?.auth && useAuthIntentStore.getState().intent?.action === attempt.current.action) return;
    if (fresh || !attempt.current) {
      attempt.current?.controller.abort();
      attempt.current = { action: { kind: "history", attemptKey: attemptKey(), sourceListingId: listingId ?? null },
        viewer, controller: new AbortController(), running: false, auth: !viewer };
      setStarted(true);
      setError(null);
    }
    const current = attempt.current;
    if (!viewer) {
      useAuthIntentStore.getState().requireSignIn(router, {
        returnTo: fromHistory ? "/vehicle-history/requests" : { pathname: "/vehicle-history", params: listingId ? { listingId } : {} },
        action: current.action,
      });
    } else void send(current);
  };
  return { viewer, busy, error, started, existing: !!attempt.current?.requestId, contact };
}
