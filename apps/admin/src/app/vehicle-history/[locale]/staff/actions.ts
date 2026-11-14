"use server";
import { HistoryStaffSchemas } from "@auto-tm/contracts";
import { unstable_rethrow } from "next/navigation";

import { apiFetchOptional, ApiError } from "@/lib/api-client";
import { rejectExpiredSession } from "@/lib/action-session";
import type { DeskLocale } from "@/lib/history-desk-copy";

export type StaffState = Partial<HistoryStaffSchemas.HistoryStaffResponse> & {
  status?: "empty" | "found" | "missing" | "saved" | "validation" | "self" | "unavailable" | "denied" | "expired" | "error" | undefined;
  changed?: HistoryStaffSchemas.HistoryCapability;
};
export async function staffAction(locale: DeskLocale, previous: StaffState, data: FormData): Promise<StaffState> {
  await rejectExpiredSession();
  const targetId = data.get("targetId");
  const capability = data.get("capability");
  const lookup = HistoryStaffSchemas.HistoryStaffLookupSchema.safeParse({ targetId });
  const change = HistoryStaffSchemas.HistoryStaffChangeSchema.safeParse({ targetId, capability,
    active: data.get("active") === "true", reason: data.get("reason") });
  if (!lookup.success || (capability !== null && !change.success)) {
    return { ...previous, ...(capability === null ? { target: null } : {}), status: "validation" };
  }
  try {
    const response = await apiFetchOptional<unknown>(capability === null
      ? `/identity/history-staff?targetId=${lookup.data.targetId}` : "/identity/history-staff", {
      method: capability === null ? "GET" : "POST", cache: "no-store", headers: { "Accept-Language": locale },
      ...(capability !== null && change.success ? { body: change.data } : {}),
    });
    if (!response) return { status: "expired" };
    const result = HistoryStaffSchemas.HistoryStaffResponseSchema.parse(response);
    return { ...result, ...(change.success && capability !== null ? { changed: change.data.capability } : {}),
      status: result.target ? capability === null ? "found" : "saved" : "missing" };
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof ApiError) {
      if (error.status === 403) return error.code === "HISTORY_SELF_CHANGE_DENIED" ? { ...previous, status: "self" } : { status: "denied" };
      if (error.status === 404) return { ...previous, target: null, status: "missing" };
      if (error.status === 409) return { ...previous, status: "unavailable" };
    }
    return { ...previous, status: "error" };
  }
}
