import { useState } from "react";
import { useIsMutating } from "@tanstack/react-query";
import { View } from "react-native";
import { useRouter } from "expo-router";
import { Pencil, CheckCircle, MoreHorizontal } from "lucide-react-native";
import { Enums } from "@auto-tm/contracts";
import type { ListingsSchemas } from "@auto-tm/contracts";
import { useTranslation } from "react-i18next";

type ListingStatus = ListingsSchemas.ListingDetail["status"];

import { queryKeys } from "../../api/queryKeys";
import { useArchiveListing } from "../../api/listings/useArchiveListing";
import { useDeleteListing } from "../../api/listings/useDeleteListing";
import { useMarkSold } from "../../api/listings/useMarkSold";
import { useRepublishListing } from "../../api/listings/useRepublishListing";
import {
  isContactPhoneNotConfirmedError,
  isContactPhoneRequiredError,
} from "../wizard/contactPhoneError";
import {
  OWNER_ACTION_CONFIRM,
  OWNER_ACTION_LABEL,
  ownerListingActions,
  type ConfirmedOwnerAction,
} from "../ownerListingActions";

import { RelistContactPhoneSheet } from "./RelistContactPhoneSheet";

import { HeaderButton } from "@/components/navigation/StackHeader";
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
import { GlassButton } from "@/components/ui/glass-button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

type ListingConfirmAction = Exclude<ConfirmedOwnerAction, "deleteDraft">;

/** Edit and Mark as sold sit in the bar; the rest of the status's actions go in ⋯. */
const MENU_ACTIONS = new Set<string>(["remove", "relist", "delete"]);

interface OwnerActionsProps {
  listingId: string;
  status: ListingStatus;
  mode: "bar" | "menu";
}

export function OwnerActions({ listingId, status, mode }: OwnerActionsProps) {
  const router = useRouter();
  const { t } = useTranslation();
  const [confirmAction, setConfirmAction] = useState<ListingConfirmAction | null>(
    null,
  );
  // A relist refused over the contact phone (ADR-0081): NOT_CONFIRMED opens
  // the confirm sheet; REQUIRED asks for a phone through Edit.
  const [relistPhoneSheet, setRelistPhoneSheet] = useState<string | null>(null);
  const [relistPhoneRequired, setRelistPhoneRequired] = useState(false);

  const markSold = useMarkSold();
  const archive = useArchiveListing();
  const republish = useRepublishListing();
  const deleteListing = useDeleteListing();

  const isActive = status === Enums.ListingStatus.Active;
  const isSold = status === Enums.ListingStatus.Sold;
  const isArchived = status === Enums.ListingStatus.Archived;
  const menuActions = ownerListingActions(status).filter(
    (action): action is ListingConfirmAction => MENU_ACTIONS.has(action),
  );

  // Bar and overflow are separate instances; any in-flight lifecycle request
  // disables both.
  const isPending =
    useIsMutating({ mutationKey: queryKeys.listings.lifecycleMutation() }) > 0;

  const handleConfirm = () => {
    if (!confirmAction) return;
    // The add-a-phone hint belongs to the relist that was refused; it goes
    // when the next action starts.
    setRelistPhoneRequired(false);

    switch (confirmAction) {
      case "markSold":
        markSold.mutate(listingId, {
          onSuccess: () => setConfirmAction(null),
          onError: () => setConfirmAction(null),
        });
        break;
      case "remove":
        archive.mutate(listingId, {
          onSuccess: () => setConfirmAction(null),
          onError: () => setConfirmAction(null),
        });
        break;
      case "relist":
        republish.mutate(listingId, {
          onSuccess: () => setConfirmAction(null),
          onError: (error) => {
            setConfirmAction(null);
            if (isContactPhoneNotConfirmedError(error)) {
              republish.reset();
              setRelistPhoneSheet(listingId);
            } else if (isContactPhoneRequiredError(error)) {
              republish.reset();
              setRelistPhoneRequired(true);
            }
          },
        });
        break;
      case "delete":
        deleteListing.mutate(listingId, {
          onSuccess: () => {
            setConfirmAction(null);
            router.back();
          },
          onError: () => setConfirmAction(null),
        });
        break;
    }
  };

  const closeDialog = () => {
    if (isPending) return;
    setConfirmAction(null);
  };

  return (
    <View className="gap-2">
      {mode === "bar" && (
        <View className="flex-row gap-2">
          <GlassButton
            className="flex-1 min-w-[45%]"
            onPress={() => router.push(`/listings/${listingId}/edit`)}
            disabled={isPending || !(isActive || isSold || isArchived)}
          >
            <Icon as={Pencil} className="size-5" />
            <Text>{t(OWNER_ACTION_LABEL.edit)}</Text>
          </GlassButton>

          {isActive && (
            <GlassButton
              className="flex-1 min-w-[45%]"
              onPress={() => setConfirmAction("markSold")}
              disabled={isPending}
            >
              <Icon as={CheckCircle} className="size-5" />
              <Text>{t(OWNER_ACTION_LABEL.markSold)}</Text>
            </GlassButton>
          )}
        </View>
      )}
      {/* No ⋯ when the status allows nothing, as for a blocked Listing. */}
      {mode === "menu" && menuActions.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            {/* The menu sits in Listing detail's plain header row (#864). */}
            <HeaderButton
              tone="plain"
              icon={MoreHorizontal}
              accessibilityLabel={t("detailOptions")}
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            {menuActions.map((action) => (
              <DropdownMenuItem
                key={action}
                accessibilityRole="button"
                variant={action === "delete" ? "destructive" : undefined}
                disabled={isPending}
                onPress={() => setConfirmAction(action)}
              >
                <Text>{t(OWNER_ACTION_LABEL[action])}</Text>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {/* Mutation error banner */}
      {(relistPhoneRequired ||
        markSold.isError ||
        archive.isError ||
        republish.isError ||
        deleteListing.isError) && (
        // In the floating bar nothing is behind the banner, so it gets a solid card under its tint.
        <View className={mode === "bar" ? "overflow-hidden rounded-md bg-card shadow-floating" : undefined}>
          <View className="rounded-md bg-destructive/10 px-3 py-2">
            <Text className="text-callout text-destructive">
              {relistPhoneRequired ? t("relistPhoneRequired") : t("actionFailed")}
            </Text>
          </View>
        </View>
      )}

      <RelistContactPhoneSheet
        open={relistPhoneSheet !== null}
        listingId={relistPhoneSheet}
        returnPathname={`/(public)/listings/${relistPhoneSheet ?? listingId}`}
        onOpenChange={(open) => {
          if (!open) setRelistPhoneSheet(null);
        }}
      />

      {/* Confirmation dialog */}
      <AlertDialog open={confirmAction !== null} onOpenChange={closeDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction ? t(OWNER_ACTION_CONFIRM[confirmAction].title) : ""}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction ? t(OWNER_ACTION_CONFIRM[confirmAction].description) : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending} onPress={closeDialog}>
              <Text>{t("cancel")}</Text>
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={isPending}
              onPress={handleConfirm}
              className={
                confirmAction === "delete" ? "bg-destructive" : undefined
              }
            >
              <Text
                className={
                  confirmAction === "delete"
                    ? "text-destructive-foreground"
                    : undefined
                }
              >
                {isPending ? t("working") : t("confirm")}
              </Text>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </View>
  );
}
