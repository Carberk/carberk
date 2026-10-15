import { AdminContextSchemas } from "@auto-tm/contracts";
import type { z } from "zod";
import { unstable_rethrow } from "next/navigation";

import { rejectExpiredSession } from "./action-session";
import { apiFetch, ApiError } from "./api-client";

export async function readAdminContext<S extends z.ZodTypeAny>(path: string, schema: S): Promise<{ ok: true; data: z.output<S> } | { ok: false; error: string }> {
  await rejectExpiredSession();
  try {
    return { ok: true, data: schema.parse(await apiFetch(`/admin/context/${path}`, { cache: "no-store" })) };
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof ApiError && error.status === 403) return { ok: false, error: "Недостаточно прав." };
    if (error instanceof ApiError && error.status === 404) return { ok: false, error: "Запись удалена или недоступна." };
    if (error instanceof ApiError) return { ok: false, error: "Временно недоступно. Попробуйте ещё раз." };
    return { ok: false, error: "Временно недоступно. Попробуйте ещё раз." };
  }
}
export { AdminContextSchemas };

export function adminDirectoryQuery(params: Record<string, string | string[] | undefined>, listings: boolean) {
  const query: Record<string, string> = {};
  for (const key of ["q", "page", "pageSize", ...(listings ? ["status", "brandId", "regionId", "from", "to"] : [])]) {
    const value = params[key];
    if (typeof value === "string" && value !== "") query[key] = value;
  }
  for (const key of ["from", "to"]) {
    if (query[key] && /^\d{4}-\d{2}-\d{2}$/.test(query[key])) query[key] += key === "to" ? "T23:59:59.999Z" : "T00:00:00.000Z";
  }
  return query;
}
