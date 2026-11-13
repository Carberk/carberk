import Link from "next/link";
import { unstable_rethrow } from "next/navigation";

import { apiFetchOptional } from "@/lib/api-client";

const LINKS = [
  { href: "/reports", label: "Жалобы" },
  { href: "/reports/inspection-interests", label: "Интерес к проверкам" },
  { href: "/catalog/brands", label: "Бренды" },
  { href: "/audit", label: "Аудит" },
];

export async function AdminNav() {
  let historyAvailable = false;
  try {
    historyAvailable = Boolean(await apiFetchOptional("/vehicle-history/desk", { cache: "no-store" }));
  } catch (error) {
    unstable_rethrow(error);
  }
  return (
    <nav className="flex flex-wrap gap-4 border-b px-6 py-3 text-sm md:px-8">
      {LINKS.map((link) => (
        <Link key={link.href} href={link.href} className="text-neutral-600 hover:text-neutral-900">
          {link.label}
        </Link>
      ))}
      {historyAvailable && <Link href="/vehicle-history/ru" className="text-neutral-600 hover:text-neutral-900">История автомобиля</Link>}
    </nav>
  );
}
