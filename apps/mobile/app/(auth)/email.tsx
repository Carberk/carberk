import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";

import { AuthEntryScreen } from "../../components/auth/AuthEntryScreen";
import { ApiError } from "../../src/api/client";
import { useRequestOtp } from "../../src/api/identity/useRequestOtp";
import { normalizeEmail } from "../../src/auth/email";
import { useAuthIntentStore } from "../../src/auth/intentStore";
import { getRequestOtpErrorCopy } from "../../src/auth/requestOtpError";

import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default function EmailScreen() {
  const params = useLocalSearchParams<{ email?: string; authRoot?: string }>();
  // Whether this entry started authentication is fixed when it mounts. A
  // later pop back to it (Use phone instead) can arrive without the param,
  // and that must not cancel the pending intent.
  const [isAuthRoot] = useState(() => firstParam(params.authRoot) === "1");
  const { t } = useTranslation("auth");
  const [emailInput, setEmailInput] = useState(firstParam(params.email) ?? "");
  const [touched, setTouched] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const { mutateAsync: requestOtp, isPending: isSubmitting } = useRequestOtp();

  useEffect(() => {
    if (!isAuthRoot) return;

    return () => {
      useAuthIntentStore.getState().cancelSignIn();
    };
  }, [isAuthRoot]);

  const canonicalEmail = useMemo(() => normalizeEmail(emailInput), [emailInput]);
  const showError = touched && canonicalEmail === null;
  const canSubmit = canonicalEmail !== null && !isSubmitting;

  async function handleSubmit() {
    setTouched(true);

    if (!canonicalEmail || isSubmitting) return;

    setRequestError(null);

    try {
      const result = await requestOtp({ email: canonicalEmail });

      router.push({
        pathname: "/(auth)/otp",
        params: {
          method: "email",
          destination: canonicalEmail,
          requestId: result.requestId,
          resendInSeconds: String(result.resendInSeconds),
          ...(__DEV__ && result.testCode ? { testCode: result.testCode } : {}),
        },
      });
    } catch (error) {
      if (error instanceof ApiError) {
        setRequestError(getRequestOtpErrorCopy(error, t, "emailFormatError"));
      } else {
        setRequestError(t("offline"));
      }
    }
  }

  return (
    <AuthEntryScreen
      canSubmit={canSubmit}
      helper={t("emailHelper")}
      isSubmitting={isSubmitting}
      method="email"
      title={t("emailTitle")}
      onSubmit={handleSubmit}
    >
      <View className="gap-2">
        <Text className="text-sm font-medium text-foreground">
          {t("emailLabel")}
        </Text>
        <Input
          accessibilityLabel={t("emailLabel")}
          autoCapitalize="none"
          autoComplete="email"
          autoCorrect={false}
          autoFocus
          keyboardType="email-address"
          returnKeyType="send"
          aria-invalid={showError || requestError !== null}
          value={emailInput}
          onBlur={() => setTouched(true)}
          onChangeText={(value) => {
            setEmailInput(value);
            setRequestError(null);
          }}
          onSubmitEditing={() => void handleSubmit()}
          placeholder={t("emailPlaceholder")}
        />
        <Text
          className={
            showError || requestError
              ? "text-sm leading-snug text-destructive"
              : "text-sm leading-snug text-muted-foreground"
          }
        >
          {requestError ??
            (showError ? t("emailFormatError") : t("emailInputHelper"))}
        </Text>
      </View>
    </AuthEntryScreen>
  );
}
