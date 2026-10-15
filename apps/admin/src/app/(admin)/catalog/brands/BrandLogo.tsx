"use client";

import { useAdminLocale } from "@/lib/i18n";

export function BrandLogo({ name, logoUrl }: { name: string; logoUrl: string | undefined }) {
  const {locale}=useAdminLocale();
  const letter=name.trim().charAt(0).toUpperCase()||"?";
  const alt=locale==='tk'?`${name} logotipi`:locale==='en'?`${name} logo`:`Логотип ${name}`;
  const fallback=locale==='tk'?`Logotip ýok, harp ${letter}`:locale==='en'?`No logo, letter ${letter}`:`Нет логотипа, буква ${letter}`;
  return logoUrl?<img src={logoUrl} alt={alt} width={40} height={40} className="h-10 w-10 shrink-0 object-contain"/>:<div aria-label={fallback} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-sm font-semibold text-neutral-600">{letter}</div>;
}
