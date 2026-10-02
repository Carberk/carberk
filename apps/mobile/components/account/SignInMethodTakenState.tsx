import { router } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { View } from "react-native";
import { useTranslation } from "react-i18next";

import { useSafeBack } from "../../src/navigation/useSafeBack";

import { SafeScreen } from "@/components/navigation/SafeScreen";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";

/**
 * A value held by another account is refused, never merged. The one action
 * opens an empty entry screen for the same method; Back returns to Profile.
 * There is no switch-account action.
 */
export function SignInMethodTakenState({ method }: { method: "phone" | "email" }) {
  const { t } = useTranslation("account");
  const goBack = useSafeBack("/profile");

  return (
    <SafeScreen>
      <View className="px-4 pb-3 flex-row items-center">
        <Button
          accessibilityLabel={t("common:back")}
          variant="ghost"
          size="icon"
          className="h-11 w-11"
          onPress={goBack}
        >
          <Icon as={ChevronLeft} className="size-6 text-foreground" />
        </Button>
      </View>

      <View className="px-4 pt-3.5 gap-5">
        <View className="gap-2">
          <Text className="text-xl font-semibold leading-snug text-foreground">
            {t(method === "email" ? "auth:emailTaken" : "auth:phoneTaken")}
          </Text>
          <Text className="text-[13px] text-muted-foreground">
            {t("accountsNeverMerged")}
          </Text>
        </View>

        <Button
          size="lg"
          variant="brand"
          onPress={() =>
            router.replace(method === "email" ? "/account/add-email" : "/account/add-phone")
          }
        >
          <Text>{t(method === "email" ? "useDifferentEmail" : "useDifferentPhone")}</Text>
        </Button>
      </View>
    </SafeScreen>
  );
}
