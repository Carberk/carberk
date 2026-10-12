import type { ReactNode } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  View,
} from "react-native";
import { useColorScheme } from "nativewind";
import { useTranslation } from "react-i18next";

import { useSafeBack } from "../../src/navigation/useSafeBack";

import { SafeScreen } from "@/components/navigation/SafeScreen";
import { BackButton, StackHeader } from "@/components/navigation/StackHeader";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { THEME } from "@/lib/theme";

interface SignInMethodEntryScreenProps {
  title: string;
  helper: string;
  canSubmit: boolean;
  isSubmitting: boolean;
  onSubmit: () => Promise<void>;
  children: ReactNode;
}

/** Chrome for adding or replacing a Sign-in Method from Profile. */
export function SignInMethodEntryScreen({
  title,
  helper,
  canSubmit,
  isSubmitting,
  onSubmit,
  children,
}: SignInMethodEntryScreenProps) {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  const { t } = useTranslation("auth");
  const goBack = useSafeBack("/profile");

  return (
    <SafeScreen>
      <KeyboardAvoidingView
        behavior="padding"
        className="flex-1"
      >
        <StackHeader
          title={title}
          leading={<BackButton accessibilityLabel={t("common:back")} onPress={goBack} />}
        />

        <View className="flex-1 px-4 pt-4 gap-8">
          <Text className="text-body leading-normal text-muted-foreground">
            {helper}
          </Text>

          {children}

          <Button
            disabled={!canSubmit}
            size="lg"
            variant="brand"
            onPress={() => void onSubmit()}
          >
            {isSubmitting ? (
              <ActivityIndicator
                color={`hsl(${THEME[isDark ? "dark" : "light"].primaryForeground})`}
              />
            ) : (
              <Text>{t("getCode")}</Text>
            )}
          </Button>
        </View>
      </KeyboardAvoidingView>
    </SafeScreen>
  );
}
