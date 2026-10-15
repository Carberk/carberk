"use server";

import { unstable_rethrow } from "next/navigation";
import type { AdminSchemas, ReportsSchemas } from "@auto-tm/contracts";

import { rejectExpiredSession } from "@/lib/action-session";
import { apiFetch, ApiError } from "@/lib/api-client";

type ListReportsResponse = AdminSchemas.ListReportsResponse;
type GetReportDetailResponse = AdminSchemas.GetReportDetailResponse;
type DismissReportResponse = AdminSchemas.DismissReportResponse;
type BanListingResponse = AdminSchemas.BanListingResponse;
type UnbanListingResponse = AdminSchemas.UnbanListingResponse;
type SuspendUserResponse = AdminSchemas.SuspendUserResponse;
type UnsuspendUserResponse = AdminSchemas.UnsuspendUserResponse;
type RemoveUserPhotoResponse = AdminSchemas.RemoveUserPhotoResponse;
type ListAuditEntriesResponse = AdminSchemas.ListAuditEntriesResponse;
type ConfigResponse = AdminSchemas.ConfigResponse;
type ListInspectionInterestStatsResponse = ReportsSchemas.ListInspectionInterestStatsResponse;

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: string; details?: unknown };

function handleApiError(err: unknown): ActionResult<never> {
  unstable_rethrow(err);
  if (err instanceof ApiError) {
    return {
      ok: false,
      error: err.status === 403 ? "Недостаточно прав." : "Временно недоступно. Попробуйте ещё раз.",
      code: err.code,
      details: err.responseBody,
    };
  }
  return { ok: false, error: "Неизвестная ошибка. Попробуйте позже." };
}

// ─── Reports ───

export async function listReports(params: {
  status?: string;
  targetType?: string;
  page?: number;
  pageSize?: number;
}): Promise<ActionResult<ListReportsResponse>> {
  await rejectExpiredSession();
  const searchParams = new URLSearchParams();
  if (params.status) searchParams.set("status", params.status);
  if (params.targetType) searchParams.set("targetType", params.targetType);
  if (params.page) searchParams.set("page", String(params.page));
  if (params.pageSize) searchParams.set("pageSize", String(params.pageSize));

  try {
    const data = await apiFetch<ListReportsResponse>(
      `/admin/reports?${searchParams.toString()}`,
    );
    return { ok: true, data };
  } catch (err) {
    return handleApiError(err);
  }
}

export async function getReportDetail(
  id: string,
): Promise<ActionResult<GetReportDetailResponse>> {
  await rejectExpiredSession();
  try {
    const data = await apiFetch<GetReportDetailResponse>(`/admin/reports/${id}`);
    return { ok: true, data };
  } catch (err) {
    return handleApiError(err);
  }
}

export async function dismissReport(
  id: string,
  reason: string,
): Promise<ActionResult<DismissReportResponse>> {
  await rejectExpiredSession();
  try {
    const data = await apiFetch<DismissReportResponse>(
      `/admin/reports/${id}/dismiss`,
      {
        method: "POST",
        body: { reason },
      },
    );
    return { ok: true, data };
  } catch (err) {
    return handleApiError(err);
  }
}

// ─── Listings ───

export async function banListing(
  id: string,
  reason: string,
  reportId?: string,
): Promise<ActionResult<BanListingResponse>> {
  await rejectExpiredSession();
  try {
    const data = await apiFetch<BanListingResponse>(
      `/admin/listings/${id}/ban`,
      {
        method: "POST",
        body: { reason, reportId },
      },
    );
    return { ok: true, data };
  } catch (err) {
    return handleApiError(err);
  }
}

export async function unbanListing(
  id: string,
  reason: string,
): Promise<ActionResult<UnbanListingResponse>> {
  await rejectExpiredSession();
  try {
    const data = await apiFetch<UnbanListingResponse>(
      `/admin/listings/${id}/unban`,
      {
        method: "POST",
        body: { reason },
      },
    );
    return { ok: true, data };
  } catch (err) {
    return handleApiError(err);
  }
}

// ─── Users ───

export async function suspendUser(
  id: string,
  reason: string,
  reportId?: string,
): Promise<ActionResult<SuspendUserResponse>> {
  await rejectExpiredSession();
  try {
    const data = await apiFetch<SuspendUserResponse>(
      `/admin/users/${id}/suspend`,
      {
        method: "POST",
        body: { reason, reportId },
      },
    );
    return { ok: true, data };
  } catch (err) {
    return handleApiError(err);
  }
}

export async function unsuspendUser(
  id: string,
  reason: string,
): Promise<ActionResult<UnsuspendUserResponse>> {
  await rejectExpiredSession();
  try {
    const data = await apiFetch<UnsuspendUserResponse>(
      `/admin/users/${id}/unsuspend`,
      {
        method: "POST",
        body: { reason },
      },
    );
    return { ok: true, data };
  } catch (err) {
    return handleApiError(err);
  }
}

export async function removeUserPhoto(
  id: string,
  reason: string,
  reportId?: string,
): Promise<ActionResult<RemoveUserPhotoResponse>> {
  await rejectExpiredSession();
  try {
    const data = await apiFetch<RemoveUserPhotoResponse>(
      `/admin/users/${id}/remove-photo`,
      { method: "POST", body: { reason, reportId } },
    );
    return { ok: true, data };
  } catch (err) {
    return handleApiError(err);
  }
}

// ─── Audit ───

export async function listAuditEntries(params: {
  action?: string;
  targetType?: string;
  targetId?: string;
  page?: number;
  pageSize?: number;
}): Promise<ActionResult<ListAuditEntriesResponse>> {
  await rejectExpiredSession();
  const searchParams = new URLSearchParams();
  if (params.action) searchParams.set("action", params.action);
  if (params.targetType) searchParams.set("targetType", params.targetType);
  if (params.targetId) searchParams.set("targetId", params.targetId);
  if (params.page) searchParams.set("page", String(params.page));
  if (params.pageSize) searchParams.set("pageSize", String(params.pageSize));

  try {
    const data = await apiFetch<ListAuditEntriesResponse>(
      `/admin/audit?${searchParams.toString()}`,
    );
    return { ok: true, data };
  } catch (err) {
    return handleApiError(err);
  }
}

// ─── Inspection interests ───

export async function listInspectionInterestStats(params: {
  page?: number;
  pageSize?: number;
}): Promise<ActionResult<ListInspectionInterestStatsResponse>> {
  await rejectExpiredSession();
  const searchParams = new URLSearchParams();
  if (params.page) searchParams.set("page", String(params.page));
  if (params.pageSize) searchParams.set("pageSize", String(params.pageSize));

  try {
    const data = await apiFetch<ListInspectionInterestStatsResponse>(
      `/admin/inspection-interests?${searchParams.toString()}`,
    );
    return { ok: true, data };
  } catch (err) {
    return handleApiError(err);
  }
}

// ─── Config ───

export async function getConfig(): Promise<ActionResult<ConfigResponse>> {
  await rejectExpiredSession();
  try {
    const data = await apiFetch<ConfigResponse>("/config");
    return { ok: true, data };
  } catch (err) {
    return handleApiError(err);
  }
}
