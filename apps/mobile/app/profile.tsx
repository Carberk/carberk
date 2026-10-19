import { useEffect, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { router } from "expo-router";
import {
  ChevronLeft,
  LogOut,
  Mail,
  Pencil,
  Phone,
  Trash2,
} from "lucide-react-native";
import { useTranslation } from "react-i18next";

import { useSafeBack } from "../src/navigation/useSafeBack";
import { useMe } from "../src/api/identity/useMe";
import { useDisplayName } from "../src/identity/useDisplayName";
import { useAuth } from "../src/auth/useAuth";
import { useLogout } from "../src/auth/useLogout";
import { maskEmail } from "../src/auth/email";
import { maskTmPhone } from "../src/auth/phone";
import { signInMethodNoticeStore } from "../src/auth/signInMethodNotice";

import { ChangeSignInMethodSheet } from "@/components/account/ChangeSignInMethodSheet";
import { MenuDivider, MenuGap, MenuRow } from "@/components/account/MenuRow";
import { UserAvatar } from "@/components/identity/UserAvatar";
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
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { SafeScreen } from "@/components/navigation/SafeScreen";
import { ErrorState } from "@/components/ErrorState";

function LoadingState() {
  return (
    <View className="flex-1 px-4 pt-4 gap-4">
      <View className="items-center gap-3 py-6">
        <Skeleton className="size-24 rounded-full" />
        <Skeleton className="h-6 w-48 rounded" />
        <Skeleton className="h-4 w-32 rounded" />
      </View>
      <Skeleton className="h-24 w-full rounded-xl" />
    </View>
  );
}

type SignInMethod = "phone" | "email";

const ENTRY_HREF = {
  phone: "/account/add-phone",
  email: "/account/add-email",
} as const;

/**
 * The phone and email rows. A row with a value asks before it opens the change
 * screen; an empty row shows Add and opens the add screen directly. There is
 * no control that removes a method.
 */
function SignInMethods({ phone, email }: { phone: string | null; email: string | null }) {
  const { t } = useTranslation("account");
  const [confirming, setConfirming] = useState(false);
  // Keeps the sheet's copy while it animates closed.
  const [sheetMethod, setSheetMethod] = useState<SignInMethod>("phone");

  function open(method: SignInMethod, hasValue: boolean) {
    if (!hasValue) {
      router.push(ENTRY_HREF[method]);
      return;
    }
    setSheetMethod(method);
    setConfirming(true);
  }

  return (
    <>
      <Text className="px-4 pb-1 pt-2.5 text-[13px] text-muted-foreground">
        {t("signInMethods")}
      </Text>
      <MenuRow
        icon={Phone}
        label={t("phone")}
        value={phone ? maskTmPhone(phone) : t("add")}
        valueTone={phone ? "default" : "link"}
        chevron
        onPress={() => open("phone", Boolean(phone))}
      />
      <MenuDivider />
      <MenuRow
        icon={Mail}
        label={t("email")}
        value={email ? maskEmail(email) : t("add")}
        valueTone={email ? "default" : "link"}
        chevron
        onPress={() => open("email", Boolean(email))}
      />
      <SignInMethodNoticeLine />

      <ChangeSignInMethodSheet
        method={sheetMethod}
        open={confirming}
        onOpenChange={(next) => {
          if (!next) setConfirming(false);
        }}
        onContinue={() => {
          setConfirming(false);
          router.push(ENTRY_HREF[sheetMethod]);
        }}
      />
    </>
  );
}

const NOTICE_MS = 4000;

/**
 * "Added" or "Changed" after the code screen returns here, or "Name saved"
 * after the name editor does. It sits in the page
 * under the rows, so it never covers a button or the sheet, and clears itself.
 */
function SignInMethodNoticeLine() {
  const { t } = useTranslation("account");
  const notice = signInMethodNoticeStore((state) => state.notice);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => signInMethodNoticeStore.getState().clear(), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [notice]);

  // The line keeps its height when empty, so the rows below never jump.
  return (
    <View className="min-h-7 justify-center px-4">
      {notice ? (
        <Text
          accessibilityLiveRegion="polite"
          accessibilityRole="alert"
          className="text-[13px] text-muted-foreground"
          numberOfLines={1}
        >
          {notice.kind === "nameSaved"
            ? t("nameSaved")
            : t(notice.kind === "added" ? "methodAdded" : "methodChanged", { value: notice.value })}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * Log out and Delete account, at the bottom of Profile for signed-in Users.
 * Log out asks first; Delete account opens its own screen.
 */
function AccountActions() {
  const { t } = useTranslation("account");
  const { isAuthenticated } = useAuth();
  const logout = useLogout();
  const [confirmOpen, setConfirmOpen] = useState(false);

  if (isAuthenticated !== true) return null;

  return (
    <>
      <MenuGap />
      <MenuRow
        icon={LogOut}
        label={t("logout")}
        onPress={() => setConfirmOpen(true)}
      />
      <MenuDivider />
      <MenuRow
        icon={Trash2}
        label={t("deleteAccount")}
        variant="danger"
        onPress={() => router.push("/account/delete")}
      />

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("logoutConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("logoutConfirmDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onPress={() => setConfirmOpen(false)}>
              <Text>{t("logoutConfirmCancel")}</Text>
            </AlertDialogCancel>
            <AlertDialogAction
              onPress={() => {
                setConfirmOpen(false);
                logout.mutate();
              }}
            >
              <Text>{t("logoutConfirmAction")}</Text>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export default function ProfileScreen() {
  const { t } = useTranslation(["account", "common"]);
  const { data, isPending, isError, error, refetch } = useMe();
  const goBack = useSafeBack("/(tabs)/services");
  const displayNameOf = useDisplayName();

  return (
    <SafeScreen>
      {/* Header */}
      <View className="px-4 pb-3 flex-row items-center gap-2">
        <Button variant="ghost" size="icon" className="h-11 w-11" onPress={goBack}>
          <Icon as={ChevronLeft} className="size-6 text-foreground" />
        </Button>
        <Text className="text-2xl font-heading text-foreground">
          {t("account:profile")}
        </Text>
      </View>

      {isPending ? (
        <LoadingState />
      ) : isError ? (
        <>
          <ErrorState error={error} onRetry={() => refetch()} />
          <AccountActions />
        </>
      ) : data ? (
        <ScrollView
          className="flex-1"
          contentContainerClassName="pb-6"
        >
          {/* The avatar and the name, set or generated. The name, with its
              pencil, opens the name editor; a screen reader hears "Edit
              name" and the name. The photo editor attaches here later. */}
          <View className="items-center gap-1 px-4 pb-5 pt-2">
            <UserAvatar
              size={72}
              avatarIndex={data.avatarIndex}
              avatarKey={data.avatarKey}
              avatarUrl={data.avatarUrl}
            />
            <Pressable
              accessibilityHint={displayNameOf(data)}
              accessibilityLabel={t("account:editName")}
              accessibilityRole="button"
              className="min-h-11 max-w-full flex-row items-center gap-1.5 px-2 active:opacity-70"
              onPress={() => router.push("/account/display-name")}
            >
              <Text
                className="shrink text-xl font-semibold text-foreground"
                numberOfLines={1}
              >
                {displayNameOf(data)}
              </Text>
              <Icon as={Pencil} className="size-[17px] text-muted-foreground" />
            </Pressable>
          </View>

          <SignInMethods phone={data.phone} email={data.email} />

          <AccountActions />
        </ScrollView>
      ) : null}
    </SafeScreen>
  );
}
