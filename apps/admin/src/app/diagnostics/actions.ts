"use server";
import { DiagnosticSchemas as D } from "@auto-tm/contracts";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";

import { rejectExpiredSession } from "@/lib/action-session";
import { apiFetch, ApiError } from "@/lib/api-client";

export type DiagnosticResult<T> = { ok: true; data: T } | { ok: false; error: "denied" | "conflict" | "error"; code: string };
async function run<T>(work: () => Promise<T>): Promise<DiagnosticResult<T>> {
 await rejectExpiredSession();
 try { return { ok: true, data: await work() }; }
 catch (error) { unstable_rethrow(error); return { ok: false, error: error instanceof ApiError ? error.status === 403 ? "denied" : error.status === 409 ? "conflict" : "error" : "error", code: error instanceof ApiError ? error.code : "INVALID_INPUT" }; }
}
const id = (value: string) => z.string().uuid().parse(value);
export async function diagnosticAssigned() { return run(async () => z.array(D.DiagnosticOrderSchema).parse(await apiFetch("/diagnostics/assigned"))); }
export async function diagnosticWorkspace(orderId: string) { return run(async () => {
 const context = D.DiagnosticWorkspaceSchema.parse(await apiFetch(`/diagnostics/orders/${id(orderId)}/workspace`));
 const reports = z.array(D.DiagnosticReportSchema).parse(await apiFetch(`/diagnostics/orders/${id(orderId)}/reports`));
 return { context, reports };
}); }
export async function diagnosticIntake(orderId: string, kind: "authorization" | "appointment" | "assignments" | "vehicle", input: unknown) {
 return run(async () => {
  const schema = { authorization: D.DiagnosticAuthorizationSchema, appointment: D.DiagnosticAppointmentChangeSchema, assignments: D.DiagnosticAssignmentChangeSchema, vehicle: D.DiagnosticObservedVehicleSchema }[kind];
  return D.DiagnosticOrderSchema.parse(await apiFetch(`/diagnostics/orders/${id(orderId)}/${kind}`, { method: "POST", body: schema.parse(input) }));
 });
}
export async function diagnosticCreateDraft(orderId: string, input: D.DiagnosticDraftCreate) { return run(async () => D.DiagnosticReportSchema.parse(await apiFetch(`/diagnostics/orders/${id(orderId)}/reports`, { method: "POST", body: D.DiagnosticDraftCreateSchema.parse(input) }))); }
export async function diagnosticSave(reportId: string, input: D.DiagnosticFindingSave) { return run(async () => D.DiagnosticReportSchema.parse(await apiFetch(`/diagnostics/reports/${id(reportId)}/findings`, { method: "POST", body: D.DiagnosticFindingSaveSchema.parse(input) }))); }
export async function diagnosticTransition(reportId: string, input: D.DiagnosticReportTransition) { return run(async () => D.DiagnosticReportSchema.parse(await apiFetch(`/diagnostics/reports/${id(reportId)}/transition`, { method: "POST", body: D.DiagnosticReportTransitionSchema.parse(input) }))); }
export async function diagnosticCorrect(reportId: string, input: D.DiagnosticCorrection) { return run(async () => D.DiagnosticReportSchema.parse(await apiFetch(`/diagnostics/reports/${id(reportId)}/corrections`, { method: "POST", body: D.DiagnosticCorrectionSchema.parse(input) }))); }
export async function diagnosticAbandon(reportId: string, evidenceId: string) { return run(async () => { await apiFetch(`/diagnostics/reports/${id(reportId)}/evidence/${id(evidenceId)}/abandon`, { method: "POST" }); return null; }); }
