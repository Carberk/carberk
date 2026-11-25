import { useEffect, useEffectEvent, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, ActivityIndicator, AppState, Keyboard, View } from "react-native";
import { router } from "expo-router";
import { focusManager, useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { HistoryOrderSchemas as H, type HistoryReportArtifactSchemas as R, type VehicleHistorySchemas as V } from "@auto-tm/contracts";

import { historyTranscript } from "../api/vehicle-history/messages";
import { queryKeys } from "../api/queryKeys";
import { ApiError } from "../api/client";

import { ReplacementBooking } from "./ReplacementBooking";
import { PromiseRecovery, type RecoveryChoice } from "./PromiseRecovery";
import { formatHistoryDeadline } from "./formatHistoryDeadline";
import { historyAttemptKey } from "./historyAttemptKey";
import { PaymentProof } from "./PaymentProof";
import { VinCorrection } from "./VinCorrection";
import { historySessionCurrent, type HistoryViewer } from "./session";

import { ErrorState } from "@/components/ErrorState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";

export function OfferPreview({ viewer, request, ready, metadataAvailable, active, connected, recoveryVersion, orderReadError, reconcileOrder,
  revealDecision, onRepeatDecisionChange }: {
  viewer: HistoryViewer; request: V.HistoryRequest; ready: boolean; metadataAvailable: boolean;
  active: boolean; connected: boolean; recoveryVersion?: number | undefined; orderReadError: unknown; reconcileOrder: () => Promise<unknown>;
  revealDecision: (kind: "quote" | "repeat", view: View, current: () => boolean) => void;
  onRepeatDecisionChange: (visible: boolean) => void;
}) {
  const { t, i18n } = useTranslation();
  const { userId, sessionId } = viewer;
  const [vin, setVin] = useState(""), [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState<"denied" | "error" | null>(null);
  const [repeat, setRepeat] = useState<{ vin: string; generation: number; version: number;
    purchase: NonNullable<R.HistoryPreviousPurchase["previous"]> } | null>(null);
  const repeatPrompt = useRef<View>(null);
  const quoteTerms = useRef<View>(null);
  const revealedQuote = useRef<number | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [orderFailure, setOrderFailure] = useState<string | null>(null);
  const [replacementIssue, setReplacementIssue] = useState<"Full" | "Changed" | "Denied" | "Unavailable" | null>(null);
  const [deciding, setDeciding] = useState(false);
  const [recoveryIssue, setRecoveryIssue] = useState<"changed" | "denied" | "unavailable" | null>(null);
  const recoveryAttempt = useRef<H.HistoryRecoveryDecision | null>(null);
  const mounted = useRef(true), busy = useRef(false);
  const reopenGeneration = useRef<number | null>(null);
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
  const refreshSummary = useRef(reconcileOrder);
  refreshSummary.current = reconcileOrder;
  const orderState = state.data?.order;
  const accepted = orderState?.order;
  const data = accepted?.acceptedOffer ?? state.data?.offer;
  const replacement = orderState?.replacement;
  const recovery = orderState?.recovery;
  const refundRecorded = !!orderState?.refund;
  useEffect(() => {
    if (refundRecorded && ready && active && connected) void reconcileOrder();
  }, [refundRecorded, ready, active, connected, reconcileOrder]);
  useEffect(() => {
    if (ready && active && connected && recoveryVersion !== undefined && recoveryVersion > (recovery?.version ?? 0)) void refresh();
  }, [active, connected, ready, recoveryVersion, recovery?.version, refresh]);
  useEffect(() => {
    if (!active || !ready || !connected || !accepted) return;
    const serverNow = Date.parse(orderState.serverNow);
    const boundaries = [
      !orderState.payment?.confirmedAt && (orderState.paymentDeadline ?? accepted.holdExpiresAt),
      orderState.verificationResumesAt,
      replacement?.status === "proposed" && replacement.window.deliveryFrom,
      orderState.payment?.bookingCommitted && (recovery?.status === "offered" ? recovery.offeredDeadline
        : recovery?.status === "agreed" ? recovery.agreedDeadline : recovery?.status === "refund_decision_pending" ? null
          : replacement?.status === "accepted" ? replacement.window.deliveryBy : accepted.acceptedOffer.proposal.deliveryBy),
    ].flatMap((value) => value && Date.parse(value) > serverNow ? [Date.parse(value) - serverNow] : []);
    if (!boundaries.length) return;
    const timer = setTimeout(() => { void refresh(); void refreshSummary.current(); }, Math.min(...boundaries));
    return () => clearTimeout(timer);
  }, [active, ready, connected, accepted, orderState, replacement, recovery, refresh]);
  async function refreshReplacement() {
    const result = await state.refetch();
    if (!current()) return;
    await reconcileOrder();
    if (current() && !result.error) setReplacementIssue(null);
  }
  async function decideReplacement(kind: "accept" | "decline") {
    if (!accepted || !replacement || replacementIssue || !current() || busy.current || state.isFetching || state.error) return;
    busy.current = true; setDeciding(true);
    const attempt = writeGeneration.current;
    const owns = () => current() && attempt === writeGeneration.current;
    try {
      await stream.decideReplacement({ kind, attemptKey: historyAttemptKey(), orderId: accepted.id, expectedVersion: replacement.version }, owns);
    } catch (error) {
      if (owns()) setReplacementIssue(error instanceof ApiError && error.code === "HISTORY_REPLACEMENT_CAPACITY" ? "Full"
        : error instanceof ApiError && error.status === 409 ? "Changed"
          : error instanceof ApiError && [401, 403, 404].includes(error.status) ? "Denied" : "Unavailable");
    } finally {
      if (owns()) {
        const result = await state.refetch();
        if (owns()) await reconcileOrder();
        if (owns() && result.error) setReplacementIssue("Unavailable");
      }
      busy.current = false;
      if (mounted.current) setDeciding(false);
    }
  }
  async function decideRecovery(kind: RecoveryChoice) {
    if (!accepted || !recovery || !current() || busy.current || state.isFetching || state.error) return;
    const deadline = kind === "accept_format" ? recovery.agreedDeadline : recovery.offeredDeadline;
    if (kind !== "decline" && !deadline) return;
    const previous = recoveryAttempt.current;
    const command = { orderId: accepted.id, expectedVersion: recovery.version, attemptKey: previous?.kind === kind &&
      previous.expectedVersion === recovery.version ? previous.attemptKey : historyAttemptKey() };
    const input: H.HistoryRecoveryDecision = kind === "decline" ? { ...command, kind }
      : { ...command, kind, deadline: deadline ?? "", format: recovery.proposedFormat ?? recovery.originalFormat };
    recoveryAttempt.current = input;
    busy.current = true;
    setDeciding(true);
    const attempt = writeGeneration.current;
    const owns = () => current() && attempt === writeGeneration.current;
    try {
      await stream.decideRecovery(input, owns);
      if (owns()) { recoveryAttempt.current = null; setRecoveryIssue(null); }
    } catch (error) {
      if (owns()) setRecoveryIssue(error instanceof ApiError && error.status === 409 ? "changed"
        : error instanceof ApiError && [401, 403, 404].includes(error.status) ? "denied" : "unavailable");
    } finally {
      if (owns()) {
        const result = await refresh();
        if (owns()) await reconcileOrder();
        if (owns()) {
          const settled = result.data?.order.recovery;
          if (result.error) setRecoveryIssue("unavailable");
          else if (settled && settled.version > input.expectedVersion && (settled.status === "refund_decision_pending" ||
            input.kind !== "decline" && settled.agreedDeadline === input.deadline && (settled.agreedFormat ?? settled.originalFormat) === input.format)) {
            recoveryAttempt.current = null;
            setRecoveryIssue(null);
          }
        }
      }
      busy.current = false;
      if (mounted.current) setDeciding(false);
    }
  }
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
  const previous = !accepted && !failed && !state.error && canRead() && repeat?.vin === vin && repeat.generation === readGeneration.current
    && repeat.version === data?.version ? repeat.purchase : null;
  useLayoutEffect(() => {
    if (!previous) return;
    onRepeatDecisionChange(true);
    return () => onRepeatDecisionChange(false);
  }, [previous, onRepeatDecisionChange]);
  const repeatTitle = t("vehicleHistory.offerRepeatTitle");
  useEffect(() => {
    if (previous) AccessibilityInfo.announceForAccessibility(repeatTitle);
  }, [previous, repeatTitle]);
  async function send(intent: "submit" | "new" | "restore" = "submit") {
    if (!data || !current() || !vin.trim() || busy.current || state.isFetching || state.error) return;
    if (intent === "new" && !previous) return;
    busy.current = true; setSaving(true); setFailed(null);
    const attempt = writeGeneration.current;
    const reader = readGeneration.current;
    const owns = () => current() && attempt === writeGeneration.current;
    const lookupCurrent = () => canRead() && reader === readGeneration.current;
    let checking = intent !== "new";
    try {
      if (checking) {
        const { previous: purchase } = await stream.previousPurchase(vin, lookupCurrent);
        if (!lookupCurrent()) return;
        if (purchase && purchase.requestId !== request.id) {
          Keyboard.dismiss();
          setRepeat({ vin, generation: reader, version: data.version, purchase });
          return;
        }
        if (intent === "restore") { setRepeat(null); return; }
      }
      checking = false;
      if (!owns()) return;
      await stream.sendVin(vin, data.version, owns);
      if (!owns()) return;
      setRepeat(null); setVin(""); await state.refetch();
    } catch (error) {
      if (checking ? lookupCurrent() : owns()) {
        setFailed(error instanceof ApiError && [401, 403, 404].includes(error.status) ? "denied" : "error");
      }
    }
    finally { busy.current = false; if (mounted.current) setSaving(false); }
  }
  const restoreRepeat = useEffectEvent(() => {
    if (reopenGeneration.current === null || reopenGeneration.current === readGeneration.current || !data || accepted
      || !current() || !vin.trim() || busy.current || state.isFetching || state.error) return;
    reopenGeneration.current = null;
    void send("restore");
  });
  useEffect(() => { restoreRepeat(); }, [active, connected, ready, data, saving, state.isFetching, state.error]);
  const copy = (key: string) => t(`vehicleHistory.offer${key[0]?.toUpperCase()}${key.slice(1)}`);
  const timestamp = (value: string) => formatHistoryDeadline(value, i18n.language);
  const denied = failed === "denied" || state.error instanceof ApiError && [401, 403, 404].includes(state.error.status);
  const error = failed || !!state.error;
  const proposal = data?.proposal;
  const providers = data?.preflight?.status === "available" ? data.preflight.providers : [];
  const datesWithConfirmation = !accepted && !!proposal;
  const knownDates = providers.filter((provider) => provider.originalReportDate);
  const datedQuote = datesWithConfirmation && knownDates.length > 0;
  const providerDate = (provider: (typeof providers)[number]) =>
    <Text key={provider.name} className="text-callout">{provider.name} · {copy("date")}: {provider.originalReportDate ?? copy("unknown")}</Text>;
  const historicalWindow = replacement || orderState?.status === "hold_expired";
  const originalWindow = historicalWindow ? orderState?.agreement?.accepted[0]?.offer.proposal ?? proposal : proposal;
  const canEdit = ready && active && connected && !saving && !accepted;
  if (refundRecorded) return !active || !connected ? null : orderReadError
    ? <ErrorState error={orderReadError} title={t("vehicleHistory.orderStatusUnavailable")} onRetry={() => { void reconcileOrder(); }} />
    : <ActivityIndicator accessibilityLabel={t("loading")} />;
  return <View className="gap-3 rounded-2xl border border-border p-4">
    {!accepted && <Text accessibilityRole="header" className="text-headline font-semibold">{copy("title")}</Text>}
    <Text className="text-footnote text-muted-foreground">{copy("synthetic")}</Text>
    {!active || (!ready && !data) ? null : state.isPending && !error ? <ActivityIndicator accessibilityLabel={copy("loading")} />
      : error ? <View className="gap-3"><Text accessibilityRole="alert">{copy(denied ? "denied" : "error")}</Text>
        <Button variant="secondary" disabled={!ready || !connected || state.isFetching} onPress={() => { setFailed(null); setRepeat(null); setOrderFailure(null); void state.refetch(); }}><Text>{copy("refresh")}</Text></Button></View>
        : data && <>
          {recovery && <PromiseRecovery recovery={recovery} delivered={orderState?.preparation === "delivered"}
            controls={{ enabled: ready && active && connected && !state.isFetching,
              busy: deciding, issue: recoveryIssue, decide: (choice) => { void decideRecovery(choice); },
              reload: () => { void refresh().then((result) => {
              if (current() && !result.error) { setRecoveryIssue(null); void reconcileOrder(); }
              }); } }} />}
          {!recovery && <Text accessibilityLiveRegion="polite">{copy(data.preflight?.status ?? (data.vin ? "unchecked" : "empty"))}</Text>}
          {!datedQuote && data.vin && <Text selectable className="text-body font-mono">VIN: {data.vin}</Text>}
          {data.preflight?.status === "available" && (!accepted || expanded) && <>
            <Text className="text-callout">{copy("rule")}</Text>
            {providers.filter((provider) => !datesWithConfirmation || !provider.originalReportDate).map(providerDate)}
            <Text className="text-footnote text-muted-foreground">{copy("limits")}</Text>
          </>}
          {proposal && <View ref={quoteTerms} collapsable={false} className="gap-3 border-y border-border py-4"
            onLayout={datedQuote ? () => {
              const terms = quoteTerms.current;
              if (!terms || !canRead() || revealedQuote.current === data.version) return;
              const generation = readGeneration.current;
              revealedQuote.current = data.version;
              revealDecision("quote", terms, () => quoteTerms.current === terms
                && canRead() && readGeneration.current === generation);
            } : undefined}>
            <Text accessibilityRole="header" className="text-headline font-semibold">{copy(accepted ? "orderSummary" : "preview")}</Text>
            {datedQuote && data.vin && <Text selectable className="text-body font-mono">VIN: {data.vin}</Text>}
            {!recovery && <Text>{copy("format")}: {copy(proposal.format)}</Text>}
            {originalWindow && (!recovery || replacement) && <Text>{historicalWindow ? t("vehicleHistory.replacementOriginal") : copy("window")}: {timestamp(originalWindow.deliveryFrom)} – {timestamp(originalWindow.deliveryBy)}{historicalWindow ? ` · ${t("vehicleHistory.replacementTimeZone")}` : null}</Text>}
            {(!accepted || expanded) && proposal.format !== "pdf" && <Text className="text-callout">{copy("links")}</Text>}
            {(!accepted || expanded) && <><Text className="text-callout">{copy("rights")}</Text><Text className="text-callout">{copy("terms")}</Text></>}
            {accepted ? <>
              {orderState?.companyFundedCorrection && <Text>{t("vehicleHistory.refund.companyFunding")}</Text>}
              <Text>{t("vehicleHistory.offerOrderPrice", { amount: accepted.acceptedOffer.proposal.priceTmt })}</Text>
              <Text>{copy("orderAccepted")}: {timestamp(accepted.acceptedAt)}</Text>
              {orderState?.paymentDeadline && <Text>{t("vehicleHistory.replacementPaymentDeadline")}: {timestamp(orderState.paymentDeadline)}</Text>}
              {!recovery && <Text>{orderState?.paymentDeadline ? t("vehicleHistory.replacementOriginalHold") : copy("orderHold")}: {timestamp(accepted.holdExpiresAt)}</Text>}
              {orderState?.payment?.confirmedAt && <Text>{t("vehicleHistory.paymentConfirmedAt")}: {timestamp(orderState.payment.confirmedAt)}</Text>}
              {orderState?.payment?.receivedAt && <Text>{t("vehicleHistory.paymentReceivedAt")}: {timestamp(orderState.payment.receivedAt)}</Text>}
              {orderState?.verificationResumesAt && <Text className="text-footnote text-muted-foreground">{t("vehicleHistory.replacementOvernight")}</Text>}
              {orderState?.wallet && ready && active && connected && !state.isFetching && <Text selectable className="font-mono text-callout">{orderState.wallet}</Text>}
              <Button variant="secondary" accessibilityState={{ expanded }} onPress={() => setExpanded(!expanded)}><Text>{copy(expanded ? "orderHideDetails" : "orderDetails")}</Text></Button>
            </> : <>
              <Text className="text-footnote text-muted-foreground">{copy("orderBefore")}</Text>
              <View className="gap-3">
                {knownDates.map(providerDate)}
                <Button disabled={!canEdit || state.isFetching || !!vin.trim() || !!orderFailure} accessibilityState={{ busy: saving }} onPress={() => { void accept(); }}>
                  <Text>{copy(saving ? "orderPending" : "orderConfirm")}</Text>
                </Button>
              </View>
            </>}
            {orderFailure && !accepted && <View className="gap-3"><Text accessibilityRole="alert">{copy(orderFailure)}</Text>
              <Button variant="secondary" disabled={!ready || !active || !connected || state.isFetching} onPress={() => { setOrderFailure(null); void state.refetch(); }}><Text>{copy("refresh")}</Text></Button>
            </View>}
          </View>}
          {replacement && <ReplacementBooking replacement={replacement} formatTime={timestamp} enabled={ready && active && connected && !state.isFetching}
            busy={deciding} issue={replacementIssue} onDecision={(kind) => { void decideReplacement(kind); }}
            onRefresh={() => { void refreshReplacement(); }} />}
          {accepted && <PaymentProof key={`${userId}:${sessionId}:${request.id}:${accepted.id}`}
            viewer={viewer} requestId={request.id} orderId={accepted.id} ready={metadataAvailable && active && connected}
            reviewComplete={!!orderState?.payment?.confirmedAt} onSubmitted={async () => { await state.refetch(); if (canRead()) await reconcileOrder(); }} />}
          {accepted && orderState && (!recovery?.missedAt || recovery.status === "agreed" && !!orderState.agreement?.pending) && <VinCorrection key={`correction:${userId}:${sessionId}:${request.id}`} state={orderState}
            storageKey={`carberk.history.vin-correction.v1:${userId}:${request.id}`} stream={stream}
            enabled={ready && active && connected && !state.isFetching && !state.error} current={current}
            reconcile={async () => { const result = await state.refetch(); if (result.error) throw result.error; if (canRead()) await reconcileOrder(); }} />}
          {!accepted && <><Text nativeID="history-vin-label" className="text-callout font-semibold">{copy("vin")}</Text>
          <Input accessibilityLabel={copy("vin")} accessibilityLabelledBy="history-vin-label" value={vin} onChangeText={(value) => {
            reopenGeneration.current = null;
            setVin(value); setRepeat(null);
          }} maxLength={80}
            autoCapitalize="characters" autoCorrect={false} editable={canEdit} />
          {previous ? <View ref={repeatPrompt} collapsable={false} className="gap-3 border-t border-border pt-3"
            onLayout={() => {
              const prompt = repeatPrompt.current;
              if (prompt) revealDecision("repeat", prompt, () => repeatPrompt.current === prompt && canRead()
                && repeat?.generation === readGeneration.current);
            }}>
            <Text accessibilityRole="header" className="font-semibold">{repeatTitle}</Text>
            <Text className="text-callout">{previous.provider} · {copy("date")} {previous.originalReportDate}</Text>
            <Button disabled={!canEdit || state.isFetching} onPress={() => {
              if (current() && repeat?.generation === readGeneration.current) {
                reopenGeneration.current = readGeneration.current;
                router.push({ pathname: "/vehicle-history/requests/[id]", params: { id: previous.requestId } });
              }
            }}><Text>{copy("openPrevious")}</Text></Button>
            <Button variant="secondary" disabled={!canEdit || state.isFetching} accessibilityState={{ busy: saving }}
              onPress={() => { void send("new"); }}><Text>{copy(saving ? "pending" : "repeatNew")}</Text></Button>
          </View> : <Button variant="secondary" disabled={!vin.trim() || !canEdit || state.isFetching}
            accessibilityState={{ busy: saving }} onPress={() => { void send(); }}>
            <Text>{copy(saving ? "pending" : "sendVin")}</Text>
          </Button>}</>}
        </>}
  </View>;
}
