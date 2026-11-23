import { View } from "react-native";
import { useTranslation } from "react-i18next";
import type { HistoryOrderSchemas as H } from "@auto-tm/contracts";

import { PaymentStatus } from "./PaymentStatus";

import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { useLargeText } from "@/lib/font-scale";

export function OrderStatus({ state, compact, ready, onDetails }: {
  state: H.HistoryOrderState; compact: boolean; ready: boolean; onDetails: () => void;
}) {
  const { t, i18n } = useTranslation();
  const largeText = useLargeText();
  if (!state.order) return null;
  const copy = (key: string) => t(`vehicleHistory.offer${key}`);
  if (compact) return <View className="border-b border-border bg-card px-5 py-2"><PaymentStatus state={state} compact /></View>;

  const offer = state.order.acceptedOffer;
  const replacement = state.replacement;
  const window = replacement ? replacement.status === "accepted" || replacement.status === "proposed" ? replacement.window : null : offer.proposal;
  const timestamp = (value: string) => new Intl.DateTimeFormat(i18n.language === "tk" ? "en-GB" : i18n.language, {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Asia/Ashgabat",
  }).format(new Date(value));
  return <View className="border-b border-border bg-card px-5 py-3">
    <View className="flex-row items-start justify-between gap-3">
      <View className="flex-1 gap-1">
        <PaymentStatus state={state} summary compact={largeText} />
        {!largeText && <>
        {state.agreement?.pending && <Text className="text-footnote font-semibold">{t(state.agreement.pending.review ? "vehicleHistory.correctionReviewed" : "vehicleHistory.correctionWaiting")}</Text>}
        <Text selectable className="font-mono text-footnote">{offer.vin} · {copy({ pdf: "Pdf", link: "Link", both: "Both" }[offer.proposal.format])}</Text>
        {window && !state.verificationResumesAt && <Text className="text-footnote">{timestamp(window.deliveryFrom)} – {timestamp(window.deliveryBy)}</Text>}
        </>}
      </View>
      <Button variant="secondary" size="sm" disabled={!ready} onPress={onDetails}><Text>{copy("OrderStatusDetails")}</Text></Button>
    </View>
  </View>;
}
