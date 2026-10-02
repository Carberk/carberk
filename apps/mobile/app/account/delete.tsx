import { useMemo, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { router } from "expo-router";
import { ChevronLeft, Trash2 } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";

import { useSafeBack } from "../../src/navigation/useSafeBack";
import { useDeleteAccount } from "../../src/api/identity/useDeleteAccount";
import { clearAuthSession } from "../../src/auth/session";
import { formatDeletionDateFromNow } from "../../src/auth/formatDeletionDate";
import { localeTag } from "../../src/i18n/resources";

import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { SafeScreen } from "@/components/navigation/SafeScreen";

export default function DeleteAccountScreen() {
  const { t, i18n } = useTranslation("account");
  const queryClient = useQueryClient();
  const deleteAccount = useDeleteAccount();
  const [understood, setUnderstood] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const goBack = useSafeBack("/profile");

  const locale = localeTag(i18n.language);
  const deletionDate = useMemo(() => formatDeletionDateFromNow(locale), [locale]);
  // Russian opens this line with the date, so it keeps its "г." period.
  const erasedOnDate = useMemo(
    () => formatDeletionDateFromNow(locale, { midSentence: true }),
    [locale],
  );
  const consequences = [
    t("deleteAccountSignedOut"),
    t("deleteAccountListingsArchived"),
    t("deleteAccountChatsStay"),
    t("deleteAccountErasedOn", { date: erasedOnDate }),
    t("deleteAccountRestoreBefore"),
  ];

  async function handleDelete() {
    setShowConfirm(false);

    try {
      await deleteAccount.mutateAsync();
    } catch {
      // The User stays signed in; deleteAccount.isError shows the message inline.
      return;
    }
    await clearAuthSession();
    queryClient.clear();
    // Cabinet sits under the scheduled screen, so neither Back nor Done can
    // return to a signed-in screen.
    router.dismissTo("/(tabs)/services");
    router.push("/account/deletion-scheduled");
  }

  return (
    <SafeScreen>
      {/* Header */}
      <View className="px-4 pb-3 flex-row items-center gap-2">
        <Button
          variant="ghost"
          className="h-11 w-11"
          size="icon"
          onPress={goBack}
          accessibilityLabel={t("common:back", { defaultValue: "Back" })}
        >
          <Icon as={ChevronLeft} className="size-6 text-foreground" />
        </Button>
        <Text className="text-2xl font-heading text-foreground">
          {t("deleteAccount")}
        </Text>
      </View>

      <ScrollView className="flex-1 px-4">
        <View className="gap-4 py-4">
          <Text className="text-base text-foreground">
            {t("deleteAccountDescription")}
          </Text>
          <View className="gap-2">
            <Text className="text-base font-semibold text-foreground">
              {t("deleteAccountWhatHappens")}
            </Text>
            {consequences.map((line) => (
              <View key={line} className="flex-row gap-2 pl-1">
                <Text className="text-sm text-muted-foreground">{"•"}</Text>
                <Text className="flex-1 text-sm text-muted-foreground">{line}</Text>
              </View>
            ))}
          </View>
        </View>

        <Pressable
          onPress={() => setUnderstood((value) => !value)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: understood }}
          accessibilityLabel={t("deleteAccountUnderstand")}
          className="min-h-11 flex-row items-center gap-3 rounded-md active:bg-muted/60"
        >
          <Checkbox checked={understood} pointerEvents="none" accessible={false} />
          <Text className="flex-1 text-base text-foreground">
            {t("deleteAccountUnderstand")}
          </Text>
        </Pressable>

        <View className="py-6">
          <Button
            variant="destructive"
            size="pill"
            disabled={!understood || deleteAccount.isPending}
            onPress={() => setShowConfirm(true)}
            accessibilityLabel={t("deleteAccount")}
          >
            <Icon as={Trash2} className="size-5 mr-2" />
            <Text>{t("deleteAccount")}</Text>
          </Button>
        </View>

        {deleteAccount.isError ? (
          <View className="py-2">
            <Text
              accessibilityRole="alert"
              accessibilityLiveRegion="polite"
              className="text-sm text-destructive text-center"
            >
              {t("deleteAccountFailed", { defaultValue: "Could not delete account. Please try again." })}
            </Text>
          </View>
        ) : null}
      </ScrollView>

      {/* Destructive confirmation */}
      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteAccountConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("deleteAccountConfirmDescription", { date: deletionDate })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onPress={() => setShowConfirm(false)}>
              <Text>{t("deleteAccountCancel")}</Text>
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive"
              onPress={handleDelete}
            >
              <Text className="text-destructive-foreground">
                {t("deleteAccountConfirmAction")}
              </Text>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SafeScreen>
  );
}
