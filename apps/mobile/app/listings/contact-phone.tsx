import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, ScrollView, View } from "react-native";
import { useTranslation } from "react-i18next";

import { formatResendWait } from "../../components/auth/CodeEntryForm";
import { PhoneInput } from "../../components/auth/PhoneInput";
import { useRepublishListing } from "../../src/api/listings/useRepublishListing";
import { useRequestContactPhoneCode } from "../../src/api/listings/useRequestContactPhoneCode";
import { usePhoneField } from "../../src/auth/usePhoneField";
import { getContactPhoneRequestErrorCopy } from "../../src/listings/wizard/contactPhoneError";
import { contactPhoneReturnHref } from "../../src/listings/wizard/contactPhoneReturn";
import { HELP_HREF } from "../../src/navigation/helpHref";
import { useSafeBack } from "../../src/navigation/useSafeBack";

import { SafeScreen } from "@/components/navigation/SafeScreen";
import { BackButton, StackHeader } from "@/components/navigation/StackHeader";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { useToast } from "@/components/ui/toast";

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * The "Another number" entry of the Contact step: a `+993` number and Send
 * code. A number the server already trusts (`status: "confirmed"`) skips the
 * code screen and is handed back to the caller; for a relist the confirmed
 * number relists the Listing right away.
 */
export default function ContactPhoneScreen() {
  const params = useLocalSearchParams<{
    phone?: string;
    reconfirm?: string;
    purpose?: string;
    listingId?: string;
    returnPathname?: string;
  }>();
  const { t } = useTranslation();
  const goBack = useSafeBack();
  const { show } = useToast();
  const requestCode = useRequestContactPhoneCode();
  const republish = useRepublishListing();

  const reconfirm = firstParam(params.reconfirm) === "1";
  const purpose = firstParam(params.purpose) === "relist" ? "relist" : "listing";
  const listingId = firstParam(params.listingId);
  const returnPathname =
    firstParam(params.returnPathname) ??
    (purpose === "relist" ? "/listings/manage" : "/(tabs)/sell");

  const phone = usePhoneField(
    (key: string) => t(`auth:${key}`),
    firstParam(params.phone),
  );
  const [dailyLimit, setDailyLimit] = useState(false);

  async function finishConfirmed(canonicalPhone: string) {
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
    show({ title: t("contactPhoneAlreadyConfirmed"), variant: "success" });
    router.dismissTo(
      contactPhoneReturnHref(returnPathname, purpose, {
        confirmedContactPhone: canonicalPhone,
      }),
    );
  }

  async function handleSendCode() {
    phone.touch();
    const canonicalPhone = phone.canonicalPhone;
    if (!canonicalPhone) {
      phone.setRequestError(t("contactPhoneFormatError"));
      return;
    }
    if (requestCode.isPending) return;

    setDailyLimit(false);
    try {
      const result = await requestCode.mutateAsync({ phone: canonicalPhone });
      if (result.status === "confirmed") {
        await finishConfirmed(canonicalPhone);
        return;
      }
      router.push({
        pathname: "/listings/contact-phone-code",
        params: {
          phone: canonicalPhone,
          resendInSeconds: String(result.resendInSeconds),
          purpose,
          returnPathname,
          ...(listingId ? { listingId } : {}),
          ...(__DEV__ && result.testCode ? { testCode: result.testCode } : {}),
        },
      });
    } catch (error) {
      const copy = getContactPhoneRequestErrorCopy(error, t);
      phone.setRequestError(
        copy.retryInSeconds != null
          ? t("contactPhoneRateWait", {
              time: formatResendWait(copy.retryInSeconds),
            })
          : copy.message,
      );
      setDailyLimit(copy.dailyLimit);
    }
  }

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
              {reconfirm
                ? t("confirmNumberAgainTitle")
                : t("anotherContactNumberTitle")}
            </Text>
            <Text className="text-body leading-normal text-muted-foreground">
              {t("contactPhoneCodeInfo")}
            </Text>
          </View>

          <View className="gap-2">
            <PhoneInput
              accessibilityLabel={t("auth:phoneLabel")}
              hasError={phone.showError}
              keyboardType="phone-pad"
              onBlur={phone.touch}
              onChangeText={phone.onChangeText}
              placeholder={t("auth:phonePlaceholder")}
              textContentType="telephoneNumber"
              value={phone.display}
              // A relist confirms the Listing's own number only (ADR-0081);
              // a different number goes through Edit.
              editable={purpose !== "relist"}
            />
            <Text
              className={
                phone.showError
                  ? "text-callout leading-snug text-destructive"
                  : "text-callout leading-snug text-muted-foreground"
              }
              accessibilityLiveRegion="polite"
            >
              {phone.helperText}
            </Text>
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
            ) : null}
          </View>

          <Button
            variant="brand"
            size="lg"
            disabled={requestCode.isPending}
            onPress={handleSendCode}
          >
            <Text>{t("sendCode")}</Text>
          </Button>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeScreen>
  );
}
