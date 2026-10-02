import { AlertCircle } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { useColorScheme } from "nativewind";
import { useTranslation } from "react-i18next";

import {
  getResendCodeErrorCopy,
  getVerifyCodeErrorCopy,
} from "../../src/auth/verifyCodeError";

import { OtpCells, type OtpCellsRef } from "./OtpCells";

import { THEME } from "@/lib/theme";
import { Text } from "@/components/ui/text";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";

const OTP_LENGTH = 6;

/** "1:05" for a wait over a minute; the server's backoff grows to 16 minutes. */
export function formatResendWait(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

export interface ResendCodeResult {
  resendInSeconds: number;
  testCode?: string;
}

interface CodeEntryFormProps {
  method: "phone" | "email";
  /** Already masked or formatted for display. */
  displayedDestination: string;
  initialResendSeconds: number;
  initialTestCode?: string;
  /** Resolves when the code is accepted; rejects with the API error otherwise. */
  verify: (code: string) => Promise<void>;
  resend: () => Promise<ResendCodeResult>;
  onChangeDestination: () => void;
  /** Opens Help. Offered only once the daily code limit is reached. */
  onContactSupport: () => void;
  /** Sign-in only: leave an email code for the phone entry. */
  onUsePhoneInstead?: () => void;
}

/**
 * The Sign-in Code entry shared by sign-in and by adding or replacing a
 * Sign-in Method: six cells that submit when full, the resend countdown, and
 * localized error copy. Screens own the chrome and what happens on success.
 *
 * When a resend hits the daily destination limit nothing more can be tried
 * here today: Resend and code entry stop and Contact support is the one way
 * forward. An email code that has not arrived gets a hint once the first wait
 * is over or after a resend (ADR-0055: undelivered email fails silently).
 */
export function CodeEntryForm({
  method,
  displayedDestination,
  initialResendSeconds,
  initialTestCode,
  verify,
  resend,
  onChangeDestination,
  onContactSupport,
  onUsePhoneInstead,
}: CodeEntryFormProps) {
  const otpRef = useRef<OtpCellsRef>(null);
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  const { t } = useTranslation("auth");

  const [code, setCode] = useState("");
  const [testCode, setTestCode] = useState(
    __DEV__ ? initialTestCode : undefined,
  );
  const [secondsRemaining, setSecondsRemaining] = useState(initialResendSeconds);
  const [error, setError] = useState<string | null>(null);
  const [terminalError, setTerminalError] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [dailyLimit, setDailyLimit] = useState(false);
  const [hasResent, setHasResent] = useState(false);
  const lastSubmittedCode = useRef<string | null>(null);

  useEffect(() => {
    otpRef.current?.focus();
  }, []);

  useEffect(() => {
    if (secondsRemaining <= 0) {
      return;
    }

    const timer = setInterval(() => {
      setSecondsRemaining((current) => Math.max(0, current - 1));
    }, 1000);

    return () => clearInterval(timer);
  }, [secondsRemaining]);

  useEffect(() => {
    if (
      code.length === OTP_LENGTH &&
      !isVerifying &&
      lastSubmittedCode.current !== code
    ) {
      lastSubmittedCode.current = code;
      void submitCode(code);
    }
  }, [code, isVerifying]);

  function handleCodeChange(value: string) {
    if (dailyLimit) return;
    setError(null);
    setCode(value);
  }

  async function submitCode(nextCode: string) {
    if (nextCode.length !== OTP_LENGTH || isVerifying) {
      return;
    }

    setError(null);
    setIsVerifying(true);

    try {
      await verify(nextCode);
    } catch (verifyError) {
      otpRef.current?.shake();
      setCode("");
      lastSubmittedCode.current = null;

      const copy = getVerifyCodeErrorCopy(verifyError, t, method);
      setError(copy.message);
      setTerminalError(copy.terminal);
      if (!copy.terminal) {
        requestAnimationFrame(() => otpRef.current?.focus());
      }
    } finally {
      setIsVerifying(false);
    }
  }

  async function resendCode() {
    if (secondsRemaining > 0 || isResending || dailyLimit) {
      return;
    }

    setError(null);
    setCode("");
    lastSubmittedCode.current = null;
    setIsResending(true);

    try {
      const result = await resend();
      setSecondsRemaining(result.resendInSeconds);
      setHasResent(true);
      setTestCode(__DEV__ ? result.testCode : undefined);
      requestAnimationFrame(() => otpRef.current?.focus());
    } catch (resendError) {
      const copy = getResendCodeErrorCopy(resendError, t);
      setError(copy.message);
      setDailyLimit(copy.dailyLimit);
    } finally {
      setIsResending(false);
    }
  }

  const showEmailHint =
    method === "email" &&
    !dailyLimit &&
    (hasResent || secondsRemaining === 0);

  return (
    <View className="gap-6">
      <View className="gap-2">
        <Text className="text-2xl font-semibold leading-snug text-foreground">
          {t("otpTitle")}
        </Text>
        <Text className="text-base leading-normal text-muted-foreground">
          {t("otpSent", { destination: displayedDestination })}
        </Text>
        <Text className="text-sm leading-normal text-muted-foreground">
          {t(method === "email" ? "emailCodeExpiry" : "phoneCodeExpiry")}
        </Text>
        <Button
          variant="link"
          className="self-start px-0"
          onPress={onChangeDestination}
        >
          <Text>
            {method === "email" ? t("changeEmail") : t("changeNumber")}
          </Text>
        </Button>
      </View>

      <OtpCells
        ref={otpRef}
        disabled={isVerifying || isResending || terminalError || dailyLimit}
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
            className="flex-1 text-sm leading-snug text-destructive"
          >
            {error}
          </Text>
        </View>
      ) : null}

      {dailyLimit ? (
        <Button
          variant="link"
          className="self-start px-0"
          onPress={onContactSupport}
        >
          <Text>{t("contactSupport")}</Text>
        </Button>
      ) : null}

      {terminalError || dailyLimit ? null : (
        <Button
          disabled={secondsRemaining > 0 || isResending}
          variant="link"
          className="self-start px-0"
          onPress={resendCode}
        >
          <Text className={secondsRemaining > 0 || isResending ? "text-muted-foreground" : "text-foreground underline"}>
            {secondsRemaining > 60
              ? t("resendInMinutes", { time: formatResendWait(secondsRemaining) })
              : secondsRemaining > 0
                ? t("resendIn", { seconds: secondsRemaining })
                : isResending
                  ? t("loading")
                  : t("resendCode")}
          </Text>
        </Button>
      )}

      {showEmailHint ? (
        <View className="gap-1">
          <Text className="text-sm leading-normal text-muted-foreground">
            {t("emailNotArriving")}
          </Text>
          {onUsePhoneInstead ? (
            <Button
              variant="link"
              className="self-start px-0"
              onPress={onUsePhoneInstead}
            >
              <Text>{t("usePhoneInstead")}</Text>
            </Button>
          ) : null}
        </View>
      ) : null}

      {isVerifying ? (
        <View className="flex-row items-center gap-2">
          <ActivityIndicator
            color={`hsl(${THEME[isDark ? "dark" : "light"].primary})`}
          />
          <Text className="text-sm text-muted-foreground">
            {t("loading")}
          </Text>
        </View>
      ) : null}

      {__DEV__ && testCode && !terminalError && !dailyLimit ? (
        <Button
          className="self-start h-auto rounded-full px-3 py-1"
          size="sm"
          variant="secondary"
          onPress={() => {
            setCode(testCode);
            setError(null);
          }}
        >
          <Text>{t("devCode", { code: testCode })}</Text>
        </Button>
      ) : null}
    </View>
  );
}
