import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, AppState, View } from "react-native";
import { focusManager, useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { VehicleHistorySchemas as V } from "@auto-tm/contracts";

import { historyTranscript } from "../api/vehicle-history/messages";
import { queryKeys } from "../api/queryKeys";
import { ApiError } from "../api/client";

import { historySessionCurrent, type HistoryViewer } from "./session";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";

export function OfferPreview({ viewer, request, ready, active, connected, revision }: {
  viewer: HistoryViewer; request: V.HistoryRequest; ready: boolean; active: boolean; connected: boolean; revision: number;
}) {
  const { t, i18n } = useTranslation();
  const { userId, sessionId } = viewer;
  const [vin, setVin] = useState(""), [saving, setSaving] = useState(false), [failed, setFailed] = useState(false);
  const mounted = useRef(true), busy = useRef(false), generation = useRef(0);
  const latest = useRef({ ready, active, connected });
  if (latest.current.active && !active || latest.current.ready && !ready) generation.current++;
  latest.current = { ready, active, connected };
  const controller = useMemo(() => new AbortController(), []);
  const stream = useMemo(() => historyTranscript({ userId, sessionId }, request.id, controller.signal), [userId, sessionId, request.id, controller]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => focusManager.subscribe(() => { if (!focusManager.isFocused()) generation.current++; }), []);
  const current = () => mounted.current && latest.current.ready && latest.current.active && latest.current.connected && historySessionCurrent(viewer)
    && AppState.currentState === "active" && focusManager.isFocused();
  const state = useQuery({ queryKey: [...queryKeys.vehicleHistory.detail(viewer.userId, viewer.sessionId, request.id), "offer", request.assignmentVersion],
    queryFn: () => { const attempt = generation.current; return stream.offer(() => current() && attempt === generation.current); },
    enabled: ready && active && connected, retry: false, staleTime: 0, networkMode: "always" });
  const reload = useRef(state.refetch); reload.current = state.refetch;
  useEffect(() => { if (ready && active && connected && !busy.current) void reload.current(); }, [revision, ready, active, connected]);
  const data = state.data;
  async function send() {
    if (!data || !current() || !vin.trim() || busy.current || state.isFetching || state.error) return;
    busy.current = true; setSaving(true); setFailed(false);
    const attempt = generation.current;
    const owns = () => current() && attempt === generation.current;
    try {
      await stream.sendVin(vin, data.version, owns);
      if (!owns()) return;
      setVin(""); await state.refetch();
    } catch { if (owns()) setFailed(true); }
    finally { busy.current = false; if (mounted.current) setSaving(false); }
  }
  const copy = (key: string) => t(`vehicleHistory.offer${key[0]?.toUpperCase()}${key.slice(1)}`);
  const timestamp = (value: string) => new Intl.DateTimeFormat(i18n.language === "tk" ? "en-GB" : i18n.language, {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Asia/Ashgabat",
  }).format(new Date(value));
  const denied = state.error instanceof ApiError && [401, 403, 404].includes(state.error.status);
  const error = failed || !!state.error;
  const proposal = data?.proposal;
  return <View className="gap-3 rounded-2xl border border-border p-4">
    <Text accessibilityRole="header" className="text-headline font-semibold">{copy("title")}</Text>
    <Text className="text-footnote text-muted-foreground">{copy("synthetic")}</Text>
    {!ready || !active ? null : state.isPending && !error ? <ActivityIndicator accessibilityLabel={copy("loading")} />
      : error ? <View className="gap-3"><Text accessibilityRole="alert">{copy(denied ? "denied" : "error")}</Text>
        <Button variant="secondary" disabled={!connected || state.isFetching} onPress={() => { setFailed(false); void state.refetch(); }}><Text>{copy("refresh")}</Text></Button></View>
        : data && <>
          <Text accessibilityLiveRegion="polite">{copy(data.preflight?.status ?? (data.vin ? "unchecked" : "empty"))}</Text>
          {data.vin && <Text selectable className="text-body font-mono">VIN: {data.vin}</Text>}
          {data.preflight?.status === "available" && <>
            <Text className="text-callout">{copy("rule")}</Text>
            {data.preflight.providers.map((provider) => <Text key={provider.name} className="text-callout">{provider.name} · {copy("date")}: {provider.originalReportDate ?? copy("unknown")}</Text>)}
            <Text className="text-footnote text-muted-foreground">{copy("limits")}</Text>
          </>}
          {proposal && <View className="gap-3 border-y border-border py-4">
            <Text accessibilityRole="header" className="text-headline font-semibold">{copy("preview")}</Text>
            <Text>{copy("format")}: {copy(proposal.format)}</Text>
            <Text>{copy("window")}: {timestamp(proposal.deliveryFrom)} – {timestamp(proposal.deliveryBy)}</Text>
            {proposal.format !== "pdf" && <Text className="text-callout">{copy("links")}</Text>}
            <Text className="text-callout">{copy("rights")}</Text><Text className="text-callout">{copy("terms")}</Text>
            <Text className="text-footnote text-muted-foreground">{copy("next")}</Text>
          </View>}
          <Text nativeID="history-vin-label" className="text-callout font-semibold">{copy("vin")}</Text>
          <Input accessibilityLabel={copy("vin")} accessibilityLabelledBy="history-vin-label" value={vin} onChangeText={setVin} maxLength={80}
            autoCapitalize="characters" autoCorrect={false} editable={!saving} />
          <Button variant="secondary" disabled={!vin.trim() || saving || !connected || state.isFetching} accessibilityState={{ busy: saving }} onPress={() => { void send(); }}>
            <Text>{copy(saving ? "pending" : "sendVin")}</Text>
          </Button>
        </>}
  </View>;
}
