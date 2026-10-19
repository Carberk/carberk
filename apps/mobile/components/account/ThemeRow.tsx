import { Contrast } from "lucide-react-native";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { themeStore, type ThemePreference } from "../../src/theme/themeStore";

import { OptionPickerSheet } from "./OptionPickerSheet";
import { MenuRow } from "./MenuRow";

const labelKeys = {
  light: "themeLight",
  dark: "themeDark",
  system: "themeSystem",
} as const satisfies Record<ThemePreference, string>;
const themes = ["light", "dark", "system"] as const;

/** The Theme row and its sheet. Reads and writes the persisted theme store; System follows the device. */
export function ThemeRow() {
  const { t } = useTranslation("account");
  const [open, setOpen] = useState(false);
  const theme = themeStore((state) => state.theme);
  const setTheme = themeStore((state) => state.setTheme);
  const options = themes.map((value) => ({ value, label: t(labelKeys[value]) }));

  return (
    <>
      <MenuRow icon={Contrast} label={t("theme")} value={t(labelKeys[theme])} chevron onPress={() => setOpen(true)} />
      <OptionPickerSheet
        open={open}
        onOpenChange={setOpen}
        title={t("theme")}
        options={options}
        value={theme}
        onChange={setTheme}
      />
    </>
  );
}
