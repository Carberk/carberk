import { View } from "react-native";
import { ChevronLeft } from "lucide-react-native";
import Constants from "expo-constants";
import { useTranslation } from "react-i18next";

import { useSafeBack } from "../src/navigation/useSafeBack";

import { SafeScreen } from "@/components/navigation/SafeScreen";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";

export default function AboutScreen() {
  const { t } = useTranslation(["support", "common"]);
  const goBack = useSafeBack("/(tabs)/services");
  // The app config embedded in the build, so this is the version it was made with.
  const version = Constants.expoConfig?.version;

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
        <Text className="text-2xl font-heading text-foreground">{t("about")}</Text>
      </View>

      <View className="items-center px-4 py-[60px]">
        <Text accessibilityLabel="AutoTM" className="text-[28px] font-extrabold text-foreground">
          Auto<Text className="text-[28px] font-extrabold text-primary">TM</Text>
        </Text>
        {version ? (
          <Text className="mt-2 text-muted-foreground">{t("appVersion", { version })}</Text>
        ) : null}
      </View>
    </SafeScreen>
  );
}
