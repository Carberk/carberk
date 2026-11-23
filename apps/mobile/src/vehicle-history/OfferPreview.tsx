import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, AppState, View } from "react-native";
import { focusManager, useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { HistoryOrderSchemas as H, type VehicleHistorySchemas as V } from "@auto-tm/contracts";

import { historyTranscript } from "../api/vehicle-history/messages";
import { queryKeys } from "../api/queryKeys";
import { ApiError } from "../api/client";

import { PaymentProof } from "./PaymentProof";
import { VinCorrection } from "./VinCorrection";
import { historySessionCurrent, type HistoryViewer } from "./session";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";

export function OfferPreview({ viewer, request, ready, metadataAvailable, active, connected, reconcileOrder }: {
  viewer: HistoryViewer; request: V.HistoryRequest; ready: boolean; metadataAvailable: boolean;
  active: boolean; connected: boolean; reconcileOrder: () => Promise<unknown>;
}) {
  const { t, i18n } = useTranslation();
  const { userId, sessionId } = viewer;
  const [vin, setVin] = useState(""), [saving, setSaving] = useState(false), [failed, setFailed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [orderFailure, setOrderFailure] = useState<string | null>(null);
  const mounted = useRef(true), busy = useRef(false);
  const readGeneration = useRef(0), writeGeneration = useRef(0);
  const latest = useRef({ ready, metadataAvailable, active, connected });
  const suspended = latest.current.active && !active || latest.current.connected && !connected
    || latest.current.metadataAvailable && !metadataAvailable;
  if (suspended) readGeneration.current++;
  if (suspended || latest.current.ready && !ready) writeGeneration.current++;
  latest.current = { ready, metadataAvailable, active, connected };
  const controller = useMemo(() => new AbortController(), []);
  const stream = useMemo(() => historyTranscript({ userId, sessionId }, request.id, controller.signal), [userId, sessionId, request.id, controller]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => focusManager.subscribe(() => {
    if (!focusManager.isFocused()) { readGeneration.current++; writeGeneration.current++; }
  }), []);
  const canRead = () => mounted.current && latest.current.metadataAvailable && latest.current.active && latest.current.connected
    && historySessionCurrent(viewer) && AppState.currentState === "active" && focusManager.isFocused();
  const current = () => latest.current.ready && canRead();
  const state = useQuery({ queryKey: [...queryKeys.vehicleHistory.detail(viewer.userId, viewer.sessionId, request.id), "offer", request.assignmentVersion],
    queryFn: () => { const attempt = readGeneration.current;
      const owns = () => canRead() && attempt === readGeneration.current;
      return Promise.all([stream.offer(owns), stream.order(owns)]).then(([offer, order]) => ({ offer, order })); },
    enabled: ready && active && connected, retry: false, staleTime: 0, networkMode: "always",
    refetchOnWindowFocus: false, refetchOnReconnect: false });
  const refresh = state.refetch;
  const orderState = state.data?.order;
  const accepted = orderState?.order;
  const data = accepted?.acceptedOffer ?? state.data?.offer;
  useEffect(() => {
    if (!active || !ready || !connected || !accepted || orderState.status !== "awaiting_synthetic_payment") return;
    const remaining = new Date(accepted.holdExpiresAt).getTime() - new Date(orderState.serverNow).getTime();
    const timer = setTimeout(() => { void refresh(); }, Math.max(0, remaining));
    return () => clearTimeout(timer);
  }, [active, ready, connected, accepted, orderState, refresh]);
  async function accept() {
    if (!data || !current() || busy.current || state.isFetching || state.error || accepted || vin.trim()) return;
    const parsed = H.AcceptHistoryQuoteSchema.safeParse({ offer: data });
    if (!parsed.success) return;
    busy.current = true; setSaving(true); setOrderFailure(null);
    const attempt = writeGeneration.current;
    const owns = () => current() && attempt === writeGeneration.current;
    try {
      await stream.acceptQuote(parsed.data.offer, owns);
      if (owns()) { await state.refetch(); if (owns()) await reconcileOrder(); }
    } catch (error) {
      if (!owns()) return;
      setOrderFailure(error instanceof ApiError && error.code === "HISTORY_ORDER_CAPACITY" ? "orderFull"
        : error instanceof ApiError && ["HISTORY_ORDER_STALE", "HISTORY_ORDER_CONFLICT"].includes(error.code) ? "orderStale" : "orderError");
      await state.refetch(); if (owns()) await reconcileOrder();
    } finally { busy.current = false; if (mounted.current) setSaving(false); }
  }
  async function send() {
    if (!data || !current() || !vin.trim() || busy.current || state.isFetching || state.error) return;
    busy.current = true; setSaving(true); setFailed(false);
    const attempt = writeGeneration.current;
    const owns = () => current() && attempt === writeGeneration.current;
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
  const canEdit = ready && active && connected && !saving && !accepted;
  return <View className="gap-3 rounded-2xl border border-border p-4">
    {!accepted && <Text accessibilityRole="header" className="text-headline font-semibold">{copy("title")}</Text>}
    <Text className="text-footnote text-muted-foreground">{copy("synthetic")}</Text>
    {!active || (!ready && !data) ? null : state.isPending && !error ? <ActivityIndicator accessibilityLabel={copy("loading")} />
      : error ? <View className="gap-3"><Text accessibilityRole="alert">{copy(denied ? "denied" : "error")}</Text>
        <Button variant="secondary" disabled={!ready || !connected || state.isFetching} onPress={() => { setFailed(false); setOrderFailure(null); void state.refetch(); }}><Text>{copy("refresh")}</Text></Button></View>
        : data && <>
          <Text accessibilityLiveRegion="polite">{copy(data.preflight?.status ?? (data.vin ? "unchecked" : "empty"))}</Text>
          {data.vin && <Text selectable className="text-body font-mono">VIN: {data.vin}</Text>}
          {data.preflight?.status === "available" && (!accepted || expanded) && <>
            <Text className="text-callout">{copy("rule")}</Text>
            {data.preflight.providers.map((provider) => <Text key={provider.name} className="text-callout">{provider.name} · {copy("date")}: {provider.originalReportDate ?? copy("unknown")}</Text>)}
            <Text className="text-footnote text-muted-foreground">{copy("limits")}</Text>
          </>}
          {proposal && <View className="gap-3 border-y border-border py-4">
            <Text accessibilityRole="header" className="text-headline font-semibold">{copy(accepted ? "orderSummary" : "preview")}</Text>
            <Text>{copy("format")}: {copy(proposal.format)}</Text>
            <Text>{copy("window")}: {timestamp(proposal.deliveryFrom)} – {timestamp(proposal.deliveryBy)}</Text>
            {(!accepted || expanded) && proposal.format !== "pdf" && <Text className="text-callout">{copy("links")}</Text>}
            {(!accepted || expanded) && <><Text className="text-callout">{copy("rights")}</Text><Text className="text-callout">{copy("terms")}</Text></>}
            {accepted ? <>
              <Text>{t("vehicleHistory.offerOrderPrice", { amount: accepted.acceptedOffer.proposal.priceTmt })}</Text>
              <Text>{copy("orderAccepted")}: {timestamp(accepted.acceptedAt)}</Text>
              <Text>{copy("orderHold")}: {timestamp(accepted.holdExpiresAt)}</Text>
              {orderState?.payment?.confirmedAt && <Text>{t("vehicleHistory.paymentConfirmedAt")}: {timestamp(orderState.payment.confirmedAt)}</Text>}
              {orderState?.payment?.receivedAt && <Text>{t("vehicleHistory.paymentReceivedAt")}: {timestamp(orderState.payment.receivedAt)}</Text>}
              {orderState?.wallet && ready && active && connected && !state.isFetching && <Text selectable className="font-mono text-callout">{orderState.wallet}</Text>}
              <Button variant="secondary" accessibilityState={{ expanded }} onPress={() => setExpanded(!expanded)}><Text>{copy(expanded ? "orderHideDetails" : "orderDetails")}</Text></Button>
            </> : <>
              <Text className="text-footnote text-muted-foreground">{copy("orderBefore")}</Text>
              <Button disabled={!canEdit || state.isFetching || !!vin.trim() || !!orderFailure} accessibilityState={{ busy: saving }} onPress={() => { void accept(); }}>
                <Text>{copy(saving ? "orderPending" : "orderConfirm")}</Text>
              </Button>
            </>}
            {orderFailure && !accepted && <View className="gap-3"><Text accessibilityRole="alert">{copy(orderFailure)}</Text>
              <Button variant="secondary" disabled={!ready || !active || !connected || state.isFetching} onPress={() => { setOrderFailure(null); void state.refetch(); }}><Text>{copy("refresh")}</Text></Button>
            </View>}
          </View>}
          {accepted && <PaymentProof key={`${userId}:${sessionId}:${request.id}:${accepted.id}`}
            viewer={viewer} requestId={request.id} orderId={accepted.id} ready={metadataAvailable && active && connected}
            reviewComplete={!!orderState?.payment?.confirmedAt} onSubmitted={async () => { await state.refetch(); if (canRead()) await reconcileOrder(); }} />}
          {accepted && orderState && <VinCorrection key={`correction:${userId}:${sessionId}:${request.id}`} state={orderState}
            storageKey={`carberk.history.vin-correction.v1:${userId}:${request.id}`} stream={stream}
            enabled={ready && active && connected && !state.isFetching && !state.error} current={current}
            reconcile={async () => { const result = await state.refetch(); if (result.error) throw result.error; if (canRead()) await reconcileOrder(); }} />}
          {!accepted && <><Text nativeID="history-vin-label" className="text-callout font-semibold">{copy("vin")}</Text>
          <Input accessibilityLabel={copy("vin")} accessibilityLabelledBy="history-vin-label" value={vin} onChangeText={setVin} maxLength={80}
            autoCapitalize="characters" autoCorrect={false} editable={canEdit} />
          <Button variant="secondary" disabled={!vin.trim() || !canEdit || state.isFetching} accessibilityState={{ busy: saving }} onPress={() => { void send(); }}>
            <Text>{copy(saving ? "pending" : "sendVin")}</Text>
          </Button></>}
        </>}
  </View>;
}
