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
/** Restricted per-visit identity history in capture order; current assigned staff only. */
export const DiagnosticIdentityRecordSchema = z.object({ id: z.string().uuid(), orderId: z.string().uuid(), orderVersion: z.number().int().positive(), observationHash: z.string().regex(/^[a-f0-9]{64}$/), observation: DiagnosticObservedVehicleSchema.innerType().omit({ expectedVersion: true }), recordedBy: z.string().nullable(), recordedAt: z.string().datetime() }).strict();
const restrictedText = (max: number) => z.string().trim().min(1).max(max);
const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
/** Strict diagnostic subset of the service rights vocabulary. Service use only, an explicit
 * authorized end date and no caller-supplied hold; audience is always server-derived staff-only. */
export const DiagnosticIdentityRightsSchema = z.object({
  category: z.literal("vehicle_observation"), purpose: restrictedText(300), basis: restrictedText(500), provenance: restrictedText(1000),
  identifiability: z.enum(["personal", "pseudonymous"]), use: z.tuple([z.literal("service")]),
  schedule: z.object({ kind: z.literal("until"), until: z.string().datetime(), reason: restrictedText(500) }).strict(),
  supplierRestrictions: z.string().trim().max(1000), hold: z.null(),
}).strict();
export const DiagnosticIdentityProvenanceStageSchema = z.object({ id: z.string().uuid(), expectedOrderVersion: z.number().int().nonnegative(),
  contentType: z.enum(["image/jpeg", "image/png", "image/webp"]), sizeBytes: z.number().int().positive().max(10 * 1024 * 1024), rights: DiagnosticIdentityRightsSchema }).strict();
export const DiagnosticIdentityProvenanceStagedSchema = z.object({ id: z.string().uuid(), state: z.enum(["staged", "verified"]) }).strict();
/** Retained sanitized bytes only; never the original upload, a key or a URL. */
export const DiagnosticIdentityProvenanceSchema = z.object({ id: z.string().uuid(), state: z.literal("verified"), mime: z.literal("image/webp"), sizeBytes: z.number().int().positive(), sha256 }).strict();
export const DiagnosticIdentifierSchema = z.object({ kind: z.enum(["vin_stamp", "chassis_stamp", "manufacturer_plate"]), location: restrictedText(300), value: restrictedText(500),
  provenanceIds: z.array(z.string().uuid()).min(1).max(20).refine(ids => new Set(ids).size === ids.length, "Duplicate provenance reference") }).strict();
const DiagnosticIdentityCorrectionSchema = z.object({ supersedesId: z.string().uuid(), explanation: restrictedText(1000) }).strict();
export const DiagnosticIdentityEvidenceCaptureSchema = z.object({ id: z.string().uuid(), expectedOrderVersion: z.number().int().nonnegative(), identityRecordId: z.string().uuid(),
  identifiers: z.array(DiagnosticIdentifierSchema).min(1).max(20).refine(items => new Set(items.map(item => JSON.stringify([item.kind, item.location]))).size === items.length, "Duplicate identifier location"),
  rights: DiagnosticIdentityRightsSchema, correction: DiagnosticIdentityCorrectionSchema.nullable() }).strict();
/** Immutable structured evidence bound to one raw observation; a correction is a complete new record. */
export const DiagnosticIdentityEvidenceSchema = z.object({ id: z.string().uuid(), orderId: z.string().uuid(), orderVersion: z.number().int().positive(), identityRecordId: z.string().uuid(),
  observationHash: sha256, observation: DiagnosticObservedVehicleSchema.innerType().omit({ expectedVersion: true }), identifiers: z.array(DiagnosticIdentifierSchema),
  provenance: z.array(z.object({ id: z.string().uuid(), sha256, mime: z.literal("image/webp"), sizeBytes: z.number().int().positive() }).strict()),
  rights: DiagnosticIdentityRightsSchema, correction: DiagnosticIdentityCorrectionSchema.nullable(), recordHash: sha256, recordedBy: z.string().nullable(), recordedAt: z.string().datetime() }).strict();
