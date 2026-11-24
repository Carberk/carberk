import { useEffect, useMemo, useRef, useState } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { HistoryOrderSchemas as H } from "@auto-tm/contracts";

import { ApiError } from "../api/client";
import type { historyTranscript } from "../api/vehicle-history/messages";

import { historyAttemptKey } from "./historyAttemptKey";
import { formatHistoryDeadline } from "./formatHistoryDeadline";
import { retainedVinCorrection } from "./retainedVinCorrection";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";

export function VinCorrection({ state, storageKey, stream, enabled, current, reconcile }: {
  state: H.HistoryOrderState; storageKey: string; stream: ReturnType<typeof historyTranscript>;
  enabled: boolean; current: () => boolean; reconcile: () => Promise<unknown>;
}) {
  const { t, i18n } = useTranslation();
  const copy = (key: string) => t(`vehicleHistory.correction${key}`);
  const offerCopy = (key: string) => t(`vehicleHistory.offer${key[0]?.toUpperCase()}${key.slice(1)}`);
  const retained = useMemo(() => retainedVinCorrection(storageKey), [storageKey]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [open, setOpen] = useState(false), [vin, setVin] = useState("");
  const [phase, setPhase] = useState("loading");
  const busy = useRef(false), alive = useRef(true), intent = useRef<H.HistoryCorrectionMutation | null>(null);
  const generation = useRef(0), wasEnabled = useRef(enabled);
  if (wasEnabled.current && !enabled) generation.current++;
  wasEnabled.current = enabled;
  const latest = useRef(current); latest.current = current;
  useEffect(() => {
    alive.current = true;
    let cancelled = false;
    void retained.load().then((input) => {
      if (cancelled) return;
      intent.current = input;
      setPhase(input ? "uncertain" : "");
    }).catch(() => { if (alive.current) setPhase("storage"); });
    return () => { cancelled = true; alive.current = false; };
  }, [retained]);
  const order = state.order;
  if (!order) return null;
  const agreement = state.agreement;
  const pending = agreement?.pending;
  const review = pending?.review;
  const recovery = state.recovery?.status === "agreed" ? state.recovery : null;
  const needsReview = !!recovery && !!review?.offer.proposal && review.offer.proposal.format !== recovery.originalFormat;
  async function run(input?: H.HistoryCorrectionMutation) {
    if (busy.current || !enabled || !latest.current() || ["loading", "storage"].includes(phase)) return;
    const mutation = intent.current ?? input;
    if (!mutation) return;
    busy.current = true; setPhase("pending");
    const expected = generation.current;
    const owns = () => alive.current && expected === generation.current && latest.current();
    try {
      await retained.save(mutation);
      intent.current = mutation;
      if (!owns()) return;
      await stream.correctVin(mutation, owns);
      await retained.remove(mutation);
      intent.current = null;
      if (owns()) { setVin(""); setPhase(""); await reconcile(); }
    } catch (error) {
      if (!owns()) return;
      if (error instanceof ApiError && error.status === 400) {
        try {
          await retained.remove(mutation);
          intent.current = null;
          if (owns()) setPhase("invalid");
        } catch { if (owns()) setPhase("storage"); }
      } else setPhase(error instanceof ApiError && [401, 403, 404].includes(error.status) ? "denied"
        : error instanceof ApiError && error.status === 409 ? "changed" : "uncertain");
      await reconcile().catch(() => undefined);
    } finally { busy.current = false; if (alive.current) setPhase((value) => value === "pending" ? "uncertain" : value); }
  }
  async function refresh() {
    if (busy.current || !enabled || !latest.current()) return;
    busy.current = true;
    try {
      await reconcile();
      if (!alive.current || !latest.current()) return;
      if (phase === "changed" && intent.current) { await retained.remove(intent.current); intent.current = null; setPhase(""); }
    } catch { if (alive.current && latest.current()) setPhase("uncertain"); }
    finally { busy.current = false; }
  }
  const timestamp = (value: string) => new Intl.DateTimeFormat(i18n.language === "tk" ? "en-GB" : i18n.language, {
    dateStyle: "short", timeStyle: "short", timeZone: "Asia/Ashgabat", hourCycle: "h23",
  }).format(new Date(value));
  function facts(offer: H.HistoryAcceptedOrder["acceptedOffer"], current = false) {
    const window = current && state.replacement?.status === "accepted" ? state.replacement.window : offer.proposal;
    return <View className="gap-2">
      <Text selectable className="font-mono text-callout">{offer.vin}</Text>
      <Text>{offer.proposal.priceTmt} TMT</Text>
      <Text>{offerCopy("format")}: {offerCopy(offer.proposal.format)}</Text>
      {offer.preflight.providers.map((p) => <Text key={p.name} className="text-callout">{p.name} · {offerCopy("date")}: {p.originalReportDate ?? offerCopy("unknown")}</Text>)}
      {!current && recovery?.agreedDeadline
        ? <Text className="text-callout">{t("vehicleHistory.promiseRecovery.agreedDeadline")} · {formatHistoryDeadline(recovery.agreedDeadline, i18n.language)}</Text>
        : <Text className="text-callout">{offerCopy("window")}: {timestamp(window.deliveryFrom)} – {timestamp(window.deliveryBy)}</Text>}
    </View>;
  }
  const failure = ["uncertain", "changed", "denied", "storage", "invalid"].includes(phase);
  const usable = enabled && ["", "invalid"].includes(phase);
  return <View className="gap-3 border-t border-border pt-4">
    {agreement?.handoff ? <Text>{copy("Closed")}</Text> : <>
      {!pending && <Button variant="secondary" accessibilityState={{ expanded: open }} disabled={!enabled || phase === "loading"}
        onPress={() => setOpen(!open)}><Text>{copy("Open")}</Text></Button>}
      {(open || pending || failure) && <>
        <Text accessibilityRole="header" className="text-headline font-semibold">{copy(pending ? review ? "Reviewed" : "Waiting" : "Title")}</Text>
        <Text className="text-footnote text-muted-foreground">{copy("Policy")}</Text>
        {pending && <><Text className="font-semibold">{copy("Current")}</Text>{facts(order.acceptedOffer, true)}
          <Text className="font-semibold">{copy("Proposed")}</Text>{!review?.offer.proposal && <Text selectable className="font-mono">{pending.vin}</Text>}</>}
        {review && <>
          <Text>{copy(review.cause === "company_error" ? "Company" : "Customer")}</Text>
          {review.offer.preflight?.status && <Text accessibilityLiveRegion="polite">{offerCopy(review.offer.preflight.status)}</Text>}
          {needsReview && <Text>{t("vehicleHistory.promiseRecovery.correctionFormat")}</Text>}
          {!needsReview && H.AcceptedHistoryOfferSchema.safeParse(review.offer).success && <>
            {facts(H.AcceptedHistoryOfferSchema.parse(review.offer))}
            <Text>{offerCopy("rule")}</Text><Text>{offerCopy("rights")}</Text><Text>{offerCopy("terms")}</Text>
            <Button disabled={!usable || !!vin.trim()} accessibilityState={{ busy: phase === "pending" }} onPress={() => { void run({ kind: "accept", attemptKey: historyAttemptKey(),
              expectedVersion: agreement?.version ?? 0, offer: H.AcceptedHistoryOfferSchema.parse(review.offer) }); }}><Text>{copy("Accept")}</Text></Button>
          </>}
        </>}
        {!recovery && <>
        <Text nativeID="corrected-vin-label" className="font-semibold">{copy("Vin")}</Text>
        <Input accessibilityLabel={copy("Vin")} accessibilityLabelledBy="corrected-vin-label" value={vin} onChangeText={setVin}
          maxLength={80} autoCapitalize="characters" autoCorrect={false} editable={usable} />
        <Button variant="secondary" disabled={!usable || !vin.trim()} accessibilityState={{ busy: phase === "pending" }}
          onPress={() => { void run({ kind: "request", vin, attemptKey: historyAttemptKey(), expectedVersion: agreement?.version ?? 0 }); }}><Text>{copy("Send")}</Text></Button>
        </>}
        {phase === "pending" && <Text accessibilityRole="alert">{copy("Saving")}</Text>}
        {failure && <Text accessibilityRole="alert">{phase === "invalid" ? offerCopy("malformed") : copy(phase === "denied" ? "Denied" : phase === "storage" ? "Storage" : phase === "changed" ? "Changed" : "Error")}</Text>}
        {phase === "uncertain" && <Button variant="secondary" disabled={!enabled} onPress={() => { void run(); }}><Text>{copy("Retry")}</Text></Button>}
        <Button variant="secondary" disabled={!enabled || busy.current} onPress={() => { void refresh(); }}><Text>{copy("Refresh")}</Text></Button>
      </>}
    </>}
    {(agreement?.accepted.length ?? 0) > 1 && <>
      <Text accessibilityLiveRegion="polite">{copy("Agreed")} · {copy(agreement?.accepted.at(-1)?.cause === "company_error" ? "Company" : "Customer")}</Text>
      <Button variant="secondary" accessibilityState={{ expanded: historyOpen }} onPress={() => setHistoryOpen(!historyOpen)}><Text>{copy("History")}</Text></Button>
      {historyOpen && agreement?.accepted.slice(0, -1).map((revision) => <View key={revision.revision} className="gap-2">
        <Text>{timestamp(revision.acceptedAt)}</Text>{facts(revision.offer)}
      </View>)}
    </>}
  </View>;
}
