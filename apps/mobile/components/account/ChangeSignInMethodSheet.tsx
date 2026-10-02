import { X } from "lucide-react-native";
import { View, useWindowDimensions } from "react-native";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Text } from "@/components/ui/text";

// Room for the handle, a two-line title, four lines of body and both buttons at
// the default text size; it grows with the system font scale. The iOS full-window
// overlay gives an auto-height sheet no room, so this one sets a height.
const SHEET_HEIGHT = 400;

interface ChangeSignInMethodSheetProps {
  method: "phone" | "email";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onContinue: () => void;
}

/**
 * Asks before a held Sign-in Method is replaced. Continue opens the change
 * screen; Cancel, the close button, a tap outside and the Android back button
 * close it with nothing changed (the dialog primitive handles the last one).
 */
export function ChangeSignInMethodSheet({ method, open, onOpenChange, onContinue }: ChangeSignInMethodSheetProps) {
  const { t } = useTranslation("account");
  const { height, fontScale } = useWindowDimensions();
  const sheetHeight = Math.min(height * 0.85, SHEET_HEIGHT * Math.max(1, fontScale));

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent closeOnBackdropPress style={{ height: sheetHeight }}>
        <SheetHeader className="flex-row items-start justify-between gap-3">
          <SheetTitle className="flex-1 text-xl font-bold">
            {t(method === "phone" ? "changePhoneConfirmTitle" : "changeEmailConfirmTitle")}
          </SheetTitle>
          <Button
            variant="ghost"
            size="icon"
            className="-mr-2 -mt-2 h-11 w-11"
            onPress={() => onOpenChange(false)}
            accessibilityLabel={t("common:close")}
          >
            <Icon as={X} className="size-5 text-foreground" />
          </Button>
        </SheetHeader>
        <SheetDescription className="text-base leading-normal">
          {t("changeMethodConfirmBody")}
        </SheetDescription>
        <View className="mt-auto gap-2 pb-2">
          <Button size="lg" variant="brand" onPress={onContinue}>
            <Text>{t("changeMethodContinue")}</Text>
          </Button>
          <Button size="lg" variant="outline" onPress={() => onOpenChange(false)}>
            <Text>{t("common:cancel")}</Text>
          </Button>
        </View>
      </SheetContent>
    </Sheet>
  );
}
