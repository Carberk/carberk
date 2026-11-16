import { Image } from "expo-image";
import Svg, { Circle } from "react-native-svg";
import { useEffect, useState } from "react";
import { AccessibilityInfo, ActivityIndicator, Platform, Pressable, ScrollView, View } from "react-native";
import * as Linking from "expo-linking";
import { router } from "expo-router";
import {
  Camera,
  LogOut,
  Mail,
  Pencil,
  Phone,
  Trash2,
} from "lucide-react-native";
import { useTranslation } from "react-i18next";

import { useSafeBack } from "../src/navigation/useSafeBack";
import { useMe } from "../src/api/identity/useMe";
import { useProfilePhotoUpload } from "../src/identity/useProfilePhotoUpload";
import { useDisplayName } from "../src/identity/useDisplayName";
import { useAuth } from "../src/auth/useAuth";
import { useLogout } from "../src/auth/useLogout";
import { maskEmail } from "../src/auth/email";
import { maskTmPhone } from "../src/auth/phone";
import { profileNoticeStore } from "../src/identity/profileNotice";

import { ChangeSignInMethodSheet } from "@/components/account/ChangeSignInMethodSheet";
import {
  MenuDivider,
  MenuFooter,
  MenuGroup,
  MenuRow,
  MenuSectionLabel,
} from "@/components/account/MenuRow";
import { ProfilePhotoSheet } from "@/components/identity/ProfilePhotoSheet";
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
import { BackButton, StackHeader } from "@/components/navigation/StackHeader";
import { ErrorState } from "@/components/ErrorState";

/** Profile's avatar, larger than Cabinet's 48 pt row avatar. */
const AVATAR_SIZE = 72;

function LoadingState() {
  return (
    <View className="flex-1 gap-6 px-4 pt-2">
      <View className="items-center gap-3 pb-1">
        <Skeleton
          className="rounded-full"
          style={{ width: AVATAR_SIZE, height: AVATAR_SIZE }}
        />
        <Skeleton className="h-5 w-40 rounded-full" />
      </View>
      {/* The size of the Sign-in methods card: two 56 pt rows and a hairline. */}
      <Skeleton className="h-28 w-full rounded-2xl" />
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
    <View>
      <MenuSectionLabel>{t("signInMethods")}</MenuSectionLabel>
      <MenuGroup>
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
      </MenuGroup>
      <ProfileNoticeLine />

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
    </View>
  );
}

const NOTICE_MS = 4000;

/**
 * "Added" or "Changed" after the code screen returns here, or "Name saved"
 * after the name editor does. It sits in the page
 * under the rows, so it never covers a button or the sheet, and clears itself.
 */
