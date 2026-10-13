import * as Linking from "expo-linking";
import { type ReactNode, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  type LayoutChangeEvent,
  ScrollView,
  View,
} from "react-native";
import { useColorScheme } from "nativewind";
import { useTranslation } from "react-i18next";

import { legalPageUrl } from "../../src/config/publicWebUrl";
import { BrandLogo } from "../../src/auth/BrandLogo";
import { LocaleSwitcher } from "../../src/auth/LocaleSwitcher";

import { type SignInMethod, SignInMethodTabs } from "./SignInMethodTabs";

import { SafeScreen } from "@/components/navigation/SafeScreen";
import { BackButton, StackHeader } from "@/components/navigation/StackHeader";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { useLargeText } from "@/lib/font-scale";
import { THEME } from "@/lib/theme";

interface AuthEntryScreenProps {
  method: SignInMethod;
  canSubmit: boolean;
  isSubmitting: boolean;
  onSubmit: () => Promise<void>;
  onMethodChange: (method: SignInMethod) => void;
  onClose: () => void;
  children: ReactNode;
}

export function AuthEntryScreen({
  method,
  canSubmit,
  isSubmitting,
  onSubmit,
  onMethodChange,
  onClose,
  children,
}: AuthEntryScreenProps) {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  const { t, i18n } = useTranslation("auth");

  const largeText = useLargeText();
  const scroll = useRef<ScrollView>(null);
  // When the keyboard opens the form's frame gets shorter: bring the field and
  // the submit button above the keyboard. Scrolling remains available for
  // large text and longer error messages.
  const tallestFrame = useRef(0);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const onFrameLayout = (event: LayoutChangeEvent) => {
    const { height } = event.nativeEvent.layout;
    tallestFrame.current = Math.max(tallestFrame.current, height);
    const open = height < tallestFrame.current;
    setKeyboardOpen(open);
    if (open) scroll.current?.scrollToEnd({ animated: true });
  };

  function openLegalPage(kind: "terms" | "privacy") {
    void Linking.openURL(legalPageUrl(i18n.language, kind));
  }

  return (
    <SafeScreen>
      <KeyboardAvoidingView
        behavior="padding"
        className="flex-1"
      >
        <View className="flex-1 px-4">
          <StackHeader
            className="px-0"
            leading={
              <BackButton
                kind="close"
                accessibilityLabel={t("common:close")}
                onPress={onClose}
              />
            }
            trailing={<LocaleSwitcher />}
          />

          {/* The form scrolls, so at a large font size the field and the
              button can be brought above the keyboard. At the default size it
              fits and does not move. */}
          <ScrollView
            ref={scroll}
            onLayout={onFrameLayout}
            onContentSizeChange={() => { if (keyboardOpen) scroll.current?.scrollToEnd({ animated: true }); }}
            className="flex-1"
            contentContainerClassName="flex-grow"
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            <View className="mt-3 gap-4">
              {largeText ? null : <BrandLogo width={110} height={20} />}

              <SignInMethodTabs
                value={method}
                onChange={onMethodChange}
              />

              <Text className="text-headline font-semibold leading-snug text-foreground">
                {t("entryTitle")}
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

            <Text className="mt-4 pb-6 text-caption leading-normal text-muted-foreground">
              {t("legalPrefix")} {" "}
              <Text
                className="font-medium text-link underline"
                onPress={() => openLegalPage("terms")}
              >
                {t("terms")}
              </Text>{" "}
              {t("legalAnd")} {" "}
              <Text
                className="font-medium text-link underline"
                onPress={() => openLegalPage("privacy")}
              >
                {t("privacy")}
              </Text>
              .
            </Text>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </SafeScreen>
  );
}