/** One side of the restricted reinspection comparison: a pinned raw observation, its pinned
 * structured leaf and only the records reached through explicit correction edges. */
export const DiagnosticComparisonIdentitySchema = z.object({ observation: DiagnosticObservedVehicleSchema.innerType().omit({ expectedVersion: true }),
  evidence: DiagnosticIdentityEvidenceSchema.nullable(), corrections: z.array(DiagnosticIdentityEvidenceSchema), evidenceGeneration: z.number().int().nonnegative(), correctionHeadHash: sha256.nullable() }).strict();
export type DiagnosticIdentityRights = z.infer<typeof DiagnosticIdentityRightsSchema>;
export type DiagnosticIdentityProvenanceStage = z.infer<typeof DiagnosticIdentityProvenanceStageSchema>;
export type DiagnosticIdentityProvenanceStaged = z.infer<typeof DiagnosticIdentityProvenanceStagedSchema>;
export type DiagnosticIdentityProvenance = z.infer<typeof DiagnosticIdentityProvenanceSchema>;
export type DiagnosticIdentityEvidenceCapture = z.infer<typeof DiagnosticIdentityEvidenceCaptureSchema>;
export type DiagnosticIdentityEvidence = z.infer<typeof DiagnosticIdentityEvidenceSchema>;
export type DiagnosticComparisonIdentity = z.infer<typeof DiagnosticComparisonIdentitySchema>;
export type DiagnosticTemplateDefinition = z.infer<typeof DiagnosticTemplateDefinitionSchema>;
export type DiagnosticCreate = z.infer<typeof DiagnosticCreateSchema>;
export type PublishDiagnosticTemplate = z.infer<typeof PublishDiagnosticTemplateSchema>;
export type DiagnosticAuthorization = z.infer<typeof DiagnosticAuthorizationSchema>;
export type DiagnosticAppointmentChange = z.infer<typeof DiagnosticAppointmentChangeSchema>;
export type DiagnosticAssignmentChange = z.infer<typeof DiagnosticAssignmentChangeSchema>;
export type DiagnosticObservedVehicle = z.infer<typeof DiagnosticObservedVehicleSchema>;
export type DiagnosticIdentityRecord = z.infer<typeof DiagnosticIdentityRecordSchema>;
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
/** Links a new physical visit's first report to a released or withdrawn predecessor on another order. */
/** `proofId` names the private continuity proof this reinspection consumes; without it only the temporary public admission applies. */
export const DiagnosticReinspectionSchema = z.object({ reportId: z.string().uuid(), predecessorId: z.string().uuid(), expectedOrderVersion: z.number().int().nonnegative(), reason: z.string().trim().min(1).max(1000), proofId: z.string().uuid().optional() }).strict();
export const DiagnosticContinuityProofIssuanceSchema = z.object({ predecessorId: z.string().uuid(), expectedPredecessorVersion: z.number().int().nonnegative(), expectedOrderVersion: z.number().int().nonnegative(), predecessorIdentityRecordId: z.string().uuid(), candidateIdentityRecordId: z.string().uuid(), linkingTechnicianId: z.string().uuid(), method: z.enum(["comparative_attestation", "automatic_normalized_vin"]), rationale: z.string().trim().min(1).max(1000), provenanceRecordIds: z.array(z.string().uuid()).min(1).max(40).refine(ids => new Set(ids).size === ids.length) }).strict();
export const DiagnosticContinuityProofSchema = z.object({ proofId: z.string().uuid(), policyVersion: z.literal("ADR-0108"), predecessor: z.object({ reportId: z.string().uuid(), reportVersion: z.number().int().nonnegative(), snapshotHash: sha256, identityRecordId: z.string().uuid(), identityRecordHash: sha256 }).strict(), candidate: z.object({ orderId: z.string().uuid(), orderVersion: z.number().int().nonnegative(), identityRecordId: z.string().uuid(), identityRecordHash: sha256 }).strict(), linkingTechnicianId: z.string().uuid(), method: z.enum(["comparative_attestation", "automatic_normalized_vin"]), result: z.literal("same_vehicle"), rationale: restrictedText(1000), provenanceRecordIds: z.array(z.string().uuid()).min(1), issuedBy: z.string().uuid(), issuedAt: z.string().datetime() }).strict();
/** Live reader metadata; never part of a released snapshot. Missing or unrecognized kinds permit neutral labels. */
const DiagnosticLineageKindSchema = z.enum(["original", "correction", "reinspection"]);
export const DiagnosticReportSchema = z.object({
  id: z.string().uuid(), orderId: z.string().uuid(), audience: DiagnosticAudienceSchema,
  status: z.enum(["draft", "submitted", "returned", "finalized", "withdrawn"]), templateVersionId: z.string().uuid(),
  observedAt: z.string().datetime(), mileageKm: z.number().int().nonnegative(), findings: z.array(DiagnosticFindingSchema),
  authorId: z.string().nullable(), reviewerId: z.string().nullable(), successorOf: z.string().uuid().nullable(),
  correctionReason: z.string().nullable(), returnReason: z.string().nullable(), finalizedAt: z.string().datetime().nullable(),
  withdrawnAt: z.string().datetime().nullable(), withdrawalReason: z.string().nullable(), version: z.number().int().nonnegative(),
  template: DiagnosticTemplateDefinitionSchema, synthetic: z.boolean(), supersededBy: z.string().uuid().nullable().default(null),
  lineageKind: DiagnosticLineageKindSchema.optional().catch(undefined), successorKind: z.enum(["correction", "reinspection"]).optional().catch(undefined),
});
export type DiagnosticFinding = z.infer<typeof DiagnosticFindingSchema>;
export type DiagnosticDraftCreate = z.infer<typeof DiagnosticDraftCreateSchema>;
export type DiagnosticFindingSave = z.infer<typeof DiagnosticFindingSaveSchema>;
export type DiagnosticReportTransition = z.infer<typeof DiagnosticReportTransitionSchema>;
export type DiagnosticCorrection = z.infer<typeof DiagnosticCorrectionSchema>;
export type DiagnosticReinspection = z.infer<typeof DiagnosticReinspectionSchema>;
export type DiagnosticContinuityProofIssuance = z.infer<typeof DiagnosticContinuityProofIssuanceSchema>;
export type DiagnosticContinuityProof = z.infer<typeof DiagnosticContinuityProofSchema>;
export type DiagnosticReportRecord = z.infer<typeof DiagnosticReportSchema>;

