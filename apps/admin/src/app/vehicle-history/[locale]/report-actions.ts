"use server";

import { HistoryReportArtifactSchemas as R, VehicleHistorySchemas as V } from "@auto-tm/contracts";
import { unstable_rethrow } from "next/navigation";

import { rejectExpiredSession } from "@/lib/action-session";
import { ApiError, apiFetchOptional } from "@/lib/api-client";
import { getAccessToken } from "@/lib/cookies";
import type { DeskLocale } from "@/lib/history-desk-copy";
import { historyInboxScope } from "@/lib/history-inbox-scope";

const Selection = V.HistoryAssigneesActionSchema.pick({ id: true, scope: true });
const errors = {
  HISTORY_REPORT_MISSING: "missing", HISTORY_REPORT_MISMATCH: "mismatch", HISTORY_REPORT_PDF: "pdfInvalid",
  HISTORY_REPORT_LINK: "linkInvalid", HISTORY_REPORT_RIGHTS: "rightsInvalid",
} as const;
type Failure = "expired" | "stale" | "denied" | "conflict" | "unavailable" | "invalid" | (typeof errors)[keyof typeof errors];
type Result = { status: "ok"; view: R.HistoryReportView } | { status: "preview"; dataBase64: string } | { status: Failure };

export async function historyReportAction(locale: DeskLocale, selection: unknown, action: "read" | "validate" | "preview", value: unknown): Promise<Result> {
  await rejectExpiredSession();
  const selected = Selection.safeParse(selection);
  const input = (action === "validate" ? R.ValidateHistoryReportSchema : R.HistoryReportTargetSchema).safeParse(value);
  if (!selected.success || !input.success || !["en", "ru", "tk"].includes(locale) ||
    !["read", "validate", "preview"].includes(action)) return { status: "invalid" };
  const token = await getAccessToken();
  const binding = token ? historyInboxScope(token) : null;
  if (!token || !binding) return { status: "expired" };
  if (binding.scope !== selected.data.scope) return { status: "stale" };

  const base = `/vehicle-history/operator/requests/${selected.data.id}/report-artifacts`;
  const query = new URLSearchParams(Object.entries(R.HistoryReportTargetSchema.strip().parse(input.data))
    .map(([key, value]) => [key, String(value)]));
  const options = { cache: "no-store", headers: { "Accept-Language": locale } } as const;
  try {
    const response = await apiFetchOptional<unknown>(action === "validate" ? base : `${base}${action === "preview" ? "/content" : ""}?${query}`,
      action === "validate" ? { ...options, method: "POST", body: input.data } : options, token);
    if (token !== await getAccessToken()) return { status: "stale" };
    if (response === null) return { status: "expired" };
    if (action === "preview") {
      const content = R.HistoryReportContentSchema.safeParse(response);
      return content.success ? { status: "preview", dataBase64: content.data.dataBase64 } : { status: "unavailable" };
    }
    const view = R.HistoryReportViewSchema.safeParse(response);
    return view.success ? { status: "ok", view: view.data } : { status: "unavailable" };
  } catch (error) {
    unstable_rethrow(error);
    if (token !== await getAccessToken()) return { status: "stale" };
    if (error instanceof ApiError) {
      if (error.status === 403) return { status: "denied" };
      if (error.status === 409) return { status: "conflict" };
      if (error.status === 400) return { status: "invalid" };
      if (Object.hasOwn(errors, error.code)) return { status: errors[error.code as keyof typeof errors] };
    }
    return { status: "unavailable" };
  }
}
