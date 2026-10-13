import { router, useIsFocused, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BackHandler, type TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from "react-native-reanimated";

import { ApiError } from "../../src/api/client";
import { useRequestOtp } from "../../src/api/identity/useRequestOtp";
import { closeAuth } from "../../src/auth/closeAuth";
import { normalizeEmail } from "../../src/auth/email";
import { useAuthIntentStore } from "../../src/auth/intentStore";
import { getRequestOtpErrorCopy } from "../../src/auth/requestOtpError";
import { registerSignInEntryReturn } from "../../src/auth/signInEntryReturn";
import { usePhoneField } from "../../src/auth/usePhoneField";

import { AuthEntryScreen } from "./AuthEntryScreen";
import { SignInMethodContent } from "./SignInMethodContent";
import type { SignInMethod } from "./SignInMethodTabs";

import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { timing } from "@/lib/motion";
import { cn } from "@/lib/utils";

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

/** Both legacy entry routes render this same local flow. Switching never routes. */
export function SignInEntryScreen({ initialMethod }: { initialMethod: SignInMethod }) {
  const params = useLocalSearchParams<{ phone?: string; email?: string; authRoot?: string }>();
  const [isAuthRoot] = useState(() => firstParam(params.authRoot) === "1");
  const [method, setMethod] = useState(initialMethod);
  const [previousMethod, setPreviousMethod] = useState(initialMethod);
  const methodRef = useRef(initialMethod);
  const { t } = useTranslation("auth");
  const phone = usePhoneField(t, firstParam(params.phone));
  const [email, setEmail] = useState(firstParam(params.email) ?? "");
  const [emailTouched, setEmailTouched] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const canonicalEmail = useMemo(() => normalizeEmail(email), [email]);
  const { mutateAsync: requestOtp, isPending: isSubmitting } = useRequestOtp();
  const input = useRef<TextInput>(null);
  const leaving = useRef(false);
  const focused = useIsFocused();
  const reduceMotion = useReducedMotion();
  const opacity = useSharedValue(1);
  const firstRender = useRef(true);

  const selectMethod = useCallback((next: SignInMethod) => {
    if (next === methodRef.current) return;
    setPreviousMethod(methodRef.current);
    methodRef.current = next;
    setMethod(next);
  }, []);
  useEffect(() => registerSignInEntryReturn(selectMethod), [selectMethod]);

  useEffect(() => {
    if (!focused) return;
    input.current?.focus();
  }, [method, focused]);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    opacity.value = reduceMotion ? 1 : 0;
    opacity.value = withTiming(1, timing("fast"));
  }, [method, opacity, reduceMotion]);
  const fieldStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const previousFieldStyle = useAnimatedStyle(() => ({ opacity: 1 - opacity.value }));

  const leave = useCallback(() => {
    if (leaving.current) return;
    leaving.current = true;
    closeAuth(router);
  }, []);

  useEffect(() => {
    if (!focused) return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      leave();
      return true;
    });
    return () => subscription.remove();
  }, [focused, leave]);

  useEffect(() => {
    if (!isAuthRoot) return;
    return () => {
      // Explicit close and successful sign-in already consume the intent.
      if (useAuthIntentStore.getState().intent) {
        useAuthIntentStore.getState().cancelSignIn();
      }
    };
  }, [isAuthRoot]);

  const isPhone = method === "phone";
  const destination = isPhone ? phone.canonicalPhone : canonicalEmail;
  const showError = isPhone ? phone.showError : emailTouched && canonicalEmail === null || emailError !== null;
  const emailShowError = emailTouched && canonicalEmail === null || emailError !== null;
  const phoneHelper = phone.helperText === t("phoneInputHelper") ? t("phoneHelper") : phone.helperText;
  const emailHelper = emailError ?? (emailShowError ? t("emailFormatError") : t("emailHelper"));
  const previousIsPhone = previousMethod === "phone";
  const previousError = previousIsPhone ? phone.showError : emailShowError;
  const previousValue = previousIsPhone ? phone.display : email;

  async function submit() {
    if (isPhone) phone.touch(); else setEmailTouched(true);
    if (!destination || isSubmitting) return;
    if (isPhone) phone.setRequestError(null); else setEmailError(null);
    try {
      const result = await requestOtp(isPhone ? { phone: destination } : { email: destination });
      router.push({
        pathname: "/(auth)/otp",
        params: {
          method,
          destination,
          requestId: result.requestId,
          resendInSeconds: String(result.resendInSeconds),
          ...(__DEV__ && result.testCode ? { testCode: result.testCode } : {}),
        },
      });
    } catch (error) {
      const copy = error instanceof ApiError
        ? getRequestOtpErrorCopy(error, t, isPhone ? "phoneFormatError" : "emailFormatError")
        : t("offline");
      if (isPhone) phone.setRequestError(copy); else setEmailError(copy);
    }
  }

  return (
    <AuthEntryScreen
      method={method}
      canSubmit={destination !== null && !isSubmitting}
      isSubmitting={isSubmitting}
      onMethodChange={selectMethod}
      onClose={leave}
      onSubmit={submit}
    >
      <View className="relative">
      <Animated.View style={fieldStyle} className="gap-2">
        <Text className="text-callout font-medium text-foreground">{t(isPhone ? "phoneLabel" : "emailLabel")}</Text>
        <View className={showError ? "min-h-control-md flex-row overflow-hidden rounded-lg border-2 border-destructive bg-card" : "min-h-control-md flex-row overflow-hidden rounded-lg border border-input bg-card"}>
          <View className={isPhone ? "justify-center self-stretch border-r border-border px-3.5" : "hidden"}>
            <Text className="text-body font-mono text-foreground">+993</Text>
          </View>
          <Input
            ref={input}
            className={isPhone ? "min-w-0 flex-1 self-stretch rounded-none border-0 bg-transparent font-mono px-3.5" : "min-w-0 flex-1 self-stretch rounded-none border-0 bg-transparent px-3.5"}
            accessibilityLabel={t(isPhone ? "phoneLabel" : "emailLabel")}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete={isPhone ? "tel" : "email"}
            keyboardType={isPhone ? "phone-pad" : "email-address"}
            textContentType={isPhone ? "telephoneNumber" : "emailAddress"}
            // The number pad has no Return key; asking for one makes iOS float a
            // "Send" button in the system language over the form.
            returnKeyType={isPhone ? undefined : "send"}
            aria-invalid={showError}
            value={isPhone ? phone.display : email}
            onBlur={() => { if (isPhone) phone.touch(); else setEmailTouched(true); }}
            onChangeText={(value) => {
              if (isPhone) phone.onChangeText(value);
              else { setEmail(value); setEmailError(null); }
            }}
            onSubmitEditing={() => void submit()}
            placeholder={t(isPhone ? "phonePlaceholder" : "emailPlaceholder")}
          />
        </View>
        <SignInMethodContent method={method}
          phone={<Text className={phone.showError ? "text-callout leading-snug text-destructive" : "text-callout leading-snug text-muted-foreground"}>{phoneHelper}</Text>}
          email={<Text className={emailShowError ? "text-callout leading-snug text-destructive" : "text-callout leading-snug text-muted-foreground"}>{emailHelper}</Text>}
        />
      </Animated.View>
      {/* A drawing of the outgoing field cross-fades; the single native input
          above stays mounted, interactive and focused throughout. */}
      <Animated.View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
        className="absolute inset-0 gap-2 bg-background" style={previousFieldStyle}>
        <Text className="text-callout font-medium text-foreground">{t(previousIsPhone ? "phoneLabel" : "emailLabel")}</Text>
        <View className={cn("min-h-control-md flex-row items-center overflow-hidden rounded-lg bg-card", previousError ? "border-2 border-destructive" : "border border-input")}>
          {previousIsPhone ? <View className="justify-center self-stretch border-r border-border px-3.5"><Text className="text-body font-mono text-foreground">+993</Text></View> : null}
          <Text className={cn("min-w-0 flex-1 px-3.5 text-body", previousIsPhone && "font-mono", previousValue ? "text-foreground" : "text-muted-foreground")} numberOfLines={1}>
            {previousValue || t(previousIsPhone ? "phonePlaceholder" : "emailPlaceholder")}
          </Text>
        </View>
        <Text className={previousError ? "text-callout leading-snug text-destructive" : "text-callout leading-snug text-muted-foreground"}>{previousIsPhone ? phoneHelper : emailHelper}</Text>
      </Animated.View>
      </View>
    </AuthEntryScreen>
  );
}
