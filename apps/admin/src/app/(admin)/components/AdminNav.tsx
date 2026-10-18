import Link from "next/link";
import type { StaffSchemas } from "@auto-tm/contracts";

import { AdminText } from "@/lib/i18n";

export function AdminNav({capabilities=[], marketplaceAdmin=false}: {capabilities?: StaffSchemas.StaffCapability[]; marketplaceAdmin?: boolean}) {
  const links=[{href:"/workspace",label:"Рабочее пространство"},
    ...(capabilities.some(c=>c==="analytics.aggregate"||c==="analytics.investigate")?[{href:"/improvement",label:"Улучшения"}]:[]),
    ...(marketplaceAdmin?[{href:"/reports",label:"Жалобы"},{href:"/reports/inspection-interests",label:"Интерес к проверкам"},{href:"/catalog/brands",label:"Бренды"},{href:"/audit",label:"Аудит"}]:[]),
    ...(marketplaceAdmin?[{href:"/listings",label:"Объявления"},{href:"/users",label:"Пользователи"}]:[]),
    ...(capabilities.some(c=>c==="founder.admission"||c==="founder.recovery")?[{href:"/business-admission",label:"Допуск бизнеса"}]:[])];
  return <nav aria-label="Carberk" className="flex flex-wrap gap-x-5 gap-y-2 border-b px-6 py-3 text-sm md:px-8">
    {links.map(link=><Link key={link.href} href={link.href} className="inline-flex min-h-10 items-center text-neutral-700 underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4"><AdminText>{link.label}</AdminText></Link>)}
  </nav>;
}
