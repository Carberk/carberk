import type { HistoryOrderSchemas as H } from "@auto-tm/contracts";
import { useTranslation } from "react-i18next";
import { View } from "react-native";

import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";

export function ReplacementBooking({ replacement, formatTime, enabled, busy, issue, onDecision, onRefresh }: {
  replacement: H.HistoryReplacementState; formatTime: (value: string) => string; enabled: boolean; busy: boolean;
  issue: "Full" | "Changed" | "Denied" | "Unavailable" | null;
  onDecision: (kind: "accept" | "decline") => void; onRefresh: () => void;
}) {
  const { t } = useTranslation();
  const copy = (key: string) => t(`vehicleHistory.replacement${key}`);
  const { status } = replacement;
  const title = {
    awaiting_proposal: "Awaiting", proposed: "Proposed", expired: "Expired",
    superseded: "Superseded", accepted: "Accepted", refund_decision_pending: "Refund",
  }[status];
  const terminal = status === "accepted" || status === "refund_decision_pending";
  const canDecline = status === "proposed" || status === "expired";
  return <View className="gap-3 rounded-xl border border-border bg-card p-4">
    <Text accessibilityRole="header" accessibilityLiveRegion="polite" className="text-headline font-semibold">{copy(title)}</Text>
    {"window" in replacement && <Text>{formatTime(replacement.window.deliveryFrom)} – {formatTime(replacement.window.deliveryBy)} · {copy("TimeZone")}</Text>}
    <Text className="text-footnote text-muted-foreground">{copy(status === "refund_decision_pending" ? "RefundBody"
      : status === "proposed" ? "ProposedBody" : status === "accepted" ? "PaidBody" : "WaitingBody")}</Text>
    {busy && <Text accessibilityLiveRegion="polite">{copy("Saving")}</Text>}
    {issue && !terminal && <Text accessibilityRole="alert" className="text-destructive">{copy(issue)}</Text>}
    {status === "proposed" && <Button disabled={!enabled || busy || !!issue} accessibilityState={{ busy }} onPress={() => onDecision("accept")}>
      <Text>{copy("Accept")}</Text>
    </Button>}
    {canDecline && <Button variant="secondary" disabled={!enabled || busy || !!issue} accessibilityState={{ busy }} onPress={() => onDecision("decline")}>
      <Text>{copy("Decline")}</Text>
    </Button>}
    {canDecline && !issue && <Text className="text-footnote text-muted-foreground">{copy("DeclineBody")}</Text>}
    {!terminal && <Button variant="secondary" disabled={!enabled || busy} onPress={onRefresh}><Text>{copy("Refresh")}</Text></Button>}
  </View>;
}
