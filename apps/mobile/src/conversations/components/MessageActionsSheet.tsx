import { Pressable } from "react-native";
import { useTranslation } from "react-i18next";

import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Text } from "@/components/ui/text";

interface MessageActionsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canCopy: boolean;
  canReport: boolean;
  canDelete: boolean;
  onCopy: () => void;
  onReport: () => void;
  onDelete: () => void;
}

function ActionItem({
  label,
  destructive = false,
  onPress,
}: {
  label: string;
  destructive?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      className="min-h-[44px] justify-center rounded-lg px-4 active:bg-muted"
    >
      <Text className={`text-base ${destructive ? "text-destructive" : "text-foreground"}`}>
        {label}
      </Text>
    </Pressable>
  );
}

/** The long-press sheet on a Message (D4); the caller decides which actions the Message offers. */
export function MessageActionsSheet({
  open,
  onOpenChange,
  canCopy,
  canReport,
  canDelete,
  onCopy,
  onReport,
  onDelete,
}: MessageActionsSheetProps) {
  const { t } = useTranslation();
  const choose = (action: () => void) => () => {
    onOpenChange(false);
    action();
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent compact closeOnBackdropPress>
        {canCopy && <ActionItem label={t("conversations:messageActionCopy")} onPress={choose(onCopy)} />}
        {canReport && (
          <ActionItem
            label={t("conversations:messageActionReport")}
            destructive
            onPress={choose(onReport)}
          />
        )}
        {canDelete && (
          <ActionItem
            label={t("conversations:messageActionDelete")}
            destructive
            onPress={choose(onDelete)}
          />
        )}
        <ActionItem label={t("cancel")} onPress={() => onOpenChange(false)} />
      </SheetContent>
    </Sheet>
  );
}
