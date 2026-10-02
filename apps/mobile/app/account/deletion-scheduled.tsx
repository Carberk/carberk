import { useMemo } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { CalendarClock } from "lucide-react-native";
import { useTranslation } from "react-i18next";

import { formatDeletionDateFromNow } from "../../src/auth/formatDeletionDate";
import { localeTag } from "../../src/i18n/resources";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { SafeScreen } from "@/components/navigation/SafeScreen";

/**
 * Shown once deletion succeeds, over signed-out Cabinet. It has no Back
 * button; Done and system Back both land on Cabinet.
 */
export default function DeletionScheduledScreen() {
  const { t, i18n } = useTranslation("account");
  const locale = localeTag(i18n.language);
  const deletionDate = useMemo(() => formatDeletionDateFromNow(locale), [locale]);

  return (
    <SafeScreen>
      <View className="flex-1 items-center justify-center gap-3 px-6">
        <Icon as={CalendarClock} className="size-10 text-muted-foreground" />
        <Text accessibilityRole="header" className="text-xl font-heading text-foreground text-center">
          {t("deleteAccountScheduledTitle")}
        </Text>
        <Text className="text-base text-muted-foreground text-center">
          {t("deleteAccountScheduledMessage", { date: deletionDate })}
        </Text>
        <Button
          variant="brand"
          size="pill"
          className="mt-4 min-w-48"
          onPress={() => router.dismissTo("/(tabs)/services")}
          accessibilityLabel={t("common:done")}
        >
          <Text>{t("common:done")}</Text>
        </Button>
      </View>
    </SafeScreen>
  );
}
