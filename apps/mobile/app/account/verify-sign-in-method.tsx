import { router, useLocalSearchParams } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { useEffect, useMemo, useRef } from "react";
import { KeyboardAvoidingView, Platform, View } from "react-native";
import { useTranslation } from "react-i18next";

import { CodeEntryForm } from "../../components/auth/CodeEntryForm";
import { useRequestSignInMethodChange } from "../../src/api/identity/useRequestSignInMethodChange";
import { useVerifySignInMethodChange } from "../../src/api/identity/useVerifySignInMethodChange";
import { maskEmail, normalizeEmail } from "../../src/auth/email";
import { maskTmPhone, normalizeTmPhone } from "../../src/auth/phone";
import { signInMethodNoticeStore } from "../../src/auth/signInMethodNotice";
import { isSignInMethodTaken } from "../../src/auth/verifyCodeError";
import { useSafeBack } from "../../src/navigation/useSafeBack";

import { SafeScreen } from "@/components/navigation/SafeScreen";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function parseInitialSeconds(value: string | undefined): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
}

// Confirms the code sent to a new phone or email. Success stores the new
// Sign-in Method on the same User and returns to Profile still signed in,
// which says it was added or changed. SIGN_IN_METHOD_TAKEN opens the refused
// state on top of Profile instead of an inline error.
export default function VerifySignInMethodScreen() {
  const params = useLocalSearchParams<{
    method?: string;
    destination?: string;
    resendInSeconds?: string;
    testCode?: string;
    /** "add" or "change", set by the entry screen. */
    kind?: string;
  }>();
  const { t } = useTranslation("auth");
  const goBack = useSafeBack("/profile");
  const { mutateAsync: verifyChange } = useVerifySignInMethodChange();
  const { mutateAsync: requestCode } = useRequestSignInMethodChange();

  const method = firstParam(params.method) === "email" ? "email" : "phone";
  const kind = firstParam(params.kind) === "add" ? "added" : "changed";
  // False once the User has left; a late refusal is then dropped.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const destination = firstParam(params.destination);
  const identifier = useMemo(() => {
    if (!destination) return null;
    if (method === "email") {
      const email = normalizeEmail(destination);
      return email ? { email } : null;
    }
    const phone = normalizeTmPhone(destination);
    return phone ? { phone } : null;
  }, [destination, method]);

  useEffect(() => {
    if (!identifier) router.replace("/profile");
  }, [identifier]);

  if (!identifier) return null;

  const displayedDestination = identifier.phone
    ? maskTmPhone(identifier.phone)
    : (identifier.email ?? "");

  async function verifyCode(code: string) {
    if (!identifier) return;

    try {
      await verifyChange({ ...identifier, code });
    } catch (error) {
      if (!isSignInMethodTaken(error)) throw error;
      // Nothing changed on the account, so a refusal the User left behind
      // needs no screen.
      if (!mounted.current) return;
      router.dismissTo("/profile");
      router.push({ pathname: "/account/sign-in-method-taken", params: { method } });
      return;
    }

    // The change is applied even if the User already pressed Back. Profile
    // still shows the line when they reach it, but a User who has moved on is
    // not pulled back there.
    signInMethodNoticeStore.getState().show({
      kind,
      value: identifier.phone ? maskTmPhone(identifier.phone) : maskEmail(identifier.email ?? ""),
    });
    if (mounted.current) router.dismissTo("/profile");
  }

  async function resendCode() {
    if (!identifier) throw new Error("Missing Sign-in Method");

    return requestCode(identifier);
  }

  return (
    <SafeScreen>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1"
      >
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

        <View className="flex-1 px-4 pt-4">
          <CodeEntryForm
            method={method}
            displayedDestination={displayedDestination}
            initialResendSeconds={parseInitialSeconds(
              firstParam(params.resendInSeconds),
            )}
            initialTestCode={firstParam(params.testCode)}
            verify={verifyCode}
            resend={resendCode}
            onChangeDestination={goBack}
          />
        </View>
      </KeyboardAvoidingView>
    </SafeScreen>
  );
}
