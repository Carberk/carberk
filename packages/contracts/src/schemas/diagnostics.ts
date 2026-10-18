import { z } from "zod";

export const LocalizedDiagnosticTextSchema = z.object({ tk: z.string().trim().min(1).max(1000), ru: z.string().trim().min(1).max(1000), en: z.string().trim().min(1).max(1000) }).strict();
const stableId = z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/);
export const DiagnosticCapabilitySchema = z.enum(["diagnostics.reception", "diagnostics.technician", "diagnostics.reviewer", "diagnostics.templates"]);
export const DiagnosticAudienceSchema = z.enum(["buyer_private", "listing_public"]);
export const DiagnosticAppointmentStateSchema = z.enum(["requested", "confirmed", "arrived", "no_show", "cancelled"]);
export const DiagnosticTemplateDefinitionSchema = z.object({
  title: LocalizedDiagnosticTextSchema,
  limitations: LocalizedDiagnosticTextSchema,
  syntheticNotice: LocalizedDiagnosticTextSchema,
  checks: z.array(z.object({ id: stableId, label: LocalizedDiagnosticTextSchema, required: z.boolean(), evidenceRequired: z.boolean(), measurement: z.object({ unit: z.string().trim().min(1).max(30), method: LocalizedDiagnosticTextSchema }).strict().nullable() }).strict()).min(1).max(200),
  panels: z.array(z.object({ id: stableId, label: LocalizedDiagnosticTextSchema, views: z.array(z.enum(["front", "rear", "left", "right", "top"])).min(1).max(5), evidenceRequired: z.boolean() }).strict()).max(100),
}).strict().superRefine((value, ctx) => {
  const ids = [...value.checks, ...value.panels].map(item => item.id);
  if (new Set(ids).size !== ids.length) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Stable check and panel IDs must be unique" });
});
export const PublishDiagnosticTemplateSchema = z.object({ expectedVersion: z.number().int().nonnegative(), definition: DiagnosticTemplateDefinitionSchema, synthetic: z.literal(true) }).strict();
export const DiagnosticCreateSchema = z.object({ requestKey: z.string().uuid(), centerId: z.string().uuid(), templateVersionId: z.string().uuid(), audience: DiagnosticAudienceSchema, listingId: z.string().uuid().optional(), synthetic: z.literal(true) }).strict().refine(value => value.audience !== "listing_public" || !!value.listingId, "A public report needs a Listing");
export const DiagnosticAuthorizationSchema = z.object({ expectedVersion: z.number().int().nonnegative(), kind: z.enum(["physical", "publication"]), authorityReference: z.string().trim().min(1).max(500) }).strict();
export const DiagnosticAppointmentChangeSchema = z.object({ expectedVersion: z.number().int().nonnegative(), state: DiagnosticAppointmentStateSchema }).strict();
export const DiagnosticAssignmentChangeSchema = z.object({ expectedVersion: z.number().int().nonnegative(), userId: z.string().uuid(), capability: DiagnosticCapabilitySchema, active: z.boolean() }).strict();
export const DiagnosticObservedVehicleSchema = z.object({ expectedVersion: z.number().int().nonnegative(), observedAt: z.string().datetime(), mileageKm: z.number().int().nonnegative().max(10000000), method: z.enum(["vin", "manual"]), vin: z.string().trim().min(1).max(64).nullable(), manualReference: z.string().trim().min(1).max(500).nullable() }).strict().superRefine((value, ctx) => {
  if (value.method === "vin" && !value.vin) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Observed VIN required" });
  if (value.method === "manual" && !value.manualReference) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Authorized manual matching reference required" });
});
export const DiagnosticTemplateSchema = z.object({ id: z.string().uuid(), centerId: z.string().uuid(), version: z.number().int().positive(), definition: DiagnosticTemplateDefinitionSchema, synthetic: z.boolean(), publishedAt: z.string().datetime() });
export const DiagnosticAuthorizationRecordSchema = z.object({ authorityReference: z.string(), recordedBy: z.string(), recordedAt: z.string().datetime() });
export const DiagnosticOrderSchema = z.object({ id: z.string().uuid(), centerId: z.string().uuid(), templateVersionId: z.string().uuid(), audience: DiagnosticAudienceSchema, listingId: z.string().uuid().nullable(), status: DiagnosticAppointmentStateSchema, version: z.number().int(), synthetic: z.boolean(), createdAt: z.string().datetime(), physicalAuthorized: z.boolean(), publicationAuthorized: z.boolean(), vehicleMatched: z.boolean(), physicalAuthorization: DiagnosticAuthorizationRecordSchema.nullable(), publicationAuthorization: DiagnosticAuthorizationRecordSchema.nullable(), observedVehicle: DiagnosticObservedVehicleSchema.innerType().omit({ expectedVersion: true }).nullable(), events: z.array(z.object({ state: DiagnosticAppointmentStateSchema, actorId: z.string(), occurredAt: z.string().datetime() })) });
export type DiagnosticTemplateDefinition = z.infer<typeof DiagnosticTemplateDefinitionSchema>;
export type DiagnosticCreate = z.infer<typeof DiagnosticCreateSchema>;
export type PublishDiagnosticTemplate = z.infer<typeof PublishDiagnosticTemplateSchema>;
export type DiagnosticAuthorization = z.infer<typeof DiagnosticAuthorizationSchema>;
export type DiagnosticAppointmentChange = z.infer<typeof DiagnosticAppointmentChangeSchema>;
export type DiagnosticAssignmentChange = z.infer<typeof DiagnosticAssignmentChangeSchema>;
export type DiagnosticObservedVehicle = z.infer<typeof DiagnosticObservedVehicleSchema>;
export type DiagnosticTemplate = z.infer<typeof DiagnosticTemplateSchema>;
export type DiagnosticOrder = z.infer<typeof DiagnosticOrderSchema>;
export type DiagnosticCapability = z.infer<typeof DiagnosticCapabilitySchema>;

