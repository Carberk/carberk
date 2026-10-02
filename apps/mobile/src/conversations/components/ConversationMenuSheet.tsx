import { Pressable, View } from "react-native";
import { Ban, Bell, BellOff, Flag, type LucideIcon } from "lucide-react-native";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/icon";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Text } from "@/components/ui/text";

interface ConversationMenuSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isMuted: boolean;
  isBlocked: boolean;
  muteDisabled?: boolean;
  onToggleMute: () => void;
  /** Omitted when reporting is switched off; Report is then not offered. */
  onReport?: () => void;
  onBlock: () => void;
  onUnblock: () => void;
}

function MenuItem({
  icon,
  label,
  destructive = false,
  disabled = false,
  onPress,
}: {
  icon: LucideIcon;
  label: string;
  destructive?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const color = destructive ? "text-destructive" : "text-foreground";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      className="min-h-11 flex-row items-center gap-3 rounded-lg px-2 py-3 active:bg-muted disabled:opacity-50"
    >
      <Icon as={icon} className={cn("size-5", color)} />
      <Text className={cn("text-base", color)}>{label}</Text>
    </Pressable>
  );
}

/** The Conversation ⋯ menu (#352 D2): Mute, Report and Block, with no Delete or Support item. */
export function ConversationMenuSheet({
  open,
  onOpenChange,
  isMuted,
  isBlocked,
  muteDisabled = false,
  onToggleMute,
  onReport,
  onBlock,
  onUnblock,
}: ConversationMenuSheetProps) {
  const { t } = useTranslation();

  // Close first, so a dialog or sheet the action opens is not stacked on this one.
  const choose = (action: () => void) => () => {
    onOpenChange(false);
    action();
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent compact closeOnBackdropPress>
        <View className="gap-1">
          <MenuItem
            icon={isMuted ? Bell : BellOff}
            label={isMuted ? t("unmuteConversation") : t("muteConversation")}
            disabled={muteDisabled}
            onPress={choose(onToggleMute)}
          />
          {onReport && <MenuItem icon={Flag} label={t("report")} onPress={choose(onReport)} />}
          <MenuItem
            icon={Ban}
            label={isBlocked ? t("unblockUser") : t("blockUser")}
            destructive
            onPress={choose(isBlocked ? onUnblock : onBlock)}
          />
        </View>
      </SheetContent>
    </Sheet>
  );
}
