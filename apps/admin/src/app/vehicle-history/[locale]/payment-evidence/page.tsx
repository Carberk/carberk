import { notFound } from "next/navigation";

import { HistoricalPaymentEvidence } from "./HistoricalPaymentEvidence";

import { HistoryWorkbench } from "@/components/HistoryWorkbench";
export default async function PaymentEvidencePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (locale !== "en" && locale !== "ru" && locale !== "tk") notFound();
  return <HistoryWorkbench locale={locale} section="evidence"><div className="max-w-2xl space-y-5"><HistoricalPaymentEvidence locale={locale} /></div></HistoryWorkbench>;
}
