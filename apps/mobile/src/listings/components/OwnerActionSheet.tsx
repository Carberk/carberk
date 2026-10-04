import { CheckCircle, Pencil, RotateCcw, Trash2, XCircle, type LucideIcon } from "lucide-react-native";
import { Pressable, View, useWindowDimensions } from "react-native";
import { useTranslation } from "react-i18next";

import { OWNER_ACTION_LABEL, isDestructiveAction, type OwnerAction } from "../ownerListingActions";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

const ACTION_ICON: Record<OwnerAction, LucideIcon> = {
  edit: Pencil,
  continue: Pencil,
  markSold: CheckCircle,
  remove: XCircle,
  relist: RotateCcw,
  delete: Trash2,
  deleteDraft: Trash2,
};

const ROW_HEIGHT = 52;

/** My listings' ⋯ sheet: the row's title and the actions its state allows. */
export function OwnerActionSheet({ open, title, actions, onSelect, onOpenChange }: {
  open: boolean;
  title: string;
  actions: readonly OwnerAction[];
  onSelect: (action: OwnerAction) => void;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  // The iOS full-window overlay gives an auto-height sheet no room, so this one sets a height.
  const maxHeight = useWindowDimensions().height * 0.85;
  const sheetHeight = Math.min(maxHeight, 150 + ROW_HEIGHT * (actions.length + 1));
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent closeOnBackdropPress style={{ height: sheetHeight }}>
        <SheetHeader>
          <SheetTitle numberOfLines={2}>{title}</SheetTitle>
        </SheetHeader>
        <View testID="listing-actions-sheet">
          {actions.map((action) => {
            const destructive = isDestructiveAction(action);
            return (
              <Pressable
                key={action}
                accessibilityRole="button"
                accessibilityLabel={t(OWNER_ACTION_LABEL[action])}
                className="min-h-12 flex-row items-center gap-3 py-3 active:opacity-70"
                onPress={() => onSelect(action)}
              >
                <Icon
                  as={ACTION_ICON[action]}
                  className={cn("size-5", destructive ? "text-destructive" : "text-foreground")}
                />
                <Text className={cn("text-base", destructive ? "text-destructive" : "text-foreground")}>
                  {t(OWNER_ACTION_LABEL[action])}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Button variant="outline" onPress={() => onOpenChange(false)}>
          <Text>{t("cancel")}</Text>
        </Button>
      </SheetContent>
    </Sheet>
  );
}
