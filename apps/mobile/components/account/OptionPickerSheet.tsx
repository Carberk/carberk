import { useWindowDimensions } from "react-native";
import { useTranslation } from "react-i18next";

import { OptionList, type PickerOption } from "./OptionList";

import { BackButton } from "@/components/navigation/StackHeader";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

// The row's `min-h-14` (14 * 4 pt), and the title bar, handle, gaps and padding above and below the rows.
const ROW_HEIGHT = 56;
const SHEET_CHROME_HEIGHT = 144;

export type { PickerOption };

/**
 * A bottom sheet with a title, a close button and one radio row per option.
 * Picking a row reports the value and closes the sheet; the close button, a tap
 * outside and the Android back button close it without a change (the dialog
 * primitive handles the last two). Shared by the Language and Theme pickers.
 */
export function OptionPickerSheet<T extends string>({ open, onOpenChange, title, options, value, onChange }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  options: readonly PickerOption<T>[];
  value: T;
  onChange: (value: T) => void;
}) {
  const { t } = useTranslation();
  // The iOS full-window overlay gives an auto-height sheet no room, so this one sets a height.
  const sheetHeight = Math.min(useWindowDimensions().height * 0.85, SHEET_CHROME_HEIGHT + options.length * ROW_HEIGHT);
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent closeOnBackdropPress style={{ height: sheetHeight }}>
        <SheetHeader className="flex-row items-center justify-between gap-3">
          <SheetTitle className="min-w-0 flex-1 text-headline font-bold" numberOfLines={1}>
            {title}
          </SheetTitle>
          {/* The same tonal circle as a header's close button. */}
          <BackButton kind="close" onPress={() => onOpenChange(false)} accessibilityLabel={t("close")} />
        </SheetHeader>
        <OptionList
          placement="sheet"
          accessibilityLabel={title}
          options={options}
          value={value}
          onSelect={(next) => {
            onChange(next);
            onOpenChange(false);
          }}
        />
      </SheetContent>
    </Sheet>
  );
}
