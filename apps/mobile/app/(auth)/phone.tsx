import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";

import { AuthEntryScreen } from "../../components/auth/AuthEntryScreen";
import { PhoneInput } from "../../components/auth/PhoneInput";
import { ApiError } from "../../src/api/client";
import { useRequestOtp } from "../../src/api/identity/useRequestOtp";
import { useAuthIntentStore } from "../../src/auth/intentStore";
import { getRequestOtpErrorCopy } from "../../src/auth/requestOtpError";
import { usePhoneField } from "../../src/auth/usePhoneField";

import { Text } from "@/components/ui/text";

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default function PhoneScreen() {
  const params = useLocalSearchParams<{
    phone?: string;
    authRoot?: string;
  }>();
  const initialPhone = firstParam(params.phone);
  // Whether this entry started authentication is fixed when it mounts. A
  // later pop back to it (Use phone instead) can arrive without the param,
  // and that must not cancel the pending intent.
  const [isAuthRoot] = useState(() => firstParam(params.authRoot) === "1");
  const { t } = useTranslation("auth");

  const phone = usePhoneField(t, initialPhone);

  const { mutateAsync: requestOtp, isPending: isSubmitting } = useRequestOtp();

  // The route that started authentication owns abandoned-flow cleanup. A
  // sibling method screen can sit above it without cancelling the intent.
  useEffect(() => {
    if (!isAuthRoot) return;

    return () => {
      useAuthIntentStore.getState().cancelSignIn();
    };
  }, [isAuthRoot]);

  const canonicalPhone = phone.canonicalPhone;
  const canSubmit = canonicalPhone !== null && !isSubmitting;

  async function handleSubmit() {
    phone.touch();

    if (!canonicalPhone || isSubmitting) return;

    phone.setRequestError(null);

    try {
      const result = await requestOtp({ phone: canonicalPhone });

      router.push({
        pathname: "/(auth)/otp",
        params: {
          method: "phone",
          destination: canonicalPhone,
          requestId: result.requestId,
          resendInSeconds: String(result.resendInSeconds),
          ...(__DEV__ && result.testCode ? { testCode: result.testCode } : {}),
        },
      });
    } catch (error) {
      if (error instanceof ApiError) {
        phone.setRequestError(
          getRequestOtpErrorCopy(error, t, "phoneFormatError"),
        );
      } else {
        phone.setRequestError(t("offline"));
      }
    }
  }

  return (
    <AuthEntryScreen
      canSubmit={canSubmit}
      helper={t("phoneHelper")}
      isSubmitting={isSubmitting}
      method="phone"
      title={t("phoneTitle")}
      onSubmit={handleSubmit}
    >
      <View className="gap-2">
        <Text className="text-sm font-medium text-foreground">
          {t("phoneLabel")}
        </Text>
        <PhoneInput
          accessibilityLabel={t("phoneLabel")}
          hasError={phone.showError}
          keyboardType="phone-pad"
          onBlur={phone.touch}
          onChangeText={phone.onChangeText}
          placeholder={t("phonePlaceholder")}
          textContentType="telephoneNumber"
          value={phone.display}
        />
        <Text
          className={
            phone.showError
              ? "text-sm leading-snug text-destructive"
              : "text-sm leading-snug text-muted-foreground"
          }
        >
          {phone.helperText}
        </Text>
      </View>
    </AuthEntryScreen>
  );
}
