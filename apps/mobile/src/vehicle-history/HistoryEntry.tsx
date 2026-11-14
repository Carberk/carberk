import { router } from "expo-router";
import { FileSearch, ChevronRight } from "lucide-react-native";
import { View } from "react-native";
import { useTranslation } from "react-i18next";

import { vehicleHistoryAvailable } from "./availability";

import { PressableScale } from "@/components/ui/pressable-scale";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

/** Both entry points open public information; context never confers seller authority. */
export function HistoryEntry({ listingId, className, requests = false }: { listingId?: string; className?: string; requests?: boolean }) {
  const { t } = useTranslation();
  if (!vehicleHistoryAvailable()) return null;
  return (
    <PressableScale feedback="surface" accessibilityRole="button"
      accessibilityLabel={t(requests ? "vehicleHistory.historyEntry" : "vehicleHistory.entry")}
      className={cn("min-h-16 flex-row items-center gap-3 rounded-2xl border-hairline border-border bg-card px-4 py-3 active:bg-secondary", className)}
      onPress={() => requests ? router.push("/vehicle-history/requests") : router.push({ pathname: "/vehicle-history", params: listingId ? { listingId } : {} })}>
      <Icon as={FileSearch} className="size-6 shrink-0 text-muted-foreground" strokeWidth={1.8} />
      <View className="min-w-0 flex-1 gap-0.5">
        <Text className="text-body font-semibold">{t(requests ? "vehicleHistory.historyTitle" : "vehicleHistory.title")}</Text>
        <Text className="text-footnote text-muted-foreground">{t(requests ? "vehicleHistory.title" : "vehicleHistory.entryDetail")}</Text>
      </View>
      <Icon as={ChevronRight} className="size-4 shrink-0 text-muted-foreground" />
    </PressableScale>
  );
}
