import { Image, View } from "react-native";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import type { ListingsSchemas } from "@auto-tm/contracts";

import { marketplaceCopy } from "./showroomCopy";

import { PressableScale } from "@/components/ui/pressable-scale";
import { Text } from "@/components/ui/text";

/** Business identity is public; checked identity makes no vehicle-condition claim. */
export function BusinessIdentityLink({ business, compact = false }: { business: NonNullable<ListingsSchemas.ListingSummary["business"]>; compact?: boolean }) {
 const { i18n } = useTranslation(); const c = marketplaceCopy(i18n.language);
 return <PressableScale accessibilityRole="button" accessibilityLabel={business.name} className="min-h-11 flex-row items-center gap-3" onPress={(event) => { event?.stopPropagation(); router.push({ pathname: "/showrooms/[id]", params: { id: business.id } }); }}>
  {!compact && business.logoUrl && /^https:\/\//.test(business.logoUrl) ? <Image source={{ uri: business.logoUrl }} className="h-11 w-11 rounded-lg" accessibilityIgnoresInvertColors /> : null}
  <View className="min-w-0 flex-1 gap-1"><Text className="text-callout font-semibold" numberOfLines={1}>{business.name}</Text>{!compact ? <Text className="text-footnote text-muted-foreground">{business.identityChecked ? c.checked : c.synthetic}</Text> : null}</View>
 </PressableScale>;
}
