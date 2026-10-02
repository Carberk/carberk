import * as Linking from "expo-linking";
import { ChevronLeft } from "lucide-react-native";
import { ScrollView, View } from "react-native";
import { useTranslation } from "react-i18next";

import { useSafeBack } from "../src/navigation/useSafeBack";
import { useNotificationPermissionState } from "../src/notifications/useNotificationPermissionState";

import { MenuRow } from "@/components/account/MenuRow";
import { SafeScreen } from "@/components/navigation/SafeScreen";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Separator } from "@/components/ui/separator";
import { Text } from "@/components/ui/text";

/**
 * Message notifications state, read from the device permission. A statement,
 * not a switch: the User changes it in system settings. This screen never
 * asks for the permission; that stays after the first chat action.
 */
export default function NotificationsScreen() {
  const { t } = useTranslation(["account", "common"]);
  const goBack = useSafeBack("/(tabs)/services");
  const permission = useNotificationPermissionState();

  const value =
    permission === null
      ? ""
      : t(permission === "granted" ? "notificationsOn" : "notificationsOff");

  return (
    <SafeScreen>
      <View className="px-4 pb-3 flex-row items-center gap-2">
        <Button
          variant="ghost"
          className="h-11 w-11"
          size="icon"
          onPress={goBack}
          accessibilityLabel={t("common:back")}
        >
          <Icon as={ChevronLeft} className="size-6 text-foreground" />
        </Button>
        <Text className="text-2xl font-heading text-foreground">
          {t("notifications")}
        </Text>
      </View>

      <ScrollView className="flex-1" contentContainerClassName="pb-6">
        <View
          accessible
          accessibilityLabel={
            value ? `${t("messageNotifications")}, ${value}` : t("messageNotifications")
          }
          className="min-h-14 flex-row items-center gap-3 px-4 py-2"
        >
          <Text className="flex-1 text-base text-foreground">
            {t("messageNotifications")}
          </Text>
          <Text className="text-base text-muted-foreground">{value}</Text>
        </View>
        <Separator className="bg-border ml-4" />
        <MenuRow
          label={t("openSystemSettings")}
          chevron
          onPress={() => void Linking.openSettings()}
        />

        <Text className="px-4 py-2.5 text-sm text-muted-foreground">
          {t("notificationsMuteHint")}
        </Text>
      </ScrollView>
    </SafeScreen>
  );
}
