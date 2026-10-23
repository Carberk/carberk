"use server";
import { DiagnosticSchemas as D } from "@auto-tm/contracts";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";

import { rejectExpiredSession } from "@/lib/action-session";
import { apiFetch, ApiError } from "@/lib/api-client";
import { diagnosticFetch, diagnosticJson, diagnosticPairQuery, protectedDiagnostic } from "@/lib/diagnostic-transport";

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

// Exact restricted projection of DiagnosticReportsPort.comparison. No report DTO fallback.
const uuid = z.string().uuid();
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const diagnosticComparisonSchema = z.object({
 predecessor: z.object({ reportId: uuid, reportVersion: z.number().int().nonnegative(), snapshotHash: hash, identityRecordId: uuid, identityRecordHash: hash, identity: D.DiagnosticComparisonIdentitySchema }).strict(),
 candidate: z.object({ orderId: uuid, orderVersion: z.number().int().nonnegative(), identityRecordId: uuid, identityRecordHash: hash, identity: D.DiagnosticComparisonIdentitySchema }).strict(),
}).strict();

// Restricted identity transport is separate from the existing intake vehicle envelope.
export async function diagnosticIdentityRecords(orderId: string) {
 return protectedDiagnostic(false, async token => diagnosticJson(await diagnosticFetch(`/diagnostics/orders/${id(orderId)}/identity-records`, token), z.array(D.DiagnosticIdentityRecordSchema)));
}
export async function diagnosticStageIdentityProvenance(orderId: string, input: unknown) {
 return protectedDiagnostic(true, async token => diagnosticJson(await diagnosticFetch(`/diagnostics/orders/${id(orderId)}/identity-provenance`, token, { body: D.DiagnosticIdentityProvenanceStageSchema.parse(input) }), D.DiagnosticIdentityProvenanceStagedSchema));
}
export async function diagnosticIdentityEvidence(orderId: string) {
 return protectedDiagnostic(false, async token => diagnosticJson(await diagnosticFetch(`/diagnostics/orders/${id(orderId)}/identity-evidence`, token), z.array(D.DiagnosticIdentityEvidenceSchema)));
}
export async function diagnosticAppendIdentityEvidence(orderId: string, input: unknown) {
 return protectedDiagnostic(true, async token => diagnosticJson(await diagnosticFetch(`/diagnostics/orders/${id(orderId)}/identity-evidence`, token, { body: D.DiagnosticIdentityEvidenceCaptureSchema.parse(input) }), D.DiagnosticIdentityEvidenceSchema));
}
export async function diagnosticReinspectionComparison(orderId: string, query: unknown) {
 return protectedDiagnostic(false, async token => {
  const pair = diagnosticPairQuery.parse(query);
  return diagnosticJson(await diagnosticFetch(`/diagnostics/orders/${id(orderId)}/reinspection-comparison?${new URLSearchParams(pair)}`, token), diagnosticComparisonSchema);
 });
}
export async function diagnosticPredecessors(orderId: string, query: unknown) {
 return protectedDiagnostic(false, async token => {
  const input = D.DiagnosticPredecessorQuerySchema.parse(query);
  return diagnosticJson(await diagnosticFetch(`/diagnostics/orders/${id(orderId)}/predecessor-candidates?${new URLSearchParams(input.cursor === undefined ? {} : { cursor: input.cursor })}`, token), D.DiagnosticPredecessorPageSchema);
 });
}
export async function diagnosticLinkingTechnicians(orderId: string) {
 return protectedDiagnostic(false, async token => diagnosticJson(await diagnosticFetch(`/diagnostics/orders/${id(orderId)}/linking-technicians`, token), D.DiagnosticLinkingTechniciansSchema));
}
export async function diagnosticContinuityHandoffs(orderId: string, query: unknown) {
 return protectedDiagnostic(false, async token => {
  const input = D.DiagnosticPredecessorQuerySchema.parse(query);
  return diagnosticJson(await diagnosticFetch(`/diagnostics/orders/${id(orderId)}/continuity-handoffs?${new URLSearchParams(input.cursor === undefined ? {} : { cursor: input.cursor })}`, token), D.DiagnosticContinuityHandoffsSchema);
 });
}
export async function diagnosticContinuityProof(orderId: string, proofId: string) {
 return protectedDiagnostic(false, async token => diagnosticJson(await diagnosticFetch(`/diagnostics/orders/${id(orderId)}/continuity-proofs/${id(proofId)}`, token), D.DiagnosticContinuityProofSchema));
}
export async function diagnosticIssueContinuityProof(orderId: string, input: unknown) {
 return protectedDiagnostic(true, async token => diagnosticJson(await diagnosticFetch(`/diagnostics/orders/${id(orderId)}/continuity-proofs`, token, { body: D.DiagnosticContinuityProofIssuanceSchema.parse(input) }), D.DiagnosticContinuityProofSchema));
}
export async function diagnosticConsumeContinuityHandoff(orderId: string, proofId: string, input: unknown) {
 return protectedDiagnostic(true, async token => diagnosticJson(await diagnosticFetch(`/diagnostics/orders/${id(orderId)}/continuity-handoffs/${id(proofId)}/consume`, token, { body: D.DiagnosticContinuityCommandSchema.parse(input) }), z.object({ reportId: z.string().uuid() }).strict()));
}

// Opaque request recovery uses the current Session only. Pending identities contain
// no saved command; completed issue handles are historical, never admission.
export async function diagnosticPrepareContinuityRequest(orderId: string, input: unknown) {
 return protectedDiagnostic(true, async token => {
  const command = D.DiagnosticContinuityRequestPrepareSchema.parse(input);
  return diagnosticJson(await diagnosticFetch(`/diagnostics/orders/${id(orderId)}/continuity-requests`, token, { body: command }),
   D.DiagnosticContinuityRequestSchema.refine(value => value.kind === command.kind && value.state === "pending_input"));
 });
}
export async function diagnosticContinuityRequests(orderId: string, query: unknown) {
 return protectedDiagnostic(false, async token => {
  const page = D.DiagnosticPredecessorQuerySchema.parse(query);
  return diagnosticJson(await diagnosticFetch(`/diagnostics/orders/${id(orderId)}/continuity-requests?${new URLSearchParams(page.cursor === undefined ? {} : { cursor: page.cursor })}`, token), D.DiagnosticContinuityRequestsSchema);
 });
}
export async function diagnosticRecoverContinuityRequest(orderId: string, requestId: string) {
 return protectedDiagnostic(false, async token => diagnosticJson(await diagnosticFetch(`/diagnostics/orders/${id(orderId)}/continuity-requests/${id(requestId)}`, token),
  D.DiagnosticContinuityRequestSchema.refine(value => value.requestId === requestId)));
}
export async function diagnosticExecuteContinuityRequest(orderId: string, requestId: string, input: unknown) {
 return protectedDiagnostic(true, async token => {
  const command = D.DiagnosticContinuityRequestExecuteSchema.parse(input);
  return diagnosticJson(await diagnosticFetch(`/diagnostics/orders/${id(orderId)}/continuity-requests/${id(requestId)}/execute`, token, { body: command }),
   D.DiagnosticContinuityRequestSchema.refine(value => value.requestId === requestId && value.kind === command.kind));
 });
}