function ProfileNoticeLine() {
  const { t } = useTranslation("account");
  const notice = profileNoticeStore((state) => state.notice);

  useEffect(() => {
    if (!notice) return;
    if (Platform.OS === "ios" && (notice.kind === "photoSaved" || notice.kind === "photoRemoved")) {
      AccessibilityInfo.announceForAccessibility(t(notice.kind));
    }
    const timer = setTimeout(() => profileNoticeStore.getState().clear(), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [notice, t]);

  // The line keeps its height when empty, so the rows below never jump. It
  // also spaces the Sign-in methods card from the account actions below.
  return (
    <MenuFooter className="min-h-7 justify-center">
      {notice ? (
        <Text
          accessibilityLiveRegion="polite"
          accessibilityRole="alert"
          className="text-footnote text-muted-foreground"
          numberOfLines={1}
        >
          {"value" in notice
            ? t(notice.kind === "added" ? "methodAdded" : "methodChanged", { value: notice.value })
            : t(notice.kind)}
        </Text>
      ) : null}
    </MenuFooter>
  );
}

/**
 * Log out and Delete account, at the bottom of Profile for signed-in Users.
 * Log out asks first; Delete account opens its own screen.
 */
function AccountActions({ className }: { className?: string }) {
  const { t } = useTranslation("account");
  const { isAuthenticated } = useAuth();
  const logout = useLogout();
  const [confirmOpen, setConfirmOpen] = useState(false);

  if (isAuthenticated !== true) return null;

  return (
    <>
      {/* Delete account draws in the destructive token, never brand red. */}
      <MenuGroup className={className}>
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
      </MenuGroup>

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

/**
 * The signed-in User's own `/me`. Mounted only while a session is stored, so
 * a `/me` still cached for the previous User is never read without one.
 */
function SignedInProfile() {
  const { t } = useTranslation("account");
  const { data, isPending, isError, error, refetch } = useMe();
  const displayNameOf = useDisplayName();
  const [photoSheetOpen, setPhotoSheetOpen] = useState(false);
  const [failedPreviewUri, setFailedPreviewUri] = useState<string | null>(null);
  const photo = useProfilePhotoUpload();
  const previewUri = photo.state.status === "uploading" ? photo.state.uri : null;
  const photoErrorText = photo.state.status === "idle" || photo.state.status === "uploading" || photo.state.status === "removing" ? null
    : photo.state.reason === "suspended" ? t("common:accountRestrictedDescription")
    : photo.state.reason === "listing" ? t("photoAttached")
    : photo.state.status === "offline" ? t("common:offline")
    : t(photo.state.status === "too_large" ? "photoBig" : photo.state.status === "unsupported" ? "photoType" : photo.state.operation === "remove" ? "photoRmFail" : "photoFail");
  const photoStatusText = photo.state.status === "uploading" ?
    t(photo.state.preparing ? "photoPreparing" : "uploadingIndeterminate")
    : photo.state.status === "removing" ? t("photoRemoving") : null;
  useEffect(() => {
    const announcement = photoErrorText ?? photoStatusText;
    if (announcement && Platform.OS === "ios") AccessibilityInfo.announceForAccessibility(announcement);
  }, [photoErrorText, photoStatusText]);

  if (isPending) return <LoadingState />;

  if (isError) {
    return (
      <>
        <ErrorState error={error} onRetry={() => refetch()} />
        <AccountActions className="mb-6" />
      </>
    );
  }

  if (!data) return null;

  return (
    <ScrollView
      className="flex-1"
      contentContainerClassName="pb-6"
      showsVerticalScrollIndicator={false}
    >
      {/* The avatar and the name, set or generated. The name, with its
          pencil, opens the name editor; a screen reader hears "Edit
          name" and the name as its value. The camera badge opens the photo sheet. */}
      <View className="items-center gap-1 px-4 pb-6 pt-2">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("changePhoto")}
          disabled={photo.state.status === "uploading" || photo.state.status === "removing"}
          accessibilityState={{ disabled: photo.state.status === "uploading" || photo.state.status === "removing" }}
          className="relative active:opacity-70"
          onPress={() => setPhotoSheetOpen(true)}
        >
        {photo.state.status === "uploading" ? (
          <View className="items-center justify-center overflow-hidden rounded-full" style={{ width: AVATAR_SIZE, height: AVATAR_SIZE }}>
            {previewUri === failedPreviewUri ? <UserAvatar size={AVATAR_SIZE} avatarIndex={data.avatarIndex} /> : (
              <Image source={{ uri: photo.state.uri }} contentFit="cover" onError={() => setFailedPreviewUri(previewUri)} style={{ width: AVATAR_SIZE, height: AVATAR_SIZE }} />
            )}
            <View className="absolute inset-0 items-center justify-center bg-scrim/50">
              {photo.state.percent === null ? <ActivityIndicator size="large" color="white" accessible={false} /> : <Svg width={44} height={44} viewBox="0 0 36 36" accessible={false}>
                <Circle cx={18} cy={18} r={15} fill="none" stroke="white" opacity={0.35} strokeWidth={3} />
                <Circle cx={18} cy={18} r={15} fill="none" stroke="white" strokeWidth={3} strokeLinecap="round" strokeDasharray={`${94.25 * photo.state.percent / 100} 94.25`} rotation={-90} origin="18, 18" />
              </Svg>}
            </View>
          </View>
        ) : <UserAvatar
          size={AVATAR_SIZE}
          avatarIndex={data.avatarIndex}
          avatarKey={data.avatarKey}
          avatarUrl={data.avatarUrl}
        />}
          {photo.state.status !== "uploading" ? <View className="absolute bottom-0 right-0 items-center justify-center rounded-full border-2 border-background bg-muted p-1">
            <Icon as={Camera} className="size-4 text-foreground" />
          </View> : null}
        </Pressable>
        <Pressable
          accessibilityLabel={t("editName")}
          accessibilityValue={{ text: displayNameOf(data) }}
          accessibilityRole="button"
          className="min-h-11 max-w-full flex-row items-center gap-1.5 px-2 active:opacity-70"
          onPress={() => router.push("/account/display-name")}
        >
          <Text
            className="shrink text-headline font-semibold text-foreground"
            numberOfLines={1}
          >
            {displayNameOf(data)}
          </Text>
          <Icon as={Pencil} className="size-4 text-muted-foreground" />
        </Pressable>
      </View>

      {photo.state.status === "uploading" ? <Text
        accessibilityRole="progressbar"
        accessibilityLiveRegion="polite"
        accessibilityValue={photo.state.percent === null ? undefined : { min: 0, max: 100, now: photo.state.percent }}
        className="px-4 pb-3 text-center text-footnote text-muted-foreground"
      >{photo.state.percent === null ? t("uploadingIndeterminate") : t("uploading", { p: photo.state.percent })}</Text> : null}

      {photo.state.status === "uploading" && photo.state.preparing ? <Text accessibilityLiveRegion="polite" className="px-4 pb-3 text-center text-footnote text-muted-foreground">{t("photoPreparing")}</Text> : null}
      {photo.state.status === "uploading" && photo.state.preparing ? <Button variant="ghost" className="mx-4 mb-3 min-h-11" onPress={photo.cancel}><Text>{t("common:cancel")}</Text></Button> : null}
      {photo.state.status === "removing" ? <Text accessibilityLiveRegion="polite" className="px-4 pb-3 text-center text-footnote text-muted-foreground">{t("photoRemoving")}</Text> : null}
      {photo.state.status !== "idle" && photo.state.status !== "uploading" && photo.state.status !== "removing" ? <View className="mx-4 mb-4 gap-2 rounded-2xl bg-destructive/10 px-4 py-3">
        <Text accessibilityRole="alert" accessibilityLiveRegion="assertive" className="text-body text-destructive">
          {photoErrorText}
        </Text>
        <View className="flex-row flex-wrap gap-2">
          {photo.state.reason === "suspended" ? null : photo.state.reason !== "listing" && photo.state.reason !== "unusable" && (photo.state.status === "failed" || photo.state.status === "offline") ?
            <Button variant="ghost" className="min-h-11" onPress={() => void photo.retry()}><Text>{t("common:retry")}</Text></Button> :
            <Button variant="ghost" className="min-h-11" onPress={() => { photo.cancel(); setPhotoSheetOpen(true); }}><Text>{t("chooseOther")}</Text></Button>}
          <Button variant="ghost" className="min-h-11" onPress={photo.cancel}><Text>{t("common:cancel")}</Text></Button>
        </View>
      </View> : null}

      <SignInMethods phone={data.phone} email={data.email} />

      <AccountActions />
      <AlertDialog open={photo.cameraDenied} onOpenChange={(open) => { if (!open) photo.dismissCameraDenied(); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("permT")}</AlertDialogTitle>
            <AlertDialogDescription>{t("permD")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel accessibilityRole="button" onPress={photo.dismissCameraDenied}><Text>{t("common:cancel")}</Text></AlertDialogCancel>
            <AlertDialogAction accessibilityRole="button" onPress={() => { photo.dismissCameraDenied(); void Linking.openSettings(); }}>
              <Text>{t("openSettings")}</Text>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <ProfilePhotoSheet
        open={photoSheetOpen}
        onOpenChange={setPhotoSheetOpen}
        hasPhoto={Boolean(data.avatarKey)}
        onTakePhoto={() => void photo.pick("camera")}
        onChoosePhoto={() => void photo.pick("library")}
        onRemovePhoto={() => void photo.remove()}
      />
    </ScrollView>
  );
}

export default function ProfileScreen() {
  const { t } = useTranslation(["account", "common"]);
  const { isAuthenticated } = useAuth();
  const goBack = useSafeBack("/(tabs)/services");

  return (
    <SafeScreen>
      {/* Header */}
      <StackHeader
        large
        title={t("account:profile")}
        leading={<BackButton onPress={goBack} />}
      />

      {/* A signed-out visitor sees the header only. */}
      {isAuthenticated === null ? (
        <LoadingState />
      ) : isAuthenticated ? (
        <SignedInProfile />
      ) : null}
    </SafeScreen>
  );
}
