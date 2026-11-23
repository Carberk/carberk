import type { HistoryOrderSchemas as H } from "@auto-tm/contracts";
import { useTranslation } from "react-i18next";
import { View } from "react-native";

import { Text } from "@/components/ui/text";

export function PaymentStatus({ state, compact = false, summary = false }: {
  state: H.HistoryOrderState; compact?: boolean; summary?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const outcome = state.payment?.outcome;
  const key = state.status === "payment_confirmed" ? "Confirmed" : state.status === "payment_received_no_hold" ? "NoHold"
    : outcome === "partial" ? "Partial" : outcome === "unmatched" ? "Unmatched" : outcome === "uncertain" ? "Review"
      : outcome === "receipt_submitted" ? "Submitted" : state.status === "hold_expired" ? "Expired" : "Waiting";
  const preparation = state.preparation && state.status === "payment_confirmed" && !state.agreement?.pending ? state.preparation : undefined;
  const copy = (suffix: string) => preparation
    ? t(`vehicleHistory.preparation_${preparation}${suffix}`)
    : t(`vehicleHistory.payment${key}${suffix}`);
  return <View className="gap-1">
    <Text accessibilityLiveRegion="polite" className="text-callout font-semibold">{copy("")}{!preparation && " · 100 TMT"}</Text>
    {!compact && !preparation && state.payment && outcome !== "receipt_submitted" && <Text className="text-footnote">{t("vehicleHistory.paymentAmount", {
      amount: new Intl.NumberFormat(i18n.language === "tk" ? "en-GB" : i18n.language).format(state.payment.amountMinor / 100),
    })}</Text>}
    {!compact && <Text className="text-footnote text-muted-foreground">{summary && !outcome && state.status !== "hold_expired"
      ? t("vehicleHistory.offerOrderStatusNext") : copy("Next")}</Text>}
  </View>;
}
