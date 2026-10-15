"use server";
import { unstable_rethrow } from "next/navigation";
import { BusinessSchemas, StaffSchemas } from "@auto-tm/contracts";
import { z } from "zod";

import { rejectExpiredSession } from "@/lib/action-session";
import { apiFetch, ApiError } from "@/lib/api-client";
export type BusinessAdmissionResult = { ok: true; receipt: z.infer<typeof BusinessSchemas.BusinessInvitationReceiptSchema> } | { ok: false; error: "permission" | "validation" | "conflict" | "error" };
export async function prepareBusinessInvitation(form: FormData): Promise<BusinessAdmissionResult> {
 await rejectExpiredSession();
 const recovery = form.get("operation") === "recovery";
 const businessId = z.string().uuid().safeParse(form.get("businessId"));
 const common = { ownerUserId: form.get("ownerUserId"), evidence: form.get("evidence"), reason: form.get("reason") };
 const parsed = recovery ? BusinessSchemas.RecoverBusinessSchema.safeParse(common) : BusinessSchemas.AdmitBusinessSchema.safeParse({ ...common, name: form.get("name"), slug: form.get("slug"), mode: form.get("mode") });
 if (!parsed.success || (recovery && !businessId.success)) return { ok: false, error: "validation" };
 try {
  const authority = StaffSchemas.StaffSummarySchema.parse(await apiFetch("/staff/capabilities", { cache: "no-store" }));
  if (!authority.elevated || !authority.capabilities.includes(recovery ? "founder.recovery" : "founder.admission")) return { ok: false, error: "permission" };
  const path = recovery && businessId.success ? `/business/${encodeURIComponent(businessId.data)}/recovery` : "/business/admission";
  const receipt = BusinessSchemas.BusinessInvitationReceiptSchema.parse(await apiFetch(path, { method: "POST", body: parsed.data }));
  return { ok: true, receipt };
 } catch (error) {
  unstable_rethrow(error);
  if (error instanceof ApiError && error.status === 403) return { ok: false, error: "permission" };
  if (error instanceof ApiError && error.status === 409) return { ok: false, error: "conflict" };
  return { ok: false, error: "error" };
 }
}
