import { Globe } from "lucide-react-native";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { localeNames, type Locale } from "../../src/i18n/resources";
import { localeStore } from "../../src/locale/localeStore";

import { OptionPickerSheet } from "./OptionPickerSheet";
import { MenuRow } from "./MenuRow";

// English first, as the approved prototype lists them.
const LOCALE_ORDER: readonly Locale[] = ["en", "ru", "tk"];
const options = LOCALE_ORDER.map((value) => ({ value, label: localeNames[value] }));

/** The Language row and its sheet. Reads and writes the persisted locale store. */
export function LanguageRow() {
  const { t } = useTranslation("account");
  const [open, setOpen] = useState(false);
  const locale = localeStore((state) => state.locale) ?? "ru";
  const setLocale = localeStore((state) => state.setLocale);

  return (
    <>
      <MenuRow icon={Globe} label={t("language")} value={localeNames[locale]} chevron onPress={() => setOpen(true)} />
      <OptionPickerSheet
        open={open}
        onOpenChange={setOpen}
        title={t("language")}
        options={options}
        value={locale}
        onChange={setLocale}
      />
    </>
  );
}
