import { headers } from "next/headers";
import { StaffSchemas } from "@auto-tm/contracts";

import { BusinessAdmissionForm } from "./BusinessAdmissionForm";
import { businessAdminCopy } from "./copy";

import { apiFetch, ApiError } from "@/lib/api-client";
// #906 composes the shared locale/shell; this bounded page accepts its safe
// explicit locale query until assembly, without changing the global root.
export default async function BusinessAdmissionPage({ searchParams }: { searchParams: Promise<{ locale?: string }> }) {
 const requested = (await searchParams).locale;
 const locale = requested === "tk" || requested === "en" ? requested : "ru";
 const c = businessAdminCopy[locale];
 let canAdmit = false; let canRecover = false;
 try {
  await headers();
  const authority = StaffSchemas.StaffSummarySchema.parse(await apiFetch("/staff/capabilities", { cache: "no-store" }));
  canAdmit = authority.elevated && authority.capabilities.includes("founder.admission"); canRecover = authority.elevated && authority.capabilities.includes("founder.recovery");
 } catch (error) { if (!(error instanceof ApiError)) throw error; }
 return <main lang={locale} className="mx-auto w-full max-w-3xl space-y-6 px-5 py-8 text-neutral-950"><nav aria-label="Language" className="flex gap-4 text-sm"><a href="?locale=tk" lang="tk">Türkmençe</a><a href="?locale=ru" lang="ru">Русский</a><a href="?locale=en" lang="en">English</a></nav><h1 className="text-3xl font-semibold">{c.title}</h1><p className="max-w-prose text-neutral-600">{c.intro}</p>{!canAdmit && !canRecover ? <p role="alert">{c.permission}</p> : <BusinessAdmissionForm locale={locale} canAdmit={canAdmit} canRecover={canRecover} />}</main>;
}
