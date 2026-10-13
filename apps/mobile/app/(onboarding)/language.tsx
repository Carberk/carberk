import { router, useIsFocused } from "expo-router";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { BackHandler, ScrollView, View } from "react-native";

import { BrandLogo } from "../../src/auth/BrandLogo";
import { localeStore } from "../../src/locale/localeStore";

import { IllustrationPanel } from "@/components/onboarding/IllustrationPanel";
import { LanguageRows } from "@/components/onboarding/LanguageRows";
import { ONBOARDING_MAX_WIDTH_CLASS, useOnboardingLayout } from "@/components/onboarding/useOnboardingLayout";
import { SafeScreen } from "@/components/navigation/SafeScreen";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

/**
 * First onboarding screen: choose a language
 * (docs/prd/ui/hifi/mobile-onboarding.md). The rows store the choice, so
 * Continue only moves on.
 */
export default function LanguagePickerScreen() {
  const { t } = useTranslation("onboarding");
  const locale = localeStore((state) => state.locale) ?? "ru";
  const setLocale = localeStore((state) => state.setLocale);
  const { compact } = useOnboardingLayout();
  const focused = useIsFocused();
  const continueLabel = t("common:continue");

  function continueOnboarding() {
    // The rows store a tapped choice. With no tap, the preselected language
    // lives only in memory, so Continue stores it before moving on.
    if (localeStore.getState().locale === null) setLocale(locale);
    router.push("/(onboarding)/value-prop");
  }

  // Home is underneath. Back here leaves the app; it does not skip onboarding.
  useEffect(() => {
    if (!focused) return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      BackHandler.exitApp();
      return true;
    });
    return () => subscription.remove();
  }, [focused]);

  return (
    <SafeScreen>
      <View className={cn("w-full flex-1 self-center", ONBOARDING_MAX_WIDTH_CLASS)}>
        <View className="h-12 justify-center px-6">
          <BrandLogo width={121} height={22} />
        </View>

        {!compact && <IllustrationPanel name={`language-${locale}`} enter />}

        {/* Sized by its content; it scrolls only when the window is too short. */}
        <ScrollView
          alwaysBounceVertical={false}
          showsVerticalScrollIndicator={false}
          className={cn(compact ? "flex-1" : "shrink grow-0")}
        >
          <View className="px-6">
            <Text
              accessibilityRole="header"
              className="font-heading text-title font-bold text-foreground"
            >
              {t("chooseLanguage")}
            </Text>
            <Text className="mt-2 text-body text-muted-foreground">
              {t("languageSubtitle")}
            </Text>
            <LanguageRows className="mt-4" />
          </View>
        </ScrollView>

        <View className="px-6 pb-4 pt-4">
          <Button
            variant="brand"
            size="pill"
            onPress={continueOnboarding}
            accessibilityLabel={continueLabel}
          >
            <Text maxFontSizeMultiplier={1.3}>{continueLabel}</Text>
          </Button>
        </View>
      </View>
    </SafeScreen>
  );
}
