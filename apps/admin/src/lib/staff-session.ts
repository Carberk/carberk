import { redirect } from "next/navigation";
import { StaffSchemas } from "@auto-tm/contracts";

import { rejectExpiredSession } from "./action-session";
import { apiFetchOptional, ApiError } from "./api-client";
import { validateReturnTo } from "./validators";

export async function currentStaff(returnTo: string) {
  await rejectExpiredSession();
  const summary = await apiFetchOptional<ReturnType<typeof StaffSchemas.StaffSummarySchema.parse>>("/staff/capabilities", {cache:"no-store"});
  if (!summary) redirect(`/login?reason=session-expired&returnTo=${encodeURIComponent(validateReturnTo(returnTo)??"/workspace")}`);
  const parsed = StaffSchemas.StaffSummarySchema.parse(summary);
  if (!parsed.elevated) redirect(`/login?mode=totp&returnTo=${encodeURIComponent(validateReturnTo(returnTo)??"/workspace")}`);
  return parsed;
}
export async function requireStaffCapability(capability: StaffSchemas.StaffCapability, returnTo: string) {
  const summary = await currentStaff(returnTo);
  if (!summary.capabilities.includes(capability)) throw new ApiError(403,"FORBIDDEN",{},"Current staff authority required");
  return summary;
}
export async function currentMarketplaceAdmin() {
  try {
    const authority = await apiFetchOptional<{marketplaceAdmin?:boolean}>("/admin/authority", {cache:"no-store"});
    return authority?.marketplaceAdmin === true;
  } catch (error) { if (error instanceof ApiError && error.status===403) return false; throw error; }
}
