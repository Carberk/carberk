import { router, useLocalSearchParams } from "expo-router";
import { AlertCircle } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, ScrollView, View } from "react-native";
import { useTranslation } from "react-i18next";

import { formatResendWait } from "../../components/auth/CodeEntryForm";
import { OtpCells, type OtpCellsRef } from "../../components/auth/OtpCells";
import { useConfirmContactPhone } from "../../src/api/listings/useConfirmContactPhone";
import { useRepublishListing } from "../../src/api/listings/useRepublishListing";
import { useRequestContactPhoneCode } from "../../src/api/listings/useRequestContactPhoneCode";
import { maskTmPhone } from "../../src/auth/phone";
import {
  getContactPhoneRequestErrorCopy,
  getContactPhoneVerifyErrorCopy,
} from "../../src/listings/wizard/contactPhoneError";
import { contactPhoneReturnHref } from "../../src/listings/wizard/contactPhoneReturn";
import { HELP_HREF } from "../../src/navigation/helpHref";
import { useSafeBack } from "../../src/navigation/useSafeBack";

import { SafeScreen } from "@/components/navigation/SafeScreen";
import { BackButton, StackHeader } from "@/components/navigation/StackHeader";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useToast } from "@/components/ui/toast";

const OTP_LENGTH = 6;

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function parseInitialSeconds(value: string | undefined): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
}

/**
 * The contact-phone code entry: six cells that submit when full, a resend
 * countdown from `resendInSeconds`, and the line that says what the code
 * allows. A locked or expired code stops entry and offers "Send a new code";
 * the daily limit leaves Help as the one way forward (ADR-0081). A confirmed
 * code returns the number to the Contact step, or relists the Listing.
 */
