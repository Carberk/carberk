"use client";

import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

import { adminLocaleNames, normalizeAdminLocale, translateAdmin, type AdminLocale } from "./messages";

const AdminLocaleContext = createContext<{locale: AdminLocale; setLocale: (locale: AdminLocale) => void}>({locale: "ru", setLocale: () => {}});
export function AdminLocaleProvider({ initialLocale = "ru", children }: {initialLocale?: AdminLocale; children: ReactNode}) {
  const [locale, updateLocale] = useState(initialLocale);
  useEffect(() => { document.documentElement.lang = locale; }, [locale]);
  function setLocale(next: AdminLocale) {
    const safe = normalizeAdminLocale(next);
    document.cookie = `carberk_admin_locale=${safe}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
    updateLocale(safe);
  }
  return <AdminLocaleContext.Provider value={{locale,setLocale}}>{children}</AdminLocaleContext.Provider>;
}
export function useAdminLocale() { return useContext(AdminLocaleContext); }
export function useAdminTranslation() { const {locale}=useAdminLocale(); return (text:string) => translateAdmin(text,locale); }
export function AdminText({ children }: {children: string}) { const t=useAdminTranslation(); return <>{t(children)}</>; }
export function AdminLanguageSwitch() {
  const {locale,setLocale}=useAdminLocale();
  return <label className="flex items-center gap-2 text-sm"><AdminText>Язык</AdminText>
    <select aria-label={translateAdmin("Язык",locale)} value={locale} onChange={event=>setLocale(normalizeAdminLocale(event.target.value))} className="min-h-10 rounded-md border bg-surface px-2">
      {Object.entries(adminLocaleNames).map(([key,name])=><option key={key} value={key} lang={key}>{name}</option>)}
    </select></label>;
}

export function AdminDate({ value }: {value: string}) {
  const {locale}=useAdminLocale();
  return <time dateTime={value}>{new Intl.DateTimeFormat(locale==='tk'?'tk-TM':locale==='ru'?'ru-RU':'en-GB', {dateStyle:'medium',timeStyle:'short',timeZone:'UTC'}).format(new Date(value))} UTC</time>;
}
