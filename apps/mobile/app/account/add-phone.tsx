import { router } from "expo-router";
import { View } from "react-native";
import { useTranslation } from "react-i18next";

import { SignInMethodEntryScreen } from "../../components/account/SignInMethodEntryScreen";
import { PhoneInput } from "../../components/auth/PhoneInput";
import { ApiError } from "../../src/api/client";
import { useMe } from "../../src/api/identity/useMe";
import { useRequestSignInMethodChange } from "../../src/api/identity/useRequestSignInMethodChange";
import { getRequestOtpErrorCopy } from "../../src/auth/requestOtpError";
import { usePhoneField } from "../../src/auth/usePhoneField";

import { Text } from "@/components/ui/text";

// Adds a phone Sign-in Method, or replaces the current one, on the signed-in
// User. The code screen applies it; nothing changes until the code is confirmed.
export default function AddPhoneScreen() {
  const { t } = useTranslation("account");
  const { t: tAuth } = useTranslation("auth");
  const { data: me } = useMe();
  const isChange = Boolean(me?.phone);
  const phone = usePhoneField(tAuth);
  const { mutateAsync: requestCode, isPending: isSubmitting } =
    useRequestSignInMethodChange();

  const canonicalPhone = phone.canonicalPhone;
  const canSubmit = canonicalPhone !== null && !isSubmitting;

  async function handleSubmit() {
    phone.touch();

    if (!canonicalPhone || isSubmitting) return;

    // Replacing a number with itself would only spend a code.
    if (canonicalPhone === me?.phone) {
      phone.setRequestError(t("samePhoneError"));
      return;
    }

    phone.setRequestError(null);

    try {
      const result = await requestCode({ phone: canonicalPhone });

      router.push({
        pathname: "/account/verify-sign-in-method",
        params: {
          method: "phone",
          kind: isChange ? "change" : "add",
          destination: canonicalPhone,
          resendInSeconds: String(result.resendInSeconds),
          ...(__DEV__ && result.testCode ? { testCode: result.testCode } : {}),
        },
      });
    } catch (error) {
      phone.setRequestError(
        error instanceof ApiError
          ? getRequestOtpErrorCopy(error, tAuth, "phoneFormatError")
          : tAuth("offline"),
      );
    }
  }

  return (
    <SignInMethodEntryScreen
      canSubmit={canSubmit}
      helper={t(isChange ? "changePhoneHelper" : "addPhoneHelper")}
      isSubmitting={isSubmitting}
      title={t(isChange ? "changePhoneTitle" : "addPhoneTitle")}
      onSubmit={handleSubmit}
    >
      <View className="gap-2">
        <Text className="text-sm font-medium text-foreground">
          {tAuth("phoneLabel")}
        </Text>
        <PhoneInput
          accessibilityLabel={tAuth("phoneLabel")}
          autoFocus
          hasError={phone.showError}
          keyboardType="phone-pad"
          onBlur={phone.touch}
          onChangeText={phone.onChangeText}
          placeholder={tAuth("phonePlaceholder")}
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
    </SignInMethodEntryScreen>
  );
}