export default function ContactPhoneCodeScreen() {
  const params = useLocalSearchParams<{
    phone?: string;
    businessId?: string;
    resendInSeconds?: string;
    testCode?: string;
    purpose?: string;
    listingId?: string;
    returnPathname?: string;
  }>();
  const { t } = useTranslation();
  const goBack = useSafeBack();
  const { show } = useToast();
  const confirm = useConfirmContactPhone(firstParam(params.businessId));
  const requestCode = useRequestContactPhoneCode(firstParam(params.businessId));
  const republish = useRepublishListing();

  const phone = firstParam(params.phone);
  const purpose = firstParam(params.purpose) === "relist" ? "relist" : "listing";
  const listingId = firstParam(params.listingId);
  const returnPathname =
    firstParam(params.returnPathname) ??
    (purpose === "relist" ? "/listings/manage" : "/(tabs)/sell");

  const otpRef = useRef<OtpCellsRef>(null);
  const [code, setCode] = useState("");
  const [testCode, setTestCode] = useState(() =>
    __DEV__ ? firstParam(params.testCode) : undefined,
  );
  const [secondsRemaining, setSecondsRemaining] = useState(() =>
    parseInitialSeconds(firstParam(params.resendInSeconds)),
  );
  const [error, setError] = useState<string | null>(null);
  const [needsNewCode, setNeedsNewCode] = useState(false);
  const [dailyLimit, setDailyLimit] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const lastSubmittedCode = useRef<string | null>(null);

  useEffect(() => {
    otpRef.current?.focus();
  }, []);

  useEffect(() => {
    if (secondsRemaining <= 0) return;
    const timer = setInterval(() => {
      setSecondsRemaining((current) => Math.max(0, current - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [secondsRemaining]);

  useEffect(() => {
    if (phone) return;
    goBack();
  }, [phone, goBack]);

  async function finishConfirmed(alreadyConfirmed = false) {
    if (purpose === "relist" && listingId) {
      try {
        await republish.mutateAsync(listingId);
        show({ title: t("ownerDoneRelist"), variant: "success" });
      } catch {
        // The number is confirmed now; a failed relist can be retried from
        // the Listing. Say so and return there either way.
        show({ title: t("actionFailed"), variant: "destructive" });
      }
      router.dismissTo(contactPhoneReturnHref(returnPathname, purpose));
      return;
    }
    show({
      title: t(
        alreadyConfirmed
          ? "contactPhoneAlreadyConfirmed"
          : "contactPhoneConfirmedToast",
      ),
      variant: "success",
    });
    router.dismissTo(
      contactPhoneReturnHref(
        returnPathname,
        purpose,
        { ...(phone ? { confirmedContactPhone: phone } : {}), ...(params.businessId ? { businessId: params.businessId } : {}) },
      ),
    );
  }

  async function submitCode(nextCode: string) {
    if (!phone || nextCode.length !== OTP_LENGTH || isVerifying) return;

    setError(null);
    setIsVerifying(true);
    try {
      await confirm.mutateAsync({ phone, code: nextCode });
      await finishConfirmed();
    } catch (verifyError) {
      otpRef.current?.shake();
      setCode("");
      lastSubmittedCode.current = null;
      const copy = getContactPhoneVerifyErrorCopy(verifyError, t);
      setError(copy.message);
      setNeedsNewCode(copy.needsNewCode);
      if (copy.needsNewCode) {
        // The code is dead, so what was left of its resend wait no longer
        // applies: "Send a new code" is offered at once.
        setSecondsRemaining(0);
      } else {
        otpRef.current?.focus();
      }
    } finally {
      setIsVerifying(false);
    }
  }

  useEffect(() => {
    if (
      code.length === OTP_LENGTH &&
      !isVerifying &&
      lastSubmittedCode.current !== code
    ) {
      lastSubmittedCode.current = code;
      void submitCode(code);
    }
    // Runs when the code or the verifying flag changes; submitCode reads the rest live.
  }, [code, isVerifying]);

  function handleCodeChange(value: string) {
    if (dailyLimit) return;
    setError(null);
    setCode(value);
  }

  async function resendCode() {
    if (!phone || dailyLimit || isResending || secondsRemaining > 0) return;

    setError(null);
    setCode("");
    lastSubmittedCode.current = null;
    setIsResending(true);
    try {
      const result = await requestCode.mutateAsync({ phone });
      if (result.status === "confirmed") {
        await finishConfirmed(true);
        return;
      }
      setSecondsRemaining(result.resendInSeconds);
      setNeedsNewCode(false);
      setTestCode(__DEV__ ? result.testCode : undefined);
      otpRef.current?.focus();
    } catch (resendError) {
      const copy = getContactPhoneRequestErrorCopy(resendError, t);
      setDailyLimit(copy.dailyLimit);
      // A backoff refusal carries the wait: the message says it and the
      // countdown holds the button, also for "Send a new code".
      if (copy.retryInSeconds != null) {
        setError(
          t("contactPhoneRateWait", {
            time: formatResendWait(copy.retryInSeconds),
          }),
        );
        setSecondsRemaining(copy.retryInSeconds);
      } else {
        setError(copy.message);
      }
    } finally {
      setIsResending(false);
    }
  }

  if (!phone) return null;

  const resendBlocked = isResending || secondsRemaining > 0;
  const resendLabel =
    secondsRemaining > 60
      ? t("resendCodeInMinutes", { time: formatResendWait(secondsRemaining) })
      : secondsRemaining > 0
        ? t("resendCodeIn", { seconds: secondsRemaining })
        : needsNewCode
          ? t("sendNewCode")
          : isResending
            ? t("loading")
            : t("resendContactCode");

  return (
    <SafeScreen>
      <KeyboardAvoidingView
        behavior="padding"
        className="flex-1"
      >
        <StackHeader
          leading={<BackButton accessibilityLabel={t("back")} onPress={goBack} />}
        />

        <ScrollView
          className="flex-1"
          contentContainerClassName="gap-6 px-4 pb-6 pt-4"
          keyboardShouldPersistTaps="handled"
        >
          <View className="gap-2">
            <Text
              accessibilityRole="header"
              className="text-headline font-semibold leading-snug text-foreground"
            >
              {t("contactCodeTitle")}
            </Text>
            <Text className="text-body leading-normal text-muted-foreground">
              {t("contactCodeSentTo", { destination: maskTmPhone(phone) })}
            </Text>
            <Text className="text-callout leading-normal text-muted-foreground">
              {t("contactCodeExpiry")}
            </Text>
            <Text className="text-callout leading-normal text-muted-foreground">
              {t("codePurposeListing")}
            </Text>
            {/* A relist confirms the Listing's own number only (ADR-0081),
                and its sheet opens this screen directly: no number to change. */}
            {purpose === "relist" ? null : (
              <Button
                variant="link"
                className="self-start px-0"
                onPress={goBack}
              >
                <Text>{t("changeNumber")}</Text>
              </Button>
            )}
          </View>

          <OtpCells
            ref={otpRef}
            disabled={isVerifying || isResending || needsNewCode || dailyLimit}
            hasError={error !== null}
            length={OTP_LENGTH}
            onChange={handleCodeChange}
            value={code}
          />

          {error ? (
            <View className="flex-row items-center gap-1.5">
              <Icon as={AlertCircle} className="size-4 text-destructive" />
              <Text
                accessibilityLiveRegion="polite"
                className="flex-1 text-callout leading-snug text-destructive"
              >
                {error}
              </Text>
            </View>
          ) : null}

          {dailyLimit ? (
            <Button
              variant="link"
              role="link"
              accessibilityRole="link"
              className="self-start px-0"
              onPress={() => router.push(HELP_HREF)}
            >
              <Text className="underline">{t("support:help")}</Text>
            </Button>
          ) : (
            <Button
              variant="link"
              className="self-start px-0"
              disabled={resendBlocked}
              onPress={resendCode}
            >
              <Text
                className={
                  resendBlocked
                    ? "text-muted-foreground"
                    : "text-foreground underline"
                }
              >
                {resendLabel}
              </Text>
            </Button>
          )}

          {__DEV__ && testCode && !needsNewCode && !dailyLimit ? (
            <Button
              className="h-auto self-start rounded-full px-3 py-1"
              size="sm"
              variant="secondary"
              onPress={() => {
                setCode(testCode);
                setError(null);
              }}
            >
              <Text>{t("auth:devCode", { code: testCode })}</Text>
            </Button>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeScreen>
  );
}