export const DiagnosticAssessmentSchema = z.enum(["normal", "note", "fault", "not_checked", "not_applicable"]);
export const DiagnosticFindingSchema = z.object({
  id: z.string().uuid(), checkId: stableId, assessment: DiagnosticAssessmentSchema,
  explanation: z.string().trim().max(5000).nullable(), evidenceIds: z.array(z.string().uuid()).max(20),
  kind: z.enum(["observed_damage", "observed_repair", "source_history"]).nullable(), source: z.string().trim().max(1000).nullable(),
  measurement: z.object({ value: z.number().finite(), unit: z.string().trim().min(1).max(30), method: z.string().trim().min(1).max(1000), uncertainty: z.string().trim().min(1).max(1000) }).strict().nullable(),
  location: z.object({ panelId: stableId, view: z.enum(["front", "rear", "left", "right", "top"]), x: z.number().min(0).max(1), y: z.number().min(0).max(1) }).strict().nullable(),
}).strict();
export const DiagnosticDraftCreateSchema = z.object({ reportId: z.string().uuid(), expectedOrderVersion: z.number().int().nonnegative() }).strict();
export const DiagnosticFindingSaveSchema = z.object({ expectedVersion: z.number().int().nonnegative(), finding: DiagnosticFindingSchema }).strict();
export const DiagnosticReportTransitionSchema = z.object({ expectedVersion: z.number().int().nonnegative(), action: z.enum(["submit", "return", "finalize", "withdraw"]), reason: z.string().trim().min(1).max(1000).optional(), privateSelfReview: z.boolean().optional() }).strict();
export const DiagnosticCorrectionSchema = z.object({ expectedVersion: z.number().int().nonnegative(), successorId: z.string().uuid(), reason: z.string().trim().min(1).max(1000) }).strict();
export const DiagnosticReportSchema = z.object({
  id: z.string().uuid(), orderId: z.string().uuid(), audience: DiagnosticAudienceSchema,
  status: z.enum(["draft", "submitted", "returned", "finalized", "withdrawn"]), templateVersionId: z.string().uuid(),
  observedAt: z.string().datetime(), mileageKm: z.number().int().nonnegative(), findings: z.array(DiagnosticFindingSchema),
  authorId: z.string().nullable(), reviewerId: z.string().nullable(), successorOf: z.string().uuid().nullable(),
  correctionReason: z.string().nullable(), returnReason: z.string().nullable(), finalizedAt: z.string().datetime().nullable(),
  withdrawnAt: z.string().datetime().nullable(), withdrawalReason: z.string().nullable(), version: z.number().int().nonnegative(),
  template: DiagnosticTemplateDefinitionSchema, synthetic: z.boolean(),
});
export type DiagnosticFinding = z.infer<typeof DiagnosticFindingSchema>;
export type DiagnosticDraftCreate = z.infer<typeof DiagnosticDraftCreateSchema>;
export type DiagnosticFindingSave = z.infer<typeof DiagnosticFindingSaveSchema>;
export type DiagnosticReportTransition = z.infer<typeof DiagnosticReportTransitionSchema>;
export type DiagnosticCorrection = z.infer<typeof DiagnosticCorrectionSchema>;
export type DiagnosticReportRecord = z.infer<typeof DiagnosticReportSchema>;

/** Stored release input. No live Listing, booking or customer fields enter rendering. */
export const DiagnosticReleasedSnapshotSchema = z.object({
  report: DiagnosticReportSchema.omit({ version: true, template: true, synthetic: true }),
  template: DiagnosticTemplateDefinitionSchema,
  synthetic: z.boolean(),
}).strict();
export type DiagnosticReleasedSnapshot = z.infer<typeof DiagnosticReleasedSnapshotSchema>;

export const DiagnosticWorkspaceSchema = z.object({
  actorId: z.string().uuid(),
  order: DiagnosticOrderSchema, template: DiagnosticTemplateSchema,
  capabilities: z.array(DiagnosticCapabilitySchema),
  assignments: z.array(z.object({ userId: z.string().uuid(), capability: DiagnosticCapabilitySchema })),
  staffChoices: z.array(z.object({ userId: z.string().uuid(), label: z.string(), capability: DiagnosticCapabilitySchema })),
});
export type DiagnosticWorkspace = z.infer<typeof DiagnosticWorkspaceSchema>;
