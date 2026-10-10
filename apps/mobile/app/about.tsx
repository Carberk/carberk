import { View } from "react-native";
import Constants from "expo-constants";
import { useTranslation } from "react-i18next";

import { BrandLogo } from "../src/auth/BrandLogo";
import { useSafeBack } from "../src/navigation/useSafeBack";

import { SafeScreen } from "@/components/navigation/SafeScreen";
import { BackButton, StackHeader } from "@/components/navigation/StackHeader";
import { Text } from "@/components/ui/text";

export default function AboutScreen() {
  const { t } = useTranslation(["support", "common"]);
  const goBack = useSafeBack("/(tabs)/services");
  // The app config embedded in the build, so this is the version it was made with.
  const version = Constants.expoConfig?.version;

  return (
    <SafeScreen>
      <StackHeader
        large
        title={t("about")}
        leading={<BackButton onPress={goBack} accessibilityLabel={t("common:back")} />}
      />

      <View className="items-center px-4 py-16">
        <View>
          <BrandLogo width={198} height={36} />
        </View>
        <Text className="mt-3 text-center text-muted-foreground">{t("parentCompanyLine")}</Text>
        {version ? (
          <Text className="mt-6 text-muted-foreground">{t("appVersion", { version })}</Text>
        ) : null}
      </View>
    </SafeScreen>
  );
}
