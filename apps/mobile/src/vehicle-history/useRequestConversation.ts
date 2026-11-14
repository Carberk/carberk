import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { AppState } from "react-native";
import { useIsFocused } from "expo-router";
import { focusManager, onlineManager, useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import type { VehicleHistorySchemas } from "@auto-tm/contracts";

import { historyTranscript } from "../api/vehicle-history/messages";
import { queryKeys } from "../api/queryKeys";
import { ApiError } from "../api/client";

import type { HistoryViewer } from "./session";

const subscribeFocus = (listener: () => void) => focusManager.subscribe(listener);
const subscribeOnline = (listener: () => void) => onlineManager.subscribe(listener);
const focused = () => focusManager.isFocused();
const online = () => onlineManager.isOnline();
const options = { retry: false, staleTime: 0, networkMode: "always" as const };

export function useRequestConversation(viewer: HistoryViewer, request: VehicleHistorySchemas.HistoryRequest, metadataCurrent: boolean) {
  const readerId = useId();
  const { userId, sessionId } = viewer;
  const client = useQueryClient();
  const routeFocused = useIsFocused();
  const foreground = useSyncExternalStore(subscribeFocus, focused);
  const connected = useSyncExternalStore(subscribeOnline, online);
  const active = routeFocused && foreground && AppState.currentState === "active";
  const controller = useMemo(() => new AbortController(), []);
  const stream = useMemo(() => historyTranscript({ userId, sessionId }, request.id, controller.signal), [userId, sessionId, request.id, controller]);
  const key = queryKeys.vehicleHistory.transcript(viewer.userId, viewer.sessionId, request.id,
    request.assignmentVersion, request.assignedOperator?.id, readerId);
  const pages = useInfiniteQuery({ ...options, queryKey: key, initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => stream.page(pageParam), getNextPageParam: (page) => page.nextCursor,
    refetchOnWindowFocus: false, refetchOnReconnect: false,
  });
  const receipts = useQuery({ ...options, queryKey: [...key, "receipts"], queryFn: stream.receipts });
  const receiptAccessDenied = receipts.error instanceof ApiError && [401, 403, 404].includes(receipts.error.status);
  const messages = pages.data?.pages.flatMap((page) => page.items) ?? [];
  const [visibleIds, setVisibleIds] = useState<string[]>([]);
  const [receiptError, setReceiptError] = useState<unknown>(null);
  const [retry, setRetry] = useState(0);
  const alive = useRef(true);
  const visibility = useRef({ active, visibleIds, metadataCurrent });
  visibility.current = { active: active && metadataCurrent && !pages.error && !receiptAccessDenied, visibleIds, metadataCurrent };
  const received = useRef<string | undefined>(undefined);
  const read = useRef<string | undefined>(undefined);
  const busy = useRef(false);
  const reconcile = useRef(async () => {});
  reconcile.current = async () => {
    if (pages.isPending) return;
    const detailKey = queryKeys.vehicleHistory.detail(viewer.userId, viewer.sessionId, request.id);
    await client.refetchQueries({ queryKey: detailKey, exact: true });
    const current = client.getQueryData<VehicleHistorySchemas.HistoryRequest>(detailKey);
    if (!alive.current || client.getQueryState(detailKey)?.error || current?.assignmentVersion !== request.assignmentVersion
      || current?.assignedOperator?.id !== request.assignedOperator?.id) return;
    await Promise.all([pages.refetch(), receipts.refetch()]);
  };
  useEffect(() => () => { alive.current = false; controller.abort(); }, [controller]);
  useEffect(() => {
    if (!active || !connected) return;
    void reconcile.current();
    const timer = setInterval(() => void reconcile.current(), 15_000);
    return () => clearInterval(timer);
  }, [active, connected]);
  const tail = messages.at(-1)?.id;
  const visible = messages.filter((message) => visibleIds.includes(message.id)).at(-1)?.id;
  useEffect(() => {
    if (!active || !metadataCurrent || !connected || pages.isFetching || pages.error || receiptAccessDenied || !tail || receiptError || busy.current) return;
    if (received.current === tail && (!visible || read.current === visible)) return;
    busy.current = true;
    void (async () => {
      try {
        if (received.current !== tail) {
          await stream.acknowledge(tail, "received", () => visibility.current.metadataCurrent);
          received.current = tail;
        }
        if (visible && read.current !== visible && visibility.current.active && visibility.current.visibleIds.includes(visible)) {
          await stream.acknowledge(visible, "read", () => visibility.current.active
            && AppState.currentState === "active" && visibility.current.visibleIds.includes(visible));
          read.current = visible;
        }
      } catch (error) {
        if (alive.current && !(error instanceof ApiError && error.code === "HISTORY_READER_CHANGED")) setReceiptError(error);
      } finally {
        busy.current = false;
        if (alive.current) setRetry((value) => value + 1);
      }
    })();
  }, [active, metadataCurrent, connected, pages.isFetching, pages.error, receiptAccessDenied, tail, visible, receiptError, retry, stream]);
  return { messages, pages, receipts, receiptError, connected, active, setVisibleIds,
    refresh: () => reconcile.current(),
    retryReceipt: () => { setReceiptError(null); setRetry((value) => value + 1); },
  };
}
