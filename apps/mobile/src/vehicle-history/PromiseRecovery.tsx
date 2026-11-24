import type { HistoryOrderSchemas as H } from "@auto-tm/contracts";
import { View } from "react-native";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";

type Recovery = H.HistoryRecoveryState;
export type RecoveryChoice = Pick<H.HistoryRecoveryDecision, "kind">["kind"];

export function PromiseRecovery({ recovery, timestamp, enabled, busy, issue, decide, reload }: {
  recovery: Recovery; timestamp: (value: string) => string; enabled: boolean; busy: boolean;
  issue: "changed" | "denied" | "unavailable" | null; decide: (choice: RecoveryChoice) => void; reload: () => void;
}) {
  const { t } = useTranslation();
  const copy = (key: string) => t(`vehicleHistory.promiseRecovery.${key}`);
  const format = (value: Recovery["originalFormat"]) => t(`vehicleHistory.offer${{ pdf: "Pdf", link: "Link", both: "Both" }[value]}`);
  const offered = recovery.status === "offered";
  const revised = recovery.proposedFormat && !recovery.agreedFormat && (offered || recovery.status === "agreed");
  const pending = recovery.status === "refund_decision_pending";
  return <View className="gap-3 rounded-xl border border-border bg-card p-4" accessibilityState={{ busy }}>
    <Text accessibilityRole="header" accessibilityLiveRegion="polite" className="text-headline font-semibold">{copy(recovery.status)}</Text>
    <Text>{t("vehicleHistory.offerOrderHold")} · {timestamp(recovery.paymentHoldExpiresAt)}</Text>
    <Text>{copy("original")} · {timestamp(recovery.originalPromiseBy)}</Text>
    <Text>{copy("acceptedFormat")} · {format(recovery.originalFormat)}</Text>
    {recovery.failure && <Text className="text-callout">{copy(recovery.failure)}</Text>}
    {recovery.agreedDeadline ? <Text>{copy("agreedDeadline")} · {timestamp(recovery.agreedDeadline)}</Text>
      : offered && recovery.offeredDeadline && <Text>{copy("offeredDeadline")} · {timestamp(recovery.offeredDeadline)}</Text>}
    <Text className="text-footnote text-muted-foreground">{t("vehicleHistory.replacementTimeZone")}</Text>
    {revised && recovery.proposedFormat && <Text>{copy("proposedFormat")} · {format(recovery.proposedFormat)}</Text>}
    {recovery.agreedFormat && <Text>{copy("agreedFormat")} · {format(recovery.agreedFormat)}</Text>}
    {pending && <View className="gap-1">
      {recovery.pendingReason && recovery.pendingReason !== recovery.failure && <Text>{copy(recovery.pendingReason)}</Text>}
      <Text className="text-callout">{copy("pendingBody")}</Text>
    </View>}
    {issue ? <>
      <Text accessibilityRole="alert">{copy(issue)}</Text>
      <Button variant="secondary" disabled={!enabled || busy} onPress={reload}><Text>{copy("refresh")}</Text></Button>
    </> : offered || revised ? <>
      {busy && <Text accessibilityLiveRegion="polite">{copy("saving")}</Text>}
      <Button disabled={!enabled || busy} onPress={() => decide(offered ? "accept" : "accept_format")} className="min-h-12">
        <Text>{copy(offered ? revised ? "acceptRevised" : "accept" : "acceptFormat")}</Text>
      </Button>
      {offered && <Button variant="secondary" className="min-h-12" disabled={!enabled || busy} onPress={() => decide("decline")}>
        <Text>{copy("decline")}</Text>
      </Button>}
    </> : null}
  </View>;
}
