import { router, useLocalSearchParams } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import { KeyboardAvoidingView, Platform, View } from "react-native";
import { useTranslation } from "react-i18next";
import type { AuthSchemas } from "@auto-tm/contracts";

import { CodeEntryForm } from "../../components/auth/CodeEntryForm";
import { useRequestOtp } from "../../src/api/identity/useRequestOtp";
import { ApiError } from "../../src/api/client";
import { useRestoreAccount } from "../../src/api/identity/useRestoreAccount";
import { useRevokePendingSession } from "../../src/api/identity/useRevokePendingSession";
import { useVerifyOtp } from "../../src/api/identity/useVerifyOtp";
import { BrandLogo } from "../../src/auth/BrandLogo";
import { LocaleSwitcher } from "../../src/auth/LocaleSwitcher";
import { normalizeEmail } from "../../src/auth/email";
import { maskTmPhone, normalizeTmPhone } from "../../src/auth/phone";
import { storeAuthSession } from "../../src/auth/session";
import { useOtpAuthNavigation } from "../../src/auth/useOtpAuthNavigation";

import { SafeScreen } from "@/components/navigation/SafeScreen";
import { Text } from "@/components/ui/text";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function parseInitialSeconds(value: string | undefined): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
}

export default function OtpScreen() {
  const params = useLocalSearchParams<{
    method?: string;
    destination?: string;
    resendInSeconds?: string;
    testCode?: string;
  }>();
  const { t, i18n } = useTranslation("auth");
  // The restore prompt's copy lives in the account namespace.
  const { t: tAccount } = useTranslation("account");
  const authNavigation = useOtpAuthNavigation(router);

  const method = firstParam(params.method);
  const destination = firstParam(params.destination);
  // The session of a User whose deletion is scheduled. It is not stored, and
  // the account is not restored, until the User presses Restore (ADR-0032).
  const [pendingSession, setPendingSession] =
    useState<AuthSchemas.OtpVerifyResponse | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreFailed, setRestoreFailed] = useState(false);
  // The pending access token lives only 15 minutes; once it expires every
  // restore answers 401, so the only way forward is to sign in again.
  const [sessionExpired, setSessionExpired] = useState(false);

  const { mutateAsync: verifyOtpMutate } = useVerifyOtp();
  const { mutateAsync: requestOtpMutate } = useRequestOtp();
  const { mutateAsync: restoreAccountMutate } = useRestoreAccount();
  const { mutateAsync: revokePendingSessionMutate } = useRevokePendingSession();

  const restoreDate = useMemo(
    () =>
      pendingSession?.user.deletionScheduledAt
        ? new Intl.DateTimeFormat(i18n.language ?? "ru", {
            year: "numeric",
            month: "long",
            day: "numeric",
          }).format(new Date(pendingSession.user.deletionScheduledAt))
        : "",
    [pendingSession, i18n.language],
  );

  const canonicalDestination = useMemo(() => {
    if (!destination) return null;
    if (method === "phone") return normalizeTmPhone(destination);
    if (method === "email") return normalizeEmail(destination);
    return null;
  }, [destination, method]);
  const displayedDestination =
    method === "phone" && canonicalDestination
      ? maskTmPhone(canonicalDestination)
      : (canonicalDestination ?? "");
  const identifier = canonicalDestination
    ? method === "email"
      ? { email: canonicalDestination }
      : { phone: canonicalDestination }
    : null;

  useEffect(() => {
    if (!canonicalDestination || (method !== "phone" && method !== "email")) {
      authNavigation.invalidDestination(method === "email" ? "email" : "phone");
    }
  }, [canonicalDestination, method]);

  function cancelAuth() {
    authNavigation.cancel();
  }

  function changeSignInMethod() {
    authNavigation.changeMethod();
  }

  async function verifyCode(code: string) {
    if (!identifier) return;

    const result = await verifyOtpMutate({
      ...identifier,
      code,
      deviceLabel: Platform.OS === "ios" ? "iOS app" : "Android app",
    });

    if (result.user.deletionScheduledAt) {
      setRestoreFailed(false);
      setSessionExpired(false);
      setPendingSession(result);
      return;
    }

    await storeAuthSession(result);
    authNavigation.complete();
  }

  async function resendCode() {
    if (!identifier) throw new Error("Missing Sign-in Method");

    return requestOtpMutate(identifier);
  }

  async function handleRestoreConfirm() {
    if (!pendingSession || isRestoring) return;

    setIsRestoring(true);
    setRestoreFailed(false);
    try {
      await restoreAccountMutate(pendingSession.accessToken);
      await storeAuthSession({
        ...pendingSession,
        user: { ...pendingSession.user, deletionScheduledAt: null },
      });
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setSessionExpired(true);
      } else {
        // Keep the prompt open so the User can retry; restoring twice is harmless.
        setRestoreFailed(true);
      }
      setIsRestoring(false);
      return;
    }
    setPendingSession(null);
    setIsRestoring(false);
    authNavigation.complete();
  }

  async function handleRestoreCancel() {
    if (!pendingSession || isRestoring) return;

    await leavePendingSession(pendingSession.refreshToken);
  }

  async function leavePendingSession(refreshToken: string) {
    setPendingSession(null);
    setRestoreFailed(false);
    setSessionExpired(false);
    await revokePendingSessionMutate(refreshToken);
    changeSignInMethod();
  }

  return (
    <>
      <SafeScreen>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          className="flex-1"
        >
          <View className="flex-1 px-4">
            <View className="flex-row items-center justify-between py-4">
              <Button
                accessibilityLabel={t("back")}
                size="icon"
                variant="ghost"
                className="h-11 w-11"
                onPress={cancelAuth}
              >
                <Icon as={ChevronLeft} className="size-5 text-foreground" />
              </Button>
              <LocaleSwitcher />
            </View>

            <View className="mt-6 gap-6">
              <BrandLogo />

              <CodeEntryForm
                method={method === "email" ? "email" : "phone"}
                displayedDestination={displayedDestination}
                initialResendSeconds={parseInitialSeconds(
                  firstParam(params.resendInSeconds),
                )}
                initialTestCode={firstParam(params.testCode)}
                verify={verifyCode}
                resend={resendCode}
                onChangeDestination={changeSignInMethod}
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </SafeScreen>

      {/* Account restoration prompt during deletion grace */}
      <AlertDialog open={pendingSession !== null}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tAccount("restoreAccountTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {tAccount("restoreAccountMessage", { date: restoreDate })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {restoreFailed || sessionExpired ? (
            <Text className="text-sm text-destructive" accessibilityLiveRegion="polite">
              {tAccount(
                sessionExpired ? "restoreAccountExpired" : "restoreAccountError",
              )}
            </Text>
          ) : null}
          <AlertDialogFooter>
            {sessionExpired ? (
              <Button onPress={() => void handleRestoreCancel()}>
                <Text>{tAccount("restoreAccountSignInAgain")}</Text>
              </Button>
            ) : (
              <>
                <Button
                  variant="outline"
                  disabled={isRestoring}
                  onPress={() => void handleRestoreCancel()}
                >
                  <Text>{tAccount("restoreAccountCancel")}</Text>
                </Button>
                <Button
                  disabled={isRestoring}
                  onPress={() => void handleRestoreConfirm()}
                >
                  <Text>{tAccount("restoreAccountConfirm")}</Text>
                </Button>
              </>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
