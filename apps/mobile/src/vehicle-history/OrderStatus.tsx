import { View } from "react-native";
import { useTranslation } from "react-i18next";
import type { HistoryOrderSchemas as H } from "@auto-tm/contracts";

import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";

export function OrderStatus({ state, ready, onDetails }: { state: H.HistoryOrderState; ready: boolean; onDetails: () => void }) {
  const { t, i18n } = useTranslation();
  if (!state.order) return null;
  const expired = state.status === "hold_expired";
  const copy = (key: string) => t(`vehicleHistory.offer${key}`);
  const offer = state.order.acceptedOffer;
  const timestamp = (value: string) => new Intl.DateTimeFormat(i18n.language === "tk" ? "en-GB" : i18n.language, {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Asia/Ashgabat",
  }).format(new Date(value));
  return <View className="border-b border-border bg-card px-5 py-3">
    <View className="flex-row items-start justify-between gap-3">
      <View className="flex-1 gap-1">
        <Text accessibilityLiveRegion="polite" className="text-callout font-semibold">{copy(expired ? "OrderExpired" : "OrderWaiting")} · 100 TMT</Text>
        <Text selectable className="font-mono text-footnote">{offer.vin} · {copy({ pdf: "Pdf", link: "Link", both: "Both" }[offer.proposal.format])}</Text>
        <Text className="text-footnote">{timestamp(offer.proposal.deliveryFrom)} – {timestamp(offer.proposal.deliveryBy)}</Text>
        <Text className="text-footnote text-muted-foreground">{copy(expired ? "OrderStatusExpired" : "OrderStatusNext")}</Text>
      </View>
      <Button variant="secondary" size="sm" disabled={!ready} onPress={onDetails}><Text>{copy("OrderStatusDetails")}</Text></Button>
    </View>
  </View>;
}
