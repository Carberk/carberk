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
  OWNER_ACTION_CONFIRM,
  OWNER_ACTION_LABEL,
  ownerListingActions,
  type ConfirmedOwnerAction,
} from "../ownerListingActions";

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
          onError: () => setConfirmAction(null),
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
        <View className="flex-row gap-2 px-4 py-3">
          <Button
            variant="secondary"
            size="sm"
            className="flex-1 min-w-[45%]"
            onPress={() => router.push(`/listings/${listingId}/edit`)}
            disabled={isPending || !(isActive || isSold || isArchived)}
          >
            <Icon as={Pencil} className="size-4 text-foreground" />
            <Text>{t(OWNER_ACTION_LABEL.edit)}</Text>
          </Button>

          {isActive && (
            <Button
              variant="secondary"
              size="sm"
              className="flex-1 min-w-[45%]"
              onPress={() => setConfirmAction("markSold")}
              disabled={isPending}
            >
              <Icon as={CheckCircle} className="size-4 text-foreground" />
              <Text>{t(OWNER_ACTION_LABEL.markSold)}</Text>
            </Button>
          )}
        </View>
      )}
      {/* No ⋯ when the status allows nothing, as for a blocked Listing. */}
      {mode === "menu" && menuActions.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="secondary"
              size="icon"
              className="rounded-full bg-background/90"
              accessibilityLabel={t("detailOptions")}
            >
              <Icon as={MoreHorizontal} className="size-5 text-foreground" />
            </Button>
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
      {(markSold.isError ||
        archive.isError ||
        republish.isError ||
        deleteListing.isError) && (
        <View className="rounded-md bg-destructive/10 px-3 py-2">
          <Text className="text-sm text-destructive">{t("actionFailed")}</Text>
        </View>
      )}

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
