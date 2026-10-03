import { router } from "expo-router";
import { useMemo, useState } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";

import { SignInMethodEntryScreen } from "../../components/account/SignInMethodEntryScreen";
import { ApiError } from "../../src/api/client";
import { useMe } from "../../src/api/identity/useMe";
import { useRequestSignInMethodChange } from "../../src/api/identity/useRequestSignInMethodChange";
import { normalizeEmail } from "../../src/auth/email";
import { getRequestOtpErrorCopy } from "../../src/auth/requestOtpError";

import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";

// Adds an email Sign-in Method, or replaces the current one, on the signed-in
// User. The code screen applies it; nothing changes until the code is confirmed.
export default function AddEmailScreen() {
  const { t } = useTranslation("account");
  const { t: tAuth } = useTranslation("auth");
  const { data: me } = useMe();
  const isChange = Boolean(me?.email);
  const [emailInput, setEmailInput] = useState("");
  // The field opens focused, so focus leaving it is not input. It only counts
  // as touched once the User has typed or tried to submit.
  const [hasTyped, setHasTyped] = useState(false);
  const [touched, setTouched] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const { mutateAsync: requestCode, isPending: isSubmitting } =
    useRequestSignInMethodChange();

  const canonicalEmail = useMemo(() => normalizeEmail(emailInput), [emailInput]);
  const showError = touched && canonicalEmail === null;
  const canSubmit = canonicalEmail !== null && !isSubmitting;

  async function handleSubmit() {
    setTouched(true);

    if (!canonicalEmail || isSubmitting) return;

    // Replacing an address with itself would only spend a code.
    if (me?.email && canonicalEmail === normalizeEmail(me.email)) {
      setRequestError(t("sameEmailError"));
      return;
    }

    setRequestError(null);

    try {
      const result = await requestCode({ email: canonicalEmail });

      router.push({
        pathname: "/account/verify-sign-in-method",
        params: {
          method: "email",
          kind: isChange ? "change" : "add",
          destination: canonicalEmail,
          resendInSeconds: String(result.resendInSeconds),
          ...(__DEV__ && result.testCode ? { testCode: result.testCode } : {}),
        },
      });
    } catch (error) {
      setRequestError(
        error instanceof ApiError
          ? getRequestOtpErrorCopy(error, tAuth, "emailFormatError")
          : tAuth("offline"),
      );
    }
  }

  return (
    <SignInMethodEntryScreen
      canSubmit={canSubmit}
      helper={t(isChange ? "changeEmailHelper" : "addEmailHelper")}
      isSubmitting={isSubmitting}
      title={t(isChange ? "changeEmailTitle" : "addEmailTitle")}
      onSubmit={handleSubmit}
    >
      <View className="gap-2">
        <Text className="text-sm font-medium text-foreground">
          {tAuth("emailLabel")}
        </Text>
        <Input
          accessibilityLabel={tAuth("emailLabel")}
          autoCapitalize="none"
          autoComplete="email"
          autoCorrect={false}
          autoFocus
          keyboardType="email-address"
          returnKeyType="send"
          aria-invalid={showError || requestError !== null}
          value={emailInput}
          onBlur={() => {
            if (hasTyped) setTouched(true);
          }}
          onChangeText={(value) => {
            setEmailInput(value);
            setHasTyped(true);
            setRequestError(null);
          }}
          onSubmitEditing={() => void handleSubmit()}
          placeholder={tAuth("emailPlaceholder")}
        />
        <Text
          className={
            showError || requestError
              ? "text-sm leading-snug text-destructive"
              : "text-sm leading-snug text-muted-foreground"
          }
        >
          {requestError ??
            (showError ? tAuth("emailFormatError") : tAuth("emailInputHelper"))}
        </Text>
      </View>
    </SignInMethodEntryScreen>
  );
}