/** Stored release input. No live Listing, booking or customer fields enter rendering. */
export const DiagnosticReleasedSnapshotSchema = z.object({
  report: DiagnosticReportSchema.omit({ version: true, template: true, synthetic: true, supersededBy: true, lineageKind: true, successorKind: true }),
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

/** Safe readiness metadata. Object locators, digests and storage failures stay private. */
export const DiagnosticDocumentSchema = z.object({
  id: z.string().uuid(), locale: z.enum(["tk", "ru", "en"]),
  state: z.enum(["pending", "processing", "ready", "failed", "unavailable"]),
  generation: z.number().int().positive(), rendererVersion: z.string(),
  generatedAt: z.string().datetime().nullable(), retryAt: z.string().datetime().nullable(),
}).strict();
export type DiagnosticDocument = z.infer<typeof DiagnosticDocumentSchema>;
export const PublicDiagnosticAvailabilitySchema = z.object({
  listingId: z.string().uuid(), reportId: z.string().uuid(), observedAt: z.string().datetime(),
  mileageKm: z.number().int().nonnegative(), synthetic: z.boolean(),
}).strict();
export type PublicDiagnosticAvailability = z.infer<typeof PublicDiagnosticAvailabilitySchema>;
export const PublicDiagnosticReportSchema = DiagnosticReportSchema.omit({ orderId: true });
export type PublicDiagnosticReport = z.infer<typeof PublicDiagnosticReportSchema>;
