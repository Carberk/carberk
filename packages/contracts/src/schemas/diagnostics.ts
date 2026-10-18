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
