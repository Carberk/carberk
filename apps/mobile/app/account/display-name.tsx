import { router } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  View,
} from "react-native";
import { useColorScheme } from "nativewind";
import { useTranslation } from "react-i18next";
import { IdentitySchemas } from "@auto-tm/contracts";

import { ApiError } from "../../src/api/client";
import { getDisplayNameRefusal } from "../../src/api/getErrorCopy";
import { useMe } from "../../src/api/identity/useMe";
import { useUpdateDisplayName } from "../../src/api/identity/useUpdateDisplayName";
import { signInMethodNoticeStore } from "../../src/auth/signInMethodNotice";
import {
  describeDisplayNameField,
  fieldErrorFor,
  type DisplayNameFieldError,
} from "../../src/identity/displayNameField";
import { useDisplayName } from "../../src/identity/useDisplayName";
import { useSafeBack } from "../../src/navigation/useSafeBack";

import { SafeScreen } from "@/components/navigation/SafeScreen";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { THEME } from "@/lib/theme";
import { cn } from "@/lib/utils";

const ERROR_KEY: Record<DisplayNameFieldError, string> = {
  empty: "nameEmpty",
  spaces: "nameOnlySpaces",
  too_short: "nameTooShort",
  too_long: "nameTooLong",
};

/** Room past the 30-character limit, so a pasted name shows why it is refused. */
const FIELD_MAX_LENGTH = 40;

type SaveFailure = "failed" | "offline" | null;

/**
 * Sets the User's Display Name. The field opens holding the name others see
 * now, generated or set. Back leaves without asking; a save in flight still
 * lands, and Profile shows it.
 */
export default function DisplayNameScreen() {
  const { t } = useTranslation(["account", "common"]);
  const { colorScheme } = useColorScheme();
  const goBack = useSafeBack("/profile");
  const { data: me } = useMe();
  const nameOf = useDisplayName();
  const currentName = me ? nameOf(me) : null;
  const { mutateAsync: updateDisplayName, isPending: isSaving } = useUpdateDisplayName();

  const [text, setText] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [failure, setFailure] = useState<SaveFailure>(null);
  const [refusal, setRefusal] = useState<DisplayNameFieldError | null>(null);

  // False once the User has left; a save that lands later does not navigate.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // The field fills once with the current name and is the User's afterwards.
  useEffect(() => {
    if (text === null && currentName !== null) setText(currentName);
  }, [text, currentName]);

  const value = text ?? "";
  const field = describeDisplayNameField(value, currentName ?? "");
  const shownError = refusal ?? (touched ? field.error : null);
  const message = shownError
    ? t(ERROR_KEY[shownError])
    : failure === "failed"
      ? t("nameSaveFailed")
      : failure === "offline"
        ? t("common:offline")
        : null;
  const canSave = field.canSave && !isSaving && refusal === null;

  async function save() {
    if (!canSave) return;
    const sent = field.normalized;
    setFailure(null);
    try {
      await updateDisplayName(sent);
    } catch (error) {
      if (!mounted.current) return;
      const reason = getDisplayNameRefusal(error);
      if (reason !== undefined) {
        setRefusal(fieldErrorFor(sent, reason));
      } else {
        const offline =
          !(error instanceof ApiError) || error.code === "NETWORK_ERROR" || error.status === 0;
        setFailure(offline ? "offline" : "failed");
      }
      return;
    }
    signInMethodNoticeStore.getState().show({ kind: "nameSaved" });
    if (mounted.current) router.dismissTo("/profile");
  }

  return (
    <SafeScreen>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1"
      >
        <View className="px-4 pb-3 flex-row items-center gap-2">
          <Button
            accessibilityLabel={t("common:back")}
            variant="ghost"
            size="icon"
            className="h-11 w-11"
            onPress={goBack}
          >
            <Icon as={ChevronLeft} className="size-6 text-foreground" />
          </Button>
          <Text
            className="flex-1 text-2xl font-heading text-foreground"
            numberOfLines={1}
          >
            {t("nameTitle")}
          </Text>
        </View>

        <View className="flex-1 px-4 pt-4 gap-4">
          <Text className="text-base leading-normal text-muted-foreground">
            {t("nameHelper")}
          </Text>

          <View className="gap-1.5">
            <Input
              accessibilityLabel={t("nameTitle")}
              autoCapitalize="words"
              autoComplete="off"
              autoCorrect={false}
              autoFocus
              editable={!isSaving}
              maxLength={FIELD_MAX_LENGTH}
              returnKeyType="done"
              aria-invalid={shownError !== null}
              className={cn(shownError !== null && "border-destructive")}
              value={value}
              onChangeText={(next) => {
                setText(next);
                setTouched(true);
                setFailure(null);
                setRefusal(null);
              }}
              onSubmitEditing={() => void save()}
            />
            <View className="flex-row justify-between gap-3">
              {message ? (
                <Text
                  accessibilityLiveRegion="polite"
                  accessibilityRole="alert"
                  className="flex-1 text-[13px] leading-snug text-destructive"
                >
                  {message}
                </Text>
              ) : (
                <Text className="flex-1 text-[13px] leading-snug text-muted-foreground">
                  {t("nameRule")}
                </Text>
              )}
              <Text
                className={cn(
                  "text-[13px] leading-snug",
                  field.count > IdentitySchemas.DISPLAY_NAME_MAX ? "text-destructive" : "text-muted-foreground",
                )}
              >
                {`${field.count}/${IdentitySchemas.DISPLAY_NAME_MAX}`}
              </Text>
            </View>
          </View>

          <Button
            accessibilityLabel={isSaving ? t("common:saving") : undefined}
            disabled={!canSave}
            size="lg"
            variant="brand"
            onPress={() => void save()}
          >
            {isSaving ? (
              <View className="flex-row items-center gap-2">
                <ActivityIndicator
                  color={`hsl(${THEME[colorScheme === "dark" ? "dark" : "light"].primaryForeground})`}
                />
                <Text>{t("common:saving")}</Text>
              </View>
            ) : (
              <Text>{failure ? t("common:retry") : t("common:save")}</Text>
            )}
          </Button>
        </View>
      </KeyboardAvoidingView>
    </SafeScreen>
  );
}
