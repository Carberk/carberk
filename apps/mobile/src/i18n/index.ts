import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import * as Localization from "expo-localization";

import { localeStore } from "../locale/localeStore";

import { resources, resolveLocale, type Locale } from "./resources";

function detectDeviceLocale(): Locale {
  const locales = Localization.getLocales();
  const deviceLocale = locales[0]?.languageCode?.toLowerCase();
  return resolveLocale(deviceLocale);
}

export async function initI18n(initialLocale?: Locale) {
  const storeLocale = localeStore.getState().locale;
  const locale = initialLocale ?? storeLocale ?? detectDeviceLocale();

  // eslint-disable-next-line import/no-named-as-default-member
  await i18n.use(initReactI18next).init({
    resources,
    lng: locale,
    fallbackLng: "ru",
    interpolation: {
      escapeValue: false,
    },
    ns: ["common", "auth", "account", "listings", "conversations", "onboarding", "support"],
    defaultNS: "common",
    react: {
      useSuspense: false,
    },
  });

  // Keep react-i18next in sync with the zustand store
  localeStore.subscribe((state) => {
    if (state.locale && state.locale !== i18n.language) {
      // eslint-disable-next-line import/no-named-as-default-member
      void i18n.changeLanguage(state.locale);
    }
  });

  // If store was empty on boot, seed it with the resolved locale
  if (!storeLocale) {
    localeStore.getState().setLocale(locale);
  }

  return i18n;
}

export { i18n };
