"use server";
import { OperationsSchemas } from "@auto-tm/contracts";
import { unstable_rethrow } from "next/navigation";

import { rejectExpiredSession } from "@/lib/action-session";
import { apiFetch, ApiError } from "@/lib/api-client";

export async function operationsHealth(): Promise<{ ok: true; data: OperationsSchemas.OperationsHealth } | { ok: false; error: "denied" | "error" }> {
  await rejectExpiredSession();
  try { return { ok: true, data: OperationsSchemas.OperationsHealthSchema.parse(await apiFetch("/operations/health", { cache: "no-store" })) }; }
  catch (error) {
    unstable_rethrow(error);
    return { ok: false, error: error instanceof ApiError && error.status === 403 ? "denied" : "error" };
  }
}
