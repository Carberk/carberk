import { Suspense } from "react";
import { notFound, unstable_rethrow } from "next/navigation";
import { HistoryStaffSchemas } from "@auto-tm/contracts";
import { HistoryWorkbench } from "@/components/HistoryWorkbench";
import { apiFetchOptional, ApiError } from "@/lib/api-client";
import type { DeskLocale } from "@/lib/history-desk-copy";
import { staffCopy } from "@/lib/history-staff-copy";
import { HistoryStaffForm } from "./HistoryStaffForm";
import type { StaffState } from "./actions";

async function StaffContent({ locale, targetId }: { locale: DeskLocale; targetId: string | undefined }) {
  let initial: StaffState;
  try {
    const parsed = HistoryStaffSchemas.HistoryStaffLookupSchema.safeParse({ targetId });
    const result = await apiFetchOptional<unknown>(`/identity/history-staff${parsed.success && targetId ? `?targetId=${targetId}` : ""}`, { cache: "no-store" });
    initial = result ? { ...HistoryStaffSchemas.HistoryStaffResponseSchema.parse(result),
      status: !parsed.success ? "validation" : targetId ? undefined : "empty" } : { status: "expired" };
    if (result && targetId && parsed.success && !initial.target) initial.status = "missing";
  } catch (error) {
    unstable_rethrow(error);
    initial = { status: error instanceof ApiError && error.status === 403 ? "denied" : "error" };
  }
  return <HistoryStaffForm locale={locale} initial={initial} />;
}
export default async function HistoryStaffPage({ params, searchParams }: {
  params: Promise<{ locale: string }>; searchParams: Promise<{ targetId?: string }>;
}) {
  const { locale } = await params;
  if (locale !== "tk" && locale !== "ru" && locale !== "en") notFound();
  const { targetId } = await searchParams;
  return <HistoryWorkbench locale={locale} section="staff">
    <Suspense fallback={<p role="status">{staffCopy[locale].loading}</p>}><StaffContent locale={locale} targetId={targetId} /></Suspense>
  </HistoryWorkbench>;
}
