import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ActivityIndicator, View } from "react-native";
import { focusManager, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { VehicleHistorySchemas as V } from "@auto-tm/contracts";

import { historyTranscript } from "../api/vehicle-history/messages";
import { ApiError } from "../api/client";
import { queryKeys } from "../api/queryKeys";

import { historySessionCurrent, type HistoryViewer } from "./session";

import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";

export function StopReminders({ viewer, request, ready, active, connected, revision }: {
  viewer: HistoryViewer; request: V.HistoryRequest; ready: boolean; active: boolean; connected: boolean; revision: number;
}) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const { userId, sessionId } = viewer;
  const alive = useRef(true), busy = useRef(false);
  const latest = useRef({ ready, active }); latest.current = { ready, active };
  const intent = useRef<number | null>(null);
  const [phase, setPhase] = useState<"loading" | "" | "pending" | "uncertain" | "changed" | "denied" | "storage">("loading");
  const storageKey = `carberk.history.stop-reminders.v1:${viewer.userId}:${request.id}:${request.assignmentVersion}`;
  const visibility = useRef({ active, generation: 0 });
  if (visibility.current.active && !active) visibility.current.generation++;
  visibility.current.active = active;
  useEffect(() => focusManager.subscribe(() => {
    if (!focusManager.isFocused()) visibility.current.generation++;
  }), []);
  const restore = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(storageKey);
      if (!alive.current || !historySessionCurrent({ userId, sessionId })) return;
      intent.current = raw === null ? null : V.StopHistoryRemindersSchema.parse(JSON.parse(raw)).expectedWaitingVersion;
      setPhase(intent.current === null ? "" : "uncertain");
    } catch { if (alive.current) setPhase("storage"); }
  }, [storageKey, userId, sessionId]);
  useEffect(() => { void restore(); }, [restore]);
  const controller = useMemo(() => new AbortController(), []);
  const stream = useMemo(() => historyTranscript({ userId, sessionId }, request.id, controller.signal), [userId, sessionId, request.id, controller]);
  useEffect(() => () => { alive.current = false; controller.abort(); }, [controller]);
  function current() {
    const key = queryKeys.vehicleHistory.detail(viewer.userId, viewer.sessionId, request.id);
    const metadata = client.getQueryData<V.HistoryRequest>(key);
    return alive.current && historySessionCurrent(viewer) && latest.current.ready && latest.current.active
      && !client.getQueryState(key)?.error && client.getQueryState(key)?.fetchStatus === "idle" && metadata?.assignmentVersion === request.assignmentVersion
      && metadata?.assignedOperator?.id === request.assignedOperator?.id;
  }
  const key = [...queryKeys.vehicleHistory.detail(viewer.userId, viewer.sessionId, request.id), "reminder", request.assignmentVersion];
  const state = useQuery({ queryKey: key, queryFn: () => stream.reminder(current), enabled: ready && active && connected,
    retry: false, staleTime: 0, networkMode: "always", refetchOnWindowFocus: true, refetchOnReconnect: true });
  const reload = useRef(state.refetch); reload.current = state.refetch;
  useEffect(() => { if (ready && active && connected && !busy.current) void reload.current(); }, [revision, ready, active, connected]);
  async function stop() {
    if (["loading", "storage"].includes(phase) || busy.current || !connected || !current() || !state.data || state.isFetching || phase === "denied") return;
    const version = intent.current ?? state.data.version;
    const generation = visibility.current.generation;
    const ownsStop = () => generation === visibility.current.generation && current();
    intent.current = version; busy.current = true; setPhase("pending");
    try {
      await client.cancelQueries({ queryKey: key, exact: true });
      try { await AsyncStorage.setItem(storageKey, JSON.stringify({ expectedWaitingVersion: version })); }
      catch { setPhase("storage"); return; }
      const result = await stream.stopReminders(version, ownsStop);
      if (!ownsStop()) throw new ApiError("HISTORY_READER_CHANGED", 409);
      await client.cancelQueries({ queryKey: key, exact: true });
      if (!ownsStop()) throw new ApiError("HISTORY_READER_CHANGED", 409);
      client.setQueryData(key, result);
      await AsyncStorage.removeItem(storageKey).catch(() => {});
      if (!ownsStop()) throw new ApiError("HISTORY_READER_CHANGED", 409);
      intent.current = null; setPhase("");
    } catch (error) {
      if (!alive.current || !historySessionCurrent(viewer)) return;
      if (error instanceof ApiError && error.code === "HISTORY_REMINDER_CONFLICT" && current()) {
        const readback = await state.refetch();
        if (!current()) return;
        if (readback.data && !readback.error) {
          await AsyncStorage.removeItem(storageKey).catch(() => {});
          if (!current()) return;
          intent.current = null; setPhase(readback.data.stopped ? "" : "changed");
        }
        else setPhase("uncertain");
      } else setPhase(error instanceof ApiError && [401, 403, 404].includes(error.status) ? "denied" : "uncertain");
    } finally {
      busy.current = false;
      if (alive.current && historySessionCurrent(viewer)) setPhase((current) => current === "pending" ? "uncertain" : current);
    }
  }
  const refused = phase === "denied" || state.error instanceof ApiError && [401, 403, 404].includes(state.error.status);
  const stopped = state.data?.stopped;
  const failed = !!state.error;
  return <View className="gap-3 rounded-2xl border border-border p-4">
    <Text className="text-footnote font-semibold">{t("vehicleHistory.reminderTitle")}</Text>
    <Text accessibilityLiveRegion="polite" accessibilityRole={refused || failed ? "alert" : undefined} className="text-footnote text-muted-foreground">
      {t(refused ? "vehicleHistory.denied" : !connected ? "vehicleHistory.reminderOffline" : phase === "storage" ? "vehicleHistory.reminderStorage" : phase === "pending" ? "vehicleHistory.reminderStopping"
        : failed ? "vehicleHistory.reminderError" : stopped ? "vehicleHistory.reminderStopped"
          : phase === "uncertain" ? "vehicleHistory.reminderUncertain" : phase === "changed" ? "vehicleHistory.reminderChanged"
            : state.data?.declined ? "vehicleHistory.reminderDeclined" : "vehicleHistory.reminderHint")}
    </Text>
    {state.isPending && connected && !failed ? <ActivityIndicator accessibilityLabel={t("loading")} /> : null}
    {!refused && !stopped && <Button variant="secondary" disabled={!ready || !active || !connected || !state.data || state.isFetching || ["pending", "storage", "loading"].includes(phase) || failed}
      accessibilityState={{ busy: phase === "pending" }} onPress={() => { void stop(); }}>
      <Text>{t(phase === "uncertain" ? "vehicleHistory.reminderRetryStop" : "vehicleHistory.reminderStop")}</Text>
    </Button>}
    {(failed || refused || phase === "storage") && <Button variant="secondary" disabled={!ready || !active || !connected || state.isFetching}
      onPress={() => { void restore(); void state.refetch(); }}><Text>{t("vehicleHistory.reminderReload")}</Text></Button>}
  </View>;
}
